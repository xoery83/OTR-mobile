import { expect, it, vi } from "vitest";
import {
  createTripPrivateRealtimeAuthority,
  type RealtimeMembershipTransition,
} from "./tripPrivateRealtimeAuthority";
import {
  createTripPrivateRealtimePgAuthorityPort,
  type RealtimeCoreAtomicPort,
  type RealtimeHeldCoreAuthority,
} from "./tripPrivateRealtimeAuthorityPg";
const accountId = "11111111-1111-4111-8111-111111111111";
const tripId = "22222222-2222-4222-8222-222222222222";
const personId = "33333333-3333-4333-8333-333333333333";
const sessionId = "44444444-4444-4444-8444-444444444444";
const leaseId = "55555555-5555-4555-8555-555555555555";
const epoch = "66666666-6666-4666-8666-666666666666";
const operationId = "77777777-7777-4777-8777-777777777777";
const request = () =>
  new Request("https://unit.invalid", {
    headers: { Authorization: "Bearer unit-session" },
  });
function fixture() {
  const state = {
    generation: 7,
    active: true,
    sessionId,
    epoch,
    failCommit: false,
    receipt: null as unknown,
  };
  let check!: () => Promise<void>;
  const close = vi.fn();
  const precommit: string[] = [];
  const held: RealtimeHeldCoreAuthority = {
    query: async (text) => ({
      rows: text.includes("trip_realtime_transitions")
        ? [{ receipt: state.receipt }]
        : [{ generation: state.generation }],
    }),
    currentSession: async () => ({ sessionId: state.sessionId, accountId }),
    currentActor: async () => ({
      accountId,
      tripId,
      active: state.active,
      personId,
      personIds: [personId],
      canManageShared: false,
    }),
    qualifyCore: async () => ({
      qualification: "NOT_A_PRIVATE_JOIN_LEASE",
      actorAccountId: accountId,
      tripId,
      actorPersonId: personId,
      coreEpoch: state.epoch,
      coreAccessRevision: 100,
    }),
    readVisibleItem: async () => null,
  };
  const core: RealtimeCoreAtomicPort = {
    withScope: async (_scope, work) => {
      const result = await work(held);
      if (state.failCommit) throw Error("COMMIT_UNKNOWN");
      return result;
    },
  };
  const port = createTripPrivateRealtimePgAuthorityPort({
    core,
    transport: {
      open: async (scope, binding, _core, assertCurrent) => {
        expect(scope.sessionId).toBe(sessionId);
        check = assertCurrent;
        try {
          await assertCurrent();
        } catch (error) {
          precommit.push((error as Error).message);
        }
        return {
          lease: {
            accountId,
            tripId,
            actorPersonId: personId,
            leaseId,
            channel: "unit-private",
            authorizationRevision: binding.membershipGeneration,
            expiresAt: Date.now() + 60_000,
          },
          close,
        };
      },
    },
  });
  const authority = createTripPrivateRealtimeAuthority({
    gateway: {
      validateAccessToken: async () => ({
        id: accountId,
        accountClass: "NORMAL_ACCOUNT",
      }),
    },
    port,
  });
  return { held, state, authority, port, precommit, close, check: () => check() };
}
it("forbids delivery before actual admission commit and binds exact current Session", async () => {
  const f = fixture();
  const opened = await f.authority.subscribe(request(), { tripId, localGeneration: 1 });
  expect(f.precommit).toEqual(["PRIVATE_REALTIME_JOIN_NOT_COMMITTED"]);
  await f.check();
  f.state.sessionId = leaseId;
  await expect(f.check()).rejects.toThrow("SESSION_CHANGED");
  opened.close();
});
it("old generation stays denied after revoke and regrant, while fresh admission uses the new generation", async () => {
  const f = fixture();
  const original = await f.authority.subscribe(request(), { tripId, localGeneration: 1 });
  f.state.active = false;
  f.state.generation = 8;
  await expect(f.check()).rejects.toThrow("STALE_GENERATION");
  f.state.active = true;
  f.state.generation = 9;
  await expect(f.check()).rejects.toThrow("LEASE_CLOSED");
  const next = await f.authority.subscribe(request(), { tripId, localGeneration: 2 });
  expect(next.lease.authorizationRevision).toBe(9);
  original.close();
  next.close();
});
it("Core epoch is checked separately and cannot be converted to an Auth generation", async () => {
  const f = fixture();
  const opened = await f.authority.subscribe(request(), { tripId, localGeneration: 1 });
  f.state.epoch = leaseId;
  await expect(f.check()).rejects.toThrow("CORE_EPOCH_CHANGED");
  expect(f.state.generation).toBe(7);
  opened.close();
});
it("unknown commit cannot leave a usable or acknowledged private join", async () => {
  const f = fixture();
  f.state.failCommit = true;
  await expect(
    f.authority.subscribe(request(), { tripId, localGeneration: 1 }),
  ).rejects.toThrow("COMMIT_UNKNOWN");
  expect(f.close).toHaveBeenCalledTimes(1);
  await expect(f.check()).rejects.toThrow("JOIN_NOT_COMMITTED");
});
it("receipt lookup is scoped and does not fabricate forced transport enforcement", async () => {
  const f = fixture();
  const receipt: RealtimeMembershipTransition = {
    receiptId: leaseId,
    operationId,
    accountId,
    tripId,
    actorPersonId: personId,
    kind: "REVOKED",
    previousGeneration: 7,
    membershipGeneration: 8,
  };
  f.state.receipt = Object.fromEntries(Object.entries(receipt).reverse());
  const result = await f.port.enforceCommittedTransition(
    { accountId, tripId, localGeneration: 1, accessToken: "unit-session" },
    receipt,
  );
  expect(result).toEqual({
    status: "UNCONFIRMED",
    receiptId: leaseId,
    membershipGeneration: 8,
  });
});

it("server callback rejects expiry even when the lifecycle timer has not run", async () => {
  vi.useFakeTimers();
  const f = fixture();
  const opened = await f.authority.subscribe(request(), { tripId, localGeneration: 1 });
  try {
    vi.setSystemTime(Date.now() + 60_001);
    await expect(f.check()).rejects.toThrow("LEASE_EXPIRED");
    expect(f.close).toHaveBeenCalledTimes(1);
  } finally {
    opened.close();
    vi.useRealTimers();
  }
});
it("server callback checks returned lease expiry again after asynchronous current Session IO", async () => {
  vi.useFakeTimers();
  const f = fixture();
  const opened = await f.authority.subscribe(request(), { tripId, localGeneration: 1 });
  try {
    let resume!: (value: { sessionId: string; accountId: string }) => void;
    vi.spyOn(f.held, "currentSession").mockImplementationOnce(
      () =>
        new Promise((done) => {
          resume = done;
        }),
    );
    const pending = f.check();
    vi.setSystemTime(Date.now() + 60_001);
    resume({ sessionId, accountId });
    await expect(pending).rejects.toThrow("LEASE_EXPIRED");
    expect(f.close).toHaveBeenCalledTimes(1);
  } finally {
    opened.close();
    vi.useRealTimers();
  }
});
