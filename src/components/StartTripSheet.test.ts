import { createElement } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { StartTripSheet } from "./StartTripSheet";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server");
const state = vi.hoisted(() => ({ nodes: [] as any[], modal: null as any }));
vi.mock("react-native", () => ({
  Modal: (p: any) => {
    state.modal = p;
    return p.visible ? createElement("div", null, p.children) : null;
  },
  Pressable: (p: any) => {
    state.nodes.push(p);
    return createElement("button", null, p.children);
  },
  ScrollView: "section",
  View: "div",
  StyleSheet: { create: (value: unknown) => value, absoluteFill: {} },
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: "div",
  SafeAreaView: "div",
}));
vi.mock("./AppIcon", () => ({ AppIcon: () => null }));
vi.mock("./SheetHeader", () => ({
  SheetHeader: (p: any) => {
    state.nodes.push({ accessibilityLabel: p.leftLabel, onPress: p.onLeft });
    return createElement("h1", null, p.title);
  },
}));
vi.mock("@/ui/controls", () => ({ UiText: "span" }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => {} }));
vi.mock("@/ui/theme", () => ({
  useUiTheme: () => ({}),
  useThemedStyles: (make: any) => make({}),
}));
const props = { visible: true, onClose: vi.fn(), onImport: vi.fn(), onCreate: vi.fn() };
beforeEach(() => {
  state.nodes = [];
  vi.clearAllMocks();
});
it("shows the two restrained entry choices in a content-fit modal without selecting either", () => {
  const html = renderToStaticMarkup(createElement(StartTripSheet, props));
  expect(html).toContain("createTripV2.importHint");
  expect(html).toContain("createTripV2.manualHint");
  expect(state.modal).toMatchObject({
    transparent: true,
    presentationStyle: "overFullScreen",
  });
  expect(props.onCreate).not.toHaveBeenCalled();
  expect(props.onImport).not.toHaveBeenCalled();
  state.nodes.find((p) => p.accessibilityLabel === "actionIsland.importPlans").onPress();
  expect(props.onImport).toHaveBeenCalledOnce();
  state.nodes
    .find((p) => p.accessibilityLabel === "actionIsland.createManually")
    .onPress();
  expect(props.onCreate).toHaveBeenCalledOnce();
});
it("backdrop/native dismissal only cancels and creates no draft", () => {
  renderToStaticMarkup(createElement(StartTripSheet, props));
  state.modal.onRequestClose();
  state.nodes.find((p) => p.accessibilityLabel === "common.cancel").onPress();
  expect(props.onClose).toHaveBeenCalledTimes(2);
  expect(props.onCreate).not.toHaveBeenCalled();
  expect(props.onImport).not.toHaveBeenCalled();
});
