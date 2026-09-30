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
      CREATE TABLE ledger_expense_operation_receipts (account_id TEXT, operation_id TEXT, receipt_json TEXT);
      CREATE TABLE ledger_expense_commands (
        account_id TEXT, operation_id TEXT, expense_id TEXT, predecessor_operation_id TEXT,
        observed_server_revision INTEGER, bound_execution_revision INTEGER, bound_request_json TEXT
      );
      CREATE TABLE ledger_expense_canonical_baselines (account_id TEXT, expense_id TEXT, revision INTEGER);
      INSERT INTO sync_operations (id, owner_user_id, entity_type, entity_id, status, last_error_code)
        VALUES ('failed', 'owner', 'ledger_expense', 'expense', 'FAILED', 'INVALID_PAYLOAD');
      INSERT INTO sync_operations (id, owner_user_id, entity_type, entity_id, status, dependency_operation_id)
        VALUES ('later', 'owner', 'ledger_expense', 'expense', 'DEPENDENCY_BLOCKED', 'failed');
    `);
    const repository = createLedgerExpenseRepository(
      {
        async withTransactionAsync(task: () => Promise<void>) {
          await task();
        },
        async runAsync(sql: string, ...params: unknown[]) {
          const result = sqlite.prepare(sql).run(...(params as unknown as []));
          return { changes: Number(result.changes) } as never;
        },
        async getFirstAsync<T>(sql: string, ...params: unknown[]) {
          return (sqlite.prepare(sql).get(...(params as unknown as [])) as T) ?? null;
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

    sqlite.exec(`
      UPDATE sync_operations SET status='FAILED', last_error_code='INVALID_PAYLOAD' WHERE id='failed';
      INSERT INTO sync_operations (id, owner_user_id, entity_type, entity_id, status)
        VALUES ('older', 'owner', 'ledger_expense', 'expense', 'COMPLETED');
      UPDATE sync_operations SET dependency_operation_id='older' WHERE id='failed';
      INSERT INTO ledger_expense_operation_receipts VALUES
        ('owner', 'older', '{"canonicalRevision":3}');
      INSERT INTO ledger_expense_canonical_baselines VALUES ('owner', 'expense', 4);
      INSERT INTO ledger_expense_commands VALUES
        ('owner', 'failed', 'expense', 'older', 4, 4,
         '{"envelope":{"causalBaseReceipt":{"canonicalRevision":3},"boundExecutionRevision":4}}');
    `);
    expect(await repository.retryFailedPredecessor("expense", "failed")).toBe(true);
    expect(
      sqlite
        .prepare(
          "SELECT predecessor_operation_id, bound_request_json FROM ledger_expense_commands WHERE operation_id='failed'",
        )
        .get(),
    ).toEqual({ predecessor_operation_id: null, bound_request_json: null });
  } finally {
    sqlite.close();
  }
});
