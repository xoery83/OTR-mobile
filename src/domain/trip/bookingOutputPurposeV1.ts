import { z } from "zod";
import { coreHash, coreUuid } from "./tripCoreV2";
import { coreHashValue } from "./tripCoreV2Read";
import type { Json } from "./tripCoreV2Json";
import { flightLocatorSchema, type ImportHash } from "./flightImportReview";

const revision = z.number().int().positive().safe();
const text = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((s) => s === s.trim());
const ids = z
  .array(coreUuid)
  .min(1)
  .max(64)
  .refine((s) => new Set(s).size === s.length);
export const bookingFieldV1Schema = z.enum([
  "BOOKING.title",
  "BOOKING.provider",
  "BOOKING.confirmation_code",
]);
const target = z
  .strictObject({
    kind: z.literal("ITEM"),
    candidateSlotId: coreUuid.nullable(),
    existingId: coreUuid.nullable(),
  })
  .refine((v) => (v.candidateSlotId === null) !== (v.existingId === null));
export const sourceBookingCandidateV1Schema = z.strictObject({
  schemaId: z.literal("otr.trip.capture.candidate/2"),
  candidateId: coreUuid,
  accountId: coreUuid,
  tripId: coreUuid,
  sourceId: coreUuid,
  sourceRevision: revision,
  runId: coreUuid,
  inputRepresentationIds: ids,
  kind: z.literal("BOOKING"),
  facts: z.strictObject({
    fields: z.strictObject({
      title: text(200).optional(),
      provider: text(500),
      confirmation_code: text(255),
    }),
    observations: z.array(z.never()).max(0),
    desiredItemTargets: z.array(target).max(64),
    desiredEntitlementTargets: z.array(z.never()).max(0),
  }),
  fieldKnowledge: z.partialRecord(bookingFieldV1Schema, z.literal("PRESENT")),
  fieldEvidence: z.partialRecord(bookingFieldV1Schema, z.array(text(512)).min(1).max(16)),
  existingTargetHint: z.null(),
  unmappedObservations: z.array(z.never()).max(0),
});
export const bookingPublicationV1Schema = z.strictObject({
  commercialVersion: z.literal(1),
  publicationId: coreUuid,
  inputCatalogSha256: coreHash,
  candidate: sourceBookingCandidateV1Schema,
  evidence: z
    .array(
      z.strictObject({
        fieldKey: bookingFieldV1Schema,
        inputId: coreUuid,
        locator: flightLocatorSchema,
      }),
    )
    .min(2)
    .max(16),
  contractObservation: z.strictObject({
    inputId: coreUuid,
    locator: flightLocatorSchema,
  }),
});
export const bookingPurposeBindingV1Schema = z.strictObject({
  version: z.literal(1),
  purposeKind: z.literal("COMMERCIAL_CONTRACT"),
  accountId: coreUuid,
  tripId: coreUuid,
  sourceId: coreUuid,
  sourceRevision: revision,
  runId: coreUuid,
  candidateId: coreUuid,
  candidateSha256: coreHash,
  publicationId: coreUuid,
  inputCatalogSha256: coreHash,
  planId: coreUuid,
  slotId: coreUuid,
  operationId: coreUuid,
  targetKind: z.literal("BOOKING"),
  targetId: coreUuid,
});
export const bookingReviewBindingV1Schema = z.strictObject({
  // A value read by the owning Review adapter, never a request-authorized confirmation.
  version: z.literal(1),
  decisionId: coreUuid,
  decisionRevision: revision,
  binding: bookingPurposeBindingV1Schema,
  publicationSha256: coreHash,
  selectedFields: z.array(bookingFieldV1Schema).min(2).max(3),
  decisionSha256: coreHash,
});
export type BookingPublicationV1 = z.infer<typeof bookingPublicationV1Schema>;
export type BookingPurposeBindingV1 = z.infer<typeof bookingPurposeBindingV1Schema>;
export type BookingReviewBindingV1 = z.infer<typeof bookingReviewBindingV1Schema>;
export async function bookingPublicationHashV1(
  input: BookingPublicationV1,
  hash: ImportHash,
) {
  return coreHashValue(
    "otr-source-commercial-publication-v1",
    bookingPublicationV1Schema.parse(input) as Json,
    hash,
  );
}
export async function bookingReviewHashV1(
  input: Omit<BookingReviewBindingV1, "decisionSha256">,
  hash: ImportHash,
) {
  return coreHashValue("otr-source-commercial-review-v1", input as Json, hash);
}
