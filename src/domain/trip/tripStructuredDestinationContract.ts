import { z } from "zod";
import {
  localTripDestinationInputSchema,
  parseLocalTripDestinations,
} from "./localTripDestination";
import { tripMetadataFields } from "./tripCreateContract";
import { coreUuid } from "./tripCoreV2";
import { canonicalCoreJson, type Json } from "./tripCoreV2Json";

// Same owning values as local storage; array position is the sole ordering field.
export const tripDestinationsSchema = z
  .array(localTripDestinationInputSchema)
  .max(20)
  .transform((value, ctx) => {
    try {
      return [...parseLocalTripDestinations(value)];
    } catch {
      ctx.addIssue({ code: "custom", message: "TRIP_DESTINATIONS_INVALID" });
      return z.NEVER;
    }
  });
export const structuredTripMetadataSchema = z
  .strictObject({
    ...tripMetadataFields,
    destination: z.null(),
    destinations: tripDestinationsSchema,
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate);
export const structuredTripCreateRequestSchema = structuredTripMetadataSchema.safeExtend({
  formatVersion: z.literal(2),
  operationId: coreUuid,
  tripId: coreUuid,
});
export type StructuredTripCreateRequest = z.infer<
  typeof structuredTripCreateRequestSchema
>;
export const structuredTripMetadataUpdateSchema = z.strictObject({
  formatVersion: z.literal(3),
  operationId: coreUuid,
  tripId: coreUuid,
  expectedMetadataRevision: z.number().int().nonnegative().safe(),
  before: structuredTripMetadataSchema,
  after: structuredTripMetadataSchema,
});
export type StructuredTripMetadataUpdate = z.infer<
  typeof structuredTripMetadataUpdateSchema
>;
export const structuredTripMetadataReceiptSchema = structuredTripMetadataUpdateSchema
  .extend({
    actorAccountId: coreUuid,
    resultMetadataRevision: z.number().int().nonnegative().safe(),
  })
  .refine(
    (v) =>
      v.resultMetadataRevision ===
      v.expectedMetadataRevision +
        (canonicalCoreJson(v.before as Json) === canonicalCoreJson(v.after as Json)
          ? 0
          : 1),
  );
export const structuredTripMetadataSnapshotSchema = z.strictObject({
  formatVersion: z.literal(3),
  actorAccountId: coreUuid,
  tripId: coreUuid,
  metadataRevision: z.number().int().nonnegative().safe(),
  metadata: structuredTripMetadataSchema,
});

export type StructuredTripMetadata = z.infer<typeof structuredTripMetadataSchema>;
export type StructuredTripMetadataSnapshot = z.infer<
  typeof structuredTripMetadataSnapshotSchema
>;
