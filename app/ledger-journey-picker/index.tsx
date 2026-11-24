import { router, useLocalSearchParams } from "expo-router";
import { useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Keyboard, StyleSheet } from "react-native";
import { useIsFocused, usePreventRemove } from "expo-router/react-navigation";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { useSheetMotion } from "@/components/SheetHost";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import { LedgerJourneyPickerFields } from "@/features/ledger/LedgerStage6Screen";
import { LedgerJourneyCloseContext } from "@/features/ledger/LedgerJourneyCloseContext";
import { readLedgerJourneySheet, releaseLedgerJourneySheet } from "@/features/ledger/ledgerJourneySheet";
import { UiButton, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { visual } from "@/ui/visual";

export default function LedgerJourneyPickerRoute() {
  useUiLocale();
  useSyncExternalStore(subscribeAccountGeneration, getAccountGeneration);
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  const close = useContext(LedgerJourneyCloseContext);
  const candidate = readLedgerJourneySheet(invocation);
  const entry = candidate && close?.hasOrigin(candidate.originKey) ? candidate : undefined;
  const [query, setQuery] = useState(entry?.initialQuery ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [completed, setCompleted] = useState(false);
  const completedRef = useRef(false);
  const autoCloseAttempted = useRef(false);
  const selecting = useRef(false);
  const alive = useRef(true);
  const { requestClose, requestCloseWithAction, isExitPending, exitPending } = useSheetMotion();
  const focused = useIsFocused();
  usePreventRemove(busy !== null, () => {});
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      queueMicrotask(() => releaseLedgerJourneySheet(invocation));
    };
  }, [invocation]);
  useEffect(() => {
    if (!completed || busy !== null || !focused || exitPending || autoCloseAttempted.current) return;
    autoCloseAttempted.current = true;
    requestClose();
  }, [busy, completed, exitPending, focused, requestClose]);

  return <SheetRoutePanel title={t("ledger.chooseJourneyTitle")} ownsScroll leadingDisabled={busy !== null}>
    {entry ? <UiButton
      label={t("navigation.myLedger")}
      variant="text"
      disabled={busy !== null || completed || exitPending}
      onPress={() => {
        if (selecting.current || completedRef.current || isExitPending() ||
            readLedgerJourneySheet(invocation) !== entry || !close?.hasOrigin(entry.originKey)) return;
        requestCloseWithAction(() => {
          if (readLedgerJourneySheet(invocation) !== entry || !entry.originFocused()) return;
          releaseLedgerJourneySheet(invocation);
          router.push("/expenses/all-journeys");
        });
      }}
    /> : null}
    {failed ? <UiText accessibilityRole="alert" style={styles.error}>{t("ledger.selectionFailed")}</UiText> : null}
    {entry ? <LedgerJourneyPickerFields
      hosted
      disabled={completed || exitPending}
      query={query}
      onQuery={setQuery}
      sections={entry.sections(query)}
      selectedJourney={entry.selected}
      selectingJourneyId={busy}
      onChoose={item => {
        const isPresent = () => alive.current && Boolean(close?.hasOrigin(entry.originKey));
        if (selecting.current || completedRef.current || isExitPending() || !isPresent() ||
            readLedgerJourneySheet(invocation) !== entry) return;
        selecting.current = true;
        close?.setBusy(true);
        setBusy(item.journeyId);
        setFailed(false);
        Keyboard.dismiss();
        void entry.choose(item, isPresent)
          .then(saved => {
            if (!alive.current) return;
            if (saved) {
              completedRef.current = true;
              setCompleted(true);
            } else setFailed(true);
          })
          .catch(() => { if (alive.current) setFailed(true); })
          .finally(() => {
            selecting.current = false;
            close?.setBusy(false);
            if (alive.current) setBusy(null);
          });
      }}
    /> : null}
  </SheetRoutePanel>;
}
const styles = StyleSheet.create({
  error: { padding: visual.space.page },
});
