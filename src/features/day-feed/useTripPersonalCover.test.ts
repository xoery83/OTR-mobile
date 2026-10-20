import { beforeEach, expect, it, vi } from "vitest";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import { useTripPersonalCover } from "./useTripPersonalCover";

const state = vi.hoisted(() => ({
  values: [] as any[],
  refs: [] as any[],
  effects: [] as any[],
  callbacks: [] as any[],
  valueAt: 0,
  refAt: 0,
  effectAt: 0,
  callbackAt: 0,
  read: vi.fn(),
  save: vi.fn(),
  subscribe: vi.fn(),
  stop: vi.fn(),
  listener: null as null | (() => void),
}));
const same = (a: any[], b: any[]) =>
  a?.length === b.length && b.every((v, i) => Object.is(v, a[i]));
vi.mock("react", () => ({
  useSyncExternalStore: (_: any, get: any) => get(),
  useRef: (initial: any) => (state.refs[state.refAt++] ??= { current: initial }),
  useState: (initial: any) => {
    const i = state.valueAt++;
    if (!(i in state.values)) state.values[i] = initial;
    return [
      state.values[i],
      (v: any) => {
        state.values[i] = v;
      },
    ];
  },
  useCallback: (callback: any, deps: any[]) => {
    const i = state.callbackAt++;
    if (!same(state.callbacks[i]?.deps, deps)) state.callbacks[i] = { deps, callback };
    return state.callbacks[i].callback;
  },
  useEffect: (effect: any, deps: any[]) => {
    const i = state.effectAt++;
    if (!same(state.effects[i]?.deps, deps)) {
      state.effects[i]?.cleanup?.();
      state.effects[i] = { deps, cleanup: effect() };
    }
  },
  useLayoutEffect: (effect: any, deps: any[]) => {
    const i = state.effectAt++;
    if (!same(state.effects[i]?.deps, deps)) {
      state.effects[i]?.cleanup?.();
      state.effects[i] = { deps, cleanup: effect() };
    }
  },
}));
vi.mock("@/data/repositories/tripPersonalCoverRepository", () => ({
  readLocalTripPersonalCoverRepository: async () => ({
    read: state.read,
    save: state.save,
    subscribe: state.subscribe,
  }),
}));
const context = Object.freeze({ owningProof: "opaque-test-context" });
const selection = (raw: string | null = "coast", revision = 4) => ({
  context,
  canChoose: true as const,
  raw,
  selectionRevision: revision,
  accessToken: "test-access-version",
});
function CoverHarness(tripId: string | null) {
  return useTripPersonalCover(tripId);
}
function render(tripId: string | null = "a") {
  state.valueAt = state.refAt = state.effectAt = state.callbackAt = 0;
  return CoverHarness(tripId);
}
async function flush() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
beforeEach(() => {
  state.effects.forEach((e) => e?.cleanup?.());
  state.values = [];
  state.refs = [];
  state.effects = [];
  state.callbacks = [];
  state.read.mockReset().mockResolvedValue(selection());
  state.save.mockReset().mockResolvedValue(selection("city", 5));
  state.stop.mockReset();
  state.listener = null;
  state.subscribe.mockReset().mockImplementation((_context, listener) => {
    state.listener = listener;
    return state.stop;
  });
});
it("uses owning context unchanged, subscribes after reading, and refuses unavailable as AUTO", async () => {
  render();
  await flush();
  expect(render().selection?.raw).toBe("coast");
  expect(state.subscribe).toHaveBeenCalledWith(context, expect.any(Function));
  state.read.mockResolvedValue(null);
  state.listener?.();
  await flush();
  expect(render().selection).toBeNull();
  expect(await render().open()).toBe(false);
  await expect(render().select(null)).rejects.toThrow("TRIP_COVER_UNAVAILABLE");
  expect(state.save).not.toHaveBeenCalled();
});
it("retries unknown save results with the exact original tuple, then refreshes revision", async () => {
  render();
  await flush();
  state.save.mockRejectedValueOnce(new Error("unknown completion"));
  await expect(render().select("city")).rejects.toThrow("unknown completion");
  const first = state.save.mock.calls[0];
  expect(first[0]).toBe(context);
  expect(first[1]).toEqual({
    beforeRaw: "coast",
    expectedRevision: 4,
    expectedAccessToken: "test-access-version",
    after: "city",
  });
  state.read.mockResolvedValue(selection("city", 5));
  await render().select("city");
  expect(state.save.mock.calls[1][0]).toBe(first[0]);
  expect(state.save.mock.calls[1][1]).toBe(first[1]);
  expect(render().selection?.selectionRevision).toBe(5);
  state.read.mockResolvedValue(selection("city", 6));
  await render().select(null);
  expect(state.save.mock.calls[2][1]).toEqual({
    beforeRaw: "city",
    expectedRevision: 6,
    expectedAccessToken: "test-access-version",
    after: null,
  });
});
it("a different choice after failure starts with a newly read revision", async () => {
  render();
  await flush();
  state.save.mockRejectedValueOnce(new Error("rejected"));
  await expect(render().select("city")).rejects.toThrow();
  state.read.mockResolvedValue(selection("mountain", 7));
  await render().select("coast");
  expect(state.save.mock.calls[1][1]).toEqual({
    beforeRaw: "mountain",
    expectedRevision: 7,
    expectedAccessToken: "test-access-version",
    after: "coast",
  });
});
it.each(["TRIP_COVER_ACCESS_CHANGED", "TRIP_COVER_LOCAL_CONFLICT"])(
  "%s refreshes without automatically saving, and the next choice uses the new owning tuple",
  async (code) => {
    render();
    await flush();
    state.save.mockImplementationOnce(async () => {
      state.read.mockResolvedValue({
        ...selection("mountain", 8),
        accessToken: "new-access",
      });
      throw new Error(code);
    });
    await expect(render().select("city")).rejects.toThrow(code);
    expect(state.save).toHaveBeenCalledTimes(1);
    expect(render().selection?.raw).toBe("mountain");
    await render().select("city");
    expect(state.save.mock.calls[1][1]).not.toBe(state.save.mock.calls[0][1]);
    expect(state.save.mock.calls[1][1]).toEqual({
      beforeRaw: "mountain",
      expectedRevision: 8,
      expectedAccessToken: "new-access",
      after: "city",
    });
  },
);
it("reads the revision created by the first remote photo retention before freezing its save", async () => {
  state.read.mockResolvedValue({ ...selection(null, 0), accessToken: "before-add" });
  render("remote-member");
  await flush();
  const picker = render("remote-member");
  expect(await picker.open()).toBe(true);
  expect(render("remote-member").selection?.selectionRevision).toBe(0);
  // The owning photo add establishes an AUTO root; this is not a cover selection.
  state.read.mockResolvedValue({ ...selection(null, 1), accessToken: "after-add" });
  const raw = "photo-00000000-0000-4000-8000-000000000001";
  state.save.mockResolvedValue(selection(raw, 2));
  await picker.select(raw);
  expect(state.save).toHaveBeenCalledExactlyOnceWith(context, {
    beforeRaw: null,
    expectedRevision: 1,
    expectedAccessToken: "after-add",
    after: raw,
  });
});
it("withholds late Trip and Account completions and blocks stale save callbacks", async () => {
  let finish!: (v: any) => void;
  state.read.mockImplementationOnce(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const old = render("a");
  await flush();
  render("b");
  await flush();
  finish(selection("city", 99));
  await flush();
  expect(render("b").selection?.raw).toBe("coast");
  advanceAccountGeneration();
  advanceAccountGeneration();
  await expect(old.select("city")).rejects.toThrow("TRIP_COVER_CONTEXT_CHANGED");
  expect(state.save).not.toHaveBeenCalled();
  state.effects.forEach((e) => e?.cleanup?.());
});
