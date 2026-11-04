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
  regions: [] as string[],
  translations: vi.fn(),
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
vi.mock("./placeSearchTripRegions", async (original) => ({
  ...(await original<typeof import("./placeSearchTripRegions")>()),
  readTripPlaceSearchRegions: async () => state.regions,
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
  KeyboardAvoidingView: "div",
  Platform: { OS: "ios" },
  Modal: (p: any) => createElement("div", null, p.children),
  ScrollView: "section",
  View: "div",
  StyleSheet: { create: (x: unknown) => x },
  Pressable: (p: any) => {
    state.nodes.push(p);
    return createElement("button", null, p.children);
  },
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: "div",
  SafeAreaView: "div",
}));
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
vi.mock("@/ui/locale", () => ({ t: (key: string, params?: unknown) => { state.translations(key, params); return key; }, getFormatLocale: () => "en" }));
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
function render(overrides: Partial<typeof props> = {}) {
  state.cursor = 0;
  state.refCursor = 0;
  state.nodes = [];
  return renderToStaticMarkup(createElement(PlaceSearchSheet, { ...props, ...overrides }));
}
const node = (key: string) =>
  state.nodes.find((p) => p.label === key || p.accessibilityLabel === key)!;
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
async function mount(overrides: Partial<typeof props> = {}) {
  render(overrides);
  state.mount = false;
  state.effects.splice(0).forEach((effect) => effect());
  await flush();
  render(overrides);
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
  state.regions = [];
  state.translations.mockReset();
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
  node("placeSearch.useQueryAsName").onPress();
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
  const manual = node("placeSearch.useQueryAsName").onPress;
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
  expect(node("placeSearch.useQueryAsName").disabled).toBe(false);
  node("placeSearch.useQueryAsName").onPress();
  expect(props.onConfirm).toHaveBeenCalledWith({ kind: "MANUAL", text: "Sky Tower" });
});

