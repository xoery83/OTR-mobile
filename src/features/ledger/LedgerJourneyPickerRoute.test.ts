import { expect, it, vi } from "vitest";
import LedgerJourneyPickerRoute from "../../../app/ledger-journey-picker";

const state = vi.hoisted(() => ({
  exitPending: false,
  refs: [] as { current: unknown }[],
  refIndex: 0,
  stateIndex: 0,
  requestClose: vi.fn(),
}));

vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useContext: () => null,
  useEffect: (run: () => void) => run(),
  useRef: (current: unknown) => state.refs[state.refIndex++] ??= { current },
  useState: (initial: unknown) => [state.stateIndex++ === 3 ? true : initial, vi.fn()],
  useSyncExternalStore: () => undefined,
}));
vi.mock("expo-router", () => ({ useLocalSearchParams: () => ({ invocation: "journey" }) }));
vi.mock("expo-router/react-navigation", () => ({
  useIsFocused: () => true,
  usePreventRemove: vi.fn(),
}));
vi.mock("react-native", () => ({ StyleSheet: { create: (styles: object) => styles } }));
vi.mock("@/components/SheetRoutePanel", () => ({ SheetRoutePanel: "panel" }));
vi.mock("@/components/SheetHost", () => ({
  useSheetMotion: () => ({ requestClose: state.requestClose, exitPending: state.exitPending }),
}));
vi.mock("./LedgerStage6Screen", () => ({ LedgerJourneyPickerFields: "fields" }));
vi.mock("@/ui/controls", () => ({ UiButton: "button", UiText: "text" }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));

it("tries automatic dismissal once and keeps manual Close available if the route refuses", () => {
  const render = () => {
    state.refIndex = 0;
    state.stateIndex = 0;
    return LedgerJourneyPickerRoute().props;
  };
  render();
  expect(state.requestClose).toHaveBeenCalledOnce();
  state.exitPending = true;
  render();
  state.exitPending = false;
  expect(render().leadingDisabled).toBe(false);
  expect(state.requestClose).toHaveBeenCalledOnce();
});
