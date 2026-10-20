vi.mock("@/features/day-feed/ManualItineraryContent", () => ({
  ManualItineraryContent: (props: any) => {
    state.manualProps = props;
    return null;
  },
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => state.generation,
  subscribeAccountGeneration: () => () => {},
}));
import { createElement } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import {
  TripQuickAddMenu,
  shiftSuggestedDate,
  validSuggestedDate,
} from "./TripQuickAddMenu";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server");
const state = vi.hoisted(() => ({
  hooks: [] as unknown[],
  cursor: 0,
  nodes: [] as any[],
  actor: vi.fn(),
  refs: [] as { current: any }[],
  refCursor: 0,
  generation: 1,
  manualProps: null as any,
  modalProps: null as any,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useLayoutEffect: () => {},
  useSyncExternalStore: (_: unknown, get: () => unknown) => get(),
  useRef: (initial: unknown) => (state.refs[state.refCursor++] ??= { current: initial }),
  useState: (initial: unknown) => {
    const i = state.cursor++;
    if (!(i in state.hooks)) state.hooks[i] = initial;
    return [
      state.hooks[i],
      (value: unknown) => {
        state.hooks[i] = typeof value === "function" ? value(state.hooks[i]) : value;
      },
    ];
  },
}));
vi.mock("react-native", () => ({
  Modal: (p: any) => {
    state.modalProps = p;
    return p.visible ? createElement("div", null, p.children) : null;
  },
  Pressable: (p: any) => {
    state.nodes.push(p);
    return createElement("button", null, p.children);
  },
  View: (p: any) => createElement("div", null, p.children),
  ScrollView: (p: any) => createElement("div", null, p.children),
  StyleSheet: { create: (x: unknown) => x },
}));
vi.mock("./AppIcon", () => ({ AppIcon: () => null }));
vi.mock("./SheetHeader", () => ({
  SheetHeader: (p: any) => {
    state.nodes.push({ label: p.leftLabel, onPress: p.onLeft });
    return null;
  },
}));
vi.mock("@/ui/controls", () => ({
  UiText: (p: any) => createElement("span", null, p.children),
  UiButton: (p: any) => {
    state.nodes.push(p);
    return createElement("button", { disabled: p.disabled }, p.label);
  },
}));
vi.mock("@/ui/forms", () => ({
  UiDatePicker: (p: any) => {
    state.nodes.push(p);
    return null;
  },
  UiFormRow: (p: any) => {
    state.nodes.push(p);
    return createElement("button", { disabled: p.disabled }, p.label);
  },
  UiTextInput: (p: any) => {
    state.nodes.push(p);
    return createElement("input", { value: p.value, readOnly: true });
  },
}));
vi.mock("@/ui/locale", () => ({
  t: (k: string) => k,
  formatUiDate: (date: Date) => date.toISOString().slice(0, 10),
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/theme", () => ({ useUiTheme: () => ({}), useThemedStyles: () => ({}) }));
vi.mock("@/data/auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("@/data/auth/accountRequestContext", () => ({
  captureAccountScope: async () => ({ generation: 1 }),
  assertAccountRequestGeneration: vi.fn(),
}));
vi.mock("@/data/repositories/defaultLedgerReportingRepository", () => ({
  getDefaultLedgerReportingRepository: async () => ({
    listJourneys: async () => [{ journeyId: "a" }],
    getActorContext: () => state.actor(),
  }),
}));
const itinerary = vi.fn(),
  expense = vi.fn(),
  photos = vi.fn();
let initialDate: string | undefined;
let useManual = false;
const manualSaved = vi.fn();
function render() {
  state.cursor = 0;
  state.refCursor = 0;
  state.nodes = [];
  return renderToStaticMarkup(
    createElement(TripQuickAddMenu, {
      tripId: "a",
      date: initialDate,
      showDate: true,
      itinerary,
      onManualSaved: useManual ? manualSaved : undefined,
      expense,
      photos,
      triggerStyle: {},
    }),
  );
}
const button = (label: string) => state.nodes.find((n) => n.label === label)!;
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
beforeEach(() => {
  state.hooks = [];
  state.refs = [];
  state.generation = 1;
  useManual = false;
  state.manualProps = null;
  manualSaved.mockReset();
  state.actor.mockResolvedValue({ memberId: "m", role: "owner" });
  initialDate = "2026-12-31";
  itinerary.mockReset();
  expense.mockReset();
  photos.mockReset();
});
it("arrows change only weak menu date and pass it into the existing create callback", async () => {
  render();
  state.nodes[0].onPress();
  await flush();
  render();
  button("actionIsland.nextDate").onPress();
  render();
  expect(button("actionIsland.suggestedDate").value).toBe("2027-01-01");
  button("actionIsland.itinerary").onPress();
  expect(itinerary).toHaveBeenCalledWith("2027-01-01");
  expect(expense).not.toHaveBeenCalled();
  expect(photos).not.toHaveBeenCalled();
});
it("missing anchored date stays unknown and blocks dated flows until explicit selection", async () => {
  initialDate = undefined;
  render();
  state.nodes[0].onPress();
  await flush();
  const html = render();
  expect(html).toContain("actionIsland.selectDate");
  expect(button("actionIsland.previousDate").disabled).toBe(true);
  expect(button("actionIsland.itinerary").disabled).toBe(true);
  expect(button("actionIsland.importCapture").disabled).toBe(true);
  expect(button("actionIsland.member").disabled).toBe(true);
  initialDate = "2026-02-30";
  button("common.cancel").onPress();
  render();
  state.nodes[0].onPress();
  await flush();
  render();
  expect(button("actionIsland.itinerary").disabled).toBe(true);
});
it("current denied Expense access remains disabled", async () => {
  state.actor.mockResolvedValue({ memberId: "m", role: "denied" });
  render();
  state.nodes[0].onPress();
  await flush();
  render();
  expect(button("ledger.addExpense").disabled).toBe(true);
});
it("civil arrows preserve explicit dates across leap boundaries without inferring today", () => {
  expect(shiftSuggestedDate("2028-02-28", 1)).toBe("2028-02-29");
  expect(shiftSuggestedDate("2028-03-01", -1)).toBe("2028-02-29");
  expect(validSuggestedDate("unknown")).toBeNull();
  expect(shiftSuggestedDate("", 1)).toBeNull();
});

vi.mock("@/features/capture/captureTripPrior", () => ({
  readCaptureTripPrior: async () => ({ id: "a", name: "A" }),
}));

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: (p: any) =>
    createElement("article", { "data-modal-inset-provider": true }, p.children),
  SafeAreaView: (p: any) =>
    createElement("section", { "data-safe-area": p.edges.join(",") }, p.children),
}));
it("the open Modal protects header and actions with viewport safe areas and Cancel still dismisses without creating", async () => {
  render();
  state.nodes[0].onPress();
  await flush();
  const html = render();
  expect(html).toContain('data-modal-inset-provider="true"');
  expect(html.indexOf("data-modal-inset-provider")).toBeLessThan(
    html.indexOf("data-safe-area"),
  );
  expect(html).toContain('data-safe-area="bottom,left,right"');
  expect(html).toContain("actionIsland.itinerary");
  button("common.cancel").onPress();
  const closed = render();
  expect(closed).not.toContain("actionIsland.itinerary");
  expect(closed).not.toContain("data-modal-inset-provider");
  expect(itinerary).not.toHaveBeenCalled();
  expect(expense).not.toHaveBeenCalled();
  expect(photos).not.toHaveBeenCalled();
});

