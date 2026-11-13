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
    observeDiscovery: vi.fn(),
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

it("a qualified invalidation bypasses successful read cooldown but preserves failure backoff", async () => {
  const f = fixture();
  const context = { ...(await f.deps.scope()), tripId: f.first };
  await f.read.trip(f.first);
  await f.read.invalidate(context);
  expect(f.deps.pull).toHaveBeenCalledTimes(2);
  f.deps.pull.mockRejectedValueOnce(Error("OFFLINE"));
  await expect(f.read.invalidate(context)).rejects.toThrow("OFFLINE");
  await f.read.invalidate(context);
  expect(f.deps.pull).toHaveBeenCalledTimes(3);
});

it("invalidation during a normal Pull performs a trailing read", async () => {
  const f = fixture();
  const context = { ...(await f.deps.scope()), tripId: f.first };
  let release!: (changed: boolean) => void;
  f.deps.pull.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const prior = f.read.trip(f.first);
  await vi.waitFor(() => expect(f.deps.pull).toHaveBeenCalledOnce());
  const invalidated = f.read.invalidate(context);
  release(false);
  await Promise.all([prior, invalidated]);
  expect(f.deps.pull).toHaveBeenCalledTimes(2);
});

it("never rebinds an old invalidation to the next Account", async () => {
  const f = fixture();
  const context = { ...(await f.deps.scope()), tripId: f.first };
  f.switchAccount();
  await expect(f.read.invalidate(context)).rejects.toThrow();
  expect(f.deps.pull).not.toHaveBeenCalled();
});

it("skips complete collections only for the same Actor-visible version", async () => {
  const f = fixture();
  const version = vi
    .fn()
    .mockResolvedValueOnce("visible-v1")
    .mockResolvedValueOnce("visible-v1")
    .mockResolvedValueOnce("visible-v2");
  const pull = vi
    .fn()
    .mockResolvedValueOnce({ changed: true, version: "visible-v1" })
    .mockResolvedValueOnce({ changed: true, version: "visible-v2" });
  const read = createTripDownstreamCoordinator({ ...f.deps, version, pull });
  await read.trip(f.first);
  f.tick(15_001);
  await read.trip(f.first);
  f.tick(15_001);
  await read.trip(f.first);
  expect(version).toHaveBeenCalledTimes(3);
  expect(pull).toHaveBeenCalledTimes(2);
  expect(f.deps.notify).toHaveBeenCalledTimes(2);
});

it("does not advance a checked version before the collection applies", async () => {
  const f = fixture();
  const version = vi.fn(async () => "visible-v1");
  const pull = vi.fn(async () => ({ changed: true, version: "visible-v1" }));
  const read = createTripDownstreamCoordinator({ ...f.deps, version, pull });
  pull.mockRejectedValueOnce(Error("APPLY_UNAVAILABLE"));
  await expect(read.trip(f.first)).rejects.toThrow("APPLY_UNAVAILABLE");
  f.tick(15_001);
  await read.trip(f.first);
  f.tick(15_001);
  await read.trip(f.first);
  expect(version).toHaveBeenCalledTimes(3);
  expect(pull).toHaveBeenCalledTimes(2);
  expect(f.deps.notify).toHaveBeenCalledOnce();
});

it("never pulls after a denied version check or an old Account response", async () => {
  const f = fixture();
  const version = vi.fn(async (_scope: AccountScope, _tripId: string) => "visible-v1");
  const read = createTripDownstreamCoordinator({ ...f.deps, version });
  version.mockRejectedValueOnce(Error("NOT_VISIBLE"));
  await expect(read.trip(f.first)).rejects.toThrow("NOT_VISIBLE");
  expect(f.deps.pull).not.toHaveBeenCalled();
  f.tick(15_001);
  let release!: (value: string) => void;
  version.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const pending = read.trip(f.first);
  const checked = expect(pending).rejects.toThrow();
  await vi.waitFor(() => expect(version).toHaveBeenCalledTimes(2));
  f.switchAccount();
  release("old-account-version");
  await checked;
  expect(f.deps.pull).not.toHaveBeenCalled();
  await read.trip(f.first);
  expect(f.deps.pull).toHaveBeenCalledOnce();
  expect(version.mock.calls[2][0].accountId).not.toEqual(
    version.mock.calls[1][0].accountId,
  );
});

it("caches applied collection V3 rather than an earlier version GET V2", async () => {
  const f = fixture();
  const version = vi
    .fn()
    .mockResolvedValueOnce("visible-v2")
    .mockResolvedValueOnce("visible-v3");
  const pull = vi.fn(async () => ({ changed: true, version: "visible-v3" }));
  const read = createTripDownstreamCoordinator({ ...f.deps, version, pull });
  await read.trip(f.first);
  f.tick(15_001);
  await read.trip(f.first);
  expect(version).toHaveBeenCalledTimes(2);
  expect(pull).toHaveBeenCalledOnce();
});

it("does not invent an applied token for a legacy boolean Pull result", async () => {
  const f = fixture();
  const version = vi.fn(async () => "visible-v1");
  const read = createTripDownstreamCoordinator({ ...f.deps, version });
  await read.trip(f.first);
  f.tick(15_001);
  await read.trip(f.first);
  expect(f.deps.pull).toHaveBeenCalledTimes(2);
});

it("summary discovery does not download every historical Trip", async () => {
  const f = fixture();
  await f.read.discovery();
  expect(f.deps.discover).toHaveBeenCalledOnce();
  expect(f.deps.pull).not.toHaveBeenCalled();
});

