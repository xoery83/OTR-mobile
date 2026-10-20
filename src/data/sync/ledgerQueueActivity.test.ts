import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAllAsync: vi.fn(),
  requireActiveUserId: vi.fn(),
}));
vi.mock("@/data/db/database", () => ({
  openDatabase: async () => ({ getAllAsync: mocks.getAllAsync }),
}));
vi.mock("@/data/auth/authRepository", () => ({
  requireActiveUserId: mocks.requireActiveUserId,
}));

// eslint-disable-next-line import/first
import {
  classifyLedgerQueueActivity,
  getLedgerQueueActivity,
  getTripMetadataQueueActivity,
  type QueueRow,
} from "./ledgerQueueActivity";

const row = (status: string, extras: Partial<QueueRow> = {}): QueueRow => ({
  status,
  failureCategory: null,
  nextAttemptAt: null,
  leaseExpiresAt: null,
  dependencyStatus: null,
  ...extras,
});

describe("Ledger queue activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActiveUserId.mockResolvedValue("account-a");
    mocks.getAllAsync.mockResolvedValue([]);
  });

  it("keeps terminal rows visible without making them actionable", () => {
    expect(
      classifyLedgerQueueActivity([row("FAILED"), row("CONFLICT"), row("FAILED")], 1_000),
    ).toEqual({ unresolvedCount: 3, actionableNow: 0, nextActionableAt: null });
  });

  it("counts due work, schedules future retry and lease recovery, and excludes auth pause", () => {
    expect(
      classifyLedgerQueueActivity(
        [
          row("PENDING"),
          row("RETRYABLE", { nextAttemptAt: new Date(900).toISOString() }),
          row("RETRYABLE", { nextAttemptAt: new Date(5_000).toISOString() }),
          row("PROCESSING", { leaseExpiresAt: new Date(7_000).toISOString() }),
          row("PROCESSING"),
          row("DEPENDENCY_BLOCKED", { dependencyStatus: "PENDING" }),
          row("PENDING", { failureCategory: "AUTH" }),
        ],
        1_000,
      ),
    ).toEqual({ unresolvedCount: 7, actionableNow: 2, nextActionableAt: 5_000 });
  });

  it("treats a completed dependency and expired lease as executable", () => {
    expect(
      classifyLedgerQueueActivity(
        [
          row("DEPENDENCY_BLOCKED", { dependencyStatus: "COMPLETED" }),
          row("PROCESSING", { leaseExpiresAt: new Date(500).toISOString() }),
        ],
        1_000,
      ).actionableNow,
    ).toBe(2);
  });

  it("does not wake blocked receipt links while their upload waits or permanently fails", () => {
    expect(
      classifyLedgerQueueActivity(
        [
          row("PENDING", {
            failureCategory: "DEPENDENCY",
            dependencyStatus: "RETRYABLE",
          }),
          row("FAILED", { failureCategory: "DEPENDENCY", dependencyStatus: "FAILED" }),
          row("PENDING", { dependencyStatus: "WAITING" }),
          row("PENDING", { dependencyStatus: "COMPLETED" }),
        ],
        1_000,
      ),
    ).toEqual({ unresolvedCount: 4, actionableNow: 1, nextActionableAt: null });
  });

  it("uses active account and Journey scope for both queues", async () => {
    await getLedgerQueueActivity("journey-a");
    expect(mocks.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining("operation.owner_user_id = ?"),
      "account-a",
      "journey-a",
      "account-a",
      "journey-a",
    );
    expect(mocks.getAllAsync.mock.calls[0][0]).toContain("operation.journey_id = ?");
    expect(mocks.getAllAsync.mock.calls[0][0]).not.toContain(
      "entity_type = 'settlement_review'",
    );
    await getLedgerQueueActivity();
    expect(mocks.getAllAsync.mock.calls[1][0]).toContain(
      "entity_type = 'settlement_review'",
    );
    expect(mocks.getAllAsync.mock.calls[1].slice(1)).toEqual(["account-a", "account-a"]);
  });
});

it("Ledger presentation query excludes intelligence entity counts", async () => {
  mocks.getAllAsync.mockClear();
  mocks.getAllAsync.mockResolvedValue([]);
  await getLedgerQueueActivity();
  const sql = mocks.getAllAsync.mock.calls[0][0] as string;
  expect(sql).toContain("operation.entity_type LIKE 'ledger_%'");
  expect(sql).not.toContain("operation.entity_type = 'INTELLIGENCE_CONTINUATION'");
  expect(sql).toContain("dependency.operation_type='INTELLIGENCE_CONTINUATION_WAKE'");
});

it("keeps metadata activity scheduler-only with exact account/kind/dependency boundaries", async () => {
  const db = {
    getAllAsync: vi.fn().mockResolvedValue([
      {
        status: "RETRYABLE",
        failureCategory: "SERVER",
        nextAttemptAt: new Date(Date.now() + 5000).toISOString(),
        leaseExpiresAt: null,
        dependencyStatus: "COMPLETED",
      },
    ]),
  };
  expect(
    (await getTripMetadataQueueActivity(db as never, "account-a")).nextActionableAt,
  ).not.toBeNull();
  expect(db.getAllAsync).toHaveBeenCalledWith(
    expect.stringContaining("operation.operation_type='UPDATE_TRIP_METADATA'"),
    "account-a",
  );
  expect(db.getAllAsync.mock.calls[0][0]).toContain(
    "dependency.owner_user_id=operation.owner_user_id",
  );
  expect(db.getAllAsync.mock.calls[0][0]).toContain("operation.entity_type='TRIP'");
  await getLedgerQueueActivity();
  expect(mocks.getAllAsync.mock.calls.at(-1)?.[0]).not.toContain("UPDATE_TRIP_METADATA");
});

it("scheduler reads dependency-free metadata queued during a cycle and ignores other accounts and unresolved creates", async () => {
  const sql = new DatabaseSync(":memory:");
  try {
    sql.exec(`CREATE TABLE sync_operations(id TEXT,owner_user_id TEXT,entity_type TEXT,operation_type TEXT,status TEXT,failure_category TEXT,next_attempt_at TEXT,lease_expires_at TEXT,dependency_operation_id TEXT);
      INSERT INTO sync_operations VALUES('new','account-a','TRIP','UPDATE_TRIP_METADATA','DEPENDENCY_BLOCKED',NULL,NULL,NULL,NULL);
      INSERT INTO sync_operations VALUES('create','account-a','TRIP','CREATE_TRIP','DEPENDENCY_BLOCKED',NULL,NULL,NULL,NULL);
      INSERT INTO sync_operations VALUES('blocked','account-a','TRIP','UPDATE_TRIP_METADATA','DEPENDENCY_BLOCKED',NULL,NULL,NULL,'create');
      INSERT INTO sync_operations VALUES('other','account-b','TRIP','UPDATE_TRIP_METADATA','PENDING',NULL,NULL,NULL,NULL);`);
    const db = {
      getAllAsync: async (query: string, ...values: unknown[]) =>
        sql.prepare(query).all(...(values as never[])),
    };
    expect(await getTripMetadataQueueActivity(db as never, "account-a")).toEqual({
      unresolvedCount: 2,
      actionableNow: 1,
      nextActionableAt: null,
    });
  } finally {
    sql.close();
  }
});
