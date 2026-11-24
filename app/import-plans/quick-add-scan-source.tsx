import { Redirect } from "expo-router";
import { useContext, useEffect, useRef, useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import { hostedImportEnabled } from "@/features/capture/hostedImport";
import {
  FormScanSourceHandoffContext,
  formScanSourceOptions,
  type FormScanSource,
} from "@/features/day-feed/formScanSourceHandoff";
import { hostedManualItineraryEnabled, readManualItinerary, subscribeManualItinerary } from "@/features/day-feed/hostedManualItinerary";
import { useHostedItineraryPickerNavigation } from "@/features/day-feed/useHostedItineraryPickerNavigation";
import { UiButton, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { visual } from "@/ui/visual";

export default function QuickAddScanSourceRoute() {
  if (!hostedImportEnabled || !hostedManualItineraryEnabled) return <Redirect href="/import-plans" />;
  return <HostedScanSource />;
}

function HostedScanSource() {
  useUiLocale();
  useSyncExternalStore(subscribeAccountGeneration, getAccountGeneration);
  const { invocation, selection, hasEditor, pop, back } = useHostedItineraryPickerNavigation();
  const handoff = useContext(FormScanSourceHandoffContext);
  const owner = useSyncExternalStore(subscribeManualItinerary, () => readManualItinerary(invocation));
  const chosen = useRef(false);
  const entry = owner && hasEditor() ? handoff?.read(selection) : null;
  useEffect(() => () => {
    queueMicrotask(() => handoff?.release(selection));
  }, [handoff, selection]);

  function choose(source: FormScanSource) {
    if (chosen.current || !owner || readManualItinerary(invocation) !== owner) return;
    if (!entry || !handoff?.read(selection)?.enabled(source) || !pop()) return;
    chosen.current = true;
    if (readManualItinerary(invocation) === owner) handoff.read(selection)?.acquire(source);
  }

  return (
    <SheetRoutePanel title={t("formAutofill.chooseSource")} onBack={back}>
      {entry && (
        <View style={styles.content}>
          {entry.canPick ? null : <UiText>{t("formAutofill.unavailable")}</UiText>}
          {formScanSourceOptions.map(([source, label]) => (
            <UiButton
              key={source}
              label={t(label)}
              variant="text"
              disabled={!entry.enabled(source)}
              onPress={() => choose(source)}
            />
          ))}
        </View>
      )}
    </SheetRoutePanel>
  );
}

const styles = StyleSheet.create({
  content: { padding: visual.space.page, gap: visual.space.card },
});
