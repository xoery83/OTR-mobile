import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrations } from "./migrations";
import { runMigrations, type MigrationDatabase } from "./migrationRunner";
import { createCaptureSubmissionRepository } from "../repositories/captureSubmissionRepository";
import type { LocalCaptureDatabase } from "../repositories/localCaptureInboxRepository";
import type { SubmissionRequest } from "../../domain/capture/captureSubmission";

const accountId = "11111111-1111-4111-8111-111111111111";
const tripId = "22222222-2222-4222-8222-222222222222";
const personId = "33333333-3333-4333-8333-333333333333";
const at = "2026-10-19T00:00:00.000000Z";
const digest = (n: number) => n.toString(16).padStart(64, "0");

function adapter(sql: DatabaseSync): MigrationDatabase {
  return {
    async execAsync(query) {
      sql.exec(query);
    },
    async getFirstAsync<T>(query: string, ...args: unknown[]) {
      return (sql.prepare(query).get(...(args as never[])) ?? null) as T | null;
    },
    async runAsync(query, ...args) {
      return sql.prepare(query).run(...(args as never[]));
    },
    async withTransactionAsync(work) {
      sql.exec("BEGIN");
      try {
        await work();
        sql.exec("COMMIT");
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function install68(sql: DatabaseSync) {
  sql.exec(
    "CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL)",
  );
  for (const m of migrations.filter(({ id }) => id <= 68)) {
    sql.exec(m.sql);
    sql
      .prepare("INSERT INTO schema_migrations VALUES(?,?,?)")
      .run(m.id, m.name, "before69");
  }
  // An actual old-table BLOB sentinel must survive the new schema verbatim.
  sql
    .prepare(
      "INSERT INTO local_capture_payloads(account_id,id,byte_count,sha256,bytes) VALUES(?,?,?,?,?)",
    )
    .run(accountId, "retained-original", 3n, digest(1), new Uint8Array([0, 128, 255]));
}

async function populate68(sql: DatabaseSync) {
  const captureDb: LocalCaptureDatabase = {
    async getFirstAsync<T>(query: string, ...args: unknown[]) {
      return (sql.prepare(query).get(...(args as never[])) ?? null) as T | null;
    },
    async getAllAsync<T>(query: string, ...args: unknown[]) {
      return sql.prepare(query).all(...(args as never[])) as T[];
    },
    async runAsync(query, ...args) {
      const result = sql.prepare(query).run(...(args as unknown as never[]));
      return {
        changes: Number(result.changes),
        lastInsertRowId: Number(result.lastInsertRowid),
      };
    },
    async withTransactionAsync(work) {
      sql.exec("BEGIN");
      try {
        await work();
        sql.exec("COMMIT");
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const batchId = randomUUID();
  const inputs = [randomUUID(), randomUUID()];
  const request: SubmissionRequest = {
    formatVersion: 1,
    manifestVersion: 1,
    accountId,
    batchId,
    jobId: randomUUID(),
    submissionKey: randomUUID(),
    createdAt: "2026-10-19T00:00:00.000Z",
    context: {
      id: randomUUID(),
      version: 1,
      accountId,
      batchId,
      observedAt: "2026-10-19T00:00:00.000Z",
      clock: "DEVICE_WALL",
      entrySurface: "CAPTURE",
      tripPrior: null,
    },
    inputs: inputs.map((id, ordinal) => ({
      id,
      itemKey: randomUUID(),
      ordinal,
      acquisitionSource: "files",
      kind: "FILE",
      originalFilename: ordinal ? "return.jpg" : "outbound.pdf",
      declaredContentType: ordinal ? "image/jpeg" : "application/pdf",
      continuesFromInputId: null,
    })),
  };
  const repo = createCaptureSubmissionRepository(captureDb, async () => accountId, {
    sha256: async (bytes) => createHash("sha256").update(bytes).digest("hex"),
    newId: randomUUID,
    now: () => "2026-10-19T00:00:00.000Z",
  });
  const readers = new Map(
    inputs.map((id, index) => [
      id,
      async () => ({ bytes: new Uint8Array(index ? [4, 5, 6] : [1, 2, 3]) }),
    ]),
  );
  const result = await repo.submit(request, readers);
  expect(result.allInputsAccepted).toBe(true);
  const sourceId = randomUUID(),
    representationId = randomUUID(),
    runId = randomUUID(),
    candidateId = randomUUID();
  sql.exec("BEGIN");
  try {
    sql
      .prepare(
        `INSERT INTO trip_sources(cache_account_id,id,trip_id,acquired_by,acquisition_key,acquisition_sha256,source_kind,acquisition_channel,capture_time_basis,current_material_revision,row_revision)
      VALUES(?,?,?,?,'pre69-source',?,'FILE','FILES','UNKNOWN',1,1)`,
      )
      .run(accountId, sourceId, tripId, accountId, digest(30));
    sql
      .prepare(
        `INSERT INTO trip_source_revisions(cache_account_id,source_id,material_revision,created_by,operation_key,capture_sha256,original_representation_ids,completeness,reason)
      VALUES(?,?,1,?,'pre69-source',?,?,'AS_SUPPLIED','ACQUISITION')`,
      )
      .run(
        accountId,
        sourceId,
        accountId,
        digest(30),
        JSON.stringify([representationId]),
      );
    sql
      .prepare(
        `INSERT INTO trip_source_representations(cache_account_id,id,row_revision,source_id,introduced_revision,role,material_kind,payload_sha256,byte_count,regenerability,remote_state,transfer_state)
      VALUES(?,?,1,?,1,'ORIGINAL','BINARY',?,3,'POSSIBLE','PENDING','PENDING')`,
      )
      .run(accountId, representationId, sourceId, digest(30));
    sql
      .prepare(
        `INSERT INTO trip_source_runs(cache_account_id,id,row_revision,trip_id,actor_account_id,operation_key,scope_source_ids,scope_sha256,generation,input_sha256,extractor_key,extractor_version,extractor_options_sha256)
      VALUES(?,?,1,?,?,'pre69-run',?,?,1,?,'test-extractor','1',?)`,
      )
      .run(
        accountId,
        runId,
        tripId,
        accountId,
        JSON.stringify([sourceId]),
        digest(31),
        digest(32),
        digest(33),
      );
    sql
      .prepare(
        `INSERT INTO trip_source_candidates(cache_account_id,id,run_id,candidate_key,candidate_kind,proposal_version,proposal_sha256,proposal)
      VALUES(?,?,?,'segment:0','TRANSPORT',1,?,'{}')`,
      )
      .run(accountId, candidateId, runId, digest(34));
    sql
      .prepare(
        "INSERT INTO trip_core_scopes(account_id,trip_id,refresh_generation,access_revision,revoked) VALUES(?,?,1,1,0)",
      )
      .run(accountId, tripId);
    sql
      .prepare(
        `INSERT INTO trip_core_read_certificates(account_id,trip_id,epoch,revision,access_revision,applied_generation,actor_person_binding_hash,roster_hash,manifest_sha256,business_version,read_version,temporal_version,complete)
      VALUES(?,?,'pre69-epoch','1',1,1,?,?,?,2,2,1,1)`,
      )
      .run(accountId, tripId, digest(35), digest(36), digest(37));
    sql
      .prepare(
        `INSERT INTO sync_operations(id,trip_id,entity_type,entity_id,operation_type,idempotency_key,payload_json,status,created_at,updated_at,owner_user_id,failure_category)
      VALUES(?,?,'SOURCE',?,'SOURCE_PDF_UPLOAD',?,'{}','UNKNOWN',?,?,?,'UNKNOWN')`,
      )
      .run(randomUUID(), tripId, sourceId, randomUUID(), at, at, accountId);
    sql.exec("COMMIT");
  } catch (error) {
    sql.exec("ROLLBACK");
    throw error;
  }
}

function manualCommit(sql: DatabaseSync, commitId: string) {
  sql
    .prepare(
      `INSERT INTO local_core_authority_commits
    (account_id,trip_id,commit_id,authority_version,authority_kind,envelope_schema_id,actor_person_id,envelope_sha256,envelope_json,created_at)
    VALUES(?,?,?,1,'LOCAL_MANUAL','otr.trip.local-manual-commit/1',?,?,?,?)`,
    )
    .run(accountId, tripId, commitId, personId, digest(2), "{}", at);
}

function manualSlot(sql: DatabaseSync, commitId: string, claim: string) {
  const slotId = randomUUID();
  const queueId = randomUUID();
  const targetId = randomUUID();
  sql
    .prepare(
      `INSERT INTO sync_operations
    (id,trip_id,entity_type,entity_id,operation_type,idempotency_key,payload_json,status,created_at,updated_at,owner_user_id)
    VALUES(?,?,'TRIP_CORE_LOCAL',?,'LOCAL_CORE_COMMIT',?,?,'DEPENDENCY_BLOCKED',?,?,?)`,
    )
    .run(
      queueId,
      tripId,
      targetId,
      slotId,
      JSON.stringify({
        schemaId: "otr.trip.local-core-queue/1",
        commitId,
        slotId,
        receiptSha256: digest(5),
      }),
      at,
      at,
      accountId,
    );
  sql
    .prepare(
      `INSERT INTO local_core_authority_slots
    (account_id,trip_id,commit_id,slot_id,slot_key,disposition,target_kind,target_id,operation_id,queue_operation_id,intent_sha256,local_revision,result_digest,receipt_sha256,command_json,receipt_json,depends_on_json,claim_identity,created_at)
    VALUES(?,?,?,?,?,'CREATE','ITEM',?,?,?,?,1,? ,?,'{}','{}','[]',?,?)`,
    )
    .run(
      accountId,
      tripId,
      commitId,
      slotId,
      slotId,
      targetId,
      queueId,
      queueId,
      digest(3),
      digest(4),
      digest(5),
      claim,
      at,
    );
  return { slotId, queueId };
}

describe("SQLite69 local Core authority journal", () => {
  it("reopens a populated 68 file through the normal runner without losing old bytes", async () => {
    const directory = mkdtempSync(join(tmpdir(), "otr-local-core69-"));
    const path = join(directory, "offline.sqlite");
    try {
      let sql = new DatabaseSync(path);
      sql.exec("PRAGMA foreign_keys=ON");
      install68(sql);
      await populate68(sql);
      const priorTables = [
        "capture_submission_batches",
        "capture_submission_inputs",
        "local_capture_payloads",
        "trip_sources",
        "trip_source_revisions",
        "trip_source_representations",
        "trip_source_runs",
        "trip_source_candidates",
        "trip_core_scopes",
        "trip_core_read_certificates",
        "sync_operations",
      ];
      const snapshot = () =>
        priorTables.map((table) => [
          table,
          sql.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
        ]);
      const before = snapshot();
      sql.close();
      sql = new DatabaseSync(path);
      sql.exec("PRAGMA foreign_keys=ON");
      await runMigrations(adapter(sql));
      expect(snapshot()).toEqual(before);
      expect(sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      sql.close();
      sql = new DatabaseSync(path);
      expect(
        sql.prepare("SELECT id,name FROM schema_migrations WHERE id=69").get(),
      ).toEqual({ id: 69, name: "local_core_authority_v1" });
      expect(snapshot()).toEqual(before);
      sql.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([true, false])(
    "upgrades populated 68, retains old bytes, and enforces immutable shared claims with FK=%s",
    async (fk) => {
      const sql = new DatabaseSync(":memory:");
      try {
        sql.exec(`PRAGMA foreign_keys=${fk ? "ON" : "OFF"}`);
        install68(sql);
        const oldPayload = sql
          .prepare("SELECT *,typeof(bytes) byte_type FROM local_capture_payloads")
          .get();
        const oldHistory = sql
          .prepare("SELECT * FROM schema_migrations ORDER BY id")
          .all();
        const db = adapter(sql);
        await runMigrations(db);
        expect(
          sql.prepare("SELECT * FROM schema_migrations WHERE id<=68 ORDER BY id").all(),
        ).toEqual(oldHistory);
        expect(
          sql
            .prepare("SELECT *,typeof(bytes) byte_type FROM local_capture_payloads")
            .get(),
        ).toEqual(oldPayload);
        expect(
          sql.prepare("SELECT id,name FROM schema_migrations WHERE id=69").get(),
        ).toEqual({ id: 69, name: "local_core_authority_v1" });
        const first = randomUUID(),
          second = randomUUID();
        manualCommit(sql, first);
        manualCommit(sql, second);
        const { slotId } = manualSlot(sql, first, digest(9));
        expect(() => manualSlot(sql, second, digest(9))).toThrow();
        expect(() =>
          sql
            .prepare(
              "UPDATE local_core_authority_slots SET result_digest=? WHERE slot_id=?",
            )
            .run(digest(6), slotId),
        ).toThrow(/LOCAL_CORE_SLOT_IMMUTABLE/);
        expect(() =>
          sql
            .prepare("DELETE FROM local_core_authority_commits WHERE commit_id=?")
            .run(first),
        ).toThrow(/LOCAL_CORE_AUTHORITY_RETAINED/);
        expect(() =>
          sql
            .prepare(
              "INSERT INTO local_core_authority_commits(account_id,trip_id,commit_id,authority_version,authority_kind,envelope_schema_id,actor_person_id,envelope_sha256,envelope_json,created_at) VALUES(?,?,?,1,'LOCAL_REVIEWED_SOURCE','otr.trip.local-reviewed-import/1',?,?,?,?)",
            )
            .run(accountId, tripId, randomUUID(), personId, digest(1), "{}", at),
        ).toThrow();
        expect(sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
        const applied = sql.prepare("SELECT * FROM schema_migrations ORDER BY id").all();
        await runMigrations(db);
        expect(sql.prepare("SELECT * FROM schema_migrations ORDER BY id").all()).toEqual(
          applied,
        );
      } finally {
        sql.close();
      }
    },
  );

  it("rolls back partially applied 69 DDL and history without changing old rows", async () => {
    const sql = new DatabaseSync(":memory:");
    try {
      sql.exec("PRAGMA foreign_keys=ON");
      install68(sql);
      const schema = sql
        .prepare("SELECT type,name,sql FROM sqlite_schema ORDER BY type,name")
        .all();
      const oldPayload = sql.prepare("SELECT * FROM local_capture_payloads").all();
      const history = sql.prepare("SELECT * FROM schema_migrations ORDER BY id").all();
      const db = adapter(sql);
      const exec = db.execAsync;
      db.execAsync = async (query) => {
        if (!query.includes("CREATE TABLE local_core_authority_commits"))
          return exec(query);
        return exec(
          query.replace(
            "CREATE UNIQUE INDEX local_core_authority_create_claim",
            "CREATE BROKEN INDEX local_core_authority_create_claim",
          ),
        );
      };
      await expect(runMigrations(db)).rejects.toThrow();
      expect(
        sql.prepare("SELECT type,name,sql FROM sqlite_schema ORDER BY type,name").all(),
      ).toEqual(schema);
      expect(sql.prepare("SELECT * FROM local_capture_payloads").all()).toEqual(
        oldPayload,
      );
      expect(sql.prepare("SELECT * FROM schema_migrations ORDER BY id").all()).toEqual(
        history,
      );
      db.execAsync = exec;
      await runMigrations(db);
      expect(sql.prepare("SELECT id FROM schema_migrations WHERE id=69").get()).toEqual({
        id: 69,
      });
    } finally {
      sql.close();
    }
  });

  it("enforces a 1 MiB envelope and at most 64 committed slots", async () => {
    const sql = new DatabaseSync(":memory:");
    try {
      sql.exec("PRAGMA foreign_keys=ON");
      install68(sql);
      await runMigrations(adapter(sql));
      const oversized = JSON.stringify({ data: "x".repeat(1048576) });
      expect(() =>
        sql
          .prepare(
            `INSERT INTO local_core_authority_commits
        (account_id,trip_id,commit_id,authority_version,authority_kind,envelope_schema_id,actor_person_id,envelope_sha256,envelope_json,created_at)
        VALUES(?,?,?,1,'LOCAL_MANUAL','otr.trip.local-manual-commit/1',?,?,?,?)`,
          )
          .run(accountId, tripId, randomUUID(), personId, digest(2), oversized, at),
      ).toThrow();
      const commitId = randomUUID();
      manualCommit(sql, commitId);
      for (let i = 0; i < 64; i++) manualSlot(sql, commitId, digest(100 + i));
      expect(
        sql
          .prepare("SELECT count(*) n FROM local_core_authority_slots WHERE commit_id=?")
          .get(commitId)?.n,
      ).toBe(64);
      expect(() => manualSlot(sql, commitId, digest(164))).toThrow(
        /LOCAL_CORE_SLOT_LIMIT/,
      );
      expect(sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      sql.close();
    }
  });

  it("rolls back header and local queue together when a competing CREATE claim loses", async () => {
    const sql = new DatabaseSync(":memory:");
    try {
      sql.exec("PRAGMA foreign_keys=ON");
      install68(sql);
      await runMigrations(adapter(sql));
      const winner = randomUUID(),
        loser = randomUUID();
      sql.exec("BEGIN");
      manualCommit(sql, winner);
      manualSlot(sql, winner, digest(70));
      sql.exec("COMMIT");
      const queueBefore = sql.prepare("SELECT id FROM sync_operations ORDER BY id").all();
      sql.exec("BEGIN");
      let conflicted = false;
      try {
        manualCommit(sql, loser);
        manualSlot(sql, loser, digest(70));
      } catch {
        conflicted = true;
        sql.exec("ROLLBACK");
      }
      expect(conflicted).toBe(true);
      expect(
        sql.prepare("SELECT commit_id FROM local_core_authority_commits").all(),
      ).toEqual([{ commit_id: winner }]);
      expect(sql.prepare("SELECT id FROM sync_operations ORDER BY id").all()).toEqual(
        queueBefore,
      );
      expect(sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      sql.close();
    }
  });

  it("retains referenced Source material, Run and Candidate even when foreign keys are off", async () => {
    const sql = new DatabaseSync(":memory:");
    try {
      sql.exec("PRAGMA foreign_keys=OFF");
      install68(sql);
      await populate68(sql);
      await runMigrations(adapter(sql));
      const accepted = sql
        .prepare(
          "SELECT input_id,batch_id,capture_id,accepted_capture_revision,accepted_payload_id,content_sha256,content_byte_count FROM capture_submission_inputs WHERE account_id=? AND acceptance_state='ACCEPTED' ORDER BY ordinal LIMIT 1",
        )
        .get(accountId) as {
        input_id: string;
        batch_id: string;
        capture_id: string;
        accepted_capture_revision: number;
        accepted_payload_id: string;
        content_sha256: string;
        content_byte_count: number;
      };
      sql
        .prepare(
          "UPDATE local_capture_inbox SET trip_id=?,state='ASSIGNED',revision=revision+1 WHERE account_id=? AND id=? AND state='INBOX'",
        )
        .run(tripId, accountId, accepted.capture_id);
      const assigned = sql
        .prepare("SELECT revision FROM local_capture_inbox WHERE account_id=? AND id=?")
        .get(accountId, accepted.capture_id) as { revision: number };
      expect(assigned.revision).toBe(accepted.accepted_capture_revision + 1);
      const sourceId = randomUUID(),
        representationId = randomUUID();
      const runId = randomUUID(),
        candidateId = randomUUID();
      const commitId = randomUUID(),
        slotId = randomUUID();
      // This deliberately uses structural-only synthetic parents with FK-OFF;
      // the production owning validator must also validate their evidence.
      sql
        .prepare(
          `INSERT INTO trip_sources(cache_account_id,id,trip_id,acquired_by,acquisition_key,acquisition_sha256,source_kind,acquisition_channel,capture_time_basis,current_material_revision,row_revision)
        VALUES(?,?,?,?,'local-test',?,'FILE','FILES','UNKNOWN',1,1)`,
        )
        .run(accountId, sourceId, tripId, accountId, digest(10));
      sql
        .prepare(
          `INSERT INTO trip_source_revisions(cache_account_id,source_id,material_revision,created_by,operation_key,capture_sha256,original_representation_ids,completeness,reason)
        VALUES(?,?,1,?,'local-test',?,?,'AS_SUPPLIED','ACQUISITION')`,
        )
        .run(
          accountId,
          sourceId,
          accountId,
          digest(10),
          JSON.stringify([representationId]),
        );
      sql
        .prepare(
          `INSERT INTO trip_source_representations(cache_account_id,id,row_revision,source_id,introduced_revision,role,material_kind,payload_sha256,byte_count,regenerability,remote_state,transfer_state)
        VALUES(?, ?,1,?,1,'ORIGINAL','BINARY',?,3,'POSSIBLE','PENDING','PENDING')`,
        )
        .run(accountId, representationId, sourceId, digest(10));
      sql
        .prepare(
          `INSERT INTO trip_source_runs(cache_account_id,id,row_revision,trip_id,actor_account_id,operation_key,scope_source_ids,scope_sha256,generation,input_sha256,extractor_key,extractor_version,extractor_options_sha256)
        VALUES(?, ?,1,?,?,'local-test',?,?,1,?,'test-extractor','1',?)`,
        )
        .run(
          accountId,
          runId,
          tripId,
          accountId,
          JSON.stringify([sourceId]),
          digest(11),
          digest(12),
          digest(13),
        );
      sql
        .prepare(
          `INSERT INTO trip_source_candidates(cache_account_id,id,run_id,candidate_key,candidate_kind,proposal_version,proposal_sha256,proposal)
        VALUES(?,?,?,'segment:0','TRANSPORT',1,?,'{}')`,
        )
        .run(accountId, candidateId, runId, digest(14));
      sql
        .prepare(
          "UPDATE trip_source_runs SET state='READY',completed_at=? WHERE cache_account_id=? AND id=?",
        )
        .run(at, accountId, runId);
      sql
        .prepare(
          `INSERT INTO local_capture_source_bindings(account_id,id,admission_key,capture_id,capture_revision,capture_payload_id,material_sha256,byte_count,trip_id,intent_kind,source_id,representation_id,material_revision,source_operation_id,source_operation_key,source_operation_sha256,state,created_at)
        VALUES(?,?,?, ?,?,?,?, ?,?,'NEW',?,?,1,?,?,?,'PREPARED',?)`,
        )
        .run(
          accountId,
          randomUUID(),
          randomUUID(),
          accepted.capture_id,
          assigned.revision,
          accepted.accepted_payload_id,
          accepted.content_sha256,
          accepted.content_byte_count,
          tripId,
          sourceId,
          representationId,
          randomUUID(),
          randomUUID(),
          digest(28),
          at,
        );
      const confirmationId = randomUUID();
      const pin = {
        sourceId,
        materialRevision: 1,
        representationId,
        sourceLocalRevision: 1,
        captureId: accepted.capture_id,
        captureRevision: accepted.accepted_capture_revision,
        batchId: accepted.batch_id,
        inputId: accepted.input_id,
        originalSha256: accepted.content_sha256,
        originalByteCount: accepted.content_byte_count,
        extractionResultDigest: digest(18),
        evidenceCatalogDigest: digest(19),
      };
      sql
        .prepare(
          `INSERT INTO local_core_review_decisions(account_id,trip_id,confirmation_id,confirmation_key,decision_revision,actor_account_id,reviewed_run_id,reviewed_run_revision,input_digest,candidate_set_digest,selections_digest,decision_sha256,decision_json,selections_json,candidate_refs_json,material_pins_json,saved_at)
        VALUES(?,?,?,'review:1',1,?,?,1,?,?,?,?, '{}','[{}]',?,?,?)`,
        )
        .run(
          accountId,
          tripId,
          confirmationId,
          accountId,
          runId,
          digest(12),
          digest(15),
          digest(26),
          digest(16),
          JSON.stringify([candidateId]),
          JSON.stringify([pin]),
          at,
        );
      // Review is durable before Core commit: pruning any pinned fact is refused.
      expect(() =>
        sql.prepare("DELETE FROM trip_source_candidates WHERE id=?").run(candidateId),
      ).toThrow(/LOCAL_CORE_CANDIDATE_RETAINED/);
      expect(() =>
        sql
          .prepare(
            "UPDATE trip_source_representations SET payload_sha256=NULL,retention_state='IDENTITY_ONLY' WHERE id=?",
          )
          .run(representationId),
      ).toThrow(/LOCAL_CORE_REPRESENTATION_MATERIAL_RETAINED/);
      expect(() =>
        sql.prepare("DELETE FROM trip_source_runs WHERE id=?").run(runId),
      ).toThrow(/LOCAL_CORE_RUN_RETAINED/);
      expect(() =>
        sql
          .prepare(
            "UPDATE local_core_review_decisions SET decision_revision=2 WHERE confirmation_id=?",
          )
          .run(confirmationId),
      ).toThrow(/LOCAL_CORE_REVIEW_IMMUTABLE/);
      sql
        .prepare(
          `INSERT INTO local_core_authority_commits(account_id,trip_id,commit_id,authority_version,authority_kind,envelope_schema_id,reviewed_run_id,run_revision,input_digest,candidate_set_digest,confirmation_id,confirmation_key,decision_revision,decision_sha256,envelope_sha256,envelope_json,created_at)
        VALUES(?,?,?,1,'LOCAL_REVIEWED_SOURCE','otr.trip.local-reviewed-import/1',?,1,?,?,?,'review:1',1,?,?,'{}',?)`,
        )
        .run(
          accountId,
          tripId,
          commitId,
          runId,
          digest(12),
          digest(15),
          confirmationId,
          digest(16),
          digest(17),
          at,
        );
      sql
        .prepare(
          `INSERT INTO local_core_authority_materials(account_id,trip_id,commit_id,source_id,material_revision,representation_id,source_local_revision,capture_id,capture_revision,batch_id,input_id,original_sha256,original_byte_count,extraction_result_digest,evidence_catalog_digest)
        VALUES(?,?,?,?,1,?,1,?,?,?,?,?,?,?,?)`,
        )
        .run(
          accountId,
          tripId,
          commitId,
          sourceId,
          representationId,
          accepted.capture_id,
          accepted.accepted_capture_revision,
          accepted.batch_id,
          accepted.input_id,
          accepted.content_sha256,
          accepted.content_byte_count,
          digest(18),
          digest(19),
        );
      const targetId = randomUUID(),
        operationId = randomUUID();
      sql
        .prepare(
          `INSERT INTO sync_operations(id,trip_id,entity_type,entity_id,operation_type,idempotency_key,payload_json,status,created_at,updated_at,owner_user_id)
        VALUES(?,?,'TRIP_CORE_LOCAL',?,'LOCAL_CORE_COMMIT',?,?,'DEPENDENCY_BLOCKED',?,?,?)`,
        )
        .run(
          operationId,
          tripId,
          targetId,
          slotId,
          JSON.stringify({
            schemaId: "otr.trip.local-core-queue/1",
            commitId,
            slotId,
            receiptSha256: digest(24),
          }),
          at,
          at,
          accountId,
        );
      sql
        .prepare(
          `INSERT INTO local_core_authority_slots(account_id,trip_id,commit_id,slot_id,slot_key,disposition,target_kind,target_id,operation_id,queue_operation_id,candidate_id,candidate_sha256,reviewed_run_id,output_purpose_digest,intent_sha256,proof_sha256,local_revision,result_digest,receipt_sha256,command_json,proof_json,receipt_json,depends_on_json,claim_identity,created_at)
        VALUES(?,?,?,?,?,'CREATE','ITEM',?,?,?,?,?,?,?,?,?,1,?,?,'{}','{}','{}','[]',?,?)`,
        )
        .run(
          accountId,
          tripId,
          commitId,
          slotId,
          slotId,
          targetId,
          operationId,
          operationId,
          candidateId,
          digest(14),
          runId,
          digest(20),
          digest(21),
          digest(22),
          digest(23),
          digest(24),
          digest(25),
          at,
        );
      // Both authority variants share one CREATE claim index.
      sql.exec("BEGIN");
      try {
        const manualId = randomUUID();
        manualCommit(sql, manualId);
        expect(() => manualSlot(sql, manualId, digest(25))).toThrow();
      } finally {
        sql.exec("ROLLBACK");
      }
      expect(() =>
        sql.prepare("DELETE FROM trip_sources WHERE id=?").run(sourceId),
      ).toThrow(/LOCAL_CORE_SOURCE_RETAINED/);
      expect(() =>
        sql.prepare("DELETE FROM trip_source_revisions WHERE source_id=?").run(sourceId),
      ).toThrow(/LOCAL_CORE_REVISION_RETAINED/);
      expect(() =>
        sql
          .prepare("DELETE FROM trip_source_representations WHERE id=?")
          .run(representationId),
      ).toThrow(/LOCAL_CORE_REPRESENTATION_RETAINED/);
      expect(() =>
        sql
          .prepare(
            "UPDATE trip_sources SET acquisition_sha256=NULL,retention_state='IDENTITY_ONLY' WHERE id=?",
          )
          .run(sourceId),
      ).toThrow(/LOCAL_CORE_SOURCE_MATERIAL_RETAINED/);
      expect(() =>
        sql
          .prepare(
            "UPDATE trip_source_revisions SET capture_sha256=NULL,retention_state='IDENTITY_ONLY' WHERE source_id=?",
          )
          .run(sourceId),
      ).toThrow(/LOCAL_CORE_REVISION_MATERIAL_RETAINED/);
      expect(() =>
        sql
          .prepare(
            "UPDATE trip_source_representations SET payload_sha256=NULL,retention_state='IDENTITY_ONLY' WHERE id=?",
          )
          .run(representationId),
      ).toThrow(/LOCAL_CORE_REPRESENTATION_MATERIAL_RETAINED/);
      expect(() =>
        sql
          .prepare(
            "UPDATE trip_source_runs SET retention_state='IDENTITY_ONLY' WHERE id=?",
          )
          .run(runId),
      ).toThrow(/LOCAL_CORE_RUN_MATERIAL_RETAINED/);
      expect(() =>
        sql
          .prepare(
            "UPDATE trip_source_candidates SET proposal=NULL,retention_state='IDENTITY_ONLY' WHERE id=?",
          )
          .run(candidateId),
      ).toThrow(/LOCAL_CORE_CANDIDATE_MATERIAL_RETAINED/);
      // An unrelated registration observation remains possible.
      sql
        .prepare(
          "UPDATE trip_source_representations SET registration_state='REGISTERED',created_at=? WHERE id=?",
        )
        .run(at, representationId);
      expect(
        sql
          .prepare(
            "SELECT registration_state FROM trip_source_representations WHERE id=?",
          )
          .get(representationId),
      ).toEqual({ registration_state: "REGISTERED" });
    } finally {
      sql.close();
    }
  });
});
