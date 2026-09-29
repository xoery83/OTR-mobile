import { DatabaseSync } from "node:sqlite";
import { performance } from "node:perf_hooks";
import { expect, it } from "vitest";
import { migrations } from "@/data/db/migrations";
import {
  createLedgerExpenseRepository,
  type LedgerExpenseDatabase,
} from "./ledgerExpenseRepository";

it("hydrates 2001 Expenses with five scoped reads, preserving all child data and order", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    for (const migration of migrations) sqlite.exec(migration.sql);
    sqlite.exec(`INSERT INTO ledger_actor_context
      (user_id, journey_id, member_id, role, capabilities_json, updated_at)
      VALUES ('user', 'journey', 'a', 'owner', '{}', '2026-09-29');`);
    let reads = 0;
    const database: LedgerExpenseDatabase = {
      async withTransactionAsync(task) {
        await task();
      },
      async runAsync(sql: string, ...params: unknown[]) {
        return sqlite.prepare(sql).run(...(params as never[])) as never;
      },
      async getAllAsync<T>(sql: string, ...params: unknown[]) {
        reads++;
        return sqlite.prepare(sql).all(...(params as never[])) as T[];
      },
      async getFirstAsync<T>(sql: string, ...params: unknown[]) {
        reads++;
        return (sqlite.prepare(sql).get(...(params as never[])) as T | undefined) ?? null;
      },
    };
    const repository = createLedgerExpenseRepository(database, async () => "user");
    const source = await repository.createExpense({
      journeyId: "journey",
      creatorMemberId: "a",
      payerMemberId: "a",
      title: "Dinner",
      category: "food",
      occurredAt: "2026-09-29",
      economicDate: "2026-09-29",
      original: { minor: 100, currency: "NZD", scale: 2 },
      participants: ["b", "a"].map((memberId) => ({
        memberId,
        displayNameSnapshot: memberId,
        householdIdSnapshot: null,
      })),
      splits: ["b", "a"].map((memberId) => ({
        memberId,
        method: "EQUAL_PERSON" as const,
        originalMinor: 50,
        settlementMinor: 50,
        weightUnits: null,
        percentageUnits: null,
        roundingAdjustmentMinor: 0,
      })),
      valuation: {
        id: "valuation",
        policy: "SAME_CURRENCY",
        original: { minor: 100, currency: "NZD", scale: 2 },
        settlement: { minor: 100, currency: "NZD", scale: 2 },
        rateSnapshotId: null,
        paymentRecordId: null,
        reason: null,
      },
      status: "ACCEPTED",
    });
    await repository.addPaymentRecord(source.id, {
      instrumentLabel: "Card",
      authorization: null,
      posted: { minor: 100, currency: "NZD", scale: 2 },
      postedAt: "2026-09-29",
      fee: null,
      supersedesPaymentRecordId: null,
    });
    const original = await repository.getExpense(source.id);
    sqlite.exec("BEGIN");
    for (const table of [
      "ledger_expenses",
      "ledger_expense_participants",
      "ledger_expense_splits",
      "ledger_valuation_snapshots",
      "ledger_payment_records",
    ]) {
      const columns = (
        sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
      ).map((row) => row.name);
      const select = columns
        .map((column) =>
          column === "id"
            ? "id || '-' || ?"
            : column === "expense_id"
              ? "expense_id || '-' || ?"
              : column,
        )
        .join(",");
      const statement =
        sqlite.prepare(`INSERT INTO ${table} SELECT ${select} FROM ${table}
        WHERE ${table === "ledger_expenses" ? "id" : "expense_id"} = ?`);
      const replacements = columns.filter(
        (column) => column === "id" || column === "expense_id",
      ).length;
      for (let index = 0; index < 2000; index++)
        statement.run(...Array(replacements).fill(String(index)), source.id);
    }
    sqlite.exec("COMMIT");
    reads = 0;
    expect(await repository.listExpensesForJourney("journey")).toHaveLength(2001);
    expect(reads).toBe(5);
    // Hidden local ownership and deleted rows must not leak through batched children.
    sqlite
      .prepare("UPDATE ledger_expenses SET local_owner_user_id='other' WHERE id=?")
      .run(`${source.id}-1999`);
    sqlite
      .prepare("UPDATE ledger_expenses SET deleted_at='2026-09-29' WHERE id=?")
      .run(`${source.id}-1998`);
    reads = 0;
    const start = performance.now();
    const rows = await repository.listExpensesForJourney("journey");
    const elapsedMs = performance.now() - start;
    expect(reads).toBe(5);
    expect(rows).toHaveLength(1999);
    expect(rows.find((row) => row.id === source.id)).toEqual(original);
    const clone = rows.find((row) => row.id === `${source.id}-0`)!;
    expect(clone.participants.map((row) => row.memberId)).toEqual(["b", "a"]);
    expect(clone.splits.map((row) => row.memberId)).toEqual(["a", "b"]);
    expect(clone.valuation?.settlement.minor).toBe(100);
    expect(clone.paymentRecords[0]?.posted?.minor).toBe(100);
    expect(rows.some((row) => row.id === `${source.id}-1999`)).toBe(false);
    expect(await repository.listExpensesForJourney("journey", true)).toHaveLength(2000);
    reads = 0;
    expect(await repository.listExpensesForJourney("outside-journey")).toEqual([]);
    expect(reads).toBe(1);
    console.info(
      JSON.stringify({
        expenseBatchRead: { expenses: rows.length, reads: 5, elapsedMs },
      }),
    );
  } finally {
    sqlite.close();
  }
});
