import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FinalizedSettlementDto } from "@/data/api/ledgerSettlementContracts";
import { generateCurrentSettlementExport } from "./ledgerExportCoordinator";

vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: vi.fn(async () => "d".repeat(64)),
}));
vi.mock("@/data/files/settlementExportFileStore", () => ({
  createSettlementExportFileStore: vi.fn(),
}));
vi.mock("@/data/repositories/defaultLedgerExportRepository", () => ({
  getDefaultLedgerExportRepository: vi.fn(),
}));
vi.mock("@/data/repositories/defaultLedgerSettlementRepository", () => ({
  getDefaultLedgerSettlementRepository: vi.fn(),
}));
vi.mock("./ledgerExpenseDemoCoordinator", () => ({ runLedgerExpenseSync: vi.fn() }));
vi.mock("./ledgerReportingCoordinator", () => ({ revalidateJourneyLedger: vi.fn() }));
vi.mock("./ledgerSettlementPaymentCoordinator", () => ({
  runLedgerSettlementPaymentSync: vi.fn(),
}));

const root: FinalizedSettlementDto = {
  id: "70000000-0000-4000-8000-000000000001",
  journeyId: "10000000-0000-4000-8000-000000000001",
  kind: "ROOT",
  rootSettlementId: null,
  parentAdjustmentId: null,
  lineageSequence: 0,
  priorInputDigest: null,
  adjustmentReason: null,
  eligibilityVersion: "ledger-settlement-eligibility-v1",
  status: "SETTLED",
  throughTimestamp: "2026-09-12T00:00:00.000Z",
  settlementCurrency: "NZD",
  settlementScale: 2,
  settingsRevision: 1,
  algorithmVersion: "ledger-settlement-greedy-v1",
  inputDigest: "a".repeat(64),
  revision: 1,
  finalizedBy: "20000000-0000-4000-8000-000000000001",
  finalizedAt: "2026-09-12T00:00:00.000Z",
  adjustmentState: "CURRENT",
  lineageHeadId: "70000000-0000-4000-8000-000000000001",
  outstandingBalances: [],
  inputs: [],
  balances: [],
  transfers: [],
  auditEvents: [],
};

describe("Stage 7.3 current export gate", () => {
  const syncExpenses = vi.fn(async () => ({
    status: "syncing" as const,
    processedCount: 0,
  }));
  const syncSettlement = vi.fn(async () => ({
    status: "syncing" as const,
    processedCount: 0,
  }));
  const revalidate = vi.fn(async () => ({ settlements: [root] }));
  const hasPendingFinancialOperations = vi.fn(async () => false);
  const isOrganizer = vi.fn(async () => true);
  const listFinalized = vi.fn(async () => [root]);
  const save = vi.fn();
  const writeCsv = vi.fn(async () => ({
    uri: "file:///documents/statement.csv",
    sha256: "f".repeat(64),
  }));

  beforeEach(() => vi.clearAllMocks());

  it("syncs, validates the exact canonical head, then stores metadata only", async () => {
    const result = await generateCurrentSettlementExport(
      root.journeyId,
      "CSV",
      "MEMBER",
      {
        syncExpenses,
        syncSettlement,
        revalidate: revalidate as never,
        settlementRepository: {
          hasPendingFinancialOperations,
          isOrganizer,
          listFinalized,
        } as never,
        exportRepository: { save } as never,
        fileStore: { writeCsv } as never,
        now: () => "2026-09-13T00:00:00.000Z",
      },
    );
    expect(syncExpenses).toHaveBeenCalledWith({ journeyId: root.journeyId });
    expect(syncSettlement).toHaveBeenCalledWith("AUTHENTICATED_ONLINE", root.journeyId);
    expect(revalidate.mock.invocationCallOrder[0]).toBeGreaterThan(
      syncSettlement.mock.invocationCallOrder[0]!,
    );
    expect(hasPendingFinancialOperations).toHaveBeenCalledTimes(2);
    expect(writeCsv).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledOnce();
    expect(result.manifest.statementDigest).toBe("d".repeat(64));
  });

  it("refuses a local/server lineage mismatch before creating a file", async () => {
    await expect(
      generateCurrentSettlementExport(root.journeyId, "CSV", "MEMBER", {
        syncExpenses,
        syncSettlement,
        revalidate: vi.fn(async () => ({
          settlements: [{ ...root, inputDigest: "b".repeat(64) }],
        })) as never,
        settlementRepository: {
          hasPendingFinancialOperations,
          isOrganizer,
          listFinalized,
        } as never,
        exportRepository: { save } as never,
        fileStore: { writeCsv } as never,
      }),
    ).rejects.toThrow("does not match");
    expect(writeCsv).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("does not assert a new current-final export while offline", async () => {
    await expect(
      generateCurrentSettlementExport(root.journeyId, "CSV", "MEMBER", {
        syncExpenses: vi.fn(async () => {
          throw new Error("offline");
        }),
        syncSettlement,
        revalidate: revalidate as never,
        settlementRepository: {
          hasPendingFinancialOperations,
          isOrganizer,
          listFinalized,
        } as never,
        exportRepository: { save } as never,
        fileStore: { writeCsv } as never,
      }),
    ).rejects.toThrow("offline");
    expect(writeCsv).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
