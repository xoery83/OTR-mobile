import type { SQLiteBindValue } from "expo-sqlite";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { fixture, now, sha256 } from "./__fixtures__/captureBatchAssessment";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import {
  createImportDocumentsLocalWriter,
  createImportDocumentsRepository,
} from "./importDocumentsRepository";

it("lists metadata without loading originals, and opens the same accepted Batch/input bytes", async () => {
  const f = fixture(true),
    request = await f.submit(2);
  const getOriginal = vi.fn(f.captures.getForSourceHandoff);
  const docs = createImportDocumentsRepository(f.db, f.getAccount, {
    getForSourceHandoff: getOriginal,
  });
  const context = await captureAccountRequestContext("", f.getAccount);
  const first = await docs.list(context, "PERSONAL_INBOX", { limit: 1 });
  expect(first).toHaveLength(1);
  expect(first[0]).toMatchObject({
    batchId: request.batchId,
    jobId: request.jobId,
    kind: "TEXT",
    custody: "LOCAL_RECORDED",
    cloudOriginal: "NOT_ASSERTED",
    visibility: "PRIVATE",
  });
  expect(first[0]).not.toHaveProperty("bytes");
  expect(first[0]).not.toHaveProperty("itemIds");
  expect(getOriginal).not.toHaveBeenCalled();
  const next = await docs.list(context, "PERSONAL_INBOX", { before: first[0], limit: 1 });
  expect(next).toHaveLength(1);
  expect(next[0].captureId).not.toBe(first[0].captureId);
  f.reopen();
  const opened = await docs.original(context, "PERSONAL_INBOX", first[0].captureId);
  expect(new TextDecoder().decode(opened.bytes)).toBe("abc");
  expect(opened.document).toEqual(first[0]);
  expect(getOriginal).toHaveBeenCalledTimes(1);
});
it("a historical Trip prior never moves a private original into Trip Documents", async () => {
  const f = fixture(),
    trip = randomUUID(),
    request = f.request();
  request.context.tripPrior = {
    id: trip,
    origin: "PRIOR",
    observedAt: request.createdAt,
  };
  await f.submissions.submit(
    request,
    new Map(request.inputs.map((i) => [i.id, async () => ({ text: "private" })])),
  );
  const docs = createImportDocumentsRepository(f.db, f.getAccount, f.captures);
  const context = await captureAccountRequestContext(trip, f.getAccount);
  await expect(docs.list(context, "TRIP")).rejects.toThrow("TRIP_ACCESS");
  f.sql
    .prepare(
      "INSERT INTO ledger_actor_context(user_id,journey_id,role,capabilities_json,updated_at) VALUES(?,?,'owner','{}',?)",
    )
    .run(context.accountId, trip, request.createdAt);
  expect(await docs.list(context, "TRIP")).toEqual([]);
  expect(await docs.list(context, "PERSONAL_INBOX")).toHaveLength(1);
});
it("explicit lawful assignment changes only document scope and retains real Batch linkage", async () => {
  const f = fixture(),
    request = await f.submit(2),
    catalog = await f.publish(request);
  const docs = createImportDocumentsRepository(f.db, f.getAccount, f.captures);
  const context = await captureAccountRequestContext(catalog.trip_id, f.getAccount);
  const trip = await docs.list(context, "TRIP"),
    inbox = await docs.list(context, "PERSONAL_INBOX");
  expect(trip).toHaveLength(1);
  expect(await docs.sourceLinks(context, "TRIP", trip[0].captureId)).toEqual([
    {
      sourceId: catalog.trip_sources[0].id,
      representationId: catalog.trip_source_representations[0].id,
      sourceRevision: 1,
    },
  ]);
  expect(await docs.sourceLinks(context, "PERSONAL_INBOX", inbox[0].captureId)).toEqual(
    [],
  );
  expect(inbox).toHaveLength(1);
  expect(trip[0].captureId).not.toBe(inbox[0].captureId);
  expect(trip[0]).toMatchObject({
    batchId: request.batchId,
    jobId: request.jobId,
    tripId: catalog.trip_id,
    visibility: "PRIVATE",
  });
  await expect(docs.read(context, "TRIP", inbox[0].captureId)).rejects.toThrow(
    "NOT_FOUND",
  );
  await expect(docs.read(context, "PERSONAL_INBOX", trip[0].captureId)).rejects.toThrow(
    "NOT_FOUND",
  );
  expect(
    new TextDecoder().decode(
      (await docs.original(context, "TRIP", trip[0].captureId)).bytes,
    ),
  ).toBe("abc");
});
it("Account transition fences old metadata and bytes even when acquisition completes late", async () => {
  const f = fixture(),
    request = await f.submit();
  const context = await captureAccountRequestContext("", f.getAccount);
  const docs = createImportDocumentsRepository(f.db, f.getAccount, {
    async getForSourceHandoff(id) {
      const original = await f.captures.getForSourceHandoff(id);
      await f.switchTo(randomUUID());
      return original;
    },
  });
  const [document] = await docs.list(context, "PERSONAL_INBOX");
  await expect(
    docs.original(context, "PERSONAL_INBOX", document.captureId),
  ).rejects.toThrow();
  await expect(docs.list(context, "PERSONAL_INBOX")).rejects.toThrow();
  const next = await captureAccountRequestContext("", f.getAccount);
  expect(await docs.list(next, "PERSONAL_INBOX")).toEqual([]);
  await expect(docs.read(next, "PERSONAL_INBOX", document.captureId)).rejects.toThrow(
    "NOT_FOUND",
  );
  expect(request.batchId).toBe(document.batchId);
});
it("permission loss after loading an original withholds its bytes", async () => {
  const f = fixture(),
    request = await f.submit(),
    catalog = await f.publish(request);
  const context = await captureAccountRequestContext(catalog.trip_id, f.getAccount);
  const docs = createImportDocumentsRepository(f.db, f.getAccount, {
    async getForSourceHandoff(id) {
      const original = await f.captures.getForSourceHandoff(id);
      f.sql
        .prepare("DELETE FROM ledger_actor_context WHERE user_id=? AND journey_id=?")
        .run(context.accountId, context.tripId);
      return original;
    },
  });
  const [document] = await docs.list(context, "TRIP");
  await expect(docs.original(context, "TRIP", document.captureId)).rejects.toThrow(
    "TRIP_ACCESS",
  );
});
it("validates bounded paging and keeps unavailable material distinct from cloud backup", async () => {
  const f = fixture();
  await f.submit();
  const context = await captureAccountRequestContext("", f.getAccount);
  const db = {
    ...f.db,
    getAllAsync: vi.fn(async (q: string, ...p: SQLiteBindValue[]) => {
      const rows = await f.db.getAllAsync<Record<string, unknown>>(q, ...p);
      return rows.map((row) => ({ ...row, sha256: null, byteCount: null }));
    }),
  };
  const docs = createImportDocumentsRepository(
    db as unknown as typeof f.db,
    f.getAccount,
    f.captures,
  );
  expect((await docs.list(context, "PERSONAL_INBOX"))[0]).toMatchObject({
    custody: "UNAVAILABLE",
    cloudOriginal: "NOT_ASSERTED",
  });
  await expect(docs.list(context, "PERSONAL_INBOX", { limit: 101 })).rejects.toThrow();
});

