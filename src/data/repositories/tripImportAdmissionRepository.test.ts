import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { migrations } from "@/data/db/migrations";
import { serializeDatabaseTransactions } from "@/data/db/databaseConnection";
import {
  beginAccountTransition,
  endAccountTransition,
} from "@/data/auth/accountRequestContext";
import { canonicalEventJson } from "@/domain/trip/eventIntentJson";
import { flightCommandLeaves, flightEndpointSchema } from "@/domain/trip/flightAdmission";
import { validateImportSnapshot } from "./tripImportCatalogRecovery";
import { tripImportSnapshotSchema } from "@/data/api/tripImportCatalogContracts";
import {
  createTripImportAdmissionRepository,
  type ImportAdmissionDatabase,
} from "./tripImportAdmissionRepository";
import { createLocalCaptureInboxRepository } from "./localCaptureInboxRepository";
import {
  createCaptureSourceAdmissionRepository,
  type CaptureSourceAdmission,
} from "./captureSourceAdmissionRepository";
import phases from "./__fixtures__/tripImportPhases.json";
import intents from "./__fixtures__/tripImportIntents.json";
import catalogs from "./__fixtures__/tripImportCatalogs.json";
const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const actor = catalogs.actor_account_id,
  trip = catalogs.trip_id;
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
function fixture(foreignKeys: boolean, path = ":memory:", initialize = true) {
  const sql = new DatabaseSync(path);
  connections.push(sql);
  sql.exec(`PRAGMA foreign_keys=${foreignKeys ? "ON" : "OFF"}`);
  if (initialize) for (const m of migrations) sql.exec(m.sql);
  if (initialize)
    sql
      .prepare(
        "INSERT INTO ledger_actor_context(user_id,journey_id,role,capabilities_json,updated_at) VALUES(?,?,'group_member','{}',?)",
      )
      .run(actor, trip, "2026-10-05T00:00:00.000000Z");
  const database: ImportAdmissionDatabase = serializeDatabaseTransactions({
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
  const repo = createTripImportAdmissionRepository(
    database,
    async () => actor,
    hash,
    () => "2026-10-05T00:00:00.000000Z",
    randomUUID,
  );
  return { sql, repo, database };
}
describe.each([true, false])("CP13A native SQLite recovery FK=%s", (foreignKeys) => {
  it("applies exact SQL-produced catalogs, replays neutrally, and never creates Event/Day authority", async () => {
    const { sql, repo } = fixture(foreignKeys),
      context = await repo.captureContext(trip);
    expect(tripImportSnapshotSchema.safeParse(catalogs).success).toBe(true);
    expect(await repo.applyCatalogs(context, JSON.stringify(catalogs))).toBe("APPLIED");
    expect(await repo.applyCatalogs(context, JSON.stringify(catalogs))).toBe("APPLIED");
    expect(sql.prepare("SELECT COUNT(*) n FROM trip_source_output_slots").get()?.n).toBe(
      3,
    );
    expect(sql.prepare("SELECT COUNT(*) n FROM trip_canonical_events").get()?.n).toBe(0);
    expect(sql.prepare("SELECT COUNT(*) n FROM sync_operations").get()?.n).toBe(0);
    expect(
      sql
        .prepare(
          "SELECT create_claim_active,no_commit_basis FROM trip_source_output_slots WHERE slot_id=?",
        )
        .get(
          catalogs.trip_source_output_slots.find((s) => s.state === "FAILED")!.slot_id,
        ),
    ).toMatchObject({
      create_claim_active: 0,
      no_commit_basis: "VERIFIED_TERMINAL_RECEIPT",
    });
  });
  it("rejects mixed scope and missing ancestry atomically even without FK enforcement", async () => {
    const { sql, repo } = fixture(foreignKeys),
      context = await repo.captureContext(trip);
    const foreign = structuredClone(catalogs);
    foreign.trip_sources[0].trip_id = randomUUID();
    await expect(repo.applyCatalogs(context, JSON.stringify(foreign))).rejects.toThrow(
      "IMPORT_CATALOG_INTEGRITY",
    );
    const missing = structuredClone(catalogs);
    missing.trip_source_representations = [];
    await expect(repo.applyCatalogs(context, JSON.stringify(missing))).rejects.toThrow(
      "IMPORT_CATALOG_INTEGRITY",
    );
    expect(sql.prepare("SELECT COUNT(*) n FROM trip_sources").get()?.n).toBe(0);
  });
  it("rejects receipt rebinding and same revision changes while retaining the original claim", async () => {
    const { sql, repo } = fixture(foreignKeys),
      context = await repo.captureContext(trip);
    await repo.applyCatalogs(context, JSON.stringify(catalogs));
    const altered = structuredClone(catalogs);
    altered.trip_source_output_slots[0].receipt_sha256 = "f".repeat(64);
    await expect(repo.applyCatalogs(context, JSON.stringify(altered))).rejects.toThrow();
    expect(
      sql
        .prepare("SELECT receipt_sha256 FROM trip_source_output_slots WHERE slot_id=?")
        .get(catalogs.trip_source_output_slots[0].slot_id)?.receipt_sha256,
    ).toBe(catalogs.trip_source_output_slots[0].receipt_sha256);
  });
  it("blocks an old A callback after A to B to A and permits fresh recovery", async () => {
    const { repo } = fixture(foreignKeys),
      old = await repo.captureContext(trip);
    const toB = await beginAccountTransition();
    endAccountTransition(toB);
    const backToA = await beginAccountTransition();
    endAccountTransition(backToA);
    await expect(repo.applyCatalogs(old, JSON.stringify(catalogs))).rejects.toThrow(
      "Account changed",
    );
    const current = await repo.captureContext(trip);
    expect(await repo.applyCatalogs(current, JSON.stringify(catalogs))).toBe("APPLIED");
  });
  it("rejects copied unsupported dimensions at the strict projection boundary", async () => {
    const { repo } = fixture(foreignKeys),
      context = await repo.captureContext(trip),
      raw = structuredClone(catalogs) as unknown as Record<string, unknown>;
    (raw.trip_source_candidates as Record<string, unknown>[])[0].proposal = {
      fields: { passengers: { proposed_value: ["private-name"] } },
    };
    await expect(repo.applyCatalogs(context, JSON.stringify(raw))).rejects.toThrow();
  });
});

describe.each([true, false])("CP13A Capture admission FK=%s", (foreignKeys) => {
  async function captureFixture() {
    const f = fixture(foreignKeys),
      now = () => "2026-10-05T00:00:00.000000Z";
    const inbox = createLocalCaptureInboxRepository(f.database, async () => actor, {
      sha256: hash,
      newId: randomUUID,
      now,
    });
    const capture = await inbox.intake(
      {
        kind: "TEXT",
        tripId: trip,
        originalFilename: null,
        declaredContentType: "text/plain",
      },
      { bytes: new TextEncoder().encode("Verified source text") },
    );
    const repo = createCaptureSourceAdmissionRepository(f.database, async () => actor, {
      sha256: hash,
      newId: randomUUID,
      now,
      handoff: (id) => inbox.getForSourceHandoff(id),
      readSelectedMaterial: async () => null,
    });
    const plan: CaptureSourceAdmission = {
      id: randomUUID(),
      admission_key: "explicit-new",
      capture_id: capture.id,
      capture_revision: capture.revision,
      intent_kind: "NEW",
      source_id: randomUUID(),
      representation_id: randomUUID(),
      material_revision: 1,
      expected_source_revision: null,
      source_operation_id: randomUUID(),
      source_operation_key: "source-new-1",
    };
    return { ...f, inbox, capture, repo, plan, context: await repo.captureContext(trip) };
  }
  it("Capture insert creates no Source; explicit NEW metadata and durable operation replay exactly", async () => {
    const { sql, inbox, capture, repo, plan, context } = await captureFixture();
    expect(sql.prepare("SELECT COUNT(*) n FROM trip_sources").get()?.n).toBe(0);
    expect(await repo.admit(context, plan)).toMatchObject({
      state: "PREPARED",
      source_id: plan.source_id,
    });
    expect(await repo.admit(context, plan)).toMatchObject({ state: "PREPARED" });
    expect(sql.prepare("SELECT COUNT(*) n FROM trip_sources").get()?.n).toBe(1);
    expect(
      sql
        .prepare(
          "SELECT COUNT(*) n FROM sync_operations WHERE operation_type='C_ADMIT_CAPTURE_SOURCE'",
        )
        .get()?.n,
    ).toBe(1);
    expect((await inbox.getForSourceHandoff(capture.id)).bytes).toEqual(
      new TextEncoder().encode("Verified source text"),
    );
    await repo.markUnknown(context, plan.id, 1);
    expect((await repo.recovery(context, plan.id)).binding.state).toBe("OUTCOME_UNKNOWN");
    await expect(inbox.deleteCapture(capture.id, capture.revision)).rejects.toThrow();
  });
  it("same key with altered stable identity rejects and rolls back", async () => {
    const { sql, repo, plan, context } = await captureFixture();
    await repo.admit(context, plan);
    await expect(
      repo.admit(context, { ...plan, source_id: randomUUID() }),
    ).rejects.toThrow("CAPTURE_SOURCE_KEY_REUSED");
    expect(sql.prepare("SELECT COUNT(*) n FROM trip_sources").get()?.n).toBe(1);
  });
  it("explicit REUSE requires exact material bytes and creates no Source or queue", async () => {
    const {
      sql,
      inbox,
      plan,
      context,
      database,
      repo: pendingRepo,
    } = await captureFixture();
    // This Capture deliberately starts with other material; replay cannot deduce
    // Source identity from that hash. Select the exact registered source explicitly.
    const mirror = createTripImportAdmissionRepository(
      database,
      async () => actor,
      hash,
      () => "2026-10-05T00:00:00.000000Z",
      randomUUID,
    );
    await mirror.applyCatalogs(context, JSON.stringify(catalogs));
    const source = catalogs.trip_sources[0],
      representation = catalogs.trip_source_representations.find(
        (r) => r.source_id === source.id,
      )!;
    const bytes = new TextEncoder().encode(representation.text_content!);
    const capture = await inbox.intake(
      {
        kind: "TEXT",
        tripId: trip,
        originalFilename: null,
        declaredContentType: "text/plain",
      },
      { bytes },
    );
    const selected = {
      ...plan,
      capture_id: capture.id,
      capture_revision: capture.revision,
      intent_kind: "REUSE" as const,
      source_id: source.id,
      representation_id: representation.id,
      expected_source_revision: source.row_revision,
      source_operation_id: null,
      source_operation_key: null,
    };
    const reuse = createCaptureSourceAdmissionRepository(database, async () => actor, {
      sha256: hash,
      newId: randomUUID,
      now: () => "2026-10-05T00:00:00.000000Z",
      handoff: (id) => inbox.getForSourceHandoff(id),
      readSelectedMaterial: async () => bytes,
    });
    expect(await reuse.admit(context, selected)).toMatchObject({ state: "ADMITTED" });
    expect(await reuse.admit(context, selected)).toMatchObject({ state: "ADMITTED" });
    expect(sql.prepare("SELECT COUNT(*) n FROM sync_operations").get()?.n).toBe(0);
    expect(sql.prepare("SELECT COUNT(*) n FROM trip_sources").get()?.n).toBe(
      catalogs.trip_sources.length,
    );
    expect((await pendingRepo.recovery(context, plan.id)).binding.intent_kind).toBe(
      "REUSE",
    );
  });
  it("replacement uses exact Source CAS and leaves the current manifest pointer untouched while pending", async () => {
    const { sql, database, repo, plan, context } = await captureFixture();
    const mirror = createTripImportAdmissionRepository(
      database,
      async () => actor,
      hash,
      () => "2026-10-05T00:00:00.000000Z",
      randomUUID,
    );
    await mirror.applyCatalogs(context, JSON.stringify(catalogs));
    const source = catalogs.trip_sources[0];
    const replacement = {
      ...plan,
      intent_kind: "REPLACEMENT" as const,
      source_id: source.id,
      material_revision: 2,
      expected_source_revision: source.row_revision,
    };
    expect(await repo.admit(context, replacement)).toMatchObject({ state: "PREPARED" });
    expect(
      sql
        .prepare(
          "SELECT current_material_revision,row_revision FROM trip_sources WHERE id=?",
        )
        .get(source.id),
    ).toMatchObject({ current_material_revision: 1, row_revision: source.row_revision });
    expect(
      sql
        .prepare(
          "SELECT previous_revision,registration_state FROM trip_source_revisions WHERE source_id=? AND material_revision=2",
        )
        .get(source.id),
    ).toMatchObject({ previous_revision: 1, registration_state: "PENDING" });
    await expect(
      repo.admit(context, {
        ...replacement,
        id: randomUUID(),
        admission_key: "stale-replacement",
        representation_id: randomUUID(),
        expected_source_revision: source.row_revision + 1,
      }),
    ).rejects.toThrow("CAPTURE_SOURCE_STALE");
  });
  it("REUSE with matching hash but unavailable exact selected bytes fails closed", async () => {
    const { repo, plan, context } = await captureFixture();
    await expect(
      repo.admit(context, {
        ...plan,
        intent_kind: "REUSE",
        expected_source_revision: 1,
        source_operation_id: null,
        source_operation_key: null,
      }),
    ).rejects.toThrow("CAPTURE_SOURCE_STALE");
  });
});

describe.each([true, false])("CP13A cold restart and upgrade FK=%s", (foreignKeys) => {
  it("reopens exact durable C observations and offline draft without network/bootstrap", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cp13a-recovery-"));
    folders.push(dir);
    const path = join(dir, "device.db");
    const first = fixture(foreignKeys, path),
      c = await first.repo.captureContext(trip);
    await first.repo.applyCatalogs(c, JSON.stringify(catalogs));
    const run = catalogs.trip_source_runs[0],
      review = catalogs.trip_source_output_slots[0].reviewed_payload;
    await first.repo.saveDraft(
      c,
      "offline-review",
      run.id,
      null,
      review,
      run.input_sha256,
    );
    const before = JSON.stringify(
      first.sql.prepare("SELECT * FROM trip_source_review_drafts").all(),
    );
    const slots = JSON.stringify(
      first.sql.prepare("SELECT * FROM trip_source_output_slots ORDER BY slot_id").all(),
    );
    first.sql.close();
    const reopened = fixture(foreignKeys, path, false);
    expect(
      JSON.stringify(
        reopened.sql.prepare("SELECT * FROM trip_source_review_drafts").all(),
      ),
    ).toBe(before);
    expect(
      JSON.stringify(
        reopened.sql
          .prepare("SELECT * FROM trip_source_output_slots ORDER BY slot_id")
          .all(),
      ),
    ).toBe(slots);
    expect(await reopened.repo.pending(await reopened.repo.captureContext(trip))).toEqual(
      [],
    );
  });
  it("migration49 preserves every seeded old table and queue projection", () => {
    const sql = new DatabaseSync(":memory:");
    connections.push(sql);
    sql.exec(`PRAGMA foreign_keys=${foreignKeys ? "ON" : "OFF"}`);
    for (const m of migrations.filter((m) => m.id <= 48)) sql.exec(m.sql);
    sql
      .prepare(
        "INSERT INTO ledger_actor_context(user_id,journey_id,role,capabilities_json,updated_at) VALUES(?,?,'group_member','{}','2026-10-05T00:00:00.000Z')",
      )
      .run(actor, trip);
    sql
      .prepare(
        "INSERT INTO sync_operations(id,owner_user_id,trip_id,entity_type,entity_id,operation_type,idempotency_key,payload_json,status,attempt_count,created_at,updated_at) VALUES('old-op',?,?,'OLD','old','OLD_OPERATION','old-key','{\"unchanged\":true}','PENDING',3,'old-created','old-updated')",
      )
      .run(actor, trip);
    const names = sql
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r) => r.name as string);
    const rows = () =>
      Object.fromEntries(
        names.map((n) => [n, JSON.stringify(sql.prepare(`SELECT * FROM ${n}`).all())]),
      );
    const before = rows();
    sql.exec(migrations.find((m) => m.id === 49)!.sql);
    expect(rows()).toEqual(before);
  });
});

