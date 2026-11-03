import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import type { UniversalImportResult } from "../api/universalImportContracts";
import {
  isCurrentUniversalP3FormContext,
  projectUniversalP3FormInterpretation,
  universalP3FormInterpretationSchema,
  type UniversalP3FormContext,
} from "./universalP3FormInterpretation";

// Local wire fixture only: no Source/Task creation or Provider execution.
function fixture(mode: "CREATE" | "EDIT" = "CREATE") {
  const context: UniversalP3FormContext = {
    accountId: randomUUID(),
    tripId: randomUUID(),
    formId: randomUUID(),
    formType: "P3",
    itemId: randomUUID(),
    generation: 1,
    revision: 0,
    itemRevision: mode === "EDIT" ? 7 : null,
    mode,
  };
  const task = {
    version: "otr.backend.universal-context/1",
    actorId: context.accountId,
    accountId: context.accountId,
    tripId: context.tripId,
    batchId: randomUUID(),
    taskId: randomUUID(),
  };
  const result: UniversalImportResult = {
    ...task,
    version: "otr.backend.universal-interpretation/1",
    requestSha256: "a".repeat(64),
    promptVersion: "fixture/1",
    status: "CANDIDATES_READY",
    providerOutcome: "LOCAL_FIXTURE",
    providerReceipt: null,
    sourceBindings: [
      {
        alias: "s1",
        inputId: randomUUID(),
        sourceId: randomUUID(),
        representationId: randomUUID(),
        revision: 1,
        mime: "text/plain",
        originalSha256: "b".repeat(64),
        submittedSha256: null,
        status: "BOUND",
      },
    ],
    candidates: [
      {
        id: "1".repeat(24),
        token: "stay-one",
        kind: "P3",
        subtype: "ACCOMMODATION",
        fields: [
          {
            sourceId: "s1",
            path: "property.name",
            raw: "Synthetic Hotel",
            start: 0,
            end: 15,
          },
          {
            sourceId: "s1",
            path: "check_in.date",
            raw: "2026-11-04",
            start: 16,
            end: 26,
          },
          {
            sourceId: "s1",
            path: "check_out.date",
            raw: "2026-11-06",
            start: 27,
            end: 37,
          },
        ],
        bookingTokens: [],
        ticketTokens: [],
        validation: "CANDIDATE_VALIDATED",
        admission: "NOT_RUN",
        closure: "POLICY_PENDING",
        visualReviewRequired: false,
        presentationTier: "REVIEWABLE",
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
  };
  const input = {
    result,
    task,
    capturedContext: context,
    currentContext: structuredClone(context),
  };
  return {
    ...input,
    input,
    fields: result.candidates[0].fields,
    run: () => projectUniversalP3FormInterpretation(input),
  };
}

it.each(["CREATE", "EDIT"] as const)(
  "maps the existing %s wire result without mutation or write authority",
  (mode) => {
    const f = fixture(mode),
      before = structuredClone(f.input);
    const projected = f.run()!;
    expect(projected.version).toBe("otr.import.p3-form-interpretation/1");
    expect(projected.context).toEqual(f.capturedContext);
    expect(projected.candidates[0].fields).toEqual({
      title: "Synthetic Hotel",
      startDate: "2026-11-04",
      endDate: "2026-11-06",
    });
    expect(projected.candidates[0].evidence.title).toEqual([f.fields[0]]);
    expect(projected.sourceBindings).toEqual(f.result.sourceBindings);
    expect(projected.task.taskId).toBe(f.task.taskId);
    expect(projected.canonicalWrites).toBe(false);
    expect(projected.providerOutcome).toBe("LOCAL_FIXTURE");
    expect(projected.candidates[0]).not.toHaveProperty("targetItemId");
    expect(f.input).toEqual(before);
  },
);

it.each([
  ["accountId", randomUUID()],
  ["tripId", randomUUID()],
  ["formId", "reopened-form"],
  ["formType", "P4"],
  ["itemId", randomUUID()],
  ["generation", 2],
  ["revision", 1],
  ["itemRevision", 8],
  ["mode", "CREATE"],
])("invalidates old results after current %s changes", (key, changed) => {
  const f = fixture("EDIT");
  Object.assign(f.input.currentContext, { [key]: changed });
  expect(f.run()).toBeNull();
  expect(isCurrentUniversalP3FormContext(f.capturedContext, f.input.currentContext)).toBe(
    false,
  );
});

it.each(["actorId", "accountId", "tripId", "batchId", "taskId"] as const)(
  "rejects a result from another owning %s",
  (key) => {
    const f = fixture();
    f.result[key] = randomUUID();
    expect(f.run()).toBeNull();
  },
);

it.each(["CREATE", "EDIT"] as const)(
  "rejects a foreign Actor at the %s Form DTO boundary",
  (mode) => {
    const f = fixture(mode);
    const output = f.run()!;
    const otherActor = randomUUID();
    f.task.actorId = otherActor;
    f.result.actorId = otherActor;
    expect(f.run()).toBeNull();
    output.task.actorId = otherActor;
    expect(universalP3FormInterpretationSchema.safeParse(output).success).toBe(false);
  },
);

it("requires explicit valid Edit revision and exact context shape", () => {
  const f = fixture("EDIT");
  expect(
    projectUniversalP3FormInterpretation({
      ...f.input,
      capturedContext: { ...f.capturedContext, itemRevision: null },
    }),
  ).toBeNull();
  expect(
    projectUniversalP3FormInterpretation({
      ...f.input,
      currentContext: { ...f.currentContext, extra: true },
    }),
  ).toBeNull();
});

it("keeps multiple stays independent and does not infer a duplicate Edit target", () => {
  const f = fixture("EDIT");
  const second = structuredClone(f.result.candidates[0]);
  second.id = "2".repeat(24);
  second.token = "stay-two";
  second.fields[0].raw = "Other Hotel";
  f.result.candidates.push(second);
  expect(f.run()!.candidates.map((c) => [c.token, c.fields.title])).toEqual([
    ["stay-one", "Synthetic Hotel"],
    ["stay-two", "Other Hotel"],
  ]);
  f.result.candidates.push(second);
  expect(f.run()).toBeNull();
});

it("preserves ABSTAIN evidence without manufacturing fields or mandatory review", () => {
  const f = fixture();
  f.result.candidates[0].presentationTier = "ABSTAIN";
  const candidate = f.run()!.candidates[0];
  expect(candidate.fields).toEqual({});
  expect(candidate.evidence.title).toEqual([f.fields[0]]);
  expect(candidate.unsupported).toEqual([]);
  expect(candidate.presentationTier).toBe("ABSTAIN");
  f.fields.splice(0);
  expect(f.run()!.candidates[0].unsupported).toEqual([]);
});

it.each(["UNKNOWN", "NOT_RUN"] as const)(
  "rejects %s provider outcome even when the result claims READY",
  (providerOutcome) => {
    const f = fixture();
    f.result.providerOutcome = providerOutcome;
    expect(f.run()).toBeNull();
    f.result.candidates = [];
    expect(f.run()).toMatchObject({ providerOutcome, candidates: [] });
  },
);

it("exports a real output runtime schema using existing Source and Evidence validation", () => {
  const f = fixture(),
    result = f.run()!;
  expect(
    universalP3FormInterpretationSchema.parse(JSON.parse(JSON.stringify(result))),
  ).toEqual(result);
  const mutated = structuredClone(result);
  mutated.candidates[0].fields.title = "Invented without evidence";
  expect(universalP3FormInterpretationSchema.safeParse(mutated).success).toBe(false);
  mutated.candidates[0].fields.title = "Synthetic Hotel";
  mutated.candidates[0].evidence.title![0].sourceId = "foreign";
  expect(universalP3FormInterpretationSchema.safeParse(mutated).success).toBe(false);
  const inverted = structuredClone(result);
  inverted.candidates[0].fields.startDate = "2026-11-07";
  inverted.candidates[0].evidence.startDate![0].raw = "2026-11-07";
  expect(universalP3FormInterpretationSchema.safeParse(inverted).success).toBe(false);
});

it("rejects forged clears, authority, synthetic kinds and malformed Source pins at output boundary", () => {
  const result = fixture().run()!;
  for (const candidate of [
    { ...result, canonicalWrites: true },
    { ...result, kind: "SYNTHETIC_STAY_SUGGESTIONS" },
    { ...result, sourceBindings: [{ ...result.sourceBindings[0], revision: 0 }] },
    { ...result, candidates: [{ ...result.candidates[0], fields: { title: null } }] },
    { ...result, providerOutcome: "UNKNOWN" },
    { ...result, providerOutcome: "NOT_RUN" },
    { ...result, candidates: [{ ...result.candidates[0], presentationTier: "ABSTAIN" }] },
  ])
    expect(universalP3FormInterpretationSchema.safeParse(candidate).success).toBe(false);
});

it("retains all 64 independent stays without the synthetic 12-candidate limit", () => {
  const f = fixture(),
    first = f.result.candidates[0];
  f.result.candidates = Array.from({ length: 64 }, (_, index) => ({
    ...first,
    id: index.toString(16).padStart(24, "0"),
    token: `stay-${index}`,
  }));
  const output = f.run()!;
  expect(output.candidates).toHaveLength(64);
  expect(universalP3FormInterpretationSchema.safeParse(output).success).toBe(true);
});

it("normalizes only supported civil dates and retains corroborating alias evidence", () => {
  const f = fixture();
  f.fields.push({
    ...f.fields[1],
    path: "schedule.start.local_date",
    raw: "November 4, 2026",
  });
  const c = f.run()!.candidates[0];
  expect(c.fields.startDate).toBe("2026-11-04");
  expect(c.evidence.startDate).toHaveLength(2);
});

it.each([
  { path: "title", raw: "Different Hotel" },
  { path: "property.name", raw: "Synthetic Hotel", uncertainty: "unclear" },
])("keeps conflicting or uncertain title evidence for field review", (fact) => {
  const f = fixture();
  f.fields.push({ ...f.fields[0], ...fact });
  const c = f.run()!.candidates[0];
  expect(c.fields).not.toHaveProperty("title");
  expect(c.evidence.title).toHaveLength(2);
  expect(c.unsupported).toContainEqual({ field: "title", state: "NEEDS_INPUT" });
});

it("retains unmappable observations without putting room, guest or contact into scalar fields", () => {
  const f = fixture();
  for (const path of ["room.type", "guest.name", "contact", "description"])
    f.fields.push({ ...f.fields[0], path, raw: "Observation only" });
  f.result.sourceObservations = [{ kind: "optional", value: "retained" }];
  const r = f.run()!,
    c = r.candidates[0];
  expect(c.unhandledEvidence).toHaveLength(4);
  expect(c.unsupported).toContainEqual({ field: "guest.name", state: "UNSUPPORTED" });
  expect(c.fields).not.toHaveProperty("description");
  expect(r.sourceObservations).toEqual(f.result.sourceObservations);
});

it("leaves absent optional fields empty and flags missing required facts", () => {
  const f = fixture();
  f.fields.splice(1);
  const c = f.run()!.candidates[0];
  expect(c.unsupported).toEqual([
    { field: "startDate", state: "NEEDS_INPUT" },
    { field: "endDate", state: "NEEDS_INPUT" },
  ]);
  expect(c.fields).not.toHaveProperty("startTime");
});

it("does not guess invalid dates, local clocks, null clears or an inverted range", () => {
  const f = fixture();
  f.fields[1].raw = "2026-02-30";
  f.fields.push({ ...f.fields[0], path: "check_in.time", raw: "5pm" });
  const c = f.run()!.candidates[0];
  expect(c.fields).not.toHaveProperty("startDate");
  expect(c.fields).not.toHaveProperty("startTime");
  f.fields[1].raw = "2026-11-07";
  expect(f.run()!.candidates[0].fields).not.toHaveProperty("endDate");
});

it("preserves pixel locators and rejects unknown source aliases", () => {
  const f = fixture();
  f.fields[0] = {
    sourceId: "s1",
    path: "property.name",
    raw: "Synthetic Hotel",
    region: {
      imageSha256: "b".repeat(64),
      x: 2,
      y: 3,
      width: 20,
      height: 8,
      unit: "PIXELS",
    },
  };
  expect(f.run()!.candidates[0].evidence.title).toEqual([f.fields[0]]);
  f.fields[0].sourceId = "foreign-source";
  expect(f.run()).toBeNull();
});

it.each(["ABSTAIN", "EXECUTION_OUTCOME_UNKNOWN"] as const)(
  "preserves %s without synthesizing suggestions",
  (status) => {
    const f = fixture();
    f.result.status = status;
    expect(f.run()).toBeNull();
    f.result.candidates = [];
    expect(f.run()).toMatchObject({ status, candidates: [], canonicalWrites: false });
  },
);

it("preserves a matching UNKNOWN Task and unknown empty result for the existing Native status path", () => {
  const f = fixture();
  Object.assign(f.task, {
    activity: {
      state: "UNKNOWN",
      recordedAt: "2026-11-03T00:00:00Z",
      updatedAt: "2026-11-03T00:00:01Z",
      completedAt: null,
      rowRevision: 2,
      attemptCount: 1,
      waitReason: null,
    },
  });
  f.result.status = "EXECUTION_OUTCOME_UNKNOWN";
  f.result.providerOutcome = "UNKNOWN";
  f.result.candidates = [];
  expect(f.run()).toMatchObject({
    status: "EXECUTION_OUTCOME_UNKNOWN",
    providerOutcome: "UNKNOWN",
    candidates: [],
    context: f.capturedContext,
    task: { taskId: f.task.taskId, requestSha256: f.result.requestSha256 },
  });
});

it.each(["PENDING", "WAITING", "PROCESSING", "FAILED", "CANCELED", "STALE"])(
  "keeps %s Task out of the UNKNOWN status-only projection",
  (state) => {
    const f = fixture();
    Object.assign(f.task, {
      activity: {
        state,
        recordedAt: "2026-11-03T00:00:00Z",
        updatedAt: "2026-11-03T00:00:01Z",
        completedAt: null,
        rowRevision: 2,
        attemptCount: 1,
        waitReason: null,
      },
    });
    f.result.status = "EXECUTION_OUTCOME_UNKNOWN";
    f.result.providerOutcome = "UNKNOWN";
    f.result.candidates = [];
    expect(f.run()).toBeNull();
  },
);
it("rejects contradictory UNKNOWN Task combinations and any usable candidates", () => {
  const f = fixture();
  Object.assign(f.task, {
    activity: {
      state: "UNKNOWN",
      recordedAt: "2026-11-03T00:00:00Z",
      updatedAt: "2026-11-03T00:00:01Z",
      completedAt: null,
      rowRevision: 2,
      attemptCount: 1,
      waitReason: null,
    },
  });
  expect(f.run()).toBeNull();
  f.result.status = "EXECUTION_OUTCOME_UNKNOWN";
  f.result.providerOutcome = "UNKNOWN";
  expect(f.run()).toBeNull();
  f.result.candidates = [];
  f.result.providerOutcome = "SETTLED";
  expect(f.run()).toBeNull();
  f.result.providerOutcome = "UNKNOWN";
  f.result.status = "CANDIDATES_READY";
  expect(f.run()).toBeNull();
});
