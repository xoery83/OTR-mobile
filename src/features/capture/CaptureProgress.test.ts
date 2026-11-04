import * as mixedQa from "@/data/operations/captureMixedQaManifest";
import { createElement } from "react";
import { createRequire } from "node:module";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  fixture,
  now,
  sha256,
} from "@/data/repositories/__fixtures__/captureBatchAssessment";
import { createCaptureProcessingRepository } from "@/data/repositories/captureProcessingRepository";
import { buildCaptureLocalResult } from "@/domain/capture/captureLocalInterpretation";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import { randomUUID } from "node:crypto";
import { CaptureProgress } from "./CaptureProgress";
import { CaptureActivityList, captureActivityTime } from "./CaptureActivity";
import { t, setUiLocale } from "@/ui/locale";
import { uiPalette } from "@/ui/palette";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server");
const state = vi.hoisted(() => ({
  buttons: [] as any[],
  photoRows: [] as any[],
  universalViews: [] as any[],
  scrollProps: null as any,
  scrollTo: vi.fn(),
  detailsOpen: false,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  lazy: () => (props: any) => {
    state.universalViews.push(props);
    return createElement("aside");
  },
  useState: () => [
    state.detailsOpen,
    (value: boolean | ((open: boolean) => boolean)) => {
      state.detailsOpen = typeof value === "function" ? value(state.detailsOpen) : value;
    },
  ],
}));
vi.mock("./CaptureCustodyDevAction", () => ({ CaptureCustodyDevAction: () => null }));
vi.mock("./UniversalPhotoRelevanceRow", () => ({
  UniversalPhotoRelevanceRow: (props: any) => {
    state.photoRows.push(props);
    return createElement("aside", {}, props.copy.title);
  },
}));
vi.mock("react-native", async () => ({
  View: "div",
  Text: "span",
  ScrollView: (await import("react")).forwardRef((props: any, ref: any) => {
    state.scrollProps = props;
    if (ref) ref.current = { scrollTo: state.scrollTo };
    return createElement("main", {}, props.children);
  }),
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
  vi.restoreAllMocks();
  state.buttons = [];
  state.photoRows = [];
  state.universalViews = [];
  state.scrollTo.mockClear();
  state.detailsOpen = false;
  setUiLocale("en");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each([
  [true, undefined, false],
  [false, undefined, false],
  [false, "true", true],
  [false, "false", false],
  [true, "true", true],
  [true, "false", false],
] as const)(
  "offers bounded paging for DEV=%s with QA opt-in %s",
  (dev, optIn, enabled) => {
    vi.stubGlobal("__DEV__", dev);
    vi.stubEnv("EXPO_PUBLIC_OTR_CAPTURE_QA_PAGING", optIn);
    renderToStaticMarkup(
      createElement(CaptureProgress, {
        model: null,
        accountId: "qa",
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
    const up = state.buttons.find((b) => b.label === t("capture.progress.pageUp"));
    const down = state.buttons.find((b) => b.label === t("capture.progress.pageDown"));
    expect(!!up).toBe(enabled);
    expect(!!down).toBe(enabled);
    if (!enabled) return;
    state.scrollProps.onLayout({ nativeEvent: { layout: { height: 800 } } });
    state.scrollProps.onContentSizeChange(400, 2200);
    down.onPress();
    down.onPress();
    down.onPress();
    expect(state.scrollTo.mock.calls.map(([p]) => p)).toEqual([
      { y: 640, animated: false },
      { y: 1280, animated: false },
      { y: 1400, animated: false },
    ]);
    state.scrollProps.onScroll({ nativeEvent: { contentOffset: { y: 730 } } });
    up.onPress();
    up.onPress();
    expect(state.scrollTo.mock.calls.slice(-2).map(([p]) => p.y)).toEqual([90, 0]);
  },
);
it("retains C3 validation history behind the processing-details disclosure", async () => {
  state.detailsOpen = true;
  const f = fixture();
  const request = await f.submit();
  const context = await captureAccountRequestContext("", f.getAccount);
  const processing = createCaptureProcessingRepository(f.db, f.getAccount, {
    now,
    sha256,
    newId: randomUUID,
  });
  await processing.schedule(context, request.jobId);
  await processing.run(context);
  const stored = await f.submissions.reopen(request.jobId);
  const model = {
    ...stored,
    processing: { ...stored.processing, capability: "LOCAL_VALIDATION" as const },
    processingEvents: await processing.events(context, request.jobId),
  };
  const html = renderToStaticMarkup(
    createElement(CaptureProgress, {
      model,
      accountId: context.accountId,
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
  expect(html).toContain(t("capture.processing.INPUT_VALIDATED"));
  expect(html).toContain(t("capture.processing.waitingInterpreter"));
  expect(html).toContain(t("capture.progress.localValidationHistory"));
  expect(html).not.toContain(t("capture.progress.partialHistory"));
  expect(model.availableActions.canReviewNow).toBe(false);
});
it("shows a local partial result and C4 event without granting Review", async () => {
  state.detailsOpen = true;
  const f = fixture();
  const request = await f.submit();
  const stored = await f.submissions.reopen(request.jobId);
  const text = "Flight: NZ123";
  const result = buildCaptureLocalResult(
    stored.inputs[0].id,
    {
      engine: "apple-pdfkit",
      text,
      pages: [{ pageIndex: 0, start: 0, end: text.length }],
      originalSha256: "a".repeat(64),
      originalByteCount: 10,
    },
    { sha256: "a".repeat(64), byteCount: 10 },
    "b".repeat(64),
    "UNAVAILABLE",
  );
  const model = {
    ...stored,
    localInterpretationEvents: [
      {
        inputId: stored.inputs[0].id,
        sequence: 1,
        state: "LOCAL_RESULT_RECORDED" as const,
        recordedAt: stored.batch.createdAt,
        attemptCount: 0,
      },
    ],
    localInterpretationResults: [result],
  };
  const html = renderToStaticMarkup(
    createElement(CaptureProgress, {
      model,
      accountId: stored.batch.accountId,
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
  expect(html).toContain(t("capture.processing.localPartial"));
  expect(html).toContain(t("capture.processing.LOCAL_RESULT_RECORDED"));
  expect(html).not.toContain(t("capture.processing.waitingInterpreter"));
  expect(model.availableActions.canReviewNow).toBe(false);
});
it("keeps mixed originals visible while processing details open and close without changing intake", async () => {
  const f = fixture();
  const request = await f.submit(3);
  const model = await f.submissions.reopen(request.jobId);
  model.inputs[0].originalFilename = "confirmation.png";
  model.inputs[1].originalFilename = "confirmation.pdf";
  const props = {
    model,
    accountId: model.batch.accountId,
    busy: false,
    reading: false,
    error: false,
    canRetry: false,
    onRetry: vi.fn(),
    onRecover: vi.fn(),
    onOpenJob: vi.fn(),
    onActivity: vi.fn(),
    onNewImport: vi.fn(),
  };
  const original = JSON.stringify(model);
  for (const locale of ["en", "zh-Hans"] as const) {
    setUiLocale(locale);
    state.detailsOpen = false;
    const render = () => renderToStaticMarkup(createElement(CaptureProgress, props));
    let html = render();
    expect(html).toContain("confirmation.png");
    expect(html).toContain("confirmation.pdf");
    expect(html).toContain(t("capture.ai.submittedText"));
    expect(html).not.toContain(t("capture.progress.registered"));
    state.buttons
      .findLast((b) => b.label === t("capture.progress.showDetails"))
      .onPress();
    html = render();
    expect(html).toContain(t("capture.progress.registered"));
    state.buttons
      .findLast((b) => b.label === t("capture.progress.hideDetails"))
      .onPress();
    expect(render()).not.toContain(t("capture.progress.registered"));
    expect(JSON.stringify(model)).toBe(original);
    expect(props.onRetry).not.toHaveBeenCalled();
  }
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
it("offers exact-session local retry only when its owning host retains a retryable reader", async () => {
  const f = fixture();
  const request = f.request();
  const { LocalCaptureError } = await import("@/domain/capture/localCapture");
  await f.submissions.submit(
    request,
    new Map(
      request.inputs.map((i) => [
        i.id,
        async () => {
          throw new LocalCaptureError("READER_FAILURE");
        },
      ]),
    ),
  );
  const model = await f.submissions.reopen(request.jobId);
  for (const canRetry of [false, true]) {
    state.buttons = [];
    renderToStaticMarkup(
      createElement(CaptureProgress, {
        model,
        accountId: await f.getAccount(),
        busy: false,
        reading: false,
        error: false,
        canRetry,
        onRetry: vi.fn(),
        onRecover: vi.fn(),
        onOpenJob: vi.fn(),
        onActivity: vi.fn(),
        onNewImport: vi.fn(),
      }),
    );
    expect(state.buttons.some((b) => b.label === t("capture.progress.retryIntake"))).toBe(
      canRetry,
    );
  }
});

it.each([
  ["IMAGE", "image/jpeg", "photos", "Retained photo.jpg"],
  ["FILE", "image/png", "files", "Retained photo.png"],
] as const)(
  "accepted %s %s rows receive existing Photo controls when another Source is not accepted",
  async (kind, mime, acquisition, filename) => {
    const f = fixture();
    const request = f.request(2);
    request.inputs[0].kind = kind;
    request.inputs[0].acquisitionSource = acquisition;
    request.inputs[0].declaredContentType = mime;
    request.inputs[0].originalFilename = filename;
    const { LocalCaptureError } = await import("@/domain/capture/localCapture");
    await f.submissions.submit(
      request,
      new Map(
        request.inputs.map((input, i) => [
          input.id,
          async () => {
            if (i) throw new LocalCaptureError("READER_FAILURE");
            return {
              bytes:
                mime === "image/png"
                  ? Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)
                  : Uint8Array.of(255, 216, 255, 1, 2),
            };
          },
        ]),
      ),
    );
    const model = await f.submissions.reopen(request.jobId);
    expect(model.allInputsAccepted).toBe(false);
    const current = () => true;
    const copy = {
      title: "Local photo controls",
    } as import("./UniversalPhotoRelevanceRow").UniversalPhotoRelevanceCopy;
    const props = {
      model,
      accountId: await f.getAccount(),
      busy: false,
      reading: false,
      error: false,
      canRetry: false,
      onRetry: vi.fn(),
      onRecover: vi.fn(),
      onOpenJob: vi.fn(),
      onActivity: vi.fn(),
      onNewImport: vi.fn(),
      isCurrent: current,
      photoRelevanceCopy: copy,
    };
    const html = renderToStaticMarkup(createElement(CaptureProgress, props));
    expect(html).toContain(copy.title);
    expect(state.photoRows).toHaveLength(1);
    expect(state.universalViews).toHaveLength(0);
    expect(state.photoRows[0]).toMatchObject({
      model,
      input: model.inputs[0],
      isCurrent: current,
      copy,
    });
    expect(html).toContain(t("capture.failed"));
    for (const update of [
      { photoRelevanceCopy: undefined },
      { isCurrent: undefined },
      { reading: true },
      { error: true },
      { accountId: "foreign" },
    ]) {
      state.photoRows = [];
      renderToStaticMarkup(createElement(CaptureProgress, { ...props, ...update }));
      expect(state.photoRows).toHaveLength(0);
    }
  },
);

it("identifies current Activity batches by retained filenames without exposing stale metadata", async () => {
  const f = fixture();
  const request = await f.submit();
  const model = await f.submissions.reopen(request.jobId);
  model.inputs[0].originalFilename = "Harbour-stay-confirmation.pdf";
  const props = {
    jobs: [model],
    expectedAccountId: model.batch.accountId,
    loading: false,
    error: false,
    hasMore: false,
    onRefresh: vi.fn(),
    onMore: vi.fn(),
    onOpenJob: vi.fn(),
    onReturn: vi.fn(),
    onHide: vi.fn(),
  };
  expect(
    renderToStaticMarkup(
      createElement(CaptureActivityList, { ...props, isCurrent: () => true }),
    ),
  ).toContain("Harbour-stay-confirmation.pdf");
  expect(
    renderToStaticMarkup(
      createElement(CaptureActivityList, { ...props, isCurrent: () => false }),
    ),
  ).not.toContain("Harbour-stay-confirmation.pdf");
});

it("QA preparation is an explicit single-flight action; render and details never prepare", async () => {
  state.detailsOpen = true;
  const f = fixture();
  const request = await f.submit();
  const model = await f.submissions.reopen(request.jobId);
  vi.spyOn(mixedQa, "canPrepareMixedQaSourceProposals").mockReturnValue(true);
  let done!: () => void;
  const pending = new Promise<void>((r) => {
    done = r;
  });
  const prepare = vi
    .spyOn(mixedQa, "prepareMixedQaSourceProposals")
    .mockReturnValue(pending);
  const exported = vi
    .spyOn(mixedQa, "exportMixedQaManifest")
    .mockResolvedValue(undefined);
  const isCurrent = () => true;
  renderToStaticMarkup(
    createElement(CaptureProgress, {
      model,
      accountId: model.batch.accountId,
      busy: false,
      reading: false,
      error: false,
      canRetry: false,
      onRetry: vi.fn(),
      onRecover: vi.fn(),
      onOpenJob: vi.fn(),
      onActivity: vi.fn(),
      onNewImport: vi.fn(),
      isCurrent,
    }),
  );
  expect(prepare).not.toHaveBeenCalled();
  const button = state.buttons.find(
    (b) => b.label === t("capture.qa.prepareLocalProposals"),
  );
  expect(button).toBeTruthy();
  const first = button.onPress();
  await button.onPress();
  expect(prepare).toHaveBeenCalledTimes(1);
  done();
  await first;
  expect(exported).toHaveBeenCalledExactlyOnceWith(model, isCurrent);
});
it("ordinary input never shows the finite QA preparation action", async () => {
  state.detailsOpen = true;
  const f = fixture();
  const request = await f.submit();
  const model = await f.submissions.reopen(request.jobId);
  renderToStaticMarkup(
    createElement(CaptureProgress, {
      model,
      accountId: model.batch.accountId,
      busy: false,
      reading: false,
      error: false,
      canRetry: false,
      onRetry: vi.fn(),
      onRecover: vi.fn(),
      onOpenJob: vi.fn(),
      onActivity: vi.fn(),
      onNewImport: vi.fn(),
      isCurrent: () => true,
    }),
  );
  expect(
    state.buttons.some((b) => b.label === t("capture.qa.prepareLocalProposals")),
  ).toBe(false);
});

it("Show Details remains read-only even when the finite local-prepare action is available", async () => {
  const f = fixture();
  const request = await f.submit();
  const model = await f.submissions.reopen(request.jobId);
  vi.spyOn(mixedQa, "canPrepareMixedQaSourceProposals").mockReturnValue(true);
  const prepare = vi
    .spyOn(mixedQa, "prepareMixedQaSourceProposals")
    .mockResolvedValue(undefined);
  const exported = vi
    .spyOn(mixedQa, "exportMixedQaManifest")
    .mockResolvedValue(undefined);
  renderToStaticMarkup(
    createElement(CaptureProgress, {
      model,
      accountId: model.batch.accountId,
      busy: false,
      reading: false,
      error: false,
      canRetry: false,
      onRetry: vi.fn(),
      onRecover: vi.fn(),
      onOpenJob: vi.fn(),
      onActivity: vi.fn(),
      onNewImport: vi.fn(),
      isCurrent: () => true,
    }),
  );
  state.buttons.find((b) => b.label === t("capture.progress.showDetails")).onPress();
  await vi.waitFor(() => expect(exported).toHaveBeenCalledTimes(1));
  expect(prepare).not.toHaveBeenCalled();
});

it("gives the current Results view one shared original list while preserving all local rows", async () => {
  const f = fixture(),
    request = await f.submit(3),
    model = await f.submissions.reopen(request.jobId);
  model.inputs[0].originalFilename = "one.png";
  model.inputs[1].originalFilename = "two.pdf";
  const html = renderToStaticMarkup(
    createElement(CaptureProgress, {
      model,
      accountId: model.batch.accountId,
      busy: false,
      reading: false,
      error: false,
      canRetry: false,
      isCurrent: () => true,
      onRetry: vi.fn(),
      onRecover: vi.fn(),
      onOpenJob: vi.fn(),
      onActivity: vi.fn(),
      onNewImport: vi.fn(),
    }),
  );
  expect(state.universalViews).toHaveLength(1);
  expect(state.universalViews[0]).toMatchObject({
    model,
    originalsListedElsewhere: true,
  });
  expect(html).toContain("one.png");
  expect(html).toContain("two.pdf");
  expect(html).toContain(t("capture.ai.submittedText"));
  expect(html.split(t("capture.ai.originals"))).toHaveLength(2);
});
