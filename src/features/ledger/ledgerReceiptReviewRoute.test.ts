import { beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import LedgerReceiptReviewRoute from "../../../app/ledger-receipt-review/index";

const state = vi.hoisted(() => ({
  focused: true,
  exitPending: false,
  review: undefined as { visible: boolean } | undefined,
  requestClose: vi.fn(),
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ invocation: "scan" }),
  useNavigation: () => ({ isFocused: () => state.focused }),
}));
vi.mock("expo-router/react-navigation", () => ({
  useRoute: () => ({ key: "review" }),
  useIsFocused: () => state.focused,
  usePreventRemove: () => {},
}));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useContext: () => null,
  useLayoutEffect: () => {},
  useEffect: (effect: () => void) => effect(),
  useState: (initial: unknown) => [initial, vi.fn()],
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read(),
}));
vi.mock("@/components/SheetRoutePanel", () => ({ SheetRoutePanel: "panel" }));
vi.mock("@/components/SheetHost", () => ({
  useSheetMotion: () => ({
    requestClose: state.requestClose,
    exitPending: state.exitPending,
    isExitPending: () => state.exitPending,
  }),
}));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("./ReceiptReviewSheet", () => ({ ReceiptReviewSheet: "review" }));
vi.mock("./ledgerReceiptReviewSheet", () => ({
  LedgerReceiptReviewInvocationContext: null,
  readLedgerReceiptReview: () => state.review,
  subscribeLedgerReceiptReview: () => () => {},
}));

beforeEach(() => {
  state.focused = true;
  state.exitPending = false;
  state.review = undefined;
  state.requestClose.mockClear();
});

it("retries a retired review close after an interruption once the route is focused", () => {
  LedgerReceiptReviewRoute();
  expect(state.requestClose).toHaveBeenCalledOnce();
  state.exitPending = true;
  LedgerReceiptReviewRoute();
  expect(state.requestClose).toHaveBeenCalledOnce();
  state.exitPending = false;
  state.focused = false;
  LedgerReceiptReviewRoute();
  expect(state.requestClose).toHaveBeenCalledOnce();
  state.focused = true;
  LedgerReceiptReviewRoute();
  expect(state.requestClose).toHaveBeenCalledTimes(2);
});

it("requalifies the exact review's focus and exit state at deferred source launch", () => {
  state.review = { visible: true };
  const route = LedgerReceiptReviewRoute() as ReactElement<{ canLaunchSource(): boolean }>;
  expect(route.props.canLaunchSource()).toBe(true);
  state.focused = false;
  expect(route.props.canLaunchSource()).toBe(false);
  state.focused = true;
  state.exitPending = true;
  expect(route.props.canLaunchSource()).toBe(false);
  expect(state.requestClose).not.toHaveBeenCalled();
});
