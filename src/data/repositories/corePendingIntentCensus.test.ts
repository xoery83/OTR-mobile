import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { migrations } from "../db/migrations";
import { readCorePendingIntentCensus } from "./corePendingIntentCensus";

const connections: DatabaseSync[] = [];
afterEach(() => {
  for (const sql of connections.splice(0)) sql.close();
});
function fixture(initialize = true) {
  const sql = new DatabaseSync(":memory:");
  connections.push(sql);
  if (initialize) for (const migration of migrations) sql.exec(migration.sql);
  const getAllAsync = vi.fn(
    async <T>(query: string, ...params: unknown[]) =>
      sql.prepare(query).all(...(params as never[])) as T[],
  );
  const insert = (
    account: string,
    trip: string,
    state: string,
    revision: number | null,
  ) => {
    // Deliberately no corresponding Queue, scope, Item or receipt rows.
    sql
      .prepare(
        `INSERT INTO trip_core_pending_intents
      (account_id,trip_id,operation_id,intent_version,canonical_intent_text,
       intent_sha256,base_vector,queue_operation_id,reconciled_revision,state,created_at)
      VALUES(?,?,?,2,?,?,?,?,?,?,?)`,
      )
      .run(
        account,
        trip,
        randomUUID(),
        '{"private":"not an interpretable command"}',
        "private-intent-hash",
        "[]",
        randomUUID(),
        revision,
        state,
        "2026-11-05T00:00:00Z",
      );
  };
  return { sql, database: { getAllAsync }, insert };
}

it("observes empty initialized SQLite without opening, migrating or mutating it", async () => {
  const f = fixture();
  f.sql.exec("PRAGMA query_only=ON");
  const before = f.sql.prepare("SELECT total_changes() AS count").get();
  expect(await readCorePendingIntentCensus(f.database)).toEqual({
    coverage: "ALL_LOCAL_ACCOUNT_NAMESPACES",
    total: 0,
    groups: [],
  });
  expect(f.sql.prepare("SELECT total_changes() AS count").get()).toEqual(before);
  expect(f.database.getAllAsync).toHaveBeenCalledOnce();
});

it("counts every state and revision without hiding orphan or unresolved intents", async () => {
  const f = fixture(),
    account = randomUUID(),
    trip = randomUUID();
  const states = [
    "PENDING",
    "IN_FLIGHT",
    "APPLIED",
    "CONFLICT",
    "REVIEW",
    "BLOCKED",
  ] as const;
  for (const state of states) {
    f.insert(account, trip, state, null);
    f.insert(account, trip, state, 0);
    f.insert(account, trip, state, 7);
  }
  f.insert(account, trip, "IN_FLIGHT", null); // Outcome may be UNKNOWN; no result inference.
  f.insert(account, trip, "APPLIED", null); // Applied is not the same as reconciled.
  f.sql.exec("PRAGMA query_only=ON");
  const before = f.sql.prepare("SELECT total_changes() AS count").get();
  const result = await readCorePendingIntentCensus(f.database);
  expect(result.total).toBe(20);
  expect(result.groups).toHaveLength(18);
  for (const state of states)
    for (const revision of [null, 0, 7]) {
      expect(result.groups).toContainEqual({
        state,
        reconciledRevision: revision,
        count: revision === null && ["IN_FLIGHT", "APPLIED"].includes(state) ? 2 : 1,
      });
    }
  expect(f.sql.prepare("SELECT total_changes() AS count").get()).toEqual(before);
  expect(Object.keys(result).sort()).toEqual(["coverage", "groups", "total"]);
  for (const group of result.groups)
    expect(Object.keys(group).sort()).toEqual(["count", "reconciledRevision", "state"]);
  const [query, ...params] = f.database.getAllAsync.mock.calls[0];
  expect(query).not.toMatch(
    /account_id|canonical_intent_text|payload|receipt|operation_id|trip_id|SELECT \*/i,
  );
  expect(params).toEqual([]);
});

it("counts all local Account namespaces and Trips without a logged-in Account", async () => {
  const f = fixture(),
    a = randomUUID(),
    b = randomUUID();
  f.insert(a, randomUUID(), "BLOCKED", null);
  f.insert(a, randomUUID(), "BLOCKED", null);
  f.insert(b, randomUUID(), "PENDING", null);
  const otherDatabase = fixture();
  otherDatabase.insert(randomUUID(), randomUUID(), "REVIEW", null);
  // No Account/session getter exists: pre-OTP callers pass only their held connection.
  expect(await readCorePendingIntentCensus(f.database)).toEqual({
    coverage: "ALL_LOCAL_ACCOUNT_NAMESPACES",
    total: 3,
    groups: [
      { state: "BLOCKED", reconciledRevision: null, count: 2 },
      { state: "PENDING", reconciledRevision: null, count: 1 },
    ],
  });
  expect(await readCorePendingIntentCensus(otherDatabase.database)).toEqual({
    coverage: "ALL_LOCAL_ACCOUNT_NAMESPACES",
    total: 1,
    groups: [{ state: "REVIEW", reconciledRevision: null, count: 1 }],
  });
});

it("does not convert missing initialization or a read failure into an empty census", async () => {
  const f = fixture(false);
  await expect(readCorePendingIntentCensus(f.database)).rejects.toThrow(/no such table/);
  expect(
    f.sql.prepare("SELECT name FROM sqlite_master WHERE type='table'").all(),
  ).toEqual([]);
  f.sql.close();
  connections.splice(connections.indexOf(f.sql), 1);
  await expect(readCorePendingIntentCensus(f.database)).rejects.toThrow();
});

it("rejects unsafe group counts and total overflow instead of returning zero", async () => {
  const f = fixture();
  for (const count of [-1, 0, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    f.database.getAllAsync.mockResolvedValueOnce([
      { state: "PENDING", reconciled_revision: null, count },
    ]);
    await expect(readCorePendingIntentCensus(f.database)).rejects.toThrow(
      "CORE_INTENT_CENSUS_INVALID_COUNT",
    );
  }
  f.database.getAllAsync.mockResolvedValueOnce([
    { state: "PENDING", reconciled_revision: null, count: Number.MAX_SAFE_INTEGER },
    { state: "REVIEW", reconciled_revision: null, count: 1 },
  ]);
  await expect(readCorePendingIntentCensus(f.database)).rejects.toThrow(
    "CORE_INTENT_CENSUS_INVALID_COUNT",
  );
});
