import { createElement } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { CaptureComposer } from "./CaptureComposer";
import { CaptureActivityList, captureJobTitle } from "./CaptureActivity";
import { fixture } from "@/data/repositories/__fixtures__/captureBatchAssessment";
import { t, setUiLocale } from "@/ui/locale";
import { uiPalette } from "@/ui/palette";
import type { CaptureDraftSnapshot } from "./captureStaging";
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
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
  useUiTheme: () => uiPalette(state.scheme),
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/controls", () => ({
  UiText: (props: any) => {
    state.nodes.push(props);
    return createElement("span", {}, props.children);
  },
  UiSection: (props: any) => createElement("section", {}, props.children),
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
      state.buttons
        .find((button) => button.label === t("capture.composer.files"))
        .onPress();
      expect(props.onFiles).toHaveBeenCalledOnce();
      state.buttons
        .find((button) => button.label === t("capture.composer.photos"))
        .onPress();
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

it("normal owning Activity stays in the existing Composer with Refresh, Job, return and Close actions in both themes", async () => {
  const f = fixture();
  const request = await f.submit();
  const job = await f.submissions.reopen(request.jobId);
  const onOpenJob = vi.fn(),
    onReturn = vi.fn();
  for (const scheme of ["light", "dark"] as const) {
    state.scheme = scheme;
    state.buttons = [];
    state.nodes = [];
    const props = {
      snapshot: empty,
      count: 0,
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
      title: t("capture.progress.activeImports"),
      content: createElement(CaptureActivityList, {
        jobs: [job],
        expectedAccountId: await f.getAccount(),
        loading: false,
        error: false,
        hasMore: false,
        onRefresh: vi.fn(),
        onMore: vi.fn(),
        onOpenJob,
        onReturn,
        onHide: vi.fn(),
      }),
    };
    const html = renderToStaticMarkup(createElement(CaptureComposer, props));
    expect(html).toContain(t("capture.activityRefresh"));
    expect(html).toContain(t("capture.activityReturn"));
    expect(html).toContain(t("capture.jobView", { summary: captureJobTitle(job) }));
    expect(state.nodes.filter((node) => node.visible === true)).toHaveLength(1);
    expect(
      state.buttons.some((button) => button.label === t("capture.composer.submit")),
    ).toBe(false);
    state.buttons
      .find(
        (button) =>
          button.label === t("capture.jobView", { summary: captureJobTitle(job) }),
      )
      .onPress();
    expect(onOpenJob).toHaveBeenLastCalledWith(request.jobId);
    state.buttons
      .find((button) => button.label === t("capture.activityReturn"))
      .onPress();
    expect(onReturn).toHaveBeenCalled();
    expect(state.buttons.some((button) => button.label === t("common.close"))).toBe(true);
  }
});

it("long Tray copy stays compact while its complete identity and remove target remain accessible", () => {
  const name = "東京の旅程と旅行の確認資料·".repeat(25) + ".pdf";
  const item = {
    source: "files" as const,
    temporaryUri: "file://selected",
    name,
    typeHint: "application/pdf",
    stagingId: 81,
    availability: "unverified" as const,
  };
  const { props } = render({ ...empty, items: [item] }, 1);
  const title = state.nodes.find((node) => node.accessibilityLabel === name);
  expect(title.children).toBe(name);
  expect(title.numberOfLines).toBe(2);
  expect(state.nodes.some((node) => node.horizontal)).toBe(true);
  state.buttons
    .find((button) => button.label === t("capture.remove", { name }))
    .onPress();
  expect(props.onRemove).toHaveBeenCalledWith(81);
  expect(props.onSubmit).not.toHaveBeenCalled();
});
it("an added multiline text card keeps its complete draft content without growing the Tray indefinitely", () => {
  const text = "First line\nSecond line\nThird line\nFourth line";
  const item = { source: "magic_input" as const, text, stagingId: 12 };
  render({ ...empty, items: [item] }, 1);
  expect(state.nodes.find((node) => node.accessibilityLabel === text).children).toBe(
    text,
  );
  expect(state.nodes.find((node) => node.accessibilityLabel === text).numberOfLines).toBe(
    2,
  );
  expect(
    state.buttons.find((button) => button.label === t("capture.composer.submit"))
      .disabled,
  ).toBe(true);
});
