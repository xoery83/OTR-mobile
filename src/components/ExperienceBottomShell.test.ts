import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { lightPalette, darkPalette, type UiColors } from "@/ui/palette";
import { ExperienceBottomShell } from "./ExperienceBottomShell";
vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => state.glassCapability,
}));

const state = vi.hoisted(() => ({
  dark: false,
  glassCapability: null as null | {
    isLiquidGlassAvailable: boolean;
    isGlassEffectAPIAvailable: boolean;
  },
  dayShellChrome: null as null | {
    tripId: string;
    generation: number;
    owner: symbol;
    navigationVisible: boolean;
  },
  view: null as null | {
    tripId: string;
    date: string;
    zone: string | null;
    viewMode?: "FLOATING";
    generation: number;
  },
  navigate: vi.fn(),
  setParams: vi.fn(),
  fontScale: 1,
  reduced: false,
  startTripTarget: null as symbol | null,
  refCalls: 0,
  startTripRef: { current: null as symbol | null },
  resolveReduced: null as null | ((value: boolean) => void),
  reducedListener: null as null | ((value: boolean) => void),
  effectCleanup: null as null | (() => void),
  reportHeight: vi.fn(),
  signal: null as number | null,
  quickActions: null as null | {
    tripId: string;
    generation: number;
    chooseDay: () => void;
  },
  params: {} as Record<string, string>,
  alerts: vi.fn(),
  platform: "android",
  sheet: vi.fn(),
  push: vi.fn(),
  workingTrip: null as null | { tripId: string; generation: number },
  resume: vi.fn(),
  generation: 1,
  actorRole: "owner" as string | null,
  actor: vi.fn(),
  targetRef: { current: null as symbol | null },
  memo: null as null | { key: string; value: symbol },
}));
vi.mock("@/features/updates/useUpdatesSignal", () => ({
  useUpdatesSignal: () => state.signal,
}));
vi.mock("./TripQuickAddMenu", () => ({ TripQuickAddMenu: "TripQuickAddMenu" }));
vi.mock("./StartTripSheet", () => ({ StartTripSheet: "StartTripSheet" }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef: () => (state.refCalls++ % 2 === 0 ? state.targetRef : state.startTripRef),
  useContext: () => state.reportHeight,
  useState: (initial: unknown) =>
    initial === null
      ? [
          state.startTripTarget,
          (value: symbol | null) => {
            state.startTripTarget = value;
          },
        ]
      : [
          state.reduced,
          (value: boolean) => {
            state.reduced = value;
          },
        ],
  useEffect: (effect: () => () => void) => {
    state.effectCleanup?.();
    state.effectCleanup = effect();
  },
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
vi.mock("expo-router/js-tabs", () => ({ BottomTabBarHeightCallbackContext: {} }));
vi.mock("react-native", () => ({
  AccessibilityInfo: {
    isReduceTransparencyEnabled: () =>
      new Promise<boolean>((resolve) => {
        state.resolveReduced = resolve;
      }),
    addEventListener: (_: string, listener: (value: boolean) => void) => {
      state.reducedListener = listener;
      return { remove() {} };
    },
  },
  Alert: { alert: state.alerts },
  Platform: {
    get OS() {
      return state.platform;
    },
  },
  ActionSheetIOS: { showActionSheetWithOptions: state.sheet },
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
    quickActions: state.quickActions,
    dayShellChrome: state.dayShellChrome,
  }),
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/locale", () => ({
  t: (key: string, params?: { count?: string }) =>
    params?.count ? `${key}: ${params.count}` : key,
  formatUiNumber: (value: number) => String(value),
}));
vi.mock("@/ui/theme", () => ({
  useUiTheme: () => (state.dark ? darkPalette : lightPalette),
  useThemedStyles: (create: (colors: UiColors) => unknown) =>
    create(state.dark ? darkPalette : lightPalette),
}));

