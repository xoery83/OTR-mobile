import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { migrations } from "@/data/db/migrations";
import { localCaptureInboxMigration } from "@/data/db/migrations/localCaptureInbox";
import { serializeDatabaseTransactions } from "@/data/db/databaseConnection";
import {
  beginAccountTransition,
  endAccountTransition,
} from "@/data/auth/accountRequestContext";
import { CAPTURE_LIMITS, type CaptureKind } from "@/domain/capture/localCapture";
import {
  createLocalCaptureInboxRepository,
  type LocalCaptureDatabase,
} from "./localCaptureInboxRepository";

const hash = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const connections: DatabaseSync[] = [];
const folders: string[] = [];
afterEach(() => {
  for (const db of connections.splice(0)) {
    try {
      db.close();
    } catch {}
  }
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function tempPath() {
  const folder = mkdtempSync(join(tmpdir(), "capture-test-"));
  folders.push(folder);
  return join(folder, "inbox.db");
}
function fixture(path = ":memory:", initialize = true, sha256 = hash) {
  const sql = new DatabaseSync(path);
  connections.push(sql);
  sql.exec("PRAGMA foreign_keys=ON");
  if (initialize) {
    // Composable migration seam: all actual registered prerequisites, then the
    // standalone body. No synthetic 47 and no global registration of 48.
    for (const migration of migrations.filter(({ id }) => id < 48))
      sql.exec(migration.sql);
    sql.exec(localCaptureInboxMigration.sql);
  }
  const db: LocalCaptureDatabase = serializeDatabaseTransactions({
    async getFirstAsync<T>(query: string, ...params: unknown[]) {
      return (sql.prepare(query).get(...(params as never[])) ?? null) as T | null;
    },
    async getAllAsync<T>(query: string, ...params: unknown[]) {
      return sql.prepare(query).all(...(params as never[])) as T[];
    },
    async runAsync(query: string, ...params: unknown[]) {
      return sql.prepare(query).run(...(params as never[])) as never;
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
  });
  let account = "a";
  let ids = 0;
  const prefix = randomUUID();
  const deps = {
    sha256,
    newId: () => `id-${prefix}-${++ids}`,
    now: () => "2026-10-05T00:00:00.000Z",
  };
  const getUser = async () => {
    if (!account) throw new Error("Signed out");
    return account;
  };
  const repo = createLocalCaptureInboxRepository(db, getUser, deps);
  const intake = (
    value = "abc",
    tripId: string | null = null,
    kind: CaptureKind = "FILE",
  ) =>
    repo.intake(
      {
        kind,
        tripId,
        originalFilename: "original",
        declaredContentType: "application/octet-stream",
      },
      { bytes: new TextEncoder().encode(value) },
    );
  function actor(user = "a", trip = "trip") {
    sql
      .prepare(
        `INSERT INTO ledger_actor_context
      (user_id,journey_id,role,capabilities_json,updated_at) VALUES (?,?,'group_member','{}',?)`,
      )
      .run(user, trip, deps.now());
  }
  const counts = () => ({
    captures: sql.prepare("SELECT COUNT(*) AS n FROM local_capture_inbox").get()!
      .n as number,
    payloads: sql.prepare("SELECT COUNT(*) AS n FROM local_capture_payloads").get()!
      .n as number,
    bytes: sql
      .prepare("SELECT COALESCE(SUM(byte_count),0) AS n FROM local_capture_payloads")
      .get()!.n as number,
  });
  async function switchTo(next: string) {
    const lease = await beginAccountTransition();
    account = next;
    endAccountTransition(lease);
  }
  return {
    sql,
    db,
    repo,
    deps,
    intake,
    actor,
    counts,
    switchTo,
    pendingSwitch: (next: string) =>
      beginAccountTransition().then((lease) => {
        account = next;
        endAccountTransition(lease);
      }),
  };
}
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function corrupt(f: ReturnType<typeof fixture>, statements: string) {
  f.sql.exec(`PRAGMA foreign_keys=OFF;
    DROP TRIGGER local_capture_identity_immutable;
    DROP TRIGGER local_capture_payload_immutable;
    DROP TRIGGER local_capture_payload_referenced;
    PRAGMA ignore_check_constraints=ON; ${statements}`);
}
function virtualTotals(
  f: ReturnType<typeof fixture>,
  totals: { accountBytes: number; deviceBytes: number; rows: number },
) {
  const get = f.db.getFirstAsync.bind(f.db);
  f.db.getFirstAsync = async <T>(q: string, ...p: unknown[]) =>
    q.includes("AS accountBytes") ? ({ ...totals } as T) : get<T>(q, ...(p as never[]));
}
function seedRows(f: ReturnType<typeof fixture>, payloadId: string, count: number) {
  const insert = f.sql.prepare(`INSERT INTO local_capture_inbox
    (account_id,id,payload_id,kind,created_at,state,revision) VALUES ('a',?,?,'FILE','2026-10-05T00:00:00.000Z','INBOX',1)`);
  for (let n = 0; n < count; n++) insert.run(`seed-${n}`, payloadId);
}
describe("local Capture Inbox", () => {
  it.each(["FILE", "IMAGE", "TEXT"] as const)(
    "durably intakes %s before returning success",
    async (kind) => {
      const f = fixture();
      const c = await f.intake("original\r\n旅", null, kind);
      expect(c).toMatchObject({
        kind,
        state: "INBOX",
        tripId: null,
        revision: 1,
        originalFilename: "original",
      });
      expect(f.counts()).toMatchObject({ captures: 1, payloads: 1 });
      const result = await f.repo.getForSourceHandoff(c.id);
      expect(result.capture).toEqual(c);
      expect(result.bytes).toEqual(new TextEncoder().encode("original\r\n旅"));
    },
  );
  it("captures context before reader/hash work and rejects signed-out intake", async () => {
    const f = fixture();
    await f.switchTo("");
    const read = vi.fn();
    await expect(
      f.repo.intake({ kind: "FILE" }, { reader: { read, close: async () => {} } }),
    ).rejects.toThrow("Signed out");
    expect(read).not.toHaveBeenCalled();
    expect(f.counts().captures).toBe(0);
  });
  it("creates distinct identities sharing one immutable exact payload", async () => {
    const f = fixture();
    const a = await f.intake();
    const b = await f.intake();
    expect(a.id).not.toBe(b.id);
    expect(a.payloadId).toBe(b.payloadId);
    expect(f.counts()).toEqual({ captures: 2, payloads: 1, bytes: 3 });
  });
  it("serializes two concurrent duplicates into one payload", async () => {
    const f = fixture();
    const [a, b] = await Promise.all([f.intake(), f.intake()]);
    expect(a.payloadId).toBe(b.payloadId);
    expect(a.id).not.toBe(b.id);
    expect(f.counts()).toEqual({ captures: 2, payloads: 1, bytes: 3 });
  });
  it("dedup shares bytes across kinds without changing original metadata", async () => {
    const f = fixture();
    const a = await f.intake("abc", null, "TEXT");
    const b = await f.repo.intake(
      { kind: "IMAGE", originalFilename: "different" },
      { bytes: new TextEncoder().encode("abc") },
    );
    expect(b.payloadId).toBe(a.payloadId);
    expect(b.originalFilename).toBe("different");
    expect((await f.repo.getForSourceHandoff(a.id)).capture.originalFilename).toBe(
      "original",
    );
  });
  it("rejects equal hash+size with different bytes under controlled hash collision seam", async () => {
    const f = fixture(":memory:", true, async () => "a".repeat(64));
    await f.intake("abc");
    const before = f.counts();
    await expect(f.intake("xyz")).rejects.toMatchObject({ code: "INTEGRITY" });
    expect(f.counts()).toEqual(before);
  });
  it("same bytes in another Account use a separate payload; foreign identity reads are hidden", async () => {
    const f = fixture();
    const a = await f.intake();
    await f.switchTo("b");
    expect(await f.repo.listInbox()).toEqual([]);
    await expect(f.repo.getForSourceHandoff(a.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(f.repo.assign(a.id, null, 1)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(f.repo.deleteCapture(a.id, 1)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const b = await f.intake();
    expect(b.accountId).toBe("b");
    expect(b.payloadId).not.toBe(a.payloadId);
    expect((await f.repo.listInbox()).map((c) => c.id)).toEqual([b.id]);
    await f.switchTo("a");
    expect((await f.repo.getForSourceHandoff(a.id)).capture).toEqual(a);
    expect(f.counts()).toEqual({ captures: 2, payloads: 2, bytes: 6 });
  });
  it("assigns/reassigns/unassigns only association and revision", async () => {
    const f = fixture();
    f.actor();
    f.actor("a", "other");
    const c = await f.intake("abc", "trip");
    expect(c.state).toBe("ASSIGNED");
    const assigned = await f.repo.assign(c.id, "other", 1);
    expect(assigned).toEqual({ ...c, tripId: "other", state: "ASSIGNED", revision: 2 });
    expect(await f.repo.assign(c.id, "other", 2)).toEqual(assigned);
    const inbox = await f.repo.assign(c.id, null, 2);
    expect(inbox).toEqual({ ...c, tripId: null, state: "INBOX", revision: 3 });
    expect(f.counts()).toEqual({ captures: 1, payloads: 1, bytes: 3 });
  });
  it("rejects absent/foreign Trip admission atomically", async () => {
    const f = fixture();
    f.actor("b", "trip");
    await expect(f.intake("abc", "trip")).rejects.toMatchObject({ code: "TRIP_ACCESS" });
    expect(f.counts()).toEqual({ captures: 0, payloads: 0, bytes: 0 });
    const c = await f.intake();
    await expect(f.repo.assign(c.id, "trip", 1)).rejects.toMatchObject({
      code: "TRIP_ACCESS",
    });
    expect((await f.repo.getForSourceHandoff(c.id)).capture).toEqual(c);
  });
  it("lost Trip admission preserves content/readability and blocks assigned mutations", async () => {
    const f = fixture();
    f.actor();
    const c = await f.intake("abc", "trip");
    f.sql.exec("DELETE FROM ledger_actor_context");
    expect((await f.repo.getForSourceHandoff(c.id)).capture).toEqual(c);
    await expect(f.repo.assign(c.id, null, 1)).rejects.toMatchObject({
      code: "TRIP_ACCESS",
    });
    await expect(f.repo.deleteCapture(c.id, 1)).rejects.toMatchObject({
      code: "TRIP_ACCESS",
    });
    expect(f.counts().bytes).toBe(3);
  });
  it("rejects stale revision for reassignment and deletion", async () => {
    const f = fixture();
    f.actor();
    const c = await f.intake();
    await f.repo.assign(c.id, "trip", 1);
    await expect(f.repo.assign(c.id, null, 1)).rejects.toMatchObject({
      code: "STALE_REVISION",
    });
    await expect(f.repo.deleteCapture(c.id, 1)).rejects.toMatchObject({
      code: "STALE_REVISION",
    });
    expect(f.counts().captures).toBe(1);
  });
  it("concurrent reassignment admits only one observed revision", async () => {
    const f = fixture();
    f.actor();
    f.actor("a", "other");
    const c = await f.intake();
    const results = await Promise.allSettled([
      f.repo.assign(c.id, "trip", 1),
      f.repo.assign(c.id, "other", 1),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await f.repo.getForSourceHandoff(c.id)).capture.revision).toBe(2);
  });
  it("deletes unique payload and preserves bytes until last duplicate reference is removed", async () => {
    const f = fixture();
    const a = await f.intake();
    const b = await f.intake();
    await f.repo.deleteCapture(a.id, 1);
    expect(f.counts()).toEqual({ captures: 1, payloads: 1, bytes: 3 });
    expect((await f.repo.getForSourceHandoff(b.id)).bytes).toEqual(
      new TextEncoder().encode("abc"),
    );
    await f.repo.deleteCapture(b.id, 1);
    expect(f.counts()).toEqual({ captures: 0, payloads: 0, bytes: 0 });
  });
  it.each(["delete-first", "intake-first"])(
    "serializes concurrent delete/duplicate reference: %s",
    async (order) => {
      const f = fixture();
      const a = await f.intake();
      const results =
        order === "delete-first"
          ? await Promise.all([f.repo.deleteCapture(a.id, 1), f.intake()])
          : await Promise.all([f.intake(), f.repo.deleteCapture(a.id, 1)]);
      const c = results.find((r) => r !== undefined)!;
      expect(f.counts()).toEqual({ captures: 1, payloads: 1, bytes: 3 });
      expect((await f.repo.getForSourceHandoff(c.id)).bytes).toEqual(
        new TextEncoder().encode("abc"),
      );
    },
  );
  it("rolls back payload on Capture insert failure and allows later intake", async () => {
    const f = fixture();
    f.sql.exec(`CREATE TRIGGER test_failure BEFORE INSERT ON local_capture_inbox
      BEGIN SELECT RAISE(ABORT, 'test_failure'); END`);
    await expect(f.intake()).rejects.toThrow("test_failure");
    expect(f.counts()).toEqual({ captures: 0, payloads: 0, bytes: 0 });
    f.sql.exec("DROP TRIGGER test_failure");
    await f.intake();
    expect(f.counts().captures).toBe(1);
  });
  it("acknowledges success only after commit", async () => {
    const f = fixture();
    const run = f.db.withTransactionAsync.bind(f.db);
    const committing = deferred();
    const finish = deferred();
    f.db.withTransactionAsync = (work) =>
      run(async () => {
        await work();
        committing.resolve();
        await finish.promise;
      });
    let acknowledged = false;
    const pending = f.intake().then((c) => {
      acknowledged = true;
      return c;
    });
    await committing.promise;
    expect(acknowledged).toBe(false);
    finish.resolve();
    await pending;
    expect(acknowledged).toBe(true);
  });
  it("transaction commit failure rolls back first payload and Capture", async () => {
    const f = fixture();
    f.db.withTransactionAsync = async (work) => {
      f.sql.exec("BEGIN");
      try {
        await work();
        throw new Error("commit failure");
      } finally {
        f.sql.exec("ROLLBACK");
      }
    };
    await expect(f.intake()).rejects.toThrow("commit failure");
    expect(f.counts()).toEqual({ captures: 0, payloads: 0, bytes: 0 });
  });
  it.each(["read", "hash"])("fences A→B→A during expensive %s", async (stage) => {
    const entered = deferred();
    const resume = deferred();
    const f = fixture(":memory:", true, async (bytes) => {
      if (stage === "hash") {
        entered.resolve();
        await resume.promise;
      }
      return hash(bytes);
    });
    let done = false;
    const input =
      stage === "read"
        ? {
            reader: {
              read: async () => {
                if (done) return null;
                done = true;
                entered.resolve();
                await resume.promise;
                return new Uint8Array([1]);
              },
              close: async () => {},
            },
          }
        : { bytes: new Uint8Array([1]) };
    const pending = f.repo.intake({ kind: "FILE" }, input);
    const rejected = expect(pending).rejects.toThrow("Account changed");
    await entered.promise;
    await f.switchTo("b");
    await f.switchTo("a");
    resume.resolve();
    await rejected;
    expect(f.counts()).toEqual({ captures: 0, payloads: 0, bytes: 0 });
  });
  it("fences A→B→A while waiting for serialized transaction", async () => {
    const f = fixture();
    const entered = deferred();
    const resume = deferred();
    const blocker = f.db.withTransactionAsync(async () => {
      entered.resolve();
      await resume.promise;
    });
    await entered.promise;
    const pending = f.intake();
    const rejected = expect(pending).rejects.toThrow("Account changed");
    // Queue transition before the intake acquires the Account gate.
    const switched = f.switchTo("b");
    await switched;
    await f.switchTo("a");
    resume.resolve();
    await blocker;
    await rejected;
    expect(f.counts().captures).toBe(0);
  });
  it.each(["intake", "assign", "delete"])(
    "pending Account transition before %s commit rolls back",
    async (method) => {
      const f = fixture();
      f.actor();
      const c = method === "intake" ? null : await f.intake();
      const before = f.counts();
      const run = f.db.runAsync.bind(f.db);
      let switched: Promise<void> | undefined;
      f.db.runAsync = async (q: string, ...p: unknown[]) => {
        const result = await run(q, ...(p as never[]));
        if (
          !switched &&
          ((method === "intake" && q.startsWith("INSERT INTO local_capture_inbox")) ||
            (method === "assign" && q.startsWith("UPDATE local_capture_inbox")) ||
            (method === "delete" && q.startsWith("DELETE FROM local_capture_inbox")))
        )
          switched = f.pendingSwitch("b");
        return result;
      };
      const pending =
        method === "intake"
          ? f.intake()
          : method === "assign"
            ? f.repo.assign(c!.id, "trip", 1)
            : f.repo.deleteCapture(c!.id, 1);
      await expect(pending).rejects.toThrow("Account changed");
      await switched;
      await f.switchTo("a");
      expect(f.counts()).toEqual(before);
      if (c) expect((await f.repo.getForSourceHandoff(c.id)).capture).toEqual(c);
    },
  );
  it.each(["assign", "delete"])(
    "stale Account %s queued behind switch cannot commit",
    async (method) => {
      const f = fixture();
      f.actor();
      const c = await f.intake();
      const lease = await beginAccountTransition();
      await expect(
        method === "assign"
          ? f.repo.assign(c.id, "trip", 1)
          : f.repo.deleteCapture(c.id, 1),
      ).rejects.toThrow("Account changed");
      endAccountTransition(lease);
      expect(f.counts().captures).toBe(1);
    },
  );
  it("row quota counts every duplicate and serializes a 999-row race", async () => {
    const f = fixture();
    const c = await f.intake();
    seedRows(f, c.payloadId, 998);
    const results = await Promise.allSettled([f.intake(), f.intake()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "ROW_QUOTA" },
    });
    expect(f.counts()).toEqual({ captures: 1000, payloads: 1, bytes: 3 });
  });
  it("Account byte quota is rechecked under concurrent distinct intake (real SQLite totals)", async () => {
    const f = fixture(tempPath());
    // Synthetic durable baseline totaling 100 MiB minus one byte. Each payload
    // has exact BLOB length/hash; no giant JS cache or virtual SQL total.
    const insert = f.sql.prepare(
      "INSERT INTO local_capture_payloads(account_id,id,byte_count,sha256,bytes) VALUES ('a',?,CAST(? AS INTEGER),?,zeroblob(?))",
    );
    for (let n = 0; n < 10; n++) {
      const size = CAPTURE_LIMITS.binaryBytes - (n === 9 ? 1 : 0);
      insert.run(`baseline-${n}`, size, await hash(new Uint8Array(size)), size);
    }
    const results = await Promise.allSettled([f.intake("x"), f.intake("y")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "ACCOUNT_BYTE_QUOTA" },
    });
    expect(f.counts().bytes).toBe(CAPTURE_LIMITS.accountBytes);
    const winner = (await f.repo.listInbox())[0];
    const duplicate = await f.intake(
      new TextDecoder().decode((await f.repo.getForSourceHandoff(winner.id)).bytes),
    );
    expect(duplicate.payloadId).toBe(winner.payloadId);
    expect(f.counts().bytes).toBe(CAPTURE_LIMITS.accountBytes);
  });
  it("device byte quota admits its exact bound and rejects overflow (real SQLite totals)", async () => {
    const f = fixture(tempPath());
    const size = CAPTURE_LIMITS.binaryBytes;
    const digest = await hash(new Uint8Array(size));
    const insert = f.sql.prepare(
      "INSERT INTO local_capture_payloads(account_id,id,byte_count,sha256,bytes) VALUES (?,?,CAST(? AS INTEGER),?,zeroblob(?))",
    );
    for (let n = 0; n < 50; n++) {
      const count = size - (n === 49 ? 1 : 0);
      insert.run(
        `old-account-${Math.floor(n / 10)}`,
        `baseline-${n}`,
        count,
        n === 49 ? await hash(new Uint8Array(count)) : digest,
        count,
      );
    }
    await f.intake("x");
    expect(f.counts().bytes).toBe(CAPTURE_LIMITS.deviceBytes);
    await expect(f.intake("y")).rejects.toMatchObject({ code: "DEVICE_BYTE_QUOTA" });
    await f.intake("x");
    expect(f.counts().bytes).toBe(CAPTURE_LIMITS.deviceBytes);
  });
  it.each(["ACCOUNT_BYTE_QUOTA", "DEVICE_BYTE_QUOTA"])(
    "bounded quota branch: %s",
    async (code) => {
      const f = fixture();
      virtualTotals(f, {
        rows: 0,
        accountBytes: code === "ACCOUNT_BYTE_QUOTA" ? CAPTURE_LIMITS.accountBytes : 0,
        deviceBytes: CAPTURE_LIMITS.deviceBytes,
      });
      await expect(f.intake()).rejects.toMatchObject({ code });
      expect(f.counts().captures).toBe(0);
    },
  );
  it("rejects contradictory stored quota totals without repair", async () => {
    const f = fixture();
    virtualTotals(f, { rows: 0, accountBytes: -1, deviceBytes: 0 });
    await expect(f.intake()).rejects.toMatchObject({ code: "INTEGRITY" });
    expect(f.counts().captures).toBe(0);
  });
  it("cold reopen preserves bytes, assignment, lifecycle and dedup", async () => {
    const path = tempPath();
    const first = fixture(path);
    first.actor();
    const c = await first.intake("旅\r\n", "trip", "TEXT");
    first.sql.close();
    connections.splice(connections.indexOf(first.sql), 1);
    const second = fixture(path, false);
    expect((await second.repo.listInbox())[0]).toEqual(c);
    expect((await second.repo.getForSourceHandoff(c.id)).bytes).toEqual(
      new TextEncoder().encode("旅\r\n"),
    );
    const duplicate = await second.intake("旅\r\n", "trip", "TEXT");
    expect(duplicate.payloadId).toBe(c.payloadId);
    await second.repo.deleteCapture(c.id, 1);
    expect(second.counts().payloads).toBe(1);
  });
  it.each([
    ["missing", "DELETE FROM local_capture_payloads"],
    ["wrong size", "UPDATE local_capture_payloads SET byte_count=2"],
    ["wrong hash", "UPDATE local_capture_payloads SET sha256='" + "b".repeat(64) + "'"],
    ["wrong account", "UPDATE local_capture_payloads SET account_id='b'"],
    ["lifecycle", "UPDATE local_capture_inbox SET state='IMPORTED'"],
    ["revision", "UPDATE local_capture_inbox SET revision='1'"],
    ["association", "UPDATE local_capture_inbox SET trip_id='trip'"],
    ["timestamp", "UPDATE local_capture_inbox SET created_at='bad'"],
  ])(
    "fails closed on %s corruption without ordinary read repair",
    async (_name, mutation) => {
      const f = fixture();
      const c = await f.intake();
      corrupt(f, mutation);
      const before = f.sql.prepare("SELECT * FROM local_capture_inbox").all();
      await expect(f.repo.getForSourceHandoff(c.id)).rejects.toMatchObject({
        code: "INTEGRITY",
      });
      await expect(f.repo.listInbox()).rejects.toMatchObject({ code: "INTEGRITY" });
      await expect(f.repo.deleteCapture(c.id, 1)).rejects.toMatchObject({
        code: "INTEGRITY",
      });
      expect(f.sql.prepare("SELECT * FROM local_capture_inbox").all()).toEqual(before);
    },
  );
  it("invalid UTF-8 durable TEXT cannot enter future handoff", async () => {
    const f = fixture();
    const c = await f.intake("abc", null, "TEXT");
    const bytes = new Uint8Array([255, 255, 255]);
    corrupt(f, "");
    f.sql
      .prepare("UPDATE local_capture_payloads SET bytes=?,sha256=?")
      .run(bytes, await hash(bytes));
    await expect(f.repo.getForSourceHandoff(c.id)).rejects.toMatchObject({
      code: "INTEGRITY",
    });
  });
  it("corrupt duplicate candidate is not accepted or silently repaired", async () => {
    const f = fixture();
    await f.intake();
    corrupt(f, "UPDATE local_capture_payloads SET bytes=x'78797a'");
    await expect(f.intake()).rejects.toMatchObject({ code: "INTEGRITY" });
    expect(f.counts().captures).toBe(1);
  });
  it("returned handoff bytes are a copy and changing them cannot mutate SQLite", async () => {
    const f = fixture();
    const c = await f.intake();
    const handoff = await f.repo.getForSourceHandoff(c.id);
    handoff.bytes.fill(0);
    expect((await f.repo.getForSourceHandoff(c.id)).bytes).toEqual(
      new TextEncoder().encode("abc"),
    );
  });
  it("does not retain or delete caller bytes / handles", async () => {
    const f = fixture();
    const source = new Uint8Array([1, 2]);
    const c = await f.repo.intake({ kind: "IMAGE" }, { bytes: source });
    source.fill(9);
    expect((await f.repo.getForSourceHandoff(c.id)).bytes).toEqual(
      new Uint8Array([1, 2]),
    );
    await f.repo.deleteCapture(c.id, 1);
    expect(source).toEqual(new Uint8Array([9, 9]));
  });
  it("limits listing, returns stable Account-only pages and rejects invalid contracts", async () => {
    const f = fixture();
    const a = await f.intake();
    const b = await f.intake();
    const all = await f.repo.listInbox();
    expect(all).toHaveLength(2);
    expect(await f.repo.listInbox({ limit: 1, offset: 1 })).toEqual([all[1]]);
    for (const options of [{ limit: 101 }, { offset: -1 }, { limit: 1.5 }])
      await expect(f.repo.listInbox(options)).rejects.toMatchObject({
        code: "INVALID_INPUT",
      });
    await expect(f.repo.assign(a.id, null, 0)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(
      f.repo.intake({ kind: "FILE", tripId: "" }, { bytes: new Uint8Array([1]) }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(new Set(all.map((c) => c.id))).toEqual(new Set([a.id, b.id]));
  });

  it.each(["handoff", "list"])(
    "Account switch pending during %s read rejects stale result",
    async (method) => {
      const f = fixture();
      const c = await f.intake();
      const entered = deferred();
      const resume = deferred();
      const repo = createLocalCaptureInboxRepository(f.db, async () => "a", {
        ...f.deps,
        sha256: async (bytes) => {
          entered.resolve();
          await resume.promise;
          return hash(bytes);
        },
      });
      const pending =
        method === "handoff" ? repo.getForSourceHandoff(c.id) : repo.listInbox();
      const rejected = expect(pending).rejects.toThrow("Account changed");
      await entered.promise;
      const switched = f.pendingSwitch("b");
      resume.resolve();
      await rejected;
      await switched;
      await f.switchTo("a");
      expect((await f.repo.getForSourceHandoff(c.id)).capture).toEqual(c);
    },
  );
  it("revision exhaustion fails without mutation", async () => {
    const f = fixture();
    f.actor();
    const c = await f.intake();
    corrupt(f, "UPDATE local_capture_inbox SET revision=9007199254740991");
    await expect(
      f.repo.assign(c.id, "trip", Number.MAX_SAFE_INTEGER),
    ).rejects.toMatchObject({ code: "STALE_REVISION" });
    expect((await f.repo.getForSourceHandoff(c.id)).capture.tripId).toBeNull();
  });
  it("schema rejects no-op revision bumps and noncontiguous revisions", async () => {
    const f = fixture();
    await f.intake();
    expect(() => f.sql.exec("UPDATE local_capture_inbox SET revision=2")).toThrow(
      "IMMUTABLE",
    );
    expect(() =>
      f.sql.exec(
        "UPDATE local_capture_inbox SET trip_id='trip',state='ASSIGNED',revision=3",
      ),
    ).toThrow("IMMUTABLE");
  });
  it("oversized corrupt BLOB is withheld before driver byte allocation", async () => {
    const f = fixture();
    const c = await f.intake();
    corrupt(f, "UPDATE local_capture_payloads SET bytes=zeroblob(10485761)");
    const queries: string[] = [];
    const get = f.db.getFirstAsync.bind(f.db);
    f.db.getFirstAsync = async <T>(q: string, ...p: unknown[]) => {
      queries.push(q);
      return get<T>(q, ...(p as never[]));
    };
    await expect(f.repo.getForSourceHandoff(c.id)).rejects.toMatchObject({
      code: "INTEGRITY",
    });
    expect(queries.some((q) => q.includes("THEN bytes ELSE NULL"))).toBe(true);
  });

  it("all operations leave unrelated tables unchanged and expose no processing capability", async () => {
    const f = fixture();
    f.actor();
    const unrelated = f.sql
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'local_capture_%' ORDER BY name",
      )
      .all()
      .map((r) => r.name as string);
    const snapshot = () =>
      unrelated.map((table) => [table, f.sql.prepare(`SELECT * FROM "${table}"`).all()]);
    const before = snapshot();
    const c = await f.intake();
    const assigned = await f.repo.assign(c.id, "trip", 1);
    await f.repo.listInbox();
    await f.repo.getForSourceHandoff(c.id);
    await f.repo.deleteCapture(c.id, assigned.revision);
    expect(snapshot()).toEqual(before);
    expect(Object.keys(f.repo).sort()).toEqual([
      "assign",
      "deleteCapture",
      "getForSourceHandoff",
      "intake",
      "listInbox",
    ]);
  });
});

describe("standalone SQLite48 migration", () => {
  it("composes over real prerequisites without registering 48 or adding fake 47", () => {
    const f = fixture();
    expect(localCaptureInboxMigration.id).toBe(48);
    expect(
      f.sql
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'local_capture_%'",
        )
        .all(),
    ).toHaveLength(2);
    expect(f.sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(f.sql.prepare("PRAGMA integrity_check").get()).toMatchObject({
      integrity_check: "ok",
    });
  });
  it("protects scoped references even with foreign keys off", async () => {
    const f = fixture();
    const c = await f.intake();
    f.sql.exec("PRAGMA foreign_keys=OFF");
    expect(() =>
      f.sql.prepare("DELETE FROM local_capture_payloads WHERE id=?").run(c.payloadId),
    ).toThrow("REFERENCED");
    const insert = f.sql.prepare(`INSERT INTO local_capture_inbox
      (account_id,id,payload_id,kind,created_at,state,revision) VALUES ('b','foreign',?,'FILE','2026-10-05T00:00:00.000Z','INBOX',1)`);
    expect(() => insert.run(c.payloadId)).toThrow("REFERENCE_INVALID");
    expect(() => insert.run("missing")).toThrow("REFERENCE_INVALID");
  });
  it.each(["bytes", "account_id", "sha256", "byte_count", "id"])(
    "prohibits payload %s mutation",
    async (column) => {
      const f = fixture();
      await f.intake();
      expect(() =>
        f.sql.exec(`UPDATE local_capture_payloads SET ${column}=${column}`),
      ).toThrow("IMMUTABLE");
    },
  );
  it.each([
    "id",
    "account_id",
    "payload_id",
    "kind",
    "original_filename",
    "declared_content_type",
    "created_at",
  ])("prohibits Capture %s mutation", async (column) => {
    const f = fixture();
    await f.intake();
    expect(() =>
      f.sql.exec(`UPDATE local_capture_inbox SET ${column}='changed'`),
    ).toThrow("IMMUTABLE");
  });
  it.each(["PROCESSING", "IMPORTED", "NEEDS_ATTENTION"])(
    "schema rejects future state %s",
    async (state) => {
      const f = fixture();
      await f.intake();
      expect(() =>
        f.sql.exec(
          `UPDATE local_capture_inbox SET trip_id='trip',state='${state}',revision=2`,
        ),
      ).toThrow();
    },
  );
  it.each(["'1'", "1.5", "0", "9007199254740992"])(
    "rejects malformed persisted revision %s",
    async (value) => {
      const f = fixture();
      await f.intake();
      expect(() =>
        f.sql.exec(
          `UPDATE local_capture_inbox SET trip_id='trip',state='ASSIGNED',revision=${value}`,
        ),
      ).toThrow();
    },
  );
  it("payload CHECKs enforce exact BLOB type/size/hash/bounds and TEXT association limit", async () => {
    const f = fixture();
    const insert = f.sql.prepare(
      "INSERT INTO local_capture_payloads VALUES ('a',?,CAST(? AS INTEGER),?,?)",
    );
    for (const [size, hashValue, bytes] of [
      [0, "a".repeat(64), new Uint8Array()],
      [2, "a".repeat(64), new Uint8Array([1])],
      [1, "bad", new Uint8Array([1])],
      [1, "a".repeat(64), "a"],
      [10485761, "a".repeat(64), new Uint8Array([1])],
    ])
      expect(() =>
        insert.run("bad", size as never, hashValue as never, bytes as never),
      ).toThrow();
    const size = CAPTURE_LIMITS.textBytes + 1;
    f.sql
      .prepare(
        "INSERT INTO local_capture_payloads VALUES ('a','large',CAST(? AS INTEGER),?,zeroblob(?))",
      )
      .run(size, await hash(new Uint8Array(size)), size);
    expect(() =>
      f.sql
        .exec(`INSERT INTO local_capture_inbox(account_id,id,payload_id,kind,created_at,state,revision)
      VALUES('a','text','large','TEXT','2026-10-05T00:00:00.000Z','INBOX',1)`),
    ).toThrow("REFERENCE_INVALID");
  });
});
