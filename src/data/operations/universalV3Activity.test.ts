import { projectUniversalV3Results, type V3ResultOperation } from "./universalV3Activity";
import { emptyCoreGraph } from "../../domain/trip/tripCoreV2Mutation";
import type { CoreAcceptedSnapshot } from "../repositories/tripCoreV2Repository";
import { expect, it, vi } from "vitest";
import { projectUniversalV3Activity as project , projectImportActivityRow , projectPlannedV3Activity, projectV3ActivityFacts } from "./universalV3Activity";
import type { UniversalV3ExecutionStatus } from "../api/universalV3Contracts";

import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";

const ready = {
  state: "REVIEW_READY",
  taskId: "task-a",
  candidates: [{ candidateId: "a" }, { candidateId: "b" }],
} as Extract<UniversalV3ExecutionStatus, { state: "REVIEW_READY" }>;
it("never counts recognition or an unobserved save as a completed Item", () => {
  expect(project(ready)).toEqual({ state: "checking", saved: 0 });
  expect(project(ready, { a: "UNCONFIRMED", b: "UNCONFIRMED" }).state).toBe(
    "confirmation",
  );
  expect(project(ready, { a: "VERIFIED", b: "PENDING" })).toEqual({
    state: "applying",
    saved: 1,
  });
  expect(project(ready, { a: "VERIFIED", b: "ITEM_VERIFIED_RELATION_PENDING" })).toEqual({
    state: "association",
    saved: 1,
  });
  expect(project(ready, { a: "VERIFIED", b: "VERIFIED" })).toEqual({
    state: "complete",
    saved: 2,
  });
});
it("UNKNOWN and offline reads never become a confirmed save failure or attention", () => {
  expect(project({ state: "OUTCOME_UNKNOWN", taskId: "original" }).state).toBe(
    "uncertain",
  );
  expect(project(ready, { a: "OUTCOME_UNKNOWN", b: "VERIFIED" }).state).toBe("uncertain");
  expect(project(null, {}, true).state).toBe("waiting");
  expect(project(ready, { a: "VERIFIED" }, true).state).toBe("uncertain");
  expect(project({ state: "PROCESSING", taskId: "original" }).state).toBe("analyzing");
});
it("only actual rejection/conflict/invalid format requires user action; no candidates is not a failure", () => {
  expect(project(ready, { a: "REVIEW_REQUIRED" }).state).toBe("attention");
  expect(project(ready, { a: "ITEM_VERIFIED_RELATION_REVIEW" }).state).toBe("attention");
  expect(project(null, {}, false, true).state).toBe("attention");
  expect(project({ ...ready, candidates: [] })).toEqual({ state: "empty", saved: 0 });
});
it("another Batch's candidate IDs cannot complete this Batch", () => {
  expect(project(ready, { other: "VERIFIED" })).toEqual({ state: "checking", saved: 0 });
});

const q = vi.hoisted(() => ({ account: "owner", read: vi.fn(), snapshot: vi.fn(), pending: vi.fn(), receipt: vi.fn(), assert: vi.fn() }));
vi.mock("../repositories/tripCoreV2Repository", () => ({ createTripCoreV2Repository: () => ({
  acceptedSnapshot: q.snapshot, pending: q.pending, retainedReceipt: q.receipt,
}) }));
vi.mock("../repositories/tripCoreSha256", () => ({ tripCoreSha256Hex: vi.fn() }));
vi.mock("../auth/authRepository", () => ({
  requireAdoptedUserId: async () => q.account,
}));
vi.mock("../db/database", () => ({ readInitializedDatabase: async () => ({}) }));
vi.mock("../sync/syncOperationRepository", () => ({
  readSyncOperationDiagnostics: q.read,
}));
vi.mock("../auth/accountRequestContext", () => ({
  captureAccountRequestContext: async () => ({ accountId: q.account, tripId: "trip" }),
  assertAccountRequestContext: q.assert,
}));
it("known original queue UNKNOWN is projected without changing or claiming an operation", async () => {
  const { universalP1Identity } = await import("@/domain/trip/universalImportIdentity");
  const { readV3UnknownCandidates } = await import("./universalV3Activity");
  const candidate = "6b8779e2-8b5c-49cc-9f0d-1725127ec77a";
  const model = {
    batch: { accountId: "owner", context: { tripPrior: { id: "trip" } } },
  } as any;
  q.account = "owner";
  q.read.mockResolvedValue([
    {
      id: universalP1Identity(candidate, "local-first", "link"),
      entityType: "TRIP_CORE_V2",
      operationType: "CORE_V2_COMMAND",
      status: "RETRYABLE",
      failureCategory: "UNKNOWN",
    },
  ]);
  expect(await readV3UnknownCandidates(model, [candidate])).toEqual(new Set([candidate]));
  q.read.mockResolvedValue([
    {
      id: universalP1Identity(candidate, "local-first", "link"),
      entityType: "TRIP_CORE_V2",
      operationType: "CORE_V2_COMMAND",
      status: "COMPLETED",
      failureCategory: "UNKNOWN",
    },
  ]);
  expect(await readV3UnknownCandidates(model, [candidate])).toEqual(new Set());
  q.read.mockClear();
  q.account = "different-account";
  await expect(readV3UnknownCandidates(model, [candidate])).rejects.toThrow(
    "UNIVERSAL_V3_REVIEW_CONTEXT",
  );
  expect(q.read).not.toHaveBeenCalled();
});

