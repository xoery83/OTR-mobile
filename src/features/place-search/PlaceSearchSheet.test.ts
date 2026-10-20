vi.mock("expo-network", () => ({
  useNetworkState: () => ({ isConnected: state.connected }),
}));
import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PlaceSearchSheet } from "./PlaceSearchSheet";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
const state = vi.hoisted(() => ({
  hooks: [] as any[],
  refs: [] as any[],
  cursor: 0,
  refCursor: 0,
  mount: true,
  effects: [] as (() => unknown)[],
  nodes: [] as any[],
  factory: vi.fn(),
  generation: 1,
  current: true,
  connected: true,
  memo: null as null | { deps: unknown[]; value: unknown },
  focus: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useMemo: (make: () => unknown, deps: unknown[]) => {
    if (!state.memo || deps.some((value, i) => value !== state.memo!.deps[i]))
      state.memo = { deps, value: make() };
    return state.memo.value;
  },
  useSyncExternalStore: (_: unknown, get: () => unknown) => get(),
  useEffect: (effect: () => unknown) => {
    if (state.mount) state.effects.push(effect);
  },
  useState: (initial: unknown) => {
    const i = state.cursor++;
    if (!(i in state.hooks)) state.hooks[i] = initial;
    return [
      state.hooks[i],
      (value: unknown) => {
        state.hooks[i] = value;
      },
    ];
  },
  useRef: (initial: unknown) => (state.refs[state.refCursor++] ??= { current: initial }),
}));
vi.mock("@/data/places/applePlaceProvider", async (original) => ({
  ...(await original<typeof import("@/data/places/applePlaceProvider")>()),
  readApplePlaceProvider: (...args: unknown[]) => state.factory(...args),
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => state.generation,
  subscribeAccountGeneration: () => () => {},
}));
vi.mock("react-native", () => ({
  Modal: (p: any) => createElement("div", null, p.children),
  ScrollView: "section",
  View: "div",
  StyleSheet: { create: (x: unknown) => x },
  Pressable: (p: any) => {
    state.nodes.push(p);
    return createElement("button", null, p.children);
  },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaProvider: "div" }));
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
vi.mock("@/components/SheetHeader", () => ({
  SheetHeader: (p: any) => {
    state.nodes.push({ label: p.leftLabel, onPress: p.onLeft });
    return createElement("h1", null, p.title);
  },
}));
vi.mock("@/ui/controls", () => ({
  UiText: "span",
  UiButton: (p: any) => {
    state.nodes.push(p);
    return createElement("button", null, p.label);
  },
}));
vi.mock("@/ui/forms", () => ({
  UiChoiceChip: (p: any) => {
    state.nodes.push(p);
    return createElement("button", null, p.label);
  },
  UiTextInput: (p: any) => {
    state.nodes.push(p);
    p.ref.current = { focus: state.focus };
    return createElement("input", { value: p.value, readOnly: true });
  },
}));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key, getFormatLocale: () => "en" }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => {} }));
vi.mock("@/ui/theme", () => ({
  useUiTheme: () => ({}),
  useThemedStyles: (make: any) => make({}),
}));
const binding = {
  accountId: "00000000-0000-4000-8000-000000000001",
  tripId: "00000000-0000-4000-8000-000000000002",
  editorId: "00000000-0000-4000-8000-000000000003",
  accountGeneration: 1,
  isCurrent: () => state.current,
};
const props = {
  binding,
  initialQuery: "Sky Tower",
  nameChoice: true,
  onCancel: vi.fn(),
  onConfirm: vi.fn(),
};
const row = {
  provider: "apple",
  handle: "handle",
  kind: "completion",
  title: "Sky Tower",
  secondary: "Auckland",
  generation: 1,
  sessionId: "session",
};
const provider = () => ({
  complete: vi.fn(async () => [row]),
  search: vi.fn(async () => [{ ...row, kind: "mapItem" }]),
  resolve: vi.fn(async () => ({
    ...row,
    kind: "mapItem",
    address: "Victoria Street West, Auckland",
  })),
  cancel: vi.fn(),
  close: vi.fn(),
});
function render() {
  state.cursor = 0;
  state.refCursor = 0;
  state.nodes = [];
  return renderToStaticMarkup(createElement(PlaceSearchSheet, props));
}
const node = (key: string) =>
  state.nodes.find((p) => p.label === key || p.accessibilityLabel === key)!;
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
async function mount() {
  render();
  state.mount = false;
  state.effects.splice(0).forEach((effect) => effect());
  await flush();
  render();
}
beforeEach(() => {
  vi.useFakeTimers();
  state.hooks = [];
  state.refs = [];
  state.mount = true;
  state.effects = [];
  state.generation = 1;
  state.current = true;
  state.connected = true;
  state.memo = null;
  state.factory.mockReset();
  props.onConfirm.mockReset();
  props.onCancel.mockReset();
  state.focus.mockReset();
});
afterEach(() => vi.useRealTimers());
it("initializes two independent actual-provider sessions, clears query and keeps focus without source writes", async () => {
  const quick = provider(),
    more = provider();
  state.factory.mockResolvedValueOnce(quick).mockResolvedValueOnce(more);
  await mount();
  expect(state.factory).toHaveBeenCalledTimes(2);
  expect(state.factory).toHaveBeenCalledWith(binding);
  await vi.advanceTimersByTimeAsync(450);
  render();
  expect(node("Sky Tower, Auckland")).toBeDefined();
  node("placeSearch.clear").onPress();
  render();
  expect(node("placeSearch.query").value).toBe("");
  expect(state.focus).toHaveBeenCalledOnce();
  expect(node("Sky Tower, Auckland")).toBeUndefined();
  expect(props.onConfirm).not.toHaveBeenCalled();
  node("common.cancel").onPress();
  expect(props.onCancel).toHaveBeenCalledOnce();
});
it("native failure retains explicit manual fallback without masquerading as an Apple result", async () => {
  state.factory.mockRejectedValue(new Error("NATIVE_UNAVAILABLE"));
  await mount();
  expect(render()).toContain("placeSearch.nativeUnavailable");
  node("placeSearch.useEnteredName").onPress();
  expect(props.onConfirm).toHaveBeenCalledWith({ kind: "MANUAL", text: "Sky Tower" });
});
it("selecting/resolve does not fill until explicit confirmation, and Name adoption is opt-in", async () => {
  state.factory.mockResolvedValueOnce(provider()).mockResolvedValueOnce(provider());
  await mount();
  await vi.advanceTimersByTimeAsync(450);
  render();
  node("Sky Tower, Auckland").onPress();
  await flush();
  render();
  expect(props.onConfirm).not.toHaveBeenCalled();
  expect(node("placeSearch.usePlaceName").selected).toBe(false);
  node("placeSearch.usePlaceName").onPress();
  render();
  node("placeSearch.usePlace").onPress();
  expect(props.onConfirm).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "SELECTED",
      usePlaceName: true,
      place: expect.objectContaining({ address: "Victoria Street West, Auckland" }),
    }),
  );
});
it("a stale binding cannot confirm or preserve an overlay after account generation changes", async () => {
  state.factory.mockRejectedValue(new Error("NATIVE_UNAVAILABLE"));
  await mount();
  const manual = node("placeSearch.useEnteredName").onPress;
  state.current = false;
  manual();
  expect(props.onConfirm).not.toHaveBeenCalled();
  state.generation = 2;
  expect(render()).toBe("");
});

it("known offline keeps manual confirmation available without an Apple dispatch", async () => {
  state.connected = false;
  const quick = provider(),
    more = provider();
  state.factory.mockResolvedValueOnce(quick).mockResolvedValueOnce(more);
  await mount();
  expect(render()).toContain("placeSearch.offline");
  await vi.advanceTimersByTimeAsync(500);
  expect(quick.complete).not.toHaveBeenCalled();
  expect(more.search).not.toHaveBeenCalled();
  expect(node("placeSearch.useEnteredName").disabled).toBe(false);
  node("placeSearch.useEnteredName").onPress();
  expect(props.onConfirm).toHaveBeenCalledWith({ kind: "MANUAL", text: "Sky Tower" });
});
