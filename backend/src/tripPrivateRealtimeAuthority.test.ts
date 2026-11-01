import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createTripPrivateRealtimeAuthority,
  type RealtimeMembershipBinding,
  type RealtimeMembershipTransition,
  type TripPrivateRealtimeAuthorityPort,
  type TripPrivateRealtimeAuthorityTransaction,
} from "./tripPrivateRealtimeAuthority";
const accountId = "11111111-1111-4111-8111-111111111111";
const tripId = "22222222-2222-4222-8222-222222222222";
const actorPersonId = "33333333-3333-4333-8333-333333333333";
const itemId = "44444444-4444-4444-8444-444444444444";
const leaseId = "55555555-5555-4555-8555-555555555555";
const coreEpoch = "66666666-6666-4666-8666-666666666666";
const operationId = "77777777-7777-4777-8777-777777777777";
const receiptId = "88888888-8888-4888-8888-888888888888";
const input = { tripId, localGeneration: 4 };
const request = (signal?: AbortSignal) =>
  new Request("https://unit.invalid", {
    headers: { Authorization: "Bearer normal-unit" },
    signal,
  });
function fixture() {
  const binding: RealtimeMembershipBinding = {
    accountId,
    tripId,
    actorPersonId,
    active: true,
    membershipGeneration: 11,
  };
  const core = {
    qualification: "NOT_A_PRIVATE_JOIN_LEASE" as const,
    actorAccountId: accountId,
    tripId,
    actorPersonId,
    coreEpoch,
    coreAccessRevision: 197,
  };
  const closes = vi.fn();
  let visible = true,
    session = true;
  let receipt: RealtimeMembershipTransition | null = null;
  const tx: TripPrivateRealtimeAuthorityTransaction = {
    assertCurrentSession: async () => {
      if (!session) throw Error("SESSION_REVOKED");
    },
    currentBinding: async () => ({ ...binding }),
    qualifyCore: async () => ({ ...core }),
    assertBindingCurrent: async (before) => {
      if (!binding.active || before.membershipGeneration !== binding.membershipGeneration)
        throw Error("STALE_BINDING");
    },
    join: vi.fn(async (b) => ({
      lease: {
        accountId,
        tripId,
        actorPersonId,
        leaseId,
        channel: "private-server-channel",
        authorizationRevision: b.membershipGeneration,
        expiresAt: Date.now() + 1000,
      },
      close: closes,
    })),
    readVisibleItem: vi.fn(async (id) =>
      visible
        ? { accountId, tripId, itemId: id, body: { id, text: "authorized projection" } }
        : null,
    ),
    readOwningTransition: async () => receipt,
  };
  const port: TripPrivateRealtimeAuthorityPort = {
    atomic: async (_scope, work) => work(tx),
    enforceCommittedTransition: vi.fn(async (_scope, r) => ({
      status: "ENFORCED" as const,
      receiptId: r.receiptId,
      membershipGeneration: r.membershipGeneration,
    })),
  };
  const gateway = {
    validateAccessToken: vi.fn(async () => ({
      id: accountId,
      accountClass: "NORMAL_ACCOUNT" as const,
    })),
  };
  const authority = createTripPrivateRealtimeAuthority({ gateway, port });
  return {
    binding,
    core,
    tx,
    port,
    gateway,
    authority,
    closes,
    hidden() {
      visible = false;
    },
    logout() {
      session = false;
    },
    transition(kind: "REVOKED" | "REGRANTED") {
      const previousGeneration = binding.membershipGeneration;
      binding.membershipGeneration++;
      binding.active = kind === "REGRANTED";
      receipt = {
        receiptId,
        operationId,
        accountId,
        tripId,
        actorPersonId,
        kind,
        previousGeneration,
        membershipGeneration: binding.membershipGeneration,
      };
      return receipt;
    },
  };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
it("missing owning authority stays closed before normal Auth IO", async () => {
  const f = fixture();
  const authority = createTripPrivateRealtimeAuthority({ gateway: f.gateway });
  await expect(authority.subscribe(request(), input)).rejects.toThrow("CLOSED");
  await expect(authority.readItem(request(), { ...input, itemId })).rejects.toThrow(
    "CLOSED",
  );
  await expect(
    authority.reconcileTransition(request(), { ...input, operationId }),
  ).rejects.toThrow("CLOSED");
  expect(f.gateway.validateAccessToken).not.toHaveBeenCalled();
});
it("membership subscription does not bypass per-item visibility", async () => {
  const f = fixture();
  const opened = await f.authority.subscribe(request(), input);
  expect(opened.lease.authorizationRevision).toBe(11);
  expect(opened.lease.authorizationRevision).not.toBe(f.core.coreAccessRevision);
  f.hidden();
  expect(await f.authority.readItem(request(), { ...input, itemId })).toBeNull();
  opened.close();
});
it("revoked membership rejects new subscriptions and current reads; regrant has a new generation", async () => {
  const f = fixture();
  const original = await f.authority.subscribe(request(), input);
  f.transition("REVOKED");
  await expect(f.authority.subscribe(request(), input)).rejects.toThrow(
    "MEMBERSHIP_DENIED",
  );
  await expect(f.authority.readItem(request(), { ...input, itemId })).rejects.toThrow(
    "MEMBERSHIP_DENIED",
  );
  f.transition("REGRANTED");
  const next = await f.authority.subscribe(request(), input);
  expect(next.lease.authorizationRevision).toBeGreaterThan(
    original.lease.authorizationRevision,
  );
  await expect(
    f.tx.assertBindingCurrent({ ...f.binding, membershipGeneration: 11 }),
  ).rejects.toThrow("STALE_BINDING");
  original.close();
  next.close();
});
it("unknown transition and unconfirmed forced disconnect cannot be called strong revoke", async () => {
  const f = fixture();
  await expect(
    f.authority.reconcileTransition(request(), { ...input, operationId }),
  ).rejects.toThrow("TRANSITION_UNCONFIRMED");
  const receipt = f.transition("REVOKED");
  f.port.enforceCommittedTransition = async (_scope, r) => ({
    status: "UNCONFIRMED",
    receiptId: r.receiptId,
    membershipGeneration: r.membershipGeneration,
  });
  await expect(
    f.authority.reconcileTransition(request(), { ...input, operationId }),
  ).resolves.toEqual({ receipt, receiptState: "COMMITTED", enforcement: "UNCONFIRMED" });
});
it("exact immutable transition is reconciled through its owning enforcement port, not TTL", async () => {
  const f = fixture();
  const receipt = f.transition("REVOKED");
  expect(
    await f.authority.reconcileTransition(request(), { ...input, operationId }),
  ).toEqual({
    receipt,
    receiptState: "COMMITTED",
    enforcement: "SERVER_GENERATION_FENCE_AND_DISCONNECT",
  });
  expect(f.port.enforceCommittedTransition).toHaveBeenCalledTimes(1);
});
it.each([
  "foreign actor",
  "foreign generation",
  "core observation only",
  "post-join revoke",
])("rejects %s and closes a returned join", async (mode) => {
  const f = fixture();
  f.tx.join = async () => {
    const result = {
      lease: {
        accountId,
        tripId,
        actorPersonId,
        leaseId,
        channel: "private",
        authorizationRevision: mode === "foreign generation" ? 197 : 11,
        expiresAt: Date.now() + 1000,
      },
      close: f.closes,
    };
    if (mode === "foreign actor") result.lease.actorPersonId = itemId;
    if (mode === "core observation only") result.lease = f.core as never;
    if (mode === "post-join revoke") f.transition("REVOKED");
    return result;
  };
  await expect(f.authority.subscribe(request(), input)).rejects.toThrow();
  expect(f.closes).toHaveBeenCalledTimes(1);
});
it("logout and abort retain no private join or stale data result", async () => {
  const f = fixture();
  f.logout();
  await expect(f.authority.subscribe(request(), input)).rejects.toThrow(
    "SESSION_REVOKED",
  );
  expect(f.tx.join).not.toHaveBeenCalled();
  const live = fixture();
  const controller = new AbortController();
  const opened = await live.authority.subscribe(request(controller.signal), input);
  controller.abort();
  opened.close();
  expect(live.closes).toHaveBeenCalledTimes(1);
});
it("an authority change during data IO fences the otherwise readable result", async () => {
  const f = fixture();
  f.tx.readVisibleItem = async () => {
    f.transition("REVOKED");
    return { accountId, tripId, itemId, body: "must not disclose" };
  };
  await expect(f.authority.readItem(request(), { ...input, itemId })).rejects.toThrow(
    "STALE_BINDING",
  );
});

it.each(["transport error", "mismatched ack", "cancel after commit"])(
  "retains the committed revoke receipt when cleanup has %s, without retry or false strong proof",
  async (mode) => {
    const f = fixture();
    const receipt = f.transition("REVOKED");
    const controller = new AbortController();
    if (mode === "transport error")
      f.port.enforceCommittedTransition = vi.fn(async () => {
        throw Error("SOCKET_UNKNOWN");
      });
    if (mode === "mismatched ack")
      f.port.enforceCommittedTransition = vi.fn(async () => ({
        status: "ENFORCED" as const,
        receiptId: itemId,
        membershipGeneration: 777,
      }));
    if (mode === "cancel after commit")
      f.port.atomic = async (_scope, work) => {
        const result = await work(f.tx);
        controller.abort();
        return result;
      };
    expect(
      await f.authority.reconcileTransition(request(controller.signal), {
        ...input,
        operationId,
      }),
    ).toEqual({
      receipt,
      receiptState: "COMMITTED",
      enforcement: "UNCONFIRMED",
    });
    if (mode === "cancel after commit")
      expect(f.port.enforceCommittedTransition).not.toHaveBeenCalled();
    else expect(f.port.enforceCommittedTransition).toHaveBeenCalledTimes(1);
  },
);