it("same Batch and identical retained bytes do not link a sibling to another input's Source", async () => {
  const f = fixture(),
    request = await f.submit(2),
    catalog = await f.publish(request);
  const context = await captureAccountRequestContext(catalog.trip_id, f.getAccount);
  const docs = createImportDocumentsRepository(f.db, f.getAccount, f.captures);
  const [sibling] = await docs.list(context, "PERSONAL_INBOX");
  const retained = await f.captures.getForSourceHandoff(sibling.captureId);
  await f.captures.assign(sibling.captureId, catalog.trip_id, retained.capture.revision);
  expect(await docs.list(context, "TRIP")).toHaveLength(2);
  expect(await docs.sourceLinks(context, "TRIP", sibling.captureId)).toEqual([]);
});

it("search opts into bounded retained text and records source/storage without loading original bytes", async () => {
  const f = fixture(true);
  await f.submit(1);
  const original = vi.fn(f.captures.getForSourceHandoff);
  const docs = createImportDocumentsRepository(f.db, f.getAccount, {
    getForSourceHandoff: original,
  });
  const context = await captureAccountRequestContext("", f.getAccount);
  expect((await docs.list(context, "PERSONAL_INBOX"))[0].retainedText).toBeUndefined();
  expect(
    (await docs.list(context, "PERSONAL_INBOX", { includeText: true }))[0],
  ).toMatchObject({ retainedText: "abc", localAvailable: true });
  expect(original).not.toHaveBeenCalled();
});