type ShellElement = ReactElement<{
  children?: ReactNode;
  accessibilityLabel?: string;
  accessibilityHint?: string;
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

type StartSheetElement = ReactElement<{
  visible: boolean;
  onClose(): void;
  onImport(): void;
  onCreate(): void;
}>;
function startSheet(node: ReactNode): StartSheetElement {
  const queue = Children.toArray(node);
  while (queue.length) {
    const current = queue.shift();
    if (!isValidElement(current)) continue;
    const element = current as ShellElement;
    if (element.type === "StartTripSheet") return element as unknown as StartSheetElement;
    queue.push(...Children.toArray(element.props.children));
  }
  throw new Error("Start Trip Sheet is absent");
}

beforeEach(() => {
  state.refCalls = 0;
  state.startTripTarget = null;
  state.startTripRef.current = null;
  state.glassCapability = null;
  state.dark = false;
  state.view = null;
  state.dayShellChrome = null;
  state.quickActions = null;
  state.navigate.mockReset();
  state.setParams.mockReset();
  state.fontScale = 1;
  state.reduced = false;
  state.resolveReduced = state.reducedListener = null;
  state.effectCleanup?.();
  state.effectCleanup = null;
  state.reportHeight.mockReset();
  state.params = {};
  state.alerts.mockReset();
  state.platform = "android";
  state.sheet.mockReset();
  state.workingTrip = null;
  state.resume.mockReset();
  state.push.mockReset();
  state.generation = 1;
  state.signal = null;
  state.actor.mockReset().mockResolvedValue({ memberId: "m", role: "owner" });
});

it("lets the destination grow for accessibility-large text", () => {
  state.workingTrip = { tripId: "a", generation: 1 };
  state.params = { tripId: "a", view: "home" };
  state.fontScale = 3;
  const buttons = pressables(ExperienceBottomShell({ visible: true, pathname: "/trip" }));
  expect(buttons[0].props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ minHeight: 76 })]),
  );
});

it("My Trips keeps only the real Start Trip action without redundant left navigation", () => {
  const buttons = pressables(ExperienceBottomShell({ visible: true, pathname: "/trip" }));
  expect(buttons.map((button) => button.props.accessibilityLabel)).toEqual([
    "actionIsland.startTrip",
  ]);
  expect(buttons).toHaveLength(1);
  buttons[0].props.onPress?.();
  let sheet = startSheet(ExperienceBottomShell({ visible: true, pathname: "/trip" }));
  expect(sheet.props.visible).toBe(true);
  sheet.props.onImport();
  expect(state.navigate).toHaveBeenCalledWith("/capture");
  sheet.props.onCreate();
  expect(state.setParams).not.toHaveBeenCalled();
  const closed = ExperienceBottomShell({ visible: true, pathname: "/trip" });
  expect(startSheet(closed).props.visible).toBe(false);
  pressables(closed)[0].props.onPress?.();
  sheet = startSheet(ExperienceBottomShell({ visible: true, pathname: "/trip" }));
  sheet.props.onCreate();
  expect(state.setParams).toHaveBeenCalledWith({
    tripId: "",
    date: "",
    zone: "",
    view: "create",
  });
  expect(ExperienceBottomShell({ visible: false, pathname: "/trip" })).toBeNull();
});

it("keeps Home, Day and Ledger available for the generation-scoped accepted Day", () => {
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
    "shell.home",
    "shell.day",
    "navigation.ledger",
    "updates.title",
  ]);
  buttons[0].props.onPress?.();
  expect(state.navigate).toHaveBeenCalledWith("/trip");
  expect(state.push).toHaveBeenCalledWith({
    pathname: "/trip-home",
    params: { tripId: "accepted-trip", view: "home" },
  });
  buttons[1].props.onPress?.();
  expect(state.navigate).toHaveBeenCalledWith({
    pathname: "/trip-home",
    params: {
      tripId: "accepted-trip",
      view: "day",
      date: "2026-10-13",
      zone: "UTC",
      viewMode: "NAMED_ZONE",
    },
  });
});

it.each(["/trip-home", "/trip", "/expenses", "/updates"])(
  "resumes floating Day through the native Trip host from %s, replacing stale Home params",
  (pathname) => {
    state.params = {
      tripId: "a",
      view: "home",
      date: "2027-03-01",
      zone: "Asia/Tokyo",
      viewMode: "NAMED_ZONE",
    };
    state.workingTrip = { tripId: "a", generation: 1 };
    state.view = {
      tripId: "a",
      date: "2026-10-31",
      zone: null,
      viewMode: "FLOATING",
      generation: 1,
    };
    const day = pressables(ExperienceBottomShell({ visible: true, pathname })).find(
      (button) => button.props.accessibilityLabel === "shell.day",
    )!;
    day.props.onPress?.();
    expect(state.resume).toHaveBeenCalledOnce();
    expect(state.navigate).toHaveBeenCalledExactlyOnceWith({
      pathname: "/trip-home",
      params: {
        tripId: "a",
        view: "day",
        date: "2026-10-31",
        zone: "",
        viewMode: "FLOATING",
      },
    });
    expect(state.setParams).not.toHaveBeenCalled();
    expect(state.quickActions).toBeNull();
  },
);

