import { expect, it, vi } from "vitest";
import {
  executeMemberClaim,
  memberClaimIntentDigest,
  type MemberClaimAuthorityPort,
  type MemberClaimTransaction,
} from "./tripMemberClaimAuthority";
import { recoverMemberClaimReceipt } from "./tripMemberClaimRecovery";
const tripId = "11111111-1111-4111-8111-111111111111";
const personId = "22222222-2222-4222-8222-222222222222";
const actor = "33333333-3333-4333-8333-333333333333";
const other = "44444444-4444-4444-8444-444444444444";
const inviteId = "55555555-5555-4555-8555-555555555555";
const operationId = "66666666-6666-4666-8666-666666666666";
const command = {
  kind: "ISSUE_TARGETED_INVITE" as const,
  tripId,
  personId,
  operationId,
  target: { kind: "REGISTERED_ACCOUNT" as const, accountId: other },
};
const receipt = () => ({
  tripId,
  personId,
  actorAccountId: actor,
  operationId,
  inviteId,
  intentDigest: memberClaimIntentDigest(command),
  outcome: "ISSUED" as const,
});
function fixture(raw: unknown = receipt()) {
  const issue = vi.fn(async () => ({ inviteId, expiresAt: "2026-11-03T00:00:00Z" }));
  const link = vi.fn();
  const revoke = vi.fn();
  const save = vi.fn();
  const tx = {
    currentEffectiveAccess: vi.fn(async () => "NONE"),
    receipt: vi.fn(async () => raw),
    issue,
    link,
    revokeUnclaimed: revoke,
    saveReceipt: save,
  } as unknown as MemberClaimTransaction;
  const port: MemberClaimAuthorityPort = { atomic: async (_scope, work) => work(tx) };
  return { port, tx, issue, link, revoke, save };
}
it("is closed without the owning port and rejects invalid input before reads", async () => {
  expect(await recoverMemberClaimReceipt(command, actor)).toEqual({
    status: "UNAVAILABLE",
  });
  const f = fixture();
  expect(
    await recoverMemberClaimReceipt({ ...command, operationId: "bad" }, actor, f.port),
  ).toEqual({ status: "INVALID" });
  expect(f.tx.receipt).not.toHaveBeenCalled();
});
it("reads the original receipt with current denial without issuing or granting anything", async () => {
  const f = fixture();
  expect(await recoverMemberClaimReceipt(command, actor, f.port)).toEqual({
    status: "ISSUED",
    personId,
    inviteId,
    currentAccess: "NONE",
  });
  expect(f.issue).not.toHaveBeenCalled();
  expect(f.link).not.toHaveBeenCalled();
  expect(f.revoke).not.toHaveBeenCalled();
  expect(f.save).not.toHaveBeenCalled();
});
it("reports absence without attempting a retry", async () => {
  const f = fixture(null);
  expect(await recoverMemberClaimReceipt(command, actor, f.port)).toEqual({
    status: "ABSENT_UNCONFIRMED",
  });
  expect(f.issue).not.toHaveBeenCalled();
});
it.each([
  "tripId",
  "personId",
  "actorAccountId",
  "operationId",
  "intentDigest",
  "inviteId",
])("never discloses a mismatched %s receipt", async (field) => {
  const original = {
    tripId,
    personId,
    operationId,
    kind: "CLAIM_PERSON" as const,
    inviteId,
    explicitConsent: true as const,
  };
  const good = {
    ...receipt(),
    outcome: "LINKED",
    intentDigest: memberClaimIntentDigest(original),
  };
  const f = fixture({
    ...good,
    [field]: field === "intentDigest" ? "a".repeat(64) : other,
  });
  expect(await recoverMemberClaimReceipt(original, actor, f.port)).toEqual({
    status: "CONFLICT",
  });
  expect(f.link).not.toHaveBeenCalled();
});
it("fails closed for malformed receipt or incompatible outcome", async () => {
  for (const raw of [
    { ...receipt(), outcome: "ROOT" },
    { ...receipt(), outcome: "LINKED" },
  ]) {
    const f = fixture(raw);
    expect(await recoverMemberClaimReceipt(command, actor, f.port)).toEqual({
      status: "UNAVAILABLE",
    });
  }
});
it("recovers a committed invite after a lost reply using its original identity only", async () => {
  let stored: Awaited<ReturnType<MemberClaimTransaction["receipt"]>> = null;
  const f = fixture(null);
  f.tx.currentTime = async () => "2026-11-02T00:00:00Z";
  f.tx.currentOrganizerAuthority = async () => true;
  f.tx.personLinkedAccount = async () => null;
  f.tx.receipt = async () => stored;
  f.tx.saveReceipt = async (value) => {
    stored = value;
  };
  let loseReply = true;
  f.port.atomic = async (_scope, work) => {
    const result = await work(f.tx);
    if (loseReply) {
      loseReply = false;
      throw Error("LOST_REPLY_AFTER_COMMIT");
    }
    return result;
  };
  expect(await executeMemberClaim(command, actor, f.port)).toEqual({
    status: "UNAVAILABLE",
  });
  expect(await recoverMemberClaimReceipt(command, actor, f.port)).toMatchObject({
    status: "ISSUED",
    inviteId,
    personId,
  });
  expect(f.issue).toHaveBeenCalledTimes(1);
  expect(
    await recoverMemberClaimReceipt(
      { ...command, target: { kind: "REGISTERED_ACCOUNT", accountId: actor } },
      actor,
      f.port,
    ),
  ).toEqual({ status: "CONFLICT" });
  expect(f.issue).toHaveBeenCalledTimes(1);
});

