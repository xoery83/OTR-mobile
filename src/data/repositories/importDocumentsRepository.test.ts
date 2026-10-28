import type { SQLiteBindValue } from "expo-sqlite";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { fixture } from "./__fixtures__/captureBatchAssessment";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { createImportDocumentsRepository } from "./importDocumentsRepository";

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
