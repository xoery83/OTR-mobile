import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { tripMetadataConfirmationsMigration } from "./tripMetadataConfirmations";
import { serverParentMetadataConfirmationsSql } from "./serverParentMetadataConfirmations.candidate";

it("preserves confirmations and local deletion while allowing account-scoped server-parent proof", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      "PRAGMA foreign_keys=ON; CREATE TABLE local_trip_containers(account_id TEXT,id TEXT,PRIMARY KEY(account_id,id)); INSERT INTO local_trip_containers VALUES('A','local'),('B','local');",
    );
    db.exec(tripMetadataConfirmationsMigration.sql);
    const insert =
      "INSERT INTO local_trip_metadata_confirmations VALUES(?,?,?,'SNAPSHOT',1,'{}','{}')";
    db.prepare(insert).run("A", "local", "old-a");
    db.prepare(insert).run("B", "local", "old-b");
    const before = db
      .prepare("SELECT * FROM local_trip_metadata_confirmations ORDER BY account_id")
      .all();
    db.exec("BEGIN");
    db.exec(serverParentMetadataConfirmationsSql);
    db.exec("COMMIT");
    expect(
      db
        .prepare("SELECT * FROM local_trip_metadata_confirmations ORDER BY account_id")
        .all(),
    ).toEqual(before);
    db.prepare(insert).run("A", "server-only", "new-a");
    expect(() => db.prepare(insert).run("A", "server-only", "new-a")).toThrow();
    expect(() =>
      db.exec("UPDATE local_trip_containers SET id='changed' WHERE account_id='A'"),
    ).toThrow();
    expect(() =>
      db.exec("UPDATE local_trip_metadata_confirmations SET metadata_revision=-1"),
    ).toThrow();
    db.exec("DELETE FROM local_trip_containers WHERE account_id='A'");
    expect(
      db
        .prepare(
          "SELECT account_id,trip_id FROM local_trip_metadata_confirmations ORDER BY account_id",
        )
        .all(),
    ).toEqual([
      { account_id: "A", trip_id: "server-only" },
      { account_id: "B", trip_id: "local" },
    ]);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(
      db
        .prepare("PRAGMA index_list(local_trip_metadata_confirmations)")
        .all()
        .some((row) => row.name === "local_trip_metadata_confirmation_revision"),
    ).toBe(true);
  } finally {
    db.close();
  }
});
