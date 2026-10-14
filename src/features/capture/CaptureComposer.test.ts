import { createElement } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { CaptureComposer } from "./CaptureComposer";
import { t, setUiLocale } from "@/ui/locale";
import { uiPalette } from "@/ui/palette";
import type { CaptureDraftSnapshot } from "./captureStaging";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server");
const state = vi.hoisted(() => ({
  tab: "capture",
  buttons: [] as any[],
  nodes: [] as any[],
  confirm: vi.fn(),
  scheme: "light" as "light" | "dark",
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: () => [
    state.tab,
    (value: string) => {
      state.tab = value;
    },
  ],
}));
vi.mock("react-native", () => {
  const primitive = (props: any) => {
    state.nodes.push(props);
    return createElement("div", {}, props.children);
  };
  return {
    View: primitive,
    ScrollView: primitive,
    Image: primitive,
    Modal: primitive,
    KeyboardAvoidingView: primitive,
    Platform: { OS: "ios" },
    Alert: { alert: state.confirm },
    StyleSheet: { create: (v: any) => v, hairlineWidth: 1 },
    useWindowDimensions: () => ({ height: 874, width: 402, fontScale: 2.143 }),
  };
});
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: (props: any) => {
    state.nodes.push(props);
    return createElement("div", {}, props.children);
  },
  useSafeAreaInsets: () => ({ top: 62, bottom: 34 }),
}));
vi.mock("@/ui/theme", () => ({
  useThemedStyles: (create: any) => create(uiPalette(state.scheme)),
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/controls", () => ({
  UiText: (props: any) => createElement("span", {}, props.children),
  UiButton: (props: any) => {
    state.buttons.push(props);
    return createElement("button", {}, props.label);
  },
}));
vi.mock("@/ui/forms", () => ({
  UiChoiceChip: (props: any) => {
    state.buttons.push(props);
    return createElement("button", {}, props.label);
  },
  UiTextInput: (props: any) => {
    state.nodes.push(props);
    return createElement("input");
  },
}));
vi.mock("@/components/OverlayDismissAction", () => ({
  OverlayDismissAction: (props: any) => {
    state.buttons.push(props);
    return createElement("button", {}, props.label);
  },
}));
const empty: CaptureDraftSnapshot = {
  items: [],
  editorText: "",
  selecting: false,
  error: null,
};
function render(snapshot = empty, count = 0) {
  state.buttons = [];
  state.nodes = [];
  const props = {
    snapshot,
    count,
    duplicate: false,
    onClose: vi.fn(),
    onFiles: vi.fn(),
    onPhotos: vi.fn(),
    onRemove: vi.fn(),
    onText: vi.fn(),
    onAddText: vi.fn(),
    onClear: vi.fn(),
    onSubmit: vi.fn(),
    onActivity: vi.fn(),
  };
  const html = renderToStaticMarkup(createElement(CaptureComposer, props));
  return { props, html };
}
beforeEach(() => {
  state.tab = "capture";
  state.confirm.mockReset();
  setUiLocale("en");
  state.scheme = "light";
});
it("empty composer hides Tray and submission footer while exposing real sources and unavailable Camera", () => {
  for (const locale of ["en", "zh-Hans"] as const)
    for (const scheme of ["light", "dark"] as const) {
      setUiLocale(locale);
      state.scheme = scheme;
      const { props, html } = render();
      expect(state.nodes.some((node) => node.horizontal)).toBe(false);
      expect(html).not.toContain(t("capture.composer.submit"));
      expect(html).not.toContain(t("capture.composer.clear"));
      expect(html).toContain(t("capture.composer.unassigned"));
      state.buttons.find((button) => button.label === t("capture.files")).onPress();
      expect(props.onFiles).toHaveBeenCalledOnce();
      state.buttons.find((button) => button.label === t("capture.photos")).onPress();
      expect(props.onPhotos).toHaveBeenCalledOnce();
      expect(
        state.buttons.find((button) => button.label === t("capture.composer.camera"))
          .disabled,
      ).toBe(true);
    }
});
it("text Add is distinct from Submit and unsupported provenance never claims submission", () => {
  const { props, html } = render({ ...empty, editorText: "Original note" }, 1);
  state.buttons.find((button) => button.label === t("capture.composer.add")).onPress();
  expect(props.onAddText).toHaveBeenCalledOnce();
  expect(props.onSubmit).not.toHaveBeenCalled();
  expect(
    state.buttons.find((button) => button.label === t("capture.composer.submit"))
      .disabled,
  ).toBe(true);
  expect(html).toContain(t("capture.composer.textSubmitUnavailable"));
});
it("horizontal file cards remove one selection; Clear requires confirmation and does not close", () => {
  const item = {
    source: "files" as const,
    temporaryUri: "file://original",
    name: "original.pdf",
    typeHint: "application/pdf",
    stagingId: 7,
    availability: "unverified" as const,
  };
  const { props } = render({ ...empty, items: [item] }, 1);
  expect(state.nodes.some((node) => node.horizontal)).toBe(true);
  state.buttons
    .find((button) => button.label === t("capture.remove", { name: item.name }))
    .onPress();
  expect(props.onRemove).toHaveBeenCalledWith(7);
  expect(
    state.buttons.find((button) => button.label === t("capture.composer.submit"))
      .disabled,
  ).toBe(false);
  state.buttons.find((button) => button.label === t("capture.composer.clear")).onPress();
  expect(props.onClear).not.toHaveBeenCalled();
  state.confirm.mock.calls[0][2][1].onPress();
  expect(props.onClear).toHaveBeenCalledOnce();
  expect(props.onClose).not.toHaveBeenCalled();
});
it("Connections tab has explicit unavailable statuses and switching tabs leaves the draft untouched", () => {
  const snapshot = { ...empty, editorText: "Keep this note" };
  const first = render(snapshot, 1);
  state.buttons
    .find((button) => button.label === t("capture.composer.connections"))
    .onPress();
  const { html, props } = render(snapshot, 1);
  expect(html).toContain(t("capture.composer.connectionUnavailable"));
  expect(html).toContain(t("capture.composer.chatgpt"));
  expect(props.onClear).not.toHaveBeenCalled();
  expect(first.props.onClear).not.toHaveBeenCalled();
  state.buttons
    .find((button) => button.label === t("capture.composer.capture"))
    .onPress();
  render(snapshot, 1);
  expect(state.nodes.find((node) => node.value).value).toBe("Keep this note");
});

it("body scrolling cannot move the footer below the keyboard viewport", () => {
  render({ ...empty, editorText: "Read this before Submit" }, 1);
  expect(state.nodes.find((node) => node.edges)?.edges).toContain("top");
  const scroll = state.nodes.find((node) => node.keyboardShouldPersistTaps);
  const contains = (node: any, key: Parameters<typeof t>[0]): boolean =>
    Array.isArray(node)
      ? node.some((child) => contains(child, key))
      : node?.props
        ? node.props.label === t(key) || contains(node.props.children, key)
        : false;
  expect(contains(scroll.children, "capture.composer.submit")).toBe(false);
  expect(contains(scroll.children, "capture.composer.clear")).toBe(false);
  expect(
    state.buttons.some((button) => button.label === t("capture.composer.submit")),
  ).toBe(true);
});
