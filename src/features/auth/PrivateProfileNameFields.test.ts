import { beforeEach, expect, it, vi } from "vitest";
import {
  PrivateProfileNameFields,
  type PrivateProfileNameDraft,
} from "./PrivateProfileNameFields";

const state = vi.hoisted(() => ({ generation: 4, ref: undefined as any }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useSyncExternalStore: (_subscribe: unknown, get: () => number) => get(),
  useRef: (value: unknown) => (state.ref ??= { current: value }),
  useLayoutEffect: (effect: () => void) => effect(),
}));
vi.mock("react-native", () => ({
  View: "View",
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => state.generation,
  subscribeAccountGeneration: vi.fn(),
}));
vi.mock("@/ui/controls", () => ({ UiText: "Text" }));
vi.mock("@/ui/forms", () => ({ UiTextInput: "Input", UiChoiceChip: "Choice" }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: vi.fn() }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));

const nodes = (value: any): any[] =>
  Array.isArray(value)
    ? value.flatMap(nodes)
    : value?.props
      ? [value, ...nodes(value.props.children)]
      : [];
let draft: PrivateProfileNameDraft;
const changed = vi.fn((value: PrivateProfileNameDraft) => {
  draft = value;
});
const render = (disabled = false) =>
  nodes(
    PrivateProfileNameFields({
      scope: { accountId: "fixture-account", generation: 4 },
      draft,
      disabled,
      onChange: changed,
    }),
  );
const input = (key: string) =>
  render().find((node) => node.props.testID === `private-profile-${key}`).props;
const mode = (value: "splitName" | "unsplitName") =>
  render().find((node) => node.props.label === `privateProfile.${value}`).props;
beforeEach(() => {
  state.generation = 4;
  state.ref = undefined;
  changed.mockClear();
  draft = {
    displayName: "",
    mode: "SPLIT",
    familyName: "",
    givenNames: "",
    fullName: "",
  };
});

it("accepts empty optional names and preserves Unicode independently", () => {
  expect(input("displayName").value).toBe("");
  input("familyName").onChangeText("  林 e\u0301  ");
  input("givenNames").onChangeText("海 🐈");
  expect(draft.familyName).toBe("  林 e\u0301  ");
  expect(draft.givenNames).toBe("海 🐈");
  expect(draft.displayName).toBe("");
});

it("retains both drafts across name-format changes without parsing or concatenation", () => {
  input("familyName").onChangeText("林");
  input("givenNames").onChangeText("海");
  mode("unsplitName").onPress();
  input("fullName").onChangeText("ชื่อเดิม");
  mode("splitName").onPress();
  expect(input("familyName").value).toBe("林");
  expect(input("givenNames").value).toBe("海");
  mode("unsplitName").onPress();
  expect(input("fullName").value).toBe("ชื่อเดิม");
  expect(draft.displayName).toBe("");
});

it("retains two field events arriving before the next render", () => {
  const tree = render();
  const family = tree.find((node) => node.props.testID === "private-profile-familyName");
  const given = tree.find((node) => node.props.testID === "private-profile-givenNames");
  family.props.onChangeText("林");
  given.props.onChangeText("海");
  expect(draft.familyName).toBe("林");
  expect(draft.givenNames).toBe("海");
});

it("blocks retained enabled callbacks after a busy render", () => {
  const oldInput = input("displayName");
  const oldMode = mode("unsplitName");
  render(true);
  oldInput.onChangeText("late name");
  oldMode.onPress();
  expect(changed).not.toHaveBeenCalled();
});

it("hides all private values and rejects retained callbacks when Account changes", () => {
  const oldInput = input("displayName");
  const oldMode = mode("unsplitName");
  state.generation += 1;
  expect(render()).toEqual([]);
  oldInput.onChangeText("late private name");
  oldMode.onPress();
  expect(changed).not.toHaveBeenCalled();
});

it("makes a busy form read-only without leaving interactive format choices", () => {
  const tree = render(true);
  const inputs = tree.filter((node) => node.type === "Input");
  expect(inputs).toHaveLength(3);
  expect(tree.some((node) => node.type === "Choice")).toBe(false);
  for (const node of inputs) {
    expect(node.props.editable).toBe(false);
    node.props.onChangeText("unexpected edit");
  }
  expect(changed).not.toHaveBeenCalled();
});