describe.each([true, false])("CP13A durable flight intent FK=%s", (foreignKeys) => {
  function beforeReview() {
    const snapshot = structuredClone(catalogs);
    snapshot.trip_source_confirmations = [];
    snapshot.trip_source_inputs = snapshot.trip_source_inputs.filter(
      (i) => i.confirmation_id === null,
    );
    snapshot.trip_source_output_slots = [];
    snapshot.trip_source_associations = [];
    snapshot.trip_source_slot_lineage_dispositions = [];
    snapshot.trip_source_slot_dependencies = [];
    return snapshot;
  }
  it("prepares exact pins and queue, restarts UNKNOWN, and caches exact receipt without adding Event authority", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cp13a-intent-"));
    folders.push(dir);
    const path = join(dir, "device.db"),
      f = fixture(foreignKeys, path),
      c = await f.repo.captureContext(trip);
    await f.repo.applyCatalogs(c, JSON.stringify(beforeReview()));
    await f.repo.prepare(c, JSON.stringify(intents.confirmation));
    await f.repo.prepare(c, JSON.stringify(intents.confirmation));
    expect((await f.repo.pending(c)).map((p) => p.operation_type)).toEqual([
      "C_PREPARE_CONFIRMATION",
    ]);
    const slot = intents.confirmation.slots[0];
    await f.repo.markDispatch(
      c,
      intents.confirmation.id,
      slot.slot_id,
      1,
      JSON.stringify(intents.command),
    );
    const queued = JSON.stringify(
      f.sql.prepare("SELECT * FROM sync_operations ORDER BY operation_type").all(),
    );
    f.sql.close();
    const reopened = fixture(foreignKeys, path, false),
      current = await reopened.repo.captureContext(trip);
    expect(
      JSON.stringify(
        reopened.sql
          .prepare("SELECT * FROM sync_operations ORDER BY operation_type")
          .all(),
      ),
    ).toBe(queued);
    expect(
      reopened.sql
        .prepare(
          "SELECT state,create_claim_active FROM trip_source_output_slots WHERE slot_id=?",
        )
        .get(slot.slot_id),
    ).toMatchObject({ state: "OUTCOME_UNKNOWN", create_claim_active: 1 });
    await reopened.repo.markDispatch(
      current,
      intents.confirmation.id,
      slot.slot_id,
      1,
      JSON.stringify(intents.command),
    );
    await reopened.repo.cacheReceipt(
      current,
      slot.slot_id,
      JSON.stringify(intents["create-receipt"]),
    );
    await reopened.repo.cacheReceipt(
      current,
      slot.slot_id,
      JSON.stringify(intents["create-receipt"]),
    );
    expect(
      reopened.sql.prepare("SELECT COUNT(*) n FROM trip_event_receipt_cache").get()?.n,
    ).toBe(1);
    expect(
      reopened.sql.prepare("SELECT COUNT(*) n FROM trip_canonical_events").get()?.n,
    ).toBe(0);
    expect(reopened.sql.prepare("SELECT COUNT(*) n FROM sync_operations").get()?.n).toBe(
      3,
    );
    await expect(
      reopened.repo.requestRevocation(current, intents.confirmation.id, slot.slot_id, 2),
    ).rejects.toThrow("DISPATCHED_OUTCOME_REQUIRES_RECEIPT");
  });
  it("queues revocation without prematurely releasing its CREATE claim", async () => {
    const f = fixture(foreignKeys),
      c = await f.repo.captureContext(trip);
    await f.repo.applyCatalogs(c, JSON.stringify(beforeReview()));
    await f.repo.prepare(c, JSON.stringify(intents.confirmation));
    const slot = intents.confirmation.slots[0];
    await f.repo.requestRevocation(c, intents.confirmation.id, slot.slot_id, 1);
    expect(
      f.sql
        .prepare(
          "SELECT state,create_claim_active,no_commit_basis FROM trip_source_output_slots WHERE slot_id=?",
        )
        .get(slot.slot_id),
    ).toMatchObject({ state: "PREPARED", create_claim_active: 1, no_commit_basis: null });
    expect(
      (await f.repo.pending(c)).some((p) => p.operation_type === "C_REVOKE_EVENT_SLOT"),
    ).toBe(true);
  });
  it("rejects stale material before handoff and immutable Representation byte rebinding", async () => {
    const f = fixture(foreignKeys),
      c = await f.repo.captureContext(trip);
    await f.repo.applyCatalogs(c, JSON.stringify(beforeReview()));
    await f.repo.prepare(c, JSON.stringify(intents.confirmation));
    const altered = beforeReview();
    altered.trip_source_representations[0].row_revision++;
    (
      altered.trip_source_representations[0] as Record<string, unknown>
    ).original_filename = "changed";
    await expect(f.repo.applyCatalogs(c, JSON.stringify(altered))).rejects.toThrow(
      "IMPORT_ADMISSION_INTEGRITY",
    );
    f.sql
      .prepare("UPDATE trip_sources SET row_revision=row_revision+1 WHERE id=?")
      .run(intents.confirmation.inputs[0].source_id);
    await expect(
      f.repo.markDispatch(
        c,
        intents.confirmation.id,
        intents.confirmation.slots[0].slot_id,
        1,
        JSON.stringify(intents.command),
      ),
    ).rejects.toThrow("INPUT_STALE");
    expect(f.sql.prepare("SELECT state FROM trip_source_output_slots").get()?.state).toBe(
      "PREPARED",
    );
  });
});

