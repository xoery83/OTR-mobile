import { useLocalSearchParams } from "expo-router";
import { SheetRouteLayout } from "@/components/SheetRouteLayout";
import { interceptLedgerCurrencySheetClose, readLedgerCurrencySheet } from "@/features/ledger/ledgerCurrencySheet";

export default function LedgerCurrencyPickerLayout() {
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  return <SheetRouteLayout immersive={readLedgerCurrencySheet(invocation)?.kind !== "display"} interceptClose={() => interceptLedgerCurrencySheetClose(invocation)} />;
}
