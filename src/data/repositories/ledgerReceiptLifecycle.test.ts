import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";

import { migrations } from "@/data/db/migrations";
import { pushReceiptOperation } from "@/data/sync/ledgerReceiptSyncWorker";
import { createLedgerReceiptRepository } from "./ledgerReceiptRepository";
vi.mock("@/data/files/receiptFileStore", () => ({
  verifyReceiptFile: vi.fn(async () => {}),
}));

vi.mock("@/data/sync/ledgerQueueActivity", () => ({
  announceLedgerQueueWorkAvailable: vi.fn(),
}));

describe("offline Expense attachment lifecycle", () => {
  it("survives restart, releases a slot on delete, and keeps Personal Payment evidence", async () => {
    const sqlite = new DatabaseSync(":memory:");
    for (const migration of migrations.filter((item) => item.id < 38))
      sqlite.exec(migration.sql);
    sqlite
      .prepare(
        `INSERT INTO ledger_asset_operations
      (id, journey_id, asset_id, operation_type, idempotency_key,
       owner_user_id, status, created_at, updated_at)
      VALUES ('prior-op', 'other-journey', 'old-asset', 'UPLOAD_RECEIPT',
       'prior-key', 'other-user', 'COMPLETED', 'now', 'now')`,
      )
      .run();
    sqlite.exec(migrations.find((item) => item.id === 38)!.sql);
    sqlite.exec(migrations.find((item) => item.id === 39)!.sql);
    expect(
      sqlite
        .prepare(
          "SELECT operation_type FROM ledger_asset_operations WHERE id = 'prior-op'",
        )
        .get(),
    ).toMatchObject({ operation_type: "UPLOAD_RECEIPT" });
    const database = {
      runAsync: async (sql: string, ...params: unknown[]) =>
        sqlite.prepare(sql).run(...(params as [])),
      getFirstAsync: async (sql: string, ...params: unknown[]) =>
        sqlite.prepare(sql).get(...(params as [])),
      getAllAsync: async (sql: string, ...params: unknown[]) =>
        sqlite.prepare(sql).all(...(params as [])),
      withTransactionAsync: async (task: () => Promise<void>) => {
        sqlite.exec("BEGIN");
        try {
          await task();
          sqlite.exec("COMMIT");
        } catch (error) {
          sqlite.exec("ROLLBACK");
          throw error;
        }
      },
    };
    sqlite
      .prepare(
        `INSERT INTO ledger_actor_context
      (user_id, journey_id, member_id, role, capabilities_json, updated_at)
      VALUES ('user', 'journey', 'member', 'group_member', '{}', 'now')`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO ledger_expenses
      (id, journey_id, payer_member_id, title, category, occurred_at,
       original_amount_minor, original_currency, original_scale, business_status,
       revision, sync_status, created_at, updated_at)
      VALUES ('expense', 'journey', 'member', 'Train', 'transport', 'now',
       100, 'NZD', 2, 'ACCEPTED', 1, 'SYNCED', 'now', 'now')`,
      )
      .run();
    const repository = createLedgerReceiptRepository(
      database as never,
      async () => "user",
    );
    const input = (id: string) => ({
      id,
      journeyId: "journey",
      expenseId: "expense",
      localUri: `file:///${id}.jpg`,
      mimeType: "image/jpeg" as const,
      sizeBytes: 3,
      sha256: "a".repeat(64),
      requestOcr: false,
    });
    for (let n = 0; n < 3; n++) {
      expect(
        (await repository.listReceipts("journey")).filter(
          (row) => row.expenseId === "expense",
        ),
      ).toHaveLength(n);
      await repository.importReceipt(input(`receipt-${n}`));
    }
    expect(
      (await repository.listReceipts("journey")).filter(
        (row) => row.expenseId === "expense",
      ),
    ).toHaveLength(3);
    await expect(repository.importReceipt(input("receipt-3"))).rejects.toThrow(
      "Maximum 3",
    );
    sqlite
      .prepare(
        "UPDATE ledger_receipt_assets SET server_id = 'server-0', upload_status = 'UPLOADED' WHERE id = 'receipt-0'",
      )
      .run();
    await repository.deleteExpenseAttachment("receipt-0");
    sqlite
      .prepare(
        `UPDATE ledger_receipt_assets SET server_id = 'server-' || id
      WHERE id IN ('receipt-1', 'receipt-2')`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO ledger_actor_context
      (user_id, journey_id, member_id, role, capabilities_json, updated_at)
      VALUES ('viewer', 'journey', 'viewer-member', 'guest', '{}', 'now')`,
      )
      .run();
    const viewer = createLedgerReceiptRepository(database as never, async () => "viewer");
    expect(
      (await viewer.listReceipts("journey")).filter((row) => row.expenseId === "expense"),
    ).toHaveLength(3);
    await expect(viewer.deleteExpenseAttachment("receipt-1")).rejects.toThrow(
      "mutation access",
    );
    expect(await viewer.listPendingOperations()).toHaveLength(0);
    sqlite
      .prepare(
        `INSERT INTO ledger_actor_context
      (user_id, journey_id, member_id, role, capabilities_json, updated_at)
      VALUES ('writer-b', 'journey', 'writer-b-member', 'group_member', '{}', 'now')`,
      )
      .run();
    const writerB = createLedgerReceiptRepository(
      database as never,
      async () => "writer-b",
    );
    await expect(writerB.deleteExpenseAttachment("receipt-0")).rejects.toThrow(
      "Another account",
    );
    expect(await writerB.listPendingOperations()).toHaveLength(0);
    const restarted = createLedgerReceiptRepository(
      database as never,
      async () => "user",
    );
    expect(
      (await restarted.listReceipts("journey")).filter(
        (row) => row.expenseId === "expense",
      ),
    ).toHaveLength(2);
    const deletion = (await restarted.listPendingOperations()).find(
      (op) => op.operationType === "DELETE_RECEIPT",
    );
    expect(deletion).toBeDefined();
    expect((await restarted.listPendingOperations())[0]?.operationType).toBe(
      "DELETE_RECEIPT",
    );
    expect(await restarted.hasPendingExpenseDeletion("expense")).toBe(true);
    const transport = {
      deleteExpenseReceipt: vi.fn(async () => ({
        entity: { deletedAt: "2026-09-27T01:00:00Z" },
      })),
    };
    await pushReceiptOperation(deletion!, restarted, {} as never, transport as never);
    expect(transport.deleteExpenseReceipt).toHaveBeenCalledWith(
      "journey",
      "server-0",
      deletion!.idempotencyKey,
    );
    await restarted.markOperation(deletion!.id, "COMPLETED");
    expect(await restarted.hasPendingExpenseDeletion("expense")).toBe(false);
    expect(
      (await viewer.listReceipts("journey")).filter((row) => row.expenseId === "expense"),
    ).toHaveLength(2);
    await restarted.deleteExpenseAttachment("receipt-0");
    expect(
      (await restarted.listPendingOperations()).filter(
        (op) => op.operationType === "DELETE_RECEIPT",
      ),
    ).toHaveLength(0);
    await restarted.importReceipt(input("receipt-3"));
    expect(
      (await restarted.listReceipts("journey")).filter(
        (row) => row.expenseId === "expense",
      ),
    ).toHaveLength(3);
    await restarted.importReceipt({
      ...input("payment-evidence"),
      expenseId: null,
      personalPaymentId: "payment",
    });
    expect(await restarted.listPersonalPaymentAttachments("payment")).toHaveLength(1);
    expect(
      sqlite
        .prepare("SELECT local_uri FROM ledger_receipt_assets WHERE id = 'receipt-0'")
        .get(),
    ).toMatchObject({ local_uri: "file:///receipt-0.jpg" });
    sqlite.close();
  });
});
