import { beforeEach, expect, it, vi } from "vitest";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { readManualItinerary, releaseManualItinerary } from "./hostedManualItinerary";
import { useHostedDetailItineraryEdit } from "./useHostedDetailItineraryEdit";

const state = vi.hoisted(() => ({
  focused: true,
  itemId: "test-item",
  enabled: true,
  navigate: vi.fn(),
  cleanup: undefined as (() => void) | undefined,
}));
vi.mock("expo-router", () => ({
  useNavigation: () => ({
    isFocused: () => state.focused,
    getState: () => ({ routes: [{ key: "owning-detail-key", params: { tripId: "test-trip", itemId: state.itemId } }] }),
  }),
  router: { navigate: state.navigate },
}));
vi.mock("expo-router/react-navigation", () => ({ useRoute: () => ({ key: "owning-detail-key" }) }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useRef: (current: unknown) => ({ current }),
  useLayoutEffect: (register: () => () => void) => { state.cleanup = register(); },
}));
vi.mock("@/features/capture/hostedImport", () => ({
  get hostedImportEnabled() { return state.enabled; },
}));
vi.mock("./hostedManualItinerary", async original => ({
  ...await original<typeof import("./hostedManualItinerary")>(),
  get hostedManualItineraryEnabled() { return state.enabled; },
}));

beforeEach(() => {
  state.cleanup?.();
  state.enabled = true;
  state.focused = true;
  state.itemId = "test-item";
  state.navigate.mockClear();
});

it("opens exactly the already-qualified item and reuses a pending invocation", () => {
  const render = vi.fn(() => null);
  const onSaved = vi.fn();
  const open = useHostedDetailItineraryEdit("P6", "test-trip", "test-item", getAccountGeneration());
  expect(open(render, onSaved)).toBe(true);
  const route = state.navigate.mock.calls[0][0];
  expect(route).toMatchObject({
    pathname: "/import-plans/quick-add-edit",
    params: { family: "P6", detail: 1 },
  });
  const { invocation } = route.params;
  expect(readManualItinerary(invocation)).toMatchObject({
    tripId: "test-trip",
    onSaved,
    detailEdit: { itemId: "test-item", originKey: "owning-detail-key", render },
  });
  expect(open(render, onSaved)).toBe(true);
  expect(state.navigate.mock.calls[1][0].params.invocation).toBe(invocation);
  state.focused = false;
  const entry = readManualItinerary(invocation);
  expect(entry?.detailEdit?.originFocused()).toBe(false);
  state.focused = true;
  state.itemId = "changed-item";
  expect(readManualItinerary(invocation)).toBeUndefined();
  expect(entry?.detailEdit?.originFocused()).toBe(false);
  expect(open(render, onSaved)).toBe(true);
  expect(state.navigate).toHaveBeenCalledTimes(2);
  state.cleanup?.();
  expect(readManualItinerary(invocation)).toBeUndefined();
  releaseManualItinerary(invocation);
});

it("retains the old editor flag-off and suppresses stale entries while flag-on", () => {
  const open = useHostedDetailItineraryEdit("P1", "test-trip", "test-item", getAccountGeneration());
  state.enabled = false;
  expect(open(vi.fn(), vi.fn())).toBe(false);
  state.enabled = true;
  state.focused = false;
  expect(open(vi.fn(), vi.fn())).toBe(true);
  expect(state.navigate).not.toHaveBeenCalled();
});