function resultFixture() {
  const snapshot = {
    actor: { active: true, accountId: "actor", tripId: "trip", personId: "person" },
    graph: emptyCoreGraph(),
  } as CoreAcceptedSnapshot;
  snapshot.graph.itinerary_events.push(
    ...["one", "two"].map(
      (id) =>
        ({
          id,
          trip_id: "trip",
          owner_account_id: "actor",
          title: id,
          experience_family: "P1",
          visibility: "PRIVATE",
        }) as never,
    ),
  );
  snapshot.graph.trip_item_document_links.push(
    ...["d1", "d2"].map(
      (id) => ({ item_id: "one", document_id: id, active: true }) as never,
    ),
    { item_id: "two", document_id: "d1", active: true } as never,
  );
  const operation = (
    candidateId: string,
    itemId: string,
    command: string,
    documents = ["d1"],
    outcome = "APPLIED",
    created = false,
  ): V3ResultOperation => ({
    candidateId,
    documentIds: documents,
    command: {
      operationId: candidateId + command,
      tripId: "trip",
      command,
      target: { kind: "ITEM", id: itemId },
    } as never,
    receipt: {
      operationId: candidateId + command,
      tripId: "trip",
      actorAccountId: "actor",
      outcome,
      committedAt: "2026-11-14T00:00:00Z",
      result: {
        created: created ? [{ kind: "ITEM", id: itemId }] : [],
        changed: command === "SET_ITEM_TEXT" ? [{ kind: "ITEM", id: itemId }] : [],
      },
    } as never,
  });
  return { snapshot, operation };
}
it("three candidates resolving two Items count real receipt identities, never candidate cardinality", () => {
  const f = resultFixture();
  const rows = [
    f.operation("a", "one", "CREATE_ITEM", ["d1"], "APPLIED", true),
    f.operation("a", "one", "RECONCILE_ITEM_DOCUMENTS"),
    f.operation("b", "one", "RECONCILE_ITEM_DOCUMENTS", ["d2"]),
    f.operation("c", "two", "CREATE_ITEM", ["d1"], "APPLIED", true),
    f.operation("c", "two", "RECONCILE_ITEM_DOCUMENTS"),
  ];
  const items = projectUniversalV3Results(f.snapshot, rows, {
    a: "VERIFIED",
    b: "VERIFIED",
    c: "VERIFIED",
  });
  expect(items).toHaveLength(2);
  expect(items.every((x) => x.action === "created" && x.state === "complete")).toBe(true);
  expect(items.find((x) => x.itemId === "one")?.documentIds).toEqual(["d1", "d2"]);
  expect(
    projectUniversalV3Results(f.snapshot, JSON.parse(JSON.stringify(rows)), {
      a: "VERIFIED",
      b: "VERIFIED",
      c: "VERIFIED",
    }),
  ).toEqual(items);
});
it("two documents linked to an existing Item count one Linked, no Created or Updated", () => {
  const f = resultFixture();
  const rows = [
    f.operation("a", "one", "RECONCILE_ITEM_DOCUMENTS"),
    f.operation("b", "one", "RECONCILE_ITEM_DOCUMENTS", ["d2"]),
  ];
  const items = projectUniversalV3Results(f.snapshot, rows, {
    a: "VERIFIED",
    b: "VERIFIED",
  });
  expect(items).toMatchObject([
    { itemId: "one", action: "linked", documentIds: ["d1", "d2"] },
  ]);
});
it("a formal Item creation survives pending association and UNKNOWN without claiming complete or failure", () => {
  const f = resultFixture();
  const create = f.operation("a", "one", "CREATE_ITEM", ["d1"], "APPLIED", true),
    link = f.operation("a", "one", "RECONCILE_ITEM_DOCUMENTS");
  link.receipt = null;
  expect(
    projectUniversalV3Results(f.snapshot, [create, link], {
      a: "ITEM_VERIFIED_RELATION_PENDING",
    }),
  ).toMatchObject([{ action: "created", state: "association" }]);
  expect(
    projectUniversalV3Results(f.snapshot, [create, link], { a: "OUTCOME_UNKNOWN" }),
  ).toMatchObject([{ action: "created", state: "unknown" }]);
  expect(link.receipt).toBeNull();
});
it("only a committed supported change is Updated; rejected/conflicting operations remain distinct", () => {
  const f = resultFixture();
  const update = f.operation("a", "one", "SET_ITEM_TEXT"),
    link = f.operation("a", "one", "RECONCILE_ITEM_DOCUMENTS");
  expect(
    projectUniversalV3Results(f.snapshot, [update, link], { a: "VERIFIED" }),
  ).toMatchObject([{ action: "updated", state: "complete" }]);
  link.receipt!.outcome = "REJECTED";
  expect(projectUniversalV3Results(f.snapshot, [update, link], {})).toMatchObject([
    { state: "failed" },
  ]);
  link.receipt!.outcome = "CONFLICT";
  expect(projectUniversalV3Results(f.snapshot, [update, link], {})).toMatchObject([
    { state: "review" },
  ]);
});
it("unreceived/ABSTAIN candidates, missing readback and other-account receipts cannot fabricate results", () => {
  const f = resultFixture();
  expect(projectUniversalV3Results(f.snapshot, [], {})).toEqual([]);
  const row = f.operation("a", "missing", "CREATE_ITEM", ["d1"], "APPLIED", true);
  expect(projectUniversalV3Results(f.snapshot, [row], {})).toEqual([]);
  row.command.target.id = "one";
  row.receipt!.actorAccountId = "other";
  expect(projectUniversalV3Results(f.snapshot, [row], {})).toEqual([]);
});

