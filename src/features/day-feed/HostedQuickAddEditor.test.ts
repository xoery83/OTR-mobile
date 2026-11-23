import { expect, it, vi } from "vitest";
import QuickAddItineraryEditorRoute from "../../../app/import-plans/quick-add-edit";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { releaseManualItinerary, stageManualItinerary } from "./hostedManualItinerary";

const qa = vi.hoisted(() => ({
  id: "",
  approved: undefined as unknown,
  refs: [] as { current: unknown }[],
  ref: 0,
  pending: false,
  actions: [] as (() => void)[],
}));

vi.mock("@/features/capture/hostedImport", () => ({ hostedImportEnabled: true }));
vi.mock("./hostedManualItinerary", async (original) => ({
  ...await original<typeof import("./hostedManualItinerary")>(),
  hostedManualItineraryEnabled: true,
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ invocation: qa.id, family: "P2" }),
  useNavigation: () => ({}),
}));
vi.mock("expo-router/react-navigation", () => ({ usePreventRemove: vi.fn(), useRoute: () => ({ key: "editor" }) }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useEffect: (run: () => void) => run(),
  useRef: (initial: unknown) => qa.refs[qa.ref++] ??= { current: initial },
  useState: () => [qa.approved, (next: unknown) => { qa.approved = next; }],
  useCallback: (callback: unknown) => callback,
  useContext: () => null,
  useSyncExternalStore: (_: unknown, snapshot: () => unknown) => snapshot(),
}));
vi.mock("react-native", () => ({ StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock("@/components/SheetNavigationHeader", () => ({}));
vi.mock("@/components/SheetHeader", () => ({ SheetHeader: "Header" }));
vi.mock("@/components/SheetRoutePanel", () => ({ SheetRoutePanel: "SheetRoutePanel" }));
vi.mock("@/components/SheetScrollView", () => ({}));
vi.mock("@/components/SheetHost", () => ({
  useSheetMotion: () => ({
    exitPending: qa.pending,
    isExitPending: () => qa.pending,
    requestCloseWithAction: (action: () => void) => {
      qa.pending = true;
      qa.actions.push(action);
    },
  }),
}));
vi.mock("./ManualItineraryContent", () => ({
  ManualItineraryContent: "Editor",
  isManualItineraryFamily: () => true,
}));

it("retries only dismissal for the exact locally committed item after a root exit refuses", () => {
  const onSaved = vi.fn();
  const entry = {
    generation: getAccountGeneration(), tripId: "trip",
    initialDate: null, onClose: vi.fn(), onSaved,
  };
  qa.id = stageManualItinerary(() => entry);
  const editor = QuickAddItineraryEditorRoute().type;
  const render = () => {
    qa.ref = 0;
    return editor().props;
  };

  const screen = render();
  const header = screen.children.props;
  header.children.props.children.props.onSaved("item-a");
  render();
  expect(qa.actions).toHaveLength(1);
  expect(onSaved).not.toHaveBeenCalled();

  qa.pending = false;
  render();
  expect(qa.approved).toBeUndefined();
  expect(screen.value()).toBe(false);
  const retry = render().children.props.value({ leftDisabled: true });
  expect(retry.props.leftDisabled).toBe(false);
  expect(retry.props.rightDisabled).toBe(true);
  retry.props.onLeft();
  render();
  expect(qa.actions).toHaveLength(2);
  qa.actions[1]();
  expect(onSaved).toHaveBeenCalledExactlyOnceWith("item-a");

  releaseManualItinerary(qa.id);
  expect(screen.value()).toBe(false);
});
