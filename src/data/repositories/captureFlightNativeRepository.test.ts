import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { migrations } from "../db/migrations";
import { serializeDatabaseTransactions } from "../db/databaseConnection";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import {
  createLocalCaptureInboxRepository,
  type LocalCaptureDatabase,
} from "./localCaptureInboxRepository";
import { createCaptureSubmissionRepository } from "./captureSubmissionRepository";
import { createCaptureSubmissionSession } from "../operations/captureSubmission";
import { createCaptureFlightNativeRepository } from "./captureFlightNativeRepository";
import { createTripCoreV2Repository } from "./tripCoreV2Repository";
import { createCoreFlightDayFeedReader } from "./tripCoreV2DayFeedRepository";
import {
  admittedFlightBatch,
  bindFlightBatch,
} from "../interpretation/__fixtures__/flightInterpretation";
import fixturePdf from "../interpretation/__fixtures__/nativeFlightPdf.json";
import {
  flightPdfExtractionSchema,
  validateFlightPdfExtraction,
  flightPdfEvidencePages,
} from "../interpretation/flightPdfExtraction";
import { buildCoreActorCollection } from "../../../backend/src/tripCoreV2Collection";
import { emptyCoreGraph } from "@/domain/trip/tripCoreV2Mutation";
import { coreHashValue } from "@/domain/trip/tripCoreV2Read";
import type {
  CoreCandidatePublicationTransport,
  CoreSourcePlanTransport,
} from "../api/tripCoreV2Transport";

