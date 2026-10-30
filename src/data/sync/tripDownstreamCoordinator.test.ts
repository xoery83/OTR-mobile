import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  advanceAccountGeneration,
  getAccountGeneration,
} from "../auth/accountGeneration";
import { createTripDownstreamCoordinator } from "./tripDownstreamCoordinator";
import type { AccountScope } from "../auth/accountRequestContext";
vi.mock("react-native", () => ({ AppState: { currentState: "active" } }));

function fixture() {
  let account = randomUUID(),
    now = 0;
  const first = randomUUID(),
    second = randomUUID();
  const deps = {
    account: async () => account,
    scope: vi.fn(async () => ({
      accountId: account,
      generation: getAccountGeneration(),
    })),
    discover: vi.fn(async () => [first, second]),
    pull: vi.fn(async (_scope: AccountScope, _tripId: string) => true),
    notify: vi.fn(),
    now: () => now,
  };
  return {
    deps,
    first,
    second,
    read: createTripDownstreamCoordinator(deps),
    tick(ms: number) {
      now += ms;
    },
    switchAccount() {
      account = randomUUID();
      advanceAccountGeneration();
    },
  };
}

it("coalesces duplicate Trip triggers and notifies only changed accepted content", async () => {
  const f = fixture();
  let release!: (changed: boolean) => void;
  f.deps.pull.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const first = f.read.trip(f.first),
    second = f.read.trip(f.first);
  await vi.waitFor(() => expect(f.deps.pull).toHaveBeenCalledOnce());
  release(true);
  await Promise.all([first, second]);
  expect(f.deps.notify).toHaveBeenCalledTimes(1);
  await f.read.trip(f.first);
  expect(f.deps.pull).toHaveBeenCalledOnce();
  f.tick(15_001);
  f.deps.pull.mockResolvedValueOnce(false);
  await f.read.trip(f.first);
  expect(f.deps.pull).toHaveBeenCalledTimes(2);
  expect(f.deps.notify).toHaveBeenCalledTimes(1);
});

it("serializes Trip collections and continues after one Trip read fails", async () => {
  const f = fixture();
  f.deps.pull.mockRejectedValueOnce(Error("READ_UNAVAILABLE"));
  await f.read.account();
  expect(f.deps.pull.mock.calls.map((args) => args[1])).toEqual([f.first, f.second]);
  expect(f.deps.notify.mock.calls.map((args) => args[1])).toEqual([[], [f.second]]);
});

it("preserves failure backoff without marking failed reads applied", async () => {
  const f = fixture();
  f.deps.pull.mockRejectedValue(Error("OFFLINE"));
  await expect(f.read.trip(f.first)).rejects.toThrow("OFFLINE");
  await f.read.trip(f.first);
  expect(f.deps.pull).toHaveBeenCalledOnce();
  f.tick(15_001);
  await expect(f.read.trip(f.first)).rejects.toThrow("OFFLINE");
  f.tick(15_001);
  await f.read.trip(f.first);
  expect(f.deps.pull).toHaveBeenCalledTimes(2);
  expect(f.deps.notify).not.toHaveBeenCalled();
});

it("rejects a late old Account response and keeps the new Account independently readable", async () => {
  const f = fixture();
  let release!: (changed: boolean) => void;
  f.deps.pull.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const first = f.read.trip(f.first);
  const checked = expect(first).rejects.toThrow();
  await vi.waitFor(() => expect(f.deps.pull).toHaveBeenCalledOnce());
  f.switchAccount();
  release(true);
  await checked;
  expect(f.deps.notify).not.toHaveBeenCalled();
  await f.read.trip(f.first);
  expect(f.deps.pull).toHaveBeenCalledTimes(2);
  expect(f.deps.notify).toHaveBeenCalledOnce();
});

it("does not pull a Guest, background, offline or closed scope", async () => {
  const f = fixture();
  f.deps.scope.mockResolvedValue(null as never);
  await f.read.account();
  await f.read.trip(f.first);
  expect(f.deps.discover).not.toHaveBeenCalled();
  expect(f.deps.pull).not.toHaveBeenCalled();
});

it("coalesces Account discovery without blocking its individual Trip pulls", async () => {
  const f = fixture();
  await Promise.all([f.read.account(), f.read.account()]);
  expect(f.deps.discover).toHaveBeenCalledOnce();
  expect(f.deps.pull).toHaveBeenCalledTimes(2);
});
