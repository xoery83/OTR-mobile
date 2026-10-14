import { createElement } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { fixture } from "@/data/repositories/__fixtures__/captureBatchAssessment";
import { CaptureProgress } from "./CaptureProgress";
import { CaptureActivityList, captureActivityTime } from "./CaptureActivity";
import { t, setUiLocale } from "@/ui/locale";
import { uiPalette } from "@/ui/palette";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server");
const state = vi.hoisted(() => ({ buttons: [] as any[] }));
vi.mock("react-native", () => ({
  View: "div",
  Text: "span",
  ScrollView: "main",
  StyleSheet: { create: (v: any) => v, hairlineWidth: 1 },
}));
vi.mock("@/ui/theme", () => ({
  useThemedStyles: (create: any) => create(uiPalette("light")),
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/controls", () => ({
  UiText: (p: any) => createElement("span", {}, p.children),
  UiSection: (p: any) => createElement("section", {}, p.children),
  UiButton: (p: any) => {
    state.buttons.push(p);
    return createElement("button", {}, p.label);
  },
}));
beforeEach(() => {
  state.buttons = [];
  setUiLocale("en");
});
it("normal owning SQLite intake renders local acceptance, stored seconds and unavailable processing/outcomes without generic Add More", async () => {
  const f = fixture();
  const request = await f.submit();
  const model = await f.submissions.reopen(request.jobId);
  const accountId = await f.getAccount();
  for (const locale of ["en", "zh-Hans"] as const) {
    setUiLocale(locale);
    state.buttons = [];
    const html = renderToStaticMarkup(
      createElement(CaptureProgress, {
        model,
        accountId,
        busy: false,
        reading: false,
        error: false,
        canRetry: false,
        onRetry: vi.fn(),
        onRecover: vi.fn(),
        onOpenJob: vi.fn(),
        onActivity: vi.fn(),
        onNewImport: vi.fn(),
      }),
    );
    expect(html).toContain(t("capture.progress.localCounts", model.counts));
    expect(html).toContain(t("capture.processingUnavailable"));
    expect(html).toContain(t("capture.progress.outcomesUnavailable"));
    expect(html).toContain(captureActivityTime(model.batch.createdAt));
    expect(state.buttons.some((button) => button.label === t("capture.addMore"))).toBe(
      false,
    );
    expect(html).not.toContain("100%");
  }
  expect(captureActivityTime("2026-10-14T21:35:42Z")).not.toBe(
    captureActivityTime("2026-10-14T21:35:43Z"),
  );
});
it("foreign expected Account reveals neither original name nor saved counts in Progress or Active Imports", async () => {
  const f = fixture();
  const request = await f.submit();
  const model = await f.submissions.reopen(request.jobId);
  model.inputs[0].originalFilename = "PRIVATE_DO_NOT_REVEAL.pdf";
  const html = renderToStaticMarkup(
    createElement(CaptureProgress, {
      model,
      accountId: "foreign",
      busy: false,
      reading: false,
      error: false,
      canRetry: false,
      onRetry: vi.fn(),
      onRecover: vi.fn(),
      onOpenJob: vi.fn(),
      onActivity: vi.fn(),
      onNewImport: vi.fn(),
    }),
  );
  expect(html).not.toContain("PRIVATE_DO_NOT_REVEAL");
  expect(html).not.toContain(t("capture.progress.localCounts", model.counts));
  expect(html).toContain(t("capture.jobReadError"));
  const list = renderToStaticMarkup(
    createElement(CaptureActivityList, {
      jobs: [model],
      expectedAccountId: "foreign",
      loading: false,
      error: false,
      hasMore: false,
      onRefresh: vi.fn(),
      onMore: vi.fn(),
      onOpenJob: vi.fn(),
      onReturn: vi.fn(),
      onHide: vi.fn(),
    }),
  );
  expect(list).not.toContain("PRIVATE_DO_NOT_REVEAL");
  expect(list).toContain(t("capture.activityError"));
});
it("a failed current read shows recorded metadata rather than asserting currently saved originals", async () => {
  const f = fixture();
  const request = await f.submit();
  const model = await f.submissions.reopen(request.jobId);
  const html = renderToStaticMarkup(
    createElement(CaptureProgress, {
      model,
      accountId: await f.getAccount(),
      busy: false,
      reading: false,
      error: true,
      canRetry: false,
      onRetry: vi.fn(),
      onRecover: vi.fn(),
      onOpenJob: vi.fn(),
      onActivity: vi.fn(),
      onNewImport: vi.fn(),
    }),
  );
  expect(html).toContain(t("capture.progress.recordedCounts", model.counts));
  expect(html).not.toContain(t("capture.progress.localCounts", model.counts));
});

it.each([
  [true, false],
  [false, true],
])(
  "current-account Active Imports revalidation error=%s loading=%s uses a neutral recorded batch",
  async (error, loading) => {
    const f = fixture();
    const request = await f.submit();
    const model = await f.submissions.reopen(request.jobId);
    for (const locale of ["en", "zh-Hans"] as const) {
      setUiLocale(locale);
      const props = {
        jobs: [model],
        expectedAccountId: await f.getAccount(),
        loading,
        error,
        hasMore: false,
        onRefresh: vi.fn(),
        onMore: vi.fn(),
        onOpenJob: vi.fn(),
        onReturn: vi.fn(),
        onHide: vi.fn(),
      };
      const stale = renderToStaticMarkup(createElement(CaptureActivityList, props));
      expect(stale).toContain(
        t("capture.jobView", {
          summary: t("capture.progress.batchTitle", { count: model.counts.selected }),
        }),
      );
      expect(stale).not.toContain(
        t("capture.jobView", {
          summary: t("capture.savedOne", { count: model.counts.accepted }),
        }),
      );
      expect(stale).not.toContain(
        t("capture.jobView", {
          summary: t("capture.savedOther", { count: model.counts.accepted }),
        }),
      );
      const legacy = renderToStaticMarkup(
        createElement(CaptureActivityList, { ...props, expectedAccountId: undefined }),
      );
      expect(legacy).toContain(
        t("capture.jobView", {
          summary: t(
            model.counts.accepted === 1 ? "capture.savedOne" : "capture.savedOther",
            { count: model.counts.accepted },
          ),
        }),
      );
    }
  },
);
