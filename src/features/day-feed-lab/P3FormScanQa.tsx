import pack from "./fixtures/p3-form-scan.json";
import { Redirect, Stack, router, useLocalSearchParams } from "expo-router";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import { P3StayEditor } from "@/features/day-feed/P3StayEditor";
import type {
  StaySuggestionBinding,
  SyntheticStayResult,
} from "@/features/day-feed/p3FormSuggestions";

export function syntheticStayScan(binding: StaySuggestionBinding): SyntheticStayResult {
  return {
    kind: "SYNTHETIC_STAY_SUGGESTIONS",
    binding: { ...binding },
    candidates: pack.map((candidate, index) => ({
      ...candidate,
      targetItemId:
        index === 0 && binding.mode === "EDIT" ? binding.itemId : candidate.targetItemId,
    })),
  };
}

// DEV only; the real repository retains its ordinary account, Trip and Save checks.
export function P3FormScanQa() {
  const { tripId, item } = useLocalSearchParams<{ tripId?: string; item?: string }>();
  if (
    !__DEV__ ||
    !coreUuid.safeParse(tripId).success ||
    (item !== undefined && !coreUuid.safeParse(item).success)
  )
    return <Redirect href="/trip" />;
  const close = () =>
    router.replace({ pathname: "/trip-home", params: { tripId: tripId!, view: "day" } });
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <P3StayEditor
        key={JSON.stringify([tripId, item])}
        tripId={tripId!}
        itemId={item}
        syntheticScan={syntheticStayScan}
        onClose={close}
        onSaved={close}
      />
    </>
  );
}
