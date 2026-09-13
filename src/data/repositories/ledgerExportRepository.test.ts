import { describe, expect, it, vi } from "vitest";

import { createLedgerExportRepository } from "./ledgerExportRepository";

describe("Stage 7.3 export manifest repository", () => {
  it("stores only local export metadata", async () => {
    const database = { getAllAsync: vi.fn(async () => []), runAsync: vi.fn() };
    const repository = createLedgerExportRepository(database);
    await repository.save({
      statementDigest: "a".repeat(64),
      journeyId: "journey",
      rootSettlementId: "root",
      headSettlementId: "head",
      exportSchemaVersion: 1,
      privacyMode: "MEMBER",
      format: "CSV",
      fileUri: "file:///documents/root/head/digest/member/statement.csv",
      fileSha256: "b".repeat(64),
      generatedAt: "2026-09-13T00:00:00.000Z",
    });
    expect(database.runAsync.mock.calls[0]?.[0]).toContain("ledger_settlement_exports");
    expect(database.runAsync.mock.calls[0]?.[0]).not.toContain(
      "ledger_settlement_audit_events",
    );
    await repository.list("journey");
    expect(database.getAllAsync).toHaveBeenCalledWith(expect.any(String), "journey");
  });
});
