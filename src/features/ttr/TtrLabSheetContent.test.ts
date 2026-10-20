import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TtrLabSheetContent, type TtrLabSheetCopy } from "./TtrLabSheetContent";
import { ttrFixture } from "@/domain/trip/__fixtures__/ttr";
import { ttrIdentityKey } from "@/domain/trip/ttr";
import { openTtr, reduceTtr } from "@/domain/trip/ttrState";
import type { TtrLabInteractionView } from "./useTtrLabInteraction";
import { setUiLocale, getUiLocale, t } from "@/ui/locale";
import { uiPalette } from "@/ui/palette";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
const native = vi.hoisted(() => ({
  scheme: "light" as "light" | "dark",
  scale: 1,
  nodes: [] as Record<string, any>[],
}));
vi.mock("react-native", async () => {
  const { createElement } = await import("react");
  const flatten = (s: any): any =>
    Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean).map(flatten)) : s;
  const primitive = (tag: string) => (p: Record<string, any>) => {
    native.nodes.push(p);
    return createElement(
      tag,
      {
        style: flatten(p.style),
        disabled: p.disabled,
        "aria-label": p.accessibilityLabel,
        "aria-disabled": p.accessibilityState?.disabled,
        "aria-busy": p.accessibilityState?.busy,
        role: p.accessibilityRole,
      },
      p.children,
    );
  };
  return {
    View: primitive("div"),
    ScrollView: primitive("div"),
    Text: primitive("span"),
    Pressable: primitive("button"),
    StyleSheet: { create: (v: unknown) => v },
    useColorScheme: () => native.scheme,
    useWindowDimensions: () => ({ width: 375, height: 812, fontScale: native.scale }),
  };
});
vi.mock("react-native-safe-area-context", async () => {
  const { createElement } = await import("react");
  return {
    SafeAreaView: (p: Record<string, any>) =>
      createElement("div", { style: p.style }, p.children),
  };
});
const locale = getUiLocale();
beforeEach(() => {
  vi.stubGlobal("__DEV__", true);
  native.nodes = [];
  native.scheme = "light";
  native.scale = 1;
  setUiLocale("en");
});
afterEach(() => {
  vi.unstubAllGlobals();
  setUiLocale(locale);
});
// Proposed translations are test data; G2/UX must approve the shared catalog keys.
const copies: Record<"en" | "zh-Hans", TtrLabSheetCopy> = {
  en: {
    title: "Travel mode",
    confirm: "Confirm",
    checkSaved: "Check saved choice",
    externalMaps: "Open in Maps",
    noMode: "No mode selected",
    opening: "Opening…",
    saving: "Saving choice…",
    checking: "Checking saved choice…",
    unavailable: "This transition is unavailable.",
    failure: "Could not complete this action. Check the saved choice.",
    uncertain:
      "Save outcome is uncertain. Check the saved choice before confirming again.",
    published: "Saved locally.",
    savedUnpublished: "Saved locally; this view was not updated.",
    endpoints: (a, b) => `${a} → ${b}`,
    confirmed: (m) => `Confirmed: ${m}`,
    preview: (m) => `Preview: ${m}`,
  },
  "zh-Hans": {
    title: "交通方式",
    confirm: "确认",
    checkSaved: "检查已保存的选择",
    externalMaps: "在地图中打开",
    noMode: "尚未选择交通方式",
    opening: "正在打开…",
    saving: "正在保存选择…",
    checking: "正在检查已保存的选择…",
    unavailable: "此路段暂不可用。",
    failure: "未能完成此操作。请检查已保存的选择。",
    uncertain: "保存结果尚不确定。再次确认前，请检查已保存的选择。",
    published: "已保存到本地。",
    savedUnpublished: "已保存到本地，当前视图未更新。",
    endpoints: (a, b) => `${a} → ${b}`,
    confirmed: (m) => `已确认：${m}`,
    preview: (m) => `预览：${m}`,
  },
};
function fixture(phase: TtrLabInteractionView["phase"] = "READY") {
  const state = openTtr(ttrFixture());
  const props = {
    view: { phase, state, candidate: null } as TtrLabInteractionView,
    facts: {
      source: "SYNTHETIC_TTR_LAB" as const,
      identityKey: ttrIdentityKey(state.identity!),
      fromLabel: "Synthetic A",
      toLabel: "Synthetic B",
    },
    copy: copies.en,
    onPreview: vi.fn(),
    onConfirm: vi.fn(),
    onDismiss: vi.fn(),
    onRecover: vi.fn(),
    onExternalMaps: undefined as (() => void) | undefined,
  };
  const render = () => {
    native.nodes = [];
    return renderToStaticMarkup(createElement(TtrLabSheetContent, props));
  };
  const button = (label: string) =>
    native.nodes.find(
      (p) =>
        p.accessibilityRole === "button" &&
        (p.accessibilityLabel === label || p.children?.props?.children === label),
    )!;
  return { props, render, button };
}
it.each(["en", "zh-Hans"] as const)(
  "%s uses supplied localized feedback and canonical mode/distance copy",
  (language) => {
    setUiLocale(language);
    const f = fixture();
    f.props.copy = copies[language];
    const html = f.render();
    expect(html).toContain(copies[language].noMode);
    expect(html).toContain(t("ttr.mode.walking"));
    expect(html).toContain("Synthetic A → Synthetic B");
    expect(f.button(copies[language].confirm).disabled).toBe(true);
    expect(f.props.onExternalMaps).toBeUndefined();
  },
);
it("existing confirmed mode and distinct draft selection do not invoke storage actions on render", () => {
  const f = fixture();
  let state = reduceTtr(f.props.view.state!, { type: "PREVIEW", mode: "walking" });
  state = reduceTtr(state, { type: "CONFIRM", selectedAt: "2026-10-11T12:00:00Z" });
  state = reduceTtr(state, { type: "PREVIEW", mode: "driving" });
  f.props.view = { ...f.props.view, state };
  const html = f.render();
  expect(html).toContain("Confirmed: Walking");
  expect(html).toContain("Preview: Driving");
  f.button("Confirm").onPress();
  expect(f.props.onConfirm).toHaveBeenCalledTimes(1);
  f.button("Close").onPress();
  expect(f.props.onDismiss).toHaveBeenCalledTimes(1);
  expect(f.props.onPreview).not.toHaveBeenCalled();
});
it("Preview delegates only the chosen mode, and Close delegates Dismiss", () => {
  const f = fixture();
  f.render();
  f.button("Walking").onPress();
  f.button("Close").onPress();
  expect(f.props.onPreview).toHaveBeenCalledWith("walking");
  expect(f.props.onConfirm).not.toHaveBeenCalled();
  expect(f.props.onDismiss).toHaveBeenCalledTimes(1);
});
it.each([
  "SAVING",
  "RECOVERING",
  "OPENING",
  "UNAVAILABLE",
  "UNCERTAIN",
  "ERROR",
] as const)("%s disables unsafe actions with readable feedback", (phase) => {
  const f = fixture(phase);
  f.props.onExternalMaps = vi.fn();
  const html = f.render();
  const expected = {
    SAVING: copies.en.saving,
    RECOVERING: copies.en.checking,
    OPENING: copies.en.opening,
    UNAVAILABLE: copies.en.unavailable,
    UNCERTAIN: copies.en.uncertain,
    ERROR: copies.en.failure,
  }[phase];
  expect(html).toContain(expected);
  expect(f.button("Confirm").accessibilityState.disabled).toBe(true);
  expect(f.button("Walking").disabled).toBe(true);
  f.button("Walking").onPress();
  f.button("Confirm").onPress();
  f.button("Open in Maps").onPress();
  expect(f.props.onConfirm).not.toHaveBeenCalled();
  expect(f.props.onExternalMaps).not.toHaveBeenCalled();
  if (phase === "UNCERTAIN" || phase === "ERROR") {
    f.button("Check saved choice").onPress();
    expect(f.props.onRecover).toHaveBeenCalledTimes(1);
  }
});
it.each(["PUBLISHED", "SAVED_UNPUBLISHED"] as const)(
  "%s renders truthful durable feedback only",
  (phase) => {
    const f = fixture(phase);
    expect(f.render()).toContain(
      phase === "PUBLISHED" ? copies.en.published : copies.en.savedUnpublished,
    );
    expect(f.button("Confirm").disabled).toBe(true);
  },
);
it("stale synthetic identity fails closed, and External Maps appears only for injected intent", () => {
  const f = fixture();
  f.props.facts.identityKey = "stale";
  f.props.onExternalMaps = vi.fn();
  expect(f.render()).toContain(copies.en.unavailable);
  expect(f.button("Open in Maps").disabled).toBe(true);
  const g = fixture();
  g.props.onExternalMaps = vi.fn();
  g.render();
  g.button("Open in Maps").onPress();
  expect(g.props.onExternalMaps).toHaveBeenCalledTimes(1);
});
it.each(["light", "dark"] as const)(
  "%s / large text uses semantic viewport colors and native accessible controls",
  (scheme) => {
    const f = fixture("SAVING");
    native.scheme = scheme;
    native.scale = 3;
    const html = f.render();
    expect(html).toContain(uiPalette(scheme).background);
    expect(html).toContain(uiPalette(scheme).textSecondary);
    expect(native.nodes.some((p) => p.accessibilityState?.busy === true)).toBe(true);
    expect(f.button("Confirm").accessibilityState.disabled).toBe(true);
    expect(
      native.nodes.some((p) => p.accessibilityRole === "header" && p.numberOfLines === 2),
    ).toBe(true);
  },
);
it("Past input disables an otherwise qualified stale READY view", () => {
  const f = fixture();
  f.props.view.state!.input!.period = "PAST";
  expect(f.render()).toContain(copies.en.unavailable);
  expect(f.button("Confirm").disabled).toBe(true);
});
it("Release content is inert", () => {
  const f = fixture();
  vi.stubGlobal("__DEV__", false);
  expect(f.render()).toBe("");
  expect(f.props.onConfirm).not.toHaveBeenCalled();
});
it("UNKNOWN zero geometry keeps mode choice eligible, explicit SAME_LOCATION disables it", () => {
  const f = fixture();
  const input = ttrFixture();
  input.to!.endpoint!.coordinates = { ...input.from!.endpoint!.coordinates! };
  f.props.view = { ...f.props.view, state: openTtr(input) };
  f.render();
  expect(f.button("Walking").disabled).toBe(false);
  f.button("Walking").onPress();
  expect(f.props.onPreview).toHaveBeenCalledWith("walking");
  input.spatialEquivalence = {
    equivalence: "SAME_LOCATION",
    provenance: "synthetic-authority",
  };
  f.props.view = { ...f.props.view, state: openTtr(input) };
  f.render();
  expect(f.button("Walking").disabled).toBe(true);
});
