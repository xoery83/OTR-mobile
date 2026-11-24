import { beforeEach, expect, it, vi } from "vitest";
import QuickAddParticipantsRoute from "../../../app/import-plans/quick-add-participants";
import { ParticipantPickerHandoffContext, type ParticipantPickerProps } from "./participantPickerHandoff";

const state = vi.hoisted(() => ({
  nav: {
    key: "sheet-stack",
    index: 1,
    routes: [{ key: "origin-editor" }, { key: "participants" }],
  },
  dispatch: vi.fn(),
  choice: undefined as ParticipantPickerProps | undefined,
  active: true,
}));

vi.mock("react", async original => ({
  ...(await original<typeof import("react")>()),
  useContext: (context: unknown) => context === ParticipantPickerHandoffContext
    ? { read: (id: string) => id === "picker" ? state.choice : undefined }
    : null,
  useRef: (current: unknown) => ({ current }),
  useEffect: () => {},
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read(),
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ invocation: "owner", selection: "picker", editorKey: "origin-editor" }),
  useNavigation: () => ({
    getState: () => state.nav,
    isFocused: () => true,
    dispatch: state.dispatch,
  }),
}));
vi.mock("expo-router/react-navigation", () => ({ useRoute: () => ({ key: "participants" }) }));
vi.mock("@/components/SheetHost", () => ({ useSheetMotion: () => ({ isExitPending: () => false }) }));
vi.mock("@/components/SheetRoutePanel", () => ({ SheetRoutePanel: "panel" }));
vi.mock("@/features/capture/hostedImport", () => ({ hostedImportEnabled: true }));
vi.mock("./hostedManualItinerary", () => ({
  hostedManualItineraryEnabled: true,
  subscribeManualItinerary: () => () => {},
  readManualItinerary: (id: string) => id === "owner" && state.active ? {} : null,
}));
vi.mock("./PlanParticipantsField", () => ({ PlanParticipantsPicker: "participant-picker" }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));

const selected = { mode: "SELECTED_MEMBERS" as const, people: ["a"], selfPersonId: null };
const apply = vi.fn();

function render() {
  const route = QuickAddParticipantsRoute();
  return (route.type as () => { type: string; props: { onDone(value: typeof selected): void } })();
}

function acceptPop() {
  state.nav = { ...state.nav, index: 0, routes: state.nav.routes.slice(0, 1) };
}

beforeEach(() => {
  state.dispatch.mockReset();
  state.nav = {
    key: "sheet-stack",
    index: 1,
    routes: [{ key: "origin-editor" }, { key: "participants" }],
  };
  state.choice = {
    disabled: false,
    options: [{ personId: "a", displayName: "A" }],
    value: { mode: "WHOLE_GROUP", people: [], selfPersonId: null },
    onChange: apply,
  };
  state.active = true;
  apply.mockClear();
});

it("applies to the prior requester only after the exact child has been removed", () => {
  const done = render().props.onDone;
  done(selected);
  expect(apply).not.toHaveBeenCalled();
  state.dispatch.mockImplementation(acceptPop);
  done(selected);
  done(selected);
  expect(state.dispatch).toHaveBeenLastCalledWith({
    type: "GO_BACK", target: "sheet-stack", source: "participants",
  });
  expect(apply).toHaveBeenCalledExactlyOnceWith(selected);
});

it("does not apply if the original field or its participant is no longer eligible", () => {
  state.dispatch.mockImplementation(() => {
    state.choice!.options = [];
    acceptPop();
  });
  render().props.onDone(selected);
  expect(apply).not.toHaveBeenCalled();
});


it("hides participant names as soon as the owning Trip invocation is retired", () => {
  expect(render().type).toBe("participant-picker");
  state.active = false;
  expect(render().type).toBe("panel");
});