it("uses the explicit working Trip for Home and Ledger while Day resumes its own bookmark", () => {
  state.workingTrip = { tripId: "a", generation: 1 };
  state.view = { tripId: "a", date: "2026-10-14", zone: "UTC", generation: 1 };
  const buttons = pressables(
    ExperienceBottomShell({ visible: true, pathname: "/capture" }),
  );
  expect(buttons.map((b) => b.props.accessibilityLabel)).toEqual([
    "shell.home",
    "shell.day",
    "navigation.ledger",
    "updates.title",
  ]);
  buttons[0].props.onPress?.();
  expect(state.navigate).toHaveBeenCalledWith("/trip");
  expect(state.push).toHaveBeenCalledWith({
    pathname: "/trip-home",
    params: { tripId: "a", view: "home" },
  });
  buttons[1].props.onPress?.();
  expect(state.resume).toHaveBeenCalledOnce();
  buttons[2].props.onPress?.();
  expect(state.navigate).toHaveBeenCalledWith({
    pathname: "/expenses",
    params: { journeyId: "a" },
  });
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
  expect(state.navigate).not.toHaveBeenCalled();
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
  expect(state.navigate).not.toHaveBeenCalled();
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
  expect(state.navigate).not.toHaveBeenCalled();
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
  expect(state.navigate).not.toHaveBeenCalled();
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
    nodes.find((n) => n.props.accessibilityLabel === "shell.home")?.props
      .accessibilityState?.selected,
  ).toBe(false);
});

it("the qualified Updates fourth destination opens its actual route without changing Day reading", () => {
  state.workingTrip = { tripId: "a", generation: 1 };
  state.view = { tripId: "a", date: "2027-02-02", zone: "Asia/Tokyo", generation: 1 };
  const node = pressables(
    ExperienceBottomShell({ visible: true, pathname: "/updates" }),
  ).find((button) => button.props.accessibilityLabel === "updates.title")!;
  expect(node.props.accessibilityState?.selected).toBe(true);
  node.props.onPress?.();
  expect(state.navigate).toHaveBeenCalledWith("/updates");
  expect(state.resume).not.toHaveBeenCalled();
  expect(state.setParams).not.toHaveBeenCalled();
});

it("Updates badge describes unread actionable aggregate cards without changing the owning route or bookmark", () => {
  state.params = { tripId: "a", view: "home" };
  state.workingTrip = { tripId: "a", generation: 1 };
  state.signal = 3;
  const button = pressables(
    ExperienceBottomShell({ visible: true, pathname: "/trip" }),
  ).find((node) => node.props.accessibilityLabel === "updates.title")!;
  expect(button.props.accessibilityHint).toBe("updates.unreadActionableBadge: 3");
  button.props.onPress?.();
  expect(state.navigate).toHaveBeenCalledWith("/updates");
  expect(state.resume).not.toHaveBeenCalled();
  for (const count of [0, null]) {
    state.signal = count;
    expect(
      pressables(ExperienceBottomShell({ visible: true, pathname: "/trip" })).find(
        (node) => node.props.accessibilityLabel === "updates.title",
      )!.props.accessibilityHint,
    ).toBeUndefined();
  }
});

it("all four destinations remain reachable for large text without altering Day reading", () => {
  state.params = { tripId: "a", view: "home" };
  state.workingTrip = { tripId: "a", generation: 1 };
  state.view = { tripId: "a", date: "2027-02-02", zone: "Asia/Tokyo", generation: 1 };
  state.fontScale = 3;
  const buttons = pressables(ExperienceBottomShell({ visible: true, pathname: "/trip" }));
  const updates = buttons.find(
    (button) => button.props.accessibilityLabel === "updates.title",
  )!;
  expect(buttons.map((button) => button.props.accessibilityLabel)).toEqual(
    expect.arrayContaining([
      "shell.home",
      "shell.day",
      "navigation.ledger",
      "updates.title",
    ]),
  );
  updates.props.onPress?.();
  expect(state.navigate).toHaveBeenCalledWith("/updates");
  expect(state.resume).not.toHaveBeenCalled();
});

