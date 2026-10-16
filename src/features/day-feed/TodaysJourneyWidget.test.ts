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
it("opens accepted-only unknown-zone plans directly through the normal reader", async () => {
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
  const { readTripTodaysJourney } =
    await import("@/data/repositories/tripTodaysJourneyRepository");
  vi.mocked(readTripTodaysJourney).mockResolvedValue({
    read: async () => state.hooks[1],
  } as any);
  const renderWidget = () =>
    TodaysJourneyWidget({
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
  const actions = buttons(renderWidget());
  expect(actions).toHaveLength(1);
  expect(actions[0]).toMatchObject({
    label: "tripHome.preparation.day",
    disabled: false,
  });
  await actions[0].onPress();
  for (let i = 0; i < 8; i++) await Promise.resolve();
  expect(choose).not.toHaveBeenCalled();
  expect(open).toHaveBeenCalledOnce();
  (state.hooks[1] as any).today.tonight = { itemRef: "hotel", title: "Sky City Hotel" };
  state.cursor = 0;
  const withStay = JSON.stringify(renderWidget());
  expect(withStay).toContain("Sky City Hotel");
  expect(withStay).not.toContain('"Free"');
});
