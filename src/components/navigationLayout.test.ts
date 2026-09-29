import { expect, it, vi } from "vitest";
import TabsLayout from "../../app/(tabs)/_layout";

const state = vi.hoisted(() => ({ pathname: "/expenses" }));
vi.mock("expo-router", () => ({
  Tabs: Object.assign(() => null, { Screen: () => null }),
  usePathname: () => state.pathname,
}));
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
vi.mock("@/components/GlobalMenu", () => ({ GlobalMenu: () => null }));

it("updates only the tab bar option as navigation enters and leaves deep pages", () => {
  const visible = TabsLayout();
  expect(visible.props.screenOptions.tabBarStyle).toBeUndefined();
  state.pathname = "/expenses/review";
  const hidden = TabsLayout();
  expect(hidden.type).toBe(visible.type);
  expect(hidden.props.screenOptions.tabBarStyle).toEqual({ display: "none" });
  state.pathname = "/expenses/journey/j1";
  expect(TabsLayout().props.screenOptions.tabBarStyle).toBeUndefined();
});
