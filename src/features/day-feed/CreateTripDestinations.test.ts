import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { CreateTripDestinations } from "./CreateTripDestinations";
import type { TripDestinationDraftSelection } from "@/data/places/tripDestinationSelection";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
const state = vi.hoisted(() => ({
  hooks: [] as any[],
  cursor: 0,
  nodes: [] as any[],
  views: [] as any[],
  scroll: vi.fn(),
  effects: [] as (() => void)[],
  generation: 1,
  update: vi.fn(),
  resolve: vi.fn(),
  close: vi.fn(),
  emit: null as any,
  provider: vi.fn(),
  online: true,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const i = state.cursor++;
    if (!(i in state.hooks))
      state.hooks[i] = typeof initial === "function" ? initial() : initial;
    return [
      state.hooks[i],
      (v: unknown) => {
        state.hooks[i] = typeof v === "function" ? v(state.hooks[i]) : v;
      },
    ];
  },
  useRef: (value: unknown) => {
    const i = state.cursor++;
    return state.hooks[i] ?? (state.hooks[i] = { current: value });
  },
  useLayoutEffect: (effect: () => void) => effect(),
  useEffect: (effect: () => void, deps: unknown[]) => {
    const i = state.cursor++,
      old = state.hooks[i];
    if (!old || deps.some((v, n) => v !== old[n])) {
      state.hooks[i] = deps;
      state.effects.push(effect);
    }
  },
}));
vi.mock("react-native", () => ({
  View: (p: any) => {
    state.views.push(p);
    return createElement("div", null, p.children);
  },
  ScrollView: (p: any) => {
    if (p.ref) p.ref.current = { scrollTo: state.scroll };
    return createElement("section", null, p.children);
  },
  StyleSheet: { create: (v: unknown) => v },
  Pressable: (p: any) => {
    state.nodes.push(p);
    return createElement("button", null, p.children);
  },
}));
vi.mock("expo-network", () => ({
  useNetworkState: () => ({ isConnected: state.online }),
}));
vi.mock("@/data/auth/authRepository", () => ({
  readLocalSession: async () => ({
    identity: { userId: "f97c6ad1-5328-4a23-af39-8fa8bf280006" },
  }),
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => state.generation,
}));
vi.mock("@/data/places/applePlaceProvider", async (original) => ({
  ...(await original<typeof import("@/data/places/applePlaceProvider")>()),
  readApplePlaceProvider: (...args: unknown[]) => state.provider(...args),
}));
vi.mock("@/features/place-search/placeSearchSession", () => ({
  PlaceSearchSession: class {
    constructor(_a: unknown, _b: unknown, emit: unknown) {
      state.emit = emit;
    }
    update = state.update;
    resolve = state.resolve;
    close = state.close;
  },
}));
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
vi.mock("@/ui/controls", () => ({ UiText: "span" }));
vi.mock("@/ui/forms", () => ({
  UiTextInput: (p: any) => {
    state.nodes.push(p);
    return null;
  },
}));
vi.mock("@/ui/locale", () => ({
  getFormatLocale: () => "en-NZ",
  t: (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join("|")}` : key,
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => null }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}), useUiTheme: () => ({}) }));
let items: readonly TripDestinationDraftSelection[], name: string;
const dirty = vi.fn();
let context: { tripId: string; editorId: string } | { draftId: string };
function render() {
  state.cursor = 0;
  state.nodes = [];
  state.views = [];
  const html = renderToStaticMarkup(
    createElement(CreateTripDestinations, {
      name,
      ...context,
      generation: 1,
      items,
      onChange: (value) => {
        items = value;
      },
      onQueryDirty: dirty,
      onBusy: vi.fn(),
      disabled: false,
    }),
  );
  for (const effect of state.effects.splice(0)) effect();
  return html;
}
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
const input = (text: string) =>
  state.nodes.find((p) => p.onChangeText).onChangeText(text);
const press = (label: string) =>
  state.nodes.find((p) => p.accessibilityLabel === label)?.onPress();
beforeEach(() => {
  state.hooks = [];
  state.effects = [];
  state.generation = 1;
  state.scroll.mockReset();
  state.update.mockReset();
  state.resolve.mockReset();
  state.close.mockReset();
  state.provider.mockReset().mockResolvedValue({ close: vi.fn() });
  state.online = true;
  items = [];
  context = { draftId: "f97c6ad1-5328-4a23-af39-8fa8bf280007" };
  name = "Nelson Summer";
  dirty.mockReset();
});
it("adds custom destinations explicitly, preserves selected order across name changes and removes by local identity", () => {
  render();
  input("Nelson");
  render();
  press("createTripV2.custom:Nelson");
  render();
  input("Tokyo");
  render();
  press("createTripV2.custom:Tokyo");
  expect(items.map((i) => i.text)).toEqual(["Nelson", "Tokyo"]);
  const first = items[0];
  name = "New Trip Name";
  render();
  expect(items[0]).toBe(first);
  press("createTripV2.removeDestination:Nelson");
  expect(items.map((i) => i.text)).toEqual(["Tokyo"]);
  expect(dirty).toHaveBeenLastCalledWith(false);
});
it("reorders whole destination selections without changing their identities or pending search", () => {
  for (const value of ["Nelson", "Auckland", "Tokyo"]) {
    render();
    input(value);
    render();
    press(`createTripV2.custom:${value}`);
  }
  const [first, second, third] = items;
  render();
  input("Pending search");
  render();
  expect(
    state.nodes.some(
      (node) => node.accessibilityLabel === "createTripV2.moveDestinationEarlier:Nelson",
    ),
  ).toBe(false);
  expect(
    state.nodes.some(
      (node) => node.accessibilityLabel === "createTripV2.moveDestinationLater:Tokyo",
    ),
  ).toBe(false);
  press("createTripV2.moveDestinationEarlier:Auckland");
  expect(items).toEqual([second, first, third]);
  expect(items[0]).toBe(second);
  expect(items[1]).toBe(first);
  render();
  expect(state.nodes.find((node) => node.onChangeText).value).toBe("Pending search");
  press("createTripV2.moveDestinationLater:Auckland");
  expect(items).toEqual([first, second, third]);
});
it("does not reorder after the active Account generation changes", () => {
  for (const value of ["Nelson", "Auckland"]) {
    render();
    input(value);
    render();
    press(`createTripV2.custom:${value}`);
  }
  render();
  const original = items;
  state.generation = 2;
  press("createTripV2.moveDestinationLater:Nelson");
  expect(items).toBe(original);
});
it("uses real provider completion then resolve before adding Apple destination metadata", async () => {
  render();
  await flush();
  expect(state.update).toHaveBeenCalledWith(
    { text: "Nelson", locale: "en-NZ", intent: "destinationArea" },
    450,
    true,
  );
  state.emit({
    status: "READY",
    rows: [{ handle: "completion", title: "Nelson", secondary: "New Zealand" }],
    more: false,
  });
  render();
  expect(items).toEqual([]);
  const mapItem = {
    provider: "apple",
    kind: "mapItem",
    title: "Nelson",
    secondary: "New Zealand",
    handle: "resolved",
    sessionId: "s",
    generation: 1,
    providerPlaceId: "real-nelson-id",
  };
  state.resolve.mockResolvedValue(mapItem);
  await press("Nelson, New Zealand");
  expect(items[0]).toEqual(
    expect.objectContaining({
      source: "APPLE",
      text: "Nelson",
      match: expect.objectContaining({ providerPlaceId: "real-nelson-id" }),
    }),
  );
});
it("ignores a resolved response after account generation changes", async () => {
  render();
  await flush();
  state.emit({
    status: "READY",
    rows: [{ handle: "c", title: "Nelson", secondary: "NZ" }],
    more: false,
  });
  render();
  let finish!: (v: unknown) => void;
  state.resolve.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const pending = press("Nelson, NZ");
  state.generation = 2;
  finish({ provider: "apple", kind: "mapItem", title: "Nelson", secondary: "NZ" });
  await pending;
  expect(items).toEqual([]);
});
it("retains explicit custom entry when native search is unavailable", async () => {
  state.provider.mockRejectedValue(new Error("NATIVE_UNAVAILABLE"));
  render();
  await flush();
  input("Remote hut");
  expect(render()).toContain("createTripV2.searchUnavailable");
  press("createTripV2.custom:Remote hut");
  expect(items[0].source).toBe("MANUAL");
});

it("adds a selected no-ID city immediately using the existing qualified manual identity", async () => {
  render();
  await flush();
  state.emit({
    status: "READY",
    rows: [{ handle: "c", title: "Nelson", secondary: "NZ" }],
    more: false,
  });
  render();
  state.resolve.mockResolvedValue({
    provider: "apple",
    kind: "mapItem",
    title: "Nelson",
    secondary: "NZ",
  });
  await press("Nelson, NZ");
  expect(items[0]).toEqual(
    expect.objectContaining({ text: "Nelson, NZ", source: "MANUAL" }),
  );
  expect(items[0]).not.toHaveProperty("match");
  expect(render()).not.toContain("createTripV2.customRequired");
});

it("dismisses suggestions after selecting, reopening only for an active query or a new empty-selection name", async () => {
  render();
  await flush();
  state.emit({
    status: "READY",
    rows: [{ handle: "c", title: "Nelson", secondary: "NZ" }],
    more: false,
  });
  render();
  input("Custom Nelson");
  render();
  press("createTripV2.custom:Custom Nelson");
  render();
  expect(state.nodes.some((node) => node.accessibilityLabel === "Nelson, NZ")).toBe(
    false,
  );
  name = "Tokyo Holiday";
  render();
  expect(state.nodes.some((node) => node.accessibilityLabel === "Nelson, NZ")).toBe(
    false,
  );
  input("Kyoto");
  render();
  expect(state.nodes.some((node) => node.accessibilityLabel === "Nelson, NZ")).toBe(true);
  input("");
  render();
  press("createTripV2.removeDestination:Custom Nelson");
  name = "New name";
  render();
  expect(state.update).toHaveBeenLastCalledWith(
    { text: "New name", locale: "en-NZ", intent: "destinationArea" },
    450,
    true,
  );
});

it("keeps query and selected tags when normalized custom text exceeds its bound", () => {
  render();
  input("ﬃ".repeat(100));
  render();
  expect(() => press(`createTripV2.custom:${"ﬃ".repeat(100)}`)).not.toThrow();
  expect(render()).toContain("createTripV2.destinationLength");
  expect(items).toEqual([]);
  expect(state.nodes.find((node) => node.onChangeText).value).toBe("ﬃ".repeat(100));
});

it("reveals the existing chip instead of duplicating an explicitly selected destination", () => {
  render();
  input("Nelson");
  render();
  press("createTripV2.custom:Nelson");
  render();
  const original = items[0];
  state.views
    .find((view) => view.onLayout)
    .onLayout({ nativeEvent: { layout: { x: 120 } } });
  input("Nelson");
  render();
  press("createTripV2.custom:Nelson");
  expect(items).toEqual([original]);
  expect(state.scroll).toHaveBeenCalledWith({ x: 120, animated: true });
});

it("preserves the query and existing tags if a selected area label exceeds persistence limits", async () => {
  render();
  await flush();
  input("Sydney");
  render();
  state.emit({
    status: "READY",
    rows: [{ handle: "c", title: "Sydney", secondary: "Australia" }],
    more: false,
  });
  render();
  state.resolve.mockResolvedValue({
    provider: "apple",
    kind: "mapItem",
    title: "x".repeat(250),
    secondary: "Australia",
  });
  await press("Sydney, Australia");
  expect(items).toEqual([]);
  expect(render()).toContain("createTripV2.destinationLength");
  expect(state.nodes.find((node) => node.onChangeText).value).toBe("Sydney");
});

it("binds Edit autocomplete to the actual Trip and editor while keeping destination-only intent", async () => {
  context = {
    tripId: "f97c6ad1-5328-4a23-af39-8fa8bf280008",
    editorId: "f97c6ad1-5328-4a23-af39-8fa8bf280009",
  };
  render();
  await flush();
  expect(state.provider).toHaveBeenCalledWith(
    expect.objectContaining({ ...context, accountGeneration: 1 }),
  );
  expect(state.provider.mock.calls[0][0]).not.toHaveProperty("draftId");
  expect(state.update).toHaveBeenCalledWith(
    expect.objectContaining({ intent: "destinationArea" }),
    450,
    true,
  );
  const oldBinding = state.provider.mock.calls[0][0];
  context = {
    tripId: "f97c6ad1-5328-4a23-af39-8fa8bf280010",
    editorId: "f97c6ad1-5328-4a23-af39-8fa8bf280011",
  };
  render();
  expect(oldBinding.isCurrent()).toBe(false);
  await flush();
  expect(state.provider).toHaveBeenLastCalledWith(expect.objectContaining(context));
});