it("a foreground target cannot be rebound to a new Account", async () => {
  const f = fixture();
  const expected = await f.deps.scope();
  f.switchAccount();
  await expect(f.read.trip(f.first, expected)).rejects.toThrow();
  expect(f.deps.pull).not.toHaveBeenCalled();
});

it("Trip exit cannot let an in-flight collection restore its cleared token", async () => {
  const f = fixture();
  const version = vi.fn(async () => "visible-v3");
  const pull = vi.fn(async () => ({ changed: true, version: "visible-v3" }));
  let release!: (result: { changed: boolean; version: string }) => void;
  pull.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const read = createTripDownstreamCoordinator({ ...f.deps, version, pull });
  const pending = read.trip(f.first);
  await vi.waitFor(() => expect(pull).toHaveBeenCalledOnce());
  read.clearVersions();
  release({ changed: true, version: "visible-v3" });
  await pending;
  f.tick(15_001);
  await read.trip(f.first);
  f.tick(15_001);
  await read.trip(f.first);
  expect(pull).toHaveBeenCalledTimes(2);
});

it("Trip exit during a version check stops the old Trip collection request", async () => {
  const f = fixture();
  let release!: (version: string) => void;
  const version = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        release = resolve;
      }),
  );
  const read = createTripDownstreamCoordinator({ ...f.deps, version });
  const pending = read.trip(f.first);
  await vi.waitFor(() => expect(version).toHaveBeenCalledOnce());
  read.clearVersions();
  release("old-trip-version");
  await pending;
  expect(f.deps.pull).not.toHaveBeenCalled();
});

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

it("summary discovery does not download every historical Trip", async () => {
  const f = fixture();
  await f.read.discovery();
  expect(f.deps.discover).toHaveBeenCalledOnce();
  expect(f.deps.pull).not.toHaveBeenCalled();
});

it("a foreground target cannot be rebound to a new Account", async () => {
  const f = fixture();
  const expected = await f.deps.scope();
  f.switchAccount();
  await expect(f.read.trip(f.first, expected)).rejects.toThrow();
  expect(f.deps.pull).not.toHaveBeenCalled();
});

it.each(["blur", "another Trip"])(
  "does not begin an obsolete foreground pull after deferred scope: %s",
  async (reason) => {
    const f = fixture();
    const expected = await f.deps.scope();
    const target = {};
    let current: object | null = target;
    let release!: () => void;
    f.deps.scope.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return expected;
    });
    const pending = f.read.trip(f.first, expected, () => current === target);
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    current = reason === "blur" ? null : {};
    release();
    await pending;
    expect(f.deps.pull).not.toHaveBeenCalled();
    await f.read.trip(f.first, expected, () => true);
    expect(f.deps.pull).toHaveBeenCalledOnce();
  },
);

it.each(["blur", "another Trip"])(
  "rechecks the foreground lease at actual dequeue without cancelling a lawful in-flight read: %s",
  async (reason) => {
    const f = fixture();
    const expected = await f.deps.scope();
    let release!: () => void;
    f.deps.pull.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return true;
    });
    const inFlight = f.read.trip(f.first);
    await vi.waitFor(() => expect(f.deps.pull).toHaveBeenCalledOnce());
    const target = {};
    let current: object | null = target;
    const pending = f.read.trip(f.second, expected, () => current === target);
    await vi.waitFor(() =>
      expect(f.deps.scope.mock.calls.length).toBeGreaterThanOrEqual(3),
    );
    current = reason === "blur" ? null : {};
    release();
    await Promise.all([inFlight, pending]);
    expect(f.deps.pull).toHaveBeenCalledExactlyOnceWith(expected, f.first);
    await f.read.trip(f.second, expected, () => true);
    expect(f.deps.pull).toHaveBeenLastCalledWith(expected, f.second);
    expect(f.deps.pull).toHaveBeenCalledTimes(2);
  },
);

it("discovery observation confirms only a completed current discovery/cache apply, including truly empty results", async () => {
  const f = fixture(),
    scope = await f.deps.scope();
  let finish!: (ids: Awaited<ReturnType<typeof f.deps.discover>>) => void;
  f.deps.discover.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  expect(f.read.discoveryObservation(scope)).toBeNull();
  const pending = f.read.discovery();
  await vi.waitFor(() => expect(f.deps.discover).toHaveBeenCalledOnce());
  expect(f.read.discoveryObservation(scope)?.status).toBe("RESTORING");
  f.deps.notify(scope, [], true); // A bootstrap/cache-only notification is not discovery success.
  expect(f.read.discoveryObservation(scope)?.status).toBe("RESTORING");
  finish([]);
  await pending;
  expect(f.read.discoveryObservation(scope)).toEqual({ scope, status: "CONFIRMED" });
  expect(f.deps.observeDiscovery.mock.calls.map(([event]) => event.status)).toEqual([
    "RESTORING",
    "CONFIRMED",
  ]);
});
it("failed discovery stays unavailable without replacing cache and old-generation confirmation is inaccessible", async () => {
  const f = fixture(),
    scope = await f.deps.scope();
  await f.read.discovery();
  f.tick(15_001);
  f.deps.discover.mockRejectedValueOnce(Error("DISCOVERY_FAILED"));
  await expect(f.read.discovery()).rejects.toThrow("DISCOVERY_FAILED");
  expect(f.read.discoveryObservation(scope)?.status).toBe("UNAVAILABLE");
  expect(f.deps.notify).toHaveBeenCalledTimes(1);
  f.switchAccount();
  expect(f.read.discoveryObservation(scope)).toBeNull();
  expect(f.read.discoveryObservation(await f.deps.scope())).toBeNull();
});
