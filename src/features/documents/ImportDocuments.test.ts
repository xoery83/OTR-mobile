import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { ImportDocumentsList, ImportDocumentDetail } from "./ImportDocuments";
import type { ImportDocument } from "@/data/repositories/importDocumentsRepository";
import { setUiLocale, t } from "@/ui/locale";
import { uiPalette } from "@/ui/palette";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server");
const ui = vi.hoisted(() => ({
  previewAvailable: false,
  buttons: [] as { label: string; onPress(): void; disabled?: boolean }[],
}));
vi.mock("@/native/importOriginalPreview", () => ({
  isImportOriginalPreviewAvailable: () => ui.previewAvailable,
}));
vi.mock("react-native", () => ({
  View: "div",
  ScrollView: "main",
  StyleSheet: { create: (v: unknown) => v },
}));
vi.mock("@/ui/theme", () => ({
  useThemedStyles: (f: (c: unknown) => unknown) => f(uiPalette("light")),
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/controls", () => ({
  UiText: (p: { children: ReactNode }) => createElement("span", {}, p.children),
  UiSection: (p: { title: string; children: ReactNode }) =>
    createElement("section", {}, p.title, p.children),
  UiButton: (p: { label: string; onPress(): void; disabled?: boolean }) => {
    ui.buttons.push(p);
    return createElement("button", { disabled: p.disabled }, p.label);
  },
}));
beforeEach(() => {
  ui.previewAvailable = false;
  ui.buttons = [];
  setUiLocale("en");
});
function fixture() {
  const doc: ImportDocument = {
    captureId: randomUUID(),
    accountId: randomUUID(),
    tripId: null,
    kind: "TEXT",
    originalFilename: "私密原件",
    declaredContentType: null,
    recordedAt: "2026-10-28T00:00:00Z",
    payloadId: randomUUID(),
    sha256: "a".repeat(64),
    byteCount: 7,
    jobId: randomUUID(),
    batchId: randomUUID(),
    inputId: randomUUID(),
    custody: "LOCAL_RECORDED",
    cloudOriginal: "NOT_ASSERTED",
    visibility: "PRIVATE",
  };
  const onOpen = vi.fn(),
    onMore = vi.fn(),
    onRefresh = vi.fn();
  return {
    doc,
    onOpen,
    onMore,
    onRefresh,
    props: {
      documents: [doc],
      scope: "PERSONAL_INBOX" as const,
      accountId: doc.accountId,
      tripId: null,
      loading: false,
      error: false,
      hasMore: false,
      isCurrent: () => true,
      onOpen,
      onMore,
      onRefresh,
    },
  };
}
it("renders private originals separately and opens the exact real Capture identity", () => {
  const f = fixture();
  const html = renderToStaticMarkup(createElement(ImportDocumentsList, f.props));
  expect(html).toContain(f.doc.originalFilename);
  expect(html).toContain(t("importDocuments.inbox"));
  expect(html).toContain(t("importDocuments.private"));
  expect(html).not.toContain("SERVER_ACCEPTED");
  ui.buttons.find((b) => b.label === t("importDocuments.details"))!.onPress();
  expect(f.onOpen).toHaveBeenCalledWith(f.doc.captureId);
});
it.each(["account", "trip", "prior", "inactive"])(
  "withholds stale %s metadata before rendering",
  (boundary) => {
    const f = fixture();
    const html = renderToStaticMarkup(
      createElement(ImportDocumentsList, {
        ...f.props,
        ...(boundary === "account"
          ? { accountId: randomUUID() }
          : boundary === "inactive"
            ? { isCurrent: () => false }
            : boundary === "prior"
              ? { scope: "TRIP", tripId: null }
              : { scope: "TRIP", tripId: randomUUID() }),
      }),
    );
    expect(html).not.toContain(f.doc.originalFilename);
    expect(html).toContain(t("importDocuments.unavailable"));
  },
);
it("only a real accepted Batch binding exposes View Import Batch; stale original text is hidden", () => {
  const f = fixture(),
    openBatch = vi.fn();
  const props = {
    document: f.doc,
    accountId: f.doc.accountId,
    tripId: null,
    opening: false,
    error: false,
    isCurrent: () => true,
    onOpenOriginal: vi.fn(),
    onOpenActivity: openBatch,
    original: {
      captureId: randomUUID(),
      sha256: f.doc.sha256!,
      text: "Other private original",
    },
  };
  const html = renderToStaticMarkup(createElement(ImportDocumentDetail, props));
  expect(html).not.toContain("Other private original");
  ui.buttons.find((b) => b.label === t("importDocuments.openBatch"))!.onPress();
  expect(openBatch).toHaveBeenCalledWith(f.doc.jobId);
  ui.buttons = [];
  renderToStaticMarkup(
    createElement(ImportDocumentDetail, {
      ...props,
      document: { ...f.doc, jobId: null, batchId: null, inputId: null },
    }),
  );
  expect(ui.buttons.some((b) => b.label === t("importDocuments.openBatch"))).toBe(false);
});
it("preserves verified text and local/cloud distinction in both supported locales", () => {
  const f = fixture();
  for (const locale of ["en", "zh-Hans"] as const) {
    setUiLocale(locale);
    const html = renderToStaticMarkup(
      createElement(ImportDocumentDetail, {
        document: f.doc,
        accountId: f.doc.accountId,
        tripId: null,
        opening: false,
        error: false,
        isCurrent: () => true,
        onOpenOriginal: vi.fn(),
        original: {
          captureId: f.doc.captureId,
          sha256: f.doc.sha256!,
          text: "NZ501 AKL CHC 2026-11-02",
        },
      }),
    );
    expect(html).toContain("NZ501 AKL CHC 2026-11-02");
    expect(html).toContain(t("importDocuments.custodyExplanation"));
  }
});

