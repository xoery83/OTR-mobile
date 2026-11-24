import { useLocalSearchParams } from "expo-router";
import { SheetRouteLayout } from "@/components/SheetRouteLayout";
import { readAnalysisPicker } from "@/features/ledger/analysisPickerInvocation";

export default function LedgerAnalysisPickerLayout() {
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  return <SheetRouteLayout immersive={readAnalysisPicker(invocation)?.kind !== "period"} />;
}
