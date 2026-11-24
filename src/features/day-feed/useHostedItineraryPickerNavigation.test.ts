import { beforeEach, expect, it, vi } from "vitest";
import { useHostedItineraryPickerNavigation } from "./useHostedItineraryPickerNavigation";

const state = vi.hoisted(() => ({
  dispatch: vi.fn(),
  rootClose: vi.fn(),
  stack: { key: "stack", index: 1, routes: [{ key: "editor" }, { key: "child" }] },
  exiting: false,
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ selection: "draft", editorKey: "editor" }),
  useNavigation: () => ({ getState: () => state.stack, dispatch: state.dispatch, isFocused: () => true }),
}));
vi.mock("expo-router/react-navigation", () => ({ useRoute: () => ({ key: "child" }) }));
vi.mock("@/components/SheetHost", () => ({
  useSheetMotion: () => ({ isExitPending: () => state.exiting, requestClose: state.rootClose }),
}));

beforeEach(() => {
  state.dispatch.mockReset();
  state.rootClose.mockClear();
  state.stack = { key: "stack", index: 1, routes: [{ key: "editor" }, { key: "child" }] };
  state.exiting = false;
});

it("requires the exact original editor and a confirmed pop before applying", () => {
  const picker = useHostedItineraryPickerNavigation();
  expect(picker.pop()).toBe(false);
  expect(state.dispatch).toHaveBeenCalledExactlyOnceWith({ type: "GO_BACK", target: "stack", source: "child" });
  state.dispatch.mockImplementation(() => {
    state.stack = { ...state.stack, index: 0, routes: [{ key: "editor" }] };
  });
  expect(picker.pop()).toBe(true);
  expect(picker.pop()).toBe(false);
});

it("does not navigate during root exit or to a different editor", () => {
  const picker = useHostedItineraryPickerNavigation();
  state.exiting = true;
  expect(picker.pop()).toBe(false);
  state.exiting = false;
  state.stack.routes[0] = { key: "another-editor" };
  expect(picker.pop()).toBe(false);
  expect(state.dispatch).not.toHaveBeenCalled();
});

it("allows a direct stale child route to close without applying a choice", () => {
  state.stack = { ...state.stack, index: 0, routes: [{ key: "child" }] };
  const picker = useHostedItineraryPickerNavigation();
  picker.back();
  expect(state.rootClose).toHaveBeenCalledOnce();
  expect(picker.pop()).toBe(false);
});

it("backs out of a stale child stacked above another picker, without applying", () => {
  state.stack.routes[0] = { key: "other-picker" };
  const picker = useHostedItineraryPickerNavigation();
  expect(picker.pop()).toBe(false);
  picker.back();
  expect(state.dispatch).toHaveBeenCalledExactlyOnceWith({ type: "GO_BACK", target: "stack", source: "child" });
});
