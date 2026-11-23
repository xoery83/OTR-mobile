import type { ReactElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import TripMetadataSheetRoute from "../../../app/trip-metadata-sheet";
import TripMetadataDatesRoute from "../../../app/trip-metadata-sheet/dates";

const state = vi.hoisted(() => ({
  nav: {
    key: "settings-stack",
    index: 1,
    routes: [{ name: "index", key: "settings" }, { name: "dates", key: "date-child" }],
  },
  focused: true,
  beforeRemove: undefined as (() => void) | undefined,
  open: true,
  exitPending: false,
  close: vi.fn(),
  dispatch: vi.fn(),
  onChange: vi.fn(),
  onClose: vi.fn(),
}));

vi.mock("react", async original => ({
  ...(await original<typeof import("react")>()),
  useEffect: () => {},
  useRef: (current: unknown) => ({ current }),
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read(),
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ invocation: "owner", selection: "range" }),
  useNavigation: () => ({
    getState: () => state.nav,
    isFocused: () => state.focused,
    dispatch: state.dispatch,
  }),
}));
vi.mock("expo-router/react-navigation", () => ({
  useRoute: () => ({ key: "date-child" }),
  usePreventRemove: (enabled: boolean, callback: () => void) => {
    state.beforeRemove = enabled ? callback : undefined;
  },
}));
vi.mock("@/components/SheetHost", () => ({
  useSheetMotion: () => ({
    requestClose: state.close,
    isExitPending: () => state.exitPending,
  }),
}));
vi.mock("@/components/SheetRoutePanel", () => ({ SheetRoutePanel: "panel" }));
vi.mock("@/features/day-feed/TripCalendarRangeField", () => ({ TripCalendarRangePicker: "picker" }));
vi.mock("@/features/day-feed/tripMetadataSheet", () => ({
  readTripMetadataSheet: () => ({ open: state.open }),
  subscribeTripMetadataSheet: () => () => {},
  metadataCalendar: {
    read: (id?: string) => id === "range" ? { onChange: state.onChange, onClose: state.onClose } : undefined,
    release: () => {},
  },
}));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));

const selected = { start: "2026-12-19", end: "2027-01-01" };

function render() {
  const picker = TripMetadataDatesRoute();
  return picker.props as {
    onDone(range: typeof selected): void;
    children(confirm: () => void, content: null): ReactElement<{ onBack(): void }>;
  };
}
function acceptPop() {
  state.nav = { ...state.nav, index: 0, routes: state.nav.routes.slice(0, 1) };
}

beforeEach(() => {
  state.nav = {
    key: "settings-stack",
    index: 1,
    routes: [{ name: "index", key: "settings" }, { name: "dates", key: "date-child" }],
  };
  state.open = true;
  state.focused = true;
  state.beforeRemove = undefined;
  state.close.mockClear();
  state.exitPending = false;
  state.dispatch.mockReset();
  state.onChange.mockClear();
});

it("applies Done once after the exact date route returned to its editor", () => {
  state.dispatch.mockImplementation(acceptPop);
  const { onDone } = render();
  onDone(selected);
  onDone(selected);
  expect(state.dispatch).toHaveBeenCalledExactlyOnceWith({
    type: "GO_BACK", target: "settings-stack", source: "date-child",
  });
  expect(state.onChange).toHaveBeenCalledExactlyOnceWith(selected);
});

it("leaves the original range unchanged when Done was refused and the user later backs out", () => {
  const { onDone, children } = render();
  onDone(selected);
  expect(state.onChange).not.toHaveBeenCalled();

  state.dispatch.mockImplementation(acceptPop);
  children(() => {}, null).props.onBack();
  expect(state.nav.index).toBe(0);
  expect(state.onChange).not.toHaveBeenCalled();
});

it("does not apply a date after the owning editor was retired", () => {
  state.dispatch.mockImplementation(() => {
    state.open = false;
    acceptPop();
  });
  render().onDone(selected);
  expect(state.onChange).not.toHaveBeenCalled();
});


it("keeps the close guard quiet when a different root route covers the editor", () => {
  TripMetadataSheetRoute();
  expect(state.beforeRemove).toBeDefined();
  state.focused = false;
  state.beforeRemove?.();
  expect(state.close).not.toHaveBeenCalled();
  state.focused = true;
  state.beforeRemove?.();
  expect(state.close).toHaveBeenCalledOnce();
});
