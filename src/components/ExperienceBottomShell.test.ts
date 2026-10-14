import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { lightPalette } from "@/ui/palette";
import { ExperienceBottomShell } from "./ExperienceBottomShell";

const state = vi.hoisted(() => ({
  view: null as null | { tripId: string; date: string; zone: string; generation: number },
  navigate: vi.fn(),
  setParams: vi.fn(),
  fontScale: 1,
  params: {} as Record<string, string>,
  alerts: vi.fn(),
  push: vi.fn(),
  workingTrip: null as null | { tripId: string; generation: number },
  resume: vi.fn(),
  generation: 1,
  actorRole: "owner" as string | null,
  actor: vi.fn(),
  targetRef: { current: null as symbol | null },
  memo: null as null | { key: string; value: symbol },
}));
vi.mock("./TripQuickAddMenu", () => ({ TripQuickAddMenu: "TripQuickAddMenu" }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef: () => state.targetRef,
  useMemo: (make: () => symbol, deps: string[]) => {
    if (!state.memo || state.memo.key !== deps[0])
      state.memo = { key: deps[0], value: make() };
    return state.memo.value;
  },
  useSyncExternalStore: (_: unknown, get: () => unknown) => get(),
  useLayoutEffect: (effect: () => unknown) => effect(),
}));
vi.mock("@/data/auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("@/data/auth/accountRequestContext", () => ({
  captureAccountScope: async () => ({ generation: 1, accountId: "a" }),
  assertAccountRequestGeneration: (scope: { generation: number }) => {
    if (scope.generation !== state.generation) throw new Error("STALE");
  },
}));
vi.mock("@/data/repositories/defaultLedgerReportingRepository", () => ({
  getDefaultLedgerReportingRepository: async () => ({
    listJourneys: async () => [{ journeyId: "a" }],
    getActorContext: () => state.actor(),
  }),
}));
vi.mock("expo-router", () => ({
  router: state,
  useGlobalSearchParams: () => state.params,
}));
vi.mock("react-native", () => ({
  Alert: { alert: state.alerts },
  Pressable: "Pressable",
  Text: "Text",
  View: "View",
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
  useWindowDimensions: () => ({ fontScale: state.fontScale }),
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("@/components/AppIcon", () => ({ AppIcon: "AppIcon" }));
vi.mock("@/features/day-feed/TripViewContext", () => ({
  useTripView: () => ({
    view: state.view,
    resumeView: state.view,
    workingTrip: state.workingTrip,
    resume: state.resume,
  }),
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/theme", () => ({
  useUiTheme: () => lightPalette,
  useThemedStyles: (create: (colors: typeof lightPalette) => unknown) =>
    create(lightPalette),
}));

type ShellElement = ReactElement<{
  children?: ReactNode;
  accessibilityLabel?: string;
  accessibilityState?: { selected?: boolean };
  onPress?: () => void;
  style?: unknown;
}>;
function pressables(node: ReactNode): ShellElement[] {
  if (!isValidElement(node)) return [];
  const element = node as ShellElement;
  return [
    ...(element.type === "Pressable" ? [element] : []),
    ...Children.toArray(element.props.children).flatMap(pressables),
  ];
}

beforeEach(() => {
  state.view = null;
  state.navigate.mockReset();
  state.setParams.mockReset();
  state.fontScale = 1;
  state.params = {};
  state.alerts.mockReset();
  state.workingTrip = null;
  state.resume.mockReset();
  state.push.mockReset();
  state.generation = 1;
  state.actor.mockReset().mockResolvedValue({ memberId: "m", role: "owner" });
});

it("lets the destination grow for accessibility-large text", () => {
  state.fontScale = 3;
  const buttons = pressables(ExperienceBottomShell({ visible: true, pathname: "/trip" }));
  expect(buttons[0].props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ minHeight: 76 })]),
  );
});

