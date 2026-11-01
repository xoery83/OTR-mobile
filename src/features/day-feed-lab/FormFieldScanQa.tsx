import { Redirect, Stack, router, useLocalSearchParams } from "expo-router";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import { ManualFlightEditor } from "@/features/day-feed/ManualFlightForm";
import { P4RentalEditor } from "@/features/day-feed/P4RentalEditor";
import { P5TransportEditor } from "@/features/day-feed/P5TransportEditor";
import { P6ActivityEditor } from "@/features/day-feed/P6ActivityEditor";
import type { FormFieldResult } from "@/features/day-feed/formFieldSuggestions";
import type { StaySuggestionBinding } from "@/features/day-feed/p3FormSuggestions";
import pack from "./fixtures/form-field-scan.json";

export function FormFieldScanQa() {
  const { tripId, item, fidelity } = useLocalSearchParams<{
    tripId?: string;
    item?: string;
    fidelity?: string;
  }>();
  const family = fidelity?.split("-")[0]?.toUpperCase();
  if (
    !__DEV__ ||
    !coreUuid.safeParse(tripId).success ||
    (item !== undefined && !coreUuid.safeParse(item).success) ||
    !["P2", "P4", "P5", "P6"].includes(family ?? "")
  )
    return <Redirect href="/trip" />;
  const typedFamily = family as FormFieldResult["family"];
  const scan = (binding: StaySuggestionBinding): FormFieldResult => ({
    kind: "SYNTHETIC_FORM_SUGGESTIONS",
    family: typedFamily,
    binding: { ...binding },
    candidates: [
      {
        id: "synthetic-one",
        targetItemId: binding.mode === "EDIT" ? binding.itemId : undefined,
        fields: pack[typedFamily],
      },
    ],
  });
  const close = () =>
    router.replace({ pathname: "/trip-home", params: { tripId: tripId!, view: "day" } });
  const props = {
    tripId: tripId!,
    itemId: item,
    syntheticScan: scan,
    onClose: close,
    onSaved: close,
    embedded: false,
  };
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      {family === "P2" ? (
        <ManualFlightEditor
          key={JSON.stringify([tripId, item])}
          {...props}
          initialDate={null}
        />
      ) : family === "P4" ? (
        <P4RentalEditor key={JSON.stringify([tripId, item])} {...props} />
      ) : family === "P5" ? (
        <P5TransportEditor key={JSON.stringify([tripId, item])} {...props} />
      ) : (
        <P6ActivityEditor key={JSON.stringify([tripId, item])} {...props} />
      )}
    </>
  );
}
