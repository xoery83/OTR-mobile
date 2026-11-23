import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useLocalSearchParams } from "expo-router";
import { Keyboard, StyleSheet, View } from "react-native";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { useSheetMotion } from "@/components/SheetHost";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { AnalysisPickerFields } from "@/features/ledger/AnalysisPickerFields";
import {
  readAnalysisPicker,
  releaseAnalysisPicker,
} from "@/features/ledger/analysisPickerInvocation";
import { t } from "@/ui/locale";
import type { AnalysisRange } from "@/domain/ledger/spendingAnalysis";
import { useUiLocale } from "@/ui/useUiLocale";
import { visual } from "@/ui/visual";

export default function LedgerAnalysisPickerRoute() {
  useUiLocale();
  useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
    getAccountGeneration,
  );
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  const picker = readAnalysisPicker(invocation);
  const { requestClose, isExitPending } = useSheetMotion();

  useEffect(() => () => releaseAnalysisPicker(invocation), [invocation]);

  function choose(apply: () => void) {
    if (isExitPending() || readAnalysisPicker(invocation) !== picker) return;
    apply();
    Keyboard.dismiss();
    requestClose();
  }

  const panel = (fields: ReactNode, confirm?: () => void) => (
    <SheetRoutePanel
      title={t(picker?.kind === "range" ? "ui.analysisDates" : "ui.chooseCategory")}
      action={confirm ? { label: t("ui.applyCustomRange"), onPress: confirm } : undefined}
    >
      <View style={styles.content}>{fields}</View>
    </SheetRoutePanel>
  );

  if (picker?.kind === "range")
    return (
      <AnalysisPickerFields
        panel={panel}
        picker={{
          ...picker,
          choose: (range: AnalysisRange) => choose(() => picker.choose(range)),
        }}
      />
    );
  if (picker)
    return (
      <AnalysisPickerFields
        panel={panel}
        picker={{
          ...picker,
          choose: (category: string | null) => choose(() => picker.choose(category)),
        }}
      />
    );
  return panel(null);
}

const styles = StyleSheet.create({
  content: { padding: visual.space.page, gap: visual.space.card },
});
