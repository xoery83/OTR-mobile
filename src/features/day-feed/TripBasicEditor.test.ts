import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { lightPalette } from "@/ui/palette";
import { TripBasicEditor } from "./TripBasicEditor";
import { TripCoverPicker } from "./TripCoverPicker";
import { TripCurrencyRow } from "./TripSetupRows";
import { TripMetadataFields } from "./TripMetadataFields";
import { UiButton } from "@/ui/controls";

const state = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, alert: vi.fn() }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
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
vi.mock("react-native", () => ({
  Alert: { alert: (...args: any[]) => state.alert(...args) },
  View: "View",
  StyleSheet: { create: (s: unknown) => s },
}));
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
vi.mock("./TripCoverPicker", () => ({ TripCoverPicker: "TripCoverPicker" }));
vi.mock("./TripMetadataFields", () => ({ TripMetadataFields: "TripMetadataFields" }));
vi.mock("./TripSetupRows", () => ({ TripCurrencyRow: "TripCurrencyRow" }));
vi.mock("./TripCoverVisual", () => ({ TripCoverVisual: "TripCoverVisual" }));
type Element = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
const elements = (node: ReactNode): Element[] => {
  if (!isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...Children.toArray(element.props.children).flatMap(elements)];
};
const trip = {
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
) => {
  state.cursor = 0;
  return elements(
    TripBasicEditor({ trip, metadataEditable: true, onSaveMetadata, onSelectCover }),
  );
};
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
beforeEach(() => {
  state.alert.mockReset();
  state.values = [];
  state.cursor = 0;
});
it("edits real metadata through one local owning callback and keeps cover on its independent writer", async () => {
  const save = vi.fn().mockResolvedValue(undefined),
    cover = vi.fn().mockResolvedValue(undefined);
  let nodes = render(save, cover);
  const fields = nodes.find((node) => node.type === TripMetadataFields)!;
  (fields.props.onName as (s: string) => void)("  Nelson updated  ");
  (fields.props.onRange as (r: { start: string; end: string }) => void)({
    start: "",
    end: "",
  });
  nodes = render(save, cover);
  (nodes.find((node) => node.type === UiButton)!.props.onPress as () => void)();
  await flush();
  expect(save).toHaveBeenCalledExactlyOnceWith(before, {
    ...before,
    name: "Nelson updated",
    startDate: null,
  });
  const picker = nodes.find((node) => node.type === TripCoverPicker)!;
  expect(picker.props.selected).toBe("cultural-oldtown");
  await (picker.props.onSelect as (s: string) => Promise<void>)("coast");
  expect(cover).toHaveBeenCalledExactlyOnceWith("coast");
  expect(
    render(save, cover).some(
      (node) => node.props.children === "actionIsland.savedLocally",
    ),
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
  (nodes.find((node) => node.type === UiButton)!.props.onPress as () => void)();
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
  expect(render(save).find((node) => node.type === UiButton)!.props.disabled).toBe(true);
});

it("withholds metadata edits without local creator provenance while retaining the independent cover choice", () => {
  state.cursor = 0;
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
  expect(nodes.some((node) => node.type === UiButton)).toBe(false);
  expect(nodes.some((node) => node.type === TripCoverPicker)).toBe(true);
});

it("retains a dirty editor when Currency is opened unless the user explicitly discards", () => {
  const open = vi.fn();
  const renderEditor = () => {
    state.cursor = 0;
    return elements(
      TripBasicEditor({
        trip,
        metadataEditable: true,
        onSaveMetadata: vi.fn(),
        onSelectCover: vi.fn(),
        onOpenCurrency: open,
      }),
    );
  };
  let nodes = renderEditor();
  (nodes.find((n) => n.type === TripCurrencyRow)!.props.onOpen as () => void)();
  expect(open).toHaveBeenCalledOnce();
  open.mockClear();
  (nodes.find((n) => n.type === TripMetadataFields)!.props.onName as (s: string) => void)(
    "Unsaved name",
  );
  nodes = renderEditor();
  (nodes.find((n) => n.type === TripCurrencyRow)!.props.onOpen as () => void)();
  expect(open).not.toHaveBeenCalled();
  const actions = state.alert.mock.calls[0][2];
  expect(actions[0].style).toBe("cancel");
  expect(renderEditor().find((n) => n.type === TripMetadataFields)!.props.name).toBe(
    "Unsaved name",
  );
  actions[1].onPress();
  expect(open).toHaveBeenCalledOnce();
});
