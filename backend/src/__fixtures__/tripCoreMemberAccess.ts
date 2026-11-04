import { randomUUID, createHash } from "node:crypto";
import { coreHashValue } from "../../../src/domain/trip/tripCoreV2Read";
const hash = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
export const actor = randomUUID(),
  trip = randomUUID(),
  epoch = randomUUID();
export const memberCommand = () => ({
  contractVersion: 2 as const,
  intentVersion: 2 as const,
  operationId: randomUUID(),
  tripId: trip,
  command: "REVOKE_LINKED_MEMBER_ACCESS" as const,
  target: { kind: "TRIP_ACCESS" as const, id: trip },
  baseVector: [{ kind: "TRIP_ACCESS" as const, id: trip, revision: 7 }] as [
    { kind: "TRIP_ACCESS"; id: string; revision: number },
  ],
  admission: { mode: "MANUAL" as const, sourceIntentId: null, policyVersion: null },
  payload: { personId: randomUUID(), targetAccountId: randomUUID(), coreEpoch: epoch },
});
export async function memberReceipt(q = memberCommand(), outcome = "APPLIED") {
  const applied = outcome === "APPLIED",
    failed = outcome === "CONFLICT" || outcome === "REJECTED";
  const body = {
    receiptVersion: 2,
    commandVersion: 2,
    intentVersion: 2,
    actorAccountId: actor,
    tripId: trip,
    operationId: q.operationId,
    command: q.command,
    intentSha256: await coreHashValue("otr-trip-core-intent-v2", q, hash),
    targetVector: [
      {
        kind: "TRIP_ACCESS",
        id: trip,
        baseRevision: 7,
        committedRevision: failed ? null : applied ? 8 : 7,
      },
    ],
    outcome,
    result: {
      created: [],
      changed: [],
      retiredEdges: [],
      replacement: null,
      custodyGrantId: null,
    },
    errorCode: failed ? "REVISION_CONFLICT" : null,
    committedAt: "2026-11-04T00:00:00.123456Z",
    audit: { before: [], after: [], evidenceRefs: [], authorizationRefs: [] },
    accessTransition: failed
      ? null
      : {
          personId: q.payload.personId,
          targetAccountId: q.payload.targetAccountId,
          before: { epoch, revision: 10, accessRevision: 7 },
          after: { epoch, revision: applied ? 11 : 10, accessRevision: applied ? 8 : 7 },
        },
  };
  return {
    ...body,
    receiptSha256: await coreHashValue("otr-trip-core-receipt-v2", body, hash),
  };
}
