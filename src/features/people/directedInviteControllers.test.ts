import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import { createDirectedInviteReadRepository } from "@/data/repositories/directedInviteReadRepository";
import { createMemberClaimRepository } from "@/data/repositories/memberClaimRepository";
import { createMemberClaimAttemptRepository } from "@/data/repositories/memberClaimAttemptRepository";
import type { CoreAcceptedPeopleConnections } from "@/data/repositories/tripCoreV2Repository";
import {
  type DirectedClaimPeopleReadback,
  createDirectedClaimController,
  createDirectedInviteController,
} from "./directedInviteControllers";

async function fixture() {
  let id = randomUUID();
  const account = async () => id;
  const context = await captureAccountRequestContext(randomUUID(), account);
  const personId = randomUUID(),
    inviteId = randomUUID(),
    targetId = randomUUID();
  const detail = {
    version: 1 as const,
    accountId: id,
    invitation: {
      tripId: context.tripId,
      personId,
      inviteId,
      tripName: "Synthetic trip",
      personName: "同名",
      status: "PENDING" as const,
      expiresAt: "2026-11-15T00:00:00Z",
    },
  };
  const readerWire = vi.fn<typeof fetch>(async (url) =>
    Response.json(
      String(url).includes("recipients")
        ? {
            version: 1,
            accountId: id,
            tripId: context.tripId,
            recipients: [
              { accountId: targetId, displayName: "同名" },
              { accountId: randomUUID(), displayName: "同名" },
            ],
          }
        : detail,
    ),
  );
  const token = async () => ({ userId: id, token: "synthetic-unit-token" });
  const reader = createDirectedInviteReadRepository(
    account,
    { baseUrl: "https://api.example.test", fetchImplementation: readerWire },
    token,
  );
  const receipts = new Map<string, object>();
  let loseReply = false,
    noneAccess = false,
    absent = false,
    closed = false;
  const wire = vi.fn<typeof fetch>(async (url, init) => {
    const command = JSON.parse(String(init?.body));
    if (String(url).endsWith("/recovery"))
      return Response.json(
        absent ? { status: "ABSENT_UNCONFIRMED" } : receipts.get(command.operationId),
      );
    if (closed) {
      closed = false;
      return Response.json({ error: { code: "MEMBER_CLAIM_CLOSED" } }, { status: 503 });
    }
    const value = {
      status: command.kind === "CLAIM_PERSON" ? "LINKED" : "ISSUED",
      personId: command.personId,
      inviteId,
      currentAccess: noneAccess ? "NONE" : "READ",
    };
    receipts.set(command.operationId, value);
    if (loseReply) {
      loseReply = false;
      throw Error("synthetic response loss");
    }
    return Response.json(value);
  });
  const authority = createMemberClaimRepository(
    account,
    { baseUrl: "https://api.example.test", fetchImplementation: wire },
    token,
  );
  const rows = new Map<string, string>();
  const storage = {
    getItem: async (key: string) => rows.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      rows.set(key, value);
    },
    deleteItem: async (key: string) => {
      rows.delete(key);
    },
  };
  const accepted: CoreAcceptedPeopleConnections = {
    certificate: {
      epoch: randomUUID(),
      revision: "1",
      access_revision: 1,
      applied_generation: 17,
      actor_person_binding_hash: "a".repeat(64),
      roster_hash: "b".repeat(64),
      manifest_sha256: "c".repeat(64),
      ordinary_order_version: 1,
    },
    people: [{ personId, connected: true, isCurrentActor: true }],
  };
  const refresh = vi.fn(async (): Promise<DirectedClaimPeopleReadback> => ({
    status: "EXECUTED",
    refreshGeneration: 17,
    context,
    accepted,
  }));
  const ports = () => ({
    account,
    reader,
    attempts: createMemberClaimAttemptRepository(storage, account, authority),
    refreshAndReadPeople: refresh,
  });
  return {
    context,
    personId,
    inviteId,
    targetId,
    detail,
    readerWire,
    wire,
    rows,
    refresh,
    accepted,
    sender: () => createDirectedInviteController(context, personId, ports()),
    claimant: (specificInvite = inviteId) =>
      createDirectedClaimController(context, specificInvite, ports()),
    lose() {
      loseReply = true;
    },
    none() {
      noneAccess = true;
    },
    missing() {
      absent = true;
    },
    closeOnce() {
      closed = true;
    },
    switch() {
      id = randomUUID();
      advanceAccountGeneration();
    },
  };
}
it("A explicitly selects an authorized Account and duplicate Send issues one operation only", async () => {
  const f = await fixture(),
    model = f.sender();
  await model.load();
  await model.send();
  expect(f.wire).not.toHaveBeenCalled();
  await model.select(randomUUID());
  expect(model.getSnapshot().selectedAccountId).toBeNull();
  await model.select(f.targetId);
  await Promise.all([model.send(), model.send()]);
  expect(f.wire).toHaveBeenCalledOnce();
  expect(f.refresh).not.toHaveBeenCalled();
  expect(model.getSnapshot()).toMatchObject({
    phase: "ISSUED",
    outcome: { status: "ISSUED", inviteId: f.inviteId },
  });
  const body = JSON.parse(String(f.wire.mock.calls[0][1]?.body));
  expect(body).toMatchObject({
    kind: "ISSUE_TARGETED_INVITE",
    personId: f.personId,
    target: { accountId: f.targetId },
  });
  await model.send();
  expect(f.wire).toHaveBeenCalledOnce();
});
it("B needs explicit consent and accepted own-Person readback before verified UI", async () => {
  const f = await fixture(),
    model = f.claimant();
  await model.load();
  expect(f.wire).not.toHaveBeenCalled();
  let finish!: (value: DirectedClaimPeopleReadback) => void;
  f.refresh.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = model.confirm();
  await vi.waitFor(() => expect(f.refresh).toHaveBeenCalledOnce());
  expect(model.getSnapshot().phase).toBe("BUSY");
  expect(model.getSnapshot().memberReadbackVerified).toBe(false);
  await model.confirm();
  expect(f.wire).toHaveBeenCalledOnce();
  finish({
    status: "EXECUTED",
    refreshGeneration: 17,
    context: f.context,
    accepted: f.accepted,
  });
  await pending;
  expect(model.getSnapshot().memberReadbackVerified).toBe(true);
  expect(JSON.parse(String(f.wire.mock.calls[0][1]?.body))).toMatchObject({
    kind: "CLAIM_PERSON",
    inviteId: f.inviteId,
    personId: f.personId,
    explicitConsent: true,
  });
});
it.each(["sender", "claimant"] as const)(
  "%s reconstructs UNKNOWN and only recovers the original operation",
  async (direction) => {
    const f = await fixture(),
      model = f[direction]();
    await model.load();
    if (direction === "sender")
      await (model as ReturnType<typeof f.sender>).select(f.targetId);
    f.lose();
    if (direction === "sender") await (model as ReturnType<typeof f.sender>).send();
    else await (model as ReturnType<typeof f.claimant>).confirm();
    expect(model.getSnapshot().phase).toBe("UNKNOWN");
    const original = String(f.wire.mock.calls[0][1]?.body);
    model.dispose();
    const reopened = f[direction]();
    await reopened.load();
    expect(reopened.getSnapshot().phase).toBe("UNKNOWN");
    await reopened.checkOriginal();
    expect(String(f.wire.mock.calls[1][0])).toMatch(/\/recovery$/);
    expect(String(f.wire.mock.calls[1][1]?.body)).toBe(original);
    expect(f.wire).toHaveBeenCalledTimes(2);
  },
);
it("ABSENT retains the original UNKNOWN and never enables Confirm", async () => {
  const f = await fixture(),
    model = f.claimant();
  await model.load();
  f.lose();
  await model.confirm();
  const id = model.getSnapshot().operationId;
  f.missing();
  await model.checkOriginal();
  await model.confirm();
  expect(model.getSnapshot()).toMatchObject({
    phase: "UNKNOWN",
    operationId: id,
    memberReadbackVerified: false,
  });
  expect(f.wire).toHaveBeenCalledTimes(2);
  expect(f.refresh).not.toHaveBeenCalled();
});
it("historical LINKED with no current access never reads a stale member cache as a regrant", async () => {
  const f = await fixture(),
    model = f.claimant();
  await model.load();
  f.none();
  await model.confirm();
  expect(model.getSnapshot()).toMatchObject({
    phase: "UNAVAILABLE",
    memberReadbackVerified: false,
  });
  expect(f.refresh).not.toHaveBeenCalled();
});
it.each(["missing", "wrong-person", "two-actors"] as const)(
  "does not verify %s accepted People observation",
  async (kind) => {
    const f = await fixture(),
      model = f.claimant();
    await model.load();
    f.refresh.mockResolvedValueOnce({
      status: "EXECUTED",
      refreshGeneration: 17,
      context: f.context,
      accepted:
        kind === "missing"
          ? null
          : {
              ...f.accepted,
              people:
                kind === "wrong-person"
                  ? [{ personId: randomUUID(), connected: true, isCurrentActor: true }]
                  : [...f.accepted.people, ...f.accepted.people],
            },
    });
    await model.confirm();
    expect(model.getSnapshot().memberReadbackVerified).toBe(false);
    await model.checkOriginal();
    expect(model.getSnapshot().memberReadbackVerified).toBe(true);
    expect(
      f.wire.mock.calls.filter(([u]) => !String(u).endsWith("/recovery")),
    ).toHaveLength(1);
  },
);
it("known no-dispatch refusal allows a new explicit consent after reload, never old ID replay", async () => {
  const f = await fixture(),
    model = f.claimant();
  await model.load();
  f.closeOnce();
  await model.confirm();
  const old = model.getSnapshot().operationId;
  expect(model.getSnapshot().phase).toBe("UNAVAILABLE");
  await model.load();
  expect(model.getSnapshot().phase).toBe("READY");
  await model.confirm();
  expect(model.getSnapshot().memberReadbackVerified).toBe(true);
  expect(model.getSnapshot().operationId).not.toBe(old);
});
it("foreign Trip invitation is unavailable without Claim", async () => {
  const f = await fixture(),
    model = f.claimant();
  f.readerWire.mockResolvedValueOnce(
    Response.json({
      ...f.detail,
      invitation: { ...f.detail.invitation, tripId: randomUUID() },
    }),
  );
  await model.load();
  await model.confirm();
  expect(f.wire).not.toHaveBeenCalled();
  expect(model.getSnapshot().phase).toBe("UNAVAILABLE");
});
it("Account switch and dispose suppress late responses/actions", async () => {
  const f = await fixture(),
    model = f.claimant();
  f.readerWire.mockImplementationOnce(async () => {
    f.switch();
    return Response.json(f.detail);
  });
  await model.load();
  await model.confirm();
  expect(f.wire).not.toHaveBeenCalled();
  const g = await fixture(),
    next = g.claimant();
  await next.load();
  next.dispose();
  await next.confirm();
  expect(g.wire).not.toHaveBeenCalled();
});

