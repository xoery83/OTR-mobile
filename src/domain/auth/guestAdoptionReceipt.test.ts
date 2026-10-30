import { createHash, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { coreHashValue } from "../trip/tripCoreV2Read";
import type { Json } from "../trip/tripCoreV2Json";
import {
  validateGuestAdoptionReceipt,
  validateGuestAdoptionCancellationReceipt,
  type GuestAdoptionReceipt,
} from "./guestAdoptionReceipt";
const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
function fixture() {
  const expected = {
    contractVersion: 1 as const,
    adoptionId: randomUUID(),
    sourceGuestLocalId: randomUUID(),
    targetAccountId: randomUUID(),
    inventorySha256: "a".repeat(64),
  };
  const creator = randomUUID(),
    owner = randomUUID(),
    create = randomUUID(),
    core = randomUUID();
  const body: Omit<
    Extract<GuestAdoptionReceipt, { outcome: "PUBLISHED" }>,
    "receiptSha256"
  > = {
    ...expected,
    schemaId: "otr.auth.guest-adoption-receipt/1" as const,
    receiptId: randomUUID(),
    grantId: randomUUID(),
    policyVersion: "unpriced/1",
    recordedAt: "2026-10-01T00:00:00.000Z",
    outcome: "PUBLISHED" as const,
    preparationSha256: "b".repeat(64),
    planSha256: "c".repeat(64),
    executionSha256: "d".repeat(64),
    trips: [
      {
        tripId: randomUUID(),
        createOperationId: create,
        sourceCreatorPersonId: creator,
        ownerPersonId: owner,
        personMappings: [{ sourcePersonId: creator, targetPersonId: owner }],
        operations: [
          {
            queueId: create,
            operationId: create,
            kind: "TRIP_CREATE" as const,
            domainReceiptId: null,
            sourceIntentSha256: null,
            mappedIntentSha256: null,
            owningReceiptSha256: "e".repeat(64),
          },
          {
            queueId: core,
            operationId: core,
            kind: "CORE" as const,
            domainReceiptId: randomUUID(),
            sourceIntentSha256: "a".repeat(64),
            mappedIntentSha256: "b".repeat(64),
            owningReceiptSha256: "f".repeat(64),
          },
        ],
        ledgerSnapshotSha256: "0".repeat(64),
      },
    ],
  };
  return { expected, body };
}
async function seal<T extends object>(body: T) {
  return {
    ...body,
    receiptSha256: await coreHashValue(
      "otr-auth-guest-adoption-receipt-v1",
      body as Json,
      hash,
    ),
  };
}
it("validates an immutable publication long after its operational grant lifetime", async () => {
  const f = fixture();
  expect(
    (await validateGuestAdoptionReceipt(await seal(f.body), f.expected, hash)).outcome,
  ).toBe("PUBLISHED");
});
it("decodes a cancellation before source staging without inventing a preparation hash", async () => {
  const f = fixture();
  const { trips: _trips, executionSha256: _execution, ...common } = f.body;
  const body = {
    ...common,
    outcome: "CANCELLED",
    preparationSha256: null,
    planSha256: null,
  };
  expect(
    (await validateGuestAdoptionReceipt(await seal(body), f.expected, hash)).outcome,
  ).toBe("CANCELLED");
});
it.each([
  "targetAccountId",
  "sourceGuestLocalId",
  "adoptionId",
  "inventorySha256",
] as const)("rejects a validly hashed receipt with different %s", async (key) => {
  const f = fixture();
  Object.assign(f.body, {
    [key]: key === "inventorySha256" ? "1".repeat(64) : randomUUID(),
  });
  await expect(
    validateGuestAdoptionReceipt(await seal(f.body), f.expected, hash),
  ).rejects.toThrow("BINDING_MISMATCH");
});
it("rejects a changed body even when the actor tuple still matches", async () => {
  const f = fixture(),
    sealed = await seal(f.body);
  sealed.policyVersion = "changed";
  await expect(validateGuestAdoptionReceipt(sealed, f.expected, hash)).rejects.toThrow(
    "HASH_MISMATCH",
  );
});
it.each([
  "duplicate-trip",
  "wrong-owner",
  "linked-other-person",
  "duplicate-queue",
  "missing-core-receipt",
])(
  "rejects structurally unsafe references %s even with a self-consistent hash",
  async (kind) => {
    const f = fixture(),
      trip = f.body.trips[0];
    if (kind === "duplicate-trip") f.body.trips.push(structuredClone(trip));
    if (kind === "wrong-owner") trip.personMappings[0].targetPersonId = randomUUID();
    if (kind === "linked-other-person")
      trip.personMappings.push({
        sourcePersonId: randomUUID(),
        targetPersonId: randomUUID(),
      });
    if (kind === "duplicate-queue")
      trip.operations[1].queueId = trip.operations[0].queueId;
    if (kind === "missing-core-receipt")
      Object.assign(trip.operations[1], { domainReceiptId: null });
    await expect(
      validateGuestAdoptionReceipt(await seal(f.body), f.expected, hash),
    ).rejects.toThrow();
  },
);
it("preserves a deferred action queue ID distinct from its cloud operation", async () => {
  const f = fixture();
  f.body.trips[0].operations.push({
    kind: "TRIP_METADATA_DEFERRED",
    queueId: randomUUID(),
    operationId: randomUUID(),
    domainReceiptId: null,
    sourceIntentSha256: null,
    mappedIntentSha256: null,
    owningReceiptSha256: "e".repeat(64),
  });
  const result = await validateGuestAdoptionReceipt(await seal(f.body), f.expected, hash);
  expect(result.outcome).toBe("PUBLISHED");
});

it("rejects a deferred command identity reused as another operation's queue identity", async () => {
  const f = fixture();
  f.body.trips[0].operations.push({
    kind: "TRIP_METADATA_DEFERRED",
    queueId: randomUUID(),
    operationId: f.body.trips[0].operations[0].queueId,
    domainReceiptId: null,
    sourceIntentSha256: null,
    mappedIntentSha256: null,
    owningReceiptSha256: "e".repeat(64),
  });
  await expect(
    validateGuestAdoptionReceipt(await seal(f.body), f.expected, hash),
  ).rejects.toThrow();
});

it("rejects cross-Trip creator substitution even when each source and target is unique", async () => {
  const f = fixture(),
    a = f.body.trips[0],
    b = structuredClone(a);
  b.tripId = randomUUID();
  b.sourceCreatorPersonId = randomUUID();
  a.ownerPersonId = b.sourceCreatorPersonId;
  a.personMappings[0].targetPersonId = a.ownerPersonId;
  b.ownerPersonId = a.sourceCreatorPersonId;
  b.personMappings = [
    { sourcePersonId: b.sourceCreatorPersonId, targetPersonId: b.ownerPersonId },
  ];
  for (const op of b.operations) {
    op.operationId = randomUUID();
    op.queueId = op.operationId;
    if (op.domainReceiptId) op.domainReceiptId = randomUUID();
  }
  b.createOperationId = b.operations[0].operationId;
  f.body.trips.push(b);
  await expect(
    validateGuestAdoptionReceipt(await seal(f.body), f.expected, hash),
  ).rejects.toThrow("REFERENCES_INVALID");
});

it("does not mistake a valid PUBLISHED receipt for successful cancellation", async () => {
  const f = fixture(),
    receipt = await seal(f.body);
  await expect(validateGuestAdoptionReceipt(receipt, f.expected, hash)).resolves.toEqual(
    receipt,
  );
  await expect(
    validateGuestAdoptionCancellationReceipt(receipt, f.expected, hash),
  ).rejects.toThrow("CANCELLATION_OUTCOME_INVALID");
});
