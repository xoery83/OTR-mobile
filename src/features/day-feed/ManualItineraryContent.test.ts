import { createElement } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { ManualItineraryContent } from "./ManualItineraryContent";
vi.mock("./ManualFlightForm", () => ({
  ManualFlightEditor: (props: any) => {
    state.editor = { family: "P2", ...props };
    return null;
  },
}));
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server");
const state = vi.hoisted(() => ({
  hooks: [] as any[],
  cursor: 0,
  generation: 1,
  buttons: [] as any[],
  editor: null as any,
  read: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: () => {},
  useSyncExternalStore: (_: unknown, get: () => unknown) => get(),
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
}));
vi.mock("react-native", () => ({
  View: "div",
  ScrollView: "section",
  StyleSheet: {
    create: (x: unknown) => x,
    absoluteFill: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  },
  Pressable: (p: any) => {
    state.buttons.push(p);
    return createElement("button", null, p.children);
  },
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => state.generation,
  subscribeAccountGeneration: () => () => {},
}));
vi.mock("@/data/repositories/tripRepository", () => ({
  readLocalTripRepository: state.read,
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "aside" }));
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
vi.mock("@/components/SheetHeader", () => ({
  SheetHeader: (p: any) => {
    state.buttons.push({ accessibilityLabel: p.leftLabel, onPress: p.onLeft });
    return null;
  },
}));
vi.mock("@/ui/controls", () => ({ UiText: "span" }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => {} }));
vi.mock("@/ui/theme", () => ({
  useUiTheme: () => ({}),
  useThemedStyles: (make: any) => make({}),
}));
vi.mock("./P1PlanEditor", () => ({
  P1PlanEditor: (props: any) => {
    state.editor = { family: "P1", ...props };
    return null;
  },
}));
vi.mock("./P3StayEditor", () => ({
  P3StayEditor: (props: any) => {
    state.editor = { family: "P3", ...props };
    return null;
  },
}));
vi.mock("./P4RentalEditor", () => ({
  P4RentalEditor: (props: any) => {
    state.editor = { family: "P4", ...props };
    return null;
  },
}));
vi.mock("./P5TransportEditor", () => ({
  P5TransportEditor: (props: any) => {
    state.editor = { family: "P5", ...props };
    return null;
  },
}));
vi.mock("./P6ActivityEditor", () => ({
  P6ActivityEditor: (props: any) => {
    state.editor = { family: "P6", ...props };
    return null;
  },
}));
const props = {
  localOnly: false,
  tripId: "trip-a",
  generation: 1,
  initialDate: "2027-02-08",
  initialStartTime: "12:30",
  tripStartDate: "2027-02-01",
  onClose: vi.fn(),
  onSaved: vi.fn(),
};
function render() {
  state.cursor = 0;
  state.buttons = [];
  state.editor = null;
  return renderToStaticMarkup(createElement(ManualItineraryContent, props));
}
beforeEach(() => {
  props.localOnly = false;
  state.hooks = [];
  state.generation = 1;
  props.onSaved.mockReset();
  props.onClose.mockReset();
  state.read.mockReset();
});
it("shows the approved 2+5 order without creating a draft or reading an editor", () => {
  render();
  expect(
    state.buttons
      .filter((p) => p.accessibilityLabel?.startsWith("formEntry."))
      .map((p) => p.accessibilityLabel),
  ).toEqual([
    "formEntry.plan",
    "formEntry.flexible",
    "formEntry.flight",
    "formEntry.stay",
    "formEntry.rental",
    "formEntry.transport",
    "formEntry.activity",
  ]);
  expect(state.editor).toBeNull();
  expect(state.read).not.toHaveBeenCalled();
  state.buttons[0].onPress();
  expect(props.onClose).toHaveBeenCalledOnce();
  expect(props.onSaved).not.toHaveBeenCalled();
});
it.each([
  ["flight", "P2"],
  ["plan", "P1"],
  ["stay", "P3"],
  ["rental", "P4"],
  ["transport", "P5"],
  ["activity", "P6"],
])(
  "opens %s's existing lawful editor in the same sheet with exact context",
  (label, family) => {
    render();
    state.buttons.find((p) => p.accessibilityLabel === `formEntry.${label}`).onPress();
    render();
    expect(state.editor).toMatchObject({
      family,
      tripId: "trip-a",
      initialDate: "2027-02-08",
      tripStartDate: "2027-02-01",
      embedded: true,
    });
    expect(state.editor.initialStartTime).toBe(family === "P1" ? "12:30" : undefined);
    state.editor.onSaved("item-a");
    expect(props.onSaved).toHaveBeenCalledWith("item-a");
  },
);
it("unsupported types cannot route to P1 even if a stale handler is invoked", () => {
  for (const label of ["flexible"]) {
    render();
    const button = state.buttons.find(
      (p) => p.accessibilityLabel === `formEntry.${label}`,
    );
    expect(button.disabled).toBe(true);
    expect(button.accessibilityHint).toContain("Unavailable");
    button.onPress();
    render();
    expect(state.editor).toBeNull();
  }
});
it("blocks a late selection/save after account generation changes", () => {
  render();
  const plan = state.buttons.find((p) => p.accessibilityLabel === "formEntry.plan");
  plan.onPress();
  render();
  const saved = state.editor.onSaved;
  state.generation = 2;
  saved("late-item");
  expect(props.onSaved).not.toHaveBeenCalled();
  expect(render()).toBe("");
});

it("dismissing the chooser backdrop closes without starting or saving an editor", () => {
  render();
  const backdrop = state.buttons.find(
    (p) => p.style && p.accessibilityLabel === "common.close",
  );
  expect(backdrop).toBeDefined();
  backdrop.onPress();
  expect(props.onClose).toHaveBeenCalledOnce();
  expect(state.editor).toBeNull();
  expect(state.read).not.toHaveBeenCalled();
  expect(props.onSaved).not.toHaveBeenCalled();
});

vi.mock("@/data/auth/localTripAccess", async () => ({
  readLocalTripPrincipal: vi.fn(async () => ({
    kind: "ACCOUNT",
    accountId: "test-account",
  })),
  ...(await import("@/data/repositories/tripRepository")),
  kickLocalTripSync: vi.fn(async () => {}),
}));

it("Guest local slice exposes only the existing P1 writer and preserves normal Account chooser capabilities", () => {
  props.localOnly = true;
  render();
  const plan = state.buttons.find(
    (button) => button.accessibilityLabel === "formEntry.plan",
  );
  const stay = state.buttons.find(
    (button) => button.accessibilityLabel === "formEntry.stay",
  );
  expect(plan.disabled).toBe(false);
  expect(stay.disabled).toBe(true);
  stay.onPress();
  render();
  expect(state.editor).toBeNull();
  state.buttons
    .find((button) => button.accessibilityLabel === "formEntry.plan")
    .onPress();
  render();
  expect(state.editor.family).toBe("P1");
});
