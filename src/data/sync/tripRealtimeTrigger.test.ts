import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import {
  advanceAccountGeneration,
  getAccountGeneration,
} from "../auth/accountGeneration";
import { createTripRealtimeTrigger } from "./tripRealtimeTrigger";

const dispose: (() => void)[] = [];
afterEach(() => dispose.splice(0).forEach((close) => close()));
function fixture() {
  const context = {
    accountId: randomUUID(),
    tripId: randomUUID(),
    generation: getAccountGeneration(),
  };
  let signal = () => {},
    disconnected = () => {};
  const close = vi.fn();
  const deps = {
    account: vi.fn(async () => context.accountId),
    available: vi.fn(async () => true),
    invalidate: vi.fn(async (_context: typeof context) => {}),
    subscribe: vi.fn(
      async (
        _context: typeof context,
        changed: () => void,
        lost: () => void,
      ): Promise<() => void> => {
        signal = changed;
        disconnected = lost;
        return close;
      },
    ),
  };
  const trigger = createTripRealtimeTrigger(deps);
  dispose.push(trigger.dispose);
  return {
    context,
    deps,
    trigger,
    close,
    signal: () => signal(),
    disconnected: () => disconnected(),
  };
}

it("stays closed without an owning port; no subscription or Pull", async () => {
  const f = fixture();
  const trigger = createTripRealtimeTrigger({ ...f.deps, subscribe: undefined });
  dispose.push(trigger.dispose);
  await trigger.activate(f.context);
  expect(f.deps.subscribe).not.toHaveBeenCalled();
  expect(f.deps.invalidate).not.toHaveBeenCalled();
});

it("subscribes first, then invokes the existing scoped invalidation", async () => {
  const f = fixture();
  await f.trigger.activate(f.context);
  expect(f.deps.subscribe).toHaveBeenCalledOnce();
  expect(f.deps.invalidate).toHaveBeenCalledExactlyOnceWith(f.context);
  expect(f.deps.subscribe.mock.invocationCallOrder[0]).toBeLessThan(
    f.deps.invalidate.mock.invocationCallOrder[0],
  );
});

it("coalesces a burst during a read into one trailing Pull", async () => {
  const f = fixture();
  await f.trigger.activate(f.context);
  let release!: () => void;
  f.deps.invalidate.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  f.signal();
  await vi.waitFor(() => expect(f.deps.invalidate).toHaveBeenCalledTimes(2));
  for (let i = 0; i < 20; i++) f.signal();
  release();
  await vi.waitFor(() => expect(f.deps.invalidate).toHaveBeenCalledTimes(3));
});

it("immediately closes on Account generation transition and ignores old callbacks", async () => {
  const f = fixture();
  await f.trigger.activate(f.context);
  advanceAccountGeneration();
  expect(f.close).toHaveBeenCalledOnce();
  f.signal();
  await Promise.resolve();
  expect(f.deps.invalidate).toHaveBeenCalledOnce();
});

it("rejects an unauthorized Account before subscribing", async () => {
  const f = fixture();
  f.deps.account.mockResolvedValue(randomUUID());
  await f.trigger.activate(f.context);
  expect(f.deps.subscribe).not.toHaveBeenCalled();
});

it("stays closed offline/background and reconnects with a fresh initial Pull", async () => {
  const f = fixture();
  f.deps.available.mockResolvedValue(false);
  await f.trigger.activate(f.context);
  expect(f.deps.subscribe).not.toHaveBeenCalled();
  f.deps.available.mockResolvedValue(true);
  await f.trigger.activate(f.context);
  f.disconnected();
  expect(f.close).toHaveBeenCalledOnce();
  f.signal();
  await f.trigger.activate(f.context);
  expect(f.deps.invalidate).toHaveBeenCalledTimes(2);
});

it("closes a late subscription after Trip exit without reading either Trip", async () => {
  const f = fixture();
  let release!: (close: () => void) => void;
  f.deps.subscribe.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const opening = f.trigger.activate(f.context);
  await vi.waitFor(() => expect(f.deps.subscribe).toHaveBeenCalledOnce());
  f.trigger.stop();
  release(f.close);
  await opening;
  expect(f.close).toHaveBeenCalledOnce();
  expect(f.deps.invalidate).not.toHaveBeenCalled();
});

it("does not trust an early callback from a failed subscription", async () => {
  const f = fixture();
  f.deps.subscribe.mockImplementationOnce(async (_ctx, signal) => {
    signal();
    throw Error("DENIED");
  });
  await f.trigger.activate(f.context);
  expect(f.deps.invalidate).not.toHaveBeenCalled();
});

it("does not let cleanup failure interrupt the Account generation event", async () => {
  const f = fixture();
  await f.trigger.activate(f.context);
  f.close.mockImplementation(() => {
    throw Error("CLOSE_FAILED");
  });
  expect(() => advanceAccountGeneration()).not.toThrow();
  f.signal();
  expect(f.deps.invalidate).toHaveBeenCalledOnce();
});
