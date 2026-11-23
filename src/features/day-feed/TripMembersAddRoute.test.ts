import { expect, it, vi } from "vitest";
import TripMembersAddRoute from "../../../app/trip-members-sheet/add";

const qa = vi.hoisted(() => ({
  childRoutes: [{ key: "roster" }, { key: "add" }],
  dispatch: vi.fn(),
  approved: undefined as "back" | "close" | undefined,
  entry: { members: { state: "AVAILABLE" }, onAddTraveler: vi.fn() },
  prevent: vi.fn(),
}));

vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ invocation: "1" }),
  useNavigation: () => ({
    getState: () => ({ key: "people-stack", index: 1, routes: qa.childRoutes }),
    dispatch: qa.dispatch,
    isFocused: () => false,
  }),
}));
vi.mock("expo-router/react-navigation", () => ({
  useRoute: () => ({ key: "add" }),
  usePreventRemove: qa.prevent,
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useCallback: (callback: unknown) => callback,
  useContext: () => null,
  useEffect: (effect: () => void) => effect(),
  useRef: (value: unknown) => ({ current: value }),
  useState: () => [qa.approved, (approval: "back" | "close") => { qa.approved = approval; }],
  useSyncExternalStore: () => qa.entry,
}));
vi.mock("@/components/SheetRoutePanel", () => ({ SheetRoutePanel: "SheetRoutePanel" }));
vi.mock("@/components/SheetHost", () => ({ useSheetMotion: () => ({ exitPending: false }) }));
vi.mock("@/features/people/AddTravelerSheet", () => ({ AddTravelerForm: "AddTravelerForm" }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: vi.fn() }));

it("finishes an approved Add close on the owning child stack when a different root route is focused", () => {
  TripMembersAddRoute().props.onClose();
  TripMembersAddRoute();
  expect(qa.dispatch).toHaveBeenCalledExactlyOnceWith({
    type: "GO_BACK", target: "people-stack", source: "add",
  });
});

it("does not run the Add guard for a prevented removal from an unrelated root navigator", () => {
  qa.approved = undefined;
  const guard = vi.fn();
  TripMembersAddRoute().props.registerDismissHandler(guard);
  const onPrevented = qa.prevent.mock.calls.at(-1)?.[1];
  onPrevented({ data: { action: { type: "GO_BACK", target: "other-root" } } });
  expect(guard).not.toHaveBeenCalled();
  onPrevented({ data: { action: { type: "GO_BACK", target: "people-stack" } } });
  expect(guard).toHaveBeenCalledOnce();
});
