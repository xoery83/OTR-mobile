import { expect, it, vi } from "vitest";
import ImportManualSheetRoute from "../../../app/import-plans/manual";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { readManualItinerary, releaseManualItinerary } from "@/features/day-feed/hostedManualItinerary";
import { releaseImportManualFallback, stageImportManualFallback } from "./hostedImportManual";

const qa = vi.hoisted(() => ({
  id: undefined as string | undefined,
  accept: false,
  dispatch: vi.fn(),
  ref: { current: undefined as string | undefined },
  stack: {
    key: "imports", index: 1,
    routes: [{ key: "batch", name: "index" }, { key: "manual", name: "manual" }] as
      { key: string; name: string; params?: { invocation: string } }[],
  },
}));

vi.mock("react", async original => ({
  ...(await original<typeof import("react")>()),
  useEffect: () => {},
  useRef: () => qa.ref,
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read(),
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ fallback: qa.id, editorKey: "batch" }),
  useNavigation: () => ({
    isFocused: () => qa.stack.index === 1,
    getState: () => qa.stack,
    dispatch: qa.dispatch,
  }),
}));
vi.mock("expo-router/react-navigation", () => ({ useRoute: () => ({ key: "manual" }) }));
vi.mock("@/components/SheetHost", () => ({ useSheetMotion: () => ({ isExitPending: () => false }) }));
vi.mock("@/components/SheetRoutePanel", () => ({ SheetRoutePanel: "panel" }));
vi.mock("@/features/capture/hostedImport", () => ({ hostedImportEnabled: true }));
vi.mock("@/features/day-feed/hostedManualItinerary", async original => ({
  ...(await original<typeof import("@/features/day-feed/hostedManualItinerary")>()),
  hostedManualItineraryEnabled: true,
}));
vi.mock("@/features/day-feed/ManualItineraryContent", () => ({
  ManualItineraryChoices: "choices", isManualItineraryFamily: () => true,
}));
vi.mock("@/features/day-feed/useHostedItineraryPickerNavigation", () => ({
  useHostedItineraryPickerNavigation: () => ({ back: vi.fn(), hasEditor: () => true }),
}));
vi.mock("@/features/capture/useImportManualTripChoices", () => ({
  useImportManualTripChoices: () => ({ target: "trip", current: true, failed: false }),
}));
vi.mock("@/ui/controls", () => ({ UiText: "text", UiButton: "button" }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));

it("releases a refused editor and lets the same active Batch chooser retry", () => {
  qa.id = stageImportManualFallback({
    tripId: "trip", generation: getAccountGeneration(), sourceKey: "batch", isBatchCurrent: () => true,
  });
  qa.dispatch.mockImplementation(action => {
    if (!qa.accept) return;
    qa.stack = {
      ...qa.stack, index: 2,
      routes: [...qa.stack.routes, { key: "editor", name: action.payload.name, params: action.payload.params }],
    };
  });
  const route = ImportManualSheetRoute();
  const choose = route.type(route.props).props.children.props.onChoose;
  choose("P1");
  const first = qa.dispatch.mock.lastCall?.[0].payload.params.invocation;
  expect(readManualItinerary(first)).toBeUndefined();
  expect(qa.ref.current).toBeUndefined();

  qa.accept = true;
  choose("P1");
  expect(qa.dispatch).toHaveBeenCalledTimes(2);
  expect(readManualItinerary(qa.ref.current)?.importFallback).toEqual({
    invocation: qa.id, sourceKey: "batch", chooserKey: "manual",
  });
  releaseManualItinerary(qa.ref.current);
  releaseImportManualFallback(qa.id);
});
