import { expect, it, vi } from "vitest";
import { SheetRouteLayout } from "./SheetRouteLayout";
import type { ComponentProps, ReactElement } from "react";
import type { SheetHost } from "./SheetHost";

const navigation = vi.hoisted(() => ({
  getState: vi.fn(() => ({ key: "root", index: 1, routes: [{ key: "day" }, { key: "sheet" }] })),
  dispatch: vi.fn(),
}));

vi.mock("expo-router", () => ({ Stack: "Stack", router: {}, useNavigation: () => navigation }));
vi.mock("expo-router/react-navigation", () => ({ useRoute: () => ({ key: "sheet" }) }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useCallback: (callback: unknown) => callback,
  useState: (value: unknown) => [value, vi.fn()],
}));
vi.mock("./SheetHost", () => ({ SheetHost: "SheetHost" }));
vi.mock("@/ui/theme", () => ({ useUiTheme: () => ({ surface: "surface" }) }));

it("registers cancellation before the owning screen regains focus", () => {
  const calls: string[] = [];
  navigation.dispatch.mockImplementation(() => { calls.push("focus"); });
  const panel = SheetRouteLayout({ onDismiss: () => { calls.push("cancel"); } });
  const host = panel.props.children as ReactElement<ComponentProps<typeof SheetHost>>;
  expect(host.props.onClose()).toBe(true);
  expect(calls).toEqual(["cancel", "focus"]);
});

it("pops before applying a selected action and skips cancellation", () => {
  const calls: string[] = [];
  navigation.dispatch.mockImplementation(() => { calls.push("focus"); });
  const panel = SheetRouteLayout({ onDismiss: () => { calls.push("cancel"); } });
  const host = panel.props.children as ReactElement<ComponentProps<typeof SheetHost>>;
  expect(host.props.onClose(() => { calls.push("select"); })).toBe(true);
  expect(calls).toEqual(["focus", "select"]);
});

it("declines dismissal and its action when another root route covers the sheet", () => {
  navigation.getState.mockReturnValueOnce({
    key: "root", index: 2, routes: [{ key: "day" }, { key: "sheet" }, { key: "overlay" }],
  });
  navigation.dispatch.mockClear();
  const onDismiss = vi.fn();
  const action = vi.fn();
  const panel = SheetRouteLayout({ onDismiss });
  const host = panel.props.children as ReactElement<ComponentProps<typeof SheetHost>>;
  expect(host.props.onClose(action)).toBe(false);
  expect(navigation.dispatch).not.toHaveBeenCalled();
  expect(onDismiss).not.toHaveBeenCalled();
  expect(action).not.toHaveBeenCalled();
});