it("advances a real 30-row cursor across pages without duplicates or reading originals", async () => {
  const f = fixture(true);
  for (let n = 0; n < 7; n++) await f.submit(5);
  const original = vi.fn(f.captures.getForSourceHandoff);
  const repo = createImportDocumentsRepository(f.db, f.getAccount, {
    getForSourceHandoff: original,
  });
  const context = await captureAccountRequestContext("", f.getAccount);
  const first = await repo.list(context, "PERSONAL_INBOX", { limit: 30 });
  const second = await repo.list(context, "PERSONAL_INBOX", {
    limit: 30,
    before: first.at(-1),
  });
  expect(first).toHaveLength(30);
  expect(second).toHaveLength(5);
  expect(new Set([...first, ...second].map((row) => row.captureId)).size).toBe(35);
  expect(
    await repo.list(context, "PERSONAL_INBOX", { limit: 30, before: second.at(-1) }),
  ).toEqual([]);
  expect(original).not.toHaveBeenCalled();
});


it("retains explicit Files originals in their local directories across process reopen", async () => {
  const f = fixture(true);
  const docs = createImportDocumentsRepository(f.db, f.getAccount, f.captures);
  const save = createImportDocumentsLocalWriter(f.db, f.getAccount, {
    now, sha256, newId: randomUUID,
  });
  const inbox = await captureAccountRequestContext("", f.getAccount);
  const trip = await captureAccountRequestContext(randomUUID(), f.getAccount);
  f.sql.prepare(
    "INSERT INTO ledger_actor_context(user_id,journey_id,role,capabilities_json,updated_at) VALUES(?,?,'owner','{}',?)",
  ).run(trip.accountId, trip.tripId, now());
  const bytes = new Uint8Array([37, 80, 68, 70, 13, 10]);
  await save(inbox, "private.pdf", "application/pdf", { bytes });
  await save(trip, "trip.pdf", "application/pdf", { bytes });
  f.reopen();
  for (const [context, scope, filename] of [
    [inbox, "PERSONAL_INBOX", "private.pdf"],
    [trip, "TRIP", "trip.pdf"],
  ] as const) {
    const rows = await docs.list(context, scope);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      originalFilename: filename,
      sha256: await sha256(bytes),
      custody: "LOCAL_RECORDED",
      visibility: "PRIVATE",
      cloudOriginal: "NOT_ASSERTED",
      jobId: null,
      batchId: null,
    });
    expect((await docs.original(context, scope, rows[0].captureId)).bytes).toEqual(bytes);
  }
  expect(f.sql.prepare("SELECT count(*) AS n FROM capture_submission_batches").get()).toMatchObject({ n: 0 });
  expect(f.sql.prepare("SELECT count(*) AS n FROM sync_operations").get()).toMatchObject({ n: 0 });
  expect(f.sql.prepare("SELECT count(*) AS n FROM local_capture_payloads").get()).toMatchObject({ n: 1 });
  f.sql.prepare(
    "INSERT INTO trip_core_scopes(account_id,trip_id,refresh_generation,access_revision,revoked) VALUES(?,?,1,2,1)",
  ).run(trip.accountId, trip.tripId);
  await expect(docs.list(trip, "TRIP")).rejects.toThrow("DOCUMENTS_TRIP_ACCESS");
  expect(await docs.list(inbox, "PERSONAL_INBOX")).toHaveLength(1);
});

it("rejects Files intake after access revocation or account change without retaining bytes", async () => {
  const f = fixture();
  const save = createImportDocumentsLocalWriter(f.db, f.getAccount, {
    now, sha256, newId: randomUUID,
  });
  const trip = await captureAccountRequestContext(randomUUID(), f.getAccount);
  const input = { bytes: new Uint8Array([1]) };
  await expect(save(trip, "file.pdf", "application/pdf", input)).rejects.toThrow("DOCUMENTS_TRIP_ACCESS");
  f.sql.prepare(
    "INSERT INTO ledger_actor_context(user_id,journey_id,role,capabilities_json,updated_at) VALUES(?,?,'owner','{}',?)",
  ).run(trip.accountId, trip.tripId, now());
  f.sql.prepare(
    "INSERT INTO trip_core_scopes(account_id,trip_id,refresh_generation,access_revision,revoked) VALUES(?,?,1,2,1)",
  ).run(trip.accountId, trip.tripId);
  await expect(save(trip, "file.pdf", "application/pdf", input)).rejects.toThrow("DOCUMENTS_TRIP_ACCESS");
  await f.switchTo(randomUUID());
  await expect(save(trip, "file.pdf", "application/pdf", input)).rejects.toThrow("Account changed");
  expect(f.sql.prepare("SELECT count(*) AS n FROM local_capture_payloads").get()).toMatchObject({ n: 0 });
});
