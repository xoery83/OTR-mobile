import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { getAccountGeneration } from "../auth/accountGeneration";
import { createTripRealtimeTrigger } from "./tripRealtimeTrigger";
import { createTripDownstreamCoordinator } from "./tripDownstreamCoordinator";
vi.mock("react-native", () => ({ AppState: { currentState: "active" } }));
const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.splice(0).forEach((close) => close());
  vi.useRealTimers();
});

function fixture() {
  const context = {
    accountId: randomUUID(),
    tripId: randomUUID(),
    generation: getAccountGeneration(),
  };
  let remote = 1,
    accepted = 0;
  let hint = () => {},
    disconnected = () => {};
  const account = async () => context.accountId;
  const pull = vi.fn(async () => {
    const changed = accepted !== remote;
    accepted = remote;
    return changed;
  });
  const notify = vi.fn();
  const read = createTripDownstreamCoordinator({
    account,
    scope: async () => context,
    discover: async () => [context.tripId],
    pull,
    notify,
  });
  const trigger = createTripRealtimeTrigger({
    account,
    available: async () => true,
    invalidate: read.invalidate,
    subscribe: async (_context, changed, lost) => {
      hint = changed;
      disconnected = lost;
      return () => {};
    },
  });
  cleanup.push(trigger.dispose);
  return {
    context,
    trigger,
    pull,
    notify,
    hint: () => hint(),
    disconnect: () => disconnected(),
    remote(value: number) {
      remote = value;
    },
    accepted: () => accepted,
  };
}

it("authorized hint → existing Downstream → accepted fixture → notify; reconnect catches missed changes", async () => {
  vi.useFakeTimers();
  const f = fixture();
  await f.trigger.activate(f.context);
  expect(f.accepted()).toBe(1);
  f.remote(2);
  const reads = f.pull.mock.calls.length;
  for (let i = 0; i < 10; i++) {
    f.hint();
    await vi.advanceTimersByTimeAsync(10);
  }
  expect(f.accepted()).toBe(1);
  await vi.advanceTimersByTimeAsync(150);
  expect(f.pull).toHaveBeenCalledTimes(reads + 1);
  expect(f.accepted()).toBe(2);
  expect(f.pull).toHaveBeenCalledTimes(2);
  expect(f.notify).toHaveBeenLastCalledWith(f.context, [f.context.tripId], false);
  // An unchanged authorized collection preserves accepted state and emits no extra notify.
  f.hint();
  await vi.advanceTimersByTimeAsync(250);
  expect(f.pull).toHaveBeenCalledTimes(3);
  expect(f.notify).toHaveBeenCalledTimes(2);
  f.disconnect();
  f.remote(3);
  f.hint();
  await vi.advanceTimersByTimeAsync(250);
  expect(f.accepted()).toBe(2);
  await f.trigger.activate(f.context);
  expect(f.accepted()).toBe(3);
  expect(f.pull).toHaveBeenCalledTimes(4);
});

it("hint bursts do not bypass the existing Downstream failure backoff", async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.pull.mockRejectedValueOnce(Error("OFFLINE"));
  await f.trigger.activate(f.context);
  expect(f.accepted()).toBe(0);
  for (let i = 0; i < 10; i++) f.hint();
  await vi.advanceTimersByTimeAsync(250);
  expect(f.pull).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(15_000);
  f.hint();
  await vi.advanceTimersByTimeAsync(250);
  expect(f.pull).toHaveBeenCalledTimes(2);
  expect(f.accepted()).toBe(1);
});

it("a reconcile inside failure backoff retains the last hint for the later lifecycle retry", async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.pull.mockRejectedValueOnce(Error("CURSOR_COMMIT_FAILED"));
  await f.trigger.activate(f.context);
  expect(f.pull).toHaveBeenCalledOnce();
  await f.trigger.activate(f.context);
  expect(f.pull).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(15_001);
  await f.trigger.activate(f.context);
  expect(f.pull).toHaveBeenCalledTimes(2);
  expect(f.accepted()).toBe(1);
});
