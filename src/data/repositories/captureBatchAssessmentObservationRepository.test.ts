import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { migrations } from "@/data/db/migrations";
import { runMigrations } from "@/data/db/migrationRunner";
import { serializeDatabaseTransactions } from "@/data/db/databaseConnection";
import {
  beginAccountTransition,
  endAccountTransition,
  captureAccountRequestContext,
} from "@/data/auth/accountRequestContext";
import { createCaptureSubmissionRepository } from "./captureSubmissionRepository";
import {
  createCaptureBatchAssessmentObservationRepository,
  type AssessmentHead,
} from "./captureBatchAssessmentObservationRepository";
import {
  createLocalCaptureInboxRepository,
  type LocalCaptureDatabase,
} from "./localCaptureInboxRepository";
import {
  type SubmissionRequest,
  canonicalSubmission,
  boundedSubmissionJson,
} from "@/domain/capture/captureSubmission";
import {
  assessCaptureBatch,
  type CaptureProcessingSnapshot,
  type CaptureIntakeManifest,
} from "@/domain/capture/batchAssessment";
import {
  observationJson,
  validateAssessmentObservation,
  ASSESSMENT_BODY_BYTES,
} from "@/domain/capture/batchAssessmentObservation";
import { importDigest } from "@/domain/trip/flightImportReview";
import type { Json } from "@/domain/trip/eventIntentJson";
const sha256 = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
type Run = (
  q: string,
  ...args: unknown[]
) => ReturnType<LocalCaptureDatabase["runAsync"]>;
const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((fn) => fn()));
const empty: AssessmentHead = { revision: 0, bodySha256: null };
async function fixture(fk = true, version = 52) {
  const dir = mkdtempSync(join(tmpdir(), "otr-p2bb-")),
    path = join(dir, "local.db");
  let sql = new DatabaseSync(path),
    account: string = randomUUID();
  sql.exec(`PRAGMA foreign_keys=${fk ? "ON" : "OFF"}`);
  for (const m of migrations.filter((m) => m.id <= version)) sql.exec(m.sql);
  const db: LocalCaptureDatabase = serializeDatabaseTransactions({
    async getFirstAsync<T>(q: string, ...args: unknown[]) {
      return (sql.prepare(q).get(...(args as never[])) ?? null) as T | null;
    },
    async getAllAsync<T>(q: string, ...args: unknown[]) {
      return sql.prepare(q).all(...(args as never[])) as T[];
    },
    async runAsync(q: string, ...args: unknown[]) {
      const r = sql.prepare(q).run(...(args as never[]));
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
  const getUser = async () => account;
  // Explicitly TEST-ONLY validator: enforces repository invocation, certifies no real processing ownership.
  const owning = vi.fn(async () => {}),
    deps = {
      sha256,
      newId: randomUUID,
      now: () => "2026-10-08T00:00:00.000Z",
      assertCurrentOwningData: owning,
    };
  const batchId = randomUUID(),
    contextId = randomUUID();
  const request: SubmissionRequest = {
    formatVersion: 1,
    manifestVersion: 1,
    accountId: account,
    batchId,
    jobId: randomUUID(),
    submissionKey: randomUUID(),
    createdAt: deps.now(),
    context: {
      id: contextId,
      version: 1,
      accountId: account,
      batchId,
      observedAt: deps.now(),
      clock: "DEVICE_WALL",
      entrySurface: "CAPTURE",
      tripPrior: null,
    },
    inputs: [
      {
        id: randomUUID(),
        itemKey: randomUUID(),
        ordinal: 0,
        acquisitionSource: "files",
        kind: "FILE",
        originalFilename: "旅程.pdf",
        declaredContentType: null,
        continuesFromInputId: null,
      },
    ],
  };
  const c2 = createCaptureSubmissionRepository(db, getUser, deps);
  await c2.register(request);
  const repo = () => createCaptureBatchAssessmentObservationRepository(db, getUser, deps);
  const context = () => captureAccountRequestContext("", getUser);
  const c2Rows = () =>
    observationJson({
      headers: sql.prepare("SELECT * FROM capture_submission_batches").all(),
      inputs: sql.prepare("SELECT * FROM capture_submission_inputs").all(),
    });
  async function body(head = empty) {
    const model = await c2.read(request.jobId);
    const contextSha256 = await importDigest(
      "otr-capture-context-v1",
      request.context as Json,
      sha256,
    );
    const manifest: CaptureIntakeManifest = {
      version: 1,
      accountId: request.accountId,
      batchId,
      jobId: request.jobId,
      submissionKey: request.submissionKey,
      contextSnapshotId: contextId,
      contextSha256,
      tripPriorId: null,
      manifestVersion: 1,
      inputs: request.inputs.map((i) => ({
        inputId: i.id,
        replayKey: i.itemKey,
        ordinal: i.ordinal,
        continuesFromInputId: i.continuesFromInputId,
      })),
    };
    const snapshot: CaptureProcessingSnapshot = {
      version: 1,
      accountId: request.accountId,
      batchId,
      jobId: request.jobId,
      manifestVersion: 1,
      manifestSha256: await importDigest(
        "otr-capture-intake-manifest-v1",
        manifest as Json,
        sha256,
      ),
      assessmentRevision: head.revision + 1,
      inputs: model.inputs.map((i) => ({
        inputId: i.id,
        observedRevision: i.revision,
        acquisition:
          i.state === "ACCEPTED"
            ? {
                state: "ACCEPTED",
                original: {
                  captureId: i.captureId!,
                  payloadId: i.payloadId!,
                  revision: i.captureRevision!,
                  sha256: i.contentSha256!,
                  byteCount: i.contentByteCount!,
                },
              }
            : { state: i.state },
        processing: i.state === "ACCEPTED" ? "PENDING" : "NOT_APPLICABLE",
        bindings: [],
      })),
      findings: [],
      decisions: [],
      historicalEvidence: [],
    };
    const current = {
      accountId: request.accountId,
      batchId,
      jobId: request.jobId,
      manifestVersion: 1,
      manifestSha256: snapshot.manifestSha256,
      assessmentRevision: snapshot.assessmentRevision,
      snapshotSha256: await importDigest(
        "otr-capture-processing-snapshot-v1",
        snapshot as Json,
        sha256,
      ),
      inputRevisions: snapshot.inputs.map((i) => ({
        inputId: i.inputId,
        revision: i.observedRevision,
      })),
    };
    return observationJson({
      version: 1,
      c2RequestSha256: await sha256(
        new TextEncoder().encode(canonicalSubmission(request)),
      ),
      c2ManifestSha256: await sha256(
        new TextEncoder().encode(boundedSubmissionJson(request.inputs)),
      ),
      contextSha256,
      parentBodySha256: head.bodySha256,
      manifest,
      snapshot,
      envelope: await assessCaptureBatch(
        observationJson({ manifest, snapshot, current }),
        sha256,
      ),
    });
  }
  cleanup.push(() => {
    sql.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    db,
    path,
    deps,
    owning,
    repo,
    context,
    body,
    request,
    c2,
    c2Rows,
    get sql() {
      return sql;
    },
    reopen() {
      sql.close();
      sql = new DatabaseSync(path);
      sql.exec(`PRAGMA foreign_keys=${fk ? "ON" : "OFF"}`);
    },
    async switchTo(next: string) {
      const lease = await beginAccountTransition();
      account = next;
      endAccountTransition(lease);
    },
    count() {
      return sql
        .prepare("SELECT count(*) AS n FROM capture_batch_assessment_observations")
        .get()!.n as number;
    },
  };
}
async function append(f: Awaited<ReturnType<typeof fixture>>, head = empty) {
  const raw = await f.body(head),
    result = await f.repo().append(await f.context(), head, raw);
  expect(result.status).toBe("APPENDED");
  const verified = await validateAssessmentObservation(raw, sha256);
  return { raw, head: { revision: head.revision + 1, bodySha256: verified.bodySha256 } };
}
describe("dormant observation SQLite persistence; owning validators are TEST-ONLY", () => {
  it.each([true, false])(
    "fresh52 / populated51→52 keeps C2 exact and four guards FK=%s",
    async (fk) => {
      const f = await fixture(fk, 51),
        prior = f.c2Rows();
      f.sql.exec(migrations.at(-1)!.sql);
      expect(f.c2Rows()).toBe(prior);
      expect(
        f.sql
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'capture_assessment_%'",
          )
          .all(),
      ).toHaveLength(4);
      expect(
        f.sql
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='capture_batch_assessment_observations'",
          )
          .all(),
      ).toHaveLength(1);
      const one = await append(f);
      expect(f.c2Rows()).toBe(prior);
      f.reopen();
      expect(
        (await f.repo().readExact(await f.context(), f.request.batchId, 1)).status,
      ).toBe("FOUND");
      expect(() =>
        f.sql.exec("DELETE FROM capture_batch_assessment_observations"),
      ).toThrow("C4_OBSERVATION_RETAINED");
      expect(() =>
        f.sql.exec(
          "UPDATE capture_batch_assessment_observations SET body_json=body_json",
        ),
      ).toThrow("C4_OBSERVATION_IMMUTABLE");
      expect(() =>
        f.sql
          .prepare("DELETE FROM capture_submission_batches WHERE batch_id=?")
          .run(f.request.batchId),
      ).toThrow();
      expect(f.sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      expect((await f.repo().append(await f.context(), empty, one.raw)).status).toBe(
        "EXACT_REPLAY",
      );
      expect(f.count()).toBe(1);
    },
  );
  it("CAS competing writers, immutable exact replay after newer head, changed intent conflicts", async () => {
    const f = await fixture(),
      raw = await f.body(),
      c = await f.context();
    const result = await Promise.all([
      f.repo().append(c, empty, raw),
      f.repo().append(c, empty, raw),
    ]);
    expect(result.map((r) => r.status)).toEqual(["APPENDED", "EXACT_REPLAY"]);
    expect(f.count()).toBe(1);
    const one = await validateAssessmentObservation(raw, sha256),
      head = { revision: 1, bodySha256: one.bodySha256 };
    await append(f, head);
    f.owning.mockRejectedValue(new Error("current publication changed"));
    expect((await f.repo().append(c, empty, raw)).status).toBe("EXACT_REPLAY");
    expect(f.count()).toBe(2);
    const changed = JSON.parse(raw);
    changed.snapshot.inputs[0].acquisition.state = "UNKNOWN";
    const snapshot = changed.snapshot;
    changed.envelope = await assessCaptureBatch(
      observationJson({
        manifest: changed.manifest,
        snapshot,
        current: {
          accountId: changed.manifest.accountId,
          batchId: changed.manifest.batchId,
          jobId: changed.manifest.jobId,
          manifestVersion: 1,
          manifestSha256: snapshot.manifestSha256,
          assessmentRevision: 1,
          snapshotSha256: await importDigest(
            "otr-capture-processing-snapshot-v1",
            snapshot,
            sha256,
          ),
          inputRevisions: snapshot.inputs.map(
            (i: { inputId: string; observedRevision: number }) => ({
              inputId: i.inputId,
              revision: i.observedRevision,
            }),
          ),
        },
      }),
      sha256,
    );
    expect((await f.repo().append(c, empty, observationJson(changed))).status).toBe(
      "REVISION_CONFLICT",
    );
    const wrong = { revision: 2, bodySha256: "f".repeat(64) };
    expect((await f.repo().append(c, wrong, await f.body(wrong))).status).toBe(
      "HEAD_CONFLICT",
    );
  });
  it.each(["missing", "reject", "C2-after-validator"])(
    "NEW denies mandatory owning freshness %s with zero writes",
    async (kind) => {
      const f = await fixture(),
        raw = await f.body();
      if (kind === "missing") Reflect.deleteProperty(f.deps, "assertCurrentOwningData");
      if (kind === "reject") f.owning.mockRejectedValue(new Error("UNAVAILABLE"));
      if (kind === "C2-after-validator")
        f.owning.mockImplementation(async () => {
          f.sql.exec(
            "UPDATE capture_submission_inputs SET row_revision=row_revision+1,pending_reason='REACQUIRE'",
          );
        });
      expect((await f.repo().append(await f.context(), empty, raw)).status).toBe(
        "STALE_OBSERVATION",
      );
      expect(f.count()).toBe(0);
    },
  );
  it("fences A→B→A and cold fresh context, reads produce no C2/store writes", async () => {
    const f = await fixture(),
      c = await f.context(),
      one = await append(f),
      rows = f.c2Rows();
    await f.switchTo(randomUUID());
    expect(
      (await f.repo().readExact(await f.context(), f.request.batchId, 1)).status,
    ).toBe("UNAVAILABLE");
    expect((await f.repo().append(c, empty, one.raw)).status).toBe("OUTCOME_UNKNOWN");
    await f.switchTo(f.request.accountId);
    expect((await f.repo().readHead(c, f.request.batchId)).status).toBe("UNAVAILABLE");
    f.reopen();
    expect((await f.repo().readHead(await f.context(), f.request.batchId)).status).toBe(
      "HEALTHY",
    );
    expect(f.c2Rows()).toBe(rows);
    expect(f.count()).toBe(1);
  });
  it.each([1, 2, 3])(
    "corrupt revision%s blocks NEW and labels valid prefix historical after cold restart",
    async (revision) => {
      const f = await fixture(),
        one = await append(f),
        two = await append(f, one.head),
        three = await append(f, two.head),
        next = await f.body(three.head);
      f.sql.exec("DROP TRIGGER capture_assessment_no_update");
      f.sql
        .prepare(
          "UPDATE capture_batch_assessment_observations SET body_sha256=? WHERE assessment_revision=?",
        )
        .run("f".repeat(64), revision);
      f.reopen();
      expect(await f.repo().readHead(await f.context(), f.request.batchId)).toMatchObject(
        {
          status: "INTEGRITY_BLOCKED",
          head: { revision: revision - 1 },
          historicalOnly: true,
        },
      );
      expect((await f.repo().append(await f.context(), three.head, next)).status).toBe(
        "INTEGRITY_BLOCKED",
      );
      if (revision > 1)
        expect(
          await f.repo().readExact(await f.context(), f.request.batchId, 1),
        ).toMatchObject({
          status: "FOUND",
          chainStatus: "INTEGRITY_BLOCKED",
          historicalOnly: true,
        });
      expect(f.count()).toBe(3);
    },
  );
  it("missing middle, unsupported format and read failure never imply absence or successful empty history", async () => {
    const f = await fixture(),
      one = await append(f);
    await append(f, one.head);
    f.sql.exec(
      "DROP TRIGGER capture_assessment_no_delete;DELETE FROM capture_batch_assessment_observations WHERE assessment_revision=1",
    );
    expect(
      (await f.repo().readExact(await f.context(), f.request.batchId, 1)).status,
    ).toBe("INTEGRITY_BLOCKED");
    f.db.getAllAsync = async () => {
      throw new Error("IOERR");
    };
    expect((await f.repo().readHead(await f.context(), f.request.batchId)).status).toBe(
      "UNAVAILABLE",
    );
  });
  it.each(["COMMIT-ACK", "INSERT", "IOERR"])(
    "lost/faulted %s retains exact intent and cold recovery",
    async (stage) => {
      const f = await fixture(),
        raw = await f.body(),
        prior = f.c2Rows();
      if (stage === "COMMIT-ACK") {
        const run = f.db.withTransactionAsync.bind(f.db);
        f.db.withTransactionAsync = async (work) => {
          await run(work);
          throw new Error("ACK lost");
        };
      } else {
        const run = f.db.runAsync.bind(f.db) as Run;
        f.db.runAsync = async (q, ...args) => {
          if (q.includes("INSERT INTO capture_batch_assessment")) throw new Error(stage);
          return run(q, ...args);
        };
      }
      expect((await f.repo().append(await f.context(), empty, raw)).status).toBe(
        "OUTCOME_UNKNOWN",
      );
      f.reopen();
      expect(
        (await f.repo().readExact(await f.context(), f.request.batchId, 1)).status,
      ).toBe(stage === "COMMIT-ACK" ? "UNAVAILABLE" : "ABSENT");
      expect(f.count()).toBe(stage === "COMMIT-ACK" ? 1 : 0);
      expect(f.c2Rows()).toBe(prior);
    },
  );
  it("COMMIT lost ACK can recover and replay on restored transaction seam", async () => {
    const f = await fixture(),
      raw = await f.body(),
      run = f.db.withTransactionAsync.bind(f.db);
    f.db.withTransactionAsync = async (work) => {
      await run(work);
      throw new Error("ACK lost");
    };
    expect((await f.repo().append(await f.context(), empty, raw)).status).toBe(
      "OUTCOME_UNKNOWN",
    );
    f.db.withTransactionAsync = run;
    f.reopen();
    expect(
      (await f.repo().readExact(await f.context(), f.request.batchId, 1)).status,
    ).toBe("FOUND");
    expect((await f.repo().append(await f.context(), empty, raw)).status).toBe(
      "EXACT_REPLAY",
    );
    expect(f.count()).toBe(1);
  });
  it("oversized UTF8 rejects before SQL; accepted CP11 originals and intake remain unchanged", async () => {
    const f = await fixture();
    await f.c2.submit(
      f.request,
      new Map([
        [f.request.inputs[0].id, async () => ({ bytes: new Uint8Array([1, 2, 3]) })],
      ]),
    );
    const before = f.c2Rows();
    const run = vi.spyOn(f.db, "runAsync");
    expect(
      (
        await f
          .repo()
          .append(await f.context(), empty, "é".repeat(ASSESSMENT_BODY_BYTES / 2) + "a")
      ).status,
    ).toBe("RECORD_TOO_LARGE");
    expect(run).not.toHaveBeenCalled();
    expect(f.c2Rows()).toBe(before);
    await append(f);
    expect(f.c2Rows()).toBe(before);
  });
  it("real disposable FULL retains old head and C2 history after reopen", async () => {
    const f = await fixture();
    await f.c2.submit(
      f.request,
      new Map([
        [f.request.inputs[0].id, async () => ({ bytes: new Uint8Array([1, 2, 3]) })],
      ]),
    );
    const one = await append(f),
      raw = await f.body(one.head),
      before = f.c2Rows();
    const pages = f.sql.prepare("PRAGMA page_count").get()!.page_count as number;
    f.sql.exec(`PRAGMA max_page_count=${pages}`);
    // Force failure on the observation INSERT using SQLite's actual FULL condition.
    const run = f.db.runAsync.bind(f.db) as Run;
    f.db.runAsync = async (q, ...args) => {
      if (q.includes("INSERT INTO capture_batch_assessment")) {
        f.sql.exec("CREATE TABLE full_probe(data BLOB)");
        f.sql.exec("INSERT INTO full_probe VALUES(zeroblob(10485760))");
      }
      return run(q, ...args);
    };
    expect((await f.repo().append(await f.context(), one.head, raw)).status).toBe(
      "OUTCOME_UNKNOWN",
    );
    f.reopen();
    expect(f.count()).toBe(1);
    expect(f.c2Rows()).toBe(before);
    expect(await f.repo().readHead(await f.context(), f.request.batchId)).toMatchObject({
      status: "HEALTHY",
      head: one.head,
    });
  });
  it.each([true, false])(
    "migration runner52 DDL/history rollback is atomic FK=%s",
    async (fk) => {
      const f = await fixture(fk, 51);
      f.sql.exec(
        "CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY,name TEXT,applied_at TEXT)",
      );
      for (const m of migrations.filter((m) => m.id <= 51))
        f.sql
          .prepare("INSERT INTO schema_migrations VALUES(?,?,?)")
          .run(m.id, m.name, "original");
      const before = f.c2Rows();
      const adapter = {
        ...f.db,
        execAsync: async (q: string) => {
          f.sql.exec(q);
        },
        runAsync: async (q: string, ...args: unknown[]) => {
          if (q.includes("INSERT INTO schema_migrations"))
            throw new Error("history failure");
          return (f.db.runAsync as Run)(q, ...args);
        },
      };
      await expect(runMigrations(adapter)).rejects.toThrow("history failure");
      expect(
        f.sql
          .prepare(
            "SELECT name FROM sqlite_master WHERE name='capture_batch_assessment_observations'",
          )
          .get(),
      ).toBeUndefined();
      expect(f.sql.prepare("SELECT max(id) AS id FROM schema_migrations").get()!.id).toBe(
        51,
      );
      expect(f.c2Rows()).toBe(before);
      adapter.runAsync = f.db.runAsync.bind(f.db) as Run;
      await runMigrations(adapter);
      await runMigrations(adapter);
      expect(f.sql.prepare("SELECT max(id) AS id FROM schema_migrations").get()!.id).toBe(
        52,
      );
      expect(f.c2Rows()).toBe(before);
    },
  );
});

it("separate WAL connection wins; stale repository snapshot cannot allocate or blindly rebase", async () => {
  const f = await fixture();
  f.sql.exec("PRAGMA journal_mode=WAL;PRAGMA busy_timeout=0");
  const other = new DatabaseSync(f.path);
  other.exec("PRAGMA foreign_keys=ON;PRAGMA busy_timeout=0");
  cleanup.push(() => other.close());
  const raw = await f.body(),
    verified = await validateAssessmentObservation(raw, sha256),
    body = verified.body;
  f.owning.mockImplementation(async () => {
    other
      .prepare(
        "INSERT INTO capture_batch_assessment_observations VALUES(?,?,?,1,1,?,?,?,?,?,?)",
      )
      .run(
        f.request.accountId,
        f.request.batchId,
        f.request.jobId,
        body.c2ManifestSha256,
        body.snapshot.manifestSha256,
        body.envelope.snapshotSha256,
        verified.bodySha256,
        null,
        raw,
      );
  });
  expect((await f.repo().append(await f.context(), empty, raw)).status).toBe(
    "OUTCOME_UNKNOWN",
  );
  expect(f.count()).toBe(1);
  expect((await f.repo().append(await f.context(), empty, raw)).status).toBe(
    "EXACT_REPLAY",
  );
  expect(f.owning).toHaveBeenCalledTimes(1);
});
it.each([0, 1, 2, 3, 4])(
  "migration52 fails after DDL chunk%s and rolls back every new object/history",
  async (stage) => {
    const f = await fixture(true, 51);
    f.sql.exec(
      "CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY,name TEXT,applied_at TEXT)",
    );
    for (const m of migrations.filter((m) => m.id <= 51))
      f.sql
        .prepare("INSERT INTO schema_migrations VALUES(?,?,?)")
        .run(m.id, m.name, "original");
    const before = f.c2Rows();
    const adapter = {
      ...f.db,
      execAsync: async (q: string) => {
        if (!q.includes("CREATE TABLE capture_batch_assessment_observations")) {
          f.sql.exec(q);
          return;
        }
        const chunks = q.split(/(?=CREATE TRIGGER)/);
        for (const [n, chunk] of chunks.entries()) {
          f.sql.exec(chunk);
          if (n === stage) throw new Error("DDL failure");
        }
      },
    };
    await expect(runMigrations(adapter)).rejects.toThrow("DDL failure");
    expect(
      f.sql
        .prepare(
          "SELECT name FROM sqlite_master WHERE name LIKE 'capture_assessment_%' OR name='capture_batch_assessment_observations'",
        )
        .all(),
    ).toEqual([]);
    expect(f.sql.prepare("SELECT max(id) AS id FROM schema_migrations").get()!.id).toBe(
      51,
    );
    expect(f.c2Rows()).toBe(before);
  },
);
it.each(["format", "storage", "body", "C2"])(
  "corrupt %s is unavailable/blocked and never repaired",
  async (kind) => {
    const f = await fixture(),
      one = await append(f);
    f.sql.exec(
      "DROP TRIGGER capture_assessment_no_update;PRAGMA ignore_check_constraints=ON",
    );
    if (kind === "format")
      f.sql.exec("UPDATE capture_batch_assessment_observations SET format_version=2");
    if (kind === "storage")
      f.sql.exec(
        "UPDATE capture_batch_assessment_observations SET assessment_revision='1'",
      );
    if (kind === "body")
      f.sql.exec("UPDATE capture_batch_assessment_observations SET body_json='{}'");
    if (kind === "C2") {
      f.sql.exec("DROP TRIGGER capture_submission_header_update");
      f.sql.exec("UPDATE capture_submission_batches SET context_json='{}'");
    }
    const before = f.count();
    expect(["INTEGRITY_BLOCKED", "UNAVAILABLE"]).toContain(
      (await f.repo().readHead(await f.context(), f.request.batchId)).status,
    );
    expect(
      (
        await f
          .repo()
          .append(
            await f.context(),
            one.head,
            await f.body(one.head).catch(() => one.raw),
          )
      ).status,
    ).not.toBe("APPENDED");
    expect(f.count()).toBe(before);
  },
);
it("post-COMMIT Account switch yields UNKNOWN; fresh A can recover exact retained row", async () => {
  const f = await fixture(),
    raw = await f.body(),
    context = await f.context(),
    run = f.db.withTransactionAsync.bind(f.db);
  let switchOnce = true;
  f.db.withTransactionAsync = async (work) => {
    await run(work);
    if (switchOnce) {
      switchOnce = false;
      void f.switchTo(randomUUID());
    }
  };
  expect((await f.repo().append(context, empty, raw)).status).toBe("OUTCOME_UNKNOWN");
  await f.switchTo(f.request.accountId);
  f.db.withTransactionAsync = run;
  f.reopen();
  expect((await f.repo().readExact(await f.context(), f.request.batchId, 1)).status).toBe(
    "FOUND",
  );
  expect(f.count()).toBe(1);
});
it("failed rollback outcome remains UNKNOWN; closing file rolls back uncommitted observation", async () => {
  const f = await fixture(),
    raw = await f.body();
  f.db.withTransactionAsync = async (work) => {
    f.sql.exec("BEGIN");
    await work();
    throw new Error("IOERR commit/rollback unavailable");
  };
  expect((await f.repo().append(await f.context(), empty, raw)).status).toBe(
    "OUTCOME_UNKNOWN",
  );
  f.reopen();
  expect(f.count()).toBe(0);
});
it("SQL bound is inclusive bytes and insert guards reject gap/wrong Job/parent/Account FK OFF", async () => {
  const f = await fixture(false);
  const raw = await f.body(),
    verified = await validateAssessmentObservation(raw, sha256),
    body = verified.body;
  const insert = (
    account = f.request.accountId,
    job = f.request.jobId,
    revision = 1,
    parent: string | null = null,
    json = raw,
  ) =>
    f.sql
      .prepare(
        "INSERT INTO capture_batch_assessment_observations VALUES(?,?,?,1,CAST(? AS INTEGER),?,?,?,?,?,?)",
      )
      .run(
        account,
        f.request.batchId,
        job,
        revision,
        body.c2ManifestSha256,
        body.snapshot.manifestSha256,
        body.envelope.snapshotSha256,
        verified.bodySha256,
        parent,
        json,
      );
  expect(() =>
    insert(f.request.accountId, f.request.jobId, 2, verified.bodySha256),
  ).toThrow("C4_OBSERVATION_REVISION");
  expect(() => insert(f.request.accountId, randomUUID())).toThrow(
    "C4_OBSERVATION_C2_BINDING",
  );
  expect(() => insert(randomUUID())).toThrow("C4_OBSERVATION_C2_BINDING");
  const prefix = `{"c2RequestSha256":"${body.c2RequestSha256}","pad":"`,
    suffix = '"}';
  const exact =
    prefix + "a".repeat(ASSESSMENT_BODY_BYTES - prefix.length - suffix.length) + suffix;
  expect(() =>
    insert(f.request.accountId, f.request.jobId, 1, null, exact + " "),
  ).toThrow(/CHECK/);
  insert(f.request.accountId, f.request.jobId, 1, null, exact);
  expect(f.count()).toBe(1);
  expect((await f.repo().readHead(await f.context(), f.request.batchId)).status).toBe(
    "INTEGRITY_BLOCKED",
  );
});
it("Account switch during body hashing denies NEW; overflow never allocates a revision", async () => {
  const f = await fixture(),
    raw = await f.body(),
    context = await f.context();
  let switched = false;
  f.deps.sha256 = async (bytes) => {
    if (!switched) {
      switched = true;
      await f.switchTo(randomUUID());
    }
    return sha256(bytes);
  };
  expect((await f.repo().append(context, empty, raw)).status).toBe("OUTCOME_UNKNOWN");
  expect(f.count()).toBe(0);
  await f.switchTo(f.request.accountId);
  expect(
    (
      await f
        .repo()
        .append(
          await f.context(),
          { revision: Number.MAX_SAFE_INTEGER, bodySha256: "a".repeat(64) },
          raw,
        )
    ).status,
  ).toBe("HEAD_CONFLICT");
  expect(f.count()).toBe(0);
});
it("historical C2 Input revision advancement does not invalidate exact immutable replay", async () => {
  const f = await fixture(),
    one = await append(f);
  f.sql.exec(
    "UPDATE capture_submission_inputs SET row_revision=row_revision+1,pending_reason='REACQUIRE'",
  );
  f.owning.mockRejectedValue(new Error("current owning evidence unavailable"));
  expect((await f.repo().readExact(await f.context(), f.request.batchId, 1)).status).toBe(
    "FOUND",
  );
  expect((await f.repo().append(await f.context(), empty, one.raw)).status).toBe(
    "EXACT_REPLAY",
  );
  expect(
    (await f.repo().append(await f.context(), one.head, await f.body(one.head))).status,
  ).toBe("STALE_OBSERVATION");
  expect(f.count()).toBe(1);
});

it.each(["original_filename", "deleted-input"])(
  "R1 retained immutable C2 roster corruption denies history and replay: %s",
  async (corruption) => {
    const f = await fixture(),
      one = await append(f);
    // Disposable corruption reproduction; production guards stay unchanged.
    f.sql.exec(
      "DROP TRIGGER capture_submission_roster_update; DROP TRIGGER capture_submission_input_update; DROP TRIGGER capture_submission_input_delete",
    );
    if (corruption === "original_filename")
      f.sql.exec("UPDATE capture_submission_inputs SET original_filename='forged.pdf'");
    else f.sql.exec("DELETE FROM capture_submission_inputs");
    f.reopen();
    await expect(f.c2.read(f.request.jobId)).rejects.toMatchObject({ code: "INTEGRITY" });
    const before = f.c2Rows(),
      writes = vi.spyOn(f.db, "runAsync");
    const head = await f.repo().readHead(await f.context(), f.request.batchId);
    const exact = await f.repo().readExact(await f.context(), f.request.batchId, 1);
    const replay = await f.repo().append(await f.context(), empty, one.raw);
    expect(["INTEGRITY_BLOCKED", "UNAVAILABLE"]).toContain(head.status);
    expect(["INTEGRITY_BLOCKED", "UNAVAILABLE"]).toContain(exact.status);
    expect(["INTEGRITY_BLOCKED", "UNAVAILABLE"]).toContain(replay.status);
    expect(writes).not.toHaveBeenCalled();
    expect(f.count()).toBe(1);
    expect(f.c2Rows()).toBe(before);
  },
);
it.each([Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, -1, 0.5, NaN, Infinity])(
  "R2 expected revision %s rejects before parsing/hash with zero writes",
  async (revision) => {
    const f = await fixture(),
      raw = await f.body();
    const hash = vi.fn(sha256),
      writes = vi.spyOn(f.db, "runAsync");
    f.deps.sha256 = hash;
    for (const body of [raw, "malformed JSON"]) {
      expect(
        (await f.repo().append(await f.context(), { revision, bodySha256: null }, body))
          .status,
      ).toBe("HEAD_CONFLICT");
      expect(hash).not.toHaveBeenCalled();
      expect(writes).not.toHaveBeenCalled();
      expect(f.count()).toBe(0);
    }
  },
);

it("R1 historical pending and accepted observations survive legitimate Input and Capture advances", async () => {
  const f = await fixture(),
    one = await append(f);
  await f.c2.submit(
    f.request,
    new Map([
      [f.request.inputs[0].id, async () => ({ bytes: new Uint8Array([1, 2, 3]) })],
    ]),
  );
  const two = await append(f, one.head);
  const current = await f.c2.read(f.request.jobId),
    captureId = current.inputs[0].captureId!;
  const tripId = randomUUID();
  f.sql
    .prepare(
      "INSERT INTO ledger_actor_context(user_id,journey_id,role,capabilities_json,updated_at) VALUES(?,?,'group_member','{}',?)",
    )
    .run(f.request.accountId, tripId, f.deps.now());
  const inbox = createLocalCaptureInboxRepository(
    f.db,
    async () => f.request.accountId,
    f.deps,
  );
  await inbox.assign(captureId, tripId, 1);
  await inbox.assign(captureId, null, 2);
  f.reopen();
  f.owning.mockRejectedValue(new Error("current publication unavailable"));
  f.owning.mockClear();
  const writes = vi.spyOn(f.db, "runAsync");
  expect((await f.repo().readHead(await f.context(), f.request.batchId)).status).toBe(
    "HEALTHY",
  );
  for (const [revision, parent, raw] of [
    [1, empty, one.raw],
    [2, one.head, two.raw],
  ] as const) {
    expect(
      (await f.repo().readExact(await f.context(), f.request.batchId, revision)).status,
    ).toBe("FOUND");
    expect((await f.repo().append(await f.context(), parent, raw)).status).toBe(
      "EXACT_REPLAY",
    );
  }
  expect(f.owning).not.toHaveBeenCalled();
  expect(writes).not.toHaveBeenCalled();
  expect(f.count()).toBe(2);
});