it("Day without a bookmark opens the current owning chooser without guessing or resuming", () => {
  state.params = { tripId: "a", view: "home" };
  state.workingTrip = { tripId: "a", generation: 1 };
  const chooseDay = vi.fn();
  state.quickActions = { tripId: "a", generation: 1, chooseDay };
  const day = pressables(
    ExperienceBottomShell({ visible: true, pathname: "/trip" }),
  ).find((button) => button.props.accessibilityLabel === "shell.day")!;
  day.props.onPress?.();
  expect(chooseDay).toHaveBeenCalledOnce();
  expect(state.resume).not.toHaveBeenCalled();
  expect(state.navigate).not.toHaveBeenCalled();
  state.generation = 2;
  day.props.onPress?.();
  expect(chooseDay).toHaveBeenCalledOnce();
});

it("reports actual safe-area-inclusive Shell height to the existing navigator after each layout", () => {
  const shell = ExperienceBottomShell({ visible: true, pathname: "/trip" }) as any;
  shell.props.onLayout({ nativeEvent: { layout: { height: 112 } } });
  shell.props.onLayout({ nativeEvent: { layout: { height: 238 } } });
  expect(state.reportHeight.mock.calls).toEqual([[112], [238]]);
  expect(shell.props.pointerEvents).toBe("box-none");
});
it("My Trips with a stale saved Trip still renders only its single Start Trip action", () => {
  state.view = { tripId: "a", date: "2027-02-06", zone: "Asia/Tokyo", generation: 1 };
  state.workingTrip = { tripId: "a", generation: 1 };
  state.params = { tripId: "a", view: "trips" };
  expect(
    pressables(ExperienceBottomShell({ visible: true, pathname: "/trip" })).map(
      (button) => button.props.accessibilityLabel,
    ),
  ).toEqual(["actionIsland.startTrip"]);
});
it("a live Reduce Transparency event wins over a delayed initial preference read", async () => {
  state.params = { tripId: "a", view: "home" };
  state.workingTrip = { tripId: "a", generation: 1 };
  ExperienceBottomShell({ visible: true, pathname: "/trip" });
  const resolveInitial = state.resolveReduced!;
  state.reducedListener!(true);
  resolveInitial(false);
  await Promise.resolve();
  expect(state.reduced).toBe(true);
  expect(
    pressables(ExperienceBottomShell({ visible: true, pathname: "/trip" })).map(
      (button) => button.props.accessibilityLabel,
    ),
  ).toContain("shell.home");
});

it("hidden and Create routes release the previous overlay height", () => {
  ExperienceBottomShell({ visible: false, pathname: "/search" });
  expect(state.reportHeight).toHaveBeenLastCalledWith(0);
  state.params = { view: "create" };
  ExperienceBottomShell({ visible: true, pathname: "/trip" });
  expect(state.reportHeight).toHaveBeenCalledTimes(2);
});

it("Start Trip cancellation and a stale account cannot execute a sheet action", () => {
  const open = () => {
    pressables(
      ExperienceBottomShell({ visible: true, pathname: "/trip" }),
    )[0].props.onPress?.();
    return startSheet(ExperienceBottomShell({ visible: true, pathname: "/trip" }));
  };
  const cancelled = open();
  cancelled.props.onClose();
  cancelled.props.onImport();
  expect(state.navigate).not.toHaveBeenCalled();
  const stale = open();
  state.generation++;
  stale.props.onImport();
  stale.props.onCreate();
  expect(state.navigate).not.toHaveBeenCalled();
  expect(state.setParams).not.toHaveBeenCalled();
  expect(state.alerts).not.toHaveBeenCalled();
  expect(state.sheet).not.toHaveBeenCalled();
});

it("a later module target or hidden Shell invalidates the open Start Trip callbacks", () => {
  const open = () => {
    pressables(
      ExperienceBottomShell({ visible: true, pathname: "/trip" }),
    )[0].props.onPress?.();
    return startSheet(ExperienceBottomShell({ visible: true, pathname: "/trip" }));
  };
  const stale = open();
  ExperienceBottomShell({ visible: true, pathname: "/search" });
  stale.props.onImport();
  expect(state.navigate).not.toHaveBeenCalled();
  const hidden = open();
  ExperienceBottomShell({ visible: false, pathname: "/trip" });
  hidden.props.onCreate();
  expect(state.setParams).not.toHaveBeenCalled();
  expect(
    startSheet(ExperienceBottomShell({ visible: true, pathname: "/trip" })).props.visible,
  ).toBe(false);
});

