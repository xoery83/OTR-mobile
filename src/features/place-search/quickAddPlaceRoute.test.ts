import { beforeEach, expect, it, vi } from "vitest";
import QuickAddPlaceRoute from "../../../app/import-plans/quick-add-place";
import type { PlaceSearchResult } from "./PlaceSearchSheet";

const state = vi.hoisted(() => ({
  applies: vi.fn(),
  pop: vi.fn(),
  back: vi.fn(),
  owner: {} as object | null,
  binding: { editorId: "rental", isCurrent: () => true },
}));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useContext: () => ({ read: () => ({
    binding: state.binding,
    onConfirm: state.applies,
  }) }),
  useEffect: () => {},
  useRef: (current: unknown) => ({ current }),
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read(),
}));
vi.mock("expo-router", () => ({}));
vi.mock("react-native", () => ({ Keyboard: { dismiss: vi.fn() }, StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock("@/components/SheetRoutePanel", () => ({ SheetRoutePanel: "panel" }));
vi.mock("@/components/SheetScrollView", () => ({ SheetScrollView: "scroll" }));
vi.mock("@/features/capture/hostedImport", () => ({ hostedImportEnabled: true }));
vi.mock("@/features/day-feed/hostedManualItinerary", () => ({
  hostedManualItineraryEnabled: true,
  subscribeManualItinerary: () => () => {},
  readManualItinerary: () => state.owner,
}));
vi.mock("@/features/day-feed/useHostedItineraryPickerNavigation", () => ({
  useHostedItineraryPickerNavigation: () => ({ hasEditor: () => true, pop: state.pop, back: state.back }),
}));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("./PlaceSearchSheet", () => ({ PlaceSearchContent: "place" }));

function render() {
  const route = QuickAddPlaceRoute().type as () => React.ReactElement;
  return route().props as { onConfirm(result: PlaceSearchResult): void; onCancel(): void };
}

beforeEach(() => {
  state.owner = {};
  state.binding = { editorId: "rental", isCurrent: () => true };
  state.applies.mockClear();
  state.back.mockClear();
  state.pop.mockReset();
});

it("preserves the field on a refused pop, then applies one manual result after a successful return", () => {
  const result = { kind: "MANUAL", text: "QA place" } as const;
  const place = render();
  state.pop.mockReturnValueOnce(false).mockReturnValueOnce(true);
  place.onConfirm(result);
  expect(state.applies).not.toHaveBeenCalled();
  place.onConfirm(result);
  place.onConfirm(result);
  expect(state.applies).toHaveBeenCalledExactlyOnceWith(result);
  expect(state.pop).toHaveBeenCalledTimes(2);
});

it("rejects a replacement field in the same editor during pop and Back never applies a result", () => {
  const place = render();
  state.pop.mockImplementationOnce(() => { state.binding = { ...state.binding }; return true; });
  place.onConfirm({ kind: "MANUAL", text: "QA place" });
  expect(state.applies).not.toHaveBeenCalled();
  place.onCancel();
  expect(state.back).toHaveBeenCalledOnce();
});

it("rejects a result from a field replaced before the previous child can close", () => {
  const place = render();
  state.binding = { ...state.binding };
  place.onConfirm({ kind: "MANUAL", text: "old field" });
  expect(state.pop).not.toHaveBeenCalled();
  expect(state.applies).not.toHaveBeenCalled();
});
