import { beforeEach, expect, it, vi } from "vitest";
import { SheetRouteLayout } from "./SheetRouteLayout";
import type { ComponentProps, ReactElement } from "react";
import type { SheetHost } from "./SheetHost";

const navigation = vi.hoisted(() => ({
  getState: vi.fn<() => { key: string; index: number; routes: { key: string }[] }>(),
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

const initial = { key: "root", index: 1, routes: [{ key: "day" }, { key: "sheet" }] };
const returned = { key: "root", index: 0, routes: [{ key: "day" }] };

beforeEach(() => {
  navigation.getState.mockReset().mockReturnValue(initial);
  navigation.dispatch.mockReset();
});

it("registers cancellation after pop and before the owner’s queued reload", async () => {
  const calls: string[] = [];
  navigation.dispatch.mockImplementation(() => {
    navigation.getState.mockReturnValue(returned);
    queueMicrotask(() => calls.push("reload"));
  });
  const panel = SheetRouteLayout({ onDismiss: () => { calls.push("cancel"); } });
  const host = panel.props.children as ReactElement<ComponentProps<typeof SheetHost>>;
  expect(host.props.onClose()).toBe(true);
  await Promise.resolve();
  expect(calls).toEqual(["cancel", "reload"]);
});

it("pops before applying a selected action and skips cancellation", () => {
  const calls: string[] = [];
  navigation.dispatch.mockImplementation(() => {
    calls.push("focus");
    navigation.getState.mockReturnValue(returned);
  });
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

it("keeps the sheet and discards its action when the navigator refuses the pop", () => {
  const action = vi.fn();
  const onDismiss = vi.fn();
  const panel = SheetRouteLayout({ onDismiss });
  const host = panel.props.children as ReactElement<ComponentProps<typeof SheetHost>>;
  expect(host.props.onClose(action)).toBe(false);
  expect(host.props.onClose()).toBe(false);
  expect(onDismiss).not.toHaveBeenCalled();
  expect(navigation.dispatch).toHaveBeenCalledWith({ type: "GO_BACK", target: "root", source: "sheet" });
  expect(action).not.toHaveBeenCalled();
});

it("refuses a selection when no originating root can be restored", () => {
  navigation.getState.mockReturnValue({ key: "root", index: 0, routes: [{ key: "sheet" }] });
  const action = vi.fn();
  const panel = SheetRouteLayout({});
  const host = panel.props.children as ReactElement<ComponentProps<typeof SheetHost>>;
  expect(host.props.onClose(action)).toBe(false);
  expect(navigation.dispatch).not.toHaveBeenCalled();
  expect(action).not.toHaveBeenCalled();
});
