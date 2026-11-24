import { router, useNavigation } from "expo-router";
import { useRoute } from "expo-router/react-navigation";
import { useLayoutEffect, useRef } from "react";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { hostedImportEnabled } from "@/features/capture/hostedImport";
import type { ManualItineraryFamily } from "./ManualItineraryContent";
import {
  hostedManualItineraryEnabled, readManualItinerary, releaseManualItinerary,
  stageManualItinerary, type DetailEditorPresentation, type HostedManualItinerary,
} from "./hostedManualItinerary";

export function useHostedDetailItineraryEdit(
  family: ManualItineraryFamily,
  tripId: string,
  itemId: string,
  generation: number,
) {
  const navigation = useNavigation();
  const route = useRoute();
  const invocation = useRef<string | undefined>(undefined);
  useLayoutEffect(() => () => {
    releaseManualItinerary(invocation.current);
    invocation.current = undefined;
  }, [generation, itemId, route.key, tripId]);

  return (
    render: NonNullable<HostedManualItinerary["detailEdit"]>["render"],
    onSaved: DetailEditorPresentation["onSaved"],
  ) => {
    if (!hostedImportEnabled || !hostedManualItineraryEnabled) return false;
    const originCurrent = () => {
      const params = navigation.getState()?.routes.find(candidate => candidate.key === route.key)?.params;
      return !!params && "tripId" in params && params.tripId === tripId &&
        "itemId" in params && params.itemId === itemId && getAccountGeneration() === generation;
    };
    const originFocused = () => originCurrent() && navigation.isFocused();
    if (!tripId || !itemId || !originFocused()) return true;
    if (!readManualItinerary(invocation.current)) {
      const entry: HostedManualItinerary = {
        generation, tripId, initialDate: null, onClose: () => {},
        onSaved,
        detailEdit: { family, itemId, originKey: route.key, originFocused, render },
      };
      invocation.current = stageManualItinerary(() => originCurrent() ? entry : undefined);
    }
    router.navigate({
      pathname: "/import-plans/quick-add-edit",
      params: { invocation: invocation.current, family, detail: 1 },
    });
    return true;
  };
}
