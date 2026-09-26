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