it("archives a terminal LINKED/NONE without blocking a later distinct formal invitation", async () => {
  const f = await fixture(),
    model = f.claimant();
  await model.load();
  f.none();
  await model.confirm();
  expect(model.getSnapshot().memberReadbackVerified).toBe(false);
  const nextInvite = randomUUID(),
    next = f.claimant(nextInvite);
  f.readerWire.mockResolvedValueOnce(
    Response.json({
      ...f.detail,
      invitation: { ...f.detail.invitation, inviteId: nextInvite },
    }),
  );
  await next.load();
  expect(next.getSnapshot().phase).toBe("READY");
  expect(f.wire).toHaveBeenCalledOnce();
  expect(f.refresh).not.toHaveBeenCalled();
});
it("CLAIMED with no original retries accepted People readback without any POST", async () => {
  const f = await fixture(),
    model = f.claimant();
  f.readerWire.mockResolvedValueOnce(
    Response.json({
      ...f.detail,
      invitation: { ...f.detail.invitation, status: "CLAIMED" },
    }),
  );
  f.refresh.mockResolvedValueOnce({
    status: "EXECUTED",
    refreshGeneration: 17,
    context: f.context,
    accepted: null,
  });
  await model.load();
  expect(model.getSnapshot()).toMatchObject({
    phase: "AWAITING_READBACK",
    operationId: null,
    memberReadbackVerified: false,
  });
  await model.retryReadback();
  expect(model.getSnapshot().memberReadbackVerified).toBe(true);
  expect(f.refresh).toHaveBeenCalledTimes(2);
  expect(f.wire).not.toHaveBeenCalled();
});
it("a selection invalidated across its Account await resolves without publishing or rejection", async () => {
  const f = await fixture(),
    model = f.sender();
  await model.load();
  const pending = model.select(f.targetId);
  f.switch();
  await expect(pending).resolves.toBeUndefined();
  expect(model.getSnapshot().selectedAccountId).toBeNull();
});
it("the public controller does not expose presentation-state setters as permission shortcuts", async () => {
  const f = await fixture();
  expect("update" in f.sender()).toBe(false);
  expect("fail" in f.claimant()).toBe(false);
});

