import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { CaptureTray } from "./CaptureContent";
import { emptyCaptureStaging } from "./captureStaging";
import { getUiLocale, setUiLocale, t } from "@/ui/locale";
import { uiPalette } from "@/ui/palette";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(element: ReactNode): string;
};
const state = vi.hoisted(() => ({
  scheme: "light" as "light" | "dark",
  buttons: [] as Record<string, any>[],
}));
vi.mock("expo-document-picker", () => ({ getDocumentAsync: vi.fn() }));
vi.mock("expo-image-picker", () => ({ launchImageLibraryAsync: vi.fn() }));
vi.mock("react-native", async () => {
  const { createElement } = await import("react");
  const flatten = (v: any): any =>
    Array.isArray(v) ? Object.assign({}, ...v.filter(Boolean).map(flatten)) : v;
  const primitive = (tag: string) => (props: Record<string, any>) => {
    if (tag === "button") state.buttons.push(props);
    return createElement(
      tag,
      {
        style: flatten(props.style),
        disabled: props.disabled,
        "aria-label": props.accessibilityLabel,
        "aria-disabled": props.accessibilityState?.disabled,
        role: props.accessibilityRole,
      },
      props.children,
    );
  };
  return {
    Text: primitive("span"),
    View: primitive("div"),
    ScrollView: primitive("main"),
    Pressable: primitive("button"),
    useColorScheme: () => state.scheme,
    StyleSheet: { create: (v: unknown) => v },
  };
});
const original = getUiLocale();
afterEach(() => {
  setUiLocale(original);
  state.buttons = [];
});
it("renders empty/staged/error/unavailable content in both palettes/locales with accessible disabled final action", () => {
  const remove = vi.fn();
  const cancel = vi.fn();
  const files = vi.fn();
  const name = "中文 long filename ".repeat(30) + ".pdf";
  for (const scheme of ["light", "dark"] as const)
    for (const locale of ["en", "zh-Hans"] as const) {
      state.scheme = scheme;
      setUiLocale(locale);
      const props = {
        onFiles: files,
        onPhotos: vi.fn(),
        onRemove: remove,
        onCancel: cancel,
      };
      let html = renderToStaticMarkup(
        createElement(CaptureTray, { ...props, snapshot: emptyCaptureStaging }),
      );
      expect(html).toContain(t("capture.empty"));
      state.buttons = [];
      html = renderToStaticMarkup(
        createElement(CaptureTray, {
          ...props,
          tripName: "Japan",
          snapshot: {
            items: [
              {
                source: "files",
                temporaryUri: null,
                name,
                typeHint: null,
                stagingId: 1,
                availability: "unavailable",
              },
            ],
            selecting: false,
            error: "picker",
          },
        }),
      );
      expect(html).toContain(t("capture.context", { name: "Japan" }));
      expect(html).toContain(name);
      expect(html).toContain(t("capture.transient"));
      expect(html).toContain(t("capture.unavailable"));
      expect(html).toContain(t("capture.pickerError"));
      expect(html).toContain(uiPalette(scheme).background);
      const add = state.buttons.find(
        (button) => button.accessibilityLabel === t("capture.addOne", { count: 1 }),
      )!;
      expect(add.disabled).toBe(true);
      expect(add.accessibilityState.disabled).toBe(true);
      expect(add.accessibilityRole).toBe("button");
      expect(add.style[0].minHeight).toBeGreaterThanOrEqual(44);
      state.buttons
        .find((button) => button.accessibilityLabel === t("capture.remove", { name }))!
        .onPress();
      expect(remove).toHaveBeenLastCalledWith(1);
      state.buttons
        .find((button) => button.accessibilityLabel === t("common.cancel"))!
        .onPress();
      expect(cancel).toHaveBeenCalled();
      state.buttons
        .find((button) => button.accessibilityLabel === t("capture.files"))!
        .onPress();
      expect(files).toHaveBeenCalled();
    }
});
it("busy source actions are disabled; content retains font scaling, wrapping and host-owned context", () => {
  state.buttons = [];
  renderToStaticMarkup(
    createElement(CaptureTray, {
      snapshot: { ...emptyCaptureStaging, selecting: true },
      onFiles: vi.fn(),
      onPhotos: vi.fn(),
      onRemove: vi.fn(),
      onCancel: vi.fn(),
    }),
  );
  expect(state.buttons.filter((button) => button.disabled)).toHaveLength(3);
  const source = readFileSync("src/features/capture/CaptureContent.tsx", "utf8");
  expect(source).not.toMatch(/allowFontScaling=\{false\}|numberOfLines|height:/);
  expect(source).not.toMatch(/tripId|accountId|Guest/);
});