it("a sibling association receipt cannot hide an original unsettled operation", () => {
  const f = resultFixture(),
    first = f.operation("a", "one", "RECONCILE_ITEM_DOCUMENTS"),
    second = f.operation("b", "one", "RECONCILE_ITEM_DOCUMENTS", ["d2"]);
  first.receipt = null;
  expect(
    projectUniversalV3Results(f.snapshot, [first, second], {
      a: "PENDING",
      b: "VERIFIED",
    }),
  ).toMatchObject([{ action: "linked", state: "saving" }]);
});
it("keeps authorized transport business facts separate from actual receipt clocks", () => {
  const { snapshot, operation } = resultFixture();
  snapshot.graph.itinerary_transport_endpoints.push(
    {
      event_id: "one",
      trip_id: "trip",
      role: "ORIGIN",
      local_date: "2026-12-20",
      local_time: "10:10",
      authored_label: "LAX",
    } as never,
    {
      event_id: "one",
      trip_id: "trip",
      role: "DESTINATION",
      authored_label: "SFO",
    } as never,
  );
  const [item] = projectUniversalV3Results(
    snapshot,
    [operation("a", "one", "RECONCILE_ITEM_DOCUMENTS")],
    { a: "VERIFIED" },
  );
  expect(item.businessDate).toBe("2026-12-20");
  expect(item.businessTime).toBe("10:10");
  expect(item.place).toBe("LAX → SFO");
  expect(item.recordedAt).toBe("2026-11-14T00:00:00Z");
  snapshot.graph.itinerary_transport_endpoints.forEach((endpoint) => {
    endpoint.trip_id = "other-trip";
  });
  expect(
    projectUniversalV3Results(
      snapshot,
      [operation("a", "one", "RECONCILE_ITEM_DOCUMENTS")],
      { a: "VERIFIED" },
    )[0].businessDate,
  ).toBeUndefined();
});
it("UX-C2 partial receipt observations cannot complete a whole Batch; failed latest observation is not a complete read", () => {
  expect(project(ready, { a: "VERIFIED" }).state).toBe("checking");
  expect(project(ready, { a: "VERIFIED", b: "UNCONFIRMED" }).state).not.toBe("complete");
  expect(
    project(ready, { a: "VERIFIED", b: "ITEM_VERIFIED_RELATION_PENDING" }).state,
  ).toBe("association");
  expect(project(ready, { a: "VERIFIED", b: "VERIFIED" }, true).state).toBe("uncertain");
});
const batchRow = {
  batch: {
    batchId: "b",
    jobId: "j",
    createdAt: "2026-11-14T00:00:00Z",
    inputs: [
      { acquisitionSource: "files" },
      { acquisitionSource: "photos" },
      { acquisitionSource: "magic_input" },
    ],
  },
  inputs: [],
  allInputsAccepted: true,
} as unknown as CaptureJobReadModel;
it("Activity counts one Batch and matches each recorded constituent source", () => {
  const row = projectImportActivityRow(batchRow, {
    state: "complete",
    saved: 3,
    resultCount: 1,
  });
  expect(row.sources).toEqual(["FILES", "PHOTOS", "TEXT"]);
  expect(row.resultCount).toBe(1);
  expect(row.status).toBe("COMPLETED");
  expect(projectImportActivityRow(batchRow, { state: "empty", saved: 0 }).status).toBe(
    "COMPLETED",
  );
});
it("Activity keeps UNKNOWN and development confirmation out of failure or semantic Review", () => {
  for (const state of ["uncertain", "confirmation", "waiting"] as const)
    expect(projectImportActivityRow(batchRow, { state, saved: 0 }).status).toBe(
      "WAITING",
    );
  expect(projectImportActivityRow(batchRow).phase).toBe("uncertain");
  expect(
    projectImportActivityRow(batchRow, { state: "attention", saved: 0 }).status,
  ).toBe("REVIEW");
  expect(
    projectImportActivityRow(batchRow, { state: "attention", saved: 0, failedCount: 1 })
      .status,
  ).toBe("FAILED");
  expect(
    projectImportActivityRow(batchRow, { state: "association", saved: 1 }).status,
  ).toBe("PROCESSING");
});
it("uses existing owning Review and ABSTAIN plans before classifying development confirmation", () => {
  const candidate = ready.candidates[0];
  const row = {
    candidate,
    members: [candidate.candidateId],
    disposition: "REVIEW" as const,
    reason: "missing" as const,
  };
  expect(projectPlannedV3Activity(ready, { a: "UNCONFIRMED" }, [row]).state).toBe(
    "attention",
  );
  expect(projectPlannedV3Activity(ready, { a: "VERIFIED" }, [row]).state).toBe(
    "complete",
  );
  expect(
    projectPlannedV3Activity(ready, {}, [{ ...row, disposition: "ABSTAIN" }]).state,
  ).toBe("empty");
  expect(projectPlannedV3Activity(ready, { a: "OUTCOME_UNKNOWN" }, [row]).state).toBe(
    "uncertain",
  );
});
it("counts an original rejected NEW without an existing Item, but excludes another actor receipt", () => {
  const f = resultFixture();
  const rejected = f.operation("a", "not-created", "CREATE_ITEM", ["d1"], "REJECTED");
  expect(projectV3ActivityFacts(f.snapshot, [rejected], {}).failedCount).toBe(1);
  expect(projectV3ActivityFacts(f.snapshot, [rejected], {}).resultCount).toBe(0);
  rejected.receipt!.actorAccountId = "other";
  expect(projectV3ActivityFacts(f.snapshot, [rejected], {}).failedCount).toBe(0);
});
it("clipboard uses the recorded Paste source rather than pretending it was selected from Photos", () => {
  const pasted = {
    ...batchRow,
    batch: { ...batchRow.batch, inputs: [{ acquisitionSource: "clipboard" }] },
  } as CaptureJobReadModel;
  expect(projectImportActivityRow(pasted).sources).toEqual(["TEXT"]);
});

