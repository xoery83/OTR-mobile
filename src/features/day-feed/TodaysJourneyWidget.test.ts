import { Children, isValidElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { TodaysJourneyWidget } from "./TodaysJourneyWidget";
const state = vi.hoisted(() => ({ hooks: [] as unknown[], cursor: 0 }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useCallback: (callback: unknown) => callback,
  useState: () => [state.hooks[state.cursor++], vi.fn()],
  useRef: (value: unknown) => ({ current: value }),
  useSyncExternalStore: () => 1,
  useEffect: () => {},
}));
vi.mock("react-native", () => ({
  View: "View",
  Pressable: "Pressable",
  AppState: {},
  StyleSheet: { create: (s: unknown) => s },
}));
vi.mock("@/components/AppIcon", () => ({ AppIcon: "Icon" }));
vi.mock("@/ui/controls", () => ({ UiButton: "Button", UiText: "Text" }));
vi.mock("@/ui/locale", () => ({ t: (k: string) => k, formatUiDate: () => "date" }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => {} }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => 1,
  subscribeAccountGeneration: () => () => {},
}));
vi.mock("@/data/repositories/tripTodaysJourneyRepository", () => ({
  readTripTodaysJourney: vi.fn(),
}));
function buttons(node: ReactNode): any[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return [];
    return [
      ...(child.type === "Button" ? [child.props] : []),
      ...buttons(child.props.children),
    ];
  });
}
it("routes accepted-only unknown-zone plans to the honest date chooser, not an invalid empty-zone Day", () => {
  const choose = vi.fn(),
    open = vi.fn();
  state.cursor = 0;
  state.hooks = [
    "trip/null/2026-10-16//0",
    {
      scope: { tripId: "trip", generation: 1 },
      source: { epoch: "accepted" },
      today: {
        date: "2026-10-16",
        zone: null,
        primary: null,
        primaryKind: "FREE",
        later: [],
        tonight: null,
      },
    },
    "READY",
  ];
  const node = TodaysJourneyWidget({
    tripId: "trip",
    zone: null,
    planningDate: "2026-10-16",
    onOpenDayChooser: choose,
    onOpenToday: open,
    onOpenItem: vi.fn(),
    copy: {
      title: "Today",
      openToday: "Open Today",
      upcoming: "Next",
      plans: "Plans",
      free: "Free",
      later: "Later",
      tonight: "Stay",
      multipleStays: "Many",
      loading: "Loading",
      unavailable: "Unavailable",
      chooseDay: "Choose date",
    },
  });
  const actions = buttons(node);
  expect(actions).toHaveLength(1);
  expect(actions[0]).toMatchObject({ label: "Choose date", disabled: false });
  actions[0].onPress();
  expect(choose).toHaveBeenCalledOnce();
  expect(open).not.toHaveBeenCalled();
});
