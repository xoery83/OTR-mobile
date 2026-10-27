import { z } from "zod";
import { applePlaceAddressComponentsSchema } from "./applePlaceProvider";

// Provider-attributed UI selection, not a Core Place or an acceptance receipt.
export const appleSelectedPlaceDraftSchema = z.strictObject({
  authority: z.literal("UNACCEPTED_PROVIDER_DRAFT"),
  binding: z.strictObject({
    tripId: z.uuid(),
    itemId: z.uuid(),
    accountGeneration: z.number().int().min(0),
    inputRevision: z.number().int().min(1),
    location: z.string().trim().min(1).max(500),
  }),
  provider: z.literal("apple"),
  selectionSessionId: z.uuid(),
  selectionGeneration: z.number().int().min(1),
  providerPlaceId: z.string().min(1).max(1024).optional(),
  addressComponents: applePlaceAddressComponentsSchema.optional(),
  point: z
    .strictObject({
      latitude: z.number().finite().min(-90).max(90),
      longitude: z.number().finite().min(-180).max(180),
    })
    .optional(),
});
export type AppleSelectedPlaceDraft = Readonly<
  z.infer<typeof appleSelectedPlaceDraftSchema>
>;
