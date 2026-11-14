import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createTripPrivateRealtimeAuthorization } from "./tripPrivateRealtimeAuthorization";
import { advanceAccountGeneration, getAccountGeneration } from "./accountGeneration";
const accountId = "11111111-1111-4111-8111-111111111111";
const tripId = "22222222-2222-4222-8222-222222222222";
const leaseId = "33333333-3333-4333-8333-333333333333";
const context = () => ({ accountId, tripId, generation: getAccountGeneration() });
let events: Parameters<
  NonNullable<Parameters<typeof createTripPrivateRealtimeAuthorization>[0]["open"]>
>[1];
const close = vi.fn();
const accessRevoked = vi.fn(async () => {});
const invalidated = vi.fn();
const disconnected = vi.fn();
const lease = (authorizationRevision = 1) => ({
  accountId,
  tripId,
  actorPersonId: accountId,
  leaseId,
  channel: "server-opaque-channel",
  authorizationRevision,
  expiresAt: Date.now() + 1_000,
});
const open = vi.fn(async (_context, callbacks) => {
  events = callbacks;
  return { lease: lease(), close };
});
const tick = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  open.mockImplementation(async (_context, callbacks) => {
    events = callbacks;
    return { lease: lease(), close };
  });
});
afterEach(() => vi.useRealTimers());
it("is closed without a qualified owning port", async () => {
  const subscribe = createTripPrivateRealtimeAuthorization({
    account: async () => accountId,
    accessRevoked,
  });
  await expect(
    subscribe(context(), invalidated, disconnected, new AbortController().signal),
  ).rejects.toThrow("UNAVAILABLE");
});
it("only matching lease hints notify; expiry closes without revoking cache", async () => {
  const subscribe = createTripPrivateRealtimeAuthorization({
    account: async () => accountId,
    open,
    accessRevoked,
  });
  await subscribe(context(), invalidated, disconnected, new AbortController().signal);
  events.invalidated({ leaseId: "wrong", authorizationRevision: 1 });
  events.invalidated({ leaseId, authorizationRevision: 1 });
  await tick();
  expect(invalidated).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1000);
  events.invalidated({ leaseId, authorizationRevision: 1 });
  await tick();
  expect(invalidated).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalled();
  expect(accessRevoked).not.toHaveBeenCalled();
});
it("Account transition drops late hints and late revocations", async () => {
  const subscribe = createTripPrivateRealtimeAuthorization({
    account: async () => accountId,
    open,
    accessRevoked,
  });
  await subscribe(context(), invalidated, disconnected, new AbortController().signal);
  advanceAccountGeneration();
  events.invalidated({ leaseId, authorizationRevision: 1 });
  events.revoked({ accountId, tripId, receiptId: leaseId, authorizationRevision: 2 });
  await tick();
  expect(close).toHaveBeenCalled();
  expect(invalidated).not.toHaveBeenCalled();
  expect(accessRevoked).not.toHaveBeenCalled();
});
it("revoke closes and fences older/equal regrant; newer fresh authorization can reopen", async () => {
  const subscribe = createTripPrivateRealtimeAuthorization({
    account: async () => accountId,
    open,
    accessRevoked,
  });
  await subscribe(context(), invalidated, disconnected, new AbortController().signal);
  events.revoked({ accountId, tripId, receiptId: leaseId, authorizationRevision: 2 });
  await tick();
  expect(accessRevoked).toHaveBeenCalledTimes(1);
  await expect(
    subscribe(context(), invalidated, disconnected, new AbortController().signal),
  ).rejects.toThrow("REJECTED");
  open.mockImplementationOnce(async (_context, callbacks) => {
    events = callbacks;
    return { lease: lease(3), close };
  });
  const stop = await subscribe(
    context(),
    invalidated,
    disconnected,
    new AbortController().signal,
  );
  stop();
});
it("abort during join closes the late transport and rejects qualification", async () => {
  let resolve!: (value: { lease: ReturnType<typeof lease>; close: typeof close }) => void;
  open.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const controller = new AbortController();
  const subscribe = createTripPrivateRealtimeAuthorization({
    account: async () => accountId,
    open,
    accessRevoked,
  });
  const pending = subscribe(context(), invalidated, disconnected, controller.signal);
  await tick();
  controller.abort();
  resolve({ lease: lease(), close });
  await expect(pending).rejects.toThrow("REJECTED");
  expect(close).toHaveBeenCalled();
});
it("a foreign Account lease cannot qualify a matching socket join", async () => {
  open.mockResolvedValueOnce({ lease: { ...lease(), accountId: tripId }, close });
  const subscribe = createTripPrivateRealtimeAuthorization({
    account: async () => accountId,
    open,
    accessRevoked,
  });
  await expect(
    subscribe(context(), invalidated, disconnected, new AbortController().signal),
  ).rejects.toThrow("REJECTED");
  expect(invalidated).not.toHaveBeenCalled();
});

