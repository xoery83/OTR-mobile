import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { useSheetMotion } from "@/components/SheetHost";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import { listCaptureTripPriors, readCaptureTripPrior } from "@/features/capture/captureTripPrior";
import { readDocumentsTripPicker, releaseDocumentsTripPicker } from "@/features/documents/documentsTripPicker";
import { UiButton, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export default function DocumentsTripPickerRoute() {
  useUiLocale();
  useSyncExternalStore(subscribeAccountGeneration, getAccountGeneration, getAccountGeneration);
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  const picker = readDocumentsTripPicker(invocation);
  useEffect(() => () => {
    queueMicrotask(() => releaseDocumentsTripPicker(invocation));
  }, [invocation]);
  return (
    <SheetRoutePanel title={t("documents.chooseTrip")}>
      {picker ? <TripChoices key={invocation} invocation={invocation} picker={picker} /> : null}
    </SheetRoutePanel>
  );
}

function TripChoices({ invocation, picker }: {
  invocation?: string;
  picker: NonNullable<ReturnType<typeof readDocumentsTripPicker>>;
}) {
  const { accountId, generation } = picker;
  const { exitPending, isExitPending, requestCloseWithAction } = useSheetMotion();
  const [trips, setTrips] = useState<Awaited<ReturnType<typeof listCaptureTripPriors>>>();
  const [error, setError] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    let live = true;
    void listCaptureTripPriors({ accountId, generation }).then(
      rows => { if (live && readDocumentsTripPicker(invocation) === picker) setTrips(rows); },
      () => { if (live && readDocumentsTripPicker(invocation) === picker) setError(true); },
    );
    return () => { live = false; };
  }, [accountId, generation, invocation, picker]);

  const choose = async (id: string) => {
    if (busy.current || isExitPending() || readDocumentsTripPicker(invocation) !== picker) return;
    busy.current = true;
    setSelecting(true);
    try {
      const trip = await readCaptureTripPrior(id, { accountId, generation });
      if (isExitPending() || readDocumentsTripPicker(invocation) !== picker) return;
      if (!trip || trip.id !== id) {
        setError(true);
        return;
      }
      requestCloseWithAction(() => {
        if (readDocumentsTripPicker(invocation) === picker) picker.select(trip);
      });
    } catch {
      if (readDocumentsTripPicker(invocation) === picker) setError(true);
    } finally {
      busy.current = false;
      if (readDocumentsTripPicker(invocation) === picker) setSelecting(false);
    }
  };

  if (error) return <UiText accessibilityRole="alert">{t("importDocuments.unavailable")}</UiText>;
  if (!trips) return <UiText accessibilityLiveRegion="polite">{t("common.loading")}</UiText>;
  return trips.map(trip => (
    <UiButton key={trip.id} variant="text" label={trip.name} disabled={selecting || exitPending} onPress={() => void choose(trip.id)} />
  ));
}
