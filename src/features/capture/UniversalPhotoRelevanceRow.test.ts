import { createElement } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import type {
  CaptureJobReadModel,
  CaptureSubmissionInput,
} from "@/domain/capture/captureSubmission";
import { uiPalette } from "@/ui/palette";
import { setUiLocale, t } from "@/ui/locale";
import {
  UniversalPhotoRelevanceRow,
  type UniversalPhotoRelevanceCopy,
} from "./UniversalPhotoRelevanceRow";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server");
const h = vi.hoisted(() => ({
  hook: vi.fn(),
  read: vi.fn(),
  screen: vi.fn(),
  choose: vi.fn(),
  buttons: [] as any[],
  palette: "light" as "light" | "dark",
  styles: null as any,
}));
vi.mock("react-native", () => ({
  View: "div",
  StyleSheet: { create: (v: unknown) => v },
}));
vi.mock("@/ui/theme", () => ({
  useThemedStyles: (create: any) => {
    h.styles = create(uiPalette(h.palette));
    return h.styles;
  },
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/controls", () => ({
  UiText: (p: any) => createElement("span", { role: p.accessibilityRole }, p.children),
  UiButton: (p: any) => {
    h.buttons.push(p);
    return createElement("button", { disabled: p.disabled }, p.label);
  },
}));
vi.mock("./useUniversalPhotoRelevance", () => ({ useUniversalPhotoRelevance: h.hook }));
const copy: UniversalPhotoRelevanceCopy = {
  title: "Local image check",
  localOnly: "Only local checks and choices. AI image analysis has not started.",
  notChecked: "Not checked on this device.",
  relevant: "Local text suggests travel information.",
  uncertain: "Local text is inconclusive.",
  irrelevant: "Marked unrelated; original kept.",
  originalChanged: "Earlier choice no longer applies.",
  unavailable: "Local image state unavailable; original kept.",
  continueSelected: "AI preference recorded locally; analysis has not started.",
  skipSelected: "Skipped for AI; original kept.",
  screen: "Check image locally",
  chooseAi: "Choose AI analysis",
  skip: "Skip AI analysis",
};
const input = {
  id: "photo-a",
  kind: "IMAGE",
  state: "ACCEPTED",
} as CaptureSubmissionInput;
const model = { inputs: [input] } as unknown as CaptureJobReadModel;
function state(
  relevance = "UNCERTAIN",
  choice = "UNDECIDED",
  persisted = true,
  originalChanged = false,
) {
  return {
    eligible: true,
    busy: null,
    unavailable: false,
    canChoose: true,
    value: {
      revision: 1,
      persisted,
      originalChanged,
      decision: { relevance: { status: relevance }, choice },
    },
    read: h.read,
    screen: h.screen,
    choose: h.choose,
  };
}
function render(translated = copy, current = () => true) {
  return renderToStaticMarkup(
    createElement(UniversalPhotoRelevanceRow, {
      model,
      input,
      copy: translated,
      isCurrent: current,
    }),
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  h.buttons = [];
  h.palette = "light";
  h.hook.mockReturnValue(state());
  setUiLocale("en");
});
it("mounts through the existing hook without invoking screen/choice and describes local state only", () => {
  const html = render();
  expect(html).toContain(copy.localOnly);
  expect(html).toContain(copy.uncertain);
  expect(h.screen).not.toHaveBeenCalled();
  expect(h.choose).not.toHaveBeenCalled();
  expect(h.hook).toHaveBeenCalledWith(model, input, expect.any(Function));
});
it.each(["RELEVANT", "UNCERTAIN", "IRRELEVANT"])(
  "maps the recorded %s status without inventing model/Save success",
  (status) => {
    h.hook.mockReturnValue(state(status));
    const html = render();
    expect(html).toContain(
      status === "RELEVANT"
        ? copy.relevant
        : status === "IRRELEVANT"
          ? copy.irrelevant
          : copy.uncertain,
    );
    expect(html).toContain(copy.localOnly);
  },
);
it("only explicit buttons store Continue/Skip intent", () => {
  render();
  h.buttons.find((p) => p.label === copy.chooseAi).onPress();
  h.buttons.find((p) => p.label === copy.skip).onPress();
  expect(h.choose.mock.calls).toEqual([["CONTINUE_WITH_AI"], ["SKIP"]]);
  expect(h.screen).not.toHaveBeenCalled();
});
it("an unchecked image offers a local check and not a paid action", () => {
  h.hook.mockReturnValue({ ...state(), value: null, canChoose: false });
  const html = render();
  expect(html).toContain(copy.notChecked);
  expect(h.buttons.map((p) => p.label)).toEqual([copy.screen]);
  h.buttons[0].onPress();
  expect(h.screen).toHaveBeenCalledOnce();
  expect(h.choose).not.toHaveBeenCalled();
});
it.each(["CONTINUE_WITH_AI", "SKIP"])(
  "records the %s choice as local preference, never model progress",
  (choice) => {
    h.hook.mockReturnValue(state("UNCERTAIN", choice));
    const html = render();
    expect(html).toContain(choice === "SKIP" ? copy.skipSelected : copy.continueSelected);
    expect(html).toContain(copy.localOnly);
    expect(
      h.buttons.find((p) => p.label === (choice === "SKIP" ? copy.skip : copy.chooseAi))
        .disabled,
    ).toBe(true);
  },
);
it("keeps an explicit local recheck available after Continue without inheriting or repeating consent", () => {
  h.hook.mockReturnValue(state("RELEVANT", "CONTINUE_WITH_AI"));
  const html = render();
  expect(html).toContain(copy.continueSelected);
  expect(h.screen).not.toHaveBeenCalled();
  const recheck = h.buttons.find((p) => p.label === copy.screen);
  expect(recheck.disabled).toBe(false);
  recheck.onPress();
  expect(h.screen).toHaveBeenCalledOnce();
  expect(h.choose).not.toHaveBeenCalled();
  expect(h.read).not.toHaveBeenCalled();
});
it("stale persisted choices are not displayed as current or enabled until checked again", () => {
  h.hook.mockReturnValue({
    ...state("RELEVANT", "CONTINUE_WITH_AI", true, true),
    canChoose: false,
  });
  const html = render();
  expect(html).toContain(copy.originalChanged);
  expect(html).not.toContain(copy.continueSelected);
  expect(h.buttons.find((p) => p.label === copy.chooseAi).disabled).toBe(true);
  expect(h.buttons.find((p) => p.label === copy.screen).disabled).toBe(false);
  h.buttons = [];
  h.hook.mockReturnValue(state("UNCERTAIN", "UNDECIDED", false, true));
  render();
  expect(h.buttons.find((p) => p.label === copy.chooseAi).disabled).toBe(false);
});
it.each(["READ", "SCREEN", "CHOOSE"])(
  "disables user actions while local %s is busy",
  (busy) => {
    h.hook.mockReturnValue({ ...state(), busy });
    const html = render();
    expect(html).toContain(t("common.loading"));
    expect(h.buttons.every((p) => p.disabled)).toBe(true);
  },
);
it("unavailable recovery only re-reads local state and retains the original", () => {
  h.hook.mockReturnValue({ ...state(), unavailable: true, canChoose: false });
  const html = render();
  expect(html).toContain(copy.unavailable);
  h.buttons.find((p) => p.label === t("common.tryAgain")).onPress();
  expect(h.read).toHaveBeenCalledOnce();
  expect(h.screen).not.toHaveBeenCalled();
  expect(h.choose).not.toHaveBeenCalled();
});
it("uses translated-copy props and semantic theme roles without changing stored decisions", () => {
  const translated = Object.fromEntries(
    Object.keys(copy).map((key) => [key, `本机文案-${key}`]),
  ) as UniversalPhotoRelevanceCopy;
  setUiLocale("zh-Hans");
  h.palette = "dark";
  const html = render(translated);
  expect(html).toContain(translated.localOnly);
  expect(html).toContain(translated.uncertain);
  expect(h.styles.meta.color).toBe(uiPalette("dark").textSecondary);
  expect(h.styles.error.color).toBe(uiPalette("dark").destructive);
  expect(h.choose).not.toHaveBeenCalled();
});
it("hides unsupported or no-longer-current input views", () => {
  expect(render(copy, () => false)).toBe("");
  h.hook.mockReturnValue({ ...state(), eligible: false });
  expect(render()).toBe("");
});
