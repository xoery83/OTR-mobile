import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { recoverMemberClaimQaIssue } from "../../scripts/auth/member-claim-qa-recovery";
import { memberClaimIntentDigest } from "./tripMemberClaimAuthority";
import type { RegisteredQaHostContext } from "../../scripts/auth/registered-qa-host-session";

function fixture() {
  const qa = {
    projectRef: "tuqigdxrvrerfewsxqgm" as const,
    tripId: randomUUID(),
    personId: randomUUID(),
    ownerAccountId: randomUUID(),
    claimantAccountId: randomUUID(),
    issueOperationId: randomUUID(),
    claimOperationId: randomUUID(),
    opensAt: "2026-11-03T00:00:00Z",
    inviteExpiresAt: "2026-11-03T00:10:00Z",
    closesAt: "2026-11-03T00:30:00Z",
  };
  const command = {
    kind: "ISSUE_TARGETED_INVITE" as const,
    operationId: qa.issueOperationId,
    tripId: qa.tripId,
    personId: qa.personId,
    target: { kind: "REGISTERED_ACCOUNT" as const, accountId: qa.claimantAccountId },
  };
  const retained = { command, intentDigest: memberClaimIntentDigest(command) };
  const receipt = {
    tripId: qa.tripId,
    actorAccountId: qa.ownerAccountId,
    personId: qa.personId,
    operationId: command.operationId,
    intentDigest: retained.intentDigest,
    outcome: "ISSUED",
    inviteId: randomUUID(),
  };
  const state = {
    now: Date.parse(qa.opensAt),
    accountId: qa.ownerAccountId,
    cleanup: true,
    absent: false,
  };
  const readSession = async () => ({
    accessToken: "unit-only",
    refreshToken: null,
    expiresAt: qa.closesAt,
    identity: { userId: state.accountId, email: "qa@example.test", displayName: "" },
  });
  const wire = vi.fn<typeof fetch>(async (url, init) => {
    expect(String(url)).toBe(
      `https://api-dev.xoery.art/v2/trips/${qa.tripId}/member-claim-operations/recovery`,
    );
    expect(JSON.parse(String(init?.body))).toEqual(command);
    return Response.json(
      state.absent
        ? { status: "ABSENT_UNCONFIRMED" }
        : {
            status: "ISSUED",
            personId: qa.personId,
            inviteId: receipt.inviteId,
            currentAccess: "NONE",
          },
    );
  });
  const deps = {
    withOwnerSession: vi.fn(
      async (work: (c: RegisteredQaHostContext) => Promise<void>) => {
        await work({ accountId: qa.ownerAccountId, tripId: qa.tripId, readSession });
        return {
          status: "PASS",
          accountId: qa.ownerAccountId,
          tripId: qa.tripId,
          ownSessionCleanup: state.cleanup
            ? "PASS_LOCAL_SCOPE_REFRESH_REVOKED"
            : "UNRESOLVED",
        };
      },
    ),
    qualifyRecoveryWindow: vi.fn(async () => {}),
    readReceipt: vi.fn(async () => receipt),
    retain: vi.fn(),
    fetchImplementation: wire,
    now: () => state.now,
  };
  return { qa, command, retained, receipt, state, wire, deps };
}

it("recovers only the retained ISSUE through the real repository and verifies independent receipt, without implying fresh access", async () => {
  const f = fixture();
  expect(await recoverMemberClaimQaIssue(f.qa, f.retained, f.deps)).toMatchObject({
    status: "ORIGINAL_ISSUE_RECEIPT_CONFIRMED",
    currentAccess: "NONE",
    invitationUsability: "NOT_VERIFIED",
    claim: "NOT_RUN",
  });
  expect(f.wire).toHaveBeenCalledOnce();
  expect(f.deps.readReceipt).toHaveBeenCalledOnce();
});

it("stops on absence with no execute or subsequent read", async () => {
  const f = fixture();
  f.state.absent = true;
  await expect(recoverMemberClaimQaIssue(f.qa, f.retained, f.deps)).rejects.toThrow(
    "ORIGINAL_OPERATION_UNCONFIRMED",
  );
  expect(f.wire).toHaveBeenCalledOnce();
  expect(f.deps.readReceipt).not.toHaveBeenCalled();
});

