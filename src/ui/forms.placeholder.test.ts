import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { UiFormRow } from "./forms";
import { UiTextInput } from "./textInput";
import { lightPalette, darkPalette, type UiColors } from "./palette";
const theme = vi.hoisted(() => ({ colors: {} as UiColors }));
vi.mock("react-native", () => ({
  View: "View", Text: "Text", Pressable: "Pressable", TextInput: "TextInput",
  StyleSheet: { create: (s: unknown) => s },
  useWindowDimensions: () => ({ fontScale: 1 }),
}));
vi.mock("@react-native-community/datetimepicker", () => ({ default: "DateTimePicker" }));
vi.mock("./theme", () => ({
  useUiTheme: () => theme.colors, useUiAppearance: () => "light",
  useThemedStyles: (make: (colors: UiColors) => unknown) => make(theme.colors),
}));
const nodes = (node: ReactNode): ReactElement<any>[] => isValidElement(node)
  ? [node as ReactElement<any>, ...Children.toArray((node as ReactElement<any>).props.children).flatMap(nodes)] : [];
const flatten = (value: any): any => Array.isArray(value)
  ? Object.assign({}, ...value.filter(Boolean).map(flatten)) : value ?? {};
it.each([lightPalette, darkPalette])("matches an empty date field to the canonical text-input placeholder, keeping real values primary", (colors) => {
  theme.colors = colors;
  const input = UiTextInput({ placeholder: "Add a destination", value: "" });
  const empty = nodes(UiFormRow({ variant: "field", label: "Dates", value: "Dates to be decided", placeholder: true, onPress() {} }));
  const filled = nodes(UiFormRow({ variant: "field", label: "Dates", value: "Nov 4–8", onPress() {} }));
  const emptyText = flatten(empty.find((n) => n.type === "Text" && n.props.children === "Dates to be decided")!.props.style);
  const filledText = flatten(filled.find((n) => n.type === "Text" && n.props.children === "Nov 4–8")!.props.style);
  const inputStyle = flatten(input.props.style);
  expect(emptyText.color).toBe(input.props.placeholderTextColor);
  expect(filledText.color).toBe(colors.textPrimary);
  expect(emptyText.fontSize).toBe(inputStyle.fontSize);
  expect(emptyText.fontWeight).toBe(inputStyle.fontWeight);
  expect(flatten(empty.find((n) => n.type === "Pressable")!.props.style).paddingHorizontal).toBe(inputStyle.paddingHorizontal);
});
