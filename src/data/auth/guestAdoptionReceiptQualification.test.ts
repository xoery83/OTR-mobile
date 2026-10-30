import { createHash, randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { fixture } from "../../../backend/src/guestAdoptionCompositePlan.fixture";
import { coreHashValue } from "@/domain/trip/tripCoreV2Read";
import { validateCoreCommand } from "@/domain/trip/tripCoreV2Commands";
import type { Json } from "@/domain/trip/tripCoreV2Json";
import { mapGuestAdoptionCommandIdentity } from "@/domain/auth/guestAdoptionIdentityMapping";
import type { GuestAdoptionReceipt } from "@/domain/auth/guestAdoptionReceipt";
import { qualifyGuestAdoptionReceiptForRecovery } from "./guestAdoptionReceiptQualification";
const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
afterEach(() => vi.useRealTimers());
async function setup() {
  const f = fixture(),
    checkpoint = await f.source(),
    owner = randomUUID(),
    source = f.body.trips[0];
  const mappings = [{ sourcePersonId: source.creator.personId, targetPersonId: owner }];
  const mapped = mapGuestAdoptionCommandIdentity(
    validateCoreCommand(source.coreIntents[0].command),
    new Map(mappings.map((p) => [p.sourcePersonId, p.targetPersonId])),
  );
  const expected = {
    contractVersion: 1 as const,
    adoptionId: f.grant.adoptionId,
    sourceGuestLocalId: f.grant.sourceGuestLocalId,
    targetAccountId: f.user.id,
    inventorySha256: f.grant.inventorySha256,
  };
  const body: Omit<
    Extract<GuestAdoptionReceipt, { outcome: "PUBLISHED" }>,
    "receiptSha256"
  > = {
    ...expected,
    schemaId: "otr.auth.guest-adoption-receipt/1",
    receiptId: randomUUID(),
    grantId: f.grant.grantId,
    policyVersion: f.grant.policyVersion,
    recordedAt: "2026-10-01T00:00:00.000Z",
    outcome: "PUBLISHED",
    preparationSha256: checkpoint.sha256,
    planSha256: "c".repeat(64),
    executionSha256: "d".repeat(64),
    trips: [
      {
        tripId: source.create.tripId,
        createOperationId: source.create.operationId,
        sourceCreatorPersonId: source.creator.personId,
        ownerPersonId: owner,
        personMappings: mappings,
        ledgerSnapshotSha256: "e".repeat(64),
        operations: [
          {
            queueId: source.create.operationId,
            operationId: source.create.operationId,
            kind: "TRIP_CREATE",
            domainReceiptId: null,
            owningReceiptSha256: "f".repeat(64),
            sourceIntentSha256: null,
            mappedIntentSha256: null,
          },
          {
            queueId: mapped.operationId,
            operationId: mapped.operationId,
            kind: "CORE",
            domainReceiptId: randomUUID(),
            owningReceiptSha256: "1".repeat(64),
            sourceIntentSha256: source.coreIntents[0].sha256,
            mappedIntentSha256: await coreHashValue(
              "otr-trip-core-intent-v2",
              mapped,
              hash,
            ),
          },
        ],
      },
    ],
  };
  const seal = async <T extends object>(value: T) => ({
    ...value,
    receiptSha256: await coreHashValue(
      "otr-auth-guest-adoption-receipt-v1",
      value as Json,
      hash,
    ),
  });
  const status = (receipt: {
    outcome: string;
    receiptId: string;
    receiptSha256: string;
  }) => ({
    ...expected,
    status: receipt.outcome,
    nextAction:
      receipt.outcome === "PUBLISHED"
        ? "READ_PUBLICATION_RECEIPT"
        : "READ_CANCELLATION_RECEIPT",
    receipt: { receiptId: receipt.receiptId, receiptSha256: receipt.receiptSha256 },
  });
  const run = async () => {
    const receipt = await seal(body);
    return qualifyGuestAdoptionReceiptForRecovery(
      receipt,
      checkpoint,
      expected,
      status(receipt),
      hash,
    );
  };
  return { f, checkpoint, expected, body, seal, status, run };
}
it("matches all original operations and explicit Person leaves without issuing restoration authority", async () => {
  const f = await setup(),
    before = structuredClone(f.checkpoint);
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 86400000);
  const result = await f.run();
  expect(result.nextAction).toBe("VERIFY_PUBLISHED_READBACK");
  expect(result.authority).toBe("NONE");
  expect(f.checkpoint).toEqual(before);
});
it.each([
  "missing-operation",
  "extra-person",
  "wrong-source-intent",
  "wrong-mapped-intent",
])("rejects a self-consistently hashed but incomplete/wrong receipt %s", async (kind) => {
  const f = await setup(),
    trip = f.body.trips[0];
  if (kind === "missing-operation") trip.operations.pop();
  if (kind === "extra-person") {
    const id = randomUUID();
    trip.personMappings.push({ sourcePersonId: id, targetPersonId: id });
  }
  if (kind === "wrong-source-intent")
    trip.operations[1].sourceIntentSha256 = "2".repeat(64);
  if (kind === "wrong-mapped-intent")
    trip.operations[1].mappedIntentSha256 = "2".repeat(64);
  await expect(f.run()).rejects.toThrow("COVERAGE_MISMATCH");
});
it("refuses a different active Guest frame even when the requested Account is unchanged", async () => {
  const f = await setup();
  f.expected.sourceGuestLocalId = randomUUID();
  await expect(f.run()).rejects.toThrow("LOCAL_BINDING_MISMATCH");
});
it("refuses corrupted preparation bytes before any receipt can qualify", async () => {
  const f = await setup();
  f.checkpoint.bytes++;
  await expect(f.run()).rejects.toThrow("PREPARATION_CORRUPT");
});
it("allows integrity qualification of a before-stage cancellation but still requires the server record", async () => {
  const f = await setup();
  const { trips: _trips, executionSha256: _execution, ...common } = f.body;
  const cancelled = {
    ...common,
    outcome: "CANCELLED",
    preparationSha256: null,
    planSha256: null,
  };
  const receipt = await f.seal(cancelled);
  const result = await qualifyGuestAdoptionReceiptForRecovery(
    receipt,
    f.checkpoint,
    f.expected,
    f.status(receipt),
    hash,
  );
  expect(result.nextAction).toBe("VERIFY_CANCELLATION_RECORD");
  expect(result.authority).toBe("NONE");
});

