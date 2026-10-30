import { z } from "zod";
import { coreHash, coreUuid } from "../trip/tripCoreV2";
import { coreHashValue } from "../trip/tripCoreV2Read";
import { canonicalCoreJson, type Json } from "../trip/tripCoreV2Json";
import { guestAdoptionStatusRequestSchema } from "./guestAdoptionStatus";

export const guestAdoptionReceiptRequestSchema = guestAdoptionStatusRequestSchema.extend({
  receiptId: coreUuid,
  receiptSha256: coreHash,
});
export type GuestAdoptionReceiptRequest = z.infer<
  typeof guestAdoptionReceiptRequestSchema
>;

const operation = z.strictObject({
  queueId: coreUuid,
  operationId: coreUuid,
  kind: z.enum(["TRIP_CREATE", "PERSON_CREATE", "TRIP_METADATA_DEFERRED", "CORE"]),
  owningReceiptSha256: coreHash,
  domainReceiptId: coreUuid.nullable(),
  sourceIntentSha256: coreHash.nullable(),
  mappedIntentSha256: coreHash.nullable(),
});
const trip = z.strictObject({
  tripId: coreUuid,
  createOperationId: coreUuid,
  sourceCreatorPersonId: coreUuid,
  ownerPersonId: coreUuid,
  personMappings: z.array(
    z.strictObject({ sourcePersonId: coreUuid, targetPersonId: coreUuid }),
  ),
  operations: z.array(operation),
  ledgerSnapshotSha256: coreHash,
});
const common = {
  ...guestAdoptionStatusRequestSchema.shape,
  schemaId: z.literal("otr.auth.guest-adoption-receipt/1"),
  receiptId: coreUuid,
  grantId: coreUuid,
  policyVersion: z.string().min(1).max(128),
  recordedAt: z.iso.datetime({ offset: true }),
  receiptSha256: coreHash,
};
export const guestAdoptionReceiptSchema = z
  .discriminatedUnion("outcome", [
    z.strictObject({
      ...common,
      outcome: z.literal("PUBLISHED"),
      preparationSha256: coreHash,
      planSha256: coreHash,
      executionSha256: coreHash,
      trips: z.array(trip).min(1),
    }),
    z.strictObject({
      ...common,
      outcome: z.literal("CANCELLED"),
      preparationSha256: coreHash.nullable(),
      planSha256: coreHash.nullable(),
    }),
  ])
  .superRefine((receipt, context) => {
    const fail = () =>
      context.addIssue({
        code: "custom",
        message: "GUEST_ADOPTION_RECEIPT_REFERENCES_INVALID",
      });
    if (receipt.outcome === "CANCELLED") {
      if ((receipt.preparationSha256 === null) !== (receipt.planSha256 === null)) fail();
      return;
    }
    const trips = new Set<string>(),
      sources = new Set<string>(),
      targets = new Set<string>(),
      queues = new Set<string>(),
      operations = new Set<string>(),
      domainReceipts = new Set<string>();
    const unique = (set: Set<string>, id: string) => {
      if (set.has(id)) fail();
      set.add(id);
    };
    for (const trip of receipt.trips) {
      unique(trips, trip.tripId);
      let creator = 0;
      for (const person of trip.personMappings) {
        unique(sources, person.sourcePersonId);
        unique(targets, person.targetPersonId);
        if (person.sourcePersonId === trip.sourceCreatorPersonId) {
          creator++;
          if (person.targetPersonId !== trip.ownerPersonId) fail();
        } else if (person.sourcePersonId !== person.targetPersonId) fail();
      }
      if (creator !== 1) fail();
      const creates = trip.operations.filter((op) => op.kind === "TRIP_CREATE");
      if (creates.length !== 1 || creates[0].operationId !== trip.createOperationId)
        fail();
      for (const op of trip.operations) {
        unique(queues, op.queueId);
        unique(operations, op.operationId);
        if (op.kind !== "TRIP_METADATA_DEFERRED" && op.queueId !== op.operationId) fail();
        if ((op.kind === "CORE") !== (op.domainReceiptId !== null)) fail();
        if (op.domainReceiptId) unique(domainReceipts, op.domainReceiptId);
        if (
          op.kind === "CORE"
            ? op.sourceIntentSha256 === null || op.mappedIntentSha256 === null
            : op.sourceIntentSha256 !== null || op.mappedIntentSha256 !== null
        )
          fail();
      }
    }
    for (const trip of receipt.trips)
      for (const person of trip.personMappings)
        if (
          sources.has(person.targetPersonId) &&
          person.targetPersonId !== person.sourcePersonId
        )
          fail();
    for (const trip of receipt.trips)
      for (const op of trip.operations)
        if (op.kind === "TRIP_METADATA_DEFERRED" && queues.has(op.operationId)) fail();
  });
export type GuestAdoptionReceipt = z.infer<typeof guestAdoptionReceiptSchema>;

// Integrity/binding only: normal authenticated server provenance and owning restore
// are required separately. Neither a self-computed hash nor this decoder unlocks Guest data.
export async function validateGuestAdoptionReceipt(
  input: unknown,
  expectedInput: z.input<typeof guestAdoptionStatusRequestSchema>,
  hash: (bytes: Uint8Array) => Promise<string>,
): Promise<GuestAdoptionReceipt> {
  const expected = guestAdoptionStatusRequestSchema.parse(expectedInput);
  const receipt = guestAdoptionReceiptSchema.parse(input);
  const binding = Object.fromEntries(
    Object.keys(expected).map((key) => [key, receipt[key as keyof GuestAdoptionReceipt]]),
  );
  if (canonicalCoreJson(binding as Json) !== canonicalCoreJson(expected as Json))
    throw Error("GUEST_ADOPTION_RECEIPT_BINDING_MISMATCH");
  const { receiptSha256, ...unsigned } = receipt;
  if (
    (await coreHashValue(
      "otr-auth-guest-adoption-receipt-v1",
      unsigned as Json,
      hash,
    )) !== receiptSha256
  )
    throw Error("GUEST_ADOPTION_RECEIPT_HASH_MISMATCH");
  return receipt;
}
