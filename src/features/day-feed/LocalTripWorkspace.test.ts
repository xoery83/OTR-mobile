import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import type { Trip } from "@/domain/trip/types";
import type { TripRepository } from "@/data/repositories/tripRepository";
import {
  advanceAccountGeneration,
  getAccountGeneration,
} from "@/data/auth/accountGeneration";
import { LocalTripWorkspace } from "./LocalTripWorkspace";

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
// Same scoped hook/SSR technique as render.test.ts. A changed React key unmounts
// the old content before mounting fresh hooks; keep the old cleanup/closures live
// so deferred repository completion exercises the real component save callback.
const state = vi.hoisted(() => ({
  hooks: [] as unknown[],
  refs: [] as { current: unknown }[],
  cursor: 0,
  refCursor: 0,
  effects: [] as (() => void | (() => void))[],
  cleanups: [] as (() => void)[],
  nodes: [] as Record<string, any>[],
  mount: false,
  repo: vi.fn(),
  serial: 0,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useSyncExternalStore: (_: unknown, snapshot: () => unknown) => snapshot(),
  useCallback: (callback: unknown) => callback,
  useEffect: (callback: () => void | (() => void)) => {
    if (state.mount) state.effects.push(callback);
  },
  useLayoutEffect: (callback: () => void | (() => void)) => {
    if (state.mount) {
      const cleanup = callback();
      if (cleanup) state.cleanups.push(cleanup);
    }
  },
  useState: (initial: unknown) => {
    const i = state.cursor++,
      hooks = state.hooks;
    if (!(i in hooks)) hooks[i] = typeof initial === "function" ? initial() : initial;
    return [
      hooks[i],
      (next: unknown) => {
        hooks[i] = typeof next === "function" ? next(hooks[i]) : next;
      },
    ];
  },
  useRef: (initial: unknown) => (state.refs[state.refCursor++] ??= { current: initial }),
}));
vi.mock("react-native", () => ({
  View: (p: any) => createElement("div", null, p.children),
  Text: (p: any) => createElement("span", null, p.children),
  StyleSheet: { create: (styles: unknown) => styles },
  AppState: { addEventListener: () => ({ remove: vi.fn() }) },
}));
vi.mock("@/ui/controls", () => ({
  UiButton: (p: any) => {
    state.nodes.push(p);
    return createElement("button", { disabled: p.disabled }, p.label);
  },
  UiSection: (p: any) => createElement("section", null, p.title, p.children),
}));
vi.mock("@/ui/forms", () => ({
  UiTextInput: (p: any) => {
    state.nodes.push(p);
    return createElement("input", { value: p.value, readOnly: true });
  },
  UiFormRow: (p: any) => {
    state.nodes.push(p);
    return null;
  },
  UiDatePicker: (p: any) => {
    state.nodes.push(p);
    return null;
  },
  UiChoiceChip: () => null,
}));
vi.mock("@/ui/locale", () => ({
  t: (key: string) => key,
  formatUiDate: (date: Date) => date.toISOString().slice(0, 10),
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
vi.mock("@/domain/localId", () => ({ createUuid: () => `test-uuid-${++state.serial}` }));
vi.mock("@/data/repositories/tripRepository", () => ({
  readLocalTripRepository: () => state.repo(),
}));

const trip = (id: string, name: string): Trip => ({
  id,
  name,
  destination: null,
  startDate: null,
  endDate: null,
  baseCurrency: null,
  ownerPersonId: null,
  serverId: null,
  syncStatus: "PENDING_CREATE",
  syncVersion: 0,
  createdAt: "2026-10-13T00:00:00Z",
  updatedAt: "2026-10-13T00:00:00Z",
  deletedAt: null,
});
const repository = (list: Trip[] = []): TripRepository => ({
  listTrips: vi.fn(async () => list),
  getTrip: vi.fn(async (id) => list.find((t) => t.id === id) ?? null),
  selectBuiltInCover: vi.fn(async () => {}),
  createTrip: vi.fn(async (input) => trip(input.tripId, input.name)),
  addItem: vi.fn(async (_tripId, input) => ({
    localStatus: "PENDING" as const,
    itemId: input.itemId,
    operationId: input.operationId,
  })),
  pendingItems: vi.fn(async () => []),
  acceptCreate: vi.fn(async (result) => trip(result.tripId, result.name)),
  resumeCreateTrips: vi.fn(async () => {}),
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
let key: string | null;
const props = {
  tripId: null as string | null,
  onOpen: vi.fn(),
  onKnownTrip: vi.fn(),
  onBackToTrips: vi.fn(),
};
function render() {
  const element = LocalTripWorkspace(props);
  const next = String(element.key);
  state.mount = next !== key;
  if (state.mount) {
    state.cleanups.forEach((cleanup) => cleanup());
    state.cleanups = [];
    state.hooks = [];
    state.refs = [];
    key = next;
  }
  state.cursor = 0;
  state.refCursor = 0;
  state.nodes = [];
  const html = renderToStaticMarkup(element);
  for (const effect of state.effects.splice(0)) {
    const cleanup = effect();
    if (cleanup) state.cleanups.push(cleanup);
  }
  state.mount = false;
  return html;
}
const button = (label: string) => state.nodes.find((node) => node.label === label)!;
function input(label: string, value: string) {
  state.nodes.find((node) => node.accessibilityLabel === label)!.onChangeText(value);
}
beforeEach(() => {
  state.cleanups.forEach((cleanup) => cleanup());
  state.cleanups = [];
  state.effects = [];
  state.hooks = [];
  state.refs = [];
  key = null;
  state.repo.mockReset();
  props.tripId = null;
  props.onOpen.mockClear();
  props.onKnownTrip.mockClear();
  props.onBackToTrips.mockClear();
  advanceAccountGeneration();
});

it("fences a deferred A save before mutation, clears stale account UI, and lets B save", async () => {
  const a = repository([trip("a-old", "Account A old trip")]),
    b = repository();
  state.repo.mockResolvedValue(a);
  render();
  await flush();
  expect(render()).toContain("Account A old trip");
  input("tripCreate.name", "A private draft");
  render();
  const old = deferred<TripRepository>();
  state.repo.mockImplementationOnce(() => old.promise);
  button("tripCreate.saveTrip").onPress();
  render();
  expect(button("tripCreate.saveTrip").disabled).toBe(true);
  const oldKey = key;
  advanceAccountGeneration();
  state.repo.mockResolvedValue(b);
  const immediate = render();
  expect(key).not.toBe(oldKey);
  expect(immediate).not.toContain("Account A old trip");
  expect(immediate).not.toContain("A private draft");
  await flush();
  render();
  input("tripCreate.name", "B own draft");
  render();
  const bSave = deferred<TripRepository>();
  state.repo.mockImplementationOnce(() => bSave.promise);
  button("tripCreate.saveTrip").onPress();
  render();
  old.resolve(b);
  await flush();
  render();
  expect(b.createTrip).not.toHaveBeenCalled();
  expect(button("tripCreate.saveTrip").disabled).toBe(true);
  bSave.resolve(b);
  await flush();
  render();
  expect(b.createTrip).toHaveBeenCalledOnce();
  expect(b.createTrip).toHaveBeenCalledWith(
    expect.objectContaining({ name: "B own draft" }),
  );
  expect(button("tripCreate.saveTrip").disabled).toBe(false);
  expect(props.onOpen).toHaveBeenCalledOnce();
});

it("remounts when leaving a trip, rejects its late item save, and exposes My Trips", async () => {
  const repo = repository([trip("local-a", "Local pending trip")]);
  state.repo.mockResolvedValue(repo);
  props.tripId = "local-a";
  render();
  await flush();
  expect(render()).toContain("Local pending trip");
  button("dayFeed.myTrips").onPress();
  expect(props.onBackToTrips).toHaveBeenCalledOnce();
  input("tripCreate.itemTitle", "Old trip draft");
  render();
  button("tripCreate.itemDate").onPress();
  render();
  state.nodes
    .find((node) => node.mode === "date")!
    .onChange(undefined, new Date(2026, 9, 13, 12));
  render();
  button("common.done").onPress();
  render();
  expect(button("tripCreate.saveItem").disabled).toBe(false);
  const old = deferred<TripRepository>();
  state.repo.mockImplementationOnce(() => old.promise);
  button("tripCreate.saveItem").onPress();
  const generation = getAccountGeneration(),
    oldKey = key;
  props.tripId = null;
  expect(render()).not.toContain("Old trip draft");
  expect(getAccountGeneration()).toBe(generation);
  expect(key).not.toBe(oldKey);
  old.resolve(repo);
  await flush();
  render();
  expect(repo.addItem).not.toHaveBeenCalled();
  expect(button("Local pending trip")).toBeDefined();
  button("Local pending trip").onPress();
  expect(props.onOpen).toHaveBeenCalledWith("local-a");
});
