import { useLocalSearchParams, useNavigation } from "expo-router";
import { useContext, useEffect, useSyncExternalStore } from "react";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { useSheetMotion } from "@/components/SheetHost";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import { LocalTripWorkspace } from "@/features/day-feed/LocalTripWorkspace";
import { readHostedTripCreate, releaseHostedTripCreate, TripCreateSheetContext } from "@/features/day-feed/hostedTripCreate";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

const unused = () => {};

export default function TripCreateRoute() {
  useUiLocale();
  useSyncExternalStore(subscribeAccountGeneration, getAccountGeneration);
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  const port = useContext(TripCreateSheetContext);
  const navigation = useNavigation();
  const { requestClose, isExitPending } = useSheetMotion();
  const owner = readHostedTripCreate(invocation);
  useEffect(() => () => {
    queueMicrotask(() => releaseHostedTripCreate(invocation));
  }, [invocation]);
  if (!owner || !port) return <SheetRoutePanel title={t("createTripV2.title")}>{null}</SheetRoutePanel>;
  return (
    <LocalTripWorkspace
      mode="CREATE"
      tripId={null}
      hostedCreate={{
        registerClose: port.registerClose,
        isCurrent: () => navigation.isFocused() && !isExitPending() && readHostedTripCreate(invocation) === owner,
      }}
      onOpen={id => {
        if (readHostedTripCreate(invocation) !== owner) return;
        port.recordCreatedTrip(id, owner);
        requestClose();
      }}
      onBackToTrips={requestClose}
      onCreate={unused}
      onOpenToday={unused}
      onKnownTrip={unused}
    />
  );
}
