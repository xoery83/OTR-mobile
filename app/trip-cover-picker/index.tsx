import { useLocalSearchParams, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useSyncExternalStore } from "react";
import { useSheetMotion } from "@/components/SheetHost";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { TripCoverPicker } from "@/features/day-feed/TripCoverPicker";
import {
  personalTripCoverBusy, readPersonalTripCoverSheet, releasePersonalTripCoverSheet,
  setTripCoverSheetBusy, subscribeTripCoverSheet,
} from "@/features/day-feed/tripCoverSheet";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export default function TripCoverPickerRoute() {
  useUiLocale();
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  const navigation = useNavigation();
  const { requestClose, isExitPending } = useSheetMotion();
  const cover = useSyncExternalStore(subscribeTripCoverSheet, () => readPersonalTripCoverSheet(invocation));
  const busy = useSyncExternalStore(subscribeTripCoverSheet, () => personalTripCoverBusy(invocation));
  usePreventRemove(busy, () => {});
  useEffect(() => () => {
    queueMicrotask(() => releasePersonalTripCoverSheet(invocation));
  }, [invocation]);
  return cover ? (
    <TripCoverPicker
      {...cover}
      presentation="standalone"
      hosted={{
        setBusy: value => setTripCoverSheetBusy(invocation, value),
        canInteract: () => navigation.isFocused() && !isExitPending() && !!readPersonalTripCoverSheet(invocation),
      }}
      onClose={requestClose}
    />
  ) : <SheetRoutePanel title={t("myTrips.chooseCover")}>{null}</SheetRoutePanel>;
}
