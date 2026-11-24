import { hostedTripMetadataEnabled } from "@/features/day-feed/tripMetadataSheet";
import { hostedTripCoverEnabled } from "@/features/day-feed/tripCoverSheet";
import { hostedLedgerSearchFiltersEnabled } from "@/features/ledger/ledgerSearchFilterInvocation";
import { hostedLedgerReceiptReviewEnabled } from "@/features/ledger/ledgerReceiptReviewSheet";
import { finishLedgerReceiptNativeTransition } from "@/features/ledger/ledgerReceiptSourceSheet";
import { hostedExpenseFieldsEnabled, hostedLedgerCurrencySheetEnabled } from "@/features/ledger/ledgerCurrencySheet";
import { hostedSignInEnabled } from "@/features/auth/hostedSignIn";
import { hostedImportEnabled } from "@/features/capture/hostedImport";
import { hostedTripCreateEnabled } from "@/features/day-feed/hostedTripCreate";
import { hostedTripMembersEnabled } from "@/features/day-feed/hostedTripMembers";
import { hostedLedgerAnalysisPickerEnabled } from "@/features/ledger/analysisPickerInvocation";
import { hostedLedgerJourneySheetEnabled } from "@/features/ledger/ledgerJourneySheet";
import { hostedTripPhotosEnabled } from "@/features/day-feed/hostedTripPhotos";
import { hostedDayCalendarEnabled } from "@/features/day-feed/dayCalendarHandoff";
import { hostedDayMoveEnabled } from "@/features/day-feed/dayMoveConfirmationSheet";
import { hostedDocumentsTripPickerEnabled } from "@/features/documents/documentsTripPicker";
import { hostedP1DocumentLinkEnabled } from "@/features/day-feed/p1DocumentLinkSheet";
import { TripViewProvider } from "@/features/day-feed/TripViewContext";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, ThemeProvider, DarkTheme, DefaultTheme } from "expo-router";
import { useColorScheme } from "react-native";
import { useUiTheme } from "@/ui/theme";
import { useUiLocale } from "@/ui/useUiLocale";
import { t } from "@/ui/locale";
import { hydrateUiLocale } from "@/native/uiLocalePreference";
import { hydrateUiAppearance } from "@/native/uiAppearancePreference";
import { useEffect, useState, useSyncExternalStore } from "react";

import { readCommittedLocalPrincipal } from "@/data/auth/authRepository";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { bootstrapApplication } from "@/data/bootstrap/bootstrapApplication";
import {
  defaultBootstrapDependencies,
  subscribeOperationalSyncLifecycle,
} from "@/data/bootstrap/defaultBootstrapDependencies";

