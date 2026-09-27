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
      getFirstAsync: vi.fn(async (_sql: string): Promise<unknown> => null),
    },
  };
}

describe("Ledger receipt import", () => {
  it("reads upload failure evidence only for an owned receipt operation", async () => {
    const database = fakeDatabase();
    database.value.getFirstAsync.mockImplementation(async (sql: string) =>
      sql.includes("FROM ledger_receipt_assets")
        ? { id: "receipt", ocrSuggestionJson: null, deletedAt: null, updatedAt: "now" }
        : sql.includes("FROM ledger_asset_operations")
          ? { id: "op", status: "FAILED", errorCode: "SYNC_FAILED" }
          : null,
    );
    const repository = createLedgerReceiptRepository(
      database.value as never,
      async () => "user-a",
    );
    expect(await repository.getUploadDiagnostic("receipt")).toMatchObject({
      id: "op",
      errorCode: "SYNC_FAILED",
    });
    expect(database.value.getFirstAsync).toHaveBeenLastCalledWith(
      expect.stringContaining("asset_id = ? AND owner_user_id = ?"),
      "receipt",
      "user-a",
    );
  });

  it("checks the active Expense count before durable import while leaving payment evidence alone", async () => {
    const database = fakeDatabase();
    database.value.getFirstAsync.mockImplementation(async (sql: string) =>
      sql.includes("ledger_actor_context actor")
        ? { role: "group_member" }
        : sql.includes("count(*) AS count")
          ? { count: 3 }
          : null,
    );
    const repository = createLedgerReceiptRepository(
      database.value as never,
      async () => "user-a",
    );
    await expect(
      repository.importReceipt({
        id: "fourth",
        journeyId: "journey",
        expenseId: "expense",
        localUri: "file:///receipt.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 3,
        sha256: "a".repeat(64),
        requestOcr: false,
      }),
    ).rejects.toThrow("Maximum 3");
    expect(database.writes).toHaveLength(0);
    await repository.importReceipt({
      id: "evidence",
      journeyId: "journey",
      personalPaymentId: "payment",
      localUri: "file:///receipt.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 3,
      sha256: "a".repeat(64),
      requestOcr: false,
    });
    expect(
      database.writes.some((write) => write.sql.includes("ledger_receipt_assets")),
    ).toBe(true);
  });

  it("queues one durable tombstone and hides it without deleting local bytes", async () => {
    const database = fakeDatabase();
    const row = {
      id: "receipt",
      serverId: "server",
      journeyId: "journey",
      expenseId: "expense",
      personalPaymentId: null,
      personalPaymentLinkStatus: null,
      localUri: "file:///only-copy.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 3,
      sha256: "a".repeat(64),
      objectPath: "path",
      uploadStatus: "UPLOADED",
      ocrStatus: "PENDING",
      ocrSuggestionJson: null,
      deletedAt: null,
      createdAt: "now",
      updatedAt: "now",
    };
    database.value.getFirstAsync.mockImplementation(async (sql: string) =>
      sql.includes("ledger_actor_context actor") && sql.includes("JOIN ledger_expenses")
        ? { role: "group_member" }
        : row,
    );
    const repository = createLedgerReceiptRepository(
      database.value as never,
      async () => "user-a",
    );
    await repository.deleteExpenseAttachment("receipt");
    expect(database.writes.some((write) => write.sql.includes("deleted_at = ?"))).toBe(
      true,
    );
    expect(database.writes.some((write) => write.params[3] === "DELETE_RECEIPT")).toBe(
      true,
    );
    expect(
      database.writes.some((write) =>
        /DELETE FROM ledger_receipt_assets/i.test(write.sql),
      ),
    ).toBe(false);
  });
  it("keeps local ownership through create and complete reconciliation", async () => {
    const database = fakeDatabase();
    const repository = createLedgerReceiptRepository(
      database.value as never,
      async () => "user-a",
    );
    const receipt = {
      id: "40000000-0000-4000-8000-000000000001",
      localId: "draft-a",
      journeyId: "10000000-0000-4000-8000-000000000001",
      expenseId: null,
      objectPath: "path",
      mimeType: "image/jpeg" as const,
      sizeBytes: 3,
      sha256: "a".repeat(64),
      uploadStatus: "PENDING" as const,
      ocrStatus: "PENDING" as const,
      ocrSuggestion: null,
      createdAt: "now",
      updatedAt: "now",
    };
    await repository.reconcile("draft-a", receipt);
    await repository.reconcile("draft-a", { ...receipt, uploadStatus: "UPLOADED" });
    expect(
      database.writes.filter((write) =>
        write.sql.includes("UPDATE ledger_receipt_assets"),
      ),
    ).toHaveLength(2);
    expect(database.writes[0].sql).not.toContain("local_owner_user_id = NULL");
  });
  it("queues OCR only when explicitly requested", async () => {
    for (const requestOcr of [false, true]) {
      const database = fakeDatabase();
      await createLedgerReceiptRepository(
        database.value as never,
        async () => "user-a",
      ).importReceipt({
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

  it("retains the Personal Payment upload and link path", async () => {
    const database = fakeDatabase();
    await createLedgerReceiptRepository(
      database.value as never,
      async () => "user-a",
    ).importReceipt({
      id: "payment-evidence",
      journeyId: "journey",
      personalPaymentId: "payment-1",
      localUri: "file:///payment.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 3,
      sha256: "b".repeat(64),
      requestOcr: false,
    });
    expect(
      database.writes.find((write) => write.sql.includes("INTO ledger_receipt_assets"))
        ?.params[3],
    ).toBe("payment-1");
    expect(
      database.writes
        .filter((write) => write.sql.includes("INTO ledger_asset_operations"))
        .map((write) => write.params[3]),
    ).toEqual(["UPLOAD_RECEIPT", "LINK_RECEIPT"]);
  });
});
