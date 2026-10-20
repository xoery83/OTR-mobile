import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { migrations } from "../migrations";
import { runMigrations } from "../migrationRunner";
import { localTripDestinationsMigration as migration } from "./localTripDestinations";

function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(
    "PRAGMA foreign_keys=ON; CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL)",
  );
  for (const m of migrations.filter((m) => m.id < 71)) {
    sql.exec(m.sql);
    sql
      .prepare("INSERT INTO schema_migrations VALUES(?,?,?)")
      .run(m.id, m.name, "2026-10-21T01:00:00Z");
  }
  let fail = false;
  const db = {
    async execAsync(q: string) {
      sql.exec(q);
    },
    async getFirstAsync<T>(q: string, ...args: unknown[]) {
      return (sql.prepare(q).get(...(args as never[])) ?? null) as T | null;
    },
    async runAsync(q: string, ...args: unknown[]) {
      if (fail && args[0] === 71) throw new Error("MARKER_FAIL");
      return sql.prepare(q).run(...(args as never[]));
    },
    async withTransactionAsync(work: () => Promise<void>) {
      sql.exec("BEGIN");
      try {
        await work();
        sql.exec("COMMIT");
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  };
  const account = randomUUID(),
    trip = randomUUID(),
    asset = randomUUID(),
    stamp = "2026-10-21T01:00:00Z";
  sql
    .prepare(
      "INSERT INTO local_trip_containers(account_id,id,create_operation_id,name,destination,created_at,updated_at) VALUES(?,?,?,'Existing','Legacy location',?,?)",
    )
    .run(account, trip, randomUUID(), stamp, stamp);
  sql
    .prepare(
      "INSERT INTO local_trip_photos(account_id,trip_id,asset_id,mime_type,size_bytes,sha256,local_uri,created_at) VALUES(?,?,?,'image/jpeg',12,?,'file:///retained/photo.jpg',?)",
    )
    .run(account, trip, asset, "a".repeat(64), stamp);
  return {
    sql,
    db,
    account,
    trip,
    stamp,
    fail(value: boolean) {
      fail = value;
    },
  };
}
it("71 is unique and executes approved byte-exact DDL", () => {
  expect(migration.id).toBe(71);
  expect(migrations.filter((x) => x.id === 71)).toHaveLength(1);
  expect(createHash("sha256").update(migration.sql).digest("hex")).toBe(
    "fd503ea7e3d83cd28d2bbffc5e14a62025719a1ca41ebab3b0a42e0899bc18df",
  );
  expect(Math.max(...migrations.filter((x) => x.id !== 71).map((x) => x.id))).toBe(70);
});
it("70 to71 and restart preserve scalar, Journal, cover preferences and original photos", async () => {
  const f = fixture();
  try {
    const tables = [
      "local_trip_containers",
      "local_trip_photos",
      "account_trip_cover_preferences",
      "local_core_authority_commits",
      "local_core_authority_materials",
      "local_core_authority_slots",
      "local_core_review_decisions",
    ];
    const available = tables.filter((t) =>
      f.sql.prepare("SELECT name FROM sqlite_master WHERE name=?").get(t),
    );
    const before = available.map((t) => f.sql.prepare(`SELECT * FROM ${t}`).all());
    await runMigrations(f.db);
    await runMigrations(f.db);
    expect(available.map((t) => f.sql.prepare(`SELECT * FROM ${t}`).all())).toEqual(
      before,
    );
    expect(
      f.sql.prepare("SELECT count(*) n FROM schema_migrations WHERE id=71").get()!.n,
    ).toBe(1);
    expect(f.sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    f.sql.close();
  }
});
it("failed migration marker rolls back only new table and keeps prior data", async () => {
  const f = fixture();
  try {
    const before = f.sql.prepare("SELECT * FROM local_trip_photos").all();
    f.fail(true);
    await expect(runMigrations(f.db)).rejects.toThrow("MARKER_FAIL");
    expect(
      f.sql
        .prepare("SELECT name FROM sqlite_master WHERE name='local_trip_destinations'")
        .get(),
    ).toBeUndefined();
    expect(f.sql.prepare("SELECT * FROM local_trip_photos").all()).toEqual(before);
    f.fail(false);
    await runMigrations(f.db);
  } finally {
    f.sql.close();
  }
});
it("SQL rejects NULL Apple provider, wrong source facts, duplicate claims, max21 and cross-account FK", async () => {
  const f = fixture();
  try {
    await runMigrations(f.db);
    const insert = (
      ordinal: number,
      source = "MANUAL",
      claim: string | null = "tokyo",
      provider: string | null = null,
      id: string | null = null,
      account = f.account,
    ) =>
      f.sql
        .prepare("INSERT INTO local_trip_destinations VALUES(?,?,?,?,?,?,?,?,?,?,?)")
        .run(
          account,
          f.trip,
          randomUUID(),
          ordinal,
          source,
          "Tokyo",
          claim,
          provider,
          id,
          f.stamp,
          f.stamp,
        );
    expect(() => insert(0, "APPLE_PLACE_ID", null, null, "real-place")).toThrow();
    expect(() => insert(0, "MANUAL", "tokyo", "apple", "real-place")).toThrow();
    expect(() => insert(20)).toThrow();
    expect(() => insert(0, "MANUAL", "tokyo", null, null, randomUUID())).toThrow();
    insert(0);
    expect(() => insert(1)).toThrow();
    insert(1, "APPLE_PLACE_ID", null, "apple", "real-place");
    expect(() => insert(2, "APPLE_PLACE_ID", null, "apple", "real-place")).toThrow();
    expect(() =>
      f.sql
        .prepare("UPDATE local_trip_destinations SET display_label=?")
        .run("x".repeat(257)),
    ).toThrow();
    f.sql
      .prepare("DELETE FROM local_trip_containers WHERE account_id=? AND id=?")
      .run(f.account, f.trip);
    expect(f.sql.prepare("SELECT count(*) n FROM local_trip_destinations").get()!.n).toBe(
      0,
    );
  } finally {
    f.sql.close();
  }
});
