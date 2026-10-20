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
    if (!(i in state.hooks)) state.hooks[i] = initial;
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
  View: "div",
  ScrollView: "section",
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
vi.mock("@/data/places/applePlaceProvider", () => ({
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
function render() {
  state.cursor = 0;
  state.nodes = [];
  const html = renderToStaticMarkup(
    createElement(CreateTripDestinations, {
      name,
      draftId: "f97c6ad1-5328-4a23-af39-8fa8bf280007",
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
  state.update.mockReset();
  state.resolve.mockReset();
  state.close.mockReset();
  state.provider.mockReset().mockResolvedValue({ close: vi.fn() });
  state.online = true;
  items = [];
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
it("uses real provider completion then resolve before adding Apple destination metadata", async () => {
  render();
  await flush();
  expect(state.update).toHaveBeenCalledWith(
    { text: "Nelson Summer", locale: "en-NZ" },
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

it("requires explicit custom confirmation when resolved Apple result has no stable place ID", async () => {
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
  expect(items).toEqual([]);
  expect(render()).toContain("createTripV2.customRequired");
  press("createTripV2.custom:Nelson");
  expect(items[0]).toEqual(expect.objectContaining({ text: "Nelson", source: "MANUAL" }));
});
