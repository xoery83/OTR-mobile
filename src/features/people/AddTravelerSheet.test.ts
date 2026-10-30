import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { AddTravelerSheet } from "./AddTravelerSheet";

const state = vi.hoisted(() => ({
  values: [] as unknown[],
  refs: [] as { current: unknown }[],
  cursor: 0,
  refCursor: 0,
  generation: 3,
  uuid: vi.fn(),
  listeners: new Set<() => void>(),
  effects: [] as (() => void | (() => void))[],
  cleanups: [] as (() => void)[],
  unsubscribe: undefined as undefined | (() => void),
  rerender: undefined as undefined | (() => void),
  mounted: false,
  lastTree: [] as any[],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef: (value: unknown) => (state.refs[state.refCursor++] ??= { current: value }),
  useEffect: (effect: () => void | (() => void)) => {
    if (!state.mounted) state.effects.push(effect);
  },
  useSyncExternalStore: (
    subscribe: (fn: () => void) => () => void,
    get: () => number,
  ) => {
    state.unsubscribe ??= subscribe(() => state.rerender?.());
    return get();
  },
  useState: (value: unknown) => {
    const index = state.cursor++;
    if (index >= state.values.length) state.values[index] = value;
    return [
      state.values[index],
      (next: unknown) => {
        state.values[index] = next;
      },
    ];
  },
}));
vi.mock("react-native", () => ({
  Keyboard: { dismiss: vi.fn() },
  Modal: "Modal",
  ScrollView: "ScrollView",
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock("@/components/SheetHeader", () => ({ SheetHeader: "Header" }));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => state.generation,
  subscribeAccountGeneration: (listener: () => void) => {
    state.listeners.add(listener);
    return () => {
      state.listeners.delete(listener);
    };
  },
}));
vi.mock("@/domain/localId", () => ({ createUuid: state.uuid }));
vi.mock("@/ui/controls", () => ({ UiText: "Text" }));
vi.mock("@/ui/forms", () => ({ UiTextInput: "Input" }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: vi.fn() }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));

type Node = { type: unknown; props: Record<string, any> };
const nodes = (value: any): Node[] =>
  Array.isArray(value)
    ? value.flatMap(nodes)
    : value?.props
      ? [value, ...nodes(value.props.children)]
      : [];
let props: Parameters<typeof AddTravelerSheet>[0];
function render() {
  state.cursor = state.refCursor = 0;
  const child = AddTravelerSheet(props) as any;
  state.lastTree = child ? nodes(child.type(child.props)) : [];
  if (!state.mounted && child) {
    state.mounted = true;
    state.effects.splice(0).forEach((effect) => {
      const cleanup = effect();
      if (cleanup) state.cleanups.push(cleanup);
    });
  }
  return state.lastTree;
}
function unmount() {
  state.cleanups.splice(0).forEach((cleanup) => cleanup());
  state.unsubscribe?.();
  state.unsubscribe = undefined;
  state.mounted = false;
  state.values = [];
  state.refs = [];
  state.lastTree = [];
}
const header = () => render().find((node) => node.type === "Header")!.props;
const input = () => render().find((node) => node.type === "Input")!.props;
beforeEach(() => {
  unmount();
  vi.clearAllMocks();
  state.values = [];
  state.refs = [];
  state.generation = 3;
  state.listeners.clear();
  state.effects = [];
  state.rerender = () => {
    render();
  };
  state.uuid.mockImplementation(randomUUID);
  props = { visible: true, onClose: vi.fn(), onSave: vi.fn(async () => {}) };
});