it("recovers a linked Claim after a lost reply without relinking or asserting current access", async () => {
  const original = {
    kind: "CLAIM_PERSON" as const,
    tripId,
    personId,
    operationId,
    inviteId,
    explicitConsent: true as const,
  };
  let stored: Awaited<ReturnType<MemberClaimTransaction["receipt"]>> = null;
  const f = fixture(null);
  f.tx.currentTime = async () => "2026-11-02T00:00:00Z";
  f.tx.personLinkedAccount = async () => null;
  f.tx.accountLinkedPerson = async () => null;
  f.tx.exactOrganizerApproval = async () => true;
  f.tx.accountAccessDenied = async () => false;
  f.tx.invite = async () => ({
    id: inviteId,
    tripId,
    personId,
    target: { kind: "REGISTERED_ACCOUNT", accountId: actor },
    status: "PENDING",
    expiresAt: "2026-11-03T00:00:00Z",
  });
  f.tx.receipt = async () => stored;
  f.tx.saveReceipt = async (value) => {
    stored = value;
  };
  let loseReply = true;
  f.port.atomic = async (_scope, work) => {
    const result = await work(f.tx);
    if (loseReply) {
      loseReply = false;
      throw Error("LOST_REPLY_AFTER_COMMIT");
    }
    return result;
  };
  expect(await executeMemberClaim(original, actor, f.port)).toEqual({
    status: "UNAVAILABLE",
  });
  expect(await recoverMemberClaimReceipt(original, actor, f.port)).toEqual({
    status: "LINKED",
    personId,
    inviteId,
    currentAccess: "NONE",
  });
  expect(f.link).toHaveBeenCalledTimes(1);
});
it("an unavailable current authority or receipt read cannot imply NoCommit", async () => {
  const f = fixture();
  f.tx.currentEffectiveAccess = async () => null;
  expect(await recoverMemberClaimReceipt(command, actor, f.port)).toEqual({
    status: "UNAVAILABLE",
  });
  expect(f.tx.receipt).not.toHaveBeenCalled();
  f.tx.currentEffectiveAccess = async () => "NONE";
  f.tx.receipt = async () => {
    throw Error("UNKNOWN_READ");
  };
  expect(await recoverMemberClaimReceipt(command, actor, f.port)).toEqual({
    status: "UNAVAILABLE",
  });
  expect(f.issue).not.toHaveBeenCalled();
  expect(f.link).not.toHaveBeenCalled();
});