it("an authorized empty Trip keeps Home Day Ledger without accepted data or a bookmark", () => {
  state.workingTrip = { tripId: "a", generation: 1 };
  state.params = { tripId: "a", view: "home" };
  const buttons = pressables(
    ExperienceBottomShell({ visible: true, pathname: "/trip-home" }),
  );
  expect(buttons.map((b) => b.props.accessibilityLabel)).toEqual([
    "shell.home",
    "shell.day",
    "navigation.ledger",
    "updates.title",
  ]);
  buttons[1].props.onPress?.();
  expect(state.navigate).toHaveBeenCalledWith({
    pathname: "/trip-home",
    params: { tripId: "a", view: "day" },
  });
});
it("raw URL parameters do not manufacture a selected Trip authority", () => {
  state.params = { tripId: "forged", view: "home" };
  const buttons = pressables(
    ExperienceBottomShell({ visible: true, pathname: "/trip-home" }),
  );
  expect(buttons.map((b) => b.props.accessibilityLabel)).not.toContain("shell.day");
  expect(buttons.map((b) => b.props.accessibilityLabel)).not.toContain(
    "navigation.ledger",
  );
});

it("a direct Trip link cannot reuse another Trip's navigation scope", () => {
  state.workingTrip = { tripId: "b", generation: 1 };
  state.params = { tripId: "a", view: "home" };
  const buttons = pressables(
    ExperienceBottomShell({ visible: true, pathname: "/trip-home" }),
  );
  expect(buttons.map((b) => b.props.accessibilityLabel)).not.toContain(
    "navigation.ledger",
  );
  expect(buttons.map((b) => b.props.accessibilityLabel)).not.toContain("shell.day");
});

it.each([0, 1])(
  "Ledger uses the authorized current Trip rather than old working scope generation %s",
  (generation) => {
    state.workingTrip = { tripId: "old", generation };
    state.params = { tripId: "current", view: "home" };
    state.quickActions = { tripId: "current", generation: 1, chooseDay: vi.fn() };
    const ledger = pressables(
      ExperienceBottomShell({ visible: true, pathname: "/trip-home" }),
    ).find((button) => button.props.accessibilityLabel === "navigation.ledger")!;
    expect(ledger.props.onPress).toBeTypeOf("function");
    ledger.props.onPress!();
    expect(state.navigate).toHaveBeenCalledWith({
      pathname: "/expenses",
      params: { journeyId: "current" },
    });
    state.navigate.mockClear();
    state.generation = 2;
    ledger.props.onPress!();
    expect(state.navigate).not.toHaveBeenCalled();
  },
);

it("Day chrome hides only its current navigation island while retaining Capture and layout", () => {
  state.view = { tripId: "a", date: "2026-10-16", zone: "", generation: 1 };
  state.workingTrip = { tripId: "a", generation: 1 };
  state.params = { view: "day", tripId: "a" };
  state.dayShellChrome = {
    tripId: "a",
    generation: 1,
    owner: Symbol(),
    navigationVisible: false,
  };
  const tree = ExperienceBottomShell({ visible: true, pathname: "/trip" });
  const hidden: ReactElement<any>[] = [];
  function walk(node: ReactNode) {
    if (!isValidElement(node)) return;
    const element = node as ReactElement<any>;
    if (element.props.accessibilityElementsHidden) hidden.push(element);
    Children.toArray(element.props.children).forEach(walk);
  }
  walk(tree);
  expect(hidden).toHaveLength(1);
  expect(hidden[0].props.pointerEvents).toBe("none");
  expect(pressables(hidden[0]).map((x) => x.props.accessibilityLabel)).toContain(
    "shell.day",
  );
  expect(isValidElement(tree)).toBe(true);
  state.dayShellChrome = { ...state.dayShellChrome!, tripId: "other" };
  hidden.length = 0;
  walk(ExperienceBottomShell({ visible: true, pathname: "/trip" }));
  expect(hidden).toHaveLength(0);
});

