import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import template from "../../docs/ops/auth-c04-20261103/finite-qa-candidate/QA_CASE_TEMPLATE.json";
import { createMemberClaimQaReadback } from "../../scripts/auth/member-claim-qa-readback";
import { memberClaimIntentDigest } from "./tripMemberClaimAuthority";
import type { MemberClaimCommand } from "../../src/data/api/memberClaimContracts";

const qa = {
  ...template.qaCase,
  projectRef: "tuqigdxrvrerfewsxqgm" as const,
  opensAt: "2026-11-03T00:00:00Z",
  inviteExpiresAt: "2026-11-03T00:10:00Z",
  closesAt: "2026-11-03T00:30:00Z",
};
const preflight = {
  tripOwnedByA: true,
  ownerPersonLinkedToA: true,
  targetNeverLinked: true,
  bLinkedPeople: 0,
  originalReceipts: 0,
  directedInvites: 0,
  targetPaymentRecords: 0,
  targetPaymentGrants: 0,
  removedAccounts: 0,
  claimFunctionPresent: true,
};
function fixture() {
  const query = vi.fn(async (_sql: string): Promise<unknown> => ({
    rows: [{ result: { ...preflight } }],
  }));
  return { query, port: createMemberClaimQaReadback(qa, query) };
}

it("limits preflight to one fixed QA SELECT snapshot with no profile or financial original", async () => {
  const f = fixture();
  expect(await f.port.preflight(qa)).toEqual(preflight);
  expect(f.query).toHaveBeenCalledOnce();
  const sql = f.query.mock.calls[0][0];
  expect(sql).toContain(qa.tripId);
  expect(sql).toContain(qa.claimOperationId);
  expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|GRANT|ALTER|token|password|email)\b/i);
});

it.each([
  "bLinkedPeople",
  "originalReceipts",
  "directedInvites",
  "targetPaymentRecords",
  "targetPaymentGrants",
  "removedAccounts",
])("rejects unexpected %s rather than clearing it", async (key) => {
  const f = fixture();
  f.query.mockResolvedValue({ rows: [{ result: { ...preflight, [key]: 1 } }] });
  await expect(f.port.preflight(qa)).rejects.toThrow();
  expect(f.query).toHaveBeenCalledOnce();
});

it("rejects another case or altered activation bounds before SQL", async () => {
  const f = fixture();
  expect(() =>
    createMemberClaimQaReadback({ ...qa, tripId: randomUUID() }, f.query),
  ).toThrow("FIXED_CASE_REQUIRED");
  await expect(
    f.port.preflight({ ...qa, closesAt: "2026-11-03T00:29:00Z" }),
  ).rejects.toThrow("CASE_MISMATCH");
  expect(f.query).not.toHaveBeenCalled();
});

it("binds independent receipt to fixed command/actor/digest and exact three-key query", async () => {
  const f = fixture();
  const command: MemberClaimCommand = {
    kind: "CLAIM_PERSON",
    operationId: qa.claimOperationId,
    tripId: qa.tripId,
    personId: qa.personId,
    inviteId: randomUUID(),
    explicitConsent: true,
  };
  const receipt = {
    operationId: command.operationId,
    actorAccountId: qa.claimantAccountId,
    tripId: qa.tripId,
    personId: qa.personId,
    inviteId: command.inviteId,
    intentDigest: memberClaimIntentDigest(command),
    outcome: "LINKED",
  };
  f.query.mockResolvedValue({ rows: [{ result: receipt }] });
  expect(await f.port.readReceipt(command, qa.claimantAccountId)).toEqual(receipt);
  const sql = f.query.mock.calls[0][0];
  expect(sql).toContain(`operation_id='${qa.claimOperationId}'::uuid`);
  expect(sql).toContain(`actor_account_id='${qa.claimantAccountId}'::uuid`);
  expect(sql).toContain(`trip_id='${qa.tripId}'::uuid`);
  f.query.mockResolvedValue({
    rows: [{ result: { ...receipt, intentDigest: "0".repeat(64) } }],
  });
  await expect(f.port.readReceipt(command, qa.claimantAccountId)).rejects.toThrow(
    "RECEIPT_MISMATCH",
  );
  f.query.mockResolvedValue({ rows: [{ result: null }] });
  await expect(f.port.readReceipt(command, qa.claimantAccountId)).rejects.toThrow();
});

it("rejects new operations, wrong actor and Revoke before SQL", async () => {
  const f = fixture();
  const command: MemberClaimCommand = {
    kind: "CLAIM_PERSON",
    operationId: qa.claimOperationId,
    tripId: qa.tripId,
    personId: qa.personId,
    inviteId: randomUUID(),
    explicitConsent: true,
  };
  await expect(
    f.port.readReceipt({ ...command, operationId: randomUUID() }, qa.claimantAccountId),
  ).rejects.toThrow("COMMAND_MISMATCH");
  await expect(f.port.readReceipt(command, qa.ownerAccountId)).rejects.toThrow(
    "COMMAND_MISMATCH",
  );
  await expect(
    f.port.readReceipt(
      {
        kind: "REVOKE_UNCLAIMED_INVITE",
        operationId: qa.claimOperationId,
        tripId: qa.tripId,
        personId: qa.personId,
        inviteId: command.inviteId,
      },
      qa.claimantAccountId,
    ),
  ).rejects.toThrow();
  expect(f.query).not.toHaveBeenCalled();
});

it("fails closed on query failure or ambiguous row envelopes", async () => {
  const f = fixture();
  f.query.mockRejectedValue(Error("READBACK_UNAVAILABLE"));
  await expect(f.port.preflight(qa)).rejects.toThrow("READBACK_UNAVAILABLE");
  f.query.mockResolvedValue({ rows: [] });
  await expect(f.port.preflight(qa)).rejects.toThrow();
});

it("reads only Owner's original ISSUE for registered B and rejects another target", async () => {
  const f = fixture();
  const command: MemberClaimCommand = {
    kind: "ISSUE_TARGETED_INVITE",
    operationId: qa.issueOperationId,
    tripId: qa.tripId,
    personId: qa.personId,
    target: { kind: "REGISTERED_ACCOUNT", accountId: qa.claimantAccountId },
  };
  const receipt = {
    operationId: command.operationId,
    actorAccountId: qa.ownerAccountId,
    tripId: qa.tripId,
    personId: qa.personId,
    inviteId: randomUUID(),
    intentDigest: memberClaimIntentDigest(command),
    outcome: "ISSUED",
  };
  f.query.mockResolvedValue({ rows: [{ result: receipt }] });
  expect(await f.port.readReceipt(command, qa.ownerAccountId)).toEqual(receipt);
  await expect(
    f.port.readReceipt(
      { ...command, target: { kind: "REGISTERED_ACCOUNT", accountId: randomUUID() } },
      qa.ownerAccountId,
    ),
  ).rejects.toThrow("COMMAND_MISMATCH");
  expect(f.query).toHaveBeenCalledOnce();
});
