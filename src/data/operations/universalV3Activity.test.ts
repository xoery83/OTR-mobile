import { projectUniversalV3Results, type V3ResultOperation } from "./universalV3Activity";
import { emptyCoreGraph } from "../../domain/trip/tripCoreV2Mutation";
import type { CoreAcceptedSnapshot } from "../repositories/tripCoreV2Repository";
import { expect, it, vi } from "vitest";
import { projectUniversalV3Activity as project } from "./universalV3Activity";
import type { UniversalV3ExecutionStatus } from "../api/universalV3Contracts";
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

const q = vi.hoisted(() => ({ account: "owner", read: vi.fn() }));
vi.mock("../auth/authRepository", () => ({
  requireAdoptedUserId: async () => q.account,
}));
vi.mock("../db/database", () => ({ readInitializedDatabase: async () => ({}) }));
vi.mock("../sync/syncOperationRepository", () => ({
  readSyncOperationDiagnostics: q.read,
}));
vi.mock("../auth/accountRequestContext", () => ({
  captureAccountRequestContext: async () => ({ accountId: q.account, tripId: "trip" }),
  assertAccountRequestContext: async () => {},
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
