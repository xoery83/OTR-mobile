import { beforeEach, expect, it, vi } from "vitest";
import { useTripPreparationWidget } from "./useTripPreparationWidget";
const state = vi.hoisted(() => ({
  generation: 1,
  cursor: 0,
  values: [] as unknown[],
  read: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: () => [state.values[state.cursor++], vi.fn()],
  useRef: () => ({ current: 0 }),
  useCallback: (fn: unknown) => fn,
  useEffect: () => {},
  useSyncExternalStore: () => state.generation,
}));
vi.mock("react-native", () => ({ AppState: { addEventListener: vi.fn() } }));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => state.generation,
  subscribeAccountGeneration: vi.fn(),
}));
vi.mock("@/data/repositories/tripPreparationRepository", () => ({
  readTripPreparation: async () => ({ read: state.read }),
}));
vi.mock("./TripPreparationWidget", () => ({ TripPreparationWidget: () => null }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => {} }));
function PreparationHarness(canPlan: boolean) {
  const read = {
    scope: { tripId: "trip", accountId: "actor", generation: 1 },
    epoch: "epoch",
    canPlan,
    preparation: { itemCount: 0, counts: [], recent: [] },
  };
  state.cursor = 0;
  state.values = [read, "READY"];
  const onImport = vi.fn(),
    onBuild = vi.fn();
  const widget = useTripPreparationWidget({
    tripId: "trip",
    undated: true,
    onImport,
    onBuild,
  });
  return {
    read,
    onImport,
    onBuild,
    props: (
      widget!.content as import("react").ReactElement<{
        onImport?: () => void;
        onBuildItinerary?: () => void;
      }>
    ).props,
  };
}
beforeEach(() => {
  state.generation = 1;
  state.read.mockReset();
});
it("hides write actions from read-only participants and preserves them for authorized local planning", () => {
  expect(PreparationHarness(false).props.onImport).toBeUndefined();
  expect(PreparationHarness(false).props.onBuildItinerary).toBeUndefined();
  expect(PreparationHarness(true).props.onImport).toBeTypeOf("function");
  expect(PreparationHarness(true).props.onBuildItinerary).toBeTypeOf("function");
});
it("rechecks permissions before a visible action and rejects a changed account", async () => {
  const view = PreparationHarness(true);
  state.read.mockResolvedValue({ ...view.read, canPlan: false });
  view.props.onImport!();
  await vi.waitFor(() => expect(state.read).toHaveBeenCalled());
  expect(view.onImport).not.toHaveBeenCalled();
  state.generation = 2;
  view.props.onBuildItinerary!();
  await Promise.resolve();
  expect(view.onBuild).not.toHaveBeenCalled();
});
