import { beforeEach, expect, it, vi } from "vitest";
import AccountSignInLayout from "../../../app/account-sign-in/_layout";

type RootState = { key: string; index: number; routes: { key: string }[] };
type BackAction = { type: string; target?: string; source?: string; payload?: { count: number } };
const state = vi.hoisted(() => ({
  installing: false,
  completed: true,
  guard: false,
  beforeRemove: undefined as ((event: { data: { action: BackAction } }) => void) | undefined,
  getState: vi.fn<() => RootState>(),
  dispatch: vi.fn<(action: BackAction) => void>(),
  finish: vi.fn(),
}));

vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ invocation: "entry" }),
  useNavigation: () => ({ getState: state.getState, dispatch: state.dispatch }),
}));
vi.mock("expo-router/react-navigation", () => ({
  useRoute: () => ({ key: "sign-in" }),
  usePreventRemove: (guard: boolean, beforeRemove: typeof state.beforeRemove) => {
    state.guard = guard;
    state.beforeRemove = beforeRemove;
  },
}));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useSyncExternalStore: (_subscribe: unknown, read: () => boolean) => read(),
}));
vi.mock("@/components/SheetRouteLayout", () => ({ SheetRouteLayout: "Sheet" }));
vi.mock("./hostedSignIn", () => ({
  interceptSignInClose: () => state.installing,
  hasSignInResult: () => state.completed,
  finishSignIn: state.finish,
  subscribeSignIn: vi.fn(),
}));

const shown = { key: "root", index: 1, routes: [{ key: "account" }, { key: "sign-in" }] };
const returned = { key: "root", index: 0, routes: [{ key: "account" }] };
const back = { type: "GO_BACK", target: "root", source: "sign-in" };
beforeEach(() => {
  state.installing = false;
  state.completed = true;
  state.getState.mockReset().mockReturnValue(shown);
  state.dispatch.mockReset();
  state.finish.mockClear();
});

it("blocks native removal while installing and finishes only an exact return with a result", () => {
  state.installing = true;
  state.completed = false;
  AccountSignInLayout();
  expect(state.guard).toBe(true);
  state.beforeRemove?.({ data: { action: back } });
  expect(state.dispatch).not.toHaveBeenCalled();

  state.installing = false;
  state.completed = true;
  AccountSignInLayout();
  state.beforeRemove?.({ data: { action: { ...back, type: "POP", payload: { count: 2 } } } });
  expect(state.dispatch).not.toHaveBeenCalled();

  state.dispatch.mockImplementation(() => state.getState.mockReturnValue(returned));
  state.beforeRemove?.({ data: { action: back } });
  expect(state.dispatch).toHaveBeenCalledExactlyOnceWith(back);
  expect(state.finish).toHaveBeenCalledExactlyOnceWith("entry");
});

it("does not deliver a result when the dismissal is refused", () => {
  AccountSignInLayout();
  state.beforeRemove?.({ data: { action: back } });
  expect(state.dispatch).toHaveBeenCalledExactlyOnceWith(back);
  expect(state.finish).not.toHaveBeenCalled();
});
