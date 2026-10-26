import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { P2Detail } from "./P2Detail";
import { lightPalette } from "@/ui/palette";
const state = vi.hoisted(() => ({
  hooks: [] as any[],
  cursor: 0,
  effects: [] as any[],
  nodes: [] as any[],
  generation: 1,
  read: vi.fn(),
  draft: vi.fn(),
  outcome: vi.fn(),
  push: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useCallback: (fn: any) => fn,
  useSyncExternalStore: (_: any, read: any) => read(),
  useState: (initial: any) => {
    const i = state.cursor++;
    if (!(i in state.hooks)) state.hooks[i] = initial;
    return [
      state.hooks[i],
      (v: any) => (state.hooks[i] = typeof v === "function" ? v(state.hooks[i]) : v),
    ];
  },
}));
vi.mock("react-native", () => ({
  View: (p: any) => p.children,
  ScrollView: (p: any) => p.children,
  StyleSheet: { create: (s: any) => s },
}));
vi.mock("expo-router", () => {
  const Screen = () => null;
  const Toolbar = (p: any) => p.children;
  Toolbar.Button = function ToolbarButton(p: any) {
    state.nodes.push(p);
    return null;
  };
  return {
    router: { push: state.push },
    Stack: { Screen, Toolbar },
    useLocalSearchParams: () => ({ tripId: "trip", itemId: "flight" }),
    useFocusEffect: (fn: any) => state.effects.push(fn),
  };
});
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
vi.mock("@/components/navigationChrome", () => ({
  NavigationContentFrame: (p: any) => p.children,
}));
vi.mock("@/ui/controls", () => ({
  UiText: (p: any) => createElement("span", null, p.children),
  UiButton: (p: any) => {
    state.nodes.push({ ...p, action: true });
    return null;
  },
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/theme", () => ({
  useThemedStyles: (fn: any) => fn(lightPalette),
  useUiTheme: () => lightPalette,
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => state.generation,
  subscribeAccountGeneration: () => () => {},
}));
vi.mock("@/data/repositories/localManualFlightRepository", () => ({
  readLocalManualFlightRepository: async () => ({
    readForForm: state.read,
    createDraft: state.draft,
  }),
}));
vi.mock("./TripViewContext", () => ({
  useTripView: () => ({ reportManualOutcome: state.outcome }),
}));
vi.mock("./FlightFidelityGrid", () => ({
  FlightFidelityGrid: (p: any) =>
    createElement("span", null, p.flight.authored.flightNumberLiteral),
}));
vi.mock("./ManualFlightForm", () => ({
  ManualFlightEditor: (p: any) => {
    state.nodes.push({ ...p, editor: true });
    return null;
  },
}));
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
const render = () => {
  state.cursor = 0;
  state.nodes = [];
  return renderToStaticMarkup(createElement(P2Detail));
};
const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const item = () => ({
  tripId: "trip",
  itemId: "flight",
  itemRevision: 2,
  family: "P2",
  title: "NZ99",
  localState: "PENDING",
  details: { flightNumberLiteral: "NZ99" },
  schedule: { start: { localDate: "2026-10-26" } },
  participation: { mode: "WHOLE_GROUP", personIds: [] },
});
beforeEach(() => {
  state.hooks = [];
  state.effects = [];
  state.generation = 1;
  vi.clearAllMocks();
  state.read.mockResolvedValue(item());
  state.draft.mockResolvedValue({});
});
it("loads the same Item, gates native Edit through the Repository, then rereads after Save", async () => {
  render();
  state.effects.shift()();
  await settle();
  expect(render()).toContain("NZ99");
  expect(state.read).toHaveBeenCalledWith("trip", "flight");
  expect(state.draft).toHaveBeenCalledWith("trip", "flight", 2);
  state.nodes[0].onPress();
  render();
  const editor = state.nodes.find((n) => n.editor);
  expect(editor.expectedRevision).toBe(2);
  editor.onSaved("flight");
  render();
  state.effects.at(-1)();
  await settle();
  expect(state.read).toHaveBeenCalledTimes(2);
  expect(state.outcome).toHaveBeenCalledWith("trip", 1, "flight");
});
it("readable flight stays readonly when its owning edit capability is denied", async () => {
  state.draft.mockRejectedValue(Error("closed"));
  render();
  state.effects.shift()();
  await settle();
  expect(render()).toContain("NZ99");
  expect(state.nodes[0].disabled).toBe(true);
});
it("does not publish a late read from a previous account or cancelled screen", async () => {
  let resolve: any;
  state.read.mockImplementation(() => new Promise((r) => (resolve = r)));
  render();
  const cancel = state.effects.shift()();
  await settle();
  cancel();
  state.generation = 2;
  resolve(item());
  await settle();
  expect(render()).not.toContain("NZ99");
  expect(state.nodes[0].disabled).toBe(true);
});

it("Add expense carries the real Trip and departure date while unsupported actions stay disabled", async () => {
  render();
  state.effects.shift()();
  await settle();
  render();
  const actions = state.nodes.filter((n) => n.action);
  expect(actions).toHaveLength(4);
  expect(actions.filter((n) => n.disabled)).toHaveLength(3);
  actions.find((n) => !n.disabled).onPress();
  expect(state.push).toHaveBeenCalledWith({
    pathname: "/expenses/new",
    params: {
      journeyId: "trip",
      suggestedTitle: "NZ99",
      suggestedDate: "2026-10-26",
      mode: "manual",
    },
  });
});
