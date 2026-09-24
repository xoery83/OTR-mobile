import { describe, expect, it, vi } from "vitest";

import {
  createSyncEngine,
  nextSyncAttemptAt,
  syncFailureDetails,
  SyncConflictError,
  SyncDependencyError,
} from "./syncEngine";
import { ApiClientError } from "@/data/api/client";
import type { SyncOperation } from "./syncOperationRepository";

const operation: SyncOperation = {
  id: "operation-1",
  ownerUserId: "user-a",
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
      { push: vi.fn().mockRejectedValue(new ApiClientError("offline", "network")) },
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

  it("retries local dependency ordering instead of terminally failing it", async () => {
    const repository = {
      listPending: vi.fn().mockResolvedValue([operation]),
      markProcessing: vi.fn(),
      markCompleted: vi.fn(),
      markRetryable: vi.fn(),
      markDependencyBlocked: vi.fn(),
      markFailed: vi.fn(),
    };
    await createSyncEngine(
      repository,
      { push: vi.fn().mockRejectedValue(new SyncDependencyError("create first")) },
      () => "2026-09-09T00:01:00.000Z",
    ).run("AUTHENTICATED_ONLINE");

    expect(repository.markDependencyBlocked).toHaveBeenCalledOnce();
    expect(repository.markRetryable).not.toHaveBeenCalled();
    expect(repository.markFailed).not.toHaveBeenCalled();
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

  it("records conflicts as terminal queue state instead of retrying or completing", async () => {
    const repository = {
      listPending: vi.fn().mockResolvedValue([operation]),
      markProcessing: vi.fn(),
      markCompleted: vi.fn(),
      markConflict: vi.fn(),
      markRetryable: vi.fn(),
    };
    await createSyncEngine(
      repository,
      { push: vi.fn().mockRejectedValue(new SyncConflictError("conflict")) },
      vi.fn(),
    ).run("AUTHENTICATED_ONLINE");

    expect(repository.markConflict).toHaveBeenCalledWith(
      operation.id,
      expect.objectContaining({ message: "conflict" }),
    );
    expect(repository.markCompleted).not.toHaveBeenCalled();
    expect(repository.markRetryable).not.toHaveBeenCalled();
  });

  it("uses bounded exponential backoff with jitter", () => {
    const now = Date.parse("2026-09-13T00:00:00.000Z");
    expect(Date.parse(nextSyncAttemptAt(1, now, 0.5)) - now).toBe(30_000);
    expect(Date.parse(nextSyncAttemptAt(2, now, 0.5)) - now).toBe(60_000);
    expect(Date.parse(nextSyncAttemptAt(20, now, 0.5)) - now).toBe(4 * 24 * 60 * 60_000);
  });

  it.each([
    [new Error("plain"), "retryable", "UNKNOWN"],
    [
      new ApiClientError("invalid response", "validation"),
      "retryable",
      "RESPONSE_INVALID",
    ],
    [new ApiClientError("offline", "network"), "retryable", "NETWORK"],
    [new ApiClientError("slow", "timeout"), "retryable", "TIMEOUT"],
    [new ApiClientError("limited", "http", 429), "retryable", "RATE_LIMIT"],
    [new ApiClientError("down", "http", 503), "retryable", "SERVER"],
    [new ApiClientError("refresh", "http", 401), "auth", "AUTH"],
    [
      new ApiClientError("invalid", "http", 422, "INVALID_PAYLOAD"),
      "terminal",
      "VALIDATION",
    ],
    [
      new ApiClientError("denied", "http", 403, "TRIP_WRITE_FORBIDDEN"),
      "terminal",
      "PERMISSION",
    ],
    [new ApiClientError("unknown 4xx", "http", 422), "retryable", "UNKNOWN"],
    [new ApiClientError("conflict", "http", 409), "conflict", "CONFLICT"],
  ])("classifies %s as %s/%s", (error, classification, category) => {
    expect(syncFailureDetails(error)).toEqual({ classification, category });
  });

  it("claims once across concurrent wake-ups and terminally fails validation", async () => {
    let claimed = false;
    const repository = {
      listPending: vi.fn().mockResolvedValue([operation]),
      markProcessing: vi.fn(),
      claim: vi.fn(async () => (claimed ? false : (claimed = true))),
      markCompleted: vi.fn(),
      markRetryable: vi.fn(),
      markFailed: vi.fn(),
    };
    const worker = {
      push: vi
        .fn()
        .mockRejectedValue(new ApiClientError("bad", "http", 422, "INVALID_PAYLOAD")),
    };
    const engine = createSyncEngine(repository, worker);
    await Promise.all([
      engine.run("AUTHENTICATED_ONLINE"),
      engine.run("AUTHENTICATED_ONLINE"),
    ]);
    expect(worker.push).toHaveBeenCalledOnce();
    expect(repository.markFailed).toHaveBeenCalledOnce();
    expect(repository.markRetryable).not.toHaveBeenCalled();
  });
});
