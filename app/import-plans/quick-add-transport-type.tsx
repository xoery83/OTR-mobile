import { Redirect } from "expo-router";
import { useContext, useEffect, useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import { hostedImportEnabled } from "@/features/capture/hostedImport";
import { hostedManualItineraryEnabled, readManualItinerary, subscribeManualItinerary } from "@/features/day-feed/hostedManualItinerary";
import {
  TransportTypeHandoffContext,
  transportPickerTypes,
  type EditableTransportType,
} from "@/features/day-feed/transportTypePickerHandoff";
import { useHostedItineraryPickerNavigation } from "@/features/day-feed/useHostedItineraryPickerNavigation";
import { UiChoiceChip } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { visual } from "@/ui/visual";

export default function QuickAddTransportTypeRoute() {
  if (!hostedImportEnabled || !hostedManualItineraryEnabled) return <Redirect href="/import-plans" />;
  return <HostedTransportType />;
}

function HostedTransportType() {
  useUiLocale();
  useSyncExternalStore(subscribeAccountGeneration, getAccountGeneration);
  const { invocation, selection, hasEditor, pop, back } = useHostedItineraryPickerNavigation();
  const handoff = useContext(TransportTypeHandoffContext);
  const owner = useSyncExternalStore(subscribeManualItinerary, () => readManualItinerary(invocation));
  const choice = owner && hasEditor() ? handoff?.read(selection) : null;
  useEffect(() => () => {
    queueMicrotask(() => handoff?.release(selection));
  }, [handoff, selection]);

  function choose(type: EditableTransportType) {
    if (!owner || !choice || readManualItinerary(invocation) !== owner ||
        handoff?.read(selection) !== choice || !pop()) return;
    if (readManualItinerary(invocation) === owner && handoff.read(selection) === choice) {
      handoff.release(selection);
      choice.choose(type);
    }
  }

  return (
    <SheetRoutePanel title={t("tripCreate.transportType")} onBack={back}>
      {choice ? (
        <View style={styles.content}>
          {transportPickerTypes.map(type => (
            <UiChoiceChip key={type} label={t(`tripCreate.transportType.${type}`)}
              selected={choice.selected === type} onPress={() => choose(type)} />
          ))}
        </View>
      ) : null}
    </SheetRoutePanel>
  );
}

const styles = StyleSheet.create({
  content: { padding: visual.space.page, gap: visual.space.card },
});
