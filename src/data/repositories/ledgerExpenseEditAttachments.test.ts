import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { migrations } from "@/data/db/migrations";
import { createLedgerReceiptRepository } from "./ledgerReceiptRepository";
import { canEditLedgerExpense } from "./ledgerExpenseEditAccess";
import {
  createLedgerExpenseRepository,
  type LedgerExpenseCommand,
  type LedgerExpenseDatabase,
} from "./ledgerExpenseRepository";
vi.mock("@/data/sync/ledgerQueueActivity", () => ({
  announceLedgerQueueWorkAvailable: vi.fn(),
}));
const journeyId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";
const memberId = "30000000-0000-4000-8000-000000000001";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of migrations) sqlite.exec(migration.sql);
  sqlite
    .prepare(
      `INSERT INTO ledger_actor_context
       (user_id, journey_id, member_id, role, capabilities_json, updated_at)
       VALUES (?, ?, ?, 'owner', '{}', '2026-09-24T00:00:00Z')`,
    )
    .run(userId, journeyId, memberId);
  const api = {
    async withTransactionAsync(task: () => Promise<void>) {
      sqlite.exec("BEGIN");
      try {
        await task();
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    async runAsync(sql: string, ...args: unknown[]) {
      const result = sqlite.prepare(sql).run(...(args as never[]));
      return { changes: Number(result.changes) } as never;
    },
    async getFirstAsync<T>(sql: string, ...args: unknown[]) {
      return (sqlite.prepare(sql).get(...(args as never[])) as T | undefined) ?? null;
    },
    async getAllAsync<T>(sql: string, ...args: unknown[]) {
      return sqlite.prepare(sql).all(...(args as never[])) as T[];
    },
  } satisfies LedgerExpenseDatabase;
  return { sqlite, api };
}

function command(title: string): LedgerExpenseCommand {
  return {
    journeyId,
    creatorMemberId: memberId,
    payerMemberId: memberId,
    title,
    category: "food",
    occurredAt: "2026-09-24T10:00:00Z",
    economicDate: "2026-09-24",
    original: { minor: 100, currency: "NZD", scale: 2 },
    participants: [{ memberId, displayNameSnapshot: "A", householdIdSnapshot: null }],
    splits: [
      {
        memberId,
        method: "EQUAL_PERSON",
        originalMinor: 100,
        settlementMinor: 100,
        weightUnits: null,
        percentageUnits: null,
        roundingAdjustmentMinor: 0,
      },
    ],
    valuation: {
      id: "40000000-0000-4000-8000-000000000001",
      policy: "SAME_CURRENCY",
      original: { minor: 100, currency: "NZD", scale: 2 },
      settlement: { minor: 100, currency: "NZD", scale: 2 },
      rateSnapshotId: null,
      paymentRecordId: null,
      reason: null,
    },
    status: "ACCEPTED",
  };
}

async function fixture() {
  const { sqlite, api } = database();
  const expenses = createLedgerExpenseRepository(api, async () => userId);
  const receipts = createLedgerReceiptRepository(api, async () => userId);
  const expense = await expenses.createExpense(command("original"));
  const receipt = (id: string) => ({
    id,
    localUri: `file:///${id}.jpg`,
    mimeType: "image/jpeg" as const,
    sizeBytes: 3,
    sha256: "a".repeat(64),
  });
  for (let i = 0; i < 3; i++)
    await receipts.importReceipt({
      ...receipt(`receipt-${i}`),
      journeyId,
      expenseId: expense.id,
      requestOcr: false,
    });
  const expectedIds = (await receipts.listReceipts(journeyId)).map((item) => item.id);
  const edit = {
    added: [receipt("replacement")],
    removedIds: ["receipt-0"],
    expectedIds,
    expectedRevision: expense.revision,
  };
  return { sqlite, api, expenses, receipts, expense, edit };
}

describe("Expense Edit attachment transaction", () => {
  it("stages without writes, atomically replaces at capacity, retains data on Expense tombstone", async () => {
    const { sqlite, expenses, receipts, expense, edit } = await fixture();
    // Edit/Cancel operate only on an in-memory set; no repository mutation.
    const intended = edit.expectedIds
      .filter((id) => !edit.removedIds.includes(id))
      .concat(edit.added.map((item) => item.id));
    expect(intended).toHaveLength(3);
    expect(
      (await receipts.listReceipts(journeyId)).map((item) => item.id).sort(),
    ).toEqual([...edit.expectedIds].sort());
    const saved = await expenses.updateExpense(
      expense.id,
      command("edited"),
      "edit",
      edit,
    );
    expect(saved.title).toBe("edited");
    expect(
      (await receipts.listReceipts(journeyId)).map((item) => item.id).sort(),
    ).toEqual(intended.sort());
    expect(
      sqlite
        .prepare("SELECT deleted_at FROM ledger_receipt_assets WHERE id = 'receipt-0'")
        .get(),
    ).toMatchObject({ deleted_at: expect.any(String) });
    expect(
      sqlite
        .prepare(
          "SELECT operation_type FROM ledger_asset_operations WHERE asset_id = 'receipt-0' AND operation_type = 'DELETE_RECEIPT'",
        )
        .get(),
    ).toBeTruthy();
    expect(
      sqlite
        .prepare(
          "SELECT operation_type FROM ledger_asset_operations WHERE asset_id = 'replacement' ORDER BY rowid",
        )
        .all(),
    ).toEqual([{ operation_type: "UPLOAD_RECEIPT" }, { operation_type: "LINK_RECEIPT" }]);
    await expenses.tombstoneExpense(expense.id, "delete");
    expect((await expenses.getExpense(expense.id))?.status).toBe("DELETED");
    expect(await expenses.listExpensesForJourney(journeyId)).toEqual([]);
    expect(sqlite.prepare("SELECT id FROM ledger_receipt_assets").all()).toHaveLength(4);
    expect(
      sqlite
        .prepare("SELECT member_id FROM ledger_expense_splits WHERE expense_id = ?")
        .all(expense.id),
    ).toHaveLength(1);
    expect(
      sqlite
        .prepare("SELECT id FROM ledger_valuation_snapshots WHERE expense_id = ?")
        .all(expense.id),
    ).toHaveLength(1);
  });

  it("rolls back tombstones, additions and queues if Expense update fails", async () => {
    const { sqlite, expenses, receipts, expense, edit } = await fixture();
    sqlite.exec(
      "CREATE TRIGGER reject_edit BEFORE UPDATE ON ledger_expenses BEGIN SELECT RAISE(ABORT, 'rejected'); END;",
    );
    await expect(
      expenses.updateExpense(expense.id, command("edited"), "edit", edit),
    ).rejects.toThrow("rejected");
    expect(
      (await receipts.listReceipts(journeyId)).map((item) => item.id).sort(),
    ).toEqual([...edit.expectedIds].sort());
    expect((await expenses.getExpense(expense.id))?.title).toBe("original");
    expect(
      sqlite
        .prepare(
          "SELECT id FROM ledger_asset_operations WHERE operation_type = 'DELETE_RECEIPT' OR asset_id = 'replacement'",
        )
        .all(),
    ).toEqual([]);
  });

  it("rejects stale expense revisions and changed attachment sets", async () => {
    const { expenses, receipts, expense, edit } = await fixture();
    await expect(
      expenses.updateExpense(expense.id, command("edited"), "edit", {
        ...edit,
        expectedRevision: 0,
      }),
    ).rejects.toThrow("Expense changed");
    await receipts.deleteExpenseAttachment("receipt-1");
    await expect(
      expenses.updateExpense(expense.id, command("edited"), "edit", edit),
    ).rejects.toThrow("Attachments changed");
    expect((await expenses.getExpense(expense.id))?.title).toBe("original");
  });

  it("rejects over-capacity and foreign removals without changing the original set", async () => {
    const { expenses, receipts, expense, edit } = await fixture();
    await expect(
      expenses.updateExpense(expense.id, command("edited"), "edit", {
        ...edit,
        removedIds: [],
      }),
    ).rejects.toThrow("Maximum 3");
    await expect(
      expenses.updateExpense(expense.id, command("edited"), "edit", {
        ...edit,
        removedIds: ["foreign"],
      }),
    ).rejects.toThrow("does not belong");
    expect(await receipts.listReceipts(journeyId)).toHaveLength(3);
  });

  it("enforces group writer permissions locally for edit and delete", async () => {
    const { sqlite, expenses, expense } = await fixture();
    expect(canEditLedgerExpense("group_member", false)).toBe(true);
    expect(canEditLedgerExpense("owner", true)).toBe(false);
    sqlite
      .prepare("UPDATE ledger_actor_context SET role = 'guest' WHERE user_id = ?")
      .run(userId);
    await expect(
      expenses.updateExpense(expense.id, command("edited"), "edit"),
    ).rejects.toThrow("write access");
    await expect(expenses.tombstoneExpense(expense.id, "delete")).rejects.toThrow(
      "write access",
    );
    expect((await expenses.getExpense(expense.id))?.status).toBe("ACCEPTED");
  });

  it("protects finalized references before local edit/delete", async () => {
    const { api, expenses, expense } = await fixture();
    const originalRead = api.getFirstAsync;
    api.getFirstAsync = async (sql, ...args) =>
      sql.includes("FROM ledger_settlement_inputs input")
        ? ({ found: 1 } as never)
        : originalRead(sql, ...args);
    await expect(
      expenses.updateExpense(expense.id, command("edited"), "edit"),
    ).rejects.toThrow("read-only");
    await expect(expenses.tombstoneExpense(expense.id, "delete")).rejects.toThrow(
      "read-only",
    );
    expect((await expenses.getExpense(expense.id))?.title).toBe("original");
  });
});
