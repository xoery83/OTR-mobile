import { describe, expect, it, vi } from "vitest";

import { createLedgerReceiptRepository } from "./ledgerReceiptRepository";

function fakeDatabase() {
  const writes: { sql: string; params: unknown[] }[] = [];
  return {
    writes,
    value: {
      withTransactionAsync: async (task: () => Promise<void>) => task(),
      runAsync: vi.fn(async (sql: string, ...params: unknown[]) => {
        writes.push({ sql, params });
        return { changes: 1 };
      }),
      getAllAsync: vi.fn(async () => []),
      getFirstAsync: vi.fn(async () => null),
    },
  };
}

describe("Ledger receipt import", () => {
  it("queues OCR only when explicitly requested", async () => {
    for (const requestOcr of [false, true]) {
      const database = fakeDatabase();
      await createLedgerReceiptRepository(database.value as never).importReceipt({
        id: `receipt-${requestOcr}`,
        journeyId: "journey",
        localUri: "file:///receipt.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 3,
        sha256: "a".repeat(64),
        requestOcr,
      });
      const operations = database.writes
        .filter((write) => write.sql.includes("ledger_asset_operations"))
        .map((write) => write.params[3]);
      expect(operations).toContain("UPLOAD_RECEIPT");
      expect(operations.includes("OCR_RECEIPT")).toBe(requestOcr);
    }
  });
});
