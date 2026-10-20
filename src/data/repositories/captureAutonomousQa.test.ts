import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { migrations } from "@/data/db/migrations";
import { serializeDatabaseTransactions } from "@/data/db/databaseConnection";
import {
  beginAccountTransition,
  captureAccountRequestContext,
  endAccountTransition,
} from "@/data/auth/accountRequestContext";
import { createCaptureSubmissionRepository } from "@/data/repositories/captureSubmissionRepository";
import type { LocalCaptureDatabase } from "@/data/repositories/localCaptureInboxRepository";
import type { CapturePayloadInput } from "@/data/files/capturePayloadReader";
import type { SubmissionRequest } from "@/domain/capture/captureSubmission";
import { LocalCaptureError } from "@/domain/capture/localCapture";

const accountA = "00000000-0000-4000-8000-00000000000a";
const accountB = "00000000-0000-4000-8000-00000000000b";
const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

// Same native-SQLite adapter as the durable repository tests; no app or session fixture.
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "capture-c3-synthetic-"));
  const path = join(dir, "qa.db");
  let sql = new DatabaseSync(path);
  let account = accountA;
  let sequence = 100;
  const newId = () =>
    `00000000-0000-4000-8000-${(++sequence).toString(16).padStart(12, "0")}`;
  const now = () => "2026-10-08T00:00:00.000Z";
  sql.exec("PRAGMA foreign_keys=ON");
  for (const migration of migrations) sql.exec(migration.sql);
  sql.exec("PRAGMA user_version=53");
  const db: LocalCaptureDatabase = serializeDatabaseTransactions({
    async getFirstAsync<T>(query: string, ...params: unknown[]) {
      return (sql.prepare(query).get(...(params as never[])) ?? null) as T | null;
    },
    async getAllAsync<T>(query: string, ...params: unknown[]) {
      return sql.prepare(query).all(...(params as never[])) as T[];
    },
    async runAsync(query: string, ...params: unknown[]) {
      const result = sql.prepare(query).run(...(params as never[]));
      return {
        changes: Number(result.changes),
        lastInsertRowId: Number(result.lastInsertRowid),
      };
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
  const makeRepository = () =>
    createCaptureSubmissionRepository(db, getUser, {
      newId,
      now,
      sha256: async (bytes) => createHash("sha256").update(bytes).digest("hex"),
    });
  const f = {
    db,
    get sql() {
      return sql;
    },
    repo: makeRepository(),
    getUser,
    async switchTo(next: string) {
      const lease = await beginAccountTransition();
      account = next;
      endAccountTransition(lease);
    },
    reopen() {
      sql.close();
      sql = new DatabaseSync(path);
      sql.exec("PRAGMA foreign_keys=ON");
      f.repo = makeRepository();
    },
    request(n: number, minute = 0): SubmissionRequest {
      const batchId = newId();
      const createdAt = new Date(Date.parse(now()) + minute * 60_000).toISOString();
      return {
        formatVersion: 1,
        manifestVersion: 1,
        accountId: account,
        batchId,
        jobId: newId(),
        submissionKey: newId(),
        createdAt,
        context: {
          id: newId(),
          version: 1,
          accountId: account,
          batchId,
          observedAt: createdAt,
          clock: "DEVICE_WALL",
          entrySurface: "CAPTURE",
          tripPrior: {
            id: "00000000-0000-4000-8000-0000000000ff",
            origin: "PRIOR",
            observedAt: createdAt,
          },
        },
        inputs: Array.from({ length: n }, (_, ordinal) => ({
          id: newId(),
          itemKey: newId(),
          ordinal,
          acquisitionSource: ordinal % 2 ? "photos" : "files",
          kind: ordinal % 2 ? "IMAGE" : "FILE",
          originalFilename: `合成凭证 ${ordinal} ${"long name ".repeat(20)}.pdf`,
          declaredContentType: null,
          continuesFromInputId: null,
        })),
      };
    },
    sources(request: SubmissionRequest) {
      return new Map<string, () => Promise<CapturePayloadInput>>(
        request.inputs.map((input) => [
          input.id,
          async () => ({ bytes: new Uint8Array([1, 2, 3]) }),
        ]),
      );
    },
    rows() {
      return sql
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all()
        .map(({ name }) => [
          name,
          sql.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all(),
        ]);
    },
  };
  cleanups.push(() => {
    sql.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return f;
}

it("synthetic A/B: 45 A Jobs paginate 20/20/5 deterministically, preserve all four intake states/lineage through SQLite51 restart, and never write on read", async () => {
  const f = fixture();
  expect(await f.repo.list()).toEqual([]);
  const requests: SubmissionRequest[] = [];
  const expectedCounts = new Map();
  for (let index = 0; index < 44; index++) {
    const request = f.request(3, Math.floor(index / 4));
    requests.push(request);
    const sources = f.sources(request);
    const state = index % 4;
    if (state === 1) {
      sources.set(request.inputs[1].id, async () => {
        throw new LocalCaptureError("READER_FAILURE");
      });
      sources.delete(request.inputs[2].id);
    } else if (state === 2) {
      for (const input of request.inputs)
        sources.set(input.id, async () => {
          throw new LocalCaptureError("READER_FAILURE");
        });
    } else if (state === 3) sources.clear();
    const model = await f.repo.submit(request, sources);
    const counts = [
      { selected: 3, accepted: 3, failed: 0, pending: 0 },
      { selected: 3, accepted: 1, failed: 1, pending: 1 },
      { selected: 3, accepted: 0, failed: 3, pending: 0 },
      { selected: 3, accepted: 0, failed: 0, pending: 3 },
    ][state];
    expect(model.counts).toEqual(counts);
    expectedCounts.set(request.jobId, counts);
  }
  const prior = await f.repo.reopen(requests[3].jobId);
  const next = f.request(1, 11);
  next.inputs[0].continuesFromInputId = prior.inputs[0].id;
  await f.repo.submit(next, f.sources(next), undefined, undefined, {
    [prior.inputs[0].id]: prior.inputs[0].revision,
  });
  requests.push(next);
  expectedCounts.set(next.jobId, { selected: 1, accepted: 1, failed: 0, pending: 0 });
  await f.switchTo(accountB);
  expect(await f.repo.list()).toEqual([]);
  const b = f.request(1, 20);
  await f.repo.submit(b, f.sources(b));
  const before = f.rows();
  f.reopen();
  expect(f.sql.prepare("PRAGMA user_version").get()!.user_version).toBe(53);
  expect(f.sql.prepare("PRAGMA integrity_check").get()!.integrity_check).toBe("ok");
  expect(f.sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  const write = vi.spyOn(f.db, "runAsync");
  expect((await f.repo.list()).map((job) => job.batch.jobId)).toEqual([b.jobId]);
  await expect(f.repo.reopen(requests[0].jobId)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await f.switchTo(accountA);
  const expected = [...requests].sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) || b.batchId.localeCompare(a.batchId),
  );
  let cursor: { createdAt: string; batchId: string } | undefined;
  const ids: string[] = [];
  for (const size of [20, 20, 5, 0]) {
    const page = await f.repo.list({ limit: 20, before: cursor });
    expect(page).toHaveLength(size);
    for (const entry of page) {
      ids.push(entry.batch.jobId);
      const reopened = await f.repo.reopen(entry.batch.jobId);
      expect(reopened).toEqual(entry);
      expect(reopened.counts).toEqual(expectedCounts.get(entry.batch.jobId));
      expect(reopened.processing.capability).toBe("NOT_INSTALLED");
      expect(reopened.results).toEqual({
        admittedCreates: 0,
        admittedUpdates: 0,
        currentAttention: null,
      });
      expect(reopened.availableActions.canReviewNow).toBe(false);
    }
    const last = page.at(-1);
    if (last) cursor = { createdAt: last.batch.createdAt, batchId: last.batch.batchId };
  }
  expect(ids).toEqual(expected.map((request) => request.jobId));
  expect(new Set(ids).size).toBe(45);
  expect((await f.repo.reopen(prior.batch.jobId)).inputs[0].continuedIn).toEqual([
    { jobId: next.jobId, inputId: next.inputs[0].id },
  ]);
  expect((await f.repo.reopen(next.jobId)).inputs[0].continuesFromJobId).toBe(
    prior.batch.jobId,
  );
  expect(
    f.sql.prepare("SELECT DISTINCT trip_id,state FROM local_capture_inbox").all(),
  ).toEqual([{ trip_id: null, state: "INBOX" }]);
  for (const table of [
    "sync_operations",
    "local_capture_source_bindings",
    "intelligence_continuations",
  ])
    expect(f.sql.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n).toBe(0);
  const original = await captureAccountRequestContext("", f.getUser);
  await f.switchTo(accountB);
  await f.switchTo(accountA);
  await expect(f.repo.list({ limit: 20 }, original)).rejects.toThrow("Account changed");
  await expect(f.repo.reopen(next.jobId, original)).rejects.toThrow("Account changed");
  expect((await f.repo.list({ limit: 20 })).map((job) => job.batch.jobId)).toEqual(
    ids.slice(0, 20),
  );
  expect(write).not.toHaveBeenCalled();
  expect(f.rows()).toEqual(before);
});

it("synthetic many-files Job keeps 50 long-name inputs in exact Files→Photos order and accepted replay cannot read expired sources or duplicate originals", async () => {
  const f = fixture();
  const request = f.request(50);
  const first = await f.repo.submit(request, f.sources(request));
  expect(first.counts).toEqual({ selected: 50, accepted: 50, failed: 0, pending: 0 });
  const before = f.rows();
  f.reopen();
  const expired = vi.fn(async (): Promise<CapturePayloadInput> => {
    throw new Error("Expired picker URI must never be read for accepted input");
  });
  const replay = await f.repo.submit(
    request,
    new Map(request.inputs.map((input) => [input.id, expired])),
  );
  expect(replay).toEqual(first);
  expect(replay.inputs.map((input) => input.acquisitionSource)).toEqual(
    request.inputs.map((input) => input.acquisitionSource),
  );
  expect(expired).not.toHaveBeenCalled();
  expect(f.rows()).toEqual(before);
  expect(await f.repo.list()).toHaveLength(1);
});
