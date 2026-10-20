import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import * as ImagePicker from "expo-image-picker";
import { readLocalTripPhotoRepository } from "@/data/repositories/tripPhotoRepository";
import { Modal } from "react-native";
import { CurrencySettingsScreen } from "@/features/ledger/CurrencySettingsScreen";
import { lightPalette } from "@/ui/palette";
import { TripBasicEditor } from "./TripBasicEditor";
import { TripCoverPicker } from "./TripCoverPicker";
import { TripCurrencyRow } from "./TripSetupRows";
import { TripMetadataFields } from "./TripMetadataFields";
import { SheetHeader } from "@/components/SheetHeader";

const state = vi.hoisted(() => ({
  values: [] as unknown[],
  cursor: 0,
  refs: [] as { current: any }[],
  refCursor: 0,
  alert: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef: (initial: any) => (state.refs[state.refCursor++] ??= { current: initial }),
  useEffect: () => {},
  useState: (initial: unknown) => {
    const i = state.cursor++;
    if (!(i in state.values)) state.values[i] = initial;
    return [
      state.values[i],
      (value: unknown) => {
        state.values[i] = value;
      },
    ];
  },
}));
vi.mock("@/data/repositories/tripPreparationSetupRepository", () => ({
  readTripPreparationSetupRepository: vi.fn(),
}));
vi.mock("expo-image-picker", () => ({ launchImageLibraryAsync: vi.fn() }));
vi.mock("@/data/repositories/tripPhotoRepository", () => ({
  readLocalTripPhotoRepository: vi.fn(),
}));
vi.mock("react-native", () => ({
  Alert: { alert: (...args: any[]) => state.alert(...args) },
  View: "View",
  Modal: "Modal",
  ScrollView: "ScrollView",
  StyleSheet: { create: (s: unknown) => s },
}));
vi.mock("@/features/ledger/CurrencySettingsScreen", () => ({
  CurrencySettingsScreen: "CurrencySettingsScreen",
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("@/ui/theme", () => ({
  useThemedStyles: (create: (colors: typeof lightPalette) => unknown) =>
    create(lightPalette),
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => {} }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/forms", () => ({ UiTextInput: "UiTextInput" }));
vi.mock("@/ui/controls", () => ({
  UiText: "UiText",
  UiSection: "UiSection",
  UiButton: "UiButton",
}));
vi.mock("@/components/SheetHeader", () => ({ SheetHeader: "SheetHeader" }));
vi.mock("./TripCoverPicker", () => ({ TripCoverPicker: "TripCoverPicker" }));
vi.mock("./TripMetadataFields", () => ({ TripMetadataFields: "TripMetadataFields" }));
vi.mock("./TripSetupRows", () => ({ TripCurrencyRow: "TripCurrencyRow" }));
vi.mock("./tripCovers", () => ({
  tripCoverSource: (trip: any) => trip.selectedCoverAssetId ?? "fallback",
  tripCoverId: (trip: any) => trip.selectedCoverAssetId ?? "coast",
}));
vi.mock("./TripCoverVisual", () => ({ TripCoverVisual: "TripCoverVisual" }));
type Element = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
const elements = (node: ReactNode): Element[] => {
  if (!isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...Children.toArray(element.props.children).flatMap(elements)];
};
const trip = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Nelson summer",
  destination: "Nelson",
  startDate: "2026-10-16",
  endDate: null,
  selectedCoverAssetId: "cultural-oldtown" as const,
};
const before = {
  name: trip.name,
  destination: trip.destination,
  startDate: trip.startDate,
  endDate: trip.endDate,
};
const render = (
  onSaveMetadata = vi.fn().mockResolvedValue(undefined),
  onSelectCover = vi.fn().mockResolvedValue(undefined),
  tripOverride: Parameters<typeof TripBasicEditor>[0]["trip"] = trip,
) => {
  state.cursor = state.refCursor = 0;
  return elements(
    TripBasicEditor({
      trip: tripOverride,
      metadataEditable: true,
      onSaveMetadata,
      onSelectCover,
    }),
  );
};
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
beforeEach(() => {
  state.alert.mockReset();
  state.values = [];
  state.refs = [];
  state.cursor = state.refCursor = 0;
});
it("stages cover and metadata together through one owning callback, without an independent write", async () => {
  const save = vi.fn().mockResolvedValue(undefined),
    cover = vi.fn().mockResolvedValue(undefined);
  let view = render(save, cover);
  const fields = view.find((n) => n.type === TripMetadataFields)!;
  (fields.props.onName as (s: string) => void)("  Nelson updated  ");
  (fields.props.onRange as (r: any) => void)({ start: "", end: "" });
  await (
    view.find((n) => n.type === TripCoverPicker)!.props.onSelect as (
      s: string,
    ) => Promise<void>
  )("coast");
  expect(cover).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
  view = render(save, cover);
  expect(view.find((n) => n.type === TripCoverPicker)!.props.selectedRaw).toBe("coast");
  (view.find((n) => n.type === SheetHeader)!.props.onRight as () => void)();
  await flush();
  expect(save).toHaveBeenCalledExactlyOnceWith(
    before,
    { ...before, name: "Nelson updated", startDate: null },
    { before: "cultural-oldtown", after: "coast" },
    expect.any(String),
  );
  expect(
    render(save, cover).some((n) => n.props.children === "actionIsland.savedLocally"),
  ).toBe(true);
});
it("retains unsaved fields after a failed local save and blocks invalid date ranges", async () => {
  const save = vi.fn().mockRejectedValue(new Error("disk"));
  let nodes = render(save);
  (
    nodes.find((node) => node.type === TripMetadataFields)!.props.onName as (
      s: string,
    ) => void
  )("Keep draft");
  nodes = render(save);
  (nodes.find((node) => node.type === SheetHeader)!.props.onRight as () => void)();
  await flush();
  nodes = render(save);
  expect(nodes.find((node) => node.type === TripMetadataFields)!.props.name).toBe(
    "Keep draft",
  );
  expect(nodes.some((node) => node.props.children === "tripCreate.saveFailed")).toBe(
    true,
  );
  const fields = nodes.find((node) => node.type === TripMetadataFields)!;
  (fields.props.onRange as (r: { start: string; end: string }) => void)({
    start: trip.startDate,
    end: "2026-10-15",
  });
  expect(
    render(save).find((node) => node.type === SheetHeader)!.props.rightDisabled,
  ).toBe(true);
});

it("withholds metadata edits without local creator provenance while retaining the independent cover choice", () => {
  state.cursor = state.refCursor = 0;
  const nodes = elements(
    TripBasicEditor({
      trip,
      metadataEditable: false,
      onSaveMetadata: vi.fn(),
      onSelectCover: vi.fn(),
    }),
  );
  expect(nodes.find((node) => node.type === TripMetadataFields)!.props.disabled).toBe(
    true,
  );
  expect(nodes.find((node) => node.type === SheetHeader)!.props.onRight).toBeUndefined();
  expect(nodes.some((node) => node.type === TripCoverPicker)).toBe(true);
});

it("opens the existing Currency screen over a dirty editor and Back preserves every draft", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const renderEditor = () => {
    state.cursor = state.refCursor = 0;
    return elements(
      TripBasicEditor({
        trip,
        metadataEditable: true,
        onSaveMetadata: save,
        onSelectCover: vi.fn(),
        currencyAvailable: true,
      }),
    );
  };
  let nodes = renderEditor();
  const fields = nodes.find((n) => n.type === TripMetadataFields)!.props;
  (fields.onName as (s: string) => void)("Unsaved name");
  (fields.onDestination as (s: string) => void)("Tokyo");
  (fields.onRange as (s: any) => void)({ start: "2027-01-01", end: "2027-01-02" });
  await (
    nodes.find((n) => n.type === TripCoverPicker)!.props.onSelect as (
      s: string,
    ) => Promise<void>
  )("coast");
  nodes = renderEditor();
  (nodes.find((n) => n.type === TripCurrencyRow)!.props.onOpen as () => void)();
  nodes = renderEditor();
  expect(nodes.find((n) => n.type === Modal)!.props.visible).toBe(true);
  expect(nodes.find((n) => n.type === CurrencySettingsScreen)!.props.journeyId).toBe(
    trip.id,
  );
  expect(state.alert).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
  (
    nodes.find((n) => n.type === SheetHeader && n.props.leftLabel === "common.back")!
      .props.onLeft as () => void
  )();
  nodes = renderEditor();
  expect(nodes.find((n) => n.type === Modal)!.props.visible).toBe(false);
  expect(nodes.find((n) => n.type === TripMetadataFields)!.props).toMatchObject({
    name: "Unsaved name",
    destination: "Tokyo",
    range: { start: "2027-01-01", end: "2027-01-02" },
  });
  expect(nodes.find((n) => n.type === TripCoverPicker)!.props.selectedRaw).toBe("coast");
  (nodes.find((n) => n.type === SheetHeader)!.props.onRight as () => void)();
  await flush();
  expect(save).toHaveBeenCalledExactlyOnceWith(
    before,
    {
      name: "Unsaved name",
      destination: "Tokyo",
      startDate: "2027-01-01",
      endDate: "2027-01-02",
    },
    { before: "cultural-oldtown", after: "coast" },
    expect.any(String),
  );
});

it("metadata-only edits preserve an unsupported raw manual selection without cover intent", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const current = {
    ...trip,
    selectedCoverAssetId: null,
    selectedCoverAssetIdRaw: "future-cover",
  };
  let view = render(save, undefined, current);
  (view.find((n) => n.type === TripMetadataFields)!.props.onName as (s: string) => void)(
    "New name",
  );
  view = render(save, undefined, current);
  expect(view.find((n) => n.type === TripCoverPicker)!.props.trip).toEqual(
    expect.objectContaining({
      name: "New name",
      selectedCoverAssetIdRaw: "future-cover",
    }),
  );
  (view.find((n) => n.type === SheetHeader)!.props.onRight as () => void)();
  await flush();
  expect(save).toHaveBeenCalledWith(
    before,
    { ...before, name: "New name" },
    undefined,
    expect.any(String),
  );
});
it("explicit replacement of a future raw selection preserves its exact CAS identity", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const current = {
    ...trip,
    selectedCoverAssetId: null,
    selectedCoverAssetIdRaw: "future-cover",
  };
  let view = render(save, undefined, current);
  await (
    view.find((n) => n.type === TripCoverPicker)!.props.onSelect as (
      id: string,
    ) => Promise<void>
  )("wc-142191115");
  view = render(save, undefined, current);
  (view.find((n) => n.type === SheetHeader)!.props.onRight as () => void)();
  await flush();
  expect(save).toHaveBeenCalledWith(
    before,
    before,
    { before: "future-cover", after: "wc-142191115" },
    expect.any(String),
  );
});
it("does not turn an uncertified decoded null into an explicit cover save", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const view = render(save, undefined, { ...trip, selectedCoverAssetId: null });
  await expect(
    (
      view.find((n) => n.type === TripCoverPicker)!.props.onSelect as (
        id: string,
      ) => Promise<void>
    )("city"),
  ).rejects.toThrow("TRIP_COVER_STATE_UNAVAILABLE");
  expect(save).not.toHaveBeenCalled();
});