it("keeps binary original opening disabled without explicit qualified Native configuration", () => {
  vi.stubEnv("EXPO_PUBLIC_OTR_IMPORT_ORIGINAL_PREVIEW_ENABLED", undefined);
  try {
    const f = fixture(),
      onOpenOriginal = vi.fn();
    renderToStaticMarkup(
      createElement(ImportDocumentDetail, {
        document: { ...f.doc, kind: "FILE", declaredContentType: "application/pdf" },
        accountId: f.doc.accountId,
        tripId: null,
        opening: false,
        error: false,
        isCurrent: () => true,
        onOpenOriginal,
      }),
    );
    const open = ui.buttons.find((b) => b.label === t("importDocuments.openOriginal"))!;
    expect(open.disabled).toBe(true);
    open.onPress();
    expect(onOpenOriginal).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllEnvs();
  }
});

it("shows pending associations and offers a scoped readonly retry after failure", () => {
  const { doc } = fixture();
  const retry = vi.fn();
  let current = true;
  const props = {
    document: doc,
    accountId: doc.accountId,
    tripId: doc.tripId,
    opening: false,
    error: false,
    isCurrent: () => current,
    onOpenOriginal: vi.fn(),
    onRetryLinks: retry,
  };
  const pending = renderToStaticMarkup(
    createElement(ImportDocumentDetail, { ...props, linksLoading: true }),
  );
  expect(pending).toContain(t("common.loading"));
  expect(pending).not.toContain(t("importDocuments.importedItems", { count: 0 }));
  renderToStaticMarkup(
    createElement(ImportDocumentDetail, { ...props, linksUnavailable: true }),
  );
  const button = ui.buttons.find((b) => b.label === t("capture.activityRefresh"))!;
  button.onPress();
  expect(retry).toHaveBeenCalledOnce();
  current = false;
  button.onPress();
  expect(retry).toHaveBeenCalledOnce();
});

it("opens a repository original only through an available versioned Native adapter", () => {
  ui.previewAvailable = true;
  const f = fixture(),
    onOpenOriginal = vi.fn();
  let current = true;
  renderToStaticMarkup(
    createElement(ImportDocumentDetail, {
      document: { ...f.doc, kind: "FILE", declaredContentType: "application/pdf" },
      accountId: f.doc.accountId,
      tripId: null,
      opening: false,
      error: false,
      isCurrent: () => current,
      onOpenOriginal,
    }),
  );
  const open = ui.buttons.find((b) => b.label === t("importDocuments.openOriginal"))!;
  expect(open.disabled).toBe(false);
  open.onPress();
  expect(onOpenOriginal).toHaveBeenCalledExactlyOnceWith(f.doc.captureId);
  current = false;
  open.onPress();
  expect(onOpenOriginal).toHaveBeenCalledOnce();
});
