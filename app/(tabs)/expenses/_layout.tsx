import { Stack } from "expo-router";

import { useUiTheme } from "@/ui/theme";
import { useUiLocale } from "@/ui/useUiLocale";
import { t } from "@/ui/locale";

export default function LedgerLayout() {
  useUiLocale();
  const colors = useUiTheme();
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.background },
        headerBackButtonDisplayMode: "minimal",
        headerTitleAlign: "center",
        headerTitleStyle: { color: colors.textPrimary },
        headerShadowVisible: false,
        headerTintColor: colors.accent,
        headerStyle: { backgroundColor: colors.surface },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="new"
        options={{
          headerTitle: t("ui.newExpense"),
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="split"
        options={{
          headerTitle: t("ledger.split"),
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="rate"
        options={{
          headerTitle: t("navigation.currency"),
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="confirm-date"
        options={{ headerTitle: t("ui.transactionDate"), presentation: "modal" }}
      />
      <Stack.Screen
        name="receipt"
        options={{
          headerTitle: t("ui.receipt"),
          presentation: "modal",
        }}
      />
      <Stack.Screen name="expense/[id]" options={{ headerTitle: t("common.expense") }} />
      <Stack.Screen
        name="conflict/[id]"
        options={{ headerTitle: t("ui.reviewChanges") }}
      />
      <Stack.Screen name="journey/[journeyId]" options={{ headerShown: false }} />
      <Stack.Screen
        name="balance"
        options={{ headerTitle: t("navigation.yourBalance") }}
      />
      <Stack.Screen name="settlement" options={{ headerTitle: t("ledger.settlement") }} />
      <Stack.Screen
        name="personal-settlement-review"
        options={{ headerTitle: t("navigation.yourSettlement") }}
      />
      <Stack.Screen
        name="settlement-adjustment"
        options={{ headerTitle: t("navigation.correctExpense") }}
      />
      <Stack.Screen
        name="settlement-update"
        options={{ headerTitle: t("navigation.reviewSettlementChanges") }}
      />
      <Stack.Screen
        name="settlement-statement"
        options={{ headerTitle: t("navigation.settlementHistory") }}
      />
      <Stack.Screen name="analysis" options={{ headerTitle: t("ui.spendingAnalysis") }} />
      <Stack.Screen name="search" options={{ headerTitle: t("ledger.searchExpenses") }} />
      <Stack.Screen
        name="stage2"
        options={{ headerTitle: t("navigation.developerDiagnostics") }}
      />
      <Stack.Screen
        name="all-journeys"
        options={{ headerTitle: t("navigation.myLedger") }}
      />
      <Stack.Screen name="settings" options={{ headerTitle: t("navigation.currency") }} />
      <Stack.Screen name="currency" options={{ headerTitle: t("navigation.currency") }} />
      <Stack.Screen
        name="exchange-rates"
        options={{ headerTitle: t("navigation.exchangeRates") }}
      />
      <Stack.Screen name="review" options={{ headerTitle: t("common.review") }} />
      <Stack.Screen
        name="review/[id]"
        options={{ headerTitle: t("navigation.finding") }}
      />
      <Stack.Screen
        name="transfer/[id]"
        options={{ headerTitle: t("navigation.transfer") }}
      />
    </Stack>
  );
}
