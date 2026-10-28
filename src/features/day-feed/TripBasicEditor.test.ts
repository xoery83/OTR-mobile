import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import * as ImagePicker from "expo-image-picker";
import { readLocalTripPhotoRepository } from "@/data/repositories/tripPhotoRepository";
import { Modal } from "react-native";
import { CurrencySettingsScreen } from "@/features/ledger/CurrencySettingsScreen";
import { lightPalette } from "@/ui/palette";
import { CreateTripDestinations } from "./CreateTripDestinations";
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
  useCallback: (callback: unknown) => callback,
  useRef: (initial: any) => (state.refs[state.refCursor++] ??= { current: initial }),
  useEffect: (effect: () => void) => effect(),
  useLayoutEffect: (effect: () => void) => effect(),
  useState: (initial: unknown) => {
    const i = state.cursor++;
    if (!(i in state.values))
      state.values[i] = typeof initial === "function" ? initial() : initial;
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
vi.mock("./CreateTripDestinations", () => ({
  CreateTripDestinations: "CreateTripDestinations",
}));
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
  capabilities: Pick<
    Parameters<typeof TripBasicEditor>[0],
    "currencyAvailable" | "coverAvailable"
  > = {},
) => {
  state.cursor = state.refCursor = 0;
  return elements(
    TripBasicEditor({
      ...capabilities,
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
  vi.mocked(ImagePicker.launchImageLibraryAsync).mockClear();
  vi.mocked(readLocalTripPhotoRepository).mockClear();
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
  destinationField(nodes).props.onChange([
    { localId: "00000000-0000-4000-8000-000000000012", text: "Tokyo", source: "MANUAL" },
  ]);
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
    range: { start: "2027-01-01", end: "2027-01-02" },
  });
  expect(destinationField(nodes).props.items).toMatchObject([
    { text: "Tokyo", source: "MANUAL" },
  ]);
  expect(nodes.find((n) => n.type === TripCoverPicker)!.props.selectedRaw).toBe("coast");
  (nodes.find((n) => n.type === SheetHeader)!.props.onRight as () => void)();
  await flush();
  expect(save).toHaveBeenCalledExactlyOnceWith(
    before,
    {
      name: "Unsaved name",
      destination: null,
      startDate: "2027-01-01",
      endDate: "2027-01-02",
    },
    { before: "cultural-oldtown", after: "coast" },
    expect.any(String),
    expect.objectContaining({
      before: [],
      after: [
        {
          destinationId: "00000000-0000-4000-8000-000000000012",
          displayLabel: "Tokyo",
          source: "MANUAL",
        },
      ],
    }),
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
  destinationField(nodes).props.onChange([
    { localId: "00000000-0000-4000-8000-000000000012", text: "Tokyo", source: "MANUAL" },
  ]);
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
  destinationField(nodes).props.onChange([
    {
      localId: "00000000-0000-4000-8000-000000000012",
      text: "Iceland",
      source: "MANUAL",
    },
  ]);
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
  const processing = vi.fn(async () => {
    expect(add).not.toHaveBeenCalled();
  });
  let view = render(save);
  expect(
    await (
      view.find((n) => n.type === TripCoverPicker)!.props.onChoosePhoto as (
        processing: () => Promise<void>,
      ) => Promise<boolean>
    )(processing),
  ).toBe(true);
  expect(processing).toHaveBeenCalledOnce();
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

it("keeps an AUTO switch change draft-only until the Editor owning Save", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const current = {
    ...trip,
    selectedCoverAssetId: null,
    selectedCoverAssetIdRaw: "photo-00000000-0000-4000-8000-000000000002",
  };
  let view = render(save, undefined, current);
  await (
    view.find((n) => n.type === TripCoverPicker)!.props.onSelect as (
      id: null,
    ) => Promise<void>
  )(null);
  expect(save).not.toHaveBeenCalled();
  view = render(save, undefined, current);
  expect(view.find((n) => n.type === TripCoverPicker)!.props.selectedRaw).toBeNull();
  (view.find((n) => n.type === SheetHeader)!.props.onRight as () => void)();
  await flush();
  expect(save).toHaveBeenCalledWith(
    before,
    before,
    { before: current.selectedCoverAssetIdRaw, after: null },
    expect.any(String),
  );
});

const destinationField = (view: Element[]) =>
  view.find((n) => n.type === TripMetadataFields)!.props.destinationEntry as ReactElement<
    Record<string, any>
  >;
it("hydrates structured Tags without dirtying and keeps the area search pinned to the persisted Trip", () => {
  const structured = {
    ...trip,
    destination: null,
    destinations: [
      {
        destinationId: "00000000-0000-4000-8000-000000000011",
        source: "APPLE_PLACE_ID" as const,
        provider: "apple" as const,
        providerPlaceId: "real.apple",
        displayLabel: "Sydney, Australia",
        ordinal: 0,
      },
    ],
  };
  const view = render(undefined, undefined, structured);
  expect(view.find((n) => n.type === SheetHeader)!.props.rightDisabled).toBe(true);
  const entry = destinationField(view);
  expect(entry.type).toBe(CreateTripDestinations);
  expect(entry.props.tripId).toBe(trip.id);
  expect(entry.props.draftId).toBeUndefined();
  expect(entry.props.items).toMatchObject([
    {
      localId: structured.destinations[0].destinationId,
      source: "APPLE",
      text: "Sydney, Australia",
      match: { providerPlaceId: "real.apple" },
    },
  ]);
});
it("legacy scalar seed remains clean on open and name-only Save does not migrate it", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  let view = render(save);
  expect(view.find((n) => n.type === SheetHeader)!.props.rightDisabled).toBe(true);
  expect(destinationField(view).props.items).toMatchObject([
    { text: "Nelson", source: "MANUAL" },
  ]);
  (view.find((n) => n.type === TripMetadataFields)!.props.onName as (s: string) => void)(
    "Renamed",
  );
  view = render(save);
  (view.find((n) => n.type === SheetHeader)!.props.onRight as () => void)();
  await flush();
  expect(save).toHaveBeenCalledExactlyOnceWith(
    before,
    { ...before, name: "Renamed" },
    undefined,
    expect.any(String),
  );
});
it("explicit Tags changes stage one atomic Save, clear legacy scalar and retain the retry identity", async () => {
  const save = vi.fn().mockRejectedValue(new Error("disk"));
  let view = render(save);
  const entry = destinationField(view);
  entry.props.onChange([
    ...entry.props.items,
    { localId: "00000000-0000-4000-8000-000000000012", text: "Tokyo", source: "MANUAL" },
  ]);
  expect(save).not.toHaveBeenCalled();
  view = render(save);
  (view.find((n) => n.type === SheetHeader)!.props.onRight as () => void)();
  await flush();
  expect(save.mock.calls[0][1].destination).toBeNull();
  expect(save.mock.calls[0][4]).toMatchObject({
    operationId: expect.any(String),
    before: [],
    after: [
      { displayLabel: "Nelson", source: "MANUAL" },
      { displayLabel: "Tokyo", source: "MANUAL" },
    ],
  });
  view = render(save);
  (view.find((n) => n.type === SheetHeader)!.props.onRight as () => void)();
  await flush();
  expect(save.mock.calls[1]).toEqual(save.mock.calls[0]);
  expect(destinationField(render(save)).props.items).toHaveLength(2);
});
it("pending resolution blocks Save and changing Name never replaces selected Tags", () => {
  let view = render();
  const original = destinationField(view).props.items;
  destinationField(view).props.onBusy(true);
  (view.find((n) => n.type === TripMetadataFields)!.props.onName as (s: string) => void)(
    "Iceland",
  );
  view = render();
  expect(view.find((n) => n.type === SheetHeader)!.props.rightDisabled).toBe(true);
  expect(destinationField(view).props.items).toEqual(original);
});

it("automatic cover preview replaces old structured destinations with draft Tags, including explicit empty removal", () => {
  const original = {
    ...trip,
    destination: null,
    selectedCoverAssetId: null,
    selectedCoverAssetIdRaw: null,
    destinations: [
      {
        destinationId: "00000000-0000-4000-8000-000000000011",
        displayLabel: "Sydney",
        source: "MANUAL" as const,
        ordinal: 0,
      },
    ],
  };
  let view = render(undefined, undefined, original);
  destinationField(view).props.onChange([
    { localId: "00000000-0000-4000-8000-000000000012", text: "Tokyo", source: "MANUAL" },
  ]);
  view = render(undefined, undefined, original);
  expect(view.find((n) => n.type === TripCoverPicker)!.props.trip).toMatchObject({
    destination: "Tokyo",
    destinations: [{ displayLabel: "Tokyo" }],
  });
  expect(view.find((n) => n.type === TripCoverPicker)!.props.selectedRaw).toBeNull();
  destinationField(view).props.onChange([]);
  view = render(undefined, undefined, original);
  expect(view.find((n) => n.type === TripCoverPicker)!.props.trip).toMatchObject({
    destination: null,
    destinations: [],
  });
  expect(original.destinations[0].displayLabel).toBe("Sydney");
});
it("unselected query guards Cancel and native dismissal without enabling Save or persisting search text", () => {
  const save = vi.fn(),
    close = vi.fn(),
    register = vi.fn(),
    dirtyChange = vi.fn();
  const renderEditor = () => {
    state.cursor = state.refCursor = 0;
    return elements(
      TripBasicEditor({
        trip,
        metadataEditable: true,
        onSaveMetadata: save,
        onSelectCover: vi.fn(),
        onClose: close,
        registerDismiss: register,
        onDirtyChange: dirtyChange,
      }),
    );
  };
  let view = renderEditor();
  destinationField(view).props.onQueryDirty(true);
  view = renderEditor();
  expect(view.find((n) => n.type === SheetHeader)!.props.rightDisabled).toBe(true);
  expect(dirtyChange).toHaveBeenLastCalledWith(true);
  (view.find((n) => n.type === SheetHeader)!.props.onLeft as () => void)();
  expect(close).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
  expect(state.alert).toHaveBeenCalledWith(
    "actionIsland.unsavedTitle",
    "actionIsland.unsavedHint",
    expect.any(Array),
  );
  register.mock.lastCall![0]();
  expect(close).not.toHaveBeenCalled();
  state.alert.mock.lastCall![2][1].onPress();
  expect(close).toHaveBeenCalledOnce();
  expect(save).not.toHaveBeenCalled();
});
it("clean query cancellation closes directly while clearing a pending query removes only its discard guard", () => {
  const close = vi.fn(),
    save = vi.fn();
  const renderEditor = () => {
    state.cursor = state.refCursor = 0;
    return elements(
      TripBasicEditor({
        trip,
        metadataEditable: true,
        onSaveMetadata: save,
        onSelectCover: vi.fn(),
        onClose: close,
      }),
    );
  };
  let view = renderEditor();
  destinationField(view).props.onQueryDirty(true);
  view = renderEditor();
  destinationField(view).props.onQueryDirty(false);
  view = renderEditor();
  (view.find((n) => n.type === SheetHeader)!.props.onLeft as () => void)();
  expect(close).toHaveBeenCalledOnce();
  expect(state.alert).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});

it("Guest metadata editing has no photo callback or Account currency navigation while local name editing stays available", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const view = render(save, vi.fn(), trip, {
    currencyAvailable: false,
    coverAvailable: false,
  });
  expect(view.find((node) => node.type === TripCoverPicker)).toBeUndefined();
  expect(
    view.find((node) => node.type === TripCurrencyRow)?.props.onOpen,
  ).toBeUndefined();
  expect(view.find((node) => node.type === CurrencySettingsScreen)).toBeUndefined();
  const fields = view.find((node) => node.type === TripMetadataFields)!;
  (fields.props.onName as (name: string) => void)("Guest edited name");
  const edited = render(save, vi.fn(), trip, {
    currencyAvailable: false,
    coverAvailable: false,
  });
  (edited.find((node) => node.type === SheetHeader)!.props.onRight as () => void)();
  await flush();
  expect(save).toHaveBeenCalledWith(
    before,
    { ...before, name: "Guest edited name" },
    undefined,
    expect.any(String),
  );
  expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  expect(readLocalTripPhotoRepository).not.toHaveBeenCalled();
});
