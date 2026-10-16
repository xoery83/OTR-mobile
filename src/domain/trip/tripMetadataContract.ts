import { z } from "zod";
import { tripMetadataFields } from "./tripCreateContract";
import { coreUuid } from "./tripCoreV2";

export const tripMetadataSchema = z
  .strictObject(tripMetadataFields)
  .refine(
    (value) => !value.startDate || !value.endDate || value.endDate >= value.startDate,
  );
export type TripMetadata = z.infer<typeof tripMetadataSchema>;
export const tripMetadataUpdateSchema = z.strictObject({
  operationId: coreUuid,
  tripId: coreUuid,
  before: tripMetadataSchema,
  after: tripMetadataSchema,
});
export type TripMetadataUpdate = z.infer<typeof tripMetadataUpdateSchema>;
export const tripMetadataReceiptSchema = tripMetadataUpdateSchema.extend({
  actorAccountId: coreUuid,
});
export type TripMetadataReceipt = z.infer<typeof tripMetadataReceiptSchema>;
