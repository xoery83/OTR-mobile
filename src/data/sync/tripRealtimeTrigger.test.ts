import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import {
  advanceAccountGeneration,
  getAccountGeneration,
} from "../auth/accountGeneration";
import { createTripRealtimeTrigger } from "./tripRealtimeTrigger";

const dispose: (() => void)[] = [];
afterEach(() => {
  dispose.splice(0).forEach((close) => close());
  vi.useRealTimers();
});
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
        _signal: AbortSignal,
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
  const signal = f.deps.subscribe.mock.calls[0][3];
  f.trigger.stop();
  expect(signal.aborted).toBe(true);
  release(f.close);
  await opening;
  expect(f.close).toHaveBeenCalledOnce();
  expect(f.deps.invalidate).not.toHaveBeenCalled();
});

it("aborts an opening subscription immediately on Account switch", async () => {
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
  const signal = f.deps.subscribe.mock.calls[0][3];
  advanceAccountGeneration();
  expect(signal.aborted).toBe(true);
  release(f.close);
  await opening;
  expect(f.close).toHaveBeenCalledOnce();
  expect(f.deps.invalidate).not.toHaveBeenCalled();
});

it("closes a stalled opening after 15 seconds and ignores its late result", async () => {
  vi.useFakeTimers();
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
  const signal = f.deps.subscribe.mock.calls[0][3];
  await vi.advanceTimersByTimeAsync(15_000);
  expect(signal.aborted).toBe(true);
  release(f.close);
  await opening;
  expect(f.close).toHaveBeenCalledOnce();
  expect(f.deps.invalidate).not.toHaveBeenCalled();
  await f.trigger.activate(f.context);
  expect(f.deps.invalidate).toHaveBeenCalledOnce();
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

it("keeps one subscription and initial Pull for repeated current Trip activation", async () => {
  const f = fixture();
  await f.trigger.activate(f.context);
  await f.trigger.activate({ ...f.context });
  expect(f.deps.subscribe).toHaveBeenCalledOnce();
  expect(f.close).not.toHaveBeenCalled();
  expect(f.deps.invalidate).toHaveBeenCalledOnce();
});

it("coalesces short spaced hints even when scoped Pull completes immediately", async () => {
  vi.useFakeTimers();
  const f = fixture();
  await f.trigger.activate(f.context);
  for (let i = 0; i < 10; i++) {
    f.signal();
    await vi.advanceTimersByTimeAsync(10);
  }
  expect(f.deps.invalidate).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(150);
  expect(f.deps.invalidate).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1000);
  expect(f.deps.invalidate).toHaveBeenCalledTimes(2);
});

it("cancels a queued hint on Trip change and ignores the old channel", async () => {
  vi.useFakeTimers();
  const f = fixture();
  await f.trigger.activate(f.context);
  const oldHint = f.deps.subscribe.mock.calls[0][1];
  oldHint();
  const next = { ...f.context, tripId: randomUUID() };
  await f.trigger.activate(next);
  oldHint();
  await vi.advanceTimersByTimeAsync(500);
  expect(f.close).toHaveBeenCalledOnce();
  expect(f.deps.invalidate.mock.calls.map(([c]) => c.tripId)).toEqual([
    f.context.tripId,
    next.tripId,
  ]);
});

it("cancels a queued hint immediately when Account generation changes", async () => {
  vi.useFakeTimers();
  const f = fixture();
  await f.trigger.activate(f.context);
  f.signal();
  advanceAccountGeneration();
  await vi.advanceTimersByTimeAsync(500);
  expect(f.deps.subscribe.mock.calls[0][3].aborted).toBe(true);
  expect(f.close).toHaveBeenCalledOnce();
  expect(f.deps.invalidate).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("rechecks availability on repeated activation without reopening offline", async () => {
  const f = fixture();
  await f.trigger.activate(f.context);
  f.deps.available.mockResolvedValue(false);
  await f.trigger.activate({ ...f.context });
  expect(f.close).toHaveBeenCalledOnce();
  expect(f.deps.subscribe).toHaveBeenCalledOnce();
});

it("disconnect cancels queued hints and reconnect catches up once", async () => {
  vi.useFakeTimers();
  const f = fixture();
  await f.trigger.activate(f.context);
  const oldHint = f.deps.subscribe.mock.calls[0][1];
  oldHint();
  f.disconnected();
  oldHint();
  await vi.advanceTimersByTimeAsync(500);
  expect(f.deps.invalidate).toHaveBeenCalledOnce();
  await f.trigger.activate(f.context);
  oldHint();
  await vi.advanceTimersByTimeAsync(500);
  expect(f.deps.subscribe).toHaveBeenCalledTimes(2);
  expect(f.deps.invalidate).toHaveBeenCalledTimes(2);
});

it("a late same-Trip availability check cannot stop a newer Trip", async () => {
  const f = fixture();
  await f.trigger.activate(f.context);
  let release!: (value: boolean) => void;
  f.deps.available.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const oldActivation = f.trigger.activate({ ...f.context });
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  const next = { ...f.context, tripId: randomUUID() };
  await f.trigger.activate(next);
  release(true);
  await oldActivation;
  expect(f.deps.subscribe).toHaveBeenCalledTimes(2);
  expect(f.close).toHaveBeenCalledOnce();
  expect(f.deps.invalidate).toHaveBeenLastCalledWith(next);
});

it("background or Trip exit cancels pending hints before any extra Pull", async () => {
  vi.useFakeTimers();
  const f = fixture();
  await f.trigger.activate(f.context);
  f.signal();
  await f.trigger.activate(null);
  await vi.advanceTimersByTimeAsync(500);
  expect(f.deps.subscribe.mock.calls[0][3].aborted).toBe(true);
  expect(f.close).toHaveBeenCalledOnce();
  expect(f.deps.invalidate).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("retains a failed invalidation for the next lifecycle reconcile without another signal", async () => {
  const f = fixture();
  f.deps.invalidate.mockRejectedValueOnce(Error("CURSOR_COMMIT_FAILED"));
  await f.trigger.activate(f.context);
  expect(f.deps.invalidate).toHaveBeenCalledOnce();
  await f.trigger.activate(f.context);
  expect(f.deps.invalidate).toHaveBeenCalledTimes(2);
  await f.trigger.activate(f.context);
  expect(f.deps.invalidate).toHaveBeenCalledTimes(2);
});