it("failed authoritative cache fence prevents regrant even with a newer lease", async () => {
  const failedFence = vi.fn(async () => {
    throw Error("SQLITE_UNAVAILABLE");
  });
  const subscribe = createTripPrivateRealtimeAuthorization({
    account: async () => accountId,
    open,
    accessRevoked: failedFence,
  });
  await subscribe(context(), invalidated, disconnected, new AbortController().signal);
  events.revoked({ accountId, tripId, receiptId: leaseId, authorizationRevision: 2 });
  await tick();
  open.mockImplementationOnce(async (_context, callbacks) => {
    events = callbacks;
    return { lease: lease(3), close };
  });
  await expect(
    subscribe(context(), invalidated, disconnected, new AbortController().signal),
  ).rejects.toThrow("CACHE_FENCE_UNCONFIRMED");
  expect(open).toHaveBeenCalledTimes(1);
});

it("abort during initial Account lookup never calls the owning open port", async () => {
  let resolve!: (value: string) => void;
  const account = vi.fn(
    () =>
      new Promise<string>((done) => {
        resolve = done;
      }),
  );
  const subscribe = createTripPrivateRealtimeAuthorization({
    account,
    open,
    accessRevoked,
  });
  const controller = new AbortController();
  const pending = subscribe(context(), invalidated, disconnected, controller.signal);
  controller.abort();
  resolve(accountId);
  await expect(pending).rejects.toThrow("UNAVAILABLE");
  expect(open).not.toHaveBeenCalled();
});
it("matching authoritative revoke closes synchronously before an Account read can stall", async () => {
  let resolve!: (value: string) => void;
  const account = vi.fn(async () => accountId);
  const subscribe = createTripPrivateRealtimeAuthorization({
    account,
    open,
    accessRevoked,
  });
  await subscribe(context(), invalidated, disconnected, new AbortController().signal);
  account.mockImplementationOnce(
    () =>
      new Promise<string>((done) => {
        resolve = done;
      }),
  );
  events.revoked({ accountId, tripId, receiptId: leaseId, authorizationRevision: 2 });
  expect(close).toHaveBeenCalledTimes(1);
  expect(accessRevoked).not.toHaveBeenCalled();
  resolve(accountId);
  await tick();
  expect(accessRevoked).toHaveBeenCalledTimes(1);
});
it("an older concurrent cache acknowledgement cannot clear a newer failed revoke fence", async () => {
  let finishOlder!: () => void;
  const cache = vi.fn(async (_scope, receipt) => {
    if (receipt.authorizationRevision === 2)
      await new Promise<void>((done) => {
        finishOlder = done;
      });
    else throw Error("CACHE_WRITE_FAILED");
  });
  const subscribe = createTripPrivateRealtimeAuthorization({
    account: async () => accountId,
    open,
    accessRevoked: cache,
  });
  await subscribe(context(), invalidated, disconnected, new AbortController().signal);
  const firstEvents = events;
  await subscribe(context(), invalidated, disconnected, new AbortController().signal);
  firstEvents.revoked({
    accountId,
    tripId,
    receiptId: leaseId,
    authorizationRevision: 2,
  });
  events.revoked({ accountId, tripId, receiptId: leaseId, authorizationRevision: 3 });
  await tick();
  finishOlder();
  await tick();
  open.mockResolvedValueOnce({ lease: lease(4), close });
  await expect(
    subscribe(context(), invalidated, disconnected, new AbortController().signal),
  ).rejects.toThrow("CACHE_FENCE_UNCONFIRMED");
  expect(open).toHaveBeenCalledTimes(2);
});
