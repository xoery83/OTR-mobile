import { expect, it, vi } from "vitest";
import template from "../../docs/ops/auth-c04-20261103/finite-qa-candidate/QA_CASE_TEMPLATE.json";
import type { MemberClaimAuthorityPort, MemberClaimTransaction } from "./tripMemberClaimAuthority";
import { parseMemberClaimQaCase } from "./tripMemberClaimQa";
import { createMemberClaimQaRecoveryOnly } from "./tripMemberClaimQaRecoveryOnly";
const qa = parseMemberClaimQaCase({ ...template.qaCase, opensAt: "2026-11-03T00:00:00Z", closesAt: "2026-11-03T00:10:00Z", inviteExpiresAt: "2026-11-03T00:05:00Z" });
const names = ["currentTime", "currentEffectiveAccess", "currentOrganizerAuthority", "personLinkedAccount", "accountLinkedPerson", "exactOrganizerApproval", "confirmedClaimantIdentity", "accountAccessDenied", "invite", "receipt", "issue", "link", "revokeUnclaimed", "saveReceipt"] as const;
function fixture() {
  const tx = Object.fromEntries(names.map(name => [name, vi.fn(async () => name === "currentEffectiveAccess" ? "ORGANIZER" : null)])) as unknown as MemberClaimTransaction;
  const committed = vi.fn(), rolledBack = vi.fn();
  const atomic = vi.fn(async (_scope: Parameters<MemberClaimAuthorityPort["atomic"]>[0], work: (tx: MemberClaimTransaction) => Promise<unknown>) => { try { const r = await work(tx); committed(); return r; } catch (error) { rolledBack(); throw error; } });
  const port = createMemberClaimQaRecoveryOnly({ atomic } as MemberClaimAuthorityPort, qa);
  return { tx, atomic, committed, rolledBack, port };
}
const scope = { tripId: qa.tripId, actorAccountId: qa.ownerAccountId };
it("allows only the exact Owner access and original ISSUE receipt reads", async () => {
  const f = fixture();
  await f.port.atomic(scope, async tx => { expect(await tx.currentEffectiveAccess(qa.ownerAccountId)).toBe("ORGANIZER"); expect(await tx.receipt(qa.issueOperationId)).toBeNull(); });
  expect(f.committed).toHaveBeenCalledOnce();
});
it.each([{ ...scope, actorAccountId: qa.claimantAccountId }, { ...scope, tripId: qa.personId }])("rejects foreign scope before underlying transaction", async value => {
  const f = fixture(); await expect(f.port.atomic(value, async () => null)).rejects.toThrow("RECOVERY_ONLY"); expect(f.atomic).not.toHaveBeenCalled();
});
it.each(names.filter(name => !["currentEffectiveAccess", "receipt"].includes(name)))("rejects %s before delegation and rolls back even after callback catches it", async name => {
  const f = fixture();
  await expect(f.port.atomic(scope, async tx => { await (tx[name] as (...args: unknown[]) => Promise<unknown>)(qa.personId).catch(() => {}); })).rejects.toThrow("RECOVERY_ONLY");
  expect(f.tx[name]).not.toHaveBeenCalled(); expect(f.committed).not.toHaveBeenCalled(); expect(f.rolledBack).toHaveBeenCalledOnce();
});
it.each([["receipt", qa.claimOperationId], ["currentEffectiveAccess", qa.claimantAccountId]] as const)("rejects mismatched %s arguments", async (name, value) => {
  const f = fixture(); await expect(f.port.atomic(scope, async tx => { await tx[name](value); })).rejects.toThrow("RECOVERY_ONLY"); expect(f.tx[name]).not.toHaveBeenCalled();
});
