import { afterEach, expect, it, vi } from "vitest";
import DocumentsSearchFiltersRoute from "../../../app/documents-search-filters";
import DocumentsTripPickerRoute from "../../../app/documents-trip-picker";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { openDocumentSearchFilters, releaseDocumentSearchFilters } from "./documentSearchFilterInvocation";
import { openDocumentsTripPicker, releaseDocumentsTripPicker } from "./documentsTripPicker";

const qa = vi.hoisted(() => ({
  close: vi.fn<(action: () => void) => void>(),
  useState: vi.fn(),
  invocation: "",
  exitPending: false,
  exitAttempt: 0,
  readPrior: vi.fn(),
}));

vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useEffect: vi.fn(),
  useState: qa.useState,
  useSyncExternalStore: vi.fn(),
  useRef: (value: unknown) => ({ current: value }),
}));
vi.mock("expo-router", () => ({ useLocalSearchParams: () => ({ invocation: qa.invocation }) }));
vi.mock("react-native", () => ({ StyleSheet: { create: (value: unknown) => value }, View: "View" }));
vi.mock("@/components/SheetHost", () => ({
  useSheetMotion: () => ({
    exitPending: qa.exitPending,
    isExitPending: () => qa.exitPending,
    getExitAttempt: () => qa.exitAttempt,
    requestCloseWithAction: qa.close,
  }),
}));
vi.mock("@/components/SheetRoutePanel", () => ({ SheetRoutePanel: "SheetRoutePanel" }));
vi.mock("@/features/documents/DocumentSearchFilterFields", () => ({ DocumentSearchFilterFields: "FilterFields" }));
vi.mock("@/features/capture/captureTripPrior", () => ({
  listCaptureTripPriors: vi.fn(),
  readCaptureTripPrior: qa.readPrior,
}));
vi.mock("@/ui/controls", () => ({ UiButton: "Button", UiText: "Text" }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: vi.fn() }));

afterEach(() => {
  releaseDocumentSearchFilters(qa.invocation);
  releaseDocumentsTripPicker(qa.invocation);
  qa.exitPending = false;
  qa.exitAttempt = 0;
  vi.resetAllMocks();
});

it("applies filters only through a successful Done close for the current search", () => {
  const apply = vi.fn();
  qa.invocation = openDocumentSearchFilters({
    generation: getAccountGeneration(),
    initial: {},
    isCurrent: () => true,
    apply,
  });
  const setFacets = vi.fn();
  qa.useState.mockReturnValue([{}, setFacets]);
  const first = DocumentsSearchFiltersRoute();
  first.props.children.props.children.props.setFacets({ storage: "LOCAL" });
  expect(setFacets).toHaveBeenCalledWith({ storage: "LOCAL" });
  expect(apply).not.toHaveBeenCalled();
  qa.useState.mockReturnValue([{ storage: "LOCAL" }, setFacets]);
  const changed = DocumentsSearchFiltersRoute();
  changed.props.action.onPress();
  expect(apply).not.toHaveBeenCalled();
  qa.close.mock.calls[0][0]();
  expect(apply).toHaveBeenCalledExactlyOnceWith({ storage: "LOCAL" });

  releaseDocumentSearchFilters(qa.invocation);
  qa.close.mock.calls[0][0]();
  expect(apply).toHaveBeenCalledTimes(1);
});

it("clears Trip selection busy state during close so an interrupted close can be retried", async () => {
  const trip = { id: "t1", name: "Trip" };
  const picker = {
    accountId: "a1",
    generation: getAccountGeneration(),
    isCurrent: () => true,
    select: vi.fn(),
  };
  qa.invocation = openDocumentsTripPicker(picker);
  const setSelecting = vi.fn();
  const render = (selecting: boolean) => {
    qa.useState.mockReturnValueOnce([[trip], vi.fn()]);
    qa.useState.mockReturnValueOnce([false, vi.fn()]);
    qa.useState.mockReturnValueOnce([selecting, setSelecting]);
    const choiceList = DocumentsTripPickerRoute().props.children;
    const rows = choiceList.type(choiceList.props);
    if (!Array.isArray(rows)) throw new Error("Expected cached Trip choices");
    return rows[0];
  };
  let resolvePrior: (value: typeof trip) => void = () => {};
  qa.readPrior.mockReturnValueOnce(new Promise<typeof trip>((resolve) => { resolvePrior = resolve; }));
  render(false).props.onPress();
  // A cancel starts and is interrupted while the prior read is outstanding.
  qa.exitAttempt += 1;
  resolvePrior(trip);
  await Promise.resolve();
  expect(setSelecting.mock.calls).toEqual([[true], [false]]);
  expect(qa.close).not.toHaveBeenCalled();
  setSelecting.mockClear();

  qa.readPrior.mockResolvedValue(trip);
  qa.close.mockImplementation(() => {
    qa.exitAttempt += 1;
    qa.exitPending = true;
  });
  render(false).props.onPress();
  await Promise.resolve();
  expect(setSelecting.mock.calls).toEqual([[true], [false]]);
  expect(render(false).props.disabled).toBe(true);
  expect(picker.select).not.toHaveBeenCalled();

  qa.exitPending = false;
  const retry = render(false);
  expect(retry.props.disabled).toBe(false);
  retry.props.onPress();
  await Promise.resolve();
  expect(qa.close).toHaveBeenCalledTimes(2);
  qa.close.mock.calls[1][0]();
  expect(picker.select).toHaveBeenCalledExactlyOnceWith(trip);
});
