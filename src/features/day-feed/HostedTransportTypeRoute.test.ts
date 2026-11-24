import { beforeEach, expect, it, vi } from "vitest";
import QuickAddTransportTypeRoute from "../../../app/import-plans/quick-add-transport-type";

const state = vi.hoisted(() => ({
  owner: {} as object | null,
  hasEditor: true,
  pop: vi.fn(),
  back: vi.fn(),
  choose: vi.fn(),
  handoff: { read: vi.fn(), release: vi.fn() },
}));

vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useContext: () => state.handoff,
  useEffect: () => {},
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read(),
}));
vi.mock("react-native", () => ({ StyleSheet: { create: (styles: object) => styles }, View: "view" }));
vi.mock("expo-router", () => ({ Redirect: "redirect" }));
vi.mock("@/components/SheetRoutePanel", () => ({ SheetRoutePanel: "panel" }));
vi.mock("@/features/capture/hostedImport", () => ({ hostedImportEnabled: true }));
vi.mock("@/features/day-feed/hostedManualItinerary", () => ({
  hostedManualItineraryEnabled: true,
  readManualItinerary: () => state.owner,
  subscribeManualItinerary: () => () => {},
}));
vi.mock("@/features/day-feed/useHostedItineraryPickerNavigation", () => ({
  useHostedItineraryPickerNavigation: () => ({
    invocation: "editor", selection: "type-1",
    hasEditor: () => state.hasEditor, pop: state.pop, back: state.back,
  }),
}));
vi.mock("@/ui/forms", () => ({ UiChoiceChip: "chip" }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));

const renderRoute = () => QuickAddTransportTypeRoute().type().props;

beforeEach(() => {
  vi.resetAllMocks();
  state.owner = {};
  state.hasEditor = true;
  const choice = { selected: "TRAIN", choose: state.choose };
  state.handoff.read.mockReturnValue(choice);
  state.handoff.release.mockImplementation(() => state.handoff.read.mockReturnValue(undefined));
  state.pop.mockReturnValue(true);
});

it("applies a type once after the matching editor is restored", () => {
  const route = renderRoute();
  const chips = route.children.props.children;
  expect(chips.find((chip: { key: string }) => chip.key === "TRAIN").props.selected).toBe(true);
  const ferry = chips.find((chip: { key: string }) => chip.key === "FERRY");
  state.pop.mockReturnValueOnce(false);
  ferry.props.onPress();
  expect(state.choose).not.toHaveBeenCalled();
  ferry.props.onPress();
  ferry.props.onPress();
  expect(state.handoff.release).toHaveBeenCalledExactlyOnceWith("type-1");
  expect(state.choose).toHaveBeenCalledExactlyOnceWith("FERRY");
});

it("Back and a changed owner never apply the current type", () => {
  const route = renderRoute();
  route.onBack();
  expect(state.back).toHaveBeenCalledOnce();
  expect(state.choose).not.toHaveBeenCalled();

  state.pop.mockImplementation(() => {
    state.owner = {};
    return true;
  });
  route.children.props.children[0].props.onPress();
  expect(state.choose).not.toHaveBeenCalled();
  state.hasEditor = false;
  expect(renderRoute().children).toBeNull();
});