it("an unknown menu date can be explicitly selected without invoking or moving any flow", async () => {
  initialDate = undefined;
  render();
  state.nodes[0].onPress();
  await flush();
  render();
  expect(button("actionIsland.itinerary").disabled).toBe(true);
  button("actionIsland.suggestedDate").onPress();
  render();
  state.nodes
    .find((node) => node.mode === "date")
    .onChange(undefined, new Date(2027, 1, 9, 12));
  render();
  button("common.done").onPress();
  render();
  expect(button("actionIsland.suggestedDate").value).toBe("2027-02-09");
  expect(itinerary).not.toHaveBeenCalled();
  expect(expense).not.toHaveBeenCalled();
  button("actionIsland.itinerary").onPress();
  expect(itinerary).toHaveBeenCalledWith("2027-02-09");
});

it("expands the same native host into the shared type chooser without routing Home", async () => {
  useManual = true;
  render();
  state.nodes.find((p) => p.accessibilityLabel === "actionIsland.addToTrip").onPress();
  await flush();
  render();
  button("actionIsland.itinerary").onPress();
  render();
  expect(state.modalProps.visible).toBe(true);
  expect(state.manualProps).toMatchObject({
    tripId: "a",
    generation: 1,
    initialDate: "2026-12-31",
  });
  expect(button("actionIsland.itinerary")).toBeUndefined();
  expect(itinerary).not.toHaveBeenCalled();
  const guardedDismiss = vi.fn();
  state.manualProps.registerDismissHandler(guardedDismiss);
  state.modalProps.onRequestClose();
  expect(guardedDismiss).toHaveBeenCalledOnce();
  expect(manualSaved).not.toHaveBeenCalled();
  state.manualProps.onSaved("item-a");
  render();
  expect(manualSaved).toHaveBeenCalledWith("item-a");
  expect(state.modalProps.visible).toBe(false);
});
it("does not rebind an open manual chooser to the next account generation", async () => {
  useManual = true;
  render();
  state.nodes.find((p) => p.accessibilityLabel === "actionIsland.addToTrip").onPress();
  await flush();
  render();
  button("actionIsland.itinerary").onPress();
  render();
  const staleSave = state.manualProps.onSaved;
  state.generation = 2;
  render();
  expect(state.modalProps.visible).toBe(false);
  staleSave("late-item");
  expect(manualSaved).not.toHaveBeenCalled();
});
