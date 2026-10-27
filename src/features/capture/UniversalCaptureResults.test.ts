import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { UniversalResultView } from "./UniversalCaptureResults";
import type { UniversalImportResult } from "@/data/api/universalImportContracts";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import { setUiLocale, t } from "@/ui/locale";
import { uiPalette } from "@/ui/palette";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server");
const state = vi.hoisted(() => ({
  buttons: [] as { label: string; disabled?: boolean; onPress(): void }[],
}));
vi.mock("./useUniversalCapture", () => ({ useUniversalCapture: vi.fn() }));
vi.mock("react-native", () => ({
  View: "div",
  Modal: "dialog",
  StyleSheet: { create: (v: unknown) => v },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaProvider: "div" }));
vi.mock("@/components/AppIcon", () => ({
  AppIcon: (p: { name: string }) => createElement("i", { "data-format-icon": p.name }),
}));
vi.mock("@/ui/theme", () => ({
  useThemedStyles: (f: (c: unknown) => unknown) => f(uiPalette("light")),
  useUiTheme: () => uiPalette("light"),
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/controls", () => ({
  UiText: (p: { children: ReactNode }) => createElement("span", {}, p.children),
  UiSection: (p: { title: string; children: ReactNode }) =>
    createElement("section", {}, p.title, p.children),
  UiButton: (p: { label: string; disabled?: boolean; onPress(): void }) => {
    state.buttons.push(p);
    return createElement("button", { disabled: p.disabled }, p.label);
  },
}));
beforeEach(() => {
  state.buttons = [];
  setUiLocale("en");
});
function fixture() {
  const accountId = randomUUID(),
    tripId = randomUUID(),
    batchId = randomUUID();
  const inputs = [
    { id: randomUUID(), kind: "FILE", originalFilename: "行程.txt" },
    { id: randomUUID(), kind: "TEXT", originalFilename: null },
  ];
  const bindings = inputs.map((input, index) => ({
    alias: `S${index}`,
    inputId: input.id,
    sourceId: randomUUID(),
    representationId: randomUUID(),
    revision: 1,
    mime: "text/plain",
    originalSha256: "a".repeat(64),
    submittedSha256: "a".repeat(64),
    status: "READY",
  }));
  const evidence = (alias: string, path: string, raw: string) => ({
    sourceId: alias,
    path,
    raw,
    start: 0,
    end: raw.length,
  });
  const candidate = {
    id: "1".repeat(24),
    token: "i1",
    kind: "P1" as const,
    subtype: "ACTIVITY",
    fields: [
      evidence("S0", "activity.name", "Museum walk"),
      evidence("S1", "activity.date", "2026-11-03"),
    ],
    bookingTokens: [],
    ticketTokens: [],
    validation: "CANDIDATE_VALIDATED" as const,
    admission: "NOT_RUN" as const,
    closure: "POLICY_PENDING" as const,
    visualReviewRequired: false,
    presentationTier: "HIGH_CONFIDENCE" as const,
  };
  const result = {
    version: "otr.backend.universal-interpretation/1",
    actorId: accountId,
    accountId,
    tripId,
    batchId,
    taskId: randomUUID(),
    requestSha256: "b".repeat(64),
    status: "CANDIDATES_READY",
    promptVersion: "fixture",
    providerOutcome: "SETTLED",
    providerReceipt: null,
    sourceBindings: bindings,
    candidates: [
      candidate,
      {
        ...candidate,
        id: "2".repeat(24),
        token: "i2",
        kind: "P3",
        subtype: "ACCOMMODATION",
        fields: [evidence("S0", "property.name", "Grand Hotel")],
      },
    ],
    bookingObservations: [],
    ticketObservations: [],
    quality: null,
    minimumFacts: [],
    sourceObservations: [],
    advisoryStatus: "ABSENT",
    advisoryIssues: [],
    outputCoverage: "PARTIAL_COVERAGE",
    coverageGaps: [],
    unresolved: [],
    formalReview: "NOT_RUN",
    admission: "NOT_RUN",
    canonicalWrites: false,
  } as UniversalImportResult;
  const model = {
    allInputsAccepted: true,
    inputs,
    batch: { accountId, batchId, context: { tripPrior: { id: tripId } } },
  } as unknown as CaptureJobReadModel;
  const props = {
    model,
    result,
    busy: false,
    unavailable: false,
    attempted: true,
    canStart: false,
    isCurrent: () => true,
    start: vi.fn(),
    recover: vi.fn(),
  };
  return { props, result, bindings, evidence };
}
it("shows mixed candidates and each field's actual original without creating linked Canonical items", () => {
  const f = fixture(),
    html = renderToStaticMarkup(createElement(UniversalResultView, f.props));
  expect(html).toContain("Museum walk");
  expect(html).toContain("Grand Hotel");
  expect(html).toContain("行程.txt");
  expect(html).toContain(t("capture.ai.submittedText"));
  expect(html).toContain(t("capture.ai.notSaved"));
  expect(html).toContain("doc.text");
  expect(html).not.toContain(f.result.candidates[0].id);
  expect(state.buttons.some((b) => b.label === t("capture.ai.manual"))).toBe(true);
});
it("keeps ticket observations distinct from rights and content classification distinct from file format", () => {
  const f = fixture(),
    binding = f.bindings[0];
  f.result.ticketObservations = [
    {
      id: "3".repeat(24),
      token: "t1",
      label: f.evidence("S0", "label", "QA entry ticket"),
      objectTokens: ["i1"],
      authority: "NONE",
    },
  ];
  f.result.sourceObservations = [
    {
      type: "DOCUMENT_CLASSIFICATION",
      labels: ["TICKET", "INVOICE"],
      authority: "ADVISORY_ONLY",
      evidence: { ...binding, raw: "QA original", start: 0, end: 11 },
    },
  ];
  const html = renderToStaticMarkup(createElement(UniversalResultView, f.props));
  expect(html).toContain(t("capture.ai.ticketObservation"));
  expect(html).toContain(t("capture.ai.contentInvoice"));
  expect(html).toContain(t("capture.ai.contentTicket"));
  expect(html).toContain("doc.text");
  expect(html).toContain(t("capture.ai.observationsOnly"));
});
it("retains optional source details without making them creation requirements", () => {
  const f = fixture();
  f.result.sourceObservations = [
    {
      type: "OPTIONAL_SOURCE_FIELD",
      authority: "SOURCE_OBSERVATION_ONLY",
      evidence: { ...f.bindings[1], raw: "QA Contact" },
      label: { raw: "Hotel contact" },
    },
  ];
  const html = renderToStaticMarkup(createElement(UniversalResultView, f.props));
  expect(html).toContain("QA Contact");
  expect(html).toContain("Hotel contact");
  expect(html).not.toContain(t("capture.ai.missingFacts"));
});
it("UNKNOWN does not become ABSTAIN or a repeat paid action", () => {
  const f = fixture();
  f.result.status = "EXECUTION_OUTCOME_UNKNOWN";
  f.result.providerOutcome = "UNKNOWN";
  f.result.candidates = [];
  const html = renderToStaticMarkup(createElement(UniversalResultView, f.props));
  expect(html).toContain(t("capture.ai.unknown"));
  expect(html).not.toContain(t("capture.ai.noCandidates"));
  expect(state.buttons.some((b) => b.label === t("capture.ai.process"))).toBe(false);
  state.buttons.find((b) => b.label === t("capture.ai.check"))!.onPress();
  expect(f.props.recover).toHaveBeenCalledOnce();
  expect(f.props.start).not.toHaveBeenCalled();
});
it("empty results retain the manual entry without forcing a formal Review", () => {
  const f = fixture();
  f.result.candidates = [];
  f.result.status = "ABSTAIN";
  const html = renderToStaticMarkup(createElement(UniversalResultView, f.props));
  expect(html).toContain(t("capture.ai.noCandidates"));
  expect(html).toContain(t("capture.ai.manual"));
  expect(html).not.toContain("Review now");
});
it("Chinese preview keeps supplied original names and uses localized status", () => {
  setUiLocale("zh-Hans");
  const f = fixture();
  const html = renderToStaticMarkup(createElement(UniversalResultView, f.props));
  expect(html).toContain("行程.txt");
  expect(html).toContain(t("capture.ai.notSaved"));
  expect(html).toContain(t("capture.ai.manual"));
  setUiLocale("en");
});

it("offers GET-only recovery on a cold Batch before any new interpretation attempt", () => {
  const f = fixture();
  renderToStaticMarkup(createElement(UniversalResultView, {
    ...f.props, result: null, attempted: false, canStart: true,
  }));
  const check = state.buttons.find((b) => b.label === t("capture.ai.check"));
  expect(check?.disabled).toBe(false);
  check!.onPress();
  expect(f.props.recover).toHaveBeenCalledOnce();
  expect(f.props.start).not.toHaveBeenCalled();
});
