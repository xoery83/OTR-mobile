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
