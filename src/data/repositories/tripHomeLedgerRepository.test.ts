import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { migrations } from "@/data/db/migrations";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import { createTripHomeLedgerRepository } from "./tripHomeLedgerRepository";
import type { LedgerReportingDatabase } from "./ledgerReportingRepository";
vi.mock("@/data/auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("@/data/db/database", () => ({ readInitializedDatabase: vi.fn() }));
const connections: DatabaseSync[] = [];
afterEach(() => connections.splice(0).forEach((sqlite) => sqlite.close()));
function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  connections.push(sqlite);
  for (const migration of migrations) sqlite.exec(migration.sql);
  sqlite.exec(`
    INSERT INTO ledger_journeys (journey_id, title, settlement_currency, settlement_scale, valuation_policy, updated_at)
      VALUES ('trip', 'Trip', 'NZD', 2, 'REFERENCE_RATE', '2026-10-14');
    INSERT INTO ledger_members (id, journey_id, display_name, updated_at)
      VALUES ('mine', 'trip', 'Mine', '2026-10-14'), ('payer', 'trip', 'Payer', '2026-10-14');
    INSERT INTO ledger_actor_context (user_id, journey_id, member_id, capabilities_json, updated_at)
      VALUES ('actor', 'trip', 'mine', '{}', '2026-10-14');
  `);
  let user = "actor",
    changeDuringRead = false;
  const database: LedgerReportingDatabase = {
    async getAllAsync<T>(sql: string, ...args: unknown[]) {
      const rows = sqlite.prepare(sql).all(...(args as never[])) as T[];
      if (changeDuringRead) {
        changeDuringRead = false;
        advanceAccountGeneration();
      }
      return rows;
    },
    async getFirstAsync<T>(sql: string, ...args: unknown[]) {
      return (sqlite.prepare(sql).get(...(args as never[])) as T) ?? null;
    },
    async runAsync() {
      throw new Error("read-only adapter");
    },
    async withTransactionAsync(task) {
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
  const repository = createTripHomeLedgerRepository(database, async () => user);
  function expense(
    id: string,
    createdAt: string,
    status = "ACCEPTED",
    category = "food",
    owner: string | null = null,
    sync = "SYNCED",
  ) {
    sqlite
      .prepare(
        `INSERT INTO ledger_expenses
      (id, journey_id, payer_member_id, title, category, occurred_at, original_amount_minor, original_currency, original_scale,
      business_status, revision, sync_status, created_at, updated_at, local_owner_user_id, settlement_participation)
      VALUES (?, 'trip', 'payer', ?, ?, '2026-12-01', 1000, 'EUR', 2, ?, 1, ?, ?, '2027-01-01', ?, 'EXCLUDED')`,
      )
      .run(id, id, category, status, sync, createdAt, owner);
    sqlite
      .prepare(
        `INSERT INTO ledger_expense_splits (expense_id, member_id, split_method, original_amount_minor, settlement_amount_minor)
      VALUES (?, 'mine', 'MANUAL', 400, ?), (?, 'payer', 'MANUAL', 600, ?)`,
      )
      .run(
        id,
        status === "ACCEPTED" ? 800 : null,
        id,
        status === "ACCEPTED" ? 1200 : null,
      );
    if (status === "ACCEPTED")
      sqlite
        .prepare(
          `INSERT INTO ledger_valuation_snapshots
      (id, expense_id, expense_revision, policy, original_amount_minor, original_currency, original_scale,
      settlement_amount_minor, settlement_currency, settlement_scale, is_active, created_at)
      VALUES (?, ?, 1, 'REFERENCE_RATE', 1000, 'EUR', 2, 2000, 'NZD', 2, 1, '2026-10-14')`,
        )
        .run("value-" + id, id);
  }
  return {
    sqlite,
    repository,
    expense,
    setUser: (id: string) => {
      user = id;
    },
    interrupt: () => {
      changeDuringRead = true;
    },
  };
}
it("requires a cached exact actor Journey and member, never UUID alone or a personal summary", async () => {
  const f = fixture();
  expect(await f.repository.read("other-trip")).toBeNull();
  f.sqlite
    .exec(`INSERT INTO ledger_my_journey_summaries (user_id, journey_id, period_key, title, currency, scale, my_spend_minor, paid_minor, position_minor, unvalued_count, conflict_count, updated_at)
    VALUES ('other-actor', 'trip', 'ALL', 'Personal only', 'NZD', 2, 100, 200, 100, 0, 0, '2026-10-14')`);
  f.setUser("other-actor");
  expect(await f.repository.read("trip")).toBeNull();
  f.setUser("actor");
  f.sqlite.exec("UPDATE ledger_actor_context SET member_id = 'missing'");
  expect(await f.repository.read("trip")).toBeNull();
});
it("reuses true consumption shares, keeps excluded Spending and original currencies, and counts distinct canonical expenses", async () => {
  const f = fixture();
  f.expense("a", "2026-10-10");
  f.expense("b", "2026-10-11", "RATE_REQUIRED", "transport");
  f.expense(
    "private",
    "2026-10-14",
    "ACCEPTED",
    "private",
    "other-actor",
    "PENDING_CREATE",
  );
  const result = (await f.repository.read("trip"))!;
  expect(result.group.totalMinor).toBe(2000);
  expect(result.mine.totalMinor).toBe(800); // mine did not pay this expense.
  expect(result.expenseCount).toBe(2);
  expect(result.categories).toEqual([
    { category: "food", count: 1 },
    { category: "transport", count: 1 },
  ]);
  expect(result.group.unresolvedRateCount).toBe(1);
  expect(result.recent[0]).toMatchObject({
    id: "b",
    originalCurrency: "EUR",
    originalMinor: 1000,
  });
});
it("orders no more than three by actual creation, ignoring edits and event dates; missing timestamps stay omitted", async () => {
  const f = fixture();
  for (const [id, created] of [
    ["a", "2026-10-01"],
    ["b", "2026-10-04"],
    ["c", "2026-10-03"],
    ["d", "2026-10-02"],
    ["unknown", ""],
  ])
    f.expense(id, created);
  f.sqlite.exec(
    "UPDATE ledger_expenses SET updated_at = '2030-01-01', occurred_at = '2030-01-01' WHERE id = 'a'",
  );
  const result = (await f.repository.read("trip"))!;
  expect(result.recent.map((item) => item.id)).toEqual(["b", "c", "d"]);
  expect(result.expenseCount).toBe(5);
});
it("keeps all-incomplete totals distinguishable from a known zero and fences account ABA during a coherent read", async () => {
  const f = fixture();
  f.expense("rate", "2026-10-01", "RATE_REQUIRED");
  const result = (await f.repository.read("trip"))!;
  expect(result.group.expenseCount).toBe(0);
  expect(result.expenseCount).toBe(1);
  f.interrupt();
  await expect(f.repository.read("trip")).rejects.toThrow("Account changed");
});
