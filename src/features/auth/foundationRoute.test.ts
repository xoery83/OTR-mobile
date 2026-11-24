import { expect, it, vi } from "vitest";
import FoundationRoute from "../../../app/foundation";

const state = vi.hoisted(() => ({
  get: vi.fn<() => { key: string; index: number; routes: { key: string }[] }>(),
  dispatch: vi.fn(),
}));

vi.mock("expo-router", () => ({
  Stack: {
    Screen: "screen",
    Toolbar: Object.assign(() => null, { Button: "toolbar-button" }),
  },
  useNavigation: () => ({ getState: state.get, dispatch: state.dispatch }),
}));
vi.mock("expo-router/react-navigation", () => ({
  useNavigationState: (select: (value: ReturnType<typeof state.get>) => unknown) =>
    select(state.get()),
  useRoute: () => ({ key: "foundation" }),
}));
vi.mock("@/components/AccountManagementScreen", () => ({
  AccountManagementScreen: "account-management",
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: vi.fn() }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));

it("returns one route to the existing Import and ignores actions after Foundation loses focus", () => {
  const routes = [{ key: "import" }, { key: "foundation" }];
  state.get.mockReturnValue({ key: "root", index: 1, routes });
  state.dispatch.mockClear();
  const toolbar = FoundationRoute().props.children[1];
  const back = toolbar.props.children.props.onPress;

  back();
  state.get.mockReturnValue({ key: "root", index: 2, routes: [...routes, { key: "sign-in" }] });
  back();
  expect(state.dispatch).toHaveBeenCalledExactlyOnceWith({
    type: "GO_BACK",
    target: "root",
    source: "foundation",
  });
});

it("does not expose Back when Foundation was opened without a predecessor", () => {
  state.get.mockReturnValue({ key: "root", index: 0, routes: [{ key: "foundation" }] });
  expect(FoundationRoute().props.children[1]).toBeNull();
});
