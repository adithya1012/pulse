import axios from 'axios';

import AuthService from './AuthService';

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------

const apiClient = axios.create({
  // baseURL and Authorization header are injected per-request by the
  // request interceptor below, so they are intentionally left unset here.
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  timeout: 15_000, // 15 s
});

// ---------------------------------------------------------------------------
// Request interceptor – attach vault baseURL + Bearer token
// ---------------------------------------------------------------------------

apiClient.interceptors.request.use(
  async (config) => {
    // Resolve vault URL and a valid (auto-refreshed) access token in parallel.
    const [vaultUrl, accessToken] = await Promise.all([
      AuthService.getStoredVaultUrl(),
      AuthService.getAccessToken(),
    ]);

    if (vaultUrl) {
      config.baseURL = vaultUrl.replace(/\/$/, '');
    }

    if (accessToken) {
      config.headers = config.headers ?? {};
      config.headers['Authorization'] = `Bearer ${accessToken}`;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

// ---------------------------------------------------------------------------
// Response interceptor – handle 401 token_expired, retry once
// ---------------------------------------------------------------------------

// Flag to prevent multiple concurrent refresh attempts when several requests
// 401 at the same time.
let isRefreshing = false;

// Queue of { resolve, reject } callbacks waiting on the ongoing refresh.
let refreshQueue = [];

/**
 * Drain the queue once a refresh attempt finishes.
 * @param {string|null} newToken  Fresh token on success, null on failure.
 * @param {Error|null}  error     Error on failure, null on success.
 */
function drainRefreshQueue(newToken, error) {
  refreshQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(newToken);
  });
  refreshQueue = [];
}

apiClient.interceptors.response.use(
  // Happy path – pass the response through unchanged.
  (response) => response,

  async (error) => {
    const originalRequest = error.config;

    const is401 = error.response?.status === 401;
    const isTokenExpiredError =
      error.response?.data?.error === 'token_expired' ||
      error.response?.data?.code === 'token_expired';

    // Only attempt a silent refresh for 401 / token_expired responses and
    // only once per original request (guard against infinite retry loops).
    if (is401 && isTokenExpiredError && !originalRequest._retried) {
      originalRequest._retried = true;

      // ── If a refresh is already in flight, queue this request and wait. ──
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        }).then((newToken) => {
          originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
          return apiClient(originalRequest);
        });
      }

      // ── This request owns the refresh attempt. ──
      isRefreshing = true;

      try {
        await AuthService.refreshToken();
        const newToken = await AuthService.getAccessToken();

        // Update the header on the original request before retrying.
        originalRequest.headers['Authorization'] = `Bearer ${newToken}`;

        drainRefreshQueue(newToken, null);
        return apiClient(originalRequest);
      } catch (refreshError) {
        drainRefreshQueue(null, refreshError);
        await AuthService.logout();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const ApiClient = {
  /**
   * HTTP GET
   * @param {string} url  Path relative to vault base URL, e.g. "/api/user"
   * @param {import('axios').AxiosRequestConfig} [config]
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  get(url, config) {
    return apiClient.get(url, config);
  },

  /**
   * HTTP POST
   * @param {string} url
   * @param {object} [data]
   * @param {import('axios').AxiosRequestConfig} [config]
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  post(url, data, config) {
    return apiClient.post(url, data, config);
  },

  /**
   * HTTP PUT
   * @param {string} url
   * @param {object} [data]
   * @param {import('axios').AxiosRequestConfig} [config]
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  put(url, data, config) {
    return apiClient.put(url, data, config);
  },

  /**
   * HTTP DELETE
   * @param {string} url
   * @param {import('axios').AxiosRequestConfig} [config]
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  delete(url, config) {
    return apiClient.delete(url, config);
  },
};

export default ApiClient;