it.each(["digest", "operation", "target"])(
  "rejects changed retained %s before normal login",
  async (field) => {
    const f = fixture();
    if (field === "digest") f.retained.intentDigest = "0".repeat(64);
    if (field === "operation") f.command.operationId = randomUUID();
    if (field === "target") f.command.target.accountId = randomUUID();
    await expect(recoverMemberClaimQaIssue(f.qa, f.retained, f.deps)).rejects.toThrow(
      "RECOVERY_UNPROVEN",
    );
    expect(f.deps.withOwnerSession).not.toHaveBeenCalled();
    expect(f.wire).not.toHaveBeenCalled();
  },
);

it("rejects an unrelated independent receipt", async () => {
  const f = fixture();
  f.receipt.actorAccountId = f.qa.claimantAccountId;
  await expect(recoverMemberClaimQaIssue(f.qa, f.retained, f.deps)).rejects.toThrow(
    "RECOVERY_UNPROVEN",
  );
});

it("rejects account switching during independent readback", async () => {
  const f = fixture();
  f.deps.readReceipt.mockImplementation(async () => {
    f.state.accountId = f.qa.claimantAccountId;
    return f.receipt;
  });
  await expect(recoverMemberClaimQaIssue(f.qa, f.retained, f.deps)).rejects.toThrow(
    "RECOVERY_UNPROVEN",
  );
});

it("rejects a response arriving after the window closes", async () => {
  const f = fixture();
  f.deps.readReceipt.mockImplementation(async () => {
    f.state.now = Date.parse(f.qa.closesAt);
    return f.receipt;
  });
  await expect(recoverMemberClaimQaIssue(f.qa, f.retained, f.deps)).rejects.toThrow(
    "RECOVERY_UNPROVEN",
  );
});

it("does not hide a 503 or replay recovery", async () => {
  const f = fixture();
  f.wire.mockImplementation(async () => Response.json({}, { status: 503 }));
  await expect(recoverMemberClaimQaIssue(f.qa, f.retained, f.deps)).rejects.toThrow();
  expect(f.wire).toHaveBeenCalledOnce();
  expect(f.deps.readReceipt).not.toHaveBeenCalled();
});

it("requires own-session cleanup before reporting success", async () => {
  const f = fixture();
  f.state.cleanup = false;
  await expect(recoverMemberClaimQaIssue(f.qa, f.retained, f.deps)).rejects.toThrow();
});

it("does no login or network when aborted", async () => {
  const f = fixture();
  const controller = new AbortController();
  controller.abort();
  await expect(
    recoverMemberClaimQaIssue(f.qa, f.retained, { ...f.deps, signal: controller.signal }),
  ).rejects.toThrow();
  expect(f.deps.withOwnerSession).not.toHaveBeenCalled();
  expect(f.wire).not.toHaveBeenCalled();
});

it("receives the actual 18.418s 202 path instead of timing out at 15s, retaining absence without replay", async () => {
  vi.useFakeTimers();
  try {
    const f = fixture();
    f.wire.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 18_418));
      return Response.json({ status: "ABSENT_UNCONFIRMED" }, { status: 202 });
    });
    const result = recoverMemberClaimQaIssue(f.qa, f.retained, f.deps).catch(
      (error) => error,
    );
    await vi.advanceTimersByTimeAsync(18_418);
    expect(await result).toHaveProperty(
      "message",
      "C04_QA_ORIGINAL_OPERATION_UNCONFIRMED",
    );
    expect(f.wire).toHaveBeenCalledOnce();
    expect(f.deps.readReceipt).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

it("still stops a hung recovery at the dedicated 90s bound without retry", async () => {
  vi.useFakeTimers();
  try {
    const f = fixture();
    f.wire.mockImplementation(() => new Promise<Response>(() => {}));
    const result = recoverMemberClaimQaIssue(f.qa, f.retained, f.deps).catch(
      (error) => error,
    );
    await vi.advanceTimersByTimeAsync(90_000);
    expect(await result).toMatchObject({ kind: "timeout", code: "REQUEST_TIMEOUT" });
    expect(f.wire).toHaveBeenCalledOnce();
    expect(f.deps.readReceipt).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
