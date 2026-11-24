import { expect, it, vi } from "vitest";
import QuickAddAirportRoute from "../../../app/import-plans/quick-add-airport";

const state = vi.hoisted(() => ({
  owner: {},
  hasEditor: true,
  pop: vi.fn(),
  back: vi.fn(),
  handoff: { read: vi.fn(), release: vi.fn() },
}));

vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useContext: () => state.handoff,
  useEffect: () => {},
  useRef: (current: unknown) => ({ current }),
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read(),
}));
vi.mock("react-native", () => ({
  Keyboard: { dismiss: vi.fn() }, StyleSheet: { create: (styles: object) => styles }, View: "view",
}));
vi.mock("expo-router", () => ({ Redirect: "redirect" }));
vi.mock("@/components/SheetRoutePanel", () => ({ SheetRoutePanel: "panel" }));
vi.mock("@/components/SheetScrollView", () => ({ SheetScrollView: "scroll" }));
vi.mock("@/features/capture/hostedImport", () => ({ hostedImportEnabled: true }));
vi.mock("./FlightAirportField", () => ({ FlightAirportPicker: "airport-picker" }));
vi.mock("./hostedManualItinerary", () => ({
  hostedManualItineraryEnabled: true,
  readManualItinerary: () => state.owner,
  subscribeManualItinerary: () => () => {},
}));
vi.mock("./useHostedItineraryPickerNavigation", () => ({
  useHostedItineraryPickerNavigation: () => ({
    invocation: "editor", selection: "airport-1",
    hasEditor: () => state.hasEditor, pop: state.pop, back: state.back,
  }),
}));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));

it("keeps a refused airport choice retryable and applies once after restoring the same flight editor", () => {
  const onChange = vi.fn();
  const onClose = vi.fn();
  const staleChange = vi.fn();
  state.handoff.read.mockReturnValue({ label: "Airport", onClose, onChange: staleChange });
  state.handoff.release.mockImplementation(() => state.handoff.read.mockReturnValue(undefined));
  state.pop.mockReturnValueOnce(false).mockImplementation(() => {
    state.handoff.read.mockReturnValue({ label: "Airport", onClose, onChange });
    return true;
  });

  state.hasEditor = false;
  expect(QuickAddAirportRoute().type().props.children).toBeNull();
  state.hasEditor = true;
  const picker = QuickAddAirportRoute().type().props;
  const choice = { code: "AKL", name: "Auckland", zone: null };
  picker.onSelect(choice);
  expect(onChange).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  picker.onSelect(choice);
  picker.onSelect(choice);
  expect(state.handoff.release).toHaveBeenCalledExactlyOnceWith("airport-1");
  expect(staleChange).not.toHaveBeenCalled();
  expect(onChange).toHaveBeenCalledExactlyOnceWith(choice);
  expect(onClose).toHaveBeenCalledOnce();
});
