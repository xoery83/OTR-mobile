import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { migrations } from "../migrations";
import { runMigrations } from "../migrationRunner";
import { personalTripCoverPreferencesMigration } from "./personalTripCoverPreferences";

const stamp = "2026-10-20T01:00:00Z";
const columns =
  "account_id,trip_id,asset_id,mime_type,size_bytes,sha256,local_uri,created_at";
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "otr-cover70-")),
    path = join(dir, "db.sqlite");
  let sql = new DatabaseSync(path);
  sql.exec("PRAGMA foreign_keys=ON");
  sql.exec(
    "CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL)",
  );
  for (const migration of migrations.filter((m) => m.id < 70)) {
    sql.exec(migration.sql);
    sql
      .prepare("INSERT INTO schema_migrations VALUES(?,?,?)")
      .run(migration.id, migration.name, stamp);
  }
  let fault: "copy" | "marker" | null = null;
  const database = {
    async execAsync(query: string) {
      if (fault === "copy" && query.includes("local_trip_photos_cover_parent_next")) {
        fault = null;
        query = query.replace(
          " FROM local_trip_photos;",
          " FROM local_trip_photos WHERE 0;",
        );
      }
      sql.exec(query);
    },
    async getFirstAsync<T>(query: string, ...args: unknown[]) {
      return (sql.prepare(query).get(...(args as never[])) ?? null) as T | null;
    },
    async runAsync(query: string, ...args: unknown[]) {
      if (fault === "marker" && args[0] === 70) {
        fault = null;
        throw new Error("MARKER_FAULT");
      }
      return sql.prepare(query).run(...(args as never[]));
    },
    async withTransactionAsync(work: () => Promise<void>) {
      sql.exec("BEGIN");
      try {
        await work();
        sql.exec("COMMIT");
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return {
    get sql() {
      return sql;
    },
    database,
    fault(value: typeof fault) {
      fault = value;
    },
    reopen() {
      sql.close();
      sql = new DatabaseSync(path);
      sql.exec("PRAGMA foreign_keys=ON");
    },
    close() {
      sql.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
function local(
  sql: DatabaseSync,
  account = randomUUID(),
  raw: string | null = null,
  trip = randomUUID(),
) {
  sql
    .prepare(
      `INSERT INTO local_trip_containers(account_id,id,create_operation_id,name,created_at,updated_at,selected_cover_asset_id)
   VALUES(?,?,?,'Trip',?,?,?)`,
    )
    .run(account, trip, randomUUID(), stamp, stamp, raw);
  return { account, trip };
}
function photo(sql: DatabaseSync, owner: ReturnType<typeof local>) {
  sql
    .prepare(
      `INSERT INTO local_trip_photos(${columns}) VALUES(?,?,?,'image/jpeg',12,?,'file:///owned/image.jpg',?)`,
    )
    .run(owner.account, owner.trip, randomUUID(), "a".repeat(64), stamp);
}
const photoRows = (sql: DatabaseSync) =>
  sql
    .prepare(
      `SELECT ${columns} FROM local_trip_photos ORDER BY account_id,trip_id,asset_id`,
    )
    .all();

it("preserves every photo field/raw choice/history with FK ON, cold reopen and replay", async () => {
  const f = fixture();
  try {
    for (const raw of [null, "city", `photo-${randomUUID()}`, "future-cover-v9"]) {
      const owner = local(f.sql, randomUUID(), raw);
      photo(f.sql, owner);
    }
    const before = photoRows(f.sql),
      roots = f.sql
        .prepare(
          "SELECT account_id,id,selected_cover_asset_id FROM local_trip_containers ORDER BY account_id,id",
        )
        .all();
    const history = f.sql.prepare("SELECT * FROM schema_migrations ORDER BY id").all();
    await runMigrations(f.database);
    expect(photoRows(f.sql)).toEqual(before);
    expect(
      f.sql
        .prepare(
          "SELECT account_id,trip_id AS id,selected_cover_asset_id FROM account_trip_cover_preferences ORDER BY account_id,trip_id",
        )
        .all(),
    ).toEqual(roots);
    expect(
      f.sql.prepare("SELECT * FROM schema_migrations WHERE id<70 ORDER BY id").all(),
    ).toEqual(history);
    expect(f.sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(f.sql.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
    f.reopen();
    await runMigrations(f.database);
    expect(photoRows(f.sql)).toEqual(before);
    expect(
      f.sql.prepare("SELECT count(*) AS n FROM schema_migrations WHERE id=70").get(),
    ).toEqual({ n: 1 });
    expect(
      f.sql
        .prepare(
          "SELECT name FROM sqlite_temp_master WHERE name='personal_cover70_copy_guard'",
        )
        .get(),
    ).toBeUndefined();
  } finally {
    f.close();
  }
});

it("rolls back a denied copy and a failed migration receipt, then retries unchanged data", async () => {
  for (const fault of ["copy", "marker"] as const) {
    const f = fixture();
    try {
      photo(f.sql, local(f.sql));
      const before = photoRows(f.sql);
      f.fault(fault);
      await expect(runMigrations(f.database)).rejects.toThrow();
      expect(photoRows(f.sql)).toEqual(before);
      expect(
        f.sql
          .prepare(
            "SELECT name FROM sqlite_master WHERE name='account_trip_cover_preferences'",
          )
          .get(),
      ).toBeUndefined();
      expect(
        f.sql.prepare("SELECT id FROM schema_migrations WHERE id=70").get(),
      ).toBeUndefined();
      expect(
        f.sql.prepare("PRAGMA foreign_key_list(local_trip_photos)").all(),
      ).toMatchObject([
        { table: "local_trip_containers" },
        { table: "local_trip_containers" },
      ]);
      await runMigrations(f.database);
      expect(photoRows(f.sql)).toEqual(before);
      expect(f.sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      f.close();
    }
  }
});

it("preserves old orphan photos as inaccessible roots rather than dropping their identity", async () => {
  const f = fixture();
  try {
    f.sql.exec("PRAGMA foreign_keys=OFF");
    const owner = { account: randomUUID(), trip: randomUUID() };
    photo(f.sql, owner);
    f.sql.exec("PRAGMA foreign_keys=ON");
    const before = photoRows(f.sql);
    await runMigrations(f.database);
    expect(photoRows(f.sql)).toEqual(before);
    expect(
      f.sql
        .prepare(
          "SELECT selected_cover_asset_id,selection_revision FROM account_trip_cover_preferences",
        )
        .get(),
    ).toEqual({ selected_cover_asset_id: null, selection_revision: 1 });
    expect(
      f.sql.prepare("SELECT count(*) AS n FROM local_trip_containers").get(),
    ).toEqual({ n: 0 });
    expect(f.sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    f.close();
  }
});

it("legacy updates and retained-root CREATE reconcile exactly once with recursive triggers OFF/ON", async () => {
  for (const recursive of [0, 1]) {
    const f = fixture();
    try {
      await runMigrations(f.database);
      f.sql.exec(`PRAGMA recursive_triggers=${recursive}`);
      const account = randomUUID(),
        trip = randomUUID();
      f.sql
        .prepare("INSERT INTO account_trip_cover_preferences VALUES(?,?,?,7,?)")
        .run(account, trip, "future-cover-v9", stamp);
      const owner = local(f.sql, account, null, trip);
      photo(f.sql, owner);
      expect(
        f.sql.prepare("SELECT selected_cover_asset_id FROM local_trip_containers").get(),
      ).toEqual({ selected_cover_asset_id: "future-cover-v9" });
      const root = () =>
        f.sql
          .prepare(
            "SELECT selected_cover_asset_id,selection_revision FROM account_trip_cover_preferences",
          )
          .get();
      expect(root()).toEqual({
        selected_cover_asset_id: "future-cover-v9",
        selection_revision: 7,
      });
      f.sql
        .prepare("UPDATE local_trip_containers SET selected_cover_asset_id=NULL")
        .run();
      expect(root()).toEqual({ selected_cover_asset_id: null, selection_revision: 8 });
      f.sql
        .prepare("UPDATE local_trip_containers SET selected_cover_asset_id=NULL")
        .run();
      expect(root()).toEqual({ selected_cover_asset_id: null, selection_revision: 8 });
      f.sql.exec("BEGIN");
      f.sql
        .prepare("UPDATE local_trip_containers SET selected_cover_asset_id='city'")
        .run();
      f.sql.exec("ROLLBACK");
      expect(root()).toEqual({ selected_cover_asset_id: null, selection_revision: 8 });
      // New root-first write + compatibility column does not increment twice.
      f.sql
        .prepare(
          "UPDATE account_trip_cover_preferences SET selected_cover_asset_id='city',selection_revision=9",
        )
        .run();
      f.sql
        .prepare("UPDATE local_trip_containers SET selected_cover_asset_id='city'")
        .run();
      expect(root()).toEqual({ selected_cover_asset_id: "city", selection_revision: 9 });
      const before = photoRows(f.sql);
      f.sql.prepare("DELETE FROM local_trip_containers").run();
      expect(photoRows(f.sql)).toEqual(before);
      expect(root()).toEqual({ selected_cover_asset_id: "city", selection_revision: 9 });
      expect(f.sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      f.close();
    }
  }
});

it("does not skip a later missing migration ID below70 and preserves70 private rows", async () => {
  const f = fixture();
  const fixture69 = {
    id: 69,
    name: "test_future_missing_id_only",
    sql: "CREATE TABLE test_future69_marker(id TEXT PRIMARY KEY)",
  };
  try {
    await runMigrations(f.database);
    f.sql
      .prepare("INSERT INTO account_trip_cover_preferences VALUES(?,?,NULL,1,?)")
      .run(randomUUID(), randomUUID(), stamp);
    migrations.splice(
      migrations.indexOf(personalTripCoverPreferencesMigration),
      0,
      fixture69,
    );
    await runMigrations(f.database);
    expect(
      f.sql
        .prepare("SELECT name FROM sqlite_master WHERE name='test_future69_marker'")
        .get(),
    ).toBeTruthy();
    expect(
      f.sql.prepare("SELECT count(*) AS n FROM account_trip_cover_preferences").get(),
    ).toEqual({ n: 1 });
    // This proves per-ID runner sequencing only, not actual LocalCore69 compatibility.
  } finally {
    const index = migrations.indexOf(fixture69);
    if (index >= 0) migrations.splice(index, 1);
    f.close();
  }
});

it("new local initialization never replaces retained AUTO/static/photo/unknown choices", async () => {
  const f = fixture();
  try {
    await runMigrations(f.database);
    for (const raw of [null, "city", `photo-${randomUUID()}`, "future-cover-v9"]) {
      const account = randomUUID(),
        trip = randomUUID();
      f.sql
        .prepare("INSERT INTO account_trip_cover_preferences VALUES(?,?,?,7,?)")
        .run(account, trip, raw, stamp);
      local(f.sql, account, raw === null ? "city" : null, trip);
      expect(
        f.sql
          .prepare(
            "SELECT selected_cover_asset_id FROM local_trip_containers WHERE account_id=? AND id=?",
          )
          .get(account, trip),
      ).toEqual({ selected_cover_asset_id: raw });
      expect(
        f.sql
          .prepare(
            "SELECT selected_cover_asset_id,selection_revision FROM account_trip_cover_preferences WHERE account_id=? AND trip_id=?",
          )
          .get(account, trip),
      ).toEqual({ selected_cover_asset_id: raw, selection_revision: 7 });
    }
  } finally {
    f.close();
  }
});
