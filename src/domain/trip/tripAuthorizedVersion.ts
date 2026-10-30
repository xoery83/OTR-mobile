import { z } from "zod";
import { coreHash, coreUuid } from "./tripCoreV2";

// Read projection only; never an access certificate or a Core mutation proof.
export const authorizedTripVersionSchema = z.strictObject({
  version: z.literal("otr.core.authorized-trip-version/1"),
  actorAccountId: coreUuid,
  tripId: coreUuid,
  token: coreHash,
});
export type AuthorizedTripVersion = z.infer<typeof authorizedTripVersionSchema>;
