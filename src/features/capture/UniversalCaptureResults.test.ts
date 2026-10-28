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
      evidence("S0", "activity.date", "2026-11-03"),
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
    quality: {
      decisions: [
        {
          token: "i1",
          kind: "P1",
          tier: "REVIEWABLE",
          reasons: ["FIELD_EVIDENCE_PARTIAL"],
          sourceIds: ["S0"],
          fieldCount: 2,
        },
      ],
      acceptedTokens: [],
      reviewableTokens: ["i1"],
      abstainedTokens: [],
      formalQualification: "NOT_SCORABLE",
    },
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
  expect(html).toContain(t("capture.ai.suggestionsStatus"));
  expect(html).not.toContain(t("capture.ai.notSaved"));
  expect(html).toContain("doc.text");
  expect(html).not.toContain(f.result.candidates[0].id);
  expect(state.buttons.some((b) => b.label === t("capture.ai.manual"))).toBe(false);
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
it("empty results preserve originals while the deferred manual-editor entry stays closed", () => {
  const f = fixture();
  f.result.candidates = [];
  f.result.status = "ABSTAIN";
  const html = renderToStaticMarkup(createElement(UniversalResultView, f.props));
  expect(html).toContain(t("capture.ai.noCandidates"));
  expect(html).not.toContain(t("capture.ai.manual"));
  expect(html).not.toContain("Review now");
});
it("Chinese preview keeps supplied original names and uses localized status", () => {
  setUiLocale("zh-Hans");
  const f = fixture();
  const html = renderToStaticMarkup(createElement(UniversalResultView, f.props));
  expect(html).toContain("行程.txt");
  expect(html).toContain(t("capture.ai.suggestionsStatus"));
  expect(html).not.toContain(t("capture.ai.notSaved"));
  expect(html).not.toContain(t("capture.ai.manual"));
  setUiLocale("en");
});

it("offers GET-only recovery on a cold Batch before any new interpretation attempt", () => {
  const f = fixture();
  renderToStaticMarkup(
    createElement(UniversalResultView, {
      ...f.props,
      result: null,
      attempted: false,
      canStart: true,
    }),
  );
  const check = state.buttons.find((b) => b.label === t("capture.ai.check"));
  expect(check?.disabled).toBe(false);
  check!.onPress();
  expect(f.props.recover).toHaveBeenCalledOnce();
  expect(f.props.start).not.toHaveBeenCalled();
});

it("keeps P1 confirmation disabled until original, Journey and NEW have been reviewed", () => {
  const f = fixture(),
    confirm = vi.fn(async () => {}),
    admission = {
      enabled: true,
      busyToken: null,
      statuses: {},
      confirm,
      readOriginal: vi.fn(async () => "original"),
    };
  const html = renderToStaticMarkup(
    createElement(UniversalResultView, { ...f.props, admission }),
  );
  expect(confirm).not.toHaveBeenCalled();
  expect(html).toContain("Grand Hotel");
  const buttons = state.buttons.filter((b) => b.label === t("capture.ai.p1Confirm"));
  expect(buttons).toHaveLength(1);
  expect(buttons[0].disabled).toBe(true);
  buttons[0].onPress();
  expect(confirm).not.toHaveBeenCalled();
  expect(html).toContain(t("capture.ai.p1OpenOriginal"));
});
it("keeps Source sync pending separate from accepted and disables a stale view", () => {
  const f = fixture(),
    confirm = vi.fn(async () => {}),
    admission = {
      enabled: true,
      busyToken: "i1",
      statuses: { i1: "SYNC_PENDING" as const },
      confirm,
      readOriginal: vi.fn(async () => "original"),
    };
  const html = renderToStaticMarkup(
    createElement(UniversalResultView, { ...f.props, isCurrent: () => false, admission }),
  );
  expect(html).toContain(t("capture.ai.p1Pending"));
  expect(html).not.toContain(t("capture.ai.p1Accepted"));
  expect(state.buttons.find((b) => b.label === t("capture.ai.p1Confirm"))?.disabled).toBe(
    true,
  );
  expect(confirm).not.toHaveBeenCalled();
});
it("shows the P3 three-field review only with its own family opt-in and keeps confirmation explicit", () => {
  const f = fixture(),
    stay = f.result.candidates.find((c) => c.kind === "P3")!;
  stay.fields.push(
    f.evidence("S0", "check_in.date", "2026-11-02"),
    f.evidence("S0", "check_out.date", "2026-11-03"),
  );
  f.result.quality!.decisions.push({
    token: stay.token,
    kind: "P3",
    tier: "REVIEWABLE",
    reasons: [],
    sourceIds: ["S0"],
    fieldCount: 3,
  });
  const confirm = vi.fn(async () => {});
  const admission = {
    enabled: true,
    enabledFamilies: ["P3"] as const,
    statuses: {},
    busyToken: null,
    confirm,
    readOriginal: vi.fn(async () => "original"),
  };
  const html = renderToStaticMarkup(
    createElement(UniversalResultView, { ...f.props, admission }),
  );
  expect(html).toContain("2026-11-02");
  expect(html).toContain("2026-11-03");
  const button = state.buttons.find((b) => b.label === t("capture.ai.p3Confirm"));
  expect(button?.disabled).toBe(true);
  button!.onPress();
  expect(confirm).not.toHaveBeenCalled();
  expect(state.buttons.some((b) => b.label === t("capture.ai.p1Confirm"))).toBe(false);
});