it("rejects a cancellation referring to a different staged preparation", async () => {
  const f = await setup();
  const { trips: _trips, executionSha256: _execution, ...common } = f.body;
  const cancelled = {
    ...common,
    outcome: "CANCELLED",
    preparationSha256: "4".repeat(64),
  };
  const receipt = await f.seal(cancelled);
  await expect(
    qualifyGuestAdoptionReceiptForRecovery(
      receipt,
      f.checkpoint,
      f.expected,
      f.status(receipt),
      hash,
    ),
  ).rejects.toThrow("PREPARATION_MISMATCH");
});

it.each(["NOT_FOUND", "IN_PROGRESS"])(
  "never releases UNKNOWN recovery from %s",
  async (state) => {
    const f = await setup(),
      receipt = await f.seal(f.body);
    await expect(
      qualifyGuestAdoptionReceiptForRecovery(
        receipt,
        f.checkpoint,
        f.expected,
        { ...f.expected, status: state, nextAction: "QUERY_SERVER_STATUS" },
        hash,
      ),
    ).rejects.toThrow("TERMINAL_STATUS_REQUIRED");
  },
);
it("rejects a valid receipt whose pointer does not match the terminal status read", async () => {
  const f = await setup(),
    receipt = await f.seal(f.body),
    status = f.status(receipt);
  status.receipt.receiptId = randomUUID();
  await expect(
    qualifyGuestAdoptionReceiptForRecovery(
      receipt,
      f.checkpoint,
      f.expected,
      status,
      hash,
    ),
  ).rejects.toThrow("STATUS_MISMATCH");
});

it("snapshots all caller evidence before asynchronous hashing", async () => {
  const f = await setup(),
    receipt = await f.seal(f.body),
    status = f.status(receipt);
  let first = true;
  const result = await qualifyGuestAdoptionReceiptForRecovery(
    receipt,
    f.checkpoint,
    f.expected,
    status,
    async (bytes) => {
      if (first) {
        first = false;
        receipt.receiptId = randomUUID();
        status.receipt.receiptId = receipt.receiptId;
        status.receipt.receiptSha256 = "9".repeat(64);
      }
      return hash(bytes);
    },
  );
  expect(result.receipt.receiptId).not.toBe(receipt.receiptId);
  expect(result.authority).toBe("NONE");
});