const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const now = () => "2026-10-06T00:00:00.000Z";
const bytes = new Uint8Array(Buffer.from(fixturePdf.originalBase64, "base64"));
const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((f) => f()));
async function fixture(version = 56) {
  const template = await admittedFlightBatch([fixturePdf.extraction.text]);
  const account = template.request.binding.account_id,
    trip = template.request.binding.trip_id;
  const dir = mkdtempSync(join(tmpdir(), "otr-flight-native-")),
    path = join(dir, "capture.db");
  let sql = new DatabaseSync(path),
    active = account;
  sql.exec("PRAGMA foreign_keys=ON");
  for (const m of migrations.filter((m) => m.id <= version)) sql.exec(m.sql);
  sql
    .prepare(
      "INSERT INTO ledger_actor_context(user_id,journey_id,role,capabilities_json,updated_at) VALUES(?,?,'group_member','{}',?)",
    )
    .run(account, trip, now());
  const db: LocalCaptureDatabase = serializeDatabaseTransactions({
    async getFirstAsync<T>(q: string, ...params: unknown[]) {
      return (sql.prepare(q).get(...(params as never[])) ?? null) as T | null;
    },
    async getAllAsync<T>(q: string, ...params: unknown[]) {
      return sql.prepare(q).all(...(params as never[])) as T[];
    },
    async runAsync(q: string, ...params: unknown[]) {
      const r = sql.prepare(q).run(...(params as never[]));
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
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
  const getAccountId = async () => active;
  let clock = now();
  const deps = { sha256: hash, newId: randomUUID, now: () => clock };
  const inbox = createLocalCaptureInboxRepository(db, getAccountId, deps);
  const submission = createCaptureSubmissionRepository(db, getAccountId, deps);
  const session = createCaptureSubmissionSession({
    repository: submission,
    getActiveUserId: getAccountId,
    newId: randomUUID,
    now,
    open: async () => ({ bytes }),
  });
  const job = await session.submit(
    [
      {
        source: "files",
        temporaryUri: "file:///synthetic.pdf",
        name: "synthetic.pdf",
        typeHint: "application/pdf",
      },
    ],
    () => {},
    trip,
  );
  const input = job.inputs[0];
  expect(input.state).toBe("ACCEPTED");
  const capture = await inbox.assign(input.captureId!, trip, input.captureRevision!);
  const extract = vi.fn(async () => structuredClone(fixturePdf.extraction));
  const native = () =>
    createCaptureFlightNativeRepository(db, getAccountId, {
      ...deps,
      extract,
      handoff: (id) => inbox.getForSourceHandoff(id),
    });
  const core = createTripCoreV2Repository(db, getAccountId, hash, now);
  const context = () => captureAccountRequestContext(trip, getAccountId);
  const call = async () =>
    native().extract(await context(), capture.id, capture.revision);
  cleanups.push(() => {
    sql.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    setTime(time: string) {
      clock = time;
    },
    template,
    db,
    core,
    native,
    extract,
    capture,
    input,
    inbox,
    context,
    call,
    account,
    trip,
    get sql() {
      return sql;
    },
    switchAccount(id: string) {
      active = id;
      advanceAccountGeneration();
    },
    reopen() {
      sql.close();
      sql = new DatabaseSync(path);
      sql.exec("PRAGMA foreign_keys=ON");
    },
    count(table: string) {
      return Number(sql.prepare(`SELECT count(*) n FROM ${table}`).get()!.n);
    },
  };
}
async function admittedPdfBatch(f: Awaited<ReturnType<typeof fixture>>) {
  const local = await f.call(),
    ids = local.identities,
    batch = structuredClone(f.template);
  const text = batch.catalog.trip_source_representations[0];
  batch.catalog.trip_sources[0].id = ids.sourceId;
  batch.catalog.trip_sources[0].source_kind = "FILE";
  batch.catalog.trip_sources[0].acquisition_channel = "FILES";
  Object.assign(batch.catalog.trip_source_revisions[0], {
    source_id: ids.sourceId,
    original_representation_ids: [ids.originalRepresentationId],
  });
  // Explicit synthetic owning catalog seam: not a real admission or a local catalog write.
  const original = {
    ...text,
    id: ids.originalRepresentationId,
    source_id: ids.sourceId,
    material_kind: "BINARY" as const,
    text_content: null,
    encoding: null,
    mime_type: "application/pdf",
    payload_sha256: local.extraction.originalSha256,
    byte_count: bytes.length,
  };
  const derived = {
    ...text,
    id: ids.derivedRepresentationId,
    source_id: ids.sourceId,
    role: "DERIVED" as const,
    parent_ids: [ids.originalRepresentationId],
    transform_key: "apple-pdfkit",
    transform_version: "1",
    transform_options_sha256: "0".repeat(64),
    regenerability: "POSSIBLE" as const,
  };
  batch.catalog.trip_source_representations = [original, derived];
  Object.assign(batch.request.materials[0].pin, {
    id: ids.inputId,
    source_id: ids.sourceId,
    representation_id: ids.derivedRepresentationId,
  });
  batch.resolved_airports.forEach((a) => (a.input_id = ids.inputId));
  batch.batch_id = ids.batchId;
  Object.assign(batch.request.binding, {
    run_id: ids.runId,
    request_id: ids.requestId,
    idempotency_key: ids.requestId,
  });
  await bindFlightBatch(batch);
  return batch;
}
it("retains exact C2 original and prospective identities offline, then reopens without extracting again", async () => {
  const f = await fixture(),
    first = await f.call();
  const original = await f.inbox.getForSourceHandoff(f.capture.id);
  expect(original.bytes).toEqual(bytes);
  expect(original.capture.sha256).toBe(fixturePdf.extraction.originalSha256);
  f.reopen();
  expect(await f.call()).toEqual(first);
  expect(f.extract).toHaveBeenCalledTimes(1);
  expect(f.count("capture_flight_native_preparations")).toBe(1);
  expect(f.count("trip_sources")).toBe(0);
  expect(f.count("sync_operations")).toBe(0);
});
it("freezes IDs before extractor failure, preserving original and same retry after restart", async () => {
  const f = await fixture();
  f.extract.mockRejectedValueOnce(new Error("PDF_TEXT_UNAVAILABLE"));
  await expect(f.call()).rejects.toThrow("PDF_TEXT_UNAVAILABLE");
  const ids = f.sql
    .prepare("SELECT identities_json FROM capture_flight_native_preparations")
    .get()!.identities_json;
  f.reopen();
  expect(JSON.stringify((await f.call()).identities)).not.toBeNull();
  expect(
    f.sql.prepare("SELECT identities_json FROM capture_flight_native_preparations").get()!
      .identities_json,
  ).toBe(ids);
  expect((await f.inbox.getForSourceHandoff(f.capture.id)).bytes).toEqual(bytes);
});
it("one PDF produces two exact derived-evidence candidates, replaying all import IDs after restart", async () => {
  const f = await fixture(),
    batch = await admittedPdfBatch(f),
    ctx = await f.context();
  const result = await f.native().build(ctx, f.capture.id, f.capture.revision, batch);
  expect(result.set.candidates).toHaveLength(2);
  expect(new Set(result.identities.map((i) => i.itemId)).size).toBe(2);
  expect(result.plan.slots).toHaveLength(4);
  expect(
    result.set.candidates.every(
      (c) => c.proposal.fields.origin?.proposed_value.location.accepted_place_id === null,
    ),
  ).toBe(true);
  for (const evidence of result.built.publication.evidence) {
    expect(evidence.locator.kind).toBe("TEXT_SPAN");
    expect(
      flightPdfEvidencePages(
        flightPdfExtractionSchema.parse(fixturePdf.extraction),
        evidence.locator.start!,
        evidence.locator.end!,
      ),
    ).toHaveLength(1);
    expect(evidence.locator.input_id).toBe(batch.request.materials[0].pin.id);
  }
  f.reopen();
  f.setTime("2027-01-01T00:00:00.000Z");
  const again = await f
    .native()
    .build(await f.context(), f.capture.id, f.capture.revision, batch);
  expect(again).toEqual(result);
  expect(f.extract).toHaveBeenCalledTimes(1);
  expect(f.count("trip_sources")).toBe(0);
  expect(f.count("trip_core_itinerary_events")).toBe(0);
});
it("refuses to relabel extracted PDF text as an original Source", async () => {
  const f = await fixture(),
    batch = await admittedPdfBatch(f);
  batch.catalog.trip_source_representations[1].role = "ORIGINAL";
  await expect(
    f.native().build(await f.context(), f.capture.id, f.capture.revision, batch),
  ).rejects.toThrow("NATIVE_FLIGHT_SOURCE_ADMISSION_REQUIRED");
});
it("unknown native Candidate fields stay unknown and only accepted collections can feed Day", async () => {
  const f = await fixture(),
    batch = await admittedPdfBatch(f);
  const result = await f
    .native()
    .build(await f.context(), f.capture.id, f.capture.revision, batch);
  for (const candidate of result.set.candidates) {
    expect(candidate.occurrence["origin.local_time"]).toBeUndefined();
    expect(candidate.proposal.fields.origin?.proposed_value.time.local_time).toBeNull();
    expect(
      candidate.proposal.fields.origin?.proposed_value.location.accepted_place_id,
    ).toBeNull();
    expect(candidate.occurrence["origin.terminal"]).toBeUndefined();
  }
  expect(await createCoreFlightDayFeedReader(f.core)(f.trip)).toBeNull();
  const actor = {
    accountId: f.account,
    tripId: f.trip,
    active: true,
    canManageShared: false,
    personId: randomUUID(),
    personIds: [],
  };
  const bundle = await buildCoreActorCollection(
    emptyCoreGraph(),
    actor,
    { epoch: randomUUID(), revision: 1, accessRevision: 1, generatedAt: now() },
    [],
    hash,
  );
  const ctx = await f.context();
  await f.core.install(await f.core.beginRefresh(ctx, 1), bundle.manifest, bundle.pages);
  expect(
    (await createCoreFlightDayFeedReader(f.core)(f.trip))?.projection.items,
  ).toHaveLength(0);
});
it("fences A→B→A callbacks and lets a fresh A context reopen the original identities", async () => {
  const f = await fixture(),
    ctx = await f.context(),
    first = await f.call();
  f.switchAccount(randomUUID());
  await expect(f.native().extract(ctx, f.capture.id, f.capture.revision)).rejects.toThrow(
    "Account changed",
  );
  f.switchAccount(f.account);
  await expect(f.native().extract(ctx, f.capture.id, f.capture.revision)).rejects.toThrow(
    "Account changed",
  );
  expect(await f.call()).toEqual(first);
});
it("fences account change during PDF extraction and retains preallocated IDs for safe retry", async () => {
  const f = await fixture();
  f.extract.mockImplementationOnce(async () => {
    f.switchAccount(randomUUID());
    return fixturePdf.extraction;
  });
  await expect(f.call()).rejects.toThrow("Account changed");
  expect(
    f.sql.prepare("SELECT extraction_json FROM capture_flight_native_preparations").get()!
      .extraction_json,
  ).toBeNull();
  f.switchAccount(f.account);
  expect((await f.call()).extraction.originalSha256).toBe(
    fixturePdf.extraction.originalSha256,
  );
});
it("denies a foreign Trip and removed membership without returning private extraction", async () => {
  const f = await fixture();
  const foreign = { ...(await f.context()), tripId: randomUUID() };
  await expect(
    f.native().extract(foreign, f.capture.id, f.capture.revision),
  ).rejects.toThrow("NATIVE_FLIGHT_CAPTURE_STALE");
  await f.call();
  f.sql
    .prepare("DELETE FROM ledger_actor_context WHERE user_id=? AND journey_id=?")
    .run(f.account, f.trip);
  await expect(f.call()).rejects.toThrow("NATIVE_FLIGHT_TRIP_ACCESS");
});
it("validates original hash, page continuity, UTF-8 boundaries and full page roster", async () => {
  const original = {
    sha256: fixturePdf.extraction.originalSha256,
    byteCount: bytes.length,
  };
  await expect(
    validateFlightPdfExtraction(
      { ...fixturePdf.extraction, originalSha256: "0".repeat(64) },
      original,
      hash,
    ),
  ).rejects.toThrow("PDF_ORIGINAL_MISMATCH");
  await expect(
    validateFlightPdfExtraction(
      { ...fixturePdf.extraction, pages: fixturePdf.extraction.pages.slice(0, 1) },
      original,
      hash,
    ),
  ).rejects.toThrow("PDF_PAGE_MAPPING_INVALID");
  await expect(
    validateFlightPdfExtraction(
      {
        ...fixturePdf.extraction,
        pages: [{ pageIndex: 0, start: 0, end: 1 }],
        text: "é",
      },
      original,
      hash,
    ),
  ).rejects.toThrow();
  expect(() =>
    flightPdfEvidencePages(flightPdfExtractionSchema.parse(fixturePdf.extraction), -1, 2),
  ).toThrow();
});
it("retains adapter IDs before CLOSED publication and does not queue local Candidate facts", async () => {
  const f = await fixture(),
    batch = await admittedPdfBatch(f);
  const result = await f
    .native()
    .build(await f.context(), f.capture.id, f.capture.revision, batch);
  const publish = vi.fn<CoreCandidatePublicationTransport["publishSourceCandidates"]>(
    async () => {
      throw new Error("CORE_SOURCE_EVIDENCE_CLOSED");
    },
  );
  const transport = {
    publishSourceCandidates: publish,
    prepareSourcePlan: vi.fn(),
    finalizeSourceSlot: vi.fn(),
  } as CoreCandidatePublicationTransport & CoreSourcePlanTransport;
  await expect(
    f
      .native()
      .prepareAndQueue(
        await f.context(),
        f.capture.id,
        f.capture.revision,
        transport,
        f.core,
      ),
  ).rejects.toThrow("CORE_SOURCE_EVIDENCE_CLOSED");
  f.reopen();
  await expect(
    f
      .native()
      .prepareAndQueue(
        await f.context(),
        f.capture.id,
        f.capture.revision,
        transport,
        f.core,
      ),
  ).rejects.toThrow("CORE_SOURCE_EVIDENCE_CLOSED");
  expect(publish.mock.calls[0][1]).toEqual(publish.mock.calls[1][1]);
  expect(publish.mock.calls[0][1].publicationId).toBe(
    result.built.publication.publicationId,
  );
  expect(f.count("sync_operations")).toBe(0);
  expect(f.count("trip_core_itinerary_events")).toBe(0);
  expect(await coreHashValue("native-test", result.plan, hash)).toMatch(/^[a-f0-9]{64}$/);
});

it.skipIf(!process.env.OTR_CORE_OWNED_SQL_FIXTURE)(
  "actual owning Core SQL keeps native PDF-derived candidates in REVIEW with no commands or accepted Items",
  async () => {
    const { session, seedPublicationSource } =
      await import("../../../backend/src/__fixtures__/tripCoreV2Sql");
    const { createCorePgHttpConnection } =
      await import("../../../backend/src/tripCoreV2PgHttpConnection");
    const { prepareCoreSourcePlanV2 } =
      await import("../../../backend/src/tripCoreV2Source");
    const f = await fixture(),
      batch = await admittedPdfBatch(f);
    const prepared = await f
      .native()
      .build(await f.context(), f.capture.id, f.capture.revision, batch);
    const local = await f.call(),
      owned = process.env.OTR_CORE_OWNED_SQL_FIXTURE!;
    const admin = session(owned);
    try {
      await seedPublicationSource(
        admin,
        { materials: batch.request.materials, request: prepared.built.publication },
        f.account,
        f.trip,
        prepared.built.sourcePublication,
        {
          representationId: local.identities.originalRepresentationId,
          sha256: local.extraction.originalSha256,
          byteCount: bytes.length,
        },
      );
      // Bounded synthetic fixture only: permit owning Source metadata writes to observe REVIEW.
      await admin.lease.query(
        "DO $$DECLARE c record;BEGIN FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.trip_core_activation_gate'::regclass AND contype='c' LOOP EXECUTE format('ALTER TABLE public.trip_core_activation_gate DROP CONSTRAINT %I',c.conname);END LOOP;END$$",
      );
      await admin.lease.query(
        "UPDATE public.trip_core_activation_gate SET runtime_enabled=true,enabled_commands=ARRAY['CREATE_SPARSE_FLIGHT','QUALIFY_FLIGHT'],enabled_families=ARRAY['P2'],enabled_admission_modes=ARRAY['REVIEWED_SOURCE']",
      );
      const core = createCorePgHttpConnection(
        {
          async withLease<T>(
            work: (
              lease: import("../../../backend/src/tripCoreV2PgStorage").CorePgLease,
            ) => Promise<T>,
          ) {
            const s = session(owned);
            try {
              await s.lease.query("SET SESSION AUTHORIZATION otr_trip_core_v2_gateway");
              return await work(s.lease);
            } finally {
              s.close();
            }
          },
        },
        hash,
      );
      let losePublicationResponse = true;
      const transport: CoreCandidatePublicationTransport & CoreSourcePlanTransport = {
        publishSourceCandidates: async (ctx, input) => {
          const response = await core.publishSourceCandidates!(
            ctx.accountId,
            ctx.tripId,
            input,
          );
          if (losePublicationResponse) {
            losePublicationResponse = false;
            throw new Error("SYNTHETIC_LOST_PUBLICATION_RESPONSE");
          }
          return response;
        },
        prepareSourcePlan: (ctx, input) =>
          prepareCoreSourcePlanV2(core.source!, ctx.accountId, ctx.tripId, input, hash),
        finalizeSourceSlot: async () => {
          throw new Error("NO_NATIVE_READY_SLOT");
        },
      };
      await expect(
        f
          .native()
          .prepareAndQueue(
            await f.context(),
            f.capture.id,
            f.capture.revision,
            transport,
            f.core,
          ),
      ).rejects.toThrow("SYNTHETIC_LOST_PUBLICATION_RESPONSE");
      f.reopen();
      const result = await f
        .native()
        .prepareAndQueue(
          await f.context(),
          f.capture.id,
          f.capture.revision,
          transport,
          f.core,
        );
      expect(result.publication.candidates).toHaveLength(2);
      expect(
        result.publication.candidates.every(
          (c) => c.status === "REVIEW" && c.errorCode === "CONTRACT_UNSUPPORTED",
        ),
      ).toBe(true);
      expect(result.preparation.readyCommands).toHaveLength(0);
      expect(result.preparation.reviewSlots.length).toBeGreaterThan(0);
      expect(f.count("sync_operations")).toBe(0);
      expect(f.count("trip_core_itinerary_events")).toBe(0);
      f.reopen();
      const repeated = await f
        .native()
        .prepareAndQueue(
          await f.context(),
          f.capture.id,
          f.capture.revision,
          transport,
          f.core,
        );
      expect(repeated).toEqual(result);
      expect(await createCoreFlightDayFeedReader(f.core)(f.trip)).toBeNull();
      console.log(
        JSON.stringify({
          classification: "CP_FLIGHT_NATIVE_01_CLOSED_SQL_REVIEW",
          originalSha256: local.extraction.originalSha256,
          sourceId: local.identities.sourceId,
          runId: local.identities.runId,
          candidateIds: prepared.set.candidates.map((c) => c.id),
          review: result.publication.candidates.map((c) => c.errorCode),
          queuedCommands: 0,
          acceptedLocalItems: 0,
          restartReplay: true,
          lostPublicationRecovered: true,
        }),
      );
    } finally {
      admin.close();
    }
  },
);

it("SQLite54→55 preserves all prior objects and populated C2 originals", async () => {
  const f = await fixture(54);
  const objects = f.sql
    .prepare(
      "SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all();
  const tables = f.sql
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all();
  const snapshots = tables.map((t) => ({
    table: String(t.name),
    rows: f.sql.prepare(`SELECT * FROM "${t.name}"`).all(),
  }));
  f.sql.exec(migrations.find((m) => m.id === 55)!.sql);
  for (const object of objects)
    expect(
      f.sql.prepare("SELECT name,sql FROM sqlite_master WHERE name=?").get(object.name),
    ).toEqual(object);
  for (const snapshot of snapshots)
    expect(f.sql.prepare(`SELECT * FROM "${snapshot.table}"`).all()).toEqual(
      snapshot.rows,
    );
  expect((await f.call()).extraction.originalSha256).toBe(
    fixturePdf.extraction.originalSha256,
  );
  const row = f.sql.prepare("SELECT * FROM capture_flight_native_preparations").get()!;
  expect(() =>
    f.sql
      .prepare("UPDATE capture_flight_native_preparations SET identities_json='{}'")
      .run(),
  ).toThrow("NATIVE_FLIGHT_PREPARATION_IMMUTABLE");
  expect(
    f.sql.prepare("SELECT identities_json FROM capture_flight_native_preparations").get()!
      .identities_json,
  ).toBe(row.identities_json);
});
it("reassignment cannot silently allocate replacement import identities in the same Trip", async () => {
  const f = await fixture(),
    first = await f.call();
  const inbox = await f.inbox.assign(f.capture.id, null, f.capture.revision);
  const restored = await f.inbox.assign(f.capture.id, f.trip, inbox.revision);
  await expect(
    f.native().extract(await f.context(), restored.id, restored.revision),
  ).rejects.toThrow("NATIVE_FLIGHT_CAPTURE_STALE");
  expect(f.count("capture_flight_native_preparations")).toBe(1);
  const row = f.sql
    .prepare("SELECT identities_json FROM capture_flight_native_preparations")
    .get()!;
  expect(JSON.parse(row.identities_json as string)).toEqual(first.identities);
});
