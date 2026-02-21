import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { useRouter } from "expo-router";
import { Stack } from "expo-router";
import * as Linking from "expo-linking";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";

import { PermissionMonitor } from "@/components/PermissionMonitor";
import { useColorScheme } from "@/hooks/useColorScheme";
import { storeUploadConfigForDraft } from "@/utils/uploadConfig";
import AuthService from "@/services/AuthService";

const isUUIDv4 = (uuid: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);

/** Matches the OAuth callback deep link: pulse://auth/callback */
const isAuthCallback = (url: string) =>
  url.startsWith("pulse://auth/callback");

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const [loaded] = useFonts({
    "Roboto-Regular": require("../assets/fonts/Roboto-Regular.ttf"),
    "Roboto-Bold": require("../assets/fonts/Roboto-Bold.ttf"),
  });

  // Track whether the initial auth check has completed.
  const [authChecked, setAuthChecked] = useState(false);

  // ── Initial auth gate ──────────────────────────────────────────────────
  // Runs once after fonts are ready. Redirects to /login if no valid token
  // exists, otherwise lets index.tsx handle its normal redirect to /(tabs).
  useEffect(() => {
    if (!loaded) return;

    const checkAuth = async () => {
      try {
        const authenticated = await AuthService.isAuthenticated();
        if (!authenticated) {
          router.replace("/login");
        }
        // If authenticated, index.tsx will redirect to /(tabs) as usual.
      } catch (e) {
        console.warn("[Auth] Failed to check auth status:", e);
        router.replace("/login");
      } finally {
        setAuthChecked(true);
      }
    };

    checkAuth();
  }, [loaded, router]);

  // ── Deep-link listener ─────────────────────────────────────────────────
  useEffect(() => {
    const handleUrl = async (event: { url: string }) => {
      const url = event.url;

      // ── OAuth callback ──────────────────────────────────────────────────
      if (isAuthCallback(url)) {
        try {
          const { code } = await AuthService.handleCallback(url);
          const tokens = await AuthService.exchangeCodeForToken(code);
          await AuthService.storeTokens(tokens);
          router.replace("/(tabs)");
        } catch (e: any) {
          console.error("[Auth] OAuth callback failed:", e);
          router.replace("/login");
        }
        return;
      }

      // ── Upload deep-link ────────────────────────────────────────────────
      const q = url.includes("?") ? url.split("?")[1] : "";
      const search = new URLSearchParams(q);
      const mode = search.get("mode");
      if (mode !== "upload") return;
      const draftId = search.get("draftId");
      const server = search.get("server");
      const token = search.get("token");
      const hasValidDraftId = draftId && isUUIDv4(draftId);
      if (hasValidDraftId && server && token) {
        try {
          await storeUploadConfigForDraft(draftId, server, token);
        } catch (e) {
          console.warn("[Deeplink] Failed to store upload config:", e);
        }
        router.replace({
          pathname: "/(camera)/shorts",
          params: { mode: "upload", draftId, server, token },
        });
      } else {
        router.replace({
          pathname: "/",
          params: {
            mode: "upload",
            ...(server && { server }),
            ...(token && { token }),
            serverNotSetupForUpload: "true",
          },
        });
      }
    };

    const subscription = Linking.addEventListener("url", handleUrl);
    return () => subscription.remove();
  }, [router]);

  // Also check the URL that cold-launched the app (background → foreground).
  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (url && isAuthCallback(url)) {
        AuthService.handleCallback(url)
          .then(({ code }) => AuthService.exchangeCodeForToken(code))
          .then((tokens) => AuthService.storeTokens(tokens))
          .then(() => router.replace("/(tabs)"))
          .catch((e) => {
            console.error("[Auth] Cold-start callback failed:", e);
            router.replace("/login");
          });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Don't render until fonts are loaded; the auth check gate is non-blocking
  // for the stack – screens render while it runs, then we navigate if needed.
  if (!loaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <Stack
          screenOptions={{
            headerShown: false,
          }}
        >
          <Stack.Screen
            name="(tabs)"
            options={{
              headerShown: false,
              presentation: "fullScreenModal",
              animation: "none",
            }}
          />
          <Stack.Screen name="+not-found" />
          <Stack.Screen
            name="onboarding"
            options={{
              headerShown: false,
              presentation: "fullScreenModal",
              animation: "fade",
            }}
          />
          <Stack.Screen
            name="(camera)"
            options={{
              headerShown: false,
              presentation: "fullScreenModal",
              animation: "slide_from_bottom",
            }}
          />
          <Stack.Screen
            name="preview-new"
            options={{
              headerShown: false,
              presentation: "fullScreenModal",
              animation: "none",
            }}
          />
          <Stack.Screen
            name="reordersegments"
            options={{
              headerShown: false,
              presentation: "fullScreenModal",
              animation: "none",
            }}
          />
          <Stack.Screen
            name="trim-segment"
            options={{
              headerShown: false,
              presentation: "fullScreenModal",
              animation: "slide_from_bottom",
            }}
          />
          <Stack.Screen
            name="merged-video"
            options={{
              headerShown: false,
              presentation: "fullScreenModal",
              animation: "none",
            }}
          />
          <Stack.Screen
            name="login"
            options={{
              headerShown: false,
              animation: "fade",
            }}
          />
        </Stack>
        <StatusBar style="auto" />
        <PermissionMonitor />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