describe.each([true, false])("CP13A Capture cold binding FK=%s", (foreignKeys) => {
  it("reopens the exact uncertain Source binding, original BLOB and acquisition operation", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cp13a-capture-"));
    folders.push(dir);
    const path = join(dir, "device.db"),
      f = fixture(foreignKeys, path);
    const now = () => "2026-10-05T00:00:00.000000Z";
    const inbox = createLocalCaptureInboxRepository(f.database, async () => actor, {
      sha256: hash,
      newId: randomUUID,
      now,
    });
    const capture = await inbox.intake(
      {
        kind: "TEXT",
        tripId: trip,
        originalFilename: null,
        declaredContentType: "text/plain",
      },
      { bytes: new TextEncoder().encode("Cold retained material") },
    );
    const dependencies = {
      sha256: hash,
      newId: randomUUID,
      now,
      handoff: (id: string) => inbox.getForSourceHandoff(id),
      readSelectedMaterial: async () => null,
    };
    const repo = createCaptureSourceAdmissionRepository(
      f.database,
      async () => actor,
      dependencies,
    );
    const plan: CaptureSourceAdmission = {
      id: randomUUID(),
      admission_key: "cold-source",
      capture_id: capture.id,
      capture_revision: capture.revision,
      intent_kind: "NEW",
      source_id: randomUUID(),
      representation_id: randomUUID(),
      material_revision: 1,
      expected_source_revision: null,
      source_operation_id: randomUUID(),
      source_operation_key: "cold-source-op",
    };
    const context = await repo.captureContext(trip);
    await repo.admit(context, plan);
    await repo.markUnknown(context, plan.id, 1);
    const before = JSON.stringify(await repo.recovery(context, plan.id));
    f.sql.close();
    const reopened = fixture(foreignKeys, path, false);
    const coldInbox = createLocalCaptureInboxRepository(
      reopened.database,
      async () => actor,
      { sha256: hash, newId: randomUUID, now },
    );
    const cold = createCaptureSourceAdmissionRepository(
      reopened.database,
      async () => actor,
      { ...dependencies, handoff: (id) => coldInbox.getForSourceHandoff(id) },
    );
    expect(
      JSON.stringify(await cold.recovery(await cold.captureContext(trip), plan.id)),
    ).toBe(before);
    expect((await coldInbox.getForSourceHandoff(capture.id)).bytes).toEqual(
      new TextEncoder().encode("Cold retained material"),
    );
    expect(reopened.sql.prepare("SELECT COUNT(*) n FROM sync_operations").get()?.n).toBe(
      1,
    );
    expect(reopened.sql.prepare("SELECT COUNT(*) n FROM trip_sources").get()?.n).toBe(1);
  });
  it("fences a paused A catalog apply across actual B and later A identities", async () => {
    const f = fixture(foreignKeys);
    let active = actor;
    const repo = createTripImportAdmissionRepository(
      f.database,
      async () => active,
      hash,
      () => "2026-10-05T00:00:00.000000Z",
      randomUUID,
    );
    const old = await repo.captureContext(trip),
      toB = await beginAccountTransition();
    active = randomUUID();
    endAccountTransition(toB);
    await expect(repo.applyCatalogs(old, JSON.stringify(catalogs))).rejects.toThrow(
      "Account changed",
    );
    expect(f.sql.prepare("SELECT COUNT(*) n FROM trip_sources").get()?.n).toBe(0);
    const back = await beginAccountTransition();
    active = actor;
    endAccountTransition(back);
    await expect(repo.applyCatalogs(old, JSON.stringify(catalogs))).rejects.toThrow(
      "Account changed",
    );
    expect(
      await repo.applyCatalogs(await repo.captureContext(trip), JSON.stringify(catalogs)),
    ).toBe("APPLIED");
  });
});

