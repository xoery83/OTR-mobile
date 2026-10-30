import {
  guestAdoptionStatusRequestSchema,
  guestAdoptionStatusResultSchema,
} from "@/domain/auth/guestAdoptionStatus";
import {
  guestAdoptionReceiptSchema,
  validateGuestAdoptionReceipt,
} from "@/domain/auth/guestAdoptionReceipt";
import { mapGuestAdoptionCommandIdentity } from "@/domain/auth/guestAdoptionIdentityMapping";
import { coreHashValue } from "@/domain/trip/tripCoreV2Read";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
import {
  guestSourceCheckpointSchema,
  verifyGuestSourceCheckpoint,
} from "./guestTripP1SourceSchema";
import {
  guestAdoptionPreparationSchema,
  verifyGuestAdoptionDrafts,
} from "./guestAdoptionPreparation";

// Pure recovery qualification. The owning authenticated reader/restore must still
// prove server provenance; this function never changes a Session or Guest hold.
export async function qualifyGuestAdoptionReceiptForRecovery(
  rawReceipt: unknown,
  rawCheckpoint: unknown,
  rawExpected: unknown,
  rawStatus: unknown,
  hash: (bytes: Uint8Array) => Promise<string>,
) {
  const expected = guestAdoptionStatusRequestSchema.parse(rawExpected);
  const receiptSnapshot = guestAdoptionReceiptSchema.parse(rawReceipt);
  const status = guestAdoptionStatusResultSchema.parse(rawStatus);
  const checkpoint = guestSourceCheckpointSchema.parse(rawCheckpoint);
  const preparation = guestAdoptionPreparationSchema.parse(
    JSON.parse(checkpoint.canonicalText),
  );
  const canonical = (value: unknown) => canonicalCoreJson(value as Json);
  if (
    canonical(preparation) !== checkpoint.canonicalText ||
    new TextEncoder().encode(checkpoint.canonicalText).byteLength !== checkpoint.bytes ||
    (await hash(new TextEncoder().encode(checkpoint.canonicalText))) !== checkpoint.sha256
  )
    throw Error("GUEST_ADOPTION_RECEIPT_PREPARATION_CORRUPT");
  if (
    canonical(expected) !==
    canonical({
      contractVersion: 1,
      adoptionId: preparation.adoptionId,
      sourceGuestLocalId: preparation.sourceGuestLocalId,
      targetAccountId: preparation.targetAccountId,
      inventorySha256: preparation.inventorySha256,
    })
  )
    throw Error("GUEST_ADOPTION_RECEIPT_LOCAL_BINDING_MISMATCH");
  if (
    preparation.schemaId !== "otr.auth.guest-adoption-recovery/3" ||
    !preparation.source
  )
    throw Error("GUEST_ADOPTION_RECEIPT_SOURCE_REQUIRED");
  await verifyGuestAdoptionDrafts(preparation);
  const source = await verifyGuestSourceCheckpoint(preparation.source, preparation);
  const receipt = await validateGuestAdoptionReceipt(receiptSnapshot, expected, hash);
  if (status.status !== "PUBLISHED" && status.status !== "CANCELLED")
    throw Error("GUEST_ADOPTION_TERMINAL_STATUS_REQUIRED");
  const statusBinding = Object.fromEntries(
    Object.keys(expected).map((key) => [key, status[key as keyof typeof status]]),
  );
  if (
    canonical(statusBinding) !== canonical(expected) ||
    status.status !== receipt.outcome ||
    status.receipt.receiptId !== receipt.receiptId ||
    status.receipt.receiptSha256 !== receipt.receiptSha256
  )
    throw Error("GUEST_ADOPTION_RECEIPT_STATUS_MISMATCH");
  if (receipt.outcome === "CANCELLED") {
    if (
      receipt.preparationSha256 !== null &&
      receipt.preparationSha256 !== checkpoint.sha256
    )
      throw Error("GUEST_ADOPTION_RECEIPT_PREPARATION_MISMATCH");
    return Object.freeze({
      receipt,
      authority: "NONE" as const,
      nextAction: "VERIFY_CANCELLATION_RECORD" as const,
    });
  }
  if (preparation.drafts.length) throw Error("GUEST_ADOPTION_DRAFT_RESTORE_REQUIRED");
  if (receipt.preparationSha256 !== checkpoint.sha256)
    throw Error("GUEST_ADOPTION_RECEIPT_PREPARATION_MISMATCH");
  const fail = () => {
    throw Error("GUEST_ADOPTION_RECEIPT_COVERAGE_MISMATCH");
  };
  if (receipt.trips.length !== source.trips.length) fail();
  for (const original of source.trips) {
    const target = receipt.trips.find((trip) => trip.tripId === original.create.tripId);
    if (!target) throw Error("GUEST_ADOPTION_RECEIPT_COVERAGE_MISMATCH");
    if (
      target.createOperationId !== original.create.operationId ||
      target.sourceCreatorPersonId !== original.creator.personId
    )
      fail();
    const personIds = [
      original.creator.personId,
      ...original.people.map((person) => person.personId),
    ].sort();
    if (
      canonical(personIds) !==
      canonical(target.personMappings.map((person) => person.sourcePersonId).sort())
    )
      fail();
    const operations = [
      {
        queueId: original.create.operationId,
        operationId: original.create.operationId,
        kind: "TRIP_CREATE",
      },
      ...original.people.map((person) => ({
        queueId: person.operationId,
        operationId: person.operationId,
        kind: "PERSON_CREATE",
      })),
      ...original.deferredMetadata.map((action) => ({
        queueId: action.actionId,
        operationId: action.operationId,
        kind: "TRIP_METADATA_DEFERRED",
      })),
      ...original.coreIntents.map(({ command }) => ({
        queueId: command.operationId,
        operationId: command.operationId,
        kind: "CORE",
      })),
    ];
    if (operations.length !== target.operations.length) fail();
    for (const operation of operations) {
      const actual = target.operations.find((op) => op.queueId === operation.queueId);
      if (
        !actual ||
        actual.operationId !== operation.operationId ||
        actual.kind !== operation.kind
      )
        fail();
    }
    const people = new Map(
      target.personMappings.map((person) => [
        person.sourcePersonId,
        person.targetPersonId,
      ]),
    );
    for (const intent of original.coreIntents) {
      const operation = target.operations.find(
        (op) => op.operationId === intent.command.operationId,
      )!;
      const mapped = mapGuestAdoptionCommandIdentity(intent.command, people);
      if (
        operation.sourceIntentSha256 !== intent.sha256 ||
        operation.mappedIntentSha256 !==
          (await coreHashValue("otr-trip-core-intent-v2", mapped, hash))
      )
        fail();
    }
  }
  return Object.freeze({
    receipt,
    authority: "NONE" as const,
    nextAction: "VERIFY_PUBLISHED_READBACK" as const,
  });
}
