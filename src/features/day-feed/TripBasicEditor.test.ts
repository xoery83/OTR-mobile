import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { lightPalette } from "@/ui/palette";
import { TripBasicEditor } from "./TripBasicEditor";
import { TripCoverPicker } from "./TripCoverPicker";
import { UiTextInput } from "@/ui/forms";

vi.mock("react-native", () => ({
  View: "View",
  StyleSheet: { create: (s: unknown) => s },
}));
vi.mock("@/ui/theme", () => ({
  useThemedStyles: (create: (colors: typeof lightPalette) => unknown) =>
    create(lightPalette),
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => {} }));
vi.mock("@/ui/locale", () => ({
  t: (key: string) => key,
  formatUiDate: () => "calendar-date",
}));
vi.mock("@/ui/forms", () => ({ UiTextInput: "UiTextInput" }));
vi.mock("@/ui/controls", () => ({ UiText: "UiText", UiSection: "UiSection" }));
vi.mock("./TripCoverPicker", () => ({ TripCoverPicker: "TripCoverPicker" }));
type Element = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
const elements = (node: ReactNode): Element[] => {
  if (!isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...Children.toArray(element.props.children).flatMap(elements)];
};
it("keeps unsupported metadata read-only while forwarding the legal cover update without another save path", async () => {
  const onSelectCover = vi.fn().mockResolvedValue(undefined);
  const nodes = elements(
    TripBasicEditor({
      trip: {
        name: "Nelson summer",
        destination: "Nelson",
        startDate: "2026-10-16",
        endDate: null,
        selectedCoverAssetId: "cultural-oldtown",
      },
      onSelectCover,
    }),
  );
  const fields = nodes.filter((node) => node.type === UiTextInput);
  expect(fields).toHaveLength(4);
  expect(fields.map((field) => field.props.value)).toEqual([
    "Nelson summer",
    "Nelson",
    "calendar-date",
    "tripCreate.notSet",
  ]);
  expect(
    fields.every((field) => field.props.editable === false && !field.props.onChangeText),
  ).toBe(true);
  const cover = nodes.find((node) => node.type === TripCoverPicker)!;
  expect(cover.props.selected).toBe("cultural-oldtown");
  await (cover.props.onSelect as (id: string) => Promise<void>)("coast");
  expect(onSelectCover).toHaveBeenCalledExactlyOnceWith("coast");
  expect(
    nodes.some((node) => node.props.children === "tripHome.editor.coverLocalOnly"),
  ).toBe(true);
});
