import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { lightPalette, darkPalette } from "@/ui/palette";
import { TripPreparationWidget } from "./TripPreparationWidget";
const state = vi.hoisted(() => ({ palette: {} as any }));
vi.mock("react-native", () => ({
  Pressable: "Pressable",
  View: "View",
  StyleSheet: { create: (s: any) => s },
}));
vi.mock("@/components/AppIcon", () => ({ AppIcon: "AppIcon" }));
vi.mock("@/ui/controls", () => ({ UiText: "UiText", UiButton: "UiButton" }));
vi.mock("./TripSetupRows", () => ({ TripSetupRows: "TripSetupRows" }));
vi.mock("@/ui/theme", () => ({
  useThemedStyles: (f: any) => f(state.palette),
  useUiTheme: () => state.palette,
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/locale", () => ({
  t: (key: string) => key,
  formatUiNumber: String,
  formatUiDate: String,
}));
type Node = ReactElement<any>;
const nodes = (node: ReactNode): Node[] =>
  isValidElement(node)
    ? [node as Node, ...Children.toArray((node as Node).props.children).flatMap(nodes)]
    : [];
const copy = {
  title: "Prepare",
  empty: "Empty",
  recent: "Recent",
  loading: "Loading",
  unavailable: "Unavailable",
  importPlans: "Import travel plans · 导入旅行计划",
  buildItinerary: "Build your itinerary · 手动编排行程",
  importMore: "More",
  openDay: "Day",
  families: { P1: "P1", P2: "P2", P3: "P3", P4: "P4", P5: "P5", P6: "P6" },
};
beforeEach(() => {
  state.palette = lightPalette;
});
it.each([lightPalette, darkPalette])(
  "uses equally weighted theme surfaces and the original eligible action callbacks",
  (palette) => {
    state.palette = palette;
    const onImport = vi.fn(),
      onBuildItinerary = vi.fn();
    const view = nodes(
      TripPreparationWidget({
        value: { itemCount: 0, counts: [], recent: [] },
        state: "READY",
        copy,
        onImport,
        onBuildItinerary,
      }),
    );
    const actions = view.filter((n) => n.type === "Pressable");
    expect(actions).toHaveLength(2);
    for (const action of actions) {
      expect(action.props.style.backgroundColor).toBe(palette.accentSurface);
      expect(action.props.style.backgroundColor).not.toBe(palette.accent);
      expect(action.props.style.height).toBeUndefined();
      expect(nodes(action).some((n) => n.props.name === "chevron.right")).toBe(true);
    }
    actions[0].props.onPress();
    actions[1].props.onPress();
    expect(onImport).toHaveBeenCalledOnce();
    expect(onBuildItinerary).toHaveBeenCalledOnce();
    expect(view.some((n) => n.type === "UiButton")).toBe(false);
    for (const text of view.filter((n) => n.type === "UiText"))
      expect(text.props.numberOfLines).toBeUndefined();
  },
);
it("does not create an action when the owning handler is unavailable", () => {
  const view = nodes(
    TripPreparationWidget({
      value: { itemCount: 0, counts: [], recent: [] },
      state: "READY",
      copy,
    }),
  );
  expect(view.some((n) => n.type === "Pressable")).toBe(false);
});

it("shows independent Ledger setup without claiming an available itinerary", () => {
  const setup = {
    context: { accountId: "actor", tripId: "trip", generation: 1 },
    currency: {
      state: "AVAILABLE",
      code: "NZD",
      scale: 2,
      permission: "OWNER",
      lock: "NOT_OBSERVED",
    },
    members: { state: "UNKNOWN" },
    invitations: "UNKNOWN",
    connections: "UNKNOWN",
  } as const;
  const onCurrency = vi.fn();
  const view = nodes(
    TripPreparationWidget({ value: null, state: "UNAVAILABLE", copy, setup, onCurrency }),
  );
  const rows = view.find((node) => node.type === "TripSetupRows");
  expect(rows?.props.setup).toBe(setup);
  expect(rows?.props.onCurrency).toBe(onCurrency);
  expect(rows?.props.onEdit).toBeUndefined();
  expect(view.some((node) => node.type === "Pressable")).toBe(false);
});
