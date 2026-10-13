import { lightPalette } from "@/ui/palette";
import { expect, it, vi } from "vitest";
import TabsLayout from "../../app/(tabs)/_layout";

const state = vi.hoisted(() => ({ pathname: "/expenses" }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/theme", () => ({ useUiTheme: () => lightPalette }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/features/day-feed/TripViewContext", () => ({
  TripViewProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock("expo-router", () => ({
  Tabs: Object.assign(() => null, { Screen: () => null }),
  usePathname: () => state.pathname,
}));
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
vi.mock("@/components/ExperienceBottomShell", () => ({
  ExperienceBottomShell: () => null,
}));
vi.mock("@/components/GlobalMenu", () => ({ GlobalMenu: () => null }));

it("updates only the tab bar option as navigation enters and leaves deep pages", () => {
  const visible = TabsLayout().props.children;
  expect(visible.props.screenOptions.tabBarActiveTintColor).toBe(lightPalette.accent);
  expect(visible.props.screenOptions.tabBarInactiveTintColor).toBe(
    lightPalette.textSecondary,
  );
  expect(visible.props.screenOptions.tabBarStyle).toEqual({
    backgroundColor: lightPalette.surface,
    borderTopColor: lightPalette.separator,
  });
  state.pathname = "/expenses/review";
  const hidden = TabsLayout().props.children;
  expect(hidden.type).toBe(visible.type);
  expect(hidden.props.screenOptions.tabBarStyle).toEqual({ display: "none" });
  state.pathname = "/expenses/journey/j1";
  expect(TabsLayout().props.children.props.screenOptions.tabBarStyle).toEqual(
    visible.props.screenOptions.tabBarStyle,
  );
  expect(hidden.props.tabBar().props.visible).toBe(false);
  expect(TabsLayout().props.children.props.tabBar().props.pathname).toBe(
    "/expenses/journey/j1",
  );
});
