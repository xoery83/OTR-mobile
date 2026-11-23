import { useNavigation } from "expo-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useSheetMotion } from "@/components/SheetHost";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { TripCoverPicker } from "@/features/day-feed/TripCoverPicker";
import {
  readTripMetadataCover,
  releaseTripMetadataCover,
  setTripCoverSheetBusy,
  subscribeTripCoverSheet,
  tripCoverSheetBusy,
} from "@/features/day-feed/tripCoverSheet";
import { readTripMetadataSheet, subscribeTripMetadataSheet } from "@/features/day-feed/tripMetadataSheet";
import { useHostedItineraryPickerNavigation } from "@/features/day-feed/useHostedItineraryPickerNavigation";
import type { TripCoverChoice } from "@/domain/trip/tripCoverAssets";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export default function TripMetadataCoverRoute() {
  useUiLocale();
  const { invocation, selection, hasEditor, pop, back } = useHostedItineraryPickerNavigation();
  const { isExitPending } = useSheetMotion();
  const navigation = useNavigation();
  const sheet = useSyncExternalStore(subscribeTripMetadataSheet, () => readTripMetadataSheet(invocation));
  const cover = useSyncExternalStore(subscribeTripCoverSheet, () => readTripMetadataCover(invocation, selection));
  const [draft, setDraft] = useState<TripCoverChoice | null | undefined>(undefined);
  useEffect(() => () => {
    queueMicrotask(() => releaseTripMetadataCover(invocation, selection));
  }, [invocation, selection]);

  function isCurrent() {
    return !!cover && navigation.isFocused() && hasEditor() && !isExitPending() &&
      readTripMetadataCover(invocation, selection) === cover &&
      readTripMetadataSheet(invocation)?.open === true;
  }

  function returnToEditor() {
    return isCurrent() && pop() && readTripMetadataCover(invocation, selection) === cover &&
      readTripMetadataSheet(invocation)?.open === true;
  }

  function cancel() {
    if (!tripCoverSheetBusy(selection)) back();
  }

  if (!sheet?.open || !cover) {
    return <SheetRoutePanel title={t("myTrips.chooseCover")} onBack={cancel}>{null}</SheetRoutePanel>;
  }

  const owner = cover;
  async function select(id: TripCoverChoice | null, closeAfter: boolean) {
    if (closeAfter) {
      if (returnToEditor()) await owner.onSelect(id);
    } else if (isCurrent()) setDraft(id);
  }

  const choosePhoto = owner.onChoosePhoto;

  return (
    <TripCoverPicker
      {...cover}
      selectedRaw={draft === undefined ? cover.selectedRaw : draft}
      onChoosePhoto={choosePhoto ? processing => choosePhoto(processing, { isCurrent, returnToEditor }) : undefined}
      presentation="standalone"
      hosted={{
        canInteract: isCurrent,
        setBusy: busy => setTripCoverSheetBusy(selection, busy),
        child: {
          onBack: cancel,
          onSelect: select,
          action: draft === undefined ? undefined : {
            label: t("common.done"), onPress: () => {
              if (!tripCoverSheetBusy(selection)) void select(draft, true);
            },
          },
        },
      }}
    />
  );
}
