import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { migrations } from "@/data/db/migrations";
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
import type { SubmissionRequest } from "@/domain/capture/captureSubmission";
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
function fixture(fk = true, disk = false, version = 51) {
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
it("recovery action registers new lineage only for unpinned original; pinned exact resume stays same Job", async () => {
  const f = fixture(),
    r = f.request(1);
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
    r = f.request(1);
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
