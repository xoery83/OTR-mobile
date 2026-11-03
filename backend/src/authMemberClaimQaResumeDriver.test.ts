import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import template from "../../docs/ops/auth-c04-20261103/finite-qa-candidate/QA_CASE_TEMPLATE.json";
import { runMemberClaimQaResumeDriver } from "../../scripts/auth/member-claim-qa-resume-driver";
import { memberClaimIntentDigest } from "./tripMemberClaimAuthority";

const mocks = vi.hoisted(() => ({
  normal: vi.fn(),
  session: vi.fn(),
  scenario: vi.fn(),
}));
vi.mock("../../scripts/auth/registered-qa-host-session", () => ({
  registeredHostQa: {
    email: "otr-qa-fde969f2-2dc5-4a33-83a1-268ac5fd6424@eldouzileu.resend.app",
    createdAt: "2026-10-30T00:09:11.910404Z",
  },
  createNormalRegisteredQaHostDependencies: mocks.normal,
  runRegisteredQaHostSession: mocks.session,
}));
vi.mock("../../scripts/auth/member-claim-qa-scenario", () => ({
  resumeMemberClaimQaScenario: mocks.scenario,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.normal.mockImplementation((receiver, note) => ({ receiver, note }));
  mocks.scenario.mockResolvedValue({ scope: "MOCK_DRIVER_COMPOSITION_ONLY" });
  mocks.session.mockImplementation(async (_deps, work, qa) => {
    await work({ accountId: qa.accountId, tripId: qa.tripId });
    return { scope: "MOCK_NORMAL_CALLBACK" };
  });
});
function fixture() {
  const qaCase = {
    ...template.qaCase,
    opensAt: "2026-11-03T00:00:00Z",
    inviteExpiresAt: "2026-11-03T00:10:00Z",
    closesAt: "2026-11-03T00:30:00Z",
  };
  const expected = {
    qaCase,
    image: "sha256:" + "a".repeat(64),
    containerId: "b".repeat(64),
    configSHA256: "c".repeat(64),
    planSHA256: "d".repeat(64),
  };
  const command = {
    kind: "ISSUE_TARGETED_INVITE" as const,
    operationId: qaCase.issueOperationId,
    tripId: qaCase.tripId,
    personId: qaCase.personId,
    target: { kind: "REGISTERED_ACCOUNT" as const, accountId: qaCase.claimantAccountId },
  };
  const wire = {
    ...expected,
    status: "AUTH_C04_RESUME_WINDOW_QUALIFIED",
    executionMode: "ORIGINAL_ID_RESUME",
    businessMutationAuthorized: true,
  };
  const query = vi.fn(async (_sql: string): Promise<unknown> => ({
    rows: [{ result: null }],
  }));
  const controlExecute = vi.fn(
    async (_program: string, _args: string[], _options: unknown) => ({
      stdout: JSON.stringify(wire),
    }),
  );
  const input: Parameters<typeof runMemberClaimQaResumeDriver>[0] = {
    windowId: randomUUID(),
    expected,
    retainedIssue: { command, intentDigest: memberClaimIntentDigest(command) },
    receivers: { A: { label: "unitA" }, B: { label: "unitB" } } as unknown as Parameters<
      typeof runMemberClaimQaResumeDriver
    >[0]["receivers"],
    publicOptions: {
      url: "https://tuqigdxrvrerfewsxqgm.supabase.co",
      publishableKey: "sb_publishable_" + "unit_only_".repeat(5),
      persistSession: async () => {},
    },
    query,
    controlExecute,
    noteAuth: vi.fn(),
    retain: vi.fn(),
    now: () => Date.parse(qaCase.opensAt),
  };
  return { input, qaCase, wire, query, controlExecute };
}

it("composes fixed A/B normal session callbacks, actual new Root qualifier and independent readers", async () => {
  const f = fixture();
  await expect(runMemberClaimQaResumeDriver(f.input)).resolves.toEqual({
    scope: "MOCK_DRIVER_COMPOSITION_ONLY",
  });
  const [qa, retained, deps] = mocks.scenario.mock.calls[0];
  expect(qa).toEqual(f.qaCase);
  expect(retained).toEqual(f.input.retainedIssue);
  expect(deps.preflight).toBeUndefined();
  expect(deps.allowOriginalIdSubmissions).toBe(true);
  await deps.withOwnerSession(vi.fn());
  await deps.withClaimantSession(vi.fn());
  expect(mocks.session.mock.calls.map((c) => c[2])).toEqual([
    {
      accountId: f.qaCase.ownerAccountId,
      tripId: f.qaCase.tripId,
      email: "otr-qa-3f43c81b-500b-4e59-b0a8-c7ffdbd19a31@eldouzileu.resend.app",
    },
    {
      accountId: f.qaCase.claimantAccountId,
      tripId: f.qaCase.tripId,
      email: "otr-qa-fde969f2-2dc5-4a33-83a1-268ac5fd6424@eldouzileu.resend.app",
      createdAt: "2026-10-30T00:09:11.910404Z",
    },
  ]);
  await deps.qualifyResumeWindow(f.qaCase);
  expect(f.controlExecute).toHaveBeenCalledTimes(2);
  expect(f.controlExecute.mock.calls[0][1].at(-1)).toContain("qualify-resume");
  const id = randomUUID();
  const invite = {
    id,
    tripId: f.qaCase.tripId,
    personId: f.qaCase.personId,
    targetAccountId: f.qaCase.claimantAccountId,
    status: "PENDING",
    observedAt: f.qaCase.opensAt,
    expiresAt: f.qaCase.inviteExpiresAt,
  };
  f.query.mockResolvedValueOnce({ rows: [{ result: invite }] });
  expect(await deps.readInvite(id)).toEqual(invite);
  const receipt = {
    tripId: f.qaCase.tripId,
    actorAccountId: f.qaCase.ownerAccountId,
    personId: f.qaCase.personId,
    operationId: f.qaCase.issueOperationId,
    intentDigest: f.input.retainedIssue.intentDigest,
    inviteId: id,
    outcome: "ISSUED",
  };
  f.query.mockResolvedValueOnce({ rows: [{ result: receipt }] });
  expect(
    await deps.readReceipt(f.input.retainedIssue.command, f.qaCase.ownerAccountId),
  ).toEqual(receipt);
  expect(f.query).toHaveBeenCalledTimes(2);
  expect(f.query.mock.calls.every(([sql]) => !sql.includes("originalReceipts"))).toBe(
    true,
  );
});
it("rejects a foreign QA case before normal Auth construction, query or control read", () => {
  const f = fixture();
  f.qaCase.tripId = randomUUID();
  expect(() => runMemberClaimQaResumeDriver(f.input)).toThrow("FIXED_CASE_REQUIRED");
  expect(mocks.normal).not.toHaveBeenCalled();
  expect(mocks.session).not.toHaveBeenCalled();
  expect(f.query).not.toHaveBeenCalled();
  expect(f.controlExecute).not.toHaveBeenCalled();
});
it("cannot use a read-only Root wire as resume qualification", async () => {
  const f = fixture();
  f.controlExecute.mockResolvedValue({
    stdout: JSON.stringify({
      ...f.wire,
      status: "AUTH_C04_RECOVERY_WINDOW_QUALIFIED",
      executionMode: "RECOVERY_ONLY",
      businessMutationAuthorized: false,
    }),
  });
  await expect(runMemberClaimQaResumeDriver(f.input)).rejects.toThrow(
    "WINDOW_UNQUALIFIED",
  );
  expect(mocks.scenario).not.toHaveBeenCalled();
  expect(mocks.session).not.toHaveBeenCalled();
});