describe.each([true, false])(
  "CP13A authoritative acknowledgements FK=%s",
  (foreignKeys) => {
    it("registers prepare and dispatch with actual server clocks, preserving UNKNOWN against a late prepare", async () => {
      const f = fixture(foreignKeys),
        c = await f.repo.captureContext(trip);
      const before = structuredClone(phases.prepared);
      before.trip_source_confirmations = [];
      before.trip_source_inputs = before.trip_source_inputs.filter(
        (i) => i.confirmation_id === null,
      );
      before.trip_source_output_slots = [];
      await f.repo.applyCatalogs(c, JSON.stringify(before));
      await f.repo.prepare(c, JSON.stringify(intents.confirmation));
      await f.repo.applyCatalogs(c, JSON.stringify(phases.prepared));
      expect(
        f.sql
          .prepare("SELECT registration_state,created_at FROM trip_source_confirmations")
          .get(),
      ).toMatchObject({
        registration_state: "REGISTERED",
        created_at: phases.prepared.trip_source_confirmations[0].created_at,
      });
      const slot = intents.confirmation.slots[0];
      await f.repo.markDispatch(
        c,
        intents.confirmation.id,
        slot.slot_id,
        1,
        JSON.stringify(intents.command),
      );
      expect(
        f.sql.prepare("SELECT registration_state FROM trip_source_output_slots").get()
          ?.registration_state,
      ).toBe("PENDING");
      await f.repo.applyCatalogs(c, JSON.stringify(phases.dispatched));
      expect(
        f.sql
          .prepare(
            "SELECT state,registration_state,dispatched_at FROM trip_source_output_slots",
          )
          .get(),
      ).toMatchObject({
        state: "OUTCOME_UNKNOWN",
        registration_state: "REGISTERED",
        dispatched_at: phases.dispatched.trip_source_output_slots[0].dispatched_at,
      });
      await f.repo.applyCatalogs(c, JSON.stringify(phases.prepared));
      expect(
        f.sql.prepare("SELECT state,dispatched_at FROM trip_source_output_slots").get(),
      ).toMatchObject({
        state: "OUTCOME_UNKNOWN",
        dispatched_at: phases.dispatched.trip_source_output_slots[0].dispatched_at,
      });
    });
    it("registers server-authored lineage time and exact terminal no-commit proof after offline preparation", async () => {
      const f = fixture(foreignKeys),
        c = await f.repo.captureContext(trip),
        before = structuredClone(catalogs);
      before.trip_source_confirmations = [];
      before.trip_source_inputs = before.trip_source_inputs.filter(
        (i) => i.confirmation_id === null,
      );
      before.trip_source_output_slots = [];
      before.trip_source_associations = [];
      before.trip_source_slot_lineage_dispositions = [];
      before.trip_source_slot_dependencies = [];
      await f.repo.applyCatalogs(c, JSON.stringify(before));
      await f.repo.prepare(c, JSON.stringify(intents["terminal-intent"]));
      expect(
        f.sql
          .prepare(
            "SELECT reviewed_at,registration_state FROM trip_source_slot_lineage_dispositions",
          )
          .get(),
      ).toMatchObject({ reviewed_at: null, registration_state: "PENDING" });
      await f.repo.applyCatalogs(c, JSON.stringify(catalogs));
      const slot = intents["terminal-intent"].slots[0];
      expect(
        f.sql
          .prepare(
            "SELECT state,create_claim_active,no_commit_basis FROM trip_source_output_slots WHERE slot_id=?",
          )
          .get(slot.slot_id),
      ).toMatchObject({
        state: "FAILED",
        create_claim_active: 0,
        no_commit_basis: "VERIFIED_TERMINAL_RECEIPT",
      });
      expect(
        f.sql
          .prepare(
            "SELECT registration_state,reviewed_at FROM trip_source_slot_lineage_dispositions WHERE slot_id=?",
          )
          .get(slot.slot_id),
      ).toMatchObject({
        registration_state: "REGISTERED",
        reviewed_at: catalogs.trip_source_slot_lineage_dispositions.find(
          (r) => r.slot_id === slot.slot_id,
        )!.reviewed_at,
      });
    });
  },
);

