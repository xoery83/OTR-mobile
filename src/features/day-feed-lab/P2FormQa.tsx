import { Redirect, Stack, router, useLocalSearchParams } from "expo-router";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import { ManualFlightEditor } from "@/features/day-feed/ManualFlightForm";

// DEV route to the same authenticated Form; it never supplies a fixture Item or write authority.
export function P2FormQa() {
  const { tripId, item, revision } = useLocalSearchParams<{
    tripId?: string;
    item?: string;
    revision?: string;
  }>();
  const parsedRevision = revision === undefined ? undefined : Number(revision);
  if (
    !coreUuid.safeParse(tripId).success ||
    !coreUuid.safeParse(item).success ||
    (parsedRevision !== undefined &&
      (!Number.isSafeInteger(parsedRevision) || parsedRevision < 1))
  )
    return <Redirect href="/trip" />;
  const close = () =>
    router.replace({ pathname: "/trip-home", params: { tripId: tripId!, view: "day" } });
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ManualFlightEditor
        key={JSON.stringify([tripId, item, revision])}
        tripId={tripId!}
        itemId={item!}
        expectedRevision={parsedRevision}
        initialDate={null}
        onClose={close}
        onSaved={close}
      />
    </>
  );
}
