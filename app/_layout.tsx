import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { useRouter, Stack } from "expo-router";
import * as Linking from "expo-linking";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";

import { PermissionMonitor } from "@/components/PermissionMonitor";
import { useColorScheme } from "@/hooks/useColorScheme";
import { storeUploadConfigForDraft } from "@/utils/uploadConfig";
import AuthService from "@/services/AuthService";

const isUUIDv4 = (uuid: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);

/** Matches the OAuth callback deep link: pulsecam://auth/callback */
const isAuthCallback = (url: string) =>
  url.startsWith("pulsecam://auth/callback");

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const [loaded] = useFonts({
    "Roboto-Regular": require("../assets/fonts/Roboto-Regular.ttf"),
    "Roboto-Bold": require("../assets/fonts/Roboto-Bold.ttf"),
  });

  // ── Deep-link listener ─────────────────────────────────────────────────
  useEffect(() => {
    const handleUrl = async (event: { url: string }) => {
      const url = event.url;

      // ── OAuth callback ──────────────────────────────────────────────────
      if (isAuthCallback(url)) {
        try {
          const { code } = await AuthService.handleCallback(url);
          const tokens = await AuthService.exchangeCodeForToken(code);
          await AuthService.storeTokens(tokens as any);
          router.replace("/(tabs)");
        } catch (e: any) {
          console.error("[Auth] OAuth callback failed:", e);
          router.replace("/(tabs)/login");
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
          .then((tokens) => AuthService.storeTokens(tokens as any))
          .then(() => router.replace("/(tabs)"))
          .catch((e) => {
            console.error("[Auth] Cold-start callback failed:", e);
            router.replace("/(tabs)/login");
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
        </Stack>
        <StatusBar style="auto" />
        <PermissionMonitor />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