it("keeps explicit manual choice on rename/location while AUTO stays null and uses draft metadata", async () => {
  const autoTrip = { ...trip, selectedCoverAssetId: null, selectedCoverAssetIdRaw: null };
  let nodes = render(undefined, undefined, autoTrip);
  const fields = nodes.find((n) => n.type === TripMetadataFields)!.props;
  (fields.onName as (s: string) => void)("Tokyo city tour");
  (fields.onDestination as (s: string) => void)("Tokyo");
  nodes = render(undefined, undefined, autoTrip);
  expect(nodes.find((n) => n.type === TripCoverPicker)!.props).toMatchObject({
    selectedRaw: null,
    trip: { name: "Tokyo city tour", destination: "Tokyo" },
  });
  await (
    nodes.find((n) => n.type === TripCoverPicker)!.props.onSelect as (
      s: string,
    ) => Promise<void>
  )("city");
  nodes = render(undefined, undefined, autoTrip);
  (
    nodes.find((n) => n.type === TripMetadataFields)!.props.onDestination as (
      s: string,
    ) => void
  )("Iceland");
  nodes = render(undefined, undefined, autoTrip);
  expect(nodes.find((n) => n.type === TripCoverPicker)!.props).toMatchObject({
    selectedRaw: "city",
    trip: { destination: "Iceland" },
  });
});

