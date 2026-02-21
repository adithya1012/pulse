import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ApiClient from "@/services/ApiClient";
import AuthService from "@/services/AuthService";
import { Colors } from "@/constants/Colors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UserProfile = {
  name?: string;
  email?: string;
  username?: string;
  avatar_url?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns initials (up to 2 chars) from a display name or email. */
function getInitials(profile: UserProfile): string {
  const source = profile.name ?? profile.email ?? "?";
  const parts = source.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProfileScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  // ── Fetch profile ─────────────────────────────────────────────────────────

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await ApiClient.get("/api/user/profile");
      setProfile(data);
    } catch (err: any) {
      const message =
        err?.response?.data?.error_description ??
        err?.response?.data?.message ??
        err?.message ??
        "Failed to load profile.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // ── Logout ────────────────────────────────────────────────────────────────

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          setLoggingOut(true);
          try {
            await AuthService.logout();
            router.replace("/login");
          } catch {
            Alert.alert("Error", "Failed to sign out. Please try again.");
          } finally {
            setLoggingOut(false);
          }
        },
      },
    ]);
  };

  // ── Styles ────────────────────────────────────────────────────────────────

  const s = makeStyles(colors);

  // ── Render: loading ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <View
        style={[
          s.centered,
          { paddingTop: insets.top, backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator size="large" color={colors.appPrimary} />
        <Text style={s.loadingText}>Loading profile…</Text>
      </View>
    );
  }

  // ── Render: error ─────────────────────────────────────────────────────────

  if (error) {
    return (
      <View
        style={[
          s.centered,
          { paddingTop: insets.top, backgroundColor: colors.background },
        ]}
      >
        <Text style={s.errorIcon}>⚠️</Text>
        <Text style={s.errorTitle}>Couldn't load profile</Text>
        <Text style={s.errorMessage}>{error}</Text>
        <TouchableOpacity
          style={s.retryButton}
          onPress={fetchProfile}
          activeOpacity={0.8}
        >
          <Text style={s.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.logoutButtonOutline}
          onPress={handleLogout}
          activeOpacity={0.8}
          disabled={loggingOut}
        >
          {loggingOut ? (
            <ActivityIndicator size="small" color={colors.error} />
          ) : (
            <Text style={s.logoutButtonOutlineText}>Sign Out</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  // ── Render: profile ───────────────────────────────────────────────────────

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        s.scroll,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Page title ── */}
      <Text style={s.pageTitle}>Profile</Text>

      {/* ── Avatar card ── */}
      <View style={s.avatarCard}>
        <View style={s.avatarCircle}>
          <Text style={s.avatarInitials}>
            {profile ? getInitials(profile) : "?"}
          </Text>
        </View>

        {profile?.name ? (
          <Text style={s.profileName}>{profile.name}</Text>
        ) : null}
        {profile?.username ? (
          <Text style={s.profileUsername}>@{profile.username}</Text>
        ) : null}
      </View>

      {/* ── Info card ── */}
      <View style={s.infoCard}>
        <Text style={s.sectionLabel}>Account</Text>

        {profile?.email ? (
          <View style={s.infoRow}>
            <Text style={s.infoRowIcon}>✉️</Text>
            <View style={s.infoRowContent}>
              <Text style={s.infoRowLabel}>Email</Text>
              <Text style={s.infoRowValue}>{profile.email}</Text>
            </View>
          </View>
        ) : null}

        {profile?.name ? (
          <View style={[s.infoRow, s.infoRowBorder]}>
            <Text style={s.infoRowIcon}>👤</Text>
            <View style={s.infoRowContent}>
              <Text style={s.infoRowLabel}>Name</Text>
              <Text style={s.infoRowValue}>{profile.name}</Text>
            </View>
          </View>
        ) : null}

        {profile?.username ? (
          <View style={[s.infoRow, s.infoRowBorder]}>
            <Text style={s.infoRowIcon}>🔖</Text>
            <View style={s.infoRowContent}>
              <Text style={s.infoRowLabel}>Username</Text>
              <Text style={s.infoRowValue}>@{profile.username}</Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* ── Sign-out button ── */}
      <TouchableOpacity
        style={s.logoutButton}
        onPress={handleLogout}
        activeOpacity={0.8}
        disabled={loggingOut}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        {loggingOut ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={s.logoutButtonText}>Sign Out</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function makeStyles(colors: (typeof Colors)["light"]) {
  return StyleSheet.create({
    // ── Layout ──
    centered: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 32,
      gap: 12,
    },
    scroll: {
      paddingHorizontal: 20,
    },

    // ── Page title ──
    pageTitle: {
      fontFamily: "Roboto-Bold",
      fontSize: 28,
      color: colors.text,
      marginBottom: 24,
    },

    // ── Avatar card ──
    avatarCard: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      alignItems: "center",
      paddingVertical: 32,
      paddingHorizontal: 24,
      marginBottom: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 2,
    },
    avatarCircle: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: colors.appPrimary,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 16,
      shadowColor: colors.appPrimary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    avatarInitials: {
      fontFamily: "Roboto-Bold",
      fontSize: 32,
      color: "#fff",
      letterSpacing: 1,
    },
    profileName: {
      fontFamily: "Roboto-Bold",
      fontSize: 22,
      color: colors.text,
      textAlign: "center",
    },
    profileUsername: {
      fontFamily: "Roboto-Regular",
      fontSize: 14,
      color: colors.secondaryText,
      marginTop: 4,
    },

    // ── Info card ──
    infoCard: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      paddingHorizontal: 20,
      paddingVertical: 8,
      marginBottom: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 2,
    },
    sectionLabel: {
      fontFamily: "Roboto-Regular",
      fontSize: 12,
      color: colors.secondaryText,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      paddingTop: 16,
      paddingBottom: 4,
    },
    infoRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 14,
      gap: 14,
    },
    infoRowBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    infoRowIcon: {
      fontSize: 20,
      width: 28,
      textAlign: "center",
    },
    infoRowContent: {
      flex: 1,
    },
    infoRowLabel: {
      fontFamily: "Roboto-Regular",
      fontSize: 12,
      color: colors.secondaryText,
      marginBottom: 2,
    },
    infoRowValue: {
      fontFamily: "Roboto-Regular",
      fontSize: 15,
      color: colors.text,
    },

    // ── Logout button ──
    logoutButton: {
      backgroundColor: colors.error,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: "center",
      shadowColor: colors.error,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    logoutButtonText: {
      fontFamily: "Roboto-Bold",
      fontSize: 16,
      color: "#fff",
      letterSpacing: 0.3,
    },

    // ── Error / retry state ──
    loadingText: {
      fontFamily: "Roboto-Regular",
      fontSize: 14,
      color: colors.secondaryText,
      marginTop: 12,
    },
    errorIcon: {
      fontSize: 40,
    },
    errorTitle: {
      fontFamily: "Roboto-Bold",
      fontSize: 18,
      color: colors.text,
      textAlign: "center",
    },
    errorMessage: {
      fontFamily: "Roboto-Regular",
      fontSize: 14,
      color: colors.secondaryText,
      textAlign: "center",
      lineHeight: 20,
    },
    retryButton: {
      backgroundColor: colors.appPrimary,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 32,
      marginTop: 8,
    },
    retryButtonText: {
      fontFamily: "Roboto-Bold",
      fontSize: 15,
      color: "#fff",
    },
    logoutButtonOutline: {
      borderWidth: 1.5,
      borderColor: colors.error,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 32,
      marginTop: 4,
      minWidth: 120,
      alignItems: "center",
    },
    logoutButtonOutlineText: {
      fontFamily: "Roboto-Bold",
      fontSize: 15,
      color: colors.error,
    },
  });
}