it("offers the explicit P2 literal/date review only under its own opt-in, without changing generic readiness", () => {
  const f = fixture(),
    flight = f.result.candidates[0];
  Object.assign(flight, {
    kind: "P2",
    subtype: "FLIGHT",
    presentationTier: "INCOMPLETE",
    fields: [
      f.evidence("S0", "service", "NZ501"),
      f.evidence("S0", "origin.local_date", "2026-11-02"),
    ],
  });
  f.result.quality!.decisions[0].kind = "P2";
  const confirm = vi.fn(async () => {});
  renderToStaticMarkup(
    createElement(UniversalResultView, {
      ...f.props,
      admission: {
        enabled: true,
        enabledFamilies: ["P1"],
        statuses: {},
        busyToken: null,
        confirm,
        readOriginal: vi.fn(async () => "original"),
      },
    }),
  );
  expect(state.buttons.some((b) => b.label === t("capture.ai.p2Confirm"))).toBe(false);
  state.buttons = [];
  const html = renderToStaticMarkup(
    createElement(UniversalResultView, {
      ...f.props,
      admission: {
        enabled: true,
        enabledFamilies: ["P2"],
        statuses: {},
        busyToken: null,
        confirm,
        readOriginal: vi.fn(async () => "original"),
      },
    }),
  );
  expect(html).toContain("NZ501");
  expect(html).toContain(t("capture.ai.p2Details"));
  const button = state.buttons.find((b) => b.label === t("capture.ai.p2Confirm"));
  expect(button?.disabled).toBe(true);
  button!.onPress();
  expect(confirm).not.toHaveBeenCalled();
  expect(flight.presentationTier).toBe("INCOMPLETE");
});

it.each([
  [true, "title"],
  [false, "title"],
  [true, "rental.company"],
  [false, "agency.name"],
] as const)(
  "offers explicit Rental review with optional return %s and evidenced name %s under its own opt-in",
  (hasReturn, titlePath) => {
    const f = fixture(),
      rental = f.result.candidates[0];
    Object.assign(rental, {
      kind: "P4",
      subtype: "RENTAL_CAR",
      fields: [
        f.evidence("S0", titlePath, "Harbour QA Rental"),
        f.evidence("S0", "pickup.date", "2026-11-03"),
        ...(hasReturn ? [f.evidence("S0", "return.date", "2026-11-05")] : []),
      ],
    });
    f.result.quality!.decisions[0].kind = "P4";
    const confirm = vi.fn(async () => {});
    const html = renderToStaticMarkup(
      createElement(UniversalResultView, {
        ...f.props,
        admission: {
          enabled: true,
          enabledFamilies: ["P4"],
          statuses: {},
          busyToken: null,
          confirm,
          readOriginal: vi.fn(async () => "original"),
        },
      }),
    );
    expect(html).toContain("Harbour QA Rental");
    expect(html).toContain("2026-11-03");
    const button = state.buttons.find((b) => b.label === t("capture.ai.p4Confirm"));
    expect(button?.disabled).toBe(true);
    button!.onPress();
    expect(confirm).not.toHaveBeenCalled();
    expect(state.buttons.some((b) => b.label === t("capture.ai.p1Confirm"))).toBe(false);
  },
);