it("retains a picked photo through the owning photo repository, stages only its stable ID and preserves it on draft rename", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const id = "00000000-0000-4000-8000-000000000002";
  vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file://picker/temporary" }],
  } as any);
  const add = vi
    .fn()
    .mockResolvedValue({ assetId: id, localUri: "file://retained/photo" });
  vi.mocked(readLocalTripPhotoRepository).mockResolvedValue({ addTripPhoto: add } as any);
  let view = render(save);
  expect(
    await (
      view.find((n) => n.type === TripCoverPicker)!.props
        .onChoosePhoto as () => Promise<boolean>
    )(),
  ).toBe(true);
  expect(add).toHaveBeenCalledExactlyOnceWith(trip.id, "file://picker/temporary");
  expect(save).not.toHaveBeenCalled();
  view = render(save);
  (view.find((n) => n.type === TripMetadataFields)!.props.onName as (s: string) => void)(
    "New draft name",
  );
  view = render(save);
  expect(view.find((n) => n.type === TripCoverPicker)!.props.selectedRaw).toBe(
    "photo-" + id,
  );
  (view.find((n) => n.type === SheetHeader)!.props.onRight as () => void)();
  await flush();
  expect(save.mock.calls[0][2]).toEqual({
    before: "cultural-oldtown",
    after: "photo-" + id,
  });
});
