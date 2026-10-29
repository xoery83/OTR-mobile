import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { CreateTripV2Fields } from "./CreateTripV2Fields";
import type { LocalPersonNameSlot } from "@/domain/trip/localTripPerson";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
const state = vi.hoisted(() => ({
  hooks: [] as any[],
  cursor: 0,
  nodes: [] as any[],
  calendars: [] as any[],
  refs: [] as { current: any }[],
  refCursor: 0,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef: (initial: any) => (state.refs[state.refCursor++] ??= { current: initial }),
  useState: (initial: unknown) => {
    const i = state.cursor++;
    if (!(i in state.hooks)) state.hooks[i] = initial;
    return [
      state.hooks[i],
      (value: unknown) => {
        state.hooks[i] = typeof value === "function" ? value(state.hooks[i]) : value;
      },
    ];
  },
}));
vi.mock("react-native", () => ({
  Modal: (p: any) => (p.visible ? createElement("div", null, p.children) : null),
  Pressable: (p: any) => {
    state.nodes.push(p);
    return createElement("button", null, p.children);
  },
  ScrollView: "section",
  View: "div",
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaProvider: "div" }));
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
vi.mock("@/components/SheetHeader", () => ({
  SheetHeader: (p: any) => {
    state.nodes.push({ label: p.leftLabel, onPress: p.onLeft });
    if (p.onRight) state.nodes.push({ label: p.rightLabel, onPress: p.onRight });
    return null;
  },
}));
vi.mock("@/ui/controls", () => ({ UiText: "span" }));
vi.mock("@/ui/forms", () => ({
  UiTextInput: (p: any) => {
    state.nodes.push(p);
    return createElement("input", { value: p.value, readOnly: true });
  },
}));
vi.mock("@/ui/locale", () => ({
  t: (key: string, args?: Record<string, unknown>) =>
    key + (args ? ":" + Object.values(args).join(":") : ""),
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => {} }));
vi.mock("@/ui/theme", () => ({
  useUiTheme: () => ({}),
  useThemedStyles: (make: any) => make({}),
}));
vi.mock("./TripCalendarRangeField", () => ({
  TripCalendarRangeField: (p: any) => {
    state.calendars.push(p);
    return null;
  },
}));
const props = {
  name: "",
  onName: vi.fn(),
  destinationEntry: createElement("div", null, "destination-slot"),
  range: { start: "", end: "" },
  onRange: vi.fn(),
  selfNickname: "",
  knownSelfName: "",
  onSelfNickname: vi.fn(),
  travelers: [] as LocalPersonNameSlot[],
  onTravelers: vi.fn((value: LocalPersonNameSlot[]) => {
    props.travelers = value;
  }),
  disabled: false,
  onNameEditorOpenChange: undefined as undefined | ((open: boolean) => boolean | void),
  onCalendarOpenChange: undefined as undefined | ((open: boolean) => boolean | void),
};
function render() {
  state.cursor = state.refCursor = 0;
  state.nodes = [];
  state.calendars = [];
  return renderToStaticMarkup(createElement(CreateTripV2Fields, props));
}
const node = (key: string) =>
  state.nodes.find((p) => p.label === key || p.accessibilityLabel === key)!;
beforeEach(() => {
  state.hooks = [];
  state.refs = [];
  props.onNameEditorOpenChange = props.onCalendarOpenChange = undefined;
  props.name = "";
  props.selfNickname = "";
  props.knownSelfName = "";
  props.travelers = [];
  props.disabled = false;
  vi.clearAllMocks();
});
it("defaults only to You/Add your name and uses exactly one existing range calendar", () => {
  const html = render();
  expect(html).toContain("createTripV2.addYourName");
  expect(html).toContain("destination-slot");
  expect(state.calendars).toHaveLength(1);
  expect(state.nodes.some((p) => p.accessibilityLabel === "tripForm.travelerCount")).toBe(
    false,
  );
  expect(props.onTravelers).not.toHaveBeenCalled();
});
it("nickname editing is distinct from additional people and Cancel preserves the original", () => {
  render();
  node("createTripV2.editName").onPress();
  render();
  node("createTripV2.nickname").onChangeText("My nickname");
  render();
  node("common.cancel").onPress();
  expect(props.onSelfNickname).not.toHaveBeenCalled();
  render();
  node("createTripV2.editName").onPress();
  render();
  node("createTripV2.nickname").onChangeText("Known AKA");
  render();
  node("common.done").onPress();
  expect(props.onSelfNickname).toHaveBeenCalledWith("Known AKA");
  expect(props.onTravelers).not.toHaveBeenCalled();
});
it("adds, edits and removes an additional local name without regenerating its stable intent IDs", () => {
  render();
  node("createTripV2.addTraveler").onPress();
  render();
  node("createTripV2.nickname").onChangeText("Tina");
  render();
  node("common.done").onPress();
  const before = props.travelers[0];
  expect(before.displayName).toBe("Tina");
  render();
  node("createTripV2.editTraveler").onPress();
  render();
  node("createTripV2.nickname").onChangeText("Tina QA");
  render();
  node("common.done").onPress();
  expect(props.travelers[0]).toEqual({ ...before, displayName: "Tina QA" });
  render();
  node("createTripV2.removeTraveler:Tina QA").onPress();
  expect(props.travelers).toEqual([]);
});
it("canceling Add traveler creates no slot and entering an empty name never invents one", () => {
  render();
  node("createTripV2.addTraveler").onPress();
  render();
  node("common.cancel").onPress();
  expect(props.onTravelers).not.toHaveBeenCalled();
  render();
  node("createTripV2.addTraveler").onPress();
  render();
  node("common.done").onPress();
  expect(props.travelers[0].displayName).toBe("");
});

it("shows an existing known name without inventing a nickname edit or second traveler", () => {
  props.knownSelfName = "Alex";
  expect(render()).toContain("createTripV2.youName:Alex");
  expect(props.onSelfNickname).not.toHaveBeenCalled();
  expect(props.onTravelers).not.toHaveBeenCalled();
});

it("blocks opening during handoff and never reopens a cancelled name editor from a late input", () => {
  const onOpen = vi.fn(() => false as boolean | void);
  props.onNameEditorOpenChange = onOpen;
  render();
  node("createTripV2.editName").onPress();
  render();
  expect(
    state.nodes.some((value) => value.accessibilityLabel === "createTripV2.nickname"),
  ).toBe(false);
  onOpen.mockReturnValue(undefined);
  node("createTripV2.editName").onPress();
  render();
  const lateInput = node("createTripV2.nickname").onChangeText;
  node("common.cancel").onPress();
  onOpen.mockClear();
  lateInput("must not reopen");
  render();
  expect(
    state.nodes.some((value) => value.accessibilityLabel === "createTripV2.nickname"),
  ).toBe(false);
  expect(onOpen).not.toHaveBeenCalled();
  expect(props.onSelfNickname).not.toHaveBeenCalled();
});

it("Done retains the last typed self or traveler name before React renders", () => {
  render();
  node("createTripV2.editName").onPress();
  render();
  node("createTripV2.nickname").onChangeText("最后输入的昵称");
  node("common.done").onPress();
  expect(props.onSelfNickname).toHaveBeenLastCalledWith("最后输入的昵称");
  render();
  node("createTripV2.addTraveler").onPress();
  render();
  node("createTripV2.nickname").onChangeText("最后输入的同行人");
  node("common.done").onPress();
  expect(props.travelers).toMatchObject([{ displayName: "最后输入的同行人" }]);
});
