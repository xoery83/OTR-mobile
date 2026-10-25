import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { P3StayLocationField } from "./P3StayLocationField";

const state = vi.hoisted(() => ({
  hooks: [] as any[],
  refs: [] as any[],
  deps: [] as any[],
  effects: [] as any[],
  cursor: 0,
  refCursor: 0,
  effectCursor: 0,
  callbacks: [] as any[],
  callbackCursor: 0,
  nodes: [] as any[],
  generation: 1,
  capture: vi.fn(),
  read: vi.fn(),
  complete: vi.fn(),
  resolve: vi.fn(),
  closed: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useCallback: (fn: any, deps: any[]) => {
    const i = state.callbackCursor++,
      old = state.callbacks[i];
    if (!old || deps.some((d, j) => d !== old.deps[j])) state.callbacks[i] = { fn, deps };
    return state.callbacks[i].fn;
  },
  useState: (initial: any) => {
    const i = state.cursor++;
    if (!(i in state.hooks)) state.hooks[i] = initial;
    return [
      state.hooks[i],
      (next: any) =>
        (state.hooks[i] = typeof next === "function" ? next(state.hooks[i]) : next),
    ];
  },
  useLayoutEffect: (effect: any) => {
    state.effects.push(effect);
  },
  useRef: (initial: any) => (state.refs[state.refCursor++] ??= { current: initial }),
  useEffect: (effect: any, deps: any[]) => {
    const i = state.effectCursor++,
      old = state.deps[i];
    if (!old || deps.some((d, j) => d !== old.values[j]))
      state.effects.push(() => {
        old?.cleanup?.();
        state.deps[i] = { values: deps, cleanup: effect() };
      });
  },
}));
vi.mock("react-native", () => ({
  Keyboard: { dismiss: vi.fn() },
  StyleSheet: { create: (s: any) => s, hairlineWidth: 1 },
  View: (p: any) => createElement("div", null, p.children),
  Pressable: (p: any) => {
    state.nodes.push(p);
    return createElement("button", null, p.children);
  },
}));
vi.mock("expo-network", () => ({ useNetworkState: () => ({ isConnected: true }) }));
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
vi.mock("@/data/auth/accountRequestContext", () => ({
  captureAccountScope: () => state.capture(),
}));
vi.mock("@/data/auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => state.generation,
}));
vi.mock("@/data/places/applePlaceProvider", async (original) => ({
  ...(await original<typeof import("@/data/places/applePlaceProvider")>()),
  readApplePlaceProvider: (b: any) => state.read(b),
}));
vi.mock("@/features/place-search/PlaceSearchSheet", () => ({
  PlaceSearchSheet: (p: any) => {
    state.nodes.push({ ...p, label: "searchSheet" });
    return null;
  },
}));
vi.mock("@/ui/controls", () => ({
  UiButton: (p: any) => {
    state.nodes.push(p);
    return null;
  },
  UiText: (p: any) => createElement("span", null, p.children),
}));
vi.mock("@/ui/forms", () => ({
  UiTextInput: (p: any) => {
    state.nodes.push(p);
    return null;
  },
}));
vi.mock("@/ui/locale", () => ({ t: (k: string) => k, getFormatLocale: () => "en-NZ" }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/theme", () => ({ useUiTheme: () => ({}), useThemedStyles: () => ({}) }));
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(n: ReactNode): string;
};
const candidate = {
  provider: "apple" as const,
  handle: "hotel",
  kind: "completion" as const,
  title: "Park Hyatt Auckland",
  secondary: "Auckland",
  sessionId: "session",
  generation: 1,
};
const address = "99 Halsey Street, Auckland";
const props = () => ({
  tripId: "trip",
  editorId: "item",
  title: "Park Hyatt Auckland",
  nameQuery: "Park Hyatt Auckland" as string | null,
  value: null as string | null,
  disabled: false,
  isCurrent: () => true,
  onChange: vi.fn(),
  onSelectHotel: vi.fn(),
  onKeepName: vi.fn(),
});
function render(p: ReturnType<typeof props>) {
  state.cursor = 0;
  state.refCursor = 0;
  state.effectCursor = 0;
  state.callbackCursor = 0;
  state.nodes = [];
  const html = renderToStaticMarkup(createElement(P3StayLocationField, p));
  state.effects.splice(0).forEach((e) => e());
  return html;
}
const node = (label: string) =>
  state.nodes.find((n) => n.label === label || n.accessibilityLabel === label)!;
async function tick() {
  await vi.advanceTimersByTimeAsync(500);
}
beforeEach(() => {
  vi.useFakeTimers();
  state.hooks = [];
  state.refs = [];
  state.deps = [];
  state.callbacks = [];
  state.effects = [];
  state.generation = 1;
  state.capture.mockReset().mockResolvedValue({ accountId: "account", generation: 1 });
  state.complete.mockReset().mockResolvedValue([candidate]);
  state.resolve.mockReset().mockResolvedValue({ ...candidate, kind: "mapItem", address });
  state.closed.mockReset();
  state.read.mockReset().mockImplementation(async () => ({
    complete: state.complete,
    resolve: state.resolve,
    search: vi.fn(),
    cancel: vi.fn(),
    close: state.closed,
  }));
});
afterEach(() => {
  state.deps.forEach((d) => d?.cleanup?.());
  vi.useRealTimers();
});
it("shows Apple matches before the address input and fills hotel name plus address only on selection", async () => {
  const p = props();
  render(p);
  await tick();
  render(p);
  expect(state.complete).toHaveBeenCalledWith(
    { text: p.title, locale: "en-NZ" },
    expect.any(AbortSignal),
  );
  expect(p.onChange).not.toHaveBeenCalled();
  expect(node("tripCreate.findPlace")).toBeUndefined();
  expect(state.nodes.indexOf(node("Park Hyatt Auckland, Auckland"))).toBeLessThan(
    state.nodes.indexOf(node("tripCreate.stayLocation")),
  );
  node("Park Hyatt Auckland, Auckland").onPress();
  await tick();
  render(p);
  expect(p.onSelectHotel).toHaveBeenCalledExactlyOnceWith("Park Hyatt Auckland", address);
  expect(p.onChange).not.toHaveBeenCalled();
  expect(node("Park Hyatt Auckland, Auckland")).toBeUndefined();
});
it("opens the existing full-screen immediate address flow; Cancel preserves fields and manual entry is retained", async () => {
  const p = { ...props(), value: "Original address" };
  render(p);
  node("tripCreate.stayLocation").onFocus();
  await tick();
  render(p);
  const first = node("searchSheet");
  expect(first.initialQuery).toBe("Original address");
  expect(first.selectionMode).toBe("immediate");
  expect(first.nameChoice).toBe(false);
  first.onCancel();
  render(p);
  expect(p.onChange).not.toHaveBeenCalled();
  first.onConfirm({ kind: "MANUAL", text: "Late address" });
  expect(p.onChange).not.toHaveBeenCalled();
  node("tripCreate.stayLocation").onFocus();
  await tick();
  render(p);
  node("searchSheet").onConfirm({ kind: "MANUAL", text: "Entered address" });
  expect(p.onChange).toHaveBeenCalledExactlyOnceWith("Entered address");
});
it("rejects delayed provider results after name changes, freezing or account switch", async () => {
  const p = props();
  let finish!: (v: any) => void;
  state.resolve.mockImplementationOnce(() => new Promise((r) => (finish = r)));
  render(p);
  await tick();
  render(p);
  node("Park Hyatt Auckland, Auckland").onPress();
  render({
    ...p,
    title: "Different hotel",
    nameQuery: "Different hotel",
    disabled: true,
  });
  finish({ ...candidate, kind: "mapItem", address });
  await tick();
  expect(p.onChange).not.toHaveBeenCalled();
  state.generation++;
  node("tripCreate.stayLocation").onFocus();
  await tick();
  render(p);
  expect(node("searchSheet")).toBeUndefined();
  expect(p.onChange).not.toHaveBeenCalled();
});
it("does not send a name search when opening an unchanged Edit, and closes pending initialization on unmount", async () => {
  const p = { ...props(), nameQuery: null };
  render(p);
  await tick();
  expect(state.read).not.toHaveBeenCalled();
  let finish!: (v: any) => void;
  state.read.mockImplementationOnce(() => new Promise((r) => (finish = r)));
  render({ ...p, nameQuery: p.title });
  await tick();
  state.deps.forEach((d) => d?.cleanup?.());
  finish({ close: state.closed });
  await tick();
  expect(state.closed).toHaveBeenCalled();
  expect(p.onChange).not.toHaveBeenCalled();
});

it("explicitly keeps the authored hotel name and address, cancelling a pending hotel resolution", async () => {
  const p = { ...props(), value: "My custom address" };
  let finish!: (v: any) => void;
  state.resolve.mockImplementationOnce(
    () => new Promise((resolve) => (finish = resolve)),
  );
  render(p);
  await tick();
  render(p);
  node("Park Hyatt Auckland, Auckland").onPress();
  node("placeSearch.useEnteredName").onPress();
  finish({ ...candidate, kind: "mapItem", address });
  await tick();
  render(p);
  expect(p.onKeepName).toHaveBeenCalledOnce();
  expect(p.onSelectHotel).not.toHaveBeenCalled();
  expect(p.onChange).not.toHaveBeenCalled();
  expect(node("Park Hyatt Auckland, Auckland")).toBeUndefined();
  expect(node("tripCreate.stayLocation").value).toBe("My custom address");
});

it("restarts suggestions when the hotel name is edited after keeping that same authored name", async () => {
  const p = props();
  render(p);
  await tick();
  render(p);
  node("placeSearch.useEnteredName").onPress();
  expect(p.onKeepName).toHaveBeenCalledOnce();
  render({ ...p, nameQuery: null });
  render(p);
  await tick();
  render(p);
  expect(node("Park Hyatt Auckland, Auckland")).toBeDefined();
  expect(p.onSelectHotel).not.toHaveBeenCalled();
});