describe("R3 bounded transitive Run recovery", () => {
  it.each(["transitive", "direct", "disconnected", "cycle", "bound"])(
    "validates %s ancestry",
    async (mode) => {
      const snapshot = structuredClone(catalogs);
      if (mode === "transitive")
        snapshot.trip_source_run_predecessors =
          snapshot.trip_source_run_predecessors.filter(
            (e) => !(e.child_run_id.endsWith("203") && e.parent_run_id.endsWith("003")),
          );
      if (mode === "disconnected") snapshot.trip_source_run_predecessors = [];
      if (mode === "cycle")
        snapshot.trip_source_run_predecessors.push({
          ...snapshot.trip_source_run_predecessors[0],
          child_run_id: snapshot.trip_source_runs[0].id,
          parent_run_id: snapshot.trip_source_runs[2].id,
        });
      if (mode === "bound")
        for (let i = 0; i < 65; i++)
          snapshot.trip_source_run_predecessors.push({
            ...snapshot.trip_source_run_predecessors[0],
            child_run_id: `ca130000-0000-4000-8000-${String(i + 900).padStart(12, "0")}`,
          });
      const result = validateImportSnapshot(actor, trip, snapshot as never, hash);
      if (["transitive", "direct"].includes(mode))
        await expect(result).resolves.toBeUndefined();
      else await expect(result).rejects.toThrow("IMPORT_CATALOG_INTEGRITY");
    },
  );
});