it("a competing staged target is replaced by the actual retained original recipient, never silently sent", async () => {
  const f = await fixture(),
    first = f.sender(),
    staged = f.sender();
  await first.load();
  await staged.load();
  const other = staged.getSnapshot().recipients!.recipients[1].accountId;
  await staged.select(other);
  await first.select(f.targetId);
  f.lose();
  await first.send();
  await staged.send();
  expect(staged.getSnapshot()).toMatchObject({
    phase: "UNKNOWN",
    selectedAccountId: f.targetId,
    operationId: first.getSnapshot().operationId,
  });
  expect(f.wire).toHaveBeenCalledOnce();
});

it.each([
  "SKIPPED",
  "UNKNOWN",
  "FAILED",
  "wrong-account",
  "wrong-trip",
  "old-generation",
  "old-certificate",
] as const)("does not verify %s downstream proof or resend Claim", async (kind) => {
  const f = await fixture(),
    model = f.claimant();
  await model.load();
  const context = { ...f.context };
  if (kind === "wrong-account") context.accountId = randomUUID();
  if (kind === "wrong-trip") context.tripId = randomUUID();
  if (kind === "old-generation") context.generation -= 1;
  f.refresh.mockResolvedValueOnce(
    kind === "SKIPPED" || kind === "UNKNOWN" || kind === "FAILED"
      ? { status: kind, context }
      : {
          status: "EXECUTED",
          refreshGeneration: 17,
          context,
          accepted:
            kind === "old-certificate"
              ? {
                  ...f.accepted,
                  certificate: {
                    ...f.accepted.certificate,
                    applied_generation: 16,
                  },
                }
              : f.accepted,
        },
  );
  await model.confirm();
  expect(model.getSnapshot()).toMatchObject({
    phase: "AWAITING_READBACK",
    memberReadbackVerified: false,
  });
  await model.confirm();
  expect(f.wire).toHaveBeenCalledOnce();
  await model.checkOriginal();
  expect(model.getSnapshot().memberReadbackVerified).toBe(true);
  expect(
    f.wire.mock.calls.filter(([url]) => !String(url).endsWith("/recovery")),
  ).toHaveLength(1);
});