export const unstable_settings = { initialRouteName: "(tabs)" };
const receiptStackEvents = { onFinishTransitioning: finishLedgerReceiptNativeTransition };

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
    void hydrateUiAppearance().catch(() => undefined);
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

  const [ready, setReady] = useState(false);
  const [readingOwner, setReadingOwner] = useState<number | null>(null);
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
    getAccountGeneration,
  );
  useEffect(() => {
    let active = true;
    void bootstrapApplication(defaultBootstrapDependencies)
      .catch(() => {
        // Recovery remains available without opening a different principal's database.
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    let subscription: ReturnType<typeof subscribeOperationalSyncLifecycle> | undefined;
    void readCommittedLocalPrincipal()
      .then((principal) => {
        if (!cancelled && generation === getAccountGeneration())
          setReadingOwner(principal?.kind === "ACCOUNT" ? generation : null);
        if (
          !cancelled &&
          principal?.kind === "ACCOUNT" &&
          generation === getAccountGeneration()
        )
          subscription = subscribeOperationalSyncLifecycle();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [ready, generation]);

  if (!ready) return null;
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
        <TripViewProvider persistReading={readingOwner === generation}>
          <Stack
            unstable_nativeProps={hostedLedgerReceiptReviewEnabled ? receiptStackEvents : undefined}
            screenOptions={{
              headerBackButtonDisplayMode: "minimal",
              headerShown: false,
              headerTitleAlign: "center",
              headerTitleStyle: { color: colors.textPrimary },
              headerTintColor: colors.accent,
              statusBarStyle: scheme === "dark" ? "light" : "dark",
              headerStyle: { backgroundColor: colors.surface },
              contentStyle: { backgroundColor: colors.background },
              orientation: "portrait",
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Protected guard={hostedTripCreateEnabled}>
              <Stack.Screen
                name="trip-create"
                options={{
                  presentation: "transparentModal",
                  animation: "none",
                  contentStyle: { backgroundColor: colors.transparent },
                  gestureEnabled: false,
                  orientation: "all",
                }}
              />
            </Stack.Protected>
            <Stack.Protected guard={hostedTripMetadataEnabled}>
              <Stack.Screen
                name="trip-metadata-sheet"
                options={{
                  presentation: "transparentModal",
                  animation: "none",
                  contentStyle: { backgroundColor: colors.transparent },
                  gestureEnabled: false,
                  orientation: "all",
                }}
              />
            </Stack.Protected>
            <Stack.Protected guard={hostedTripCoverEnabled}>
              <Stack.Screen
                name="trip-cover-picker"
                options={{
                  presentation: "transparentModal",
                  animation: "none",
                  contentStyle: { backgroundColor: colors.transparent },
                  gestureEnabled: false,
                  orientation: "all",
                }}
              />
            </Stack.Protected>
            <Stack.Protected guard={hostedTripMembersEnabled}>
              <Stack.Screen
                name="trip-members-sheet"
                options={{
                  presentation: "transparentModal",
                  animation: "none",
                  contentStyle: { backgroundColor: colors.transparent },
                  gestureEnabled: false,
                  orientation: "all",
                }}
              />
            </Stack.Protected>
            <Stack.Protected guard={hostedTripPhotosEnabled}>
              <Stack.Screen
                name="trip-photos-sheet"
                options={{
                  presentation: "transparentModal",
                  animation: "none",
                  contentStyle: { backgroundColor: colors.transparent },
                  gestureEnabled: false,
                  orientation: "all",
                }}
              />
            </Stack.Protected>
            <Stack.Protected guard={hostedDocumentsTripPickerEnabled}>
              <Stack.Screen
                name="documents-trip-picker"
                options={{
                  presentation: "transparentModal",
                  animation: "none",
                  contentStyle: { backgroundColor: colors.transparent },
                  gestureEnabled: false,
                  orientation: "all",
                }}
              />
              <Stack.Screen
                name="document-file-info"
                options={{
                  presentation: "transparentModal",
                  animation: "none",
                  contentStyle: { backgroundColor: colors.transparent },
                  gestureEnabled: false,
                  orientation: "all",
                }}
              />
              <Stack.Screen
                name="documents-search-filters"
                options={{
                  presentation: "transparentModal",
                  animation: "none",
                  contentStyle: { backgroundColor: colors.transparent },
                  gestureEnabled: false,
                  orientation: "all",
                }}
              />
            </Stack.Protected>
            <Stack.Protected guard={hostedLedgerCurrencySheetEnabled || hostedExpenseFieldsEnabled}>
              <Stack.Screen
                name="ledger-currency-picker"
                options={{
                  presentation: "transparentModal",
                  animation: "none",
                  contentStyle: { backgroundColor: colors.transparent },
                  gestureEnabled: false,
                  orientation: "all",
                }}
              />
            </Stack.Protected>
            <Stack.Protected guard={hostedLedgerReceiptReviewEnabled}>
              <Stack.Screen
                name="ledger-receipt-source"
                options={{
                  presentation: "transparentModal",
                  animation: "none",
                  contentStyle: { backgroundColor: colors.transparent },
                  gestureEnabled: false,
                  orientation: "all",
                }}
              />
              <Stack.Screen
                name="ledger-receipt-review"
                options={{
                  presentation: "transparentModal",
                  animation: "none",
                  contentStyle: { backgroundColor: colors.transparent },
                  gestureEnabled: false,
                  orientation: "all",
                }}
              />
            </Stack.Protected>
            <Stack.Protected guard={hostedP1DocumentLinkEnabled}>
              <Stack.Screen
                name="p1-document-link"
                options={{
                  presentation: "transparentModal",
                  animation: "none",
                  contentStyle: { backgroundColor: colors.transparent },
                  gestureEnabled: false,
                  orientation: "all",
                }}
              />
            </Stack.Protected>
            <Stack.Protected guard={hostedLedgerSearchFiltersEnabled}>
              <Stack.Screen
                name="ledger-search-filters"
                options={{
                  presentation: "transparentModal",
                  animation: "none",
                  contentStyle: { backgroundColor: colors.transparent },
                  gestureEnabled: false,
                  orientation: "all",
                }}
              />
            </Stack.Protected>
            <Stack.Protected guard={hostedDayCalendarEnabled}>
              <Stack.Screen
                name="day-calendar"
                options={{
                  presentation: "transparentModal",
                  animation: "none",
                  contentStyle: { backgroundColor: colors.transparent },
                  gestureEnabled: false,
                  orientation: "all",
                }}
              />
            </Stack.Protected>
            <Stack.Protected guard={hostedLedgerAnalysisPickerEnabled}>
              <Stack.Screen
                name="ledger-analysis-picker"
                options={{
                  presentation: "transparentModal",
                  animation: "none",
                  contentStyle: { backgroundColor: colors.transparent },
                  gestureEnabled: false,
                  orientation: "all",
                }}
              />
            </Stack.Protected>
            <Stack.Protected guard={hostedLedgerJourneySheetEnabled}>
              <Stack.Screen
                name="ledger-journey-picker"
                options={{
                  presentation: "transparentModal",
                  animation: "none",
                  contentStyle: { backgroundColor: colors.transparent },
                  gestureEnabled: false,
                  orientation: "all",
                }}
              />
            </Stack.Protected>
            <Stack.Protected guard={hostedDayMoveEnabled}>
              <Stack.Screen
                name="day-move"
                options={{
                  presentation: "transparentModal",
                  animation: "none",
                  contentStyle: { backgroundColor: colors.transparent },
                  gestureEnabled: false,
                  orientation: "all",
                }}
              />
            </Stack.Protected>
            <Stack.Screen
              name="import-plans"
              options={{
                presentation: "transparentModal",
                animation: hostedImportEnabled ? "none" : "fade",
                contentStyle: { backgroundColor: colors.transparent },
                gestureEnabled: false,
                ...(hostedImportEnabled ? { orientation: "all" as const } : {}),
              }}
            />
            <Stack.Screen
              name="import-manual"
              options={{
                presentation: "modal",
                gestureEnabled: false,
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="import-updates"
              options={{
                presentation: "fullScreenModal",
                headerShown: true,
                gestureEnabled: false,
              }}
            />
            <Stack.Screen
              name="import-review"
              options={{
                presentation: "card",
                headerShown: true,
                animation: "slide_from_right",
              }}
            />
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
              name="trip-item-expense"
              options={{
                presentation: "modal",
                gestureEnabled: false,
                headerShown: true,
                headerShadowVisible: false,
                headerTitle: t("ui.newExpense"),
              }}
            />
            <Stack.Screen
              name="trip-expense/[id]"
              options={{ headerShown: true, headerTitle: t("common.expense") }}
            />
            <Stack.Screen
              name="trip-currency"
              options={{ headerShown: true, headerTitle: t("navigation.currency") }}
            />
            <Stack.Screen
              name="trip-validation"
              options={{ headerShown: true, headerTitle: t("dayFeed.validation") }}
            />
            <Stack.Protected guard={hostedSignInEnabled}>
              <Stack.Screen
                name="account-sign-in"
                options={{
                  presentation: "transparentModal",
                  animation: "none",
                  contentStyle: { backgroundColor: colors.transparent },
                  gestureEnabled: false,
                  orientation: "all",
                }}
              />
            </Stack.Protected>
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
              name="settings-language"
              options={{ headerShown: true, headerTitle: t("navigation.language") }}
            />
            <Stack.Screen
              name="settings-appearance"
              options={{ headerShown: true, headerTitle: t("authSettings.appearance") }}
            />
            <Stack.Screen
              name="profile"
              options={{ headerShown: true, headerTitle: t("privateProfile.title") }}
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
