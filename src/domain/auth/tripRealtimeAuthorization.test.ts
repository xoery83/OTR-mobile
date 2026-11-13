import { expect, it } from "vitest";
import { tripRealtimeRevocationFromTransition } from "./tripRealtimeAuthorization";

const accountId = "11111111-1111-4111-8111-111111111111";
const tripId = "22222222-2222-4222-8222-222222222222";
const receipt = {
  receiptId: "33333333-3333-4333-8333-333333333333",
  operationId: "44444444-4444-4444-8444-444444444444",
  accountId,
  tripId,
  actorPersonId: "55555555-5555-4555-8555-555555555555",
  kind: "REVOKED",
  previousGeneration: 1,
  membershipGeneration: 2,
};
const enforced = {
  receipt,
  receiptState: "COMMITTED",
  enforcement: "SERVER_GENERATION_FENCE_AND_DISCONNECT",
};
const scope = { accountId, tripId };

it.each(["SERVER_GENERATION_FENCE_AND_DISCONNECT", "UNCONFIRMED"])("maps committed access loss independently of transport status %s", (enforcement) => {
  const result = tripRealtimeRevocationFromTransition({ ...enforced, enforcement }, scope);
  expect(result).toEqual({ ...scope, receiptId: receipt.receiptId, authorizationRevision: 2 });
  expect(Object.isFrozen(result)).toBe(true);
});

it.each([
  { receipt },
  { ...enforced, receiptState: "UNCONFIRMED" },
  { ...enforced, receipt: { ...receipt, kind: "REGRANTED" } },
  { ...enforced, receipt: { ...receipt, accountId: receipt.operationId } },
  { ...enforced, receipt: { ...receipt, tripId: receipt.operationId } },
  { ...enforced, receipt: { ...receipt, membershipGeneration: 1 } },
  { ...enforced, receipt: { ...receipt, receiptId: "00000000-0000-0000-0000-000000000000" } },
  { ...enforced, receipt: { ...receipt, coreAccessRevision: 2 } },
])("refuses uncommitted, foreign, stale or cross-domain transition input %#", (raw) => {
  expect(() => tripRealtimeRevocationFromTransition(raw, scope)).toThrow();
});
