import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useUpdatesSignal } from "./useUpdatesSignal";
const s = vi.hoisted(() => ({
  slots: [] as any[],
  cursor: 0,
  effects: [] as (() => void)[],
  generation: 1,
  open: vi.fn(),
  signal: vi.fn(),
  appChange: null as null | ((state: string) => void),
}));
const same = (a: unknown[], b: unknown[]) =>
  a?.length === b.length && a.every((value, index) => Object.is(value, b[index]));
vi.mock("react", () => ({
  useSyncExternalStore: () => s.generation,
  useState: (initial: unknown) => {
    const i = s.cursor++;
    s.slots[i] ??= { value: initial };
    return [
      s.slots[i].value,
      (value: unknown) => {
        s.slots[i].value = value;
      },
    ];
  },
  useRef: (initial: unknown) => (s.slots[s.cursor++] ??= { current: initial }),
  useMemo: (make: () => unknown, deps: unknown[]) => {
    const i = s.cursor++;
    if (!s.slots[i] || !same(s.slots[i].deps, deps)) s.slots[i] = { deps, value: make() };
    return s.slots[i].value;
  },
  useLayoutEffect: (effect: () => unknown, deps: unknown[]) => {
    const i = s.cursor++;
    if (!s.slots[i] || !same(s.slots[i].deps, deps)) {
      s.slots[i]?.cleanup?.();
      s.slots[i] = { deps, cleanup: effect() };
    }
  },
  useEffect: (effect: () => unknown, deps: unknown[]) => {
    const i = s.cursor++;
    if (!s.slots[i] || !same(s.slots[i].deps, deps)) {
      const old = s.slots[i];
      s.slots[i] = { deps };
      s.effects.push(() => {
        old?.cleanup?.();
        s.slots[i].cleanup = effect();
      });
    }
  },
}));
vi.mock("react-native", () => ({
  AppState: {
    currentState: "active",
    addEventListener: (_: string, callback: (state: string) => void) => {
      s.appChange = callback;
      return { remove: vi.fn() };
    },
  },
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => s.generation,
  subscribeAccountGeneration: () => () => {},
}));
vi.mock("@/data/auth/accountRequestContext", () => ({
  assertAccountRequestGeneration: (context: { generation: number }) => {
    if (context.generation !== s.generation) throw Error("ACCOUNT_CHANGED");
  },
}));
vi.mock("@/data/operations/defaultUpdatesInbox", () => ({
  openDefaultUpdatesInbox: () => s.open(),
}));
const SignalHarness = (trip: string | null = "a", path = "/trip", enabled = true) => {
  s.cursor = 0;
  const result = useUpdatesSignal(trip, path, enabled);
  for (const effect of s.effects.splice(0)) effect();
  return result;
};
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const deferred = () => {
  let resolve!: (value: any) => void;
  const promise = new Promise<any>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
beforeEach(() => {
  vi.useFakeTimers();
  s.slots = [];
  s.effects = [];
  s.generation = 1;
  s.signal
    .mockReset()
    .mockResolvedValue({ coverage: "COMPLETE", unreadActionableCards: 3 });
  s.open.mockReset().mockImplementation(async () => ({
    context: { accountId: "synthetic", generation: s.generation },
    repository: { unreadActionableSignal: s.signal },
  }));
});
afterEach(() => {
  for (const slot of s.slots) slot?.cleanup?.();
  vi.useRealTimers();
});
it("uses a complete owning aggregate independently of Inbox filters, and refreshes without read mutations", async () => {
  expect(SignalHarness()).toBeNull();
  await flush();
  expect(SignalHarness()).toBe(3);
  expect(s.signal).toHaveBeenCalledWith({ accountId: "synthetic", generation: 1 }, "a");
  s.signal.mockResolvedValue({ coverage: "COMPLETE", unreadActionableCards: 0 });
  await vi.advanceTimersByTimeAsync(2000);
  expect(SignalHarness()).toBe(0);
});
it.each(["UNKNOWN", "failure", "invalid"])(
  "%s is unknown rather than a fake completion signal",
  async (kind) => {
    SignalHarness();
    await flush();
    expect(SignalHarness()).toBe(3);
    if (kind === "failure") s.signal.mockRejectedValue(Error("REVOKED"));
    else
      s.signal.mockResolvedValue({
        coverage: kind === "UNKNOWN" ? "UNKNOWN" : "COMPLETE",
        unreadActionableCards: kind === "invalid" ? -1 : null,
      });
    await vi.advanceTimersByTimeAsync(2000);
    expect(SignalHarness()).toBeNull();
  },
);
it("A→B→A never revives an old delayed signal, and route change drops its observed owner", async () => {
  const pending = deferred();
  s.signal.mockImplementationOnce(() => pending.promise);
  SignalHarness("a");
  await flush();
  SignalHarness("b");
  await flush();
  SignalHarness("a");
  await flush();
  expect(SignalHarness("a")).toBe(3);
  pending.resolve({ coverage: "COMPLETE", unreadActionableCards: 99 });
  await flush();
  expect(SignalHarness("a")).toBe(3);
  expect(SignalHarness("a", "/updates")).toBeNull();
  await flush();
  expect(SignalHarness("a", "/updates")).toBe(3);
});
it("current-account generation changes reject delayed foreign results and disabled/hidden Shell does not read", async () => {
  const pending = deferred();
  s.signal.mockImplementationOnce(() => pending.promise);
  SignalHarness();
  await flush();
  s.generation = 3;
  expect(SignalHarness()).toBeNull();
  await flush();
  pending.resolve({ coverage: "COMPLETE", unreadActionableCards: 99 });
  await flush();
  expect(SignalHarness()).toBe(3);
  s.open.mockClear();
  expect(SignalHarness(null, "/trip", false)).toBeNull();
  await vi.advanceTimersByTimeAsync(4000);
  expect(s.open).not.toHaveBeenCalled();
});
it("background invalidates pending refresh and foreground reacquires normal scope", async () => {
  SignalHarness();
  await flush();
  expect(SignalHarness()).toBe(3);
  s.appChange!("background");
  s.signal.mockClear();
  await vi.advanceTimersByTimeAsync(4000);
  expect(s.signal).not.toHaveBeenCalled();
  s.signal.mockResolvedValue({ coverage: "COMPLETE", unreadActionableCards: 1 });
  s.appChange!("active");
  await flush();
  expect(SignalHarness()).toBe(1);
});

it("background clears old positive signal and foreground stays unknown until a fresh owning result", async () => {
  SignalHarness();
  await flush();
  expect(SignalHarness()).toBe(3);
  s.appChange!("background");
  expect(SignalHarness()).toBeNull();
  const pending = deferred();
  s.signal.mockImplementationOnce(() => pending.promise);
  s.appChange!("active");
  await flush();
  expect(SignalHarness()).toBeNull();
  pending.resolve({ coverage: "COMPLETE", unreadActionableCards: 0 });
  await flush();
  expect(SignalHarness()).toBe(0);
});