it("keeps the real My Trips destination available without a selected accepted Day", () => {
  const buttons = pressables(ExperienceBottomShell({ visible: true, pathname: "/trip" }));
  expect(buttons.map((button) => button.props.accessibilityLabel)).toEqual([
    "dayFeed.myTrips",
    "actionIsland.startTrip",
  ]);
  expect(buttons[0].props.accessibilityState).toEqual({ selected: true });
  buttons[0].props.onPress?.();
  expect(state.setParams).toHaveBeenCalledWith({ view: "trips" });
  expect(state.navigate).not.toHaveBeenCalled();
  buttons[1].props.onPress?.();
  const choices = state.alerts.mock.calls[0][2];
  expect(choices.map((choice: { text: string }) => choice.text)).toEqual([
    "actionIsland.importPlans",
    "actionIsland.createManually",
    "common.cancel",
  ]);
  choices[0].onPress();
  expect(state.navigate).toHaveBeenCalledWith("/capture");
  choices[1].onPress();
  expect(state.setParams).toHaveBeenCalledWith({
    tripId: "",
    date: "",
    zone: "",
    view: "create",
  });
  expect(ExperienceBottomShell({ visible: false, pathname: "/trip" })).toBeNull();
});

it("opens the actual Trip list from another tab and only exposes a selected Day", () => {
  state.view = {
    tripId: "accepted-trip",
    date: "2026-10-13",
    zone: "UTC",
    generation: 1,
  };
  const buttons = pressables(
    ExperienceBottomShell({ visible: true, pathname: "/expenses" }),
  );
  expect(buttons.map((button) => button.props.accessibilityLabel)).toEqual([
    "dayFeed.myTrips",
    "shell.day",
  ]);
  expect(buttons.map((button) => button.props.accessibilityState)).toEqual([
    { selected: false },
    { selected: false },
  ]);
  buttons[0].props.onPress?.();
  expect(state.navigate).toHaveBeenCalledWith({
    pathname: "/trip",
    params: { view: "trips" },
  });
  buttons[1].props.onPress?.();
  expect(state.navigate).toHaveBeenCalledWith("/");
  expect(
    pressables(ExperienceBottomShell({ visible: true, pathname: "/" }))[1].props
      .accessibilityState,
  ).toEqual({ selected: true });
});

it("uses the explicit working Trip for Home and Ledger while Day resumes its own bookmark", () => {
  state.workingTrip = { tripId: "a", generation: 1 };
  state.view = { tripId: "a", date: "2026-10-14", zone: "UTC", generation: 1 };
  const buttons = pressables(
    ExperienceBottomShell({ visible: true, pathname: "/capture" }),
  );
  expect(buttons.map((b) => b.props.accessibilityLabel)).toEqual([
    "dayFeed.tripHome",
    "shell.day",
    "navigation.ledger",
  ]);
  buttons[0].props.onPress?.();
  expect(state.navigate).toHaveBeenCalledWith({
    pathname: "/trip",
    params: { tripId: "a", view: "home" },
  });
  buttons[1].props.onPress?.();
  expect(state.resume).toHaveBeenCalledOnce();
  buttons[2].props.onPress?.();
  expect(state.navigate).toHaveBeenCalledWith("/expenses");
});
it("does not offer Start or navigation over the active Create form", () => {
  state.params = { view: "create" };
  expect(ExperienceBottomShell({ visible: true, pathname: "/trip" })).toBeNull();
});

it("Ledger island opens New Expense with current owning scope and source-return semantics", async () => {
  state.params = { journeyId: "a" };
  const buttons = pressables(
    ExperienceBottomShell({ visible: true, pathname: "/expenses/settlement" }),
  );
  expect(buttons.at(-1)?.props.accessibilityLabel).toBe("ledger.addExpense");
  buttons.at(-1)?.props.onPress?.();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(state.push).toHaveBeenCalledWith({
    pathname: "/expenses/new",
    params: { journeyId: "a", returnTo: "source" },
  });
});

