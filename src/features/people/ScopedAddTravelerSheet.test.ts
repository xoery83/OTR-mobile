import { beforeEach, expect, it, vi } from "vitest";
import { ScopedAddTravelerSheet } from "./ScopedAddTravelerSheet";
import { readLocalTripRepository } from "@/data/repositories/tripRepository";
import { loadTripPersonEditorDraft } from "@/native/tripPersonEditorDraft";
const hooks = vi.hoisted(() => ({
  cursor: 0,
  values: [] as any[],
  effects: [] as (() => void)[],
  generation: 4,
  writes: 0,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useSyncExternalStore: (_: unknown, get: () => number) => get(),
  useRef: (value: unknown) => {
    const index = hooks.cursor++;
    return (hooks.values[index] ??= { current: value });
  },
  useState: (value: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = value;
    return [
      hooks.values[index],
      (next: any) => {
        hooks.writes++;
        hooks.values[index] =
          typeof next === "function" ? next(hooks.values[index]) : next;
      },
    ];
  },
  useEffect: (effect: () => () => void, deps: unknown[]) => {
    const index = hooks.cursor++;
    const prior = hooks.values[index];
    if (prior && deps.every((value, n) => Object.is(value, prior.deps[n]))) return;
    hooks.effects.push(() => {
      prior?.cleanup();
      hooks.values[index] = { deps, cleanup: effect() };
    });
  },
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "Loading",
  StyleSheet: { create: (v: unknown) => v },
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => hooks.generation,
  subscribeAccountGeneration: vi.fn(),
}));
vi.mock("@/ui/controls", () => ({
  UiButton: "Button",
  UiText: "Text",
  UiSection: "Section",
}));
vi.mock("@/ui/locale", () => ({ t: (v: string) => v }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: vi.fn() }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
vi.mock("@/data/auth/sessionAccessToken", () => ({ sessionAccessToken: vi.fn() }));
vi.mock("@/data/repositories/tripRepository", () => ({
  readLocalTripRepository: vi.fn(),
}));
vi.mock("@/native/tripPersonEditorDraft", () => ({ loadTripPersonEditorDraft: vi.fn() }));
vi.mock("./AddTravelerSheet", () => ({ AddTravelerSheet: "AddTraveler" }));

const a = {
  accountId: "11111111-1111-4111-8111-111111111111",
  tripId: "33333333-3333-4333-8333-333333333333",
  generation: 4,
};
const tick = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
const nodes = (v: any): any[] =>
  Array.isArray(v) ? v.flatMap(nodes) : v?.props ? [v, ...nodes(v.props.children)] : [];
const getTrip = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  hooks.cursor = 0;
  hooks.values = [];
  hooks.effects = [];
  hooks.generation = 4;
  getTrip.mockResolvedValue({ id: a.tripId });
  vi.mocked(readLocalTripRepository).mockResolvedValue({ getTrip } as never);
  vi.mocked(loadTripPersonEditorDraft).mockImplementation(
    async (scope) => ({ context: { ...scope } }) as never,
  );
});
function fixture() {
  let context = a;
  const render = () => {
    hooks.cursor = 0;
    const result = ScopedAddTravelerSheet({ context, onClose: vi.fn() });
    for (const e of hooks.effects.splice(0)) e();
    return result;
  };
  return {
    render,
    change(next: typeof a) {
      context = next;
    },
  };
}
it("normal caller binds an existing local Trip to a private draft without any submit path", async () => {
  const f = fixture();
  f.render();
  await tick();
  const v = f.render()!;
  expect(v.type).toBe("AddTraveler");
  expect(v.props.submissionEnabled).toBe(false);
  expect(loadTripPersonEditorDraft).toHaveBeenCalledExactlyOnceWith(a);
  await expect(v.props.onSave({})).rejects.toThrow("PERSON_SUBMISSION_UNAVAILABLE");
});
it("missing local Trip or foreign port fails closed without unscoped fallback", async () => {
  getTrip.mockResolvedValue(null);
  const f = fixture();
  f.render();
  await tick();
  expect(loadTripPersonEditorDraft).not.toHaveBeenCalled();
  expect(
    nodes(f.render()).some((n) => n.props.children === "people.draftLoadFailed"),
  ).toBe(true);
});
it("old Trip and Account ABA responses cannot mount the previous private editor", async () => {
  let resolve!: (v: any) => void;
  vi.mocked(loadTripPersonEditorDraft).mockReturnValueOnce(
    new Promise((r) => (resolve = r)),
  );
  const f = fixture();
  f.render();
  await tick();
  hooks.generation = 6;
  f.change({ ...a, generation: 6 });
  f.render();
  await tick();
  resolve({ context: a });
  await tick();
  const v = f.render()!;
  expect(v.props.draft.context.generation).toBe(6);
});
it("a mismatched port is rejected rather than silently using another Trip draft", async () => {
  vi.mocked(loadTripPersonEditorDraft).mockResolvedValue({
    context: { ...a, tripId: "wrong" },
  } as never);
  const f = fixture();
  f.render();
  await tick();
  expect(nodes(f.render()).some((n) => n.type === "AddTraveler")).toBe(false);
  expect(
    nodes(f.render()).some((n) => n.props.children === "people.draftLoadFailed"),
  ).toBe(true);
});
