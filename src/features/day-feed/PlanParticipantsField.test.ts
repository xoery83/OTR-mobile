import { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { PlanParticipantsField, PlanParticipantsPicker } from "./PlanParticipantsField";
import { canApplyParticipation, createParticipantPickerHandoff } from "./participantPickerHandoff";
import { lightPalette } from "@/ui/palette";
const state = vi.hoisted(() => ({ values: [] as any[], cursor: 0 }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useContext: () => null,
  useRef: (initial: unknown) => ({ current: initial }),
  useLayoutEffect: (effect: () => void) => { effect(); },
  useState: (initial: any) => {
    const i = state.cursor++;
    if (!(i in state.values)) state.values[i] = typeof initial === "function" ? initial() : initial;
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
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => {} }));
vi.mock("@/data/auth/accountGeneration", () => ({ getAccountGeneration: () => 1 }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/theme", () => ({
  useUiTheme: () => lightPalette,
  useThemedStyles: (fn: any) => fn(lightPalette),
}));
type Element = ReactElement<any>;
function nodes(v: ReactNode): Element[] {
  if (!isValidElement(v)) return [];
  const element = v as Element;
  if (element.type === PlanParticipantsPicker) return nodes(PlanParticipantsPicker(element.props));
  if (element.type === Fragment) return Children.toArray(element.props.children).flatMap(nodes);
  return [element, ...Children.toArray(element.props.children).flatMap(nodes)];
}
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
  const tree = nodes(PlanParticipantsField({ ...props(), disabled }));
  state.values.length = state.cursor;
  return tree;
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
  render(); // Unmount the cancelled picker before reopening.
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

it("labels only the existing unnamed current Actor as You without changing Person identity", () => {
  const renderField = () => {
    state.cursor = 0;
    return nodes(PlanParticipantsField({
      ...props(),
      options: [{ personId: "existing-self", displayName: "", isCurrentActor: true }],
    }));
  };
  renderField().find(n => n.type === "UiFormRow")!.props.onPress();
  const tree = renderField();
  const row = tree.find((n) => n.props.accessibilityRole === "checkbox")!;
  expect(row.props.accessibilityLabel).toBe("common.you");
  tree.find((n) => n.type === "SheetHeader")!.props.onRight();
  expect(change).toHaveBeenCalledWith({
    mode: "WHOLE_GROUP",
    people: [],
    selfPersonId: null,
  });
});


it("scopes the handoff to one live editor invocation and releases on Back", () => {
  const handoff = createParticipantPickerHandoff();
  let current: ReturnType<typeof props> | null = props();
  const id = handoff.stage(() => current);
  expect(id).toBeDefined();
  expect(handoff.stage(props)).toBeUndefined();
  expect(handoff.read("stale")).toBeUndefined();
  expect(handoff.read(id)).toBe(current);
  current = null;
  expect(handoff.read(id)).toBeNull();
  handoff.release(id);
  const next = handoff.stage(props);
  expect(next).not.toBe(id);
  handoff.release(id);
  expect(handoff.read(next)).toBeDefined();
});

it("checks the current roster and disabled status before applying Done", () => {
  const draft = { mode: "SELECTED_MEMBERS" as const, people: ["a"], selfPersonId: null };
  const current = props();
  expect(canApplyParticipation(current, draft)).toBe(true);
  expect(canApplyParticipation({ ...current, disabled: true }, draft)).toBe(false);
  expect(canApplyParticipation({ ...current, options: current.options.slice(1) }, draft)).toBe(false);
});
