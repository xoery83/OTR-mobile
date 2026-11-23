import { useLocalSearchParams } from "expo-router";
import { SheetRouteLayout } from "@/components/SheetRouteLayout";
import { interceptLedgerCurrencySheetClose, readLedgerCurrencySheet } from "@/features/ledger/ledgerCurrencySheet";

export default function LedgerCurrencyPickerLayout() {
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  const kind = readLedgerCurrencySheet(invocation)?.kind;
  return <SheetRouteLayout
    immersive={kind !== "display" && kind !== "confirm-date"}
    interceptClose={() => interceptLedgerCurrencySheetClose(invocation)}
  />;
}
