import { beforeEach, expect, it, vi } from "vitest";
import StartTripComposerRoute from "../../../app/import-plans/start-trip-composer";
import { releaseStartTrip, stageStartTrip } from "./startTripHandoff";

const state = vi.hoisted(() => ({
  invocation: undefined as string | undefined,
  pending: false,
  routes: [{ key: "chooser" }, { key: "composer" }],
  dispatch: vi.fn(),
  close: vi.fn(),
}));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useCallback: (cb: unknown) => cb,
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read(),
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ invocation: state.invocation, chooserKey: "chooser" }),
  useNavigation: () => ({
    getState: () => ({ key: "import", routes: state.routes, index: state.routes.length - 1 }),
    isFocused: () => state.routes.at(-1)?.key === "composer",
    dispatch: state.dispatch,
  }),
}));
vi.mock("expo-router/react-navigation", () => ({ useRoute: () => ({ key: "composer" }) }));
vi.mock("@/components/SheetHost", () => ({
  useSheetMotion: () => ({ isExitPending: () => state.pending, requestClose: state.close }),
}));
vi.mock("@/components/SheetRoutePanel", () => ({ SheetRoutePanel: "panel" }));
vi.mock("@/features/capture/hostedImport", () => ({ hostedImportEnabled: true }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("../../../app/(tabs)/capture", () => ({ default: "capture" }));

function render() {
  const route = StartTripComposerRoute().type as () => React.ReactElement;
  return route();
}

beforeEach(() => {
  releaseStartTrip(state.invocation);
  state.invocation = stageStartTrip(vi.fn());
  state.pending = false;
  state.routes = [{ key: "chooser" }, { key: "composer" }];
  state.dispatch.mockReset();
});

it("drops a retired chooser before granting admission or serving a late action", () => {
  const route = render();
  expect(route.type).toBe("capture");
  const current = (route.props as { canUseHostedSource(): boolean }).canUseHostedSource;
  expect(current()).toBe(true);
  state.pending = true;
  expect(current()).toBe(false);
  state.pending = false;
  state.routes[0] = { key: "different-chooser" };
  expect(current()).toBe(false);
  state.routes[0] = { key: "chooser" };
  releaseStartTrip(state.invocation);
  expect(current()).toBe(false);
  expect(render().type).toBe("panel");
});

it("targets only this composer on Back and can retry a refused dispatch", () => {
  const { onHostedClose } = render().props as { onHostedClose(): void };
  const pop = { type: "GO_BACK", target: "import", source: "composer" };
  onHostedClose();
  expect(state.dispatch.mock.calls).toEqual([[pop]]);
  expect(render().type).toBe("capture");
  onHostedClose();
  expect(state.dispatch.mock.calls).toEqual([[pop], [pop]]);
  state.routes.push({ key: "review" });
  onHostedClose();
  expect(state.dispatch).toHaveBeenCalledTimes(2);
});
