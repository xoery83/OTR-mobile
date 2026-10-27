import { Stack } from "expo-router";
import { LedgerExpenseEntryScreen } from "@/features/ledger/LedgerExpenseEntryScreen";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

// Keep the existing Ledger form above the originating Immersive screen, outside the Ledger tab stack.
export default function TripItemExpenseRoute() {
  useUiLocale();
  return (
    <>
      <Stack.Screen
        options={{ headerShown: true, presentation: "modal", headerTitle: t("ui.newExpense") }}
      />
      <LedgerExpenseEntryScreen />
    </>
  );
}
