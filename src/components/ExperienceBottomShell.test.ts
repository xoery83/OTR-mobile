import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { lightPalette } from "@/ui/palette";
import { ExperienceBottomShell } from "./ExperienceBottomShell";

const state = vi.hoisted(() => ({
  view: null as null | { tripId: string; date: string; zone: string; generation: number },
  navigate: vi.fn(),
  setParams: vi.fn(),
}));
vi.mock("expo-router", () => ({ router: state }));
vi.mock("react-native", () => ({
  Pressable: "Pressable",
  Text: "Text",
  View: "View",
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("@/components/AppIcon", () => ({ AppIcon: "AppIcon" }));
vi.mock("@/features/day-feed/TripViewContext", () => ({
  useTripView: () => ({ view: state.view }),
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
});

it("keeps the real My Trips destination available without a selected accepted Day", () => {
  const buttons = pressables(ExperienceBottomShell({ visible: true, pathname: "/trip" }));
  expect(buttons.map((button) => button.props.accessibilityLabel)).toEqual([
    "dayFeed.myTrips",
    "myTrips.createTrip",
  ]);
  expect(buttons[0].props.accessibilityState).toEqual({ selected: true });
  buttons[0].props.onPress?.();
  expect(state.setParams).toHaveBeenCalledWith({ view: "trips" });
  expect(state.navigate).not.toHaveBeenCalled();
  buttons[1].props.onPress?.();
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
