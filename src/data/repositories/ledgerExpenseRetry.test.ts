import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";

import {
  createLedgerExpenseRepository,
  type LedgerExpenseDatabase,
} from "./ledgerExpenseRepository";

it("retries only an unconfirmed failed Expense predecessor with a blocked successor", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE sync_operations (
        id TEXT PRIMARY KEY, owner_user_id TEXT, entity_type TEXT, entity_id TEXT,
        status TEXT, last_error_code TEXT, failure_category TEXT,
        last_error_message TEXT, next_attempt_at TEXT, claim_owner TEXT,
        lease_expires_at TEXT, updated_at TEXT, dependency_operation_id TEXT
      );
      CREATE TABLE ledger_expense_operation_receipts (account_id TEXT, operation_id TEXT);
      INSERT INTO sync_operations (id, owner_user_id, entity_type, entity_id, status, last_error_code)
        VALUES ('failed', 'owner', 'ledger_expense', 'expense', 'FAILED', 'INVALID_PAYLOAD');
      INSERT INTO sync_operations (id, owner_user_id, entity_type, entity_id, status, dependency_operation_id)
        VALUES ('later', 'owner', 'ledger_expense', 'expense', 'DEPENDENCY_BLOCKED', 'failed');
    `);
    const repository = createLedgerExpenseRepository(
      {
        async runAsync(sql: string, ...params: unknown[]) {
          const result = sqlite.prepare(sql).run(...(params as unknown as []));
          return { changes: Number(result.changes) } as never;
        },
      } as unknown as LedgerExpenseDatabase,
      async () => "owner",
    );
    expect(await repository.retryFailedPredecessor("other", "failed")).toBe(false);
    expect(await repository.retryFailedPredecessor("expense", "failed")).toBe(true);
    expect(
      sqlite.prepare("SELECT status FROM sync_operations WHERE id='failed'").get(),
    ).toEqual({
      status: "PENDING",
    });
    expect(await repository.retryFailedPredecessor("expense", "failed")).toBe(false);
  } finally {
    sqlite.close();
  }
});
