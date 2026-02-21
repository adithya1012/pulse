import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';

import AuthService from '@/services/AuthService';
import { Colors } from '@/constants/Colors';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_VAULT_URL = 'http://localhost:3000/';

const URL_REGEX = /^https?:\/\/.+/i;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LoginScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const router = useRouter();

  const [vaultUrl, setVaultUrl] = useState(DEFAULT_VAULT_URL);
  const [loading, setLoading] = useState(false);
  const [urlError, setUrlError] = useState('');

  const inputRef = useRef(null);

  // ── Validation ────────────────────────────────────────────────────────────

  function validateUrl(value) {
    if (!value.trim()) {
      setUrlError('Vault URL is required.');
      return false;
    }
    if (!URL_REGEX.test(value.trim())) {
      setUrlError('URL must start with http:// or https://');
      return false;
    }
    setUrlError('');
    return true;
  }

  // ── Login handler ─────────────────────────────────────────────────────────

  async function handleLogin() {
    const trimmed = vaultUrl.trim();
    if (!validateUrl(trimmed)) return;

    setLoading(true);
    try {
      const result = await AuthService.startLogin(trimmed);

      if (result.type === 'success') {
        // Parse code + state from the deep-link callback URL.
        const { code } = await AuthService.handleCallback(result.url);
        const tokens = await AuthService.exchangeCodeForToken(code);
        await AuthService.storeTokens(tokens);

        // Clean up PKCE / state ephemeral data, keep vault URL and device ID.
        await Promise.all([
          AuthService.getStoredCodeVerifier().then(() =>
            AuthService.clearStoredAuthData?.(),
          ),
        ]);

        router.replace('/(tabs)');
      } else if (result.type === 'cancel' || result.type === 'dismiss') {
        // User closed the browser — silent, no error shown.
      } else {
        Alert.alert(
          'Login Failed',
          'Authentication could not be completed. Please try again.',
        );
      }
    } catch (err) {
      const message =
        err?.response?.data?.error_description ??
        err?.message ??
        'An unexpected error occurred.';
      Alert.alert('Login Error', message);
    } finally {
      setLoading(false);
    }
  }

  // ── Styles (theme-aware) ──────────────────────────────────────────────────

  const s = makeStyles(colors);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ── */}
        <View style={s.header}>
          <Image
            source={require('@/assets/images/pulse-logo.png')}
            style={s.logo}
            resizeMode="contain"
            accessibilityLabel="Pulse logo"
          />
          <Text style={s.appName}>Pulse</Text>
          <Text style={s.tagline}>Record · Edit · Share</Text>
        </View>

        {/* ── Card ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Sign in to your vault</Text>
          <Text style={s.cardSubtitle}>
            Enter your Pulse Vault URL to continue.
          </Text>

          {/* URL input */}
          <Text style={s.label}>Vault URL</Text>
          <TextInput
            ref={inputRef}
            style={[s.input, urlError ? s.inputError : null]}
            value={vaultUrl}
            onChangeText={(text) => {
              setVaultUrl(text);
              if (urlError) validateUrl(text);
            }}
            onBlur={() => validateUrl(vaultUrl)}
            placeholder="https://pulsevault.com"
            placeholderTextColor={colors.secondaryText}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={handleLogin}
            editable={!loading}
            accessibilityLabel="Vault URL input"
          />
          {urlError ? (
            <Text style={s.errorText} accessibilityRole="alert">
              {urlError}
            </Text>
          ) : null}

          {/* Login button */}
          <TouchableOpacity
            style={[s.button, loading && s.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Login with Pulse Vault"
            accessibilityState={{ disabled: loading, busy: loading }}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={s.buttonText}>Login with Pulse Vault</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Footer ── */}
        <Text style={s.footer}>
          By signing in you agree to Pulse&apos;s{' '}
          <Text style={s.footerLink}>Terms of Service</Text> and{' '}
          <Text style={s.footerLink}>Privacy Policy</Text>.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function makeStyles(colors) {
  return StyleSheet.create({
    flex: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingVertical: 48,
    },

    // Header
    header: {
      alignItems: 'center',
      marginBottom: 40,
    },
    logo: {
      width: 80,
      height: 80,
      marginBottom: 16,
    },
    appName: {
      fontFamily: 'Roboto-Bold',
      fontSize: 32,
      color: colors.text,
      letterSpacing: 0.5,
    },
    tagline: {
      fontFamily: 'Roboto-Regular',
      fontSize: 14,
      color: colors.secondaryText,
      marginTop: 4,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },

    // Card
    card: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      // iOS shadow
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      // Android elevation
      elevation: 3,
    },
    cardTitle: {
      fontFamily: 'Roboto-Bold',
      fontSize: 20,
      color: colors.text,
      marginBottom: 6,
    },
    cardSubtitle: {
      fontFamily: 'Roboto-Regular',
      fontSize: 14,
      color: colors.secondaryText,
      marginBottom: 24,
      lineHeight: 20,
    },

    // Input
    label: {
      fontFamily: 'Roboto-Regular',
      fontSize: 13,
      color: colors.secondaryText,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    input: {
      backgroundColor: colors.inputBackground,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: Platform.OS === 'ios' ? 14 : 12,
      fontSize: 15,
      fontFamily: 'Roboto-Regular',
      color: colors.text,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    inputError: {
      borderColor: colors.error,
    },
    errorText: {
      fontFamily: 'Roboto-Regular',
      fontSize: 12,
      color: colors.error,
      marginTop: 6,
      marginLeft: 4,
    },

    // Button
    button: {
      backgroundColor: colors.appPrimary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 24,
      // subtle shadow under button
      shadowColor: colors.appPrimary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 8,
      elevation: 4,
    },
    buttonDisabled: {
      opacity: 0.65,
    },
    buttonText: {
      fontFamily: 'Roboto-Bold',
      fontSize: 16,
      color: '#fff',
      letterSpacing: 0.3,
    },

    // Footer
    footer: {
      fontFamily: 'Roboto-Regular',
      fontSize: 12,
      color: colors.secondaryText,
      textAlign: 'center',
      marginTop: 32,
      lineHeight: 18,
    },
    footerLink: {
      color: colors.selection,
    },
  });
}
