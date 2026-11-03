import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { tripMemberClaimBoundary } from "./tripMemberClaimHttp";
import {
  memberClaimIntentDigest,
  type MemberClaimAuthorityPort,
  type MemberClaimTransaction,
} from "./tripMemberClaimAuthority";

function fixture() {
  const user = { id: randomUUID(), accountClass: "NORMAL_ACCOUNT" as const };
  const command = {
    kind: "CLAIM_PERSON" as const,
    operationId: randomUUID(),
    tripId: randomUUID(),
    personId: randomUUID(),
    inviteId: randomUUID(),
    explicitConsent: true as const,
  };
  let linked = false;
  let receipt: Awaited<ReturnType<MemberClaimTransaction["receipt"]>> = null;
  const tx: MemberClaimTransaction = {
    currentTime: async () => "2026-11-03T00:00:00Z",
    currentEffectiveAccess: async () => (linked ? "READ" : "NONE"),
    currentOrganizerAuthority: async () => false,
    personLinkedAccount: async () => (linked ? user.id : null),
    accountLinkedPerson: async () => (linked ? command.personId : null),
    exactOrganizerApproval: async () => true,
    confirmedClaimantIdentity: async () => false,
    accountAccessDenied: async () => false,
    invite: async () => ({
      id: command.inviteId,
      tripId: command.tripId,
      personId: command.personId,
      target: { kind: "REGISTERED_ACCOUNT", accountId: user.id },
      status: "PENDING",
      expiresAt: "2026-11-04T00:00:00Z",
    }),
    receipt: async () => receipt,
    issue: vi.fn(async () => {
      throw new Error("NOT_ALLOWED");
    }),
    link: vi.fn(async () => {
      linked = true;
    }),
    revokeUnclaimed: vi.fn(),
    saveReceipt: vi.fn(async (value) => {
      receipt = value;
    }),
  };
  const port: MemberClaimAuthorityPort = {
    atomic: async (_scope, work) => work(tx),
  };
  vi.spyOn(port, "atomic");
  const request = (body: unknown = command, suffix = "", key = command.operationId) =>
    new Request(
      `https://api.example.test/v2/trips/${command.tripId}/member-claim-operations${suffix}`,
      {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify(body),
      },
    );
  return { user, command, tx, port, request };
}

it("keeps the candidate closed without a port", async () => {
  const f = fixture();
  expect((await tripMemberClaimBoundary(f.request(), f.user)).status).toBe(503);
});

it.each([undefined, "UNKNOWN", "ANONYMOUS"] as const)(
  "rejects non-normal identity %s before owning IO",
  async (accountClass) => {
    const f = fixture();
    expect(
      (
        await tripMemberClaimBoundary(
          f.request(),
          { id: f.user.id, accountClass },
          f.port,
        )
      ).status,
    ).toBe(403);
    expect(f.port.atomic).not.toHaveBeenCalled();
  },
);

it.each(["actor", "trip", "consent", "key", "query"])(
  "rejects mismatched %s before owning IO",
  async (kind) => {
    const f = fixture();
    const body =
      kind === "actor"
        ? { ...f.command, actorAccountId: randomUUID() }
        : kind === "trip"
          ? { ...f.command, tripId: randomUUID() }
          : kind === "consent"
            ? { ...f.command, explicitConsent: false }
            : f.command;
    const response = await tripMemberClaimBoundary(
      f.request(
        body,
        kind === "query" ? "?accountId=other" : "",
        kind === "key" ? randomUUID() : f.command.operationId,
      ),
      f.user,
      f.port,
    );
    expect(response.status).toBe(400);
    expect(f.port.atomic).not.toHaveBeenCalled();
  },
);

