import { z } from "zod";
import { coreUuid } from "./tripCoreV2";

const bounded = (chars: number, bytes: number) =>
  z
    .string()
    .min(1)
    .max(chars)
    .refine(
      (value) =>
        value === value.trim() && new TextEncoder().encode(value).length <= bytes,
    );
const label = bounded(256, 1024);
export const localTripDestinationInputSchema = z.discriminatedUnion("source", [
  z
    .object({ destinationId: coreUuid, displayLabel: label, source: z.literal("MANUAL") })
    .strict(),
  z
    .object({
      destinationId: coreUuid,
      displayLabel: label,
      source: z.literal("APPLE_PLACE_ID"),
      provider: z.literal("apple"),
      providerPlaceId: bounded(1024, 4096),
    })
    .strict(),
]);
export type LocalTripDestinationInput = z.infer<typeof localTripDestinationInputSchema>;
export type LocalTripDestination = LocalTripDestinationInput &
  Readonly<{ ordinal: number }>;
export const manualDestinationClaim = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
export function parseLocalTripDestinations(
  value: unknown,
): readonly LocalTripDestinationInput[] {
  const items = z.array(localTripDestinationInputSchema).max(20).parse(value);
  const ids = new Set<string>(),
    claims = new Set<string>();
  for (const item of items) {
    const claim =
      item.source === "MANUAL"
        ? "MANUAL:" + label.parse(manualDestinationClaim(item.displayLabel))
        : "APPLE:" + item.providerPlaceId;
    if (ids.has(item.destinationId) || claims.has(claim))
      throw new Error("TRIP_DESTINATIONS_DUPLICATE");
    ids.add(item.destinationId);
    claims.add(claim);
  }
  return items;
}