it("Ledger + does not execute after rights denial or a generation change during the owning read", async () => {
  state.params = { journeyId: "a" };
  state.actor.mockResolvedValue({ memberId: "m", role: "denied" });
  let action = pressables(
    ExperienceBottomShell({ visible: true, pathname: "/expenses/analysis" }),
  ).at(-1)!;
  action.props.onPress?.();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(state.push).not.toHaveBeenCalled();
  let finish!: (value: { memberId: string; role: string }) => void;
  state.actor.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  action = pressables(
    ExperienceBottomShell({ visible: true, pathname: "/expenses/analysis" }),
  ).at(-1)!;
  action.props.onPress?.();
  await new Promise((resolve) => setTimeout(resolve, 0));
  state.generation = 2;
  finish({ memberId: "m", role: "owner" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(state.push).not.toHaveBeenCalled();
});

it("a later module/Trip target change cancels the delayed Expense action", async () => {
  state.params = { journeyId: "a" };
  let finish!: (value: { memberId: string; role: string }) => void;
  state.actor.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  pressables(ExperienceBottomShell({ visible: true, pathname: "/expenses/settlement" }))
    .at(-1)!
    .props.onPress?.();
  await new Promise((resolve) => setTimeout(resolve, 0));
  state.params = { journeyId: "b" };
  ExperienceBottomShell({ visible: true, pathname: "/expenses/settlement" });
  finish({ memberId: "m", role: "owner" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(state.push).not.toHaveBeenCalled();
});

it("A→B→A cannot revive an older delayed Expense action", async () => {
  state.params = { journeyId: "a" };
  let finish!: (value: { memberId: string; role: string }) => void;
  state.actor.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  pressables(ExperienceBottomShell({ visible: true, pathname: "/expenses/settlement" }))
    .at(-1)!
    .props.onPress?.();
  await new Promise((resolve) => setTimeout(resolve, 0));
  state.params = { journeyId: "b" };
  ExperienceBottomShell({ visible: true, pathname: "/expenses/settlement" });
  state.params = { journeyId: "a" };
  ExperienceBottomShell({ visible: true, pathname: "/expenses/settlement" });
  finish({ memberId: "m", role: "owner" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(state.push).not.toHaveBeenCalled();
});

it("Day Expense caller passes a distinct weak suggestedDate, preserving legacy focusDate flag semantics", async () => {
  state.view = { tripId: "a", date: "2027-01-01", zone: "Asia/Tokyo", generation: 1 };
  const tree = ExperienceBottomShell({ visible: true, pathname: "/" });
  const find = (node: ReactNode): ReactElement<any> | null => {
    if (!isValidElement(node)) return null;
    const n = node as ReactElement<any>;
    if (n.type === "TripQuickAddMenu") return n;
    for (const child of Children.toArray(n.props.children)) {
      const found = find(child);
      if (found) return found;
    }
    return null;
  };
  find(tree)!.props.expense("2027-01-02");
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(state.push).toHaveBeenCalledWith({
    pathname: "/expenses/new",
    params: { journeyId: "a", returnTo: "home", suggestedDate: "2027-01-02" },
  });
  expect(state.push.mock.calls[0][0].params.focusDate).toBeUndefined();
});

vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => state.generation,
  subscribeAccountGeneration: () => () => {},
}));
it("a previously rendered Expense callback cannot adopt a newly committed target", async () => {
  state.params = { journeyId: "a" };
  const old = pressables(
    ExperienceBottomShell({ visible: true, pathname: "/expenses" }),
  ).at(-1)!;
  state.params = { journeyId: "b" };
  ExperienceBottomShell({ visible: true, pathname: "/expenses" });
  old.props.onPress?.();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(state.actor).not.toHaveBeenCalled();
  expect(state.push).not.toHaveBeenCalled();
});

it("explicit normal Trip Day context selects Day rather than Trip Home", () => {
  state.params = { tripId: "a", view: "day" };
  state.workingTrip = { tripId: "a", generation: 1 };
  state.view = { tripId: "a", date: "2027-02-02", zone: "Asia/Tokyo", generation: 1 };
  const nodes = pressables(ExperienceBottomShell({ visible: true, pathname: "/trip" }));
  expect(
    nodes.find((n) => n.props.accessibilityLabel === "shell.day")?.props
      .accessibilityState?.selected,
  ).toBe(true);
  expect(
    nodes.find((n) => n.props.accessibilityLabel === "dayFeed.tripHome")?.props
      .accessibilityState?.selected,
  ).toBe(false);
});
