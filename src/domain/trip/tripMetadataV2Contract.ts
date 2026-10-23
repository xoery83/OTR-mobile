import {
  structuredTripMetadataUpdateSchema,
  structuredTripMetadataReceiptSchema,
  structuredTripMetadataSnapshotSchema,
} from "./tripStructuredDestinationContract";
import { z } from "zod";
import { coreUuid } from "./tripCoreV2";
import {
  tripMetadataSchema,
  tripMetadataUpdateSchema,
  tripMetadataReceiptSchema,
} from "./tripMetadataContract";

// Explicit proposal-only V2. Never synthesize a revision for a V1 queued operation.
export const tripMetadataV2UpdateSchema = tripMetadataUpdateSchema.extend({
  formatVersion: z.literal(2),
  expectedMetadataRevision: z.number().int().nonnegative().safe(),
});
export type TripMetadataV2Update = z.infer<typeof tripMetadataV2UpdateSchema>;
export const tripMetadataV2ReceiptSchema = tripMetadataV2UpdateSchema
  .extend({
    actorAccountId: coreUuid,
    resultMetadataRevision: z.number().int().nonnegative().safe(),
  })
  .refine((v) => {
    const same = (Object.keys(v.before) as (keyof typeof v.before)[]).every(
      (key) => v.before[key] === v.after[key],
    );
    return v.resultMetadataRevision === v.expectedMetadataRevision + (same ? 0 : 1);
  });
export type TripMetadataV2Receipt = z.infer<typeof tripMetadataV2ReceiptSchema>;
export const tripMetadataV2SnapshotSchema = z.strictObject({
  formatVersion: z.literal(2),
  actorAccountId: coreUuid,
  tripId: coreUuid,
  metadataRevision: z.number().int().nonnegative().safe(),
  metadata: tripMetadataSchema,
});
export type TripMetadataV2Snapshot = z.infer<typeof tripMetadataV2SnapshotSchema>;

// Versioned codec for the existing queue only; V1 payloads remain V1 forever.
export const tripMetadataWireUpdateSchema = z.union([
  structuredTripMetadataUpdateSchema,
  tripMetadataV2UpdateSchema,
  tripMetadataUpdateSchema,
]);
export type TripMetadataWireUpdate = z.infer<typeof tripMetadataWireUpdateSchema>;

export const tripMetadataWireReceiptSchema = z.union([
  structuredTripMetadataReceiptSchema,
  tripMetadataV2ReceiptSchema,
  tripMetadataReceiptSchema,
]);
export type TripMetadataWireReceipt = z.infer<typeof tripMetadataWireReceiptSchema>;
export function metadataRequestFromReceipt(
  receipt: TripMetadataWireReceipt,
): TripMetadataWireUpdate {
  const request = {
    operationId: receipt.operationId,
    tripId: receipt.tripId,
    before: receipt.before,
    after: receipt.after,
  };
  return "formatVersion" in receipt
    ? (receipt.formatVersion === 3
        ? structuredTripMetadataUpdateSchema
        : tripMetadataV2UpdateSchema
      ).parse({
        ...request,
        formatVersion: receipt.formatVersion,
        expectedMetadataRevision: receipt.expectedMetadataRevision,
      })
    : tripMetadataUpdateSchema.parse(request);
}

export const tripMetadataRevisionedUpdateSchema = z.union([
  structuredTripMetadataUpdateSchema,
  tripMetadataV2UpdateSchema,
]);
export const tripMetadataRevisionedReceiptSchema = z.union([
  structuredTripMetadataReceiptSchema,
  tripMetadataV2ReceiptSchema,
]);
export const tripMetadataRevisionedSnapshotSchema = z.union([
  structuredTripMetadataSnapshotSchema,
  tripMetadataV2SnapshotSchema,
]);
export type TripMetadataRevisionedUpdate = z.infer<
  typeof tripMetadataRevisionedUpdateSchema
>;
export type TripMetadataRevisionedReceipt = z.infer<
  typeof tripMetadataRevisionedReceiptSchema
>;
export type TripMetadataRevisionedSnapshot = z.infer<
  typeof tripMetadataRevisionedSnapshotSchema
>;
