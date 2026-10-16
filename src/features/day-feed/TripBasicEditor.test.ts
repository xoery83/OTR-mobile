import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { lightPalette } from "@/ui/palette";
import { TripBasicEditor } from "./TripBasicEditor";
import { TripCoverPicker } from "./TripCoverPicker";
import { UiTextInput } from "@/ui/forms";
import { UiButton } from "@/ui/controls";
import { CalendarField } from "./TripCalendarField";
const state = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
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
vi.mock("./TripCalendarField", () => ({ CalendarField: "CalendarField" }));
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
  state.values = [];
  state.cursor = 0;
});
it("edits real metadata through one local owning callback and keeps cover on its independent writer", async () => {
  const save = vi.fn().mockResolvedValue(undefined),
    cover = vi.fn().mockResolvedValue(undefined);
  let nodes = render(save, cover);
  const name = nodes.find(
    (node) =>
      node.type === UiTextInput && node.props.accessibilityLabel === "tripCreate.name",
  )!;
  (name.props.onChangeText as (s: string) => void)("  Nelson updated  ");
  const date = nodes.find(
    (node) => node.type === CalendarField && node.props.label === "tripCreate.start",
  )!;
  (date.props.onChange as (s: string) => void)("");
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
    nodes.find((node) => node.type === UiTextInput)!.props.onChangeText as (
      s: string,
    ) => void
  )("Keep draft");
  nodes = render(save);
  (nodes.find((node) => node.type === UiButton)!.props.onPress as () => void)();
  await flush();
  nodes = render(save);
  expect(nodes.find((node) => node.type === UiTextInput)!.props.value).toBe("Keep draft");
  expect(nodes.some((node) => node.props.children === "tripCreate.saveFailed")).toBe(
    true,
  );
  const end = nodes.find(
    (node) => node.type === CalendarField && node.props.label === "tripCreate.end",
  )!;
  (end.props.onChange as (s: string) => void)("2026-10-15");
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
  expect(
    nodes
      .filter((node) => node.type === UiTextInput)
      .every((node) => node.props.editable === false),
  ).toBe(true);
  expect(
    nodes
      .filter((node) => node.type === CalendarField)
      .every((node) => node.props.disabled === true),
  ).toBe(true);
  expect(nodes.some((node) => node.type === UiButton)).toBe(false);
  expect(nodes.some((node) => node.type === TripCoverPicker)).toBe(true);
});
