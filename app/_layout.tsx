import { TripViewProvider } from "@/features/day-feed/TripViewContext";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, ThemeProvider, DarkTheme, DefaultTheme } from "expo-router";
import { useColorScheme } from "react-native";
import { useUiTheme } from "@/ui/theme";
import { useUiLocale } from "@/ui/useUiLocale";
import { t } from "@/ui/locale";
import { hydrateUiLocale } from "@/native/uiLocalePreference";
import { useEffect, useState } from "react";

import { bootstrapApplication } from "@/data/bootstrap/bootstrapApplication";
import {
  defaultBootstrapDependencies,
  subscribeOperationalSyncLifecycle,
} from "@/data/bootstrap/defaultBootstrapDependencies";

export const unstable_settings = { initialRouteName: "(tabs)" };

export default function RootLayout() {
  useEffect(() => {
    if (!__DEV__ || process.env.EXPO_PUBLIC_OTR_IMPORT_WORKBENCH !== "1") return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    void import("@/native/importWorkbenchDevCaller").then((module) => {
      if (!cancelled) stop = module.startImportWorkbenchDevCaller();
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);
  useUiLocale();
  const colors = useUiTheme();
  const scheme = useColorScheme();
  const nativeTheme = scheme === "dark" ? DarkTheme : DefaultTheme;
  useEffect(() => {
    void hydrateUiLocale().catch(() => undefined);
  }, []);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 30_000,
          },
        },
      }),
  );

  useEffect(() => {
    void bootstrapApplication(defaultBootstrapDependencies).catch(() => {
      // The shell remains available while durable operations wait for a later retry.
    });
  }, []);

  useEffect(() => {
    const subscription = subscribeOperationalSyncLifecycle();
    return () => subscription.remove();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        value={{
          ...nativeTheme,
          colors: {
            ...nativeTheme.colors,
            background: colors.background,
            card: colors.surface,
            text: colors.textPrimary,
            primary: colors.accent,
            border: colors.separator,
            notification: colors.destructive,
          },
        }}
      >
        <TripViewProvider>
          <Stack
            screenOptions={{
              headerBackButtonDisplayMode: "minimal",
              headerShown: false,
              headerTitleAlign: "center",
              headerTitleStyle: { color: colors.textPrimary },
              headerTintColor: colors.accent,
              headerStyle: { backgroundColor: colors.surface },
              contentStyle: { backgroundColor: colors.background },
              orientation: "portrait",
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="trip-home"
              options={{
                headerShown: true,
                headerTransparent: true,
                headerTitle: "",
                headerBackVisible: false,
                gestureEnabled: true,
                fullScreenGestureEnabled: false,
              }}
            />
            {__DEV__ ? (
              <Stack.Screen
                name="day-feed-lab"
                options={{ headerShown: true, headerTitle: t("dayLab.title") }}
              />
            ) : null}
            <Stack.Screen
              name="trip-validation"
              options={{ headerShown: true, headerTitle: t("dayFeed.validation") }}
            />
            <Stack.Screen
              name="foundation"
              options={{ headerShown: true, headerTitle: t("navigation.signIn") }}
            />
            <Stack.Screen
              name="account"
              options={{ headerShown: true, headerTitle: t("navigation.account") }}
            />
            <Stack.Screen
              name="settings"
              options={{ headerShown: true, headerTitle: t("navigation.settings") }}
            />
            <Stack.Screen
              name="data-sync"
              options={{ headerShown: true, headerTitle: t("navigation.dataSync") }}
            />
            <Stack.Screen
              name="diagnostics"
              options={{ headerShown: true, headerTitle: t("navigation.diagnostics") }}
            />
          </Stack>
        </TripViewProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
