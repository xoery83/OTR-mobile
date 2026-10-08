import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { CaptureTray } from "./CaptureContent";
import { CaptureActivityList, captureJobTitle } from "./CaptureActivity";
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

it("truthful partial and complete intake keep Hide enabled across palettes/locales without fake processing", () => {
  for (const scheme of ["light", "dark"] as const)
    for (const locale of ["en", "zh-Hans"] as const)
      for (const accepted of [0, 1, 2]) {
        state.scheme = scheme;
        setUiLocale(locale);
        state.buttons = [];
        const model = {
          counts: { selected: 2, accepted, failed: 2 - accepted, pending: 0 },
          allInputsAccepted: accepted === 2,
          batch: { jobId: "same-job" },
          intakeSettled: true,
          availableActions: {
            canAddMore: true,
            reacquireInputIds: accepted === 2 ? [] : [String(accepted)],
          },
          inputs: [0, 1].map((n) => ({
            id: String(n),
            originalFilename: "original",
            acquisitionSource: n % 2 ? "photos" : "files",
            state: n < accepted ? "ACCEPTED" : "FAILED",
            contentSha256: null,
            failureCode: n < accepted ? null : "READER_FAILURE",
            continuedIn: [],
          })),
        } as unknown as import("@/domain/capture/captureSubmission").CaptureJobReadModel;
        const close = vi.fn(),
          html = renderToStaticMarkup(
            createElement(CaptureTray, {
              snapshot: emptyCaptureStaging,
              model,
              busy: true,
              locked: true,
              onFiles: vi.fn(),
              onPhotos: vi.fn(),
              onRemove: vi.fn(),
              onCancel: close,
              onRecover: vi.fn(),
            }),
          );
        expect(html).toContain(captureJobTitle(model));
        if (!model.allInputsAccepted)
          expect(html).toContain(t("capture.counts", model.counts));
        expect(html).not.toContain(model.batch.jobId);
        expect(html).not.toContain(t("capture.addOther", { count: 0 }));
        expect(html).toContain(t("capture.processingUnavailable"));
        expect(html).not.toContain(t("capture.lineageHint"));
        if (accepted < 2)
          expect(html).toContain(
            t(
              accepted === 1 ? "capture.continueMissingPhoto" : "capture.continueMissing",
            ),
          );
        expect(html.includes(t("capture.reacquireHint"))).toBe(accepted !== 2);
        const hide = state.buttons.find(
          (b) => b.accessibilityLabel === t("capture.hide"),
        )!;
        expect(hide.disabled).toBe(false);
        hide.onPress();
        expect(close).toHaveBeenCalledOnce();
        expect(html).not.toMatch(/AI thinking|100%/);
      }
});