it("selects clear native glass for each island branch and retains reduced-transparency surfaces", async () => {
  const require = createRequire(import.meta.url);
  const path = require.resolve("expo-glass-effect");
  const previous = require.cache[path];
  // The optional loader intentionally uses CJS; replace only that native boundary.
  require.cache[path] = { exports: { GlassView: "NativeGlassView" } } as NodeModule;
  state.glassCapability = {
    isLiquidGlassAvailable: true,
    isGlassEffectAPIAvailable: true,
  };
  try {
    vi.resetModules();
    const { ExperienceBottomShell: NativeShell } =
      await import("./ExperienceBottomShell");
    const materials = (node: ReactNode): ShellElement[] => {
      if (!isValidElement(node)) return [];
      const element = node as ShellElement;
      return [
        ...(element.type === "NativeGlassView" ? [element] : []),
        ...Children.toArray(element.props.children).flatMap(materials),
      ];
    };
    state.workingTrip = { tripId: "a", generation: 1 };
    for (const [pathname, params, count] of [
      ["/trip-home", { tripId: "a", view: "home" }, 2],
      ["/expenses", { journeyId: "a" }, 2],
      ["/trip", { view: "trips" }, 1],
    ] as const) {
      state.params = params;
      const nodes = materials(NativeShell({ visible: true, pathname }));
      expect(nodes).toHaveLength(count);
      for (const node of nodes) {
        expect(node.props).toMatchObject({
          glassEffectStyle: "clear",
          isInteractive: true,
          tintColor: lightPalette.floatingSurface,
        });
      }
    }
    state.reduced = true;
    const reduced = materials(NativeShell({ visible: true, pathname: "/trip" }));
    expect(reduced[0].props.style).toEqual(
      expect.arrayContaining([{ backgroundColor: lightPalette.surface }]),
    );
    expect(reduced[0].props).toMatchObject({ tintColor: lightPalette.surface });
    state.dark = true;
    const dark = materials(NativeShell({ visible: true, pathname: "/trip" }));
    expect(dark[0].props).toMatchObject({ tintColor: darkPalette.surface });
    expect(dark[0].props.style).toEqual(
      expect.arrayContaining([{ backgroundColor: darkPalette.surface }]),
    );
  } finally {
    if (previous) require.cache[path] = previous;
    else delete require.cache[path];
    state.glassCapability = null;
  }
});

it.each([
  { isLiquidGlassAvailable: false, isGlassEffectAPIAvailable: true },
  { isLiquidGlassAvailable: true, isGlassEffectAPIAvailable: false },
])(
  "keeps the existing surface fallback when either native capability is unavailable",
  async (capability) => {
    state.glassCapability = capability;
    vi.resetModules();
    const { ExperienceBottomShell: FallbackShell } =
      await import("./ExperienceBottomShell");
    state.params = { view: "trips" };
    const tree = FallbackShell({ visible: true, pathname: "/trip" });
    expect(pressables(tree).map((node) => node.props.accessibilityLabel)).toEqual([
      "actionIsland.startTrip",
    ]);
    const nodes: ShellElement[] = [];
    const visit = (node: ReactNode) => {
      if (!isValidElement(node)) return;
      const element = node as ShellElement;
      if (
        element.props.style &&
        Array.isArray(element.props.style) &&
        element.props.style.some(
          (style: any) => style?.backgroundColor === lightPalette.surface,
        )
      )
        nodes.push(element);
      Children.toArray(element.props.children).forEach(visit);
    };
    visit(tree);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe("View");
  },
);

it.each([false, true])(
  "keeps canonical label colors with a glyph halo and no island fill (dark=%s)",
  (dark) => {
    state.dark = dark;
    state.workingTrip = { tripId: "a", generation: 1 };
    state.params = { tripId: "a", view: "home" };
    const palette = dark ? darkPalette : lightPalette;
    const labels: any[] = [];
    const visit = (node: ReactNode) => {
      if (!isValidElement(node)) return;
      const element = node as ReactElement<any>;
      for (const style of Array.isArray(element.props.style) ? element.props.style : [])
        if (style?.textShadowRadius === 1) labels.push(style);
      Children.toArray(element.props.children).forEach(visit);
    };
    visit(ExperienceBottomShell({ visible: true, pathname: "/trip-home" }));
    expect(labels.length).toBeGreaterThan(0);
    for (const style of labels) {
      expect(style.color).toBe(palette.textSecondary);
      expect(style.textShadowColor).toBe(palette.background);
      expect(style.backgroundColor).toBeUndefined();
    }
  },
);
