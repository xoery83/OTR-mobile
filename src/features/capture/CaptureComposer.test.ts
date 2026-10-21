import { createElement } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { CaptureComposer } from "./CaptureComposer";
import { CaptureActivityList, captureJobTitle } from "./CaptureActivity";
import { fixture } from "@/data/repositories/__fixtures__/captureBatchAssessment";
import { t, setUiLocale } from "@/ui/locale";
import { uiPalette } from "@/ui/palette";
import type { CaptureDraftSnapshot } from "./captureStaging";
// Native diagnostic controls are outside this UI lifecycle suite.
vi.mock("./CaptureCustodyDevAction", () => ({ CaptureCustodyDevAction: () => null }));
vi.mock("@/ui/UiGlassSurface", () => ({
  UiGlassSurface: (props: any) => createElement("div", {}, props.children),
}));
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server");
const state = vi.hoisted(() => ({
  hooks: [] as any[],
  cursor: 0,
  os: "ios",
  voice: { status: "idle" as string },
  voiceStart: vi.fn(),
  voiceStop: vi.fn(),
  voiceCancel: vi.fn(),
  voiceClose: vi.fn(),
  actionSheet: vi.fn(),
  buttons: [] as any[],
  nodes: [] as any[],
  confirm: vi.fn(),
  scheme: "light" as "light" | "dark",
}));
vi.mock("./useImportDictation", () => ({
  useImportDictation: () => ({
    state: state.voice,
    busy: ["starting", "listening", "finishing"].includes(state.voice.status),
    start: state.voiceStart,
    stop: state.voiceStop,
    cancel: state.voiceCancel,
    close: state.voiceClose,
  }),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: any) => {
    const index = state.cursor++;
    if (!(index in state.hooks)) state.hooks[index] = initial;
    return [
      state.hooks[index],
      (value: any) => {
        state.hooks[index] =
          typeof value === "function" ? value(state.hooks[index]) : value;
      },
    ];
  },
}));
vi.mock("react-native", () => {
  const primitive = (props: any) => {
    state.nodes.push(props);
    return createElement("div", {}, props.children);
  };
  return {
    View: primitive,
    Text: primitive,
    Pressable: (props: any) => {
      state.buttons.push({ ...props, label: props.accessibilityLabel });
      state.nodes.push(props);
      return createElement("button", {}, props.children);
    },
    ActionSheetIOS: { showActionSheetWithOptions: state.actionSheet },
    ScrollView: primitive,
    Image: primitive,
    Modal: primitive,
    KeyboardAvoidingView: primitive,
    Platform: {
      get OS() {
        return state.os;
      },
    },
    Alert: { alert: state.confirm },
    StyleSheet: {
      create: (v: any) => v,
      hairlineWidth: 1,
      absoluteFill: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
    },
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
  state.cursor = 0;
  state.buttons = [];
  state.nodes = [];
  const props = {
    snapshot,
    count,
    duplicate: false,
    onClose: vi.fn(),
    onFiles: vi.fn(),
    onPhotos: vi.fn(),
    onCamera: vi.fn(),
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
  state.hooks = [];
  state.os = "ios";
  state.voice = { status: "idle" };
  for (const fn of [
    state.voiceStart,
    state.voiceStop,
    state.voiceCancel,
    state.voiceClose,
  ])
    fn.mockReset();
  state.cursor = 0;
  state.actionSheet.mockReset();
  state.confirm.mockReset();
  setUiLocale("en");
  state.scheme = "light";
});
const button = (key: Parameters<typeof t>[0]) =>
  state.buttons.find((b) => b.label === t(key));
const link = (key: Parameters<typeof t>[0]) =>
  state.nodes.find((n) => n.children === t(key) && n.onPress);
it("empty composer offers real intake sources and a persistent disabled send in both locales and themes", () => {
  for (const locale of ["en", "zh-Hans"] as const)
    for (const scheme of ["light", "dark"] as const) {
      setUiLocale(locale);
      state.scheme = scheme;
      const { props, html } = render();
      expect(state.nodes.some((n) => n.horizontal)).toBe(false);
      expect(html).toContain(t("capture.composer.unassigned"));
      expect(button("capture.composer.submit").disabled).toBe(true);
      link("capture.composer.camera").onPress();
      link("capture.composer.photos").onPress();
      link("capture.composer.files").onPress();
      expect(props.onCamera).toHaveBeenCalledOnce();
      expect(props.onPhotos).toHaveBeenCalledOnce();
      expect(props.onFiles).toHaveBeenCalledOnce();
      expect(state.nodes.find((n) => n.multiline).style[1].maxHeight).toBeLessThan(400);
    }
});
it("attachment popover picks the requested source without a system alert or submission", () => {
  render();
  button("capture.composer.addAttachments").onPress();
  const { props } = render();
  const file = state.buttons.find(
    (b) => b.children?.[1]?.props?.children === t("capture.composer.files"),
  );
  file.onPress();
  expect(props.onFiles).toHaveBeenCalledOnce();
  expect(state.actionSheet).not.toHaveBeenCalled();
  expect(state.confirm).not.toHaveBeenCalled();
  expect(props.onSubmit).not.toHaveBeenCalled();
});
it("outside dismissal preserves rather than clears the unsent draft", () => {
  const { props } = render({ ...empty, editorText: "keep this" });
  state.buttons.find((b) => b.style?.position === "absolute").onPress();
  expect(props.onClose).toHaveBeenCalledOnce();
  expect(props.onClear).not.toHaveBeenCalled();
});
it("native paste retains text exactly and unsupported text never silently submits files", () => {
  const { props, html } = render({ ...empty, editorText: "Original note" }, 1);
  const input = state.nodes.find((n) => n.multiline);
  const pasted = "Day 1\n東京\nDay 2\nKyoto";
  input.onChangeText(pasted);
  expect(props.onText).toHaveBeenCalledWith(pasted);
  expect(props.onSubmit).not.toHaveBeenCalled();
  expect(button("capture.composer.submit").disabled).toBe(true);
  expect(html).toContain(t("capture.composer.textSubmitUnavailable"));
  expect(input.style[1].maxHeight).toBeLessThan(400);
  expect(input.style[1].height).toBeUndefined();
});
it("all attachments remain in one horizontal tray and removal only targets the selected item", () => {
  const items = Array.from({ length: 9 }, (_, i) => ({
    source: "files" as const,
    temporaryUri: `file://original${i}`,
    name: `original${i}.pdf`,
    typeHint: "application/pdf",
    stagingId: i,
    availability: "unverified" as const,
  }));
  const { props, html } = render({ ...empty, items }, 9);
  expect(state.nodes.filter((n) => n.horizontal)).toHaveLength(1);
  for (const item of items) expect(html).toContain(item.name);
  expect(html).not.toContain(t("capture.composer.emailInstruction"));
  state.buttons
    .find((b) => b.label === t("capture.remove", { name: items[7].name }))
    .onPress();
  expect(props.onRemove).toHaveBeenCalledExactlyOnceWith(7);
  expect(button("capture.composer.submit").disabled).toBe(false);
  expect(props.onClear).not.toHaveBeenCalled();
  expect(props.onClose).not.toHaveBeenCalled();
});
it("email and AI replace the same modal, explain unavailable connections, and preserve the draft", () => {
  for (const page of ["email", "ai"] as const) {
    state.hooks = [];
    const snapshot = { ...empty, editorText: "Keep this note" };
    const { props } = render(snapshot, 1);
    link(
      page === "email"
        ? "capture.composer.emailInstruction"
        : "capture.composer.aiInstruction",
    ).onPress();
    const child = render(snapshot, 1);
    expect(child.html).toContain(
      t(
        page === "email"
          ? "capture.composer.emailUnavailable"
          : "capture.composer.aiUnavailable",
      ),
    );
    expect(state.nodes.filter((n) => n.visible === true)).toHaveLength(1);
    expect(button("capture.composer.submit")).toBeUndefined();
    button("common.close").onPress();
    render(snapshot, 1);
    expect(state.nodes.find((n) => n.multiline).value).toBe("Keep this note");
    expect(props.onClear).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  }
});
it("selecting prevents editing or duplicate submission while keeping feedback visible", () => {
  const { html } = render({ ...empty, selecting: true }, 1);
  expect(state.nodes.find((n) => n.multiline).editable).toBe(false);
  expect(button("capture.composer.addAttachments").disabled).toBe(true);
  expect(button("capture.composer.submit").disabled).toBe(true);
  expect(html).toContain(t("capture.selecting"));
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
    state.cursor = 0;
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
  expect(title.numberOfLines).toBe(1);
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
    1,
  );
  expect(
    state.buttons.find((button) => button.label === t("capture.composer.submit"))
      .disabled,
  ).toBe(true);
});

it("voice input starts from the exact draft and active recording locks conflicting actions", () => {
  render({ ...empty, editorText: "Existing note" }, 1);
  button("capture.voice.start").onPress();
  expect(state.voiceStart).toHaveBeenCalledWith("Existing note", "en-US");
  state.voice = { status: "listening" };
  const { props, html } = render(
    { ...empty, editorText: "Existing note spoken words" },
    1,
  );
  expect(html).toContain(t("capture.voice.listening"));
  expect(state.nodes.find((n) => n.multiline).editable).toBe(false);
  expect(button("capture.composer.addAttachments").disabled).toBe(true);
  expect(button("capture.composer.submit").disabled).toBe(true);
  button("capture.voice.stop").onPress();
  expect(state.voiceStop).toHaveBeenCalledOnce();
  button("capture.voice.cancel").onPress();
  expect(state.voiceCancel).toHaveBeenCalledOnce();
  button("common.close").onPress();
  expect(state.voiceClose).toHaveBeenCalledOnce();
  expect(props.onClose).toHaveBeenCalledOnce();
});

it("clipboard intake stays visible as an image and cannot enter the existing file-only submit path", () => {
  const pasted = {
    source: "clipboard" as const,
    stagingId: 1,
    token: "one",
    temporaryUri: "file:///tmp/one.png",
    name: null,
    typeHint: "image/png",
    size: 4,
    availability: "unverified" as const,
  };
  render({ ...empty, items: [pasted] }, 1);
  expect(button("capture.composer.submit").disabled).toBe(true);
  expect(state.nodes.some((node) => node.source?.uri === pasted.temporaryUri)).toBe(true);
});