describe.each([true, false])("R1 durable dispatch complete selection FK=%s", (fk) => {
  it.each(["omit", "complete", "retained", "wrong-retained"])(
    "validates %s before queue/state mutation",
    async (mode) => {
      const omit = mode === "omit";
      const f = fixture(fk),
        c = await f.repo.captureContext(trip);
      const snapshot = structuredClone(catalogs);
      snapshot.trip_source_confirmations = [];
      snapshot.trip_source_inputs = snapshot.trip_source_inputs.filter(
        (i) => i.confirmation_id === null,
      );
      snapshot.trip_source_output_slots = [];
      snapshot.trip_source_associations = [];
      snapshot.trip_source_slot_lineage_dispositions = [];
      snapshot.trip_source_slot_dependencies = [];
      await f.repo.applyCatalogs(c, JSON.stringify(snapshot));
      const intent = structuredClone(intents.confirmation),
        slot = intent.slots[0];
      const origin = flightEndpointSchema.parse(intents.command.payload.origin),
        destination = structuredClone(origin);
      origin.time.source_instant = "2026-12-16T20:30:00.123456Z";
      destination.time.source_instant = "2026-12-17T08:00:00.123456Z";
      destination.location.authored_label = "Shanghai";
      Object.assign(slot, { disposition: "UPDATE", base_revision: 7 });
      slot.reviewed_payload.selected_fields = ["destination", "origin"];
      Object.assign(slot.reviewed_payload, { edits: { origin, destination } });
      const supports = slot.support_payload as Record<string, unknown>;
      for (const key of Object.keys(supports)) {
        if (!["origin", "destination"].includes(key)) delete supports[key];
        else
          supports[key] = {
            ...(supports[key] as object),
            origin: "USER_ENTERED",
            candidate_id: null,
            candidate_field_key: null,
            input_ids: [],
            edited_value: null,
          };
      }
      const changes = omit ? { destination } : { origin, destination };
      const command = {
        ...intents.command,
        command: "UPDATE_TRANSPORT",
        baseSemanticRevision: 7,
        payload: {
          changes,
          proofs: Object.fromEntries(
            Object.keys(flightCommandLeaves(changes)).map((k) => [
              k,
              { kind: "TRACK_C", ref: `track-c/field-evidence/${slot.slot_id}/${k}` },
            ]),
          ),
        },
      };
      f.sql
        .prepare(
          "INSERT INTO trip_canonical_events(account_id,trip_id,event_id,read_version,read_disposition,legacy_compatible,observation_sequence,observed_generation,temporal_contract_version,temporal_shape,semantic_revision,title,event_type,status,participant_scope,is_estimated_time) VALUES(?,?,?,1,'READ_ONLY',0,1,0,1,'TRANSPORT',7,'Flight','transport','planned','UNASSIGNED',0)",
        )
        .run(actor, trip, slot.intended_target_id);
      if (mode.includes("retained")) {
        command.payload.proofs["ORIGIN.authored_label"] = {
          kind: "RETAINED",
          ref:
            mode === "retained"
              ? "otr-event/confirmation/exact-old-label"
              : "otr-event/confirmation/wrong-old-label",
        };
        f.sql
          .prepare(
            "INSERT INTO trip_canonical_transport_endpoints(account_id,trip_id,event_id,role,authored_label,spatial_provenance_refs) VALUES(?,?,?,'ORIGIN',?,'{\"authored_label\":\"otr-event/confirmation/exact-old-label\"}')",
          )
          .run(actor, trip, slot.intended_target_id, origin.location.authored_label);
      }
      slot.domain_intent_sha256 = await hash(
        new TextEncoder().encode(
          canonicalEventJson({ ...command, encoding: "otr-event-intent-v1" } as never),
        ),
      );

      await f.repo.prepare(c, JSON.stringify(intent));
      const dispatch = () =>
        f.repo.markDispatch(c, intent.id, slot.slot_id, 1, JSON.stringify(command));
      if (omit || mode === "wrong-retained") {
        await expect(dispatch()).rejects.toThrow(
          omit ? "INVALID_PROVENANCE" : "IMPORT_ADMISSION_INTEGRITY",
        );
        expect(
          f.sql
            .prepare("SELECT state FROM trip_source_output_slots WHERE slot_id=?")
            .get(slot.slot_id)?.state,
        ).toBe("PREPARED");
        expect(
          f.sql
            .prepare(
              "SELECT COUNT(*) n FROM sync_operations WHERE operation_type='C_EXECUTE_EVENT_SLOT'",
            )
            .get()?.n,
        ).toBe(0);
      } else {
        await dispatch();
        await dispatch();
        expect(
          f.sql
            .prepare(
              "SELECT COUNT(*) n FROM sync_operations WHERE operation_type='C_EXECUTE_EVENT_SLOT'",
            )
            .get()?.n,
        ).toBe(1);
      }
    },
  );
});
