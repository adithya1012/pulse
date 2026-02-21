import axios from 'axios';
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SECURE_STORE_KEYS = {
  VAULT_URL: 'auth_vault_url',
  CODE_VERIFIER: 'auth_code_verifier',
  STATE: 'auth_state',
  ACCESS_TOKEN: 'auth_access_token',
  REFRESH_TOKEN: 'auth_refresh_token',
  TOKEN_EXPIRY: 'auth_token_expiry',
  DEVICE_ID: 'auth_device_id',
};

// Buffer (in ms) before the stated expiry at which we proactively refresh.
const EXPIRY_BUFFER_MS = 60 * 1000; // 60 seconds

const CLIENT_ID = 'pulse-mobile';
const REDIRECT_URI = 'pulse://auth/callback';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Encodes a Uint8Array to a Base64URL string (no padding, URL-safe alphabet).
 * RFC 7636 §4.1 requires base64url encoding without padding.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function base64URLEncode(bytes) {
  // Convert each byte to a char and build a binary string
  const binary = Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join('');

  // btoa is available in React Native's Hermes / JSC engine
  return btoa(binary)
    .replace(/\+/g, '-') // + → -
    .replace(/\//g, '_') // / → _
    .replace(/=+$/, ''); // strip padding
}

// ---------------------------------------------------------------------------
// AuthService
// ---------------------------------------------------------------------------

class AuthService {
  // -------------------------------------------------------------------------
  // PKCE helpers
  // -------------------------------------------------------------------------

  /**
   * Generates a cryptographically secure code_verifier.
   * Spec: RFC 7636 §4.1 – 32 random bytes, base64url encoded → 43-char string.
   *
   * @returns {Promise<string>} base64url-encoded code verifier
   */
  async generateCodeVerifier() {
    const randomBytes = await Crypto.getRandomBytesAsync(32);
    return base64URLEncode(randomBytes);
  }

  /**
   * Derives the code_challenge from a code_verifier using the S256 method.
   * Spec: RFC 7636 §4.2 – BASE64URL(SHA256(ASCII(code_verifier)))
   *
   * @param {string} codeVerifier
   * @returns {Promise<string>} base64url-encoded SHA-256 hash of the verifier
   */
  async generateCodeChallenge(codeVerifier) {
    // expo-crypto digest returns a hex string by default; request raw bytes via
    // the `encoding` option so we can base64url-encode them directly.
    const digest = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      codeVerifier,
      { encoding: Crypto.CryptoEncoding.BASE64 },
    );

    // The digest is already standard Base64; convert to Base64URL.
    return digest
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  /**
   * Convenience method: generates both the code_verifier and code_challenge
   * in a single call.
   *
   * @returns {Promise<{ codeVerifier: string, codeChallenge: string }>}
   */
  async generatePKCEPair() {
    const codeVerifier = await this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);
    return { codeVerifier, codeChallenge };
  }

  // -------------------------------------------------------------------------
  // State parameter helper
  // -------------------------------------------------------------------------

  /**
   * Generates a cryptographically random state parameter (16 bytes → 22 chars).
   * Used to prevent CSRF attacks in the OAuth flow.
   *
   * @returns {Promise<string>} base64url-encoded random state
   */
  async generateState() {
    const randomBytes = await Crypto.getRandomBytesAsync(16);
    return base64URLEncode(randomBytes);
  }

  // -------------------------------------------------------------------------
  // OAuth login flow
  // -------------------------------------------------------------------------

  /**
   * Kicks off the OAuth 2.0 Authorization Code + PKCE flow.
   *
   * Steps:
   *  1. Persist the vault URL in SecureStore for use during token exchange.
   *  2. Generate a PKCE pair (code_verifier + code_challenge).
   *  3. Generate a random state value.
   *  4. Persist the code_verifier and state in SecureStore.
   *  5. Build the authorization URL and open it in the system browser.
   *  6. Return the WebBrowser result for the caller to handle the callback.
   *
   * @param {string} vaultUrl  Base URL of the vault, e.g. "https://vault.example.com"
   * @returns {Promise<WebBrowser.WebBrowserAuthSessionResult>}
   */
  async startLogin(vaultUrl) {
    // 1. Persist vault URL so the token-exchange step can find it later.
    await SecureStore.setItemAsync(SECURE_STORE_KEYS.VAULT_URL, vaultUrl);

    // 2. Generate PKCE pair.
    const { codeVerifier, codeChallenge } = await this.generatePKCEPair();

    // 3. Generate state.
    const state = await this.generateState();

    // 4. Persist verifier and state for later verification.
    await Promise.all([
      SecureStore.setItemAsync(SECURE_STORE_KEYS.CODE_VERIFIER, codeVerifier),
      SecureStore.setItemAsync(SECURE_STORE_KEYS.STATE, state),
    ]);

    // 5. Build the authorization URL.
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    });

    const authUrl = `${vaultUrl.replace(/\/$/, '')}/oauth/authorize?${params.toString()}`;

    // 6. Open the browser and wait for the redirect back to pulse://auth/callback.
    const result = await WebBrowser.openAuthSessionAsync(authUrl, REDIRECT_URI);

    return result;
  }

  // -------------------------------------------------------------------------
  // SecureStore accessors (used by the token-exchange step)
  // -------------------------------------------------------------------------

  /**
   * Retrieves the stored vault URL.
   * @returns {Promise<string|null>}
   */
  getStoredVaultUrl() {
    return SecureStore.getItemAsync(SECURE_STORE_KEYS.VAULT_URL);
  }

  /**
   * Retrieves the stored code_verifier.
   * @returns {Promise<string|null>}
   */
  getStoredCodeVerifier() {
    return SecureStore.getItemAsync(SECURE_STORE_KEYS.CODE_VERIFIER);
  }

  /**
   * Retrieves the stored state value.
   * @returns {Promise<string|null>}
   */
  getStoredState() {
    return SecureStore.getItemAsync(SECURE_STORE_KEYS.STATE);
  }

  /**
   * Clears all auth-related keys from SecureStore.
   * Call this after a successful token exchange or on logout.
   * @returns {Promise<void>}
   */
  async clearStoredAuthData() {
    await Promise.all(
      Object.values(SECURE_STORE_KEYS).map((key) =>
        SecureStore.deleteItemAsync(key),
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Callback handling
  // -------------------------------------------------------------------------

  /**
   * Parses the deep-link callback URL and validates the state parameter.
   *
   * @param {string} url  The full callback URL, e.g. "pulse://auth/callback?code=...&state=..."
   * @returns {Promise<{ code: string }>} The extracted authorization code.
   * @throws {Error} If the state is missing, mismatched, or an error is returned by the server.
   */
  async handleCallback(url) {
    const parsed = new URL(url);
    const params = parsed.searchParams;

    // Surface any error the authorization server sent back.
    const serverError = params.get('error');
    if (serverError) {
      const description = params.get('error_description') ?? serverError;
      throw new Error(`Authorization error: ${description}`);
    }

    const code = params.get('code');
    const returnedState = params.get('state');

    if (!code) throw new Error('Callback URL is missing the authorization code.');
    if (!returnedState) throw new Error('Callback URL is missing the state parameter.');

    // Verify state to prevent CSRF attacks.
    const storedState = await SecureStore.getItemAsync(SECURE_STORE_KEYS.STATE);
    if (returnedState !== storedState) {
      throw new Error('State mismatch – possible CSRF attack detected.');
    }

    return { code };
  }

  // -------------------------------------------------------------------------
  // Token exchange
  // -------------------------------------------------------------------------

  /**
   * Exchanges the authorization code for an access token + refresh token.
   * POSTs to {vaultUrl}/oauth/token with PKCE verifier and device ID.
   *
   * @param {string} code  The authorization code from the callback.
   * @returns {Promise<object>} The full token response payload.
   * @throws {Error} If required SecureStore values are missing or the request fails.
   */
  async exchangeCodeForToken(code) {
    const [vaultUrl, codeVerifier] = await Promise.all([
      SecureStore.getItemAsync(SECURE_STORE_KEYS.VAULT_URL),
      SecureStore.getItemAsync(SECURE_STORE_KEYS.CODE_VERIFIER),
    ]);

    if (!vaultUrl) throw new Error('No vault URL found in secure storage.');
    if (!codeVerifier) throw new Error('No code_verifier found in secure storage.');

    const deviceId = await this.getDeviceId();
    const tokenUrl = `${vaultUrl.replace(/\/$/, '')}/oauth/token`;

    const { data } = await axios.post(
      tokenUrl,
      {
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        device_id: deviceId,
      },
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );

    return data;
  }

  // -------------------------------------------------------------------------
  // Token storage
  // -------------------------------------------------------------------------

  /**
   * Persists the token set returned by the authorization server into SecureStore.
   *
   * @param {object} tokens
   * @param {string}  tokens.access_token   - Bearer access token.
   * @param {string}  [tokens.refresh_token] - Refresh token (if provided).
   * @param {number}  [tokens.expires_in]    - Lifetime of the access token in seconds.
   * @returns {Promise<void>}
   */
  async storeTokens(tokens) {
    const { access_token, refresh_token, expires_in } = tokens;

    if (!access_token) throw new Error('Token response is missing access_token.');

    // Calculate absolute expiry timestamp (ms since epoch).
    const expiresAt = expires_in
      ? String(Date.now() + expires_in * 1000)
      : null;

    const writes = [
      SecureStore.setItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN, access_token),
    ];

    if (refresh_token) {
      writes.push(
        SecureStore.setItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN, refresh_token),
      );
    }

    if (expiresAt) {
      writes.push(
        SecureStore.setItemAsync(SECURE_STORE_KEYS.TOKEN_EXPIRY, expiresAt),
      );
    }

    await Promise.all(writes);
  }

  // -------------------------------------------------------------------------
  // Token management
  // -------------------------------------------------------------------------

  /**
   * Returns a valid access token, automatically refreshing it if it is
   * expired or within EXPIRY_BUFFER_MS of expiry.
   *
   * @returns {Promise<string|null>} A valid access token, or null if the user
   *   is not authenticated and no refresh token is available.
   * @throws {Error} If the refresh attempt fails.
   */
  async getAccessToken() {
    const [accessToken, expiresAt] = await Promise.all([
      SecureStore.getItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN),
      SecureStore.getItemAsync(SECURE_STORE_KEYS.TOKEN_EXPIRY),
    ]);

    if (!accessToken) return null;

    // Token still has plenty of life – return it directly.
    const isExpiringSoon =
      expiresAt && Date.now() >= Number(expiresAt) - EXPIRY_BUFFER_MS;

    if (!isExpiringSoon) return accessToken;

    // Token is expired or expiring soon – try a silent refresh.
    try {
      await this.refreshToken();
      return SecureStore.getItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN);
    } catch {
      // Refresh failed (e.g. revoked). Force the caller to re-authenticate.
      await this.logout();
      return null;
    }
  }

  /**
   * Uses the stored refresh token to obtain a fresh access token from the
   * server and persists the new token set.
   *
   * @returns {Promise<void>}
   * @throws {Error} If no refresh token / vault URL is stored, or the request fails.
   */
  async refreshToken() {
    const [vaultUrl, refreshToken] = await Promise.all([
      SecureStore.getItemAsync(SECURE_STORE_KEYS.VAULT_URL),
      SecureStore.getItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN),
    ]);

    if (!vaultUrl) throw new Error('No vault URL found – cannot refresh token.');
    if (!refreshToken) throw new Error('No refresh token found – user must log in again.');

    const deviceId = await this.getDeviceId();
    const refreshUrl = `${vaultUrl.replace(/\/$/, '')}/oauth/token/refresh`;

    const { data } = await axios.post(
      refreshUrl,
      {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
        device_id: deviceId,
      },
      { headers: { 'Content-Type': 'application/json' } },
    );

    await this.storeTokens(data);
  }

  /**
   * Clears every auth-related key from SecureStore, effectively logging the
   * user out.  The device ID is intentionally preserved across logouts so
   * it remains stable for analytics / server-side tracking.
   *
   * @returns {Promise<void>}
   */
  async logout() {
    const keysToRemove = Object.entries(SECURE_STORE_KEYS)
      .filter(([name]) => name !== 'DEVICE_ID')
      .map(([, value]) => value);

    await Promise.all(keysToRemove.map((key) => SecureStore.deleteItemAsync(key)));
  }

  /**
   * Returns true if a (potentially expired) access token exists in SecureStore.
   * Use getAccessToken() when you need a guaranteed-valid token; use
   * isAuthenticated() only for UI gating (e.g. showing a login screen).
   *
   * @returns {Promise<boolean>}
   */
  async isAuthenticated() {
    const token = await SecureStore.getItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN);
    return token !== null;
  }

  /**
   * Returns a stable unique device identifier, generating and persisting one
   * on first call.
   *
   * Priority:
   *  1. Previously persisted ID (SecureStore)
   *  2. iOS Vendor ID (via expo-application)
   *  3. Android ID (via expo-application)
   *  4. Fresh random UUID as a fallback
   *
   * @returns {Promise<string>}
   */
  async getDeviceId() {
    const stored = await SecureStore.getItemAsync(SECURE_STORE_KEYS.DEVICE_ID);
    if (stored) return stored;

    // Try platform-native identifiers first.
    const nativeId =
      (await Application.getIosIdForVendorAsync?.()) ??
      Application.getAndroidId?.() ??
      null;

    // Fall back to a random UUID if native IDs are unavailable (e.g. simulator).
    const deviceId = nativeId ?? Crypto.randomUUID();

    await SecureStore.setItemAsync(SECURE_STORE_KEYS.DEVICE_ID, deviceId);
    return deviceId;
  }
}

// Export a singleton so the same instance is reused across the app.
export default new AuthService();