async function retainedFixture() {
  const { universalP1Identity } = await import("@/domain/trip/universalImportIdentity");
  const { readRetainedUniversalV3Results } = await import("./universalV3Activity");
  const f = resultFixture();
  const candidateId = "6b8779e2-8b5c-49cc-9f0d-1725127ec77a";
  const candidate = { candidateId, documentIds: ["d1"] } as never;
  const model = { batch: { accountId: "actor", context: { tripPrior: { id: "trip" } } } } as CaptureJobReadModel;
  const rows = [f.operation(candidateId, "one", "CREATE_ITEM", ["d1"], "APPLIED", true),
    f.operation(candidateId, "one", "RECONCILE_ITEM_DOCUMENTS")];
  rows.forEach((row, index) => {
    row.command.operationId = universalP1Identity(candidateId, "local-first", index ? "link" : "item");
    row.receipt!.operationId = row.command.operationId;
  });
  f.snapshot.graph.trip_item_document_links.forEach((edge) => { edge.trip_id = "trip"; });
  q.account = "actor";
  q.assert.mockReset();
  q.read.mockResolvedValue([]);
  q.snapshot.mockResolvedValue(f.snapshot);
  q.pending.mockImplementation(async (_context, id) => rows.filter((row) => row.command.operationId === id));
  q.receipt.mockImplementation(async (_context, command) => rows.find((row) => row.command.operationId === command.operationId)?.receipt ?? null);
  return { ...f, rows, candidateId, model, candidate, read: () => readRetainedUniversalV3Results(model, [candidate]), universalP1Identity };
}
it("restores formal local results from original operations and retained receipts only", async () => {
  const f = await retainedFixture();
  const result = await f.read();
  expect(result?.observations).toEqual({ [f.candidateId]: "VERIFIED" });
  expect(result?.results).toMatchObject([{ itemId: "one", action: "created", state: "complete" }]);
  expect(result?.operations.map((row) => row.command)).toEqual(f.rows.map((row) => row.command));
  expect(q.assert).toHaveBeenCalled();
});
it("missing receipts never imply saved; absent local commands stay UNCONFIRMED", async () => {
  const f = await retainedFixture();
  f.rows.forEach((row) => { row.receipt = null; });
  expect((await f.read())?.observations[f.candidateId]).toBe("PENDING");
  expect((await f.read())?.results[0]).toMatchObject({ action: undefined, state: "saving" });
  q.pending.mockResolvedValue([]);
  expect(await f.read()).toMatchObject({ observations: { [f.candidateId]: "UNCONFIRMED" }, results: [] });
});
it("preserves known queue UNKNOWN without claiming success", async () => {
  const f = await retainedFixture();
  f.rows[1].receipt = null;
  q.read.mockResolvedValue([{ id: f.universalP1Identity(f.candidateId, "local-first", "link"),
    entityType: "TRIP_CORE_V2", operationType: "CORE_V2_COMMAND", status: "RETRYABLE", failureCategory: "UNKNOWN" }]);
  const result = await f.read();
  expect(result?.observations[f.candidateId]).toBe("OUTCOME_UNKNOWN");
  expect(result?.results[0].state).toBe("unknown");
});
it("returns null without an accepted snapshot and rejects foreign scope evidence", async () => {
  const f = await retainedFixture();
  q.snapshot.mockResolvedValue(null);
  expect(await f.read()).toBeNull();
  q.snapshot.mockResolvedValue({ ...f.snapshot, actor: { ...f.snapshot.actor, accountId: "foreign" } });
  await expect(f.read()).rejects.toThrow("UNIVERSAL_V3_REVIEW_CONTEXT");
  q.snapshot.mockResolvedValue(f.snapshot);
  f.rows[0].receipt!.actorAccountId = "foreign";
  await expect(f.read()).rejects.toThrow("UNIVERSAL_V3_REVIEW_CONTEXT");
  q.account = "foreign";
  q.snapshot.mockClear();
  await expect(f.read()).rejects.toThrow("UNIVERSAL_V3_REVIEW_CONTEXT");
  expect(q.snapshot).not.toHaveBeenCalled();
});
it("discards local results when the captured Account generation becomes stale", async () => {
  const f = await retainedFixture();
  q.assert.mockResolvedValueOnce(undefined).mockRejectedValue(Error("STALE_ACCOUNT"));
  await expect(f.read()).rejects.toThrow("STALE_ACCOUNT");
});