it("region picker searches geographic areas, returns to authored query and Worldwide clears only bias", async () => {
  const quick = provider(),
    more = provider();
  quick.resolve.mockResolvedValue({
    ...row,
    kind: "mapItem",
    address: "Auckland, New Zealand",
    point: { latitude: -36.8, longitude: 174.7 },
  } as any);
  state.factory.mockResolvedValueOnce(quick).mockResolvedValueOnce(more);
  await mount();
  await vi.advanceTimersByTimeAsync(450);
  render();
  expect(node("placeSearch.worldwide").selected).toBe(true);
  expect(node("placeSearch.region").compact).toBe(true);
  node("placeSearch.region").onPress();
  render();
  expect(render()).toContain("placeSearch.regionHint");
  node("placeSearch.regionQuery").onChangeText("Auckland");
  await vi.advanceTimersByTimeAsync(450);
  render();
  expect(quick.complete).toHaveBeenLastCalledWith(
    expect.objectContaining({ text: "Auckland", intent: "destinationArea" }),
    expect.anything(),
  );
  node("Sky Tower, Auckland").onPress();
  await flush();
  render();
  await vi.advanceTimersByTimeAsync(450);
  render();
  expect(node("placeSearch.query").value).toBe("Sky Tower");
  expect(quick.complete).toHaveBeenLastCalledWith(
    expect.objectContaining({
      text: "Sky Tower",
      region: { latitude: -36.8, longitude: 174.7 },
    }),
    expect.anything(),
  );
  node("placeSearch.worldwide").onPress();
  await vi.advanceTimersByTimeAsync(450);
  render();
  expect(quick.complete).toHaveBeenLastCalledWith(
    { text: "Sky Tower", locale: "en" },
    expect.anything(),
  );
  expect(node("placeSearch.useQueryAsName").variant).toBe("secondary");
  expect(props.onConfirm).not.toHaveBeenCalled();
});
const regionCandidate = (title = "Auckland", latitude = -36.8) => ({
  ...row, kind: "mapItem", title, secondary: "New Zealand", address: `${title}, New Zealand`,
  point: { latitude, longitude: 174.7 }, area: { kind: "locality", label: title, qualifier: "New Zealand" },
});
it("applies a single Trip destination's real unique Apple point to the actual place query", async () => {
  state.regions = ["Auckland, New Zealand"];
  const quick = provider(), more = provider();
  more.search.mockResolvedValue([regionCandidate()] as any);
  state.factory.mockResolvedValueOnce(quick).mockResolvedValueOnce(more);
  await mount();
  expect(more.search).toHaveBeenCalledExactlyOnceWith({ text: "Auckland, New Zealand", locale: "en", intent: "destinationArea" }, expect.anything());
  await vi.advanceTimersByTimeAsync(450);
  render();
  expect(quick.complete).toHaveBeenLastCalledWith({ text: "Sky Tower", locale: "en", region: { latitude: -36.8, longitude: 174.7 } }, expect.anything());
  expect(state.translations).toHaveBeenCalledWith("placeSearch.activeRegion", { region: "Auckland · New Zealand" });
  expect(props.onConfirm).not.toHaveBeenCalled();
});
it("requires explicit selection for multiple Trip regions while retaining the authored place query", async () => {
  state.regions = ["Auckland, New Zealand", "Nelson, New Zealand"];
  const quick = provider(), more = provider();
  more.search.mockResolvedValue([regionCandidate("Nelson", -41.27)] as any);
  state.factory.mockResolvedValueOnce(quick).mockResolvedValueOnce(more);
  await mount();
  expect(render()).toContain("placeSearch.chooseRegion");
  expect(node("placeSearch.regionQuery").value).toBe("");
  expect(state.translations).toHaveBeenCalledWith("placeSearch.originalQuery", { query: "Sky Tower" });
  await vi.advanceTimersByTimeAsync(450);
  expect(quick.complete).not.toHaveBeenCalled();
  expect(more.search).not.toHaveBeenCalled();
  node("Nelson, New Zealand").onPress();
  await flush();
  await vi.advanceTimersByTimeAsync(450);
  render();
  expect(node("placeSearch.query").value).toBe("Sky Tower");
  expect(quick.complete).toHaveBeenLastCalledWith(expect.objectContaining({ text: "Sky Tower", region: { latitude: -41.27, longitude: 174.7 } }), expect.anything());
  expect(more.search).toHaveBeenCalledOnce();
});
it("never guesses an ambiguous Trip region, and explicit Worldwide restores the place query", async () => {
  state.regions = ["Auckland"];
  const quick = provider(), more = provider();
  more.search.mockResolvedValue([regionCandidate(), regionCandidate("Auckland", 40)] as any);
  state.factory.mockResolvedValueOnce(quick).mockResolvedValueOnce(more);
  await mount();
  expect(render()).toContain("placeSearch.chooseRegion");
  expect(state.translations).not.toHaveBeenCalledWith("placeSearch.activeRegion", expect.anything());
  node("placeSearch.worldwide").onPress();
  await vi.advanceTimersByTimeAsync(450);
  render();
  expect(quick.complete).toHaveBeenLastCalledWith({ text: "Sky Tower", locale: "en" }, expect.anything());
});
it("hides Beta More and puts explicit original-text manual fallback directly after five compact results", async () => {
  const quick = provider(), more = provider();
  quick.complete.mockResolvedValue(Array.from({ length: 5 }, (_, i) => ({ ...row, handle: `h${i}`, title: `Place ${i}` })));
  state.factory.mockResolvedValueOnce(quick).mockResolvedValueOnce(more);
  await mount({ nameChoice: false });
  await vi.advanceTimersByTimeAsync(450);
  const html = render({ nameChoice: false });
  expect(node("placeSearch.more")).toBeUndefined();
  expect(state.translations).toHaveBeenCalledWith("placeSearch.useQueryAsAddress", { query: "Sky Tower" });
  expect(html.indexOf("Place 4")).toBeLessThan(html.indexOf("placeSearch.useQueryAsAddress"));
  const rows = state.nodes.filter((n) => n.accessibilityLabel?.startsWith("Place "));
  expect(rows).toHaveLength(5);
  expect(rows.every((n) => n.style.minHeight === 44 && n.style.gap === 0)).toBe(true);
  node("placeSearch.useQueryAsAddress").onPress();
  expect(props.onConfirm).toHaveBeenCalledExactlyOnceWith({ kind: "MANUAL", text: "Sky Tower" });
});
it("Back from region selection preserves the original query instead of adopting region text", async () => {
  state.factory.mockResolvedValueOnce(provider()).mockResolvedValueOnce(provider());
  await mount();
  node("placeSearch.region").onPress();
  render();
  node("placeSearch.regionQuery").onChangeText("Wellington");
  render();
  expect(state.translations).toHaveBeenCalledWith("placeSearch.originalQuery", { query: "Sky Tower" });
  node("common.back").onPress();
  render();
  expect(node("placeSearch.query").value).toBe("Sky Tower");
  expect(props.onConfirm).not.toHaveBeenCalled();
});
it("a late default-region result cannot override a user's explicit Worldwide choice", async () => {
  state.regions = ["Auckland"];
  let finish!: (value: any[]) => void;
  const quick = provider(), more = provider();
  more.search.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  state.factory.mockResolvedValueOnce(quick).mockResolvedValueOnce(more);
  await mount();
  node("placeSearch.worldwide").onPress();
  finish([regionCandidate()]);
  await flush();
  await vi.advanceTimersByTimeAsync(450);
  render();
  expect(quick.complete).toHaveBeenLastCalledWith({ text: "Sky Tower", locale: "en" }, expect.anything());
  expect(state.translations).not.toHaveBeenCalledWith("placeSearch.activeRegion", expect.anything());
});

it("Cancel/unmount closes both provider leases even while the initial Trip-region lookup is pending", async () => {
  state.regions = ["Auckland"];
  let finish!: (value: any[]) => void;
  const quick = provider(), more = provider();
  more.search.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  state.factory.mockResolvedValueOnce(quick).mockResolvedValueOnce(more);
  render();
  state.mount = false;
  const cleanup = state.effects.splice(0).map((effect) => effect()).find((value) => typeof value === "function") as () => void;
  await flush();
  cleanup();
  expect(quick.close).toHaveBeenCalledOnce();
  expect(more.close).toHaveBeenCalledOnce();
  finish([regionCandidate()]);
  await flush();
  await vi.advanceTimersByTimeAsync(450);
  expect(quick.complete).not.toHaveBeenCalled();
  expect(props.onConfirm).not.toHaveBeenCalled();
});
