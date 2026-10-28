import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { PlanParticipantsField } from "./PlanParticipantsField";
import { lightPalette } from "@/ui/palette";
const state = vi.hoisted(() => ({ values: [] as any[], cursor: 0 }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: any) => {
    const i = state.cursor++;
    if (!(i in state.values)) state.values[i] = initial;
    return [
      state.values[i],
      (v: any) => {
        state.values[i] = typeof v === "function" ? v(state.values[i]) : v;
      },
    ];
  },
}));
vi.mock("react-native", () => ({
  View: "View",
  Modal: "Modal",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: (v: any) => v },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("@/components/AppIcon", () => ({ AppIcon: "AppIcon" }));
vi.mock("@/components/SheetHeader", () => ({ SheetHeader: "SheetHeader" }));
vi.mock("@/ui/controls", () => ({ UiText: "UiText" }));
vi.mock("@/ui/forms", () => ({
  UiChoiceChip: "UiChoiceChip",
  UiFormRow: "UiFormRow",
  UiTextInput: "UiTextInput",
}));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/theme", () => ({
  useUiTheme: () => lightPalette,
  useThemedStyles: (fn: any) => fn(lightPalette),
}));
type Element = ReactElement<any>;
const nodes = (v: ReactNode): Element[] =>
  isValidElement(v)
    ? [v as Element, ...Children.toArray((v as Element).props.children).flatMap(nodes)]
    : [];
const change = vi.fn();
const props = () => ({
  value: { mode: "WHOLE_GROUP" as const, people: [], selfPersonId: null },
  options: [
    { personId: "a", displayName: "Alice" },
    { personId: "b", displayName: "Bob" },
  ],
  disabled: false,
  onChange: change,
});
const render = (disabled = false) => {
  state.cursor = 0;
  return nodes(PlanParticipantsField({ ...props(), disabled }));
};
const find = (type: string, disabled = false) =>
  render(disabled).find((n) => n.type === type)!.props;
beforeEach(() => {
  state.values = [];
  state.cursor = 0;
  change.mockReset();
});
it("opens from persisted value, stages deselection and applies only on Done", () => {
  find("UiFormRow").onPress();
  render()
    .find((n) => n.props.accessibilityLabel === "Bob")!
    .props.onPress();
  expect(change).not.toHaveBeenCalled();
  find("SheetHeader").onRight();
  expect(change).toHaveBeenCalledExactlyOnceWith({
    mode: "SELECTED_MEMBERS",
    people: ["a"],
    selfPersonId: null,
  });
});
it("Cancel discards staged changes and reopening restores persisted selection", () => {
  find("UiFormRow").onPress();
  render()
    .find((n) => n.props.accessibilityLabel === "Bob")!
    .props.onPress();
  find("SheetHeader").onLeft();
  expect(change).not.toHaveBeenCalled();
  find("UiFormRow").onPress();
  expect(
    render().find((n) => n.props.accessibilityLabel === "Bob")!.props.accessibilityState
      .checked,
  ).toBe(true);
});
it("disables application while parent is busy and prevents empty Done", () => {
  find("UiFormRow").onPress();
  for (const name of ["Alice", "Bob"])
    render()
      .find((n) => n.props.accessibilityLabel === name)!
      .props.onPress();
  expect(find("SheetHeader").rightDisabled).toBe(true);
  expect(find("SheetHeader", true).rightDisabled).toBe(true);
  find("SheetHeader", true).onRight();
  expect(change).not.toHaveBeenCalled();
});
