import { beforeEach, expect, it, vi } from "vitest";
import TripMembersAddRoute from "../../../app/trip-members-sheet/add";

const qa = vi.hoisted(() => ({
  childRoutes: [{ key: "roster" }, { key: "add" }],
  index: 1,
  focused: true,
  dispatch: vi.fn(),
  approved: undefined as "back" | "close" | undefined,
  entry: { members: { state: "AVAILABLE" }, onAddTraveler: vi.fn() },
  prevent: vi.fn(),
}));

vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ invocation: "1", rosterKey: "roster" }),
  useNavigation: () => ({
    getState: () => ({ key: "people-stack", index: qa.index, routes: qa.childRoutes }),
    dispatch: qa.dispatch,
    isFocused: () => qa.focused,
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
vi.mock("@/features/day-feed/hostedTripMembers", () => ({
  TripMembersExitContext: {},
  tripMembersInvocations: { read: () => qa.entry, subscribe: vi.fn() },
}));
vi.mock("@/features/people/AddTravelerSheet", () => ({ AddTravelerForm: "AddTravelerForm" }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: vi.fn() }));

beforeEach(() => {
  qa.childRoutes = [{ key: "roster" }, { key: "add" }];
  qa.index = 1;
  qa.focused = true;
  qa.approved = undefined;
  qa.dispatch.mockReset();
});

it("retries a refused Add return on the exact owning stack once it regains focus", async () => {
  TripMembersAddRoute().props.onClose();
  qa.focused = false;
  TripMembersAddRoute();
  await Promise.resolve();
  expect(qa.dispatch).not.toHaveBeenCalled();
  expect(qa.approved).toBeUndefined();

  qa.focused = true;
  TripMembersAddRoute().props.onClose();
  qa.dispatch.mockImplementation(() => {
    qa.index = 0;
    qa.childRoutes = [{ key: "roster" }];
  });
  TripMembersAddRoute();
  expect(qa.dispatch).toHaveBeenCalledExactlyOnceWith({
    type: "GO_BACK", target: "people-stack", source: "add",
  });
});

it("keeps Add mounted and permits Back to retry when the stack refuses to pop", async () => {
  TripMembersAddRoute().props.onClose();
  TripMembersAddRoute();
  await Promise.resolve();
  expect(qa.approved).toBeUndefined();
  expect(TripMembersAddRoute().type).toBe("AddTravelerForm");
});

it("does not submit to or pop onto a replacement roster", async () => {
  const { onSave, onClose } = TripMembersAddRoute().props;
  qa.childRoutes[0] = { key: "other-roster" };
  await expect(onSave({})).rejects.toThrow("TRIP_MEMBERS_SCOPE_UNAVAILABLE");
  onClose();
  TripMembersAddRoute();
  await Promise.resolve();
  expect(qa.prevent.mock.lastCall?.[0]).toBe(false);
  expect(qa.dispatch).not.toHaveBeenCalled();
  expect(qa.entry.onAddTraveler).not.toHaveBeenCalled();
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