it("validates before authoring and preserves Unicode without inferring an Account", async () => {
  input().onChangeText("   ");
  expect(header().rightDisabled).toBe(true);
  header().onRight();
  expect(props.onSave).not.toHaveBeenCalled();
  expect(state.uuid).not.toHaveBeenCalled();
  input().onChangeText("  张 三 🐈  ");
  header().onRight();
  await vi.waitFor(() => expect(props.onClose).toHaveBeenCalledOnce());
  const request = vi.mocked(props.onSave).mock.calls[0][0];
  expect(request.displayName).toBe("张 三 🐈");
  expect(Object.keys(request).sort()).toEqual(["displayName", "operationId", "personId"]);
});

it("prevents duplicate save and dismissal while the local commit is unresolved", async () => {
  let release!: () => void;
  vi.mocked(props.onSave).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  input().onChangeText("Traveler");
  const first = header();
  first.onRight();
  first.onRight();
  first.onLeft();
  expect(props.onSave).toHaveBeenCalledOnce();
  expect(props.onClose).not.toHaveBeenCalled();
  expect(header().leftDisabled).toBe(true);
  expect(render().find((node) => node.type === "Modal")!.props.allowSwipeDismissal).toBe(
    false,
  );
  release();
  await vi.waitFor(() => expect(props.onClose).toHaveBeenCalledOnce());
});

it("retries an uncertain save using the same Person, operation and original name", async () => {
  vi.mocked(props.onSave)
    .mockRejectedValueOnce(Error("LOCAL_COMMIT_UNKNOWN"))
    .mockResolvedValueOnce();
  input().onChangeText("同名旅人");
  header().onRight();
  await vi.waitFor(() =>
    expect(render().some((node) => node.props.accessibilityRole === "alert")).toBe(true),
  );
  expect(input().value).toBe("同名旅人");
  expect(input().editable).toBe(false);
  expect(header().rightLabel).toBe("people.retrySave");
  header().onRight();
  await vi.waitFor(() => expect(props.onClose).toHaveBeenCalledOnce());
  const calls = vi.mocked(props.onSave).mock.calls;
  expect(calls[1][0]).toBe(calls[0][0]);
  expect(state.uuid).toHaveBeenCalledTimes(2);
});

it("hides the previous Account draft and ignores its late completion after a transition", async () => {
  let release!: () => void;
  vi.mocked(props.onSave).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  input().onChangeText("Account A private draft");
  const stale = header();
  stale.onRight();
  state.generation++;
  state.listeners.forEach((listener) => listener());
  expect(state.lastTree).toEqual([]);
  stale.onRight();
  expect(props.onSave).toHaveBeenCalledOnce();
  release();
  await Promise.resolve();
  expect(props.onClose).not.toHaveBeenCalled();
});

it("ignores an unmounted form's late success without closing its replacement", async () => {
  let release!: () => void;
  vi.mocked(props.onSave).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  input().onChangeText("Old draft");
  header().onRight();
  unmount();
  props = { ...props, onSave: vi.fn(async () => {}) };
  input().onChangeText("Replacement draft");
  expect(input().value).toBe("Replacement draft");
  release();
  await Promise.resolve();
  expect(props.onClose).not.toHaveBeenCalled();
  expect(input().value).toBe("Replacement draft");
});

it("recovers a local UUID failure without leaving saving or dismissal locked", async () => {
  state.uuid.mockImplementationOnce(() => {
    throw Error("LOCAL_UUID_UNAVAILABLE");
  });
  input().onChangeText("Traveler");
  header().onRight();
  expect(props.onSave).not.toHaveBeenCalled();
  expect(header().leftDisabled).toBe(false);
  expect(input().editable).toBe(true);
  header().onRight();
  await vi.waitFor(() => expect(props.onClose).toHaveBeenCalledOnce());
  expect(props.onSave).toHaveBeenCalledOnce();
});

it("closing an unsubmitted form creates no Person or durable intent", () => {
  input().onChangeText("Unsaved traveler");
  header().onLeft();
  expect(props.onClose).toHaveBeenCalledOnce();
  expect(props.onSave).not.toHaveBeenCalled();
  expect(state.uuid).not.toHaveBeenCalled();
});
