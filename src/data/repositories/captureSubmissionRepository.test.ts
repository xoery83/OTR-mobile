import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { migrations } from "@/data/db/migrations";
import { runMigrations } from "@/data/db/migrationRunner";
import { captureCameraInputsMigration } from "@/data/db/migrations/captureCameraInputs";
import { serializeDatabaseTransactions } from "@/data/db/databaseConnection";
import {
  beginAccountTransition,
  endAccountTransition,
} from "@/data/auth/accountRequestContext";
import {
  createCaptureSubmissionSession,
  createCaptureRecoveryAction,
} from "@/data/operations/captureSubmission";
import type { CapturePayloadInput } from "@/data/files/capturePayloadReader";
import {
  submissionRequestSchema,
  type SubmissionRequest,
} from "@/domain/capture/captureSubmission";
import { LocalCaptureError } from "@/domain/capture/localCapture";
import { createCaptureSubmissionRepository } from "./captureSubmissionRepository";
import {
  createLocalCaptureInboxRepository,
  type LocalCaptureDatabase,
} from "./localCaptureInboxRepository";
const a = randomUUID(),
  b = randomUUID();
const sha256 = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const deps = { sha256, newId: randomUUID, now: () => "2026-10-08T00:00:00.000Z" };
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((clean) => clean());
});
function fixture(fk = true, disk = false, version = 64) {
  const dir = disk ? mkdtempSync(join(tmpdir(), "capture-c2-")) : null;
  const path = dir ? join(dir, "local.db") : ":memory:";
  let sql = new DatabaseSync(path);
  let account: string = a;
  sql.exec(`PRAGMA foreign_keys=${fk ? "ON" : "OFF"}`);
  for (const migration of migrations.filter((m) => m.id <= version))
    sql.exec(migration.sql);
  const db: LocalCaptureDatabase = serializeDatabaseTransactions({
    async getFirstAsync<T>(q: string, ...params: unknown[]) {
      return (sql.prepare(q).get(...(params as unknown as never[])) ?? null) as T | null;
    },
    async getAllAsync<T>(q: string, ...params: unknown[]) {
      return sql.prepare(q).all(...(params as unknown as never[])) as T[];
    },
    async runAsync(q: string, ...params: unknown[]) {
      const r = sql.prepare(q).run(...(params as unknown as never[]));
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
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
  });
  const getUser = async () => {
    if (!account) throw new Error("Signed out");
    return account;
  };
  const repository = () => createCaptureSubmissionRepository(db, getUser, deps);
  const f = {
    db,
    get sql() {
      return sql;
    },
    repo: repository(),
    getUser,
    async switchTo(next: string) {
      const lease = await beginAccountTransition();
      account = next;
      endAccountTransition(lease);
    },
    reopen() {
      sql.close();
      sql = new DatabaseSync(path);
      sql.exec(`PRAGMA foreign_keys=${fk ? "ON" : "OFF"}`);
      f.repo = repository();
    },
    request(n = 2, prior: string | null = null): SubmissionRequest {
      const batchId = randomUUID(),
        createdAt = deps.now();
      return {
        formatVersion: 1,
        manifestVersion: 1,
        accountId: account,
        batchId,
        jobId: randomUUID(),
        submissionKey: randomUUID(),
        createdAt,
        context: {
          id: randomUUID(),
          version: 1,
          accountId: account,
          batchId,
          observedAt: createdAt,
          clock: "DEVICE_WALL",
          entrySurface: "CAPTURE",
          tripPrior: prior ? { id: prior, origin: "PRIOR", observedAt: createdAt } : null,
        },
        inputs: Array.from({ length: n }, (_, ordinal) => ({
          id: randomUUID(),
          itemKey: randomUUID(),
          ordinal,
          acquisitionSource: ordinal % 2 ? "photos" : "files",
          kind: ordinal % 2 ? "IMAGE" : "FILE",
          originalFilename: "same",
          declaredContentType: null,
          continuesFromInputId: null,
        })),
      };
    },
    sources(
      r: SubmissionRequest,
      value = "abc",
    ): Map<string, () => Promise<CapturePayloadInput>> {
      return new Map(
        r.inputs.map((i) => [
          i.id,
          async () => ({ bytes: new TextEncoder().encode(value) }),
        ]),
      );
    },
    count(table: string) {
      return Number(sql.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n);
    },
  };
  cleanups.push(() => {
    sql.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });
  return f;
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}
function loseAck(f: ReturnType<typeof fixture>, predicate: (q: string) => boolean) {
  const transaction = f.db.withTransactionAsync.bind(f.db),
    run = f.db.runAsync.bind(f.db);
  let lose = false,
    done = false;
  f.db.runAsync = async (q, ...params) => {
    const result = await run(q, ...(params as unknown as never[]));
    if (!done && predicate(q)) lose = true;
    return result;
  };
  f.db.withTransactionAsync = async (work) => {
    lose = false;
    await transaction(work);
    if (lose && !done) {
      done = true;
      throw new Error("ACK lost");
    }
  };
}
describe("Capture C2 durable submission", () => {
  it.each([true, false])(
    "fresh/upgrade51 preserves SQLite48 originals and protects bindings FK=%s",
    async (fk) => {
      const f = fixture(fk, false, 50);
      const original = await createLocalCaptureInboxRepository(
        f.db,
        f.getUser,
        deps,
      ).intake({ kind: "FILE" }, { bytes: new Uint8Array([1]) });
      const prior = f.sql.prepare("SELECT * FROM local_capture_inbox").all();
      f.sql.exec(migrations.find((m) => m.id === 51)!.sql);
      expect(f.sql.prepare("SELECT * FROM local_capture_inbox").all()).toEqual(prior);
      expect(f.count("capture_submission_batches")).toBe(0);
      const r = f.request();
      const result = await f.repo.submit(r, f.sources(r));
      expect(result.counts).toEqual({ selected: 2, accepted: 2, failed: 0, pending: 0 });
      expect(result.allInputsAccepted).toBe(true);
      expect(result.processing.capability).toBe("NOT_INSTALLED");
      expect(f.count("local_capture_inbox")).toBe(3);
      expect(f.count("local_capture_payloads")).toBe(2);
      expect(() =>
        f.sql
          .prepare("DELETE FROM local_capture_inbox WHERE id=?")
          .run(result.inputs[0].captureId),
      ).toThrow("CAPTURE_SUBMISSION_RETAINED");
      expect(() =>
        f.sql
          .prepare("DELETE FROM local_capture_payloads WHERE id=?")
          .run(result.inputs[0].payloadId),
      ).toThrow();
      expect(() => f.sql.exec("DELETE FROM capture_submission_inputs")).toThrow();
      expect(() =>
        f.sql.exec("UPDATE capture_submission_batches SET created_at='x'"),
      ).toThrow();
      expect(
        (
          await createLocalCaptureInboxRepository(
            f.db,
            f.getUser,
            deps,
          ).getForSourceHandoff(original.id)
        ).bytes,
      ).toEqual(new Uint8Array([1]));
      expect(f.sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    },
  );
  it("registers whole roster before bytes; no saved claim; cold reopen same Job and stable ordering", async () => {
    const f = fixture(true, true),
      r = f.request(3);
    await f.repo.register(r);
    expect((await f.repo.read(r.jobId)).counts).toEqual({
      selected: 3,
      accepted: 0,
      failed: 0,
      pending: 3,
    });
    expect(f.count("local_capture_inbox")).toBe(0);
    f.reopen();
    expect((await f.repo.reopen(r.jobId)).batch).toEqual(r);
    expect((await f.repo.recoverSubmission(r.submissionKey)).batch.jobId).toBe(r.jobId);
    const reader = vi.fn(async () => {
      expect(f.count("capture_submission_inputs")).toBe(3);
      return { bytes: new Uint8Array([2]) };
    });
    const result = await f.repo.submit(r, new Map(r.inputs.map((i) => [i.id, reader])));
    expect(result.allInputsAccepted).toBe(true);
    f.reopen();
    expect((await f.repo.read(r.jobId)).inputs.map((i) => i.id)).toEqual(
      r.inputs.map((i) => i.id),
    );
    expect((await f.repo.list())[0].batch.jobId).toBe(r.jobId);
  });
  it("roster registration rollback has no header/items/bytes and never opens reader", async () => {
    const f = fixture(),
      r = f.request();
    f.sql.exec(
      "CREATE TRIGGER reject_second BEFORE INSERT ON capture_submission_inputs WHEN NEW.ordinal=1 BEGIN SELECT RAISE(ABORT,'crash');END;",
    );
    const reader = vi.fn();
    await expect(f.repo.submit(r, new Map([[r.inputs[0].id, reader]]))).rejects.toThrow(
      "crash",
    );
    expect(reader).not.toHaveBeenCalled();
    expect(f.count("capture_submission_batches")).toBe(0);
    expect(f.count("capture_submission_inputs")).toBe(0);
  });
  it.each(["register", "pin", "accept"])(
    "recovers exact lost %s ACK without duplicate reference",
    async (stage) => {
      const f = fixture(),
        r = f.request(1);
      loseAck(f, (q) =>
        stage === "register"
          ? q.startsWith("INSERT INTO capture_submission_batches")
          : stage === "pin"
            ? q.startsWith("UPDATE capture_submission_inputs")
            : q.startsWith("INSERT INTO local_capture_inbox"),
      );
      expect((await f.repo.submit(r, f.sources(r))).allInputsAccepted).toBe(true);
      const reader = vi.fn();
      expect(
        (await f.repo.submit(r, new Map([[r.inputs[0].id, reader]]))).allInputsAccepted,
      ).toBe(true);
      expect(reader).not.toHaveBeenCalled();
      expect(f.count("local_capture_inbox")).toBe(1);
      expect(f.count("capture_submission_batches")).toBe(1);
    },
  );
  it("double submit/concurrent same Input replay yields one exact binding", async () => {
    const f = fixture(),
      r = f.request(1);
    const results = await Promise.allSettled([
      f.repo.submit(r, f.sources(r)),
      f.repo.submit(r, f.sources(r)),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect((await f.repo.read(r.jobId)).allInputsAccepted).toBe(true);
    expect(f.count("local_capture_inbox")).toBe(1);
  });
  it("same key changed declaration rejects before reading; new explicit identical bytes creates new references", async () => {
    const f = fixture(),
      r = f.request(1);
    await f.repo.submit(r, f.sources(r));
    const changed = structuredClone(r);
    changed.inputs[0].originalFilename = "changed";
    const read = vi.fn();
    await expect(
      f.repo.submit(changed, new Map([[r.inputs[0].id, read]])),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(read).not.toHaveBeenCalled();
    const next = f.request(1);
    await f.repo.submit(next, f.sources(next));
    expect(f.count("capture_submission_batches")).toBe(2);
    expect(f.count("local_capture_inbox")).toBe(2);
    expect(f.count("local_capture_payloads")).toBe(1);
  });
  it("partial reader/empty/size failures persist safe facts with closed readers and accepted sibling", async () => {
    const f = fixture(),
      r = f.request(4),
      sources = f.sources(r);
    const close = vi.fn(async () => {});
    sources.set(r.inputs[1].id, async () => {
      throw new LocalCaptureError("READER_FAILURE");
    });
    sources.set(
      r.inputs[2].id,
      async () =>
        ({
          reader: {
            read: async () => {
              throw new Error("private URI");
            },
            close,
          },
        }) as CapturePayloadInput,
    );
    sources.set(r.inputs[3].id, async () => ({ bytes: new Uint8Array() }));
    const result = await f.repo.submit(r, sources);
    expect(result.counts).toEqual({ selected: 4, accepted: 1, failed: 3, pending: 0 });
    expect(close).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain("private URI");
    expect(result.availableActions.canRetryKnownFailedItem).toBe(false);
  });
  it("quota failure pins first bytes; changed recovery rejects; original recovery retains identity", async () => {
    const f = fixture(),
      r = f.request(1),
      get = f.db.getFirstAsync.bind(f.db);
    let full = true;
    f.db.getFirstAsync = async <T>(q: string, ...p: unknown[]) =>
      q.includes("AS accountBytes") && full
        ? ({ accountBytes: 0, deviceBytes: 0, rows: 1000 } as T)
        : get<T>(q, ...(p as unknown as never[]));
    let result = await f.repo.submit(r, f.sources(r));
    const item = result.inputs[0];
    expect(item.failureCode).toBe("ROW_QUOTA");
    expect(item.contentSha256).not.toBeNull();
    full = false;
    result = await f.repo.resume(r.jobId, item.id, item.revision, async () => ({
      bytes: new Uint8Array([9]),
    }));
    expect(result.inputs[0].failureCode).toBe("CONTENT_MISMATCH");
    expect(f.count("local_capture_inbox")).toBe(0);
    result = await f.repo.resume(
      r.jobId,
      item.id,
      result.inputs[0].revision,
      f.sources(r).get(item.id),
    );
    expect(result.allInputsAccepted).toBe(true);
    expect(result.batch.jobId).toBe(r.jobId);
  });
  it.each(["payload", "capture", "binding"])(
    "crash at %s write rolls back original and binding; cold exact resume",
    async (stage) => {
      const f = fixture(false, true),
        r = f.request(1);
      const target =
        stage === "payload"
          ? "local_capture_payloads"
          : stage === "capture"
            ? "local_capture_inbox"
            : "capture_submission_inputs";
      const event = stage === "binding" ? "UPDATE" : "INSERT";
      const condition = stage === "binding" ? "WHEN NEW.acceptance_state='ACCEPTED'" : "";
      f.sql.exec(
        `CREATE TRIGGER crash BEFORE ${event} ON ${target} ${condition} BEGIN SELECT RAISE(ABORT,'crash');END;`,
      );
      await expect(f.repo.submit(r, f.sources(r))).rejects.toThrow("crash");
      expect(f.count("local_capture_inbox")).toBe(0);
      expect(f.count("local_capture_payloads")).toBe(0);
      f.reopen();
      const item = (await f.repo.read(r.jobId)).inputs[0];
      expect(item.state).toBe("PENDING");
      expect(item.contentSha256).not.toBeNull();
      f.sql.exec("DROP TRIGGER crash");
      expect(
        (await f.repo.resume(r.jobId, item.id, item.revision, f.sources(r).get(item.id)))
          .allInputsAccepted,
      ).toBe(true);
    },
  );
  it.each([true, false])(
    "explicit unpinned continuation is new Job; reverse cold lineage, forged/self/cross-account cycles denied FK=%s",
    async (fk) => {
      const f = fixture(fk, true),
        old = f.request(1);
      await f.repo.register(old);
      let item = (
        await f.repo.resume(old.jobId, old.inputs[0].id, 1, async () => ({
          bytes: new Uint8Array([9]),
        }))
      ).inputs[0];
      expect(item.pendingReason).toBe("REACQUIRE");
      expect(item.contentSha256).toBeNull();
      const r = f.request(1);
      r.inputs[0].continuesFromInputId = item.id;
      await f.repo.submit(r, f.sources(r), undefined, undefined, {
        [item.id]: item.revision,
      });
      f.reopen();
      const prior = await f.repo.read(old.jobId),
        next = await f.repo.read(r.jobId);
      expect(prior.inputs[0].state).toBe("PENDING");
      expect(prior.inputs[0].continuedIn).toEqual([
        { jobId: r.jobId, inputId: r.inputs[0].id },
      ]);
      expect(next.inputs[0].continuesFromJobId).toBe(old.jobId);
      const forged = f.request(1);
      forged.inputs[0].continuesFromInputId = randomUUID();
      await expect(f.repo.register(forged)).rejects.toMatchObject({
        code: "INVALID_INPUT",
      });
      const self = f.request(1);
      self.inputs[0].continuesFromInputId = self.inputs[0].id;
      await expect(f.repo.register(self)).rejects.toMatchObject({
        code: "INVALID_INPUT",
      });
      expect(() =>
        f.sql
          .prepare(
            "UPDATE capture_submission_inputs SET continues_from_input_id=?,row_revision=row_revision+1 WHERE input_id=?",
          )
          .run(r.inputs[0].id, item.id),
      ).toThrow();
      await f.switchTo(b);
      const foreign = f.request(1);
      foreign.inputs[0].continuesFromInputId = item.id;
      await expect(f.repo.register(foreign)).rejects.toMatchObject({
        code: "INVALID_INPUT",
      });
      expect(await f.repo.list()).toEqual([]);
      await expect(f.repo.read(old.jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    },
  );
  it.each(["read", "commit"])(
    "Account switch during %s fences A→B→A and protects local responsibility",
    async (boundary) => {
      const f = fixture(),
        r = f.request(1),
        entered = deferred(),
        release = deferred();
      const sources = f.sources(r);
      let transition: Promise<void> | undefined;
      if (boundary === "read")
        sources.set(r.inputs[0].id, async () => {
          entered.resolve();
          await release.promise;
          return { bytes: new Uint8Array([1]) };
        });
      else {
        const run = f.db.runAsync.bind(f.db);
        f.db.runAsync = async (q, ...p) => {
          const result = await run(q, ...(p as unknown as never[]));
          if (q.startsWith("INSERT INTO local_capture_inbox")) transition = f.switchTo(b);
          return result;
        };
      }
      const pending = f.repo.submit(r, sources),
        rejected = expect(pending).rejects.toThrow("Account changed");
      if (boundary === "read") {
        await entered.promise;
        await f.switchTo(b);
        await f.switchTo(a);
        release.resolve();
      }
      await rejected;
      if (transition) await transition;
      await f.switchTo(a);
      expect((await f.repo.read(r.jobId)).counts.accepted).toBe(0);
      expect(f.count("local_capture_inbox")).toBe(0);
    },
  );
  it("Trip prior revoke does not assign or prevent offline Account intake; Source/Run/queue remain empty", async () => {
    const f = fixture(),
      r = f.request(1, randomUUID());
    await f.repo.submit(r, f.sources(r));
    expect(f.sql.prepare("SELECT trip_id,state FROM local_capture_inbox").get()).toEqual({
      trip_id: null,
      state: "INBOX",
    });
    for (const table of [
      "sync_operations",
      "local_capture_source_bindings",
      "intelligence_continuations",
    ])
      expect(f.count(table)).toBe(0);
    await f.switchTo("");
    await expect(f.repo.read(r.jobId)).rejects.toThrow("Signed out");
  });
  it("session double taps freeze once; no reader before registration; Hide has no cancellation; new Add uses new session", async () => {
    const f = fixture(),
      entered = deferred(),
      release = deferred();
    const open = vi.fn(async () => {
      entered.resolve();
      await release.promise;
      return { bytes: new Uint8Array([1]) };
    });
    const session = createCaptureSubmissionSession({
      repository: f.repo,
      getActiveUserId: f.getUser,
      ...deps,
      open,
    });
    const selected = [
      {
        source: "files" as const,
        temporaryUri: "temp://original",
        name: "one",
        typeHint: null,
      },
    ];
    const progress = vi.fn(),
      p = session.submit(selected, progress),
      double = session.submit(selected, progress);
    expect(p).toBe(double);
    selected[0].name = "mutated";
    await entered.promise;
    expect(f.count("capture_submission_inputs")).toBe(1);
    expect(session.getRegisteredJobId()).not.toBeNull();
    release.resolve();
    const result = await p;
    expect(result.inputs[0].originalFilename).toBe("one");
    expect(open).toHaveBeenCalledOnce();
    expect((await session.recover())!.batch.jobId).toBe(result.batch.jobId);
    const next = createCaptureSubmissionSession({
      repository: f.repo,
      getActiveUserId: f.getUser,
      ...deps,
      open,
    });
    expect((await next.submit(selected, vi.fn())).batch.jobId).not.toBe(
      result.batch.jobId,
    );
  });
});

it.each(["picker", "after-picker"])(
  "recovery fences A→B→A at %s before lineage/acceptance",
  async (boundary) => {
    const f = fixture(),
      r = f.request(1);
    await f.repo.register(r);
    const selected = {
      source: "files" as const,
      temporaryUri: "temp://new",
      name: "new",
      typeHint: null,
    };
    const open = vi.fn(async () => ({ bytes: new Uint8Array([1]) }));
    const reopen = f.repo.reopen.bind(f.repo);
    let reads = 0;
    if (boundary === "after-picker")
      f.repo.reopen = async (...args) => {
        const value = await reopen(...args);
        if (++reads === 2) {
          await f.switchTo(b);
          await f.switchTo(a);
        }
        return value;
      };
    await expect(
      createCaptureRecoveryAction(
        {
          repository: f.repo,
          getActiveUserId: f.getUser,
          ...deps,
          open,
          pick: async () => {
            if (boundary === "picker") {
              await f.switchTo(b);
              await f.switchTo(a);
            }
            return [selected];
          },
        },
        r.jobId,
        r.inputs[0].id,
        1,
      ).run(vi.fn()),
    ).rejects.toThrow("Account changed");
    expect(open).not.toHaveBeenCalled();
    expect(f.count("capture_submission_batches")).toBe(1);
    expect(f.count("local_capture_inbox")).toBe(0);
  },
);
it("stale projected recovery after picker cannot create lineage; cancellation/multiple selections create no new Job", async () => {
  const f = fixture(),
    r = f.request(1);
  await f.repo.register(r);
  const selected = {
    source: "files" as const,
    temporaryUri: "temp://new",
    name: "new",
    typeHint: null,
  };
  const action = (pick: () => Promise<readonly (typeof selected)[]>) =>
    createCaptureRecoveryAction(
      {
        repository: f.repo,
        getActiveUserId: f.getUser,
        ...deps,
        open: async () => ({ bytes: new Uint8Array([1]) }),
        pick,
      },
      r.jobId,
      r.inputs[0].id,
      1,
    ).run(vi.fn());
  expect((await action(async () => [])).batch.jobId).toBe(r.jobId);
  await expect(action(async () => [selected, selected])).rejects.toThrow("exactly one");
  await expect(
    action(async () => {
      await f.repo.resume(r.jobId, r.inputs[0].id, 1);
      return [selected];
    }),
  ).rejects.toThrow("Stale recovery");
  expect(f.count("capture_submission_batches")).toBe(1);
});
it("explicit continuation revalidates source revision inside registration", async () => {
  const f = fixture(),
    old = f.request(1);
  await f.repo.register(old);
  const next = f.request(1);
  next.inputs[0].continuesFromInputId = old.inputs[0].id;
  await f.repo.resume(old.jobId, old.inputs[0].id, 1);
  await expect(
    f.repo.submit(next, f.sources(next), undefined, undefined, { [old.inputs[0].id]: 1 }),
  ).rejects.toMatchObject({ code: "STALE_REVISION" });
  expect(f.count("capture_submission_batches")).toBe(1);
});
it.each([null, randomUUID()])("recovery action preserves passive Trip prior %s with new immutable lineage", async (prior) => {
  const f = fixture(),
    r = f.request(1, prior);
  await f.repo.register(r);
  const selected = {
    source: "files" as const,
    temporaryUri: "temp://new",
    name: "new",
    typeHint: null,
  };
  const result = await createCaptureRecoveryAction(
    {
      repository: f.repo,
      getActiveUserId: f.getUser,
      ...deps,
      open: async () => ({ bytes: new Uint8Array([1]) }),
      pick: async () => [selected],
    },
    r.jobId,
    r.inputs[0].id,
    1,
  ).run(vi.fn());
  expect(result.batch.jobId).not.toBe(r.jobId);
  expect(result.batch.context.tripPrior?.id ?? null).toBe(prior);
  expect(result.batch.context.id).not.toBe(r.context.id);
  expect((await f.repo.reopen(r.jobId)).batch.context).toEqual(r.context);
  expect(result.inputs[0].continuesFromInputId).toBe(r.inputs[0].id);
});
it("missing sources stay pending and registered; accepted replay works without reacquiring expired URI", async () => {
  const f = fixture(),
    r = f.request();
  let result = await f.repo.submit(
    r,
    new Map([[r.inputs[0].id, async () => ({ bytes: new Uint8Array([1]) })]]),
  );
  expect(result.counts).toEqual({ selected: 2, accepted: 1, failed: 0, pending: 1 });
  expect(result.inputs[1].pendingReason).toBe("REACQUIRE");
  result = await f.repo.submit(r, new Map());
  expect(result.inputs[0].captureId).not.toBeNull();
  expect(f.count("local_capture_inbox")).toBe(1);
});
it("registration replays after cold ACK loss before byte reads", async () => {
  const f = fixture(false, true),
    r = f.request(2);
  loseAck(f, (q) => q.startsWith("INSERT INTO capture_submission_batches"));
  await expect(f.repo.register(r)).rejects.toThrow("ACK lost");
  f.reopen();
  const recovered = await f.repo.recoverSubmission(r.submissionKey);
  expect(recovered.batch.jobId).toBe(r.jobId);
  expect(recovered.counts.pending).toBe(2);
  expect((await f.repo.submit(r, f.sources(r))).allInputsAccepted).toBe(true);
  expect(f.count("capture_submission_batches")).toBe(1);
});
it("crash after pin retains unsaved responsibility; resumed accepted originals need no reader after restart", async () => {
  const f = fixture(false, true),
    r = f.request(1);
  const run = f.db.runAsync.bind(f.db);
  let crash = true;
  f.db.runAsync = async (q, ...params) => {
    if (crash && q.startsWith("INSERT INTO local_capture_inbox"))
      throw new Error("process stopped");
    return run(q, ...(params as unknown as never[]));
  };
  await expect(f.repo.submit(r, f.sources(r))).rejects.toThrow("process stopped");
  f.reopen();
  crash = false;
  let item = (await f.repo.read(r.jobId)).inputs[0];
  expect(item.contentSha256).not.toBeNull();
  expect(item.state).toBe("PENDING");
  await f.repo.resume(r.jobId, item.id, item.revision, f.sources(r).get(item.id));
  f.reopen();
  item = (await f.repo.read(r.jobId)).inputs[0];
  const source = vi.fn();
  expect((await f.repo.resume(r.jobId, item.id, 1, source)).allInputsAccepted).toBe(true);
  expect(source).not.toHaveBeenCalled();
});
it.each(["ACCOUNT_BYTE_QUOTA", "DEVICE_BYTE_QUOTA"] as const)(
  "partial %s keeps accepted sibling and immutable first pin",
  async (code) => {
    const f = fixture(),
      r = f.request(),
      get = f.db.getFirstAsync.bind(f.db);
    let exhausted = false;
    f.db.getFirstAsync = async <T>(q: string, ...params: unknown[]) =>
      q.includes("AS accountBytes") && exhausted
        ? ({
            accountBytes: code === "ACCOUNT_BYTE_QUOTA" ? 104857600 : 0,
            deviceBytes: code === "DEVICE_BYTE_QUOTA" ? 524288000 : 0,
            rows: 1,
          } as T)
        : get<T>(q, ...(params as never[]));
    const sources = f.sources(r);
    sources.set(r.inputs[1].id, async () => {
      exhausted = true;
      return { bytes: new TextEncoder().encode("different") };
    });
    const result = await f.repo.submit(r, sources);
    expect(result.counts).toEqual({ selected: 2, accepted: 1, failed: 1, pending: 0 });
    expect(result.inputs[1].failureCode).toBe(code);
    expect(result.inputs[1].contentSha256).not.toBeNull();
    expect(f.count("local_capture_inbox")).toBe(1);
  },
);
it("oversize bounded reader closes, records safe failure, and does not allocate original", async () => {
  const f = fixture(),
    r = f.request(1),
    close = vi.fn(async () => {}),
    read = vi.fn();
  const result = await f.repo.submit(
    r,
    new Map([
      [r.inputs[0].id, async () => ({ reader: { sizeHint: 10485761, read, close } })],
    ]),
  );
  expect(result.inputs[0].failureCode).toBe("PAYLOAD_TOO_LARGE");
  expect(read).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
  expect(f.count("local_capture_inbox")).toBe(0);
});
it("bounded metadata rejection, forged acceptance, distinct UUIDs/order reject before reader", async () => {
  const f = fixture(),
    r = f.request(1),
    read = vi.fn();
  for (const bad of [
    { ...r, jobId: r.batchId },
    { ...r, inputs: [{ ...r.inputs[0], ordinal: 1 }] },
    { ...r, inputs: [{ ...r.inputs[0], state: "ACCEPTED" }] },
  ])
    await expect(
      f.repo.submit(bad as SubmissionRequest, new Map([[r.inputs[0].id, read]])),
    ).rejects.toThrow();
  const large = f.request(100);
  large.inputs.forEach((i) => {
    i.originalFilename = "旅".repeat(1024);
  });
  await expect(f.repo.register(large)).rejects.toThrow("technical bound");
  expect(read).not.toHaveBeenCalled();
  expect(f.count("capture_submission_batches")).toBe(0);
});
it("list cursor is Account scoped and stable; reopening does not allocate identities", async () => {
  const f = fixture();
  const requests = [f.request(1), f.request(1), f.request(1)];
  for (const r of requests) await f.repo.register(r);
  const first = await f.repo.list({ limit: 1 });
  const after = await f.repo.list({
    limit: 2,
    before: { createdAt: first[0].batch.createdAt, batchId: first[0].batch.batchId },
  });
  expect(new Set([first[0], ...after].map((j) => j.batch.jobId)).size).toBe(3);
  for (const j of after)
    expect((await f.repo.reopen(j.batch.jobId)).batch.jobId).toBe(j.batch.jobId);
  await f.switchTo(b);
  expect(await f.repo.list()).toEqual([]);
  await expect(
    f.repo.recoverSubmission(first[0].batch.submissionKey),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it.each(["metadata", "storage-class", "payload"])(
  "cold corrupted %s fails closed without recovery writes",
  async (corruption) => {
    const f = fixture(false, true),
      r = f.request(1);
    const result = await f.repo.submit(r, f.sources(r));
    f.sql.exec(
      "DROP TRIGGER capture_submission_input_update;DROP TRIGGER capture_submission_roster_update;DROP TRIGGER capture_submission_acceptance;PRAGMA ignore_check_constraints=ON;",
    );
    if (corruption === "metadata")
      f.sql.exec("UPDATE capture_submission_inputs SET original_filename='forged'");
    if (corruption === "storage-class")
      f.sql.exec(
        "UPDATE capture_submission_inputs SET row_revision=CAST(row_revision AS REAL)",
      );
    if (corruption === "payload") {
      f.sql.exec(
        "DROP TRIGGER local_capture_payload_immutable;UPDATE local_capture_payloads SET bytes=x'010203'",
      );
    }
    f.reopen();
    await expect(f.repo.reopen(r.jobId)).rejects.toMatchObject({ code: "INTEGRITY" });
    expect(f.count("capture_submission_batches")).toBe(1);
    expect(f.count("local_capture_inbox")).toBe(1);
    expect(result.allInputsAccepted).toBe(true);
  },
);
it("account switch after acceptance COMMIT with lost acknowledgment retains original for fresh A only", async () => {
  const f = fixture(),
    r = f.request(1),
    transaction = f.db.withTransactionAsync.bind(f.db),
    run = f.db.runAsync.bind(f.db);
  let acceptance = false,
    done = false;
  f.db.runAsync = async (q, ...params) => {
    const result = await run(q, ...(params as unknown as never[]));
    if (q.startsWith("INSERT INTO local_capture_inbox")) acceptance = true;
    return result;
  };
  let switched: Promise<void> | undefined;
  f.db.withTransactionAsync = async (work) => {
    acceptance = false;
    await transaction(work);
    if (acceptance && !done) {
      done = true;
      switched = f.switchTo(b);
    }
  };
  await expect(f.repo.submit(r, f.sources(r))).rejects.toThrow("Account changed");
  await switched;
  expect(await f.repo.list()).toEqual([]);
  await f.switchTo(a);
  expect((await f.repo.reopen(r.jobId)).allInputsAccepted).toBe(true);
  expect(f.count("local_capture_inbox")).toBe(1);
});

it("uncertain new continuation registration retries its retained frozen request/key", async () => {
  const f = fixture(),
    r = f.request(1, randomUUID());
  await f.repo.register(r);
  const get = f.db.getFirstAsync.bind(f.db),
    run = f.db.runAsync.bind(f.db),
    transaction = f.db.withTransactionAsync.bind(f.db);
  let registered = false,
    blocked = false,
    done = false;
  f.db.getFirstAsync = async <T>(q: string, ...args: unknown[]) => {
    if (blocked) throw new Error("readback unavailable");
    return get<T>(q, ...(args as never[]));
  };
  f.db.runAsync = async (q, ...args) => {
    const result = await run(q, ...(args as unknown as never[]));
    if (q.startsWith("INSERT INTO capture_submission_batches")) registered = true;
    return result;
  };
  f.db.withTransactionAsync = async (work) => {
    registered = false;
    await transaction(work);
    if (registered && !done) {
      done = true;
      blocked = true;
      throw new Error("registration ACK lost");
    }
  };
  const pick = vi.fn(async () => [
    { source: "files" as const, temporaryUri: "temp://new", name: "new", typeHint: null },
  ]);
  const action = createCaptureRecoveryAction(
    {
      repository: f.repo,
      getActiveUserId: f.getUser,
      ...deps,
      pick,
      open: async () => ({ bytes: new Uint8Array([1]) }),
    },
    r.jobId,
    r.inputs[0].id,
    1,
  );
  await expect(action.run(vi.fn())).rejects.toThrow("readback unavailable");
  expect(f.count("capture_submission_batches")).toBe(2);
  const stored = f.sql
    .prepare(
      "SELECT job_id,submission_key FROM capture_submission_batches ORDER BY rowid DESC LIMIT 1",
    )
    .get();
  blocked = false;
  const recovered = await action.run(vi.fn());
  expect(recovered.allInputsAccepted).toBe(true);
  expect(recovered.batch.context.tripPrior?.id).toBe(r.context.tripPrior!.id);
  expect(recovered.batch.jobId).toBe(stored!.job_id);
  expect(recovered.batch.submissionKey).toBe(stored!.submission_key);
  expect(pick).toHaveBeenCalledOnce();
  expect(f.count("capture_submission_batches")).toBe(2);
  expect(f.count("local_capture_inbox")).toBe(1);
});
it("session exact-key recovery never refreshes a stale Account generation", async () => {
  const f = fixture(),
    session = createCaptureSubmissionSession({
      repository: f.repo,
      getActiveUserId: f.getUser,
      ...deps,
      open: async () => ({ bytes: new Uint8Array([1]) }),
    });
  await session.submit(
    [{ source: "files", temporaryUri: null, name: "one", typeHint: null }],
    vi.fn(),
  );
  const recover = f.repo.recoverSubmission.bind(f.repo);
  f.repo.recoverSubmission = async (...args) => {
    await f.switchTo(b);
    await f.switchTo(a);
    return recover(...args);
  };
  await expect(session.recover()).rejects.toThrow("Account changed");
  expect(f.count("local_capture_inbox")).toBe(1);
});
it("corrupted reverse lineage cannot fabricate continued status for another Job", async () => {
  const f = fixture(false, true),
    first = f.request(1),
    other = f.request(1);
  await f.repo.register(first);
  await f.repo.register(other);
  const next = f.request(1);
  next.inputs[0].continuesFromInputId = first.inputs[0].id;
  await f.repo.register(next, { [first.inputs[0].id]: 1 });
  f.sql.exec(
    "DROP TRIGGER capture_submission_input_update;DROP TRIGGER capture_submission_roster_update;",
  );
  f.sql
    .prepare(
      "UPDATE capture_submission_inputs SET continues_from_input_id=? WHERE input_id=?",
    )
    .run(other.inputs[0].id, next.inputs[0].id);
  f.reopen();
  await expect(f.repo.read(other.jobId)).rejects.toMatchObject({ code: "INTEGRITY" });
});

it("C3 Activity cold restart/offline list and exact reopen retain all intake and explicit lineage with zero writes", async () => {
  const f = fixture(true, true);
  expect(await f.repo.list()).toEqual([]);
  const accepted = f.request(1),
    partial = f.request(3, randomUUID()),
    pending = f.request(1);
  await f.repo.submit(accepted, f.sources(accepted));
  const sources = f.sources(partial);
  sources.set(partial.inputs[1].id, async () => {
    throw new LocalCaptureError("READER_FAILURE");
  });
  sources.delete(partial.inputs[2].id);
  await f.repo.submit(partial, sources);
  await f.repo.register(pending);
  const next = f.request(1);
  next.inputs[0].continuesFromInputId = pending.inputs[0].id;
  await f.repo.register(next, { [pending.inputs[0].id]: 1 });
  const rows = () =>
    f.sql
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map(({ name }) => [
        name,
        f.sql.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all(),
      ]);
  const before = rows();
  f.reopen();
  const write = vi.spyOn(f.db, "runAsync");
  const list = await f.repo.list({ limit: 2 });
  const older = await f.repo.list({
    limit: 2,
    before: { createdAt: list[1].batch.createdAt, batchId: list[1].batch.batchId },
  });
  expect([...list, ...older].map((j) => j.batch.batchId)).toEqual(
    [accepted, partial, pending, next]
      .map((r) => r.batchId)
      .sort()
      .reverse(),
  );
  expect(new Set([...list, ...older].map((j) => j.batch.jobId)).size).toBe(4);
  expect((await f.repo.reopen(partial.jobId)).counts).toEqual({
    selected: 3,
    accepted: 1,
    failed: 1,
    pending: 1,
  });
  expect((await f.repo.reopen(pending.jobId)).inputs[0].continuedIn).toEqual([
    { jobId: next.jobId, inputId: next.inputs[0].id },
  ]);
  expect((await f.repo.reopen(next.jobId)).inputs[0].continuesFromJobId).toBe(
    pending.jobId,
  );
  for (const entry of [...list, ...older]) {
    expect((await f.repo.reopen(entry.batch.jobId)).batch.jobId).toBe(entry.batch.jobId);
    expect(entry.processing.capability).toBe("NOT_INSTALLED");
    expect(entry.results).toEqual({
      admittedCreates: 0,
      admittedUpdates: 0,
      currentAttention: null,
    });
    expect(entry.availableActions.canReviewNow).toBe(false);
  }
  await f.switchTo(b);
  expect(await f.repo.list()).toEqual([]);
  await expect(f.repo.reopen(accepted.jobId)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await f.switchTo(a);
  expect((await f.repo.reopen(accepted.jobId)).allInputsAccepted).toBe(true);
  expect(write).not.toHaveBeenCalled();
  expect(rows()).toEqual(before);
});
it("C3 retained list context never recaptures Account authority across A→B→A", async () => {
  const f = fixture(),
    r = f.request(1);
  await f.repo.register(r);
  const { captureAccountRequestContext } =
    await import("@/data/auth/accountRequestContext");
  const old = await captureAccountRequestContext("", f.getUser);
  await f.switchTo(b);
  await f.switchTo(a);
  await expect(f.repo.list({}, old)).rejects.toThrow("Account changed");
  await expect(f.repo.reopen(r.jobId, old)).rejects.toThrow("Account changed");
  expect((await f.repo.list())[0].batch.jobId).toBe(r.jobId);
});

it("before the forward migration Camera IMAGE fails atomically rather than becoming Files or Photos", async () => {
  const f = fixture(true, false, 63),
    request = f.request(1);
  request.inputs[0].acquisitionSource = "camera";
  request.inputs[0].kind = "IMAGE";
  await expect(f.repo.register(request)).rejects.toThrow();
  expect(f.count("capture_submission_batches")).toBe(0);
  expect(f.count("capture_submission_inputs")).toBe(0);
});

it("forward64 preserves all existing rows, lineage, retention guards and Updates facts before Camera durable cold intake", async () => {
  const f = fixture(true, true, 63);
  const old = f.request(2);
  await f.repo.submit(old, f.sources(old));
  const missing = f.request(1);
  await f.repo.register(missing);
  const recovered = await createCaptureRecoveryAction(
    {
      repository: f.repo,
      getActiveUserId: f.getUser,
      ...deps,
      open: async () => ({ bytes: new Uint8Array([7]) }),
      pick: async () => [
        { source: "files", temporaryUri: "temp://old", name: "old", typeHint: null },
      ],
    },
    missing.jobId,
    missing.inputs[0].id,
    1,
  ).run(vi.fn());
  expect(recovered.inputs[0].continuesFromInputId).toBe(missing.inputs[0].id);
  const failure = f.request(1);
  await f.repo.submit(
    failure,
    new Map([[failure.inputs[0].id, async () => ({ bytes: new Uint8Array() })]]),
  );
  const tables = [
    "capture_submission_batches",
    "capture_submission_inputs",
    "local_capture_inbox",
    "local_capture_payloads",
    "updates_capture_intake",
  ];
  const before = tables.map((table) =>
    f.sql.prepare(`SELECT rowid,* FROM ${table} ORDER BY rowid`).all(),
  );
  expect(before[4]).toHaveLength(1);
  f.sql.exec("BEGIN");
  try {
    f.sql.exec(captureCameraInputsMigration.sql);
    f.sql.exec("COMMIT");
  } catch (error) {
    f.sql.exec("ROLLBACK");
    throw error;
  }
  tables.forEach((table, index) =>
    expect(f.sql.prepare(`SELECT rowid,* FROM ${table} ORDER BY rowid`).all()).toEqual(
      before[index],
    ),
  );
  expect(f.sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  const camera = {
    source: "camera" as const,
    temporaryUri: "temp://shot",
    name: "shot.jpg",
    typeHint: "image/jpeg",
  };
  const session = createCaptureSubmissionSession({
    repository: f.repo,
    getActiveUserId: f.getUser,
    ...deps,
    open: async (selection) => {
      expect(selection.source).toBe("camera");
      return { bytes: new Uint8Array([255, 216, 255, 217]) };
    },
  });
  const job = await session.submit([camera], vi.fn());
  expect(job.inputs[0]).toMatchObject({
    acquisitionSource: "camera",
    kind: "IMAGE",
    state: "ACCEPTED",
  });
  const capture = f.sql
    .prepare("SELECT kind FROM local_capture_inbox WHERE id=?")
    .get(job.inputs[0].captureId!);
  expect(capture?.kind).toBe("IMAGE");
  const count = f.count("capture_submission_batches");
  expect((await session.submit([camera], vi.fn())).batch.jobId).toBe(job.batch.jobId);
  expect(f.count("capture_submission_batches")).toBe(count);
  f.reopen();
  expect((await f.repo.reopen(job.batch.jobId)).inputs[0]).toMatchObject({
    acquisitionSource: "camera",
    state: "ACCEPTED",
  });
  expect((await f.repo.reopen(old.jobId)).allInputsAccepted).toBe(true);
  expect(() =>
    f.sql
      .prepare("DELETE FROM capture_submission_inputs WHERE input_id=?")
      .run(job.inputs[0].id),
  ).toThrow("RETAINED");
  expect(() =>
    f.sql
      .prepare("DELETE FROM local_capture_inbox WHERE id=?")
      .run(job.inputs[0].captureId!),
  ).toThrow("RETAINED");
  expect(() =>
    f.sql
      .prepare(
        "UPDATE capture_submission_inputs SET acquisition_source='photos',row_revision=row_revision+1 WHERE input_id=?",
      )
      .run(job.inputs[0].id),
  ).toThrow();
});

it("Camera recovery keeps Camera provenance and cancellation/foreign provider create no Job", async () => {
  const f = fixture(),
    r = f.request(1);
  r.inputs[0].acquisitionSource = "camera";
  r.inputs[0].kind = "IMAGE";
  await f.repo.register(r);
  const camera = {
    source: "camera" as const,
    temporaryUri: "temp://retake",
    name: "retake.jpg",
    typeHint: "image/jpeg",
  };
  const open = vi.fn(async () => ({ bytes: new Uint8Array([8, 9]) }));
  const action = (
    pick: (
      source: "files" | "photos" | "camera",
    ) => Promise<
      readonly (
        | typeof camera
        | { source: "photos"; temporaryUri: string; name: string; typeHint: string }
      )[]
    >,
  ) =>
    createCaptureRecoveryAction(
      { repository: f.repo, getActiveUserId: f.getUser, ...deps, open, pick },
      r.jobId,
      r.inputs[0].id,
      1,
    ).run(vi.fn());
  expect(
    (
      await action(async (source) => {
        expect(source).toBe("camera");
        return [];
      })
    ).batch.jobId,
  ).toBe(r.jobId);
  await expect(action(async () => [{ ...camera, source: "photos" }])).rejects.toThrow(
    "source does not match",
  );
  expect(f.count("capture_submission_batches")).toBe(1);
  expect(open).not.toHaveBeenCalled();
  const result = await action(async (source) => {
    expect(source).toBe("camera");
    return [camera];
  });
  expect(result.inputs[0]).toMatchObject({
    acquisitionSource: "camera",
    kind: "IMAGE",
    state: "ACCEPTED",
    continuesFromInputId: r.inputs[0].id,
  });
  expect(f.count("capture_submission_batches")).toBe(2);
  const wrong = f.request(1);
  wrong.inputs[0].acquisitionSource = "camera";
  wrong.inputs[0].kind = "FILE";
  await expect(f.repo.register(wrong)).rejects.toThrow();
  expect(f.count("capture_submission_batches")).toBe(2);
  await f.switchTo(b);
  expect(await f.repo.list()).toEqual([]);
  await expect(f.repo.reopen(result.batch.jobId)).rejects.toThrow();
});
it("Camera recovery rejects A→B→A after picker before any new registration or byte read", async () => {
  const f = fixture(),
    r = f.request(1);
  r.inputs[0].acquisitionSource = "camera";
  r.inputs[0].kind = "IMAGE";
  await f.repo.register(r);
  const open = vi.fn(async () => ({ bytes: new Uint8Array([2]) }));
  const pending = createCaptureRecoveryAction(
    {
      repository: f.repo,
      getActiveUserId: f.getUser,
      ...deps,
      open,
      pick: async (_source, acquisitionCurrent) => {
        expect(acquisitionCurrent?.()).toBe(true);
        await f.switchTo(b);
        await f.switchTo(a);
        expect(acquisitionCurrent?.()).toBe(false);
        return [
          {
            source: "camera",
            temporaryUri: "temp://late",
            name: null,
            typeHint: "image/jpeg",
          },
        ];
      },
    },
    r.jobId,
    r.inputs[0].id,
    1,
  ).run(vi.fn());
  await expect(pending).rejects.toThrow("Account changed");
  expect(open).not.toHaveBeenCalled();
  expect(f.count("capture_submission_batches")).toBe(1);
});
it("forward64 failure rolls back the whole copy/swap and restores original51 guards and rows", async () => {
  const f = fixture(true, false, 63),
    r = f.request(2);
  await f.repo.submit(r, f.sources(r));
  const before = f.sql
    .prepare("SELECT rowid,* FROM capture_submission_inputs ORDER BY rowid")
    .all();
  const schema = f.sql
    .prepare(
      "SELECT type,name,sql FROM sqlite_master WHERE name LIKE 'capture_submission_%' ORDER BY name",
    )
    .all();
  f.sql.exec("BEGIN");
  try {
    f.sql.exec(captureCameraInputsMigration.sql);
    f.sql.exec("SELECT intentional_missing_camera_migration_function()");
  } catch {
    f.sql.exec("ROLLBACK");
  }
  expect(
    f.sql.prepare("SELECT rowid,* FROM capture_submission_inputs ORDER BY rowid").all(),
  ).toEqual(before);
  expect(
    f.sql
      .prepare(
        "SELECT type,name,sql FROM sqlite_master WHERE name LIKE 'capture_submission_%' ORDER BY name",
      )
      .all(),
  ).toEqual(schema);
  expect(f.sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  expect(() => f.sql.prepare("DELETE FROM capture_submission_inputs").run()).toThrow(
    "RETAINED",
  );
  const camera = f.request(1);
  camera.inputs[0].acquisitionSource = "camera";
  camera.inputs[0].kind = "IMAGE";
  await expect(f.repo.register(camera)).rejects.toThrow();
  expect(f.count("capture_submission_batches")).toBe(1);
});

it("Camera recovery passes the captured host acquisition lease before a late permission launch", async () => {
  const f = fixture(),
    request = f.request(1);
  request.inputs[0].acquisitionSource = "camera";
  request.inputs[0].kind = "IMAGE";
  await f.repo.register(request);
  let hostEpoch = 1;
  const acquisitionEpoch = hostEpoch;
  const open = vi.fn(async () => ({ bytes: new Uint8Array([1]) }));
  const action = createCaptureRecoveryAction(
    {
      repository: f.repo,
      getActiveUserId: f.getUser,
      ...deps,
      open,
      pick: async (_source, current) => {
        expect(current?.()).toBe(true);
        hostEpoch += 1;
        expect(current?.()).toBe(false);
        return [];
      },
    },
    request.jobId,
    request.inputs[0].id,
    1,
  );
  await expect(action.run(vi.fn(), () => acquisitionEpoch === hostEpoch)).rejects.toThrow(
    "acquisition closed",
  );
  expect(open).not.toHaveBeenCalled();
  expect(f.count("capture_submission_batches")).toBe(1);
});

it("C3 v2 retains typed text plus file and clipboard image in one immutable Batch across cold reopen", async () => {
  const f = fixture(true, true, 73);
  const open = vi.fn(async () => ({ bytes: Buffer.from("synthetic file") }));
  const clipboard = vi.fn(async () => ({ bytes: Buffer.from("synthetic image") }));
  const session = createCaptureSubmissionSession({
    repository: f.repo,
    getActiveUserId: f.getUser,
    ...deps,
    open,
    openClipboard: clipboard,
  });
  const text = "周一去博物馆\nKeep my original wording.";
  const model = await session.submit(
    [
      {
        source: "files",
        temporaryUri: "file:///test",
        name: "trip.pdf",
        typeHint: "application/pdf",
      },
      { source: "magic_input", stagingId: 2, text },
      {
        source: "clipboard",
        stagingId: 3,
        token: randomUUID(),
        temporaryUri: "file:///owned/image.png",
        name: null,
        typeHint: "image/png",
        size: 15,
        availability: "unverified",
      },
    ],
    () => {},
  );
  expect(model.batch.formatVersion).toBe(2);
  expect(model.batch.manifestVersion).toBe(2);
  expect(model.inputs.map((i) => [i.acquisitionSource, i.kind])).toEqual([
    ["files", "FILE"],
    ["magic_input", "TEXT"],
    ["clipboard", "IMAGE"],
  ]);
  expect(model.counts).toEqual({ selected: 3, accepted: 3, failed: 0, pending: 0 });
  const textInput = model.inputs[1];
  const bytes = f.sql
    .prepare("SELECT bytes FROM local_capture_payloads WHERE account_id=? AND id=?")
    .get(a, textInput.payloadId!)!.bytes as Uint8Array;
  expect(Buffer.from(bytes).toString("utf8")).toBe(text);
  expect(open).toHaveBeenCalledOnce();
  expect(clipboard).toHaveBeenCalledOnce();
  f.reopen();
  const cold = await f.repo.reopen(model.batch.jobId);
  expect(cold.batch).toEqual(model.batch);
  expect(cold.inputs).toEqual(model.inputs);
});

it.each([false, true])(
  "SQLite73 preserves old v1 Sources, pending Queue, immutable payloads, rowids and cold read (rollback=%s)",
  async (rollback) => {
    const f = fixture(true, true, 72),
      request = f.request(1);
    const old = await f.repo.submit(request, f.sources(request), () => {}),
      input = old.inputs[0];
    const source = randomUUID(),
      trip = randomUUID(),
      binding = randomUUID(),
      operation = randomUUID();
    f.sql.exec("BEGIN");
    f.sql
      .prepare(
        "INSERT INTO trip_sources(cache_account_id,id,trip_id,acquired_by,acquisition_key,source_kind,acquisition_channel,capture_time_basis,acquisition_sha256,current_material_revision,row_revision) VALUES(?,?,?,?,?,'FILE','FILES','UNKNOWN',?,1,1)",
      )
      .run(a, source, trip, a, source, input.contentSha256!);
    f.sql
      .prepare(
        "INSERT INTO trip_source_revisions(cache_account_id,source_id,material_revision,created_by,operation_key,capture_sha256,original_representation_ids,completeness,reason) VALUES(?,?,1,?,?,?,?,'AS_SUPPLIED','ACQUISITION')",
      )
      .run(a, source, a, source, input.contentSha256!, JSON.stringify([randomUUID()]));
    f.sql.exec("COMMIT");
    f.sql
      .prepare(
        "INSERT INTO local_capture_source_bindings(account_id,id,admission_key,capture_id,capture_revision,capture_payload_id,material_sha256,byte_count,trip_id,intent_kind,source_id,representation_id,material_revision,expected_source_revision,created_at) VALUES(?,?,?,?,CAST(? AS INTEGER),?,?,CAST(? AS INTEGER),?,'REUSE',?,?,1,1,?)",
      )
      .run(
        a,
        binding,
        binding,
        input.captureId!,
        input.captureRevision!,
        input.payloadId!,
        input.contentSha256!,
        input.contentByteCount!,
        trip,
        source,
        randomUUID(),
        deps.now(),
      );
    f.sql
      .prepare(
        "INSERT INTO sync_operations(id,owner_user_id,entity_type,entity_id,operation_type,idempotency_key,payload_json,status,attempt_count,created_at,updated_at) VALUES(?,?,'CAPTURE_SUBMISSION_INPUT',?,'CAPTURE_PROCESSING_VALIDATE',?,'{}','PENDING',0,?,?)",
      )
      .run(operation, a, input.id, operation, deps.now(), deps.now());
    f.sql.exec(
      "CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL)",
    );
    for (const m of migrations.filter((m) => m.id <= 72))
      f.sql
        .prepare("INSERT INTO schema_migrations VALUES(?,?,?)")
        .run(m.id, m.name, deps.now());
    const tables = [
      "capture_submission_batches",
      "capture_submission_inputs",
      "local_capture_inbox",
      "local_capture_payloads",
      "trip_sources",
      "local_capture_source_bindings",
      "sync_operations",
      "capture_processing_events",
    ];
    const snapshot = () =>
      tables.map((t) => f.sql.prepare(`SELECT rowid,* FROM ${t} ORDER BY rowid`).all());
    const before = snapshot();
    const adapter = {
      ...f.db,
      async execAsync(q: string) {
        f.sql.exec(q);
        if (rollback && q === migrations.find((m) => m.id === 73)!.sql)
          throw Error("INJECTED_MIGRATION_FAILURE");
      },
    };
    if (rollback)
      await expect(runMigrations(adapter)).rejects.toThrow("INJECTED_MIGRATION_FAILURE");
    else await runMigrations(adapter);
    expect(snapshot()).toEqual(before);
    expect(f.sql.prepare("PRAGMA foreign_keys").get()!.foreign_keys).toBe(1);
    expect(f.sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(f.sql.prepare("SELECT MAX(id) AS id FROM schema_migrations").get()!.id).toBe(
      rollback ? 72 : migrations.at(-1)!.id,
    );
    f.reopen();
    expect((await f.repo.reopen(request.jobId)).batch).toEqual(request);
    expect(
      f.sql.prepare("SELECT status FROM sync_operations WHERE id=?").get(operation)!
        .status,
    ).toBe("PENDING");
  },
);

it("mixed provenance requires explicit C3v2; old v1 and mixed header versions reject before writes", async () => {
  const f = fixture(true, true, 73),
    base = f.request(1);
  const input = {
    ...base.inputs[0],
    acquisitionSource: "magic_input" as const,
    kind: "TEXT" as const,
    originalFilename: null,
    declaredContentType: "text/plain",
  };
  expect(submissionRequestSchema.safeParse({ ...base, inputs: [input] }).success).toBe(
    false,
  );
  expect(
    submissionRequestSchema.safeParse({ ...base, formatVersion: 2, inputs: [input] })
      .success,
  ).toBe(false);
  expect(
    submissionRequestSchema.safeParse({
      ...base,
      formatVersion: 2,
      manifestVersion: 2,
      inputs: [{ ...input, kind: "IMAGE" }],
    }).success,
  ).toBe(false);
  expect(
    f.sql.prepare("SELECT count(*) AS n FROM capture_submission_batches").get()!.n,
  ).toBe(0);
});
