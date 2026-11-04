import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ expired: false, collections: 0 }));
vi.mock("../../src/data/api/tripCoreV2Transport", () => ({
  createCoreV2Transport: () => ({
    capabilities: async () => ({ ...coreClosedCapabilities, activationState: "ENABLED",
      enabledCommands: ["CREATE_ITEM"], enabledFamilies: ["P1"], enabledAdmissionModes: ["MANUAL"] }),
    collection: async () => ({ pages: [{ records: ++state.collections === 1 ? [a] :
      state.collections === 2 ? [a, item] : [b, item] }] }),
    receipt: async () => null,
    submit: async () => ({ projection: "FULL", receipt: {
      actorAccountId: plan.ownerAccountId, tripId: plan.tripId, operationId: plan.operationId,
      command: "CREATE_ITEM", intentSha256: "4c2efd64aa6537a2694da25dfe44ebb2c96c3a734f48083b15b78b43382858b5",
      outcome: "APPLIED", result: { created: [command.target] }, receiptSha256: "a".repeat(64),
    } }),
  }),
}));
import plan from "../../docs/ops/auth-c04-distinct-p1-next-day-20261104/CASE.json";
import { coreClosedCapabilities } from "../../src/domain/trip/tripCoreV2Commands";
import { runItemFixtureProbe, distinctSharedP1Command as command,
  distinctSharedP1CaseId as caseId } from "../../scripts/auth/member-claim-qa-item-fixtures";
import { runRegisteredQaHostSession, registeredHostQa } from "../../scripts/auth/registered-qa-host-session";
import { createAcceptedHostQaReceiver } from "../../scripts/auth/resend-inbound-otp-native-relogin";
const binding = (account_id: string, person_id: string) => ({ kind: "PERSON_BINDING",
  id: person_id, revision: 1, body: { account_id, person_id, active: true, participating: true } });
const a = binding(plan.ownerAccountId, plan.ownerPersonId), b = binding(plan.memberAccountId, plan.memberPersonId);
const item = { kind: "ITEM", id: plan.itemId, revision: 1, body: { id: plan.itemId,
  trip_id: plan.tripId, owner_account_id: plan.ownerAccountId, visibility: "GROUP",
  experience_family: "P1", participation_mode: "WHOLE_GROUP", title: plan.intent.title,
  description: plan.intent.description, start_local_date: plan.intent.date } };
const context = (accountId: string) => ({ accountId, tripId: plan.tripId,
  readSession: async () => { throw Error("NO_SESSION_IO_IN_MOCK_CORE"); } });
const cleanup = (accountId: string) => ({ status: "PASS", accountId, tripId: plan.tripId,
  ownSessionCleanup: "PASS_LOCAL_SCOPE_REFRESH_REVOKED" });
const qualify = async () => { if (state.expired) throw Error("SCOPE_EXPIRED"); };
beforeEach(() => { state.expired = false; state.collections = 0; });

it("does not start B after A cleanup expires qualification; a still-current flow is unchanged", async () => {
  for (const expires of [false, true]) {
    state.expired = false; state.collections = 0;
    const member = vi.fn(async (work) => { await work(context(plan.memberAccountId));
      return cleanup(plan.memberAccountId); });
    const run = runItemFixtureProbe({ caseId, beforeDistinctRun: qualify, reserve: async () => {}, note: () => {},
      withOwnerSession: async (work) => { await work(context(plan.ownerAccountId));
        state.expired = expires; return cleanup(plan.ownerAccountId); },
      withMemberSession: member,
    });
    if (expires) {
      await expect(run).rejects.toThrow("SCOPE_EXPIRED");
      expect(member).not.toHaveBeenCalled();
      expect(state.collections).toBe(2);
    } else {
      await expect(run).resolves.toMatchObject({ sharedItemRead: "PASS" });
      expect(member).toHaveBeenCalledOnce();
      expect(state.collections).toBe(3);
    }
  }
});

it("expires during B mock OTP/getUser before Core read, while the real session driver still cleans its own session", async () => {
  const now = Date.parse("2026-11-05T00:00:00Z");
  const mail = { id: "73d4cf4c-413f-43bd-8e26-026192929cf6", to: [registeredHostQa.email],
    from: "OTR <noreply@auth.xoery.art>", subject: "Your OTR verification code",
    created_at: new Date(now).toISOString(), cc: [], bcc: [] };
  const receiver = createAcceptedHostQaReceiver({ key: "re_unit_only", scope: "dedicated-qa-team",
    now: () => now, reserve: () => {}, fetch: vi.fn()
      .mockResolvedValueOnce(Response.json({ data: [mail], has_more: false }))
      .mockResolvedValueOnce(Response.json({ ...mail, text: "12345678" })),
  });
  const notes: Record<string, unknown>[] = [];
  const request = vi.fn(async () => {}), revoke = vi.fn(async () => {}), isRevoked = vi.fn(async () => true);
  const deps = { receiver, request, revoke, isRevoked,
    verify: async () => ({ accessToken: "unit-host-access", refreshToken: "unit-host-refresh",
      expiresAt: "2026-11-06T00:00:00Z", identity: { userId: plan.memberAccountId,
        email: registeredHostQa.email, displayName: "" } }),
    readUser: async () => { state.expired = true; return { id: plan.memberAccountId,
      email: registeredHostQa.email, created_at: registeredHostQa.createdAt,
      email_confirmed_at: registeredHostQa.createdAt, is_anonymous: false }; },
    note: (value: Record<string, unknown>) => notes.push(value),
  };
  await expect(runItemFixtureProbe({ caseId, beforeDistinctRun: qualify, reserve: async () => {}, note: () => {},
    withOwnerSession: async (work) => { await work(context(plan.ownerAccountId)); return cleanup(plan.ownerAccountId); },
    withMemberSession: (work) => runRegisteredQaHostSession(deps, work, {
      accountId: plan.memberAccountId, tripId: plan.tripId, email: registeredHostQa.email,
      createdAt: registeredHostQa.createdAt,
    }),
  })).rejects.toThrow("REGISTERED_HOST_ACTION_FAILED");
  expect(request).toHaveBeenCalledOnce();
  expect(state.collections).toBe(2);
  expect(revoke).toHaveBeenCalledExactlyOnceWith("unit-host-access");
  expect(isRevoked).toHaveBeenCalledOnce();
  expect(notes).toContainEqual(expect.objectContaining({ ownSessionCleanup: "PASS_LOCAL_SCOPE_REFRESH_REVOKED" }));
});
