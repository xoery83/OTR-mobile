import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { createSyncEngine, captureProcessingValidationKind } from "../sync/syncEngine";
import { fixture, now, sha256 } from "./__fixtures__/captureBatchAssessment";
import { captureProcessingMigration } from "../db/migrations/captureProcessing";
import { migrations } from "../db/migrations";
import { createCaptureProcessingRepository } from "./captureProcessingRepository";

const deps = { now, sha256, newId: randomUUID };
describe("C3 local processing validation", () => {
  it("upgrades a SQLite63 database with two accepted originals through 64, 65, and 66", async () => {
    const f = fixture(true, 63);
    const request = await f.submit(2);
    const beforeInputs = f.sql
      .prepare("SELECT * FROM capture_submission_inputs ORDER BY ordinal")
      .all();
    const beforePayloads = f.sql
      .prepare(
        "SELECT id,sha256,byte_count,bytes FROM local_capture_payloads ORDER BY id",
      )
      .all();
    for (const migration of migrations.filter((item) => item.id >= 64 && item.id <= 66))
      f.sql.exec(migration.sql);
    expect(
      f.sql.prepare("SELECT * FROM capture_submission_inputs ORDER BY ordinal").all(),
    ).toEqual(beforeInputs);
    expect(
      f.sql
        .prepare(
          "SELECT id,sha256,byte_count,bytes FROM local_capture_payloads ORDER BY id",
        )
        .all(),
    ).toEqual(beforePayloads);
    const context = await captureAccountRequestContext("", f.getAccount);
    const repo = createCaptureProcessingRepository(f.db, f.getAccount, deps);
    expect(await repo.schedule(context, request.jobId)).toHaveLength(2);
    expect((await repo.run(context)).processedCount).toBe(2);
  });
  it("upgrades SQLite65 without changing accepted C2 rows and retains an append-only history", async () => {
    const f = fixture(true, 65);
    const request = await f.submit();
    const before = f.sql.prepare("SELECT * FROM capture_submission_inputs").all();
    f.sql.exec(captureProcessingMigration.sql);
    const context = await captureAccountRequestContext("", f.getAccount);
    const repo = createCaptureProcessingRepository(f.db, f.getAccount, deps);
    await repo.schedule(context, request.jobId);
    expect((await repo.run(context)).processedCount).toBe(1);
    expect(f.sql.prepare("SELECT * FROM capture_submission_inputs").all()).toEqual(
      before,
    );
    const event = (await repo.events(context, request.jobId))[0];
    expect(() =>
      f.sql
        .prepare("UPDATE capture_processing_events SET state='FAILED' WHERE sequence=?")
        .run(event.sequence),
    ).toThrow("CAPTURE_PROCESSING_EVENT_IMMUTABLE");
    expect(() =>
      f.sql
        .prepare("DELETE FROM capture_processing_events WHERE sequence=?")
        .run(event.sequence),
    ).toThrow("CAPTURE_PROCESSING_EVENT_RETAINED");
  });
  it("claims and validates accepted originals once, retains events across SQLite reopen, and never calls a generic worker", async () => {
    const f = fixture(true);
    const request = await f.submit(2);
    const context = await captureAccountRequestContext("", f.getAccount);
    const repo = createCaptureProcessingRepository(f.db, f.getAccount, deps);
    expect(await repo.schedule(context, request.jobId)).toHaveLength(2);
    expect(await repo.schedule(context, request.jobId)).toHaveLength(2);
    const genericPush = vi.fn();
    await createSyncEngine(
      {
        listPending: () => repo.listPending(context),
        recoverInterrupted: () => repo.recoverInterrupted(context),
        claimOperation: (op) => repo.claim(context, op),
        settleOperation: (op, e, next) => repo.settle(context, op, e, next),
        markProcessing: vi.fn(),
        markCompleted: vi.fn(),
        markRetryable: vi.fn(),
      },
      { push: genericPush },
      undefined,
      () => true,
    ).run("AUTHENTICATED_ONLINE");
    expect(genericPush).not.toHaveBeenCalled();
    expect((await repo.run(context)).processedCount).toBe(2);
    expect((await repo.run(context)).processedCount).toBe(0);
    const events = await repo.events(context, request.jobId);
    expect(events.filter((event) => event.state === "INPUT_VALIDATED")).toHaveLength(2);
    expect(events.map((event) => event.state)).toContain("PROCESSING");
    f.reopen();
    expect(
      (await repo.events(context, request.jobId)).map((event) => event.state),
    ).toEqual(events.map((event) => event.state));
    expect(await repo.listPending(context)).toEqual([]);
  });
  it("uses a unique claim owner and preserves unresolved work until its lease expires", async () => {
    const f = fixture(true);
    const request = await f.submit();
    const context = await captureAccountRequestContext("", f.getAccount);
    const repo = createCaptureProcessingRepository(f.db, f.getAccount, deps);
    await repo.schedule(context, request.jobId);
    const [op] = await repo.listPending(context);
    expect(await repo.claim(context, op)).toBe(true);
    expect(await repo.claim(context, { ...op, claimOwner: undefined })).toBe(false);
    await repo.recoverInterrupted(context);
    expect(await repo.listPending(context)).toHaveLength(0);
    await f.db.runAsync(
      "UPDATE sync_operations SET lease_expires_at=? WHERE id=?",
      "2000-01-01T00:00:00.000Z",
      op.id,
    );
    await repo.recoverInterrupted(context);
    expect(await repo.listPending(context)).toHaveLength(1);
    expect((await repo.run(context)).processedCount).toBe(1);
  });
  it("does not reprocess a completed input when another input needs retry", async () => {
    const f = fixture(true);
    const request = await f.submit(2);
    const context = await captureAccountRequestContext("", f.getAccount);
    const repo = createCaptureProcessingRepository(f.db, f.getAccount, deps);
    await repo.schedule(context, request.jobId);
    const first = (await repo.listPending(context))[0];
    expect(await repo.claim(context, first)).toBe(true);
    await repo.validate(context, first);
    await repo.settle(context, first);
    const second = (await repo.listPending(context))[0];
    expect(second.entityId).not.toBe(first.entityId);
    expect(await repo.claim(context, second)).toBe(true);
    await repo.settle(context, second, new Error("transient"), now());
    expect(
      (await repo.events(context, request.jobId)).filter(
        (event) => event.state === "INPUT_VALIDATED",
      ),
    ).toHaveLength(1);
    expect((await repo.run(context)).processedCount).toBe(1);
    expect(
      (await repo.events(context, request.jobId)).filter(
        (event) => event.state === "INPUT_VALIDATED",
      ),
    ).toHaveLength(2);
    expect((await repo.run(context)).processedCount).toBe(0);
  });
  it("keeps C4 closed: validation emits no interpreter operation or review authority", async () => {
    const f = fixture();
    const request = await f.submit();
    const context = await captureAccountRequestContext("", f.getAccount);
    const repo = createCaptureProcessingRepository(f.db, f.getAccount, deps);
    await repo.schedule(context, request.jobId);
    await repo.run(context);
    const operations = await f.db.getAllAsync<{ operationType: string }>(
      "SELECT operation_type AS operationType FROM sync_operations",
    );
    expect(operations.map((op) => op.operationType)).toEqual([
      captureProcessingValidationKind,
    ]);
    const job = await f.submissions.reopen(request.jobId, context);
    expect(job.availableActions.canReviewNow).toBe(false);
    expect(job.processing.currentPassComplete).toBeNull();
  });
  it("rolls back an interrupted schedule and rejects an old A→B→A context", async () => {
    const f = fixture();
    const request = await f.submit(2);
    const context = await captureAccountRequestContext("", f.getAccount);
    const repo = createCaptureProcessingRepository(f.db, f.getAccount, deps);
    const write = f.db.runAsync.bind(f.db);
    let inserts = 0;
    f.db.runAsync = async (sql, ...params) => {
      if (sql.includes("INSERT INTO sync_operations") && ++inserts === 2)
        throw new Error("interrupted");
      return write(sql, ...(params as unknown as never[]));
    };
    await expect(repo.schedule(context, request.jobId)).rejects.toThrow("interrupted");
    f.db.runAsync = write;
    expect(
      f.sql
        .prepare(
          "SELECT count(*) AS n FROM sync_operations WHERE operation_type='CAPTURE_PROCESSING_VALIDATE'",
        )
        .get()!.n,
    ).toBe(0);
    await repo.schedule(context, request.jobId);
    const original = await f.getAccount();
    await f.switchTo(randomUUID());
    await f.switchTo(original);
    await expect(repo.run(context)).rejects.toThrow("Account changed");
  });
  it("rechecks the original in the successful settlement transaction", async () => {
    const f = fixture();
    const request = await f.submit();
    const context = await captureAccountRequestContext("", f.getAccount);
    const repo = createCaptureProcessingRepository(f.db, f.getAccount, deps);
    await repo.schedule(context, request.jobId);
    const [operation] = await repo.listPending(context);
    expect(await repo.claim(context, operation)).toBe(true);
    await repo.validate(context, operation);
    const input = (await f.submissions.reopen(request.jobId)).inputs[0];
    const trip = randomUUID();
    await f.db.runAsync(
      "INSERT INTO ledger_actor_context(user_id,journey_id,member_id,role,capabilities_json,updated_at) VALUES(?,?,NULL,NULL,'{}',?)",
      context.accountId,
      trip,
      now(),
    );
    await f.captures.assign(input.captureId!, trip, input.captureRevision!);
    await repo.settle(context, operation);
    const events = await repo.events(context, request.jobId);
    expect(events.at(-1)?.state).toBe("FAILED");
    expect(events.some((event) => event.state === "INPUT_VALIDATED")).toBe(false);
  });
  it("rejects an old due RETRYABLE listing after another claim installs a future backoff", async () => {
    const f = fixture();
    const request = await f.submit();
    const context = await captureAccountRequestContext("", f.getAccount);
    const repo = createCaptureProcessingRepository(f.db, f.getAccount, deps);
    await repo.schedule(context, request.jobId);
    const [initial] = await repo.listPending(context);
    expect(await repo.claim(context, initial)).toBe(true);
    await repo.settle(context, initial, new Error("transient"), now());
    const [observed] = await repo.listPending(context);
    const stale = { ...observed };
    expect(await repo.claim(context, observed)).toBe(true);
    await repo.settle(
      context,
      observed,
      new Error("transient"),
      "2026-10-09T00:00:00.000Z",
    );
    expect(await repo.claim(context, stale)).toBe(false);
    expect(await repo.listPending(context)).toEqual([]);
  });
});