it.each(["TRAIN", "TAXI"])(
  "offers only evidenced Train P5 review, never maps %s to another transport",
  (subtype) => {
    const f = fixture();
    Object.assign(f.result.candidates[0], {
      kind: "P5",
      subtype,
      fields: [
        f.evidence("S0", "service", "Coastal QA Train"),
        f.evidence("S0", "operator.name", "Coastal QA Rail"),
        f.evidence("S0", "service.number", "CQ101"),
        f.evidence("S0", "origin.local_date", "2026-11-04"),
        f.evidence("S0", "transport_subtype", subtype),
      ],
    });
    f.result.quality!.decisions[0].kind = "P5";
    const confirm = vi.fn(async () => {});
    renderToStaticMarkup(
      createElement(UniversalResultView, {
        ...f.props,
        admission: {
          enabled: true,
          enabledFamilies: ["P5"],
          statuses: {},
          busyToken: null,
          confirm,
          readOriginal: vi.fn(async () => "original"),
        },
      }),
    );
    const button = state.buttons.find((b) => b.label === t("capture.ai.p5Confirm"));
    if (subtype === "TRAIN") {
      expect(button?.disabled).toBe(true);
      button!.onPress();
      expect(confirm).not.toHaveBeenCalled();
    } else expect(button).toBeUndefined();
  },
);

it.each(["2026-11-03", "November 3, 2026"])(
  "offers P6 dated %s only under its own opt-in and explicit original/Trip Review",
  (dateRaw) => {
    const f = fixture();
    f.result.candidates[0].fields.find((f) => f.path === "activity.date")!.raw = dateRaw;
    Object.assign(f.result.candidates[0], { kind: "P6", subtype: "ACTIVITY" });
    f.result.quality!.decisions[0].kind = "P6";
    const confirm = vi.fn(async () => {});
    renderToStaticMarkup(
      createElement(UniversalResultView, {
        ...f.props,
        admission: {
          enabled: true,
          enabledFamilies: ["P6"],
          statuses: {},
          busyToken: null,
          confirm,
          readOriginal: vi.fn(async () => "original"),
        },
      }),
    );
    const button = state.buttons.find((b) => b.label === t("capture.ai.p6Confirm"));
    expect(button?.disabled).toBe(true);
    button!.onPress();
    expect(confirm).not.toHaveBeenCalled();
    expect(state.buttons.some((b) => b.label === t("capture.ai.p1Confirm"))).toBe(false);
  },
);

it.each([
  "PENDING",
  "WAITING",
  "PROCESSING",
  "RESULTS_READY",
  "FAILED",
  "UNKNOWN",
] as const)(
  "shows owning %s separately from the screen request and queue hint",
  (status) => {
    const f = fixture();
    const html = renderToStaticMarkup(
      createElement(UniversalResultView, {
        ...f.props,
        result: null,
        queued: true,
        activity: {
          state: status,
          recordedAt: "2026-10-28T00:00:00Z",
          updatedAt: "2026-10-28T00:00:01Z",
          completedAt: null,
          rowRevision: 2,
          attemptCount: 0,
          waitReason: null,
        },
      }),
    );
    expect(html).toContain(t(`capture.ai.task.${status}`));
    expect(html).not.toContain(t("capture.ai.queued"));
  },
);
