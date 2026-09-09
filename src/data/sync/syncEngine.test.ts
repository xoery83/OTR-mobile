import { describe, expect, it, vi } from "vitest";

import { createSyncEngine } from "./syncEngine";
import type { SyncOperation } from "./syncOperationRepository";

const operation: SyncOperation = {
  id: "operation-1",
  tripId: "trip-1",
  entityType: "expense",
  entityId: "expense-1",
  operationType: "create",
  idempotencyKey: "key-1",
  baseVersion: null,
  payloadJson: "{}",
  status: "PENDING",
  attemptCount: 0,
  nextAttemptAt: null,
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
};

describe("sync engine", () => {
  it("does not run durable operations without online auth", async () => {
    const repository = {
      listPending: vi.fn(),
      markProcessing: vi.fn(),
      markCompleted: vi.fn(),
      markRetryable: vi.fn(),
    };
    const engine = createSyncEngine(repository, { push: vi.fn() }, vi.fn());

    await expect(engine.run("AUTHENTICATED_OFFLINE")).resolves.toEqual({
      status: "paused_auth",
      processedCount: 0,
    });
    expect(repository.listPending).not.toHaveBeenCalled();
  });

  it("delegates lifecycle and preserves retry metadata in the repository", async () => {
    const repository = {
      listPending: vi.fn().mockResolvedValue([operation]),
      markProcessing: vi.fn().mockResolvedValue(undefined),
      markCompleted: vi.fn().mockResolvedValue(undefined),
      markRetryable: vi.fn().mockResolvedValue(undefined),
    };
    const nextAttemptAt = "2026-09-09T00:01:00.000Z";
    const engine = createSyncEngine(
      repository,
      { push: vi.fn().mockRejectedValue(new Error("offline")) },
      () => nextAttemptAt,
    );

    await engine.run("AUTHENTICATED_ONLINE");

    expect(repository.markProcessing).toHaveBeenCalledWith("operation-1");
    expect(repository.markRetryable).toHaveBeenCalledWith(
      "operation-1",
      expect.objectContaining({ message: "offline" }),
      nextAttemptAt,
    );
  });

  it("leaves operations for another entity untouched", async () => {
    const repository = {
      listPending: vi.fn().mockResolvedValue([operation]),
      markProcessing: vi.fn(),
      markCompleted: vi.fn(),
      markRetryable: vi.fn(),
    };
    const worker = { push: vi.fn() };
    const engine = createSyncEngine(
      repository,
      worker,
      vi.fn(),
      (candidate) => candidate.entityType === "itinerary",
    );

    await engine.run("AUTHENTICATED_ONLINE");

    expect(worker.push).not.toHaveBeenCalled();
    expect(repository.markProcessing).not.toHaveBeenCalled();
  });
});