it("Activity renders real 0/1/N identities and counts, no fake progress; buttons wrap and Hide stays enabled", () => {
  for (const scheme of ["light", "dark"] as const)
    for (const locale of ["en", "zh-Hans"] as const) {
      state.scheme = scheme;
      setUiLocale(locale);
      for (const n of [0, 1, 3]) {
        state.buttons = [];
        const jobs = Array.from({ length: n }, (_, i) => ({
          batch: { jobId: `retained-uuid-${i}`, createdAt: "2026-10-08T00:00:00.000Z" },
          counts: { selected: 2, accepted: i, failed: 2 - i, pending: 0 },
          allInputsAccepted: i === 2,
          intakeSettled: true,
          availableActions: { canReopen: true },
        })) as unknown as import("@/domain/capture/captureSubmission").CaptureJobReadModel[];
        const open = vi.fn(),
          hide = vi.fn();
        const html = renderToStaticMarkup(
          createElement(CaptureActivityList, {
            jobs,
            loading: false,
            error: false,
            hasMore: n > 0,
            onRefresh: vi.fn(),
            onMore: vi.fn(),
            onReturn: vi.fn(),
            onHide: hide,
            onOpenJob: open,
          }),
        );
        expect(html.includes(t("capture.activityEmpty"))).toBe(n === 0);
        expect(html).toContain(uiPalette(scheme).background);
        expect(html).not.toMatch(/100%|AI thinking|Waiting for internet/);
        for (const job of jobs) {
          expect(html).toContain(captureJobTitle(job));
          if (!job.allInputsAccepted)
            expect(html).toContain(t("capture.counts", job.counts));
          expect(html).not.toContain(job.batch.jobId);
          expect(html).toContain(t("capture.activityHint"));
          const button = state.buttons.find(
            (b) =>
              b.accessibilityLabel ===
              t("capture.jobView", { summary: captureJobTitle(job) }),
          )!;
          expect(button.style[0].minHeight).toBeGreaterThanOrEqual(44);
          button.onPress();
          expect(open).toHaveBeenLastCalledWith(job.batch.jobId);
        }
        const button = state.buttons.find(
          (b) => b.accessibilityLabel === t("capture.hide"),
        )!;
        expect(button.disabled).toBe(false);
        button.onPress();
        expect(hide).toHaveBeenCalledOnce();
      }
      for (const loading of [false, true]) {
        state.buttons = [];
        const html = renderToStaticMarkup(
          createElement(CaptureActivityList, {
            jobs: [],
            loading,
            error: !loading,
            hasMore: false,
            onRefresh: vi.fn(),
            onMore: vi.fn(),
            onReturn: vi.fn(),
            onHide: vi.fn(),
            onOpenJob: vi.fn(),
          }),
        );
        expect(html).toContain(
          t(loading ? "capture.activityLoading" : "capture.activityError"),
        );
        expect(html).not.toContain(t("capture.activityEmpty"));
        expect(
          state.buttons.find((b) => b.accessibilityLabel === t("capture.hide"))!.disabled,
        ).toBe(false);
      }
    }
  expect(readFileSync("src/features/capture/CaptureActivity.tsx", "utf8")).not.toMatch(
    /allowFontScaling=\{false\}|numberOfLines|height:|setTimeout|setInterval/,
  );
});
it("derived actions govern recovery; explicit forward/reverse lineage opens the projected exact Job", () => {
  const open = vi.fn(),
    recover = vi.fn();
  const model = {
    batch: { jobId: "original-job" },
    counts: { selected: 1, accepted: 0, failed: 1, pending: 0 },
    allInputsAccepted: false,
    intakeSettled: true,
    availableActions: { canAddMore: false, reacquireInputIds: [] },
    inputs: [
      {
        id: "missing",
        originalFilename: "same-name.pdf",
        state: "FAILED",
        failureCode: "READER_FAILURE",
        contentSha256: null,
        continuesFromJobId: "earlier-job",
        continuedIn: [{ jobId: "later-job", inputId: "later-input" }],
      },
    ],
  } as unknown as import("@/domain/capture/captureSubmission").CaptureJobReadModel;
  state.buttons = [];
  renderToStaticMarkup(
    createElement(CaptureTray, {
      snapshot: emptyCaptureStaging,
      model,
      onFiles: vi.fn(),
      onPhotos: vi.fn(),
      onRemove: vi.fn(),
      onCancel: vi.fn(),
      onRecover: recover,
      onOpenJob: open,
      onAddMore: vi.fn(),
    }),
  );
  expect(
    state.buttons.some((b) => b.accessibilityLabel === t("capture.continueMissing")),
  ).toBe(false);
  expect(state.buttons.some((b) => b.accessibilityLabel === t("capture.addMore"))).toBe(
    false,
  );
  state.buttons
    .find((b) => b.accessibilityLabel === t("capture.priorJob", { id: "earlier-job" }))!
    .onPress();
  expect(open).toHaveBeenLastCalledWith("earlier-job");
  state.buttons
    .find((b) => b.accessibilityLabel === t("capture.nextJob", { id: "later-job" }))!
    .onPress();
  expect(open).toHaveBeenLastCalledWith("later-job");
  expect(recover).not.toHaveBeenCalled();
});
