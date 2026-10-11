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

export default function RootLayout() {
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
      </ThemeProvider>
    </QueryClientProvider>
  );
}
