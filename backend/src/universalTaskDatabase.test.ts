import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { migrations } from "../../src/data/db/migrations";
import {
  initializeUniversalTaskDatabase,
  universalTaskDatabase,
} from "./universalTaskBootstrap";

it("serializes shared Backend SQLite callers and retains committed state after reopening", async () => {
  const root = await mkdtemp(join(tmpdir(), "otr-universal-db-"));
  let sql = new DatabaseSync(join(root, "task.sqlite"));
  try {
    sql.exec(
      "CREATE TABLE fixture_counter(value INTEGER NOT NULL);INSERT INTO fixture_counter VALUES(0)",
    );
    const first = universalTaskDatabase(sql),
      second = universalTaskDatabase(sql);
    expect(first).toBe(second);
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        (i % 2 ? first : second).withTransactionAsync(async () => {
          const row = await first.getFirstAsync<{ value: number }>(
            "SELECT value FROM fixture_counter",
          );
          await Promise.resolve();
          await first.runAsync("UPDATE fixture_counter SET value=?", row!.value + 1);
        }),
      ),
    );
    sql.close();
    sql = new DatabaseSync(join(root, "task.sqlite"));
    expect(
      await universalTaskDatabase(sql).getFirstAsync("SELECT value FROM fixture_counter"),
    ).toEqual({ value: 12 });
  } finally {
    sql.close();
    await rm(root, { recursive: true, force: true });
  }
});
it("rolls back failed Task transactions before another caller can commit", async () => {
  const sql = new DatabaseSync(":memory:");
  try {
    sql.exec("CREATE TABLE fixture_values(value TEXT)");
    const db = universalTaskDatabase(sql);
    await expect(
      db.withTransactionAsync(async () => {
        await db.runAsync("INSERT INTO fixture_values VALUES('discard')");
        throw Error("fixture failure");
      }),
    ).rejects.toThrow("fixture failure");
    await db.withTransactionAsync(() =>
      db.runAsync("INSERT INTO fixture_values VALUES('retained')").then(() => {}),
    );
    expect(await db.getAllAsync("SELECT value FROM fixture_values")).toEqual([
      { value: "retained" },
    ]);
  } finally {
    sql.close();
  }
});

it("keeps Backend Task schema74 independent of a later Native-only migration", () => {
  const db = new DatabaseSync(":memory:");
  migrations.push({
    id: migrations.at(-1)!.id + 1,
    name: "native_photo_test",
    sql: "CREATE TABLE fixture_native_photo(id TEXT);",
  });
  try {
    initializeUniversalTaskDatabase(db);
    expect(db.prepare("PRAGMA user_version").get()).toEqual({ user_version: 74 });
    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE name='fixture_native_photo'")
        .get(),
    ).toBeUndefined();
    db.exec("PRAGMA user_version=75");
    expect(() => initializeUniversalTaskDatabase(db)).toThrow(
      "UNIVERSAL_TASK_DATABASE_VERSION",
    );
  } finally {
    migrations.pop();
    db.close();
  }
});
