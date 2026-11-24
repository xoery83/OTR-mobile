import { expect, it, vi } from "vitest";
import QuickAddItineraryRoute from "../../../app/import-plans/quick-add-itinerary";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { readManualItinerary, releaseManualItinerary, stageManualItinerary } from "./hostedManualItinerary";
import { useHostedDayInsertion } from "./useHostedDayInsertion";

const route = vi.hoisted(() => ({
  params: {} as { invocation?: string; entryPoint?: string },
  navigate: vi.fn(),
  push: vi.fn(),
  origin: { key: "chooser", params: { view: "day", tripId: "trip" } },
  previousRootKey: "day",
  focused: true,
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => route.params,
  useNavigation: () => ({ isFocused: () => route.focused, getState: () => ({ index: 0, routes: [route.origin] }) }),
  router: { navigate: route.navigate, push: route.push },
}));
vi.mock("expo-router/react-navigation", () => ({ useRoute: () => ({ key: "chooser" }) }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useContext: () => ({ hasOrigin: (key: string) => key === route.previousRootKey }),
  useEffect: () => {},
  useLayoutEffect: (effect: () => void) => effect(),
  useRef: (current: unknown) => ({ current }),
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read(),
}));
vi.mock("@/components/SheetRoutePanel", () => ({ SheetRoutePanel: "SheetRoutePanel" }));
vi.mock("@/components/SheetHost", () => ({ useSheetMotion: () => ({ isExitPending: () => false }) }));
vi.mock("@/features/capture/hostedImport", () => ({ hostedImportEnabled: true }));
vi.mock("./hostedManualItinerary", async original => ({
  ...await original<typeof import("./hostedManualItinerary")>(),
  hostedManualItineraryEnabled: true,
}));
vi.mock("./ManualItineraryContent", () => ({
  ManualItineraryChoices: "Choices",
  isManualItineraryFamily: (family: string, localOnly: boolean) => family === "P1" || !localOnly,
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));

it("opens a root chooser on Day and carries only its active insertion into the editor", () => {
  route.navigate.mockClear();
  const entry = {
    entryPoint: "day-insertion" as const, dayInsertionOriginKey: "day", localOnly: true, tripId: "trip",
    generation: getAccountGeneration(), initialDate: "2026-11-24", initialStartTime: "10:30",
    onClose: vi.fn(), onSaved: vi.fn(),
  };
  const invocation = stageManualItinerary(() => entry);
  route.params = { invocation, entryPoint: entry.entryPoint };
  const Chooser = QuickAddItineraryRoute().type;
  const result = Chooser();
  expect(result.props.onBack).toBeUndefined();
  expect(result.props.children.props.localOnly).toBe(true);
  result.props.children.props.onChoose("P2");
  expect(route.navigate).not.toHaveBeenCalled();
  result.props.children.props.onChoose("P1");
  expect(route.navigate).toHaveBeenCalledExactlyOnceWith({
    pathname: "/import-plans/quick-add-edit", params: { invocation, family: "P1", chooserKey: "chooser" },
  });
  expect(entry.onSaved).not.toHaveBeenCalled();

  route.previousRootKey = "different-page";
  expect(Chooser().props.children).toBeNull();
  result.props.children.props.onChoose("P1");
  expect(route.navigate).toHaveBeenCalledOnce();
  route.previousRootKey = "day";

  releaseManualItinerary(invocation);
  result.props.children.props.onChoose("P1");
  expect(route.navigate).toHaveBeenCalledOnce();
});

it("retains the child Back control for an existing Quick Add invocation", () => {
  const entry = {
    tripId: "trip", generation: getAccountGeneration(), initialDate: null,
    onClose: vi.fn(), onSaved: vi.fn(),
  };
  const invocation = stageManualItinerary(() => entry);
  const Chooser = QuickAddItineraryRoute().type;
  route.params = { invocation, entryPoint: "day-insertion" };
  expect(Chooser().props.children).toBeNull();
  route.params = { invocation };
  expect(typeof Chooser().props.onBack).toBe("function");
  releaseManualItinerary(invocation);
});

it("captures the same Day bounds while covered, but rejects stale triggers and receipts after a same-route Home switch", () => {
  route.push.mockClear();
  const generation = getAccountGeneration();
  const onSaved = vi.fn();
  const show = useHostedDayInsertion({
    active: true, today: false, tripId: "trip", generation, localOnly: true,
    tripStartDate: "2026-11-23", tripEndDate: "2026-11-28", onSaved,
  });
  const candidate = { date: "2026-11-24", startTime: "10:30" };
  expect(show(candidate)).toBe(true);
  const invocation = route.push.mock.calls[0]?.[0].params.invocation;
  const entry = readManualItinerary(invocation);
  expect(entry).toMatchObject({
    initialDate: candidate.date, initialStartTime: candidate.startTime,
    tripStartDate: "2026-11-23", tripEndDate: "2026-11-28",
  });
  route.focused = false;
  expect(readManualItinerary(invocation)).toBe(entry);
  entry?.onSaved("hidden");
  expect(onSaved).not.toHaveBeenCalled();

  route.focused = true;
  entry?.onSaved("restored");
  expect(onSaved).toHaveBeenCalledExactlyOnceWith("trip", generation);
  route.origin.params.view = "home";
  expect(readManualItinerary(invocation)).toBeUndefined();
  entry?.onSaved("stale");
  expect(show(candidate)).toBe(true);
  expect(route.push).toHaveBeenCalledOnce();
  expect(onSaved).toHaveBeenCalledOnce();

  route.origin.params.view = "day";
  releaseManualItinerary(invocation);
});