it("allows exact invited B with no existing Trip access, then recovers without a second link", async () => {
  const f = fixture();
  const first = await tripMemberClaimBoundary(f.request(), f.user, f.port);
  expect(first.status).toBe(200);
  expect(first.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await first.json()).toEqual({
    status: "LINKED",
    personId: f.command.personId,
    inviteId: f.command.inviteId,
    currentAccess: "READ",
  });
  expect(f.port.atomic).toHaveBeenCalledWith(
    { tripId: f.command.tripId, actorAccountId: f.user.id },
    expect.any(Function),
  );
  const recovered = await tripMemberClaimBoundary(
    f.request(f.command, "/recovery"),
    f.user,
    f.port,
  );
  expect(await recovered.json()).toMatchObject({
    status: "LINKED",
    currentAccess: "READ",
  });
  expect(f.tx.link).toHaveBeenCalledTimes(1);
  expect(f.tx.saveReceipt).toHaveBeenCalledTimes(1);
  expect(f.tx.saveReceipt).toHaveBeenCalledWith(
    expect.objectContaining({ intentDigest: memberClaimIntentDigest(f.command) }),
  );
});

it("recovery absence does not execute the original command", async () => {
  const f = fixture();
  const response = await tripMemberClaimBoundary(
    f.request(f.command, "/recovery"),
    f.user,
    f.port,
  );
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ status: "ABSENT_UNCONFIRMED" });
  expect(f.tx.link).not.toHaveBeenCalled();
  expect(f.tx.saveReceipt).not.toHaveBeenCalled();
});

it("denies Account C even when it knows the exact B invitation", async () => {
  const f = fixture();
  const response = await tripMemberClaimBoundary(
    f.request(),
    { id: randomUUID(), accountClass: "NORMAL_ACCOUNT" },
    f.port,
  );
  expect(response.status).toBe(403);
  expect(f.tx.link).not.toHaveBeenCalled();
  expect(f.tx.saveReceipt).not.toHaveBeenCalled();
});

it("returns unavailable when the owning transaction fails without replaying it", async () => {
  const f = fixture();
  vi.spyOn(f.port, "atomic").mockRejectedValueOnce(new Error("COMMIT_OUTCOME_UNKNOWN"));
  const response = await tripMemberClaimBoundary(f.request(), f.user, f.port);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: "UNAVAILABLE" });
  expect(f.port.atomic).toHaveBeenCalledTimes(1);
});

it("distinguishes a closed port from an unavailable owning authority without logging request or raw error", async () => {
  const f = fixture(),
    log = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    const closed = await tripMemberClaimBoundary(f.request(), f.user);
    expect(closed.status).toBe(503);
    expect(await closed.json()).toEqual({ error: { code: "MEMBER_CLAIM_CLOSED" } });
    vi.mocked(f.port.atomic).mockRejectedValueOnce(
      Object.assign(Error("UNIT_TOKEN_DO_NOT_LOG"), { code: "42501" }),
    );
    const unavailable = await tripMemberClaimBoundary(f.request(), f.user, f.port);
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ status: "UNAVAILABLE" });
    expect(log.mock.calls.map(([v]) => JSON.parse(v))).toEqual([
      {
        event: "member_claim_unavailable",
        stage: "PORT_SELECTION",
        code: "MEMBER_CLAIM_CLOSED",
      },
      {
        event: "member_claim_unavailable",
        stage: "OWNING_AUTHORITY",
        code: "MEMBER_CLAIM_UNAVAILABLE",
      },
    ]);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      new RegExp(
        `UNIT_TOKEN_DO_NOT_LOG|${f.user.id}|${f.command.operationId}|${f.command.tripId}`,
      ),
    );
  } finally {
    log.mockRestore();
  }
});

it("keeps original closed/unavailable responses when diagnostic logging throws", async () => {
  const f = fixture(),
    log = vi.spyOn(console, "info").mockImplementation(() => {
      throw Error("LOGGER_FAILED");
    });
  try {
    const closed = await tripMemberClaimBoundary(f.request(), f.user);
    expect(closed.status).toBe(503);
    expect(await closed.json()).toEqual({ error: { code: "MEMBER_CLAIM_CLOSED" } });
    vi.mocked(f.port.atomic).mockRejectedValueOnce(Error("ORIGINAL_AUTHORITY_FAILURE"));
    const unavailable = await tripMemberClaimBoundary(f.request(), f.user, f.port);
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ status: "UNAVAILABLE" });
  } finally {
    log.mockRestore();
  }
});
