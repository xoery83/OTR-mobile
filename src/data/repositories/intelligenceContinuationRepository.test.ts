import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createIntelligenceWakeQueue,
  createSyncOperationRepository,
  validateIntelligenceWake,
  intelligenceWakeIdentity,
} from "../sync/syncOperationRepository";
import {
  createIntelligenceContinuationRuntime,
  createIntelligenceContinuationScheduling,
} from "../sync/intelligenceContinuationWakeWorker";
import {
  subscribeLedgerQueueWorkAvailable,
  getIntelligenceQueueActivity,
  getLedgerQueueActivity,
} from "../sync/ledgerQueueActivity";
import { verifyPublicationCorrelation } from "../../../backend/src/externalIntegrationPersistence";
import { migrations } from "../db/migrations";
import {
  createIntelligenceContinuationRepository,
  type ContinuationDatabase,
} from "./intelligenceContinuationRepository";
import {
  captureAccountRequestContext,
  beginAccountTransition,
  endAccountTransition,
} from "../auth/accountRequestContext";
import { canonicalEventJson, type Json } from "@/domain/trip/eventIntentJson";
import {
  taskSchema,
  attemptSchema,
  type Task,
  type Attempt,
  type ContinuationRoute,
  type ExecutionReport,
} from "@/domain/intelligence/persistence";
const central = vi.hoisted(() => ({ db: null as ContinuationDatabase | null }));
vi.mock("@/data/db/database", () => ({ openDatabase: async () => central.db! }));
vi.mock("@/data/auth/authRepository", () => ({
  requireActiveUserId: async () => account,
}));
vi.mock("@/data/operations/ledgerMaintenance", () => ({
  cleanupReconstructibleLedgerData: async () => {},
  enforceReceiptCacheLimit: async () => {},
}));
vi.mock("../sync/ledgerExpenseDemoCoordinator", () => ({
  runLedgerExpenseSync: async () => {},
}));
vi.mock("../sync/ledgerReceiptCoordinator", () => ({
  runLedgerReceiptSync: async () => {},
}));
vi.mock("../sync/ledgerReviewCoordinator", () => ({
  runLedgerReviewSync: async () => {},
}));
vi.mock("../sync/ledgerSettlementPaymentCoordinator", () => ({
  runLedgerSettlementPaymentSync: async () => {},
}));
vi.mock("../sync/ledgerPersonalPaymentCoordinator", () => ({
  runLedgerPersonalPaymentSync: async () => {},
}));
vi.mock("../sync/personalSettlementReviewCoordinator", () => ({
  runPersonalSettlementReviewSync: async () => {},
}));
// eslint-disable-next-line import/first
import {
  allowLedgerOperationalSync,
  pauseLedgerOperationalSync,
  setIntelligenceSchedulingAdapter,
  runLedgerOperationalSync,
  subscribeLedgerOperationalSyncCompletion,
} from "../sync/ledgerOperationalSync";
beforeAll(() => pauseLedgerOperationalSync());
const hash = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const digest = (v: unknown) =>
  hash(new TextEncoder().encode(canonicalEventJson(v as Json)));
const account = randomUUID(),
  now = "2026-10-06T01:00:00.000Z",
  h = "a".repeat(64);
const opened: DatabaseSync[] = [],
  folders: string[] = [];
afterEach(() => {
  for (const d of opened.splice(0))
    try {
      d.close();
    } catch {}
  for (const f of folders.splice(0)) rmSync(f, { recursive: true, force: true });
});
async function fixture(fk = true, path = ":memory:", initialize = true) {
  const sql = new DatabaseSync(path);
  opened.push(sql);
  sql.exec(`PRAGMA foreign_keys=${fk ? "ON" : "OFF"}`);
  if (initialize) for (const m of migrations) sql.exec(m.sql);
  const db: ContinuationDatabase = {
    async getFirstAsync<T>(q: string, ...p: unknown[]) {
      return (sql.prepare(q).get(...(p as unknown as never[])) ?? null) as T | null;
    },
    async getAllAsync<T>(q: string, ...p: unknown[]) {
      return sql.prepare(q).all(...(p as unknown as never[])) as T[];
    },
    async runAsync(q: string, ...p: unknown[]) {
      return sql.prepare(q).run(...(p as unknown as never[])) as never;
    },
    async withTransactionAsync(work) {
      sql.exec("BEGIN");
      try {
        await work();
        sql.exec("COMMIT");
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  };
  let current: string = account,
    admitted = true,
    waitEligible = true,
    attemptAdmitted = true;
  const deps = {
    async validateAttemptAdmission() {
      if (!attemptAdmitted) throw new Error("POLICY_OR_BUDGET_UNQUALIFIED");
    },
    async eligibleWait() {
      return waitEligible;
    },
    getAccountId: async () => current,
    now: () => now,
    sha256: hash,
    async verifyRecovery(_attempt: Attempt, evidenceDigest: string) {
      if (evidenceDigest !== h) throw new Error("UNTRUSTED_RECOVERY");
    },
    async validateAdmission(t: Task) {
      if (!admitted || t.manifest_sha256 !== h) throw new Error("STALE_MANIFEST_OR_TRIP");
    },
  };
  const repo = createIntelligenceContinuationRepository(db, deps),
    context = await captureAccountRequestContext("", deps.getAccountId);
  const policy = {
    version: 1,
    privacy: "LOCAL_ONLY",
    network_required: false,
    region: "DEVICE",
    budget_currency: null,
    budget_nanos: null,
    route: "DETERMINISTIC",
    max_attempts: 5,
    deadline: null,
  } as Task["policy_snapshot"];
  const t = taskSchema.parse({
    account_id: account,
    task_id: randomUUID(),
    format_version: 1,
    import_id: randomUUID(),
    manifest_version: 1,
    manifest_sha256: h,
    trip_id: null,
    stage: "INTERPRETATION",
    logical_request_id: randomUUID(),
    logical_idempotency_key: randomUUID(),
    input_pins: [],
    input_sha256: await digest([]),
    consumer_id: "import",
    schema_id: "flight",
    schema_dialect: "otr",
    consumer_version: 1,
    schema_version: 1,
    schema_sha256: h,
    capability_requirements: ["EXTRACT"],
    policy_snapshot: policy,
    policy_sha256: await digest(policy),
    run_id: null,
    expected_run_generation: null,
    candidate_id: null,
    expected_candidate_sha256: null,
    event_id: null,
    expected_event_revision: null,
    created_at: now,
    creation_clock: "DEVICE_WALL",
    row_revision: 1,
    publication_fence: 1,
    current_pass_complete: false,
    work_disposition: "PENDING",
    wait_reason: null,
    wait_reasons: [],
    sync_operation_id: null,
    dependencies: [],
    current_attempt_id: null,
    cancellation_disposition: "NONE",
    safe_reason: null,
    publication_id: null,
    publication_sha256: null,
    result_sha256: null,
    updated_at: now,
    update_clock: "DEVICE_WALL",
    completed_at: null,
  });
  async function enqueue(task = t) {
    const q = randomUUID();
    sql
      .prepare(
        "INSERT INTO sync_operations(id,owner_user_id,trip_id,entity_type,entity_id,operation_type,idempotency_key,payload_json,status,created_at,updated_at) VALUES(?,?,?,'INTELLIGENCE_CONTINUATION',?,'CP14_CLOSED',?,'{}','PROCESSING',?,?)",
      )
      .run(q, account, task.trip_id, task.task_id, randomUUID(), now, now);
    return q;
  }
  async function a(task = t, operationId?: string): Promise<Attempt> {
    const op = operationId ?? (await enqueue(task));
    const admission = { version: 1, policy_sha256: task.policy_sha256, allowed: true };
    return attemptSchema.parse({
      account_id: account,
      attempt_id: randomUUID(),
      task_id: task.task_id,
      attempt_sequence: 1,
      format_version: 1,
      request_id: randomUUID(),
      idempotency_key: randomUUID(),
      request_sha256: h,
      request_material_reference: null,
      request_material_sha256: null,
      predecessor_attempt_id: null,
      predecessor_request_id: null,
      integration_id: null,
      provider_id: null,
      model_id: null,
      model_version: null,
      adapter_version: null,
      provider_config_id: null,
      config_version: null,
      configuration_sha256: null,
      descriptor_snapshot: {
        version: 1,
        provider_class: "DETERMINISTIC",
        replay_support: "UNSUPPORTED",
        capabilities: ["EXTRACT"],
        modalities: ["TEXT"],
        network_required: false,
      },
      policy_admission: admission,
      policy_admission_sha256: await digest(admission),
      task_publication_fence: task.publication_fence,
      sync_operation_id: op,
      usage_correlation_id: null,
      fallback_chain_id: randomUUID(),
      shadow: false,
      shadow_of_attempt_id: null,
      created_at: now,
      creation_clock: "DEVICE_WALL",
      row_revision: 1,
      execution_observation: "NOT_STARTED",
      execution_outcome: null,
      result_install_disposition: "NONE",
      metering_disposition: "NOT_REQUIRED",
      safe_failure_code: null,
      response_material_reference: null,
      response_material_sha256: null,
      response_sha256: null,
      publication_sha256: null,
      started_at: null,
      ended_at: null,
      latency_ms: null,
      reported_usage_summary: null,
      updated_at: now,
      update_clock: "DEVICE_WALL",
    });
  }
  const observation = (
    state: Attempt["execution_observation"],
    outcome: Attempt["execution_outcome"] = null,
    response: string | null = null,
  ) => ({
    execution_observation: state,
    execution_outcome: outcome,
    metering_disposition: "NOT_REQUIRED" as const,
    response_material_reference: null,
    response_material_sha256: null,
    response_sha256: response,
    reported_usage_summary: null,
  });
  return {
    sql,
    db,
    deps,
    repo,
    context,
    t,
    a,
    enqueue,
    observation,
    setWaitEligible(v: boolean) {
      waitEligible = v;
    },
    setAttemptAdmitted(v: boolean) {
      attemptAdmitted = v;
    },
    setAccount(v: string) {
      current = v;
    },
    setAdmission(v: boolean) {
      admitted = v;
    },
  };
}
describe.each([true, false])("CP14 SQLite FK=%s", (fk) => {
  it("fresh and 49→50 preserve historical schema and queue", async () => {
    const f = await fixture(fk);
    expect(migrations.map((x) => x.id)).toEqual(
      Array.from({ length: 50 }, (_, i) => i + 1),
    );
    expect(
      f.sql
        .prepare("SELECT name FROM sqlite_master WHERE name='intelligence_continuations'")
        .get(),
    ).toBeTruthy();
    const db = new DatabaseSync(":memory:");
    try {
      for (const m of migrations.filter((x) => x.id < 50)) db.exec(m.sql);
      const before = db
        .prepare("SELECT sql FROM sqlite_master WHERE name='sync_operations'")
        .get();
      db.exec(migrations[49].sql);
      expect(
        db.prepare("SELECT sql FROM sqlite_master WHERE name='sync_operations'").get(),
      ).toEqual(before);
    } finally {
      db.close();
    }
  });
  it("exact create replay and changed identity reject", async () => {
    const f = await fixture(fk);
    await f.repo.create(f.context, f.t);
    expect(await f.repo.create(f.context, f.t)).toEqual(f.t);
    await expect(
      f.repo.create(f.context, { ...f.t, schema_sha256: "b".repeat(64) }),
    ).rejects.toThrow("CHANGED_TASK");
  });
  it("wait/pass complete and duplicate wake creates no attempt; CAS rejects", async () => {
    const f = await fixture(fk);
    await f.repo.create(f.context, f.t);
    const reasons = [
      {
        reason: "WAITING_FOR_NETWORK" as const,
        dependency_id: null,
        capability: null,
        policy_sha256: f.t.policy_sha256,
      },
    ];
    const t = await f.repo.wait(f.context, f.t.task_id, 1, reasons, true);
    expect(t.current_pass_complete).toBe(true);
    expect(t.work_disposition).toBe("WAITING");
    await expect(f.repo.finishPass(f.context, t.task_id, 1)).rejects.toThrow("CAS");
    expect(
      f.sql.prepare("SELECT count(*) n FROM intelligence_continuation_attempts").get()?.n,
    ).toBe(0);
  });
  it("UNKNOWN and queue lease expiry never permit new attempt", async () => {
    const f = await fixture(fk);
    await f.repo.create(f.context, f.t);
    const a = await f.a();
    await f.repo.reserveAttempt(f.context, a);
    await f.repo.observeAttempt(f.context, a.attempt_id, 1, f.observation("RUNNING"));
    await f.repo.observeAttempt(f.context, a.attempt_id, 2, f.observation("UNKNOWN"));
    f.sql
      .prepare("UPDATE sync_operations SET status='RETRYABLE' WHERE id=?")
      .run(a.sync_operation_id);
    expect(await f.repo.recoveryDisposition(f.context, f.t.task_id)).toBe(
      "EXACT_RECOVERY_REQUIRED",
    );
    const next = { ...a, attempt_id: randomUUID(), attempt_sequence: 2 };
    await expect(f.repo.reserveAttempt(f.context, next)).rejects.toThrow("FENCE");
    await expect(
      f.repo.observeAttempt(
        f.context,
        a.attempt_id,
        3,
        f.observation("TERMINAL", "SUCCEEDED", h),
      ),
    ).rejects.toThrow("TRANSITION");
  });
  it("result survives installation rollback and meter loss, install-only replay", async () => {
    const f = await fixture(fk);
    await f.repo.create(f.context, f.t);
    const a = await f.a();
    await f.repo.reserveAttempt(f.context, a);
    await f.repo.observeAttempt(f.context, a.attempt_id, 1, f.observation("RUNNING"));
    await f.repo.observeAttempt(f.context, a.attempt_id, 2, {
      ...f.observation("TERMINAL", "SUCCEEDED", h),
      metering_disposition: "COMPLETION_PENDING",
    });
    await expect(
      f.repo.installResult(f.context, a.attempt_id, 3, randomUUID(), h, async () => {
        throw new Error("INSTALL_FAILED");
      }),
    ).rejects.toThrow("INSTALL_FAILED");
    expect(await f.repo.recoveryDisposition(f.context, f.t.task_id)).toBe("INSTALL_ONLY");
    const installed = await f.repo.installResult(
      f.context,
      a.attempt_id,
      3,
      randomUUID(),
      h,
      async () => {},
    );
    expect(installed.metering_disposition).toBe("COMPLETION_PENDING");
    expect(installed.result_install_disposition).toBe("INSTALLED");
  });
  it("cancel retains late result facts and rejects install", async () => {
    const f = await fixture(fk);
    await f.repo.create(f.context, f.t);
    const a = await f.a();
    await f.repo.reserveAttempt(f.context, a);
    await f.repo.observeAttempt(f.context, a.attempt_id, 1, f.observation("RUNNING"));
    const t = await f.repo.read(f.context, f.t.task_id);
    await f.repo.fence(f.context, t.task_id, t.row_revision, "CANCELED");
    await f.repo.observeAttempt(
      f.context,
      a.attempt_id,
      2,
      f.observation("TERMINAL", "SUCCEEDED", h),
    );
    let called = false;
    const result = await f.repo.installResult(
      f.context,
      a.attempt_id,
      3,
      randomUUID(),
      h,
      async () => {
        called = true;
      },
    );
    expect(called).toBe(false);
    expect(result.result_install_disposition).toBe("REJECTED_CANCELED");
    expect(result.response_sha256).toBe(h);
  });
  it("retains referenced queue with FK OFF, immutable numeric types", async () => {
    const f = await fixture(fk);
    await f.repo.create(f.context, f.t);
    const a = await f.a();
    await f.repo.reserveAttempt(f.context, a);
    expect(() =>
      f.sql.prepare("DELETE FROM sync_operations WHERE id=?").run(a.sync_operation_id),
    ).toThrow("RETAINED");
    expect(() =>
      f.sql
        .prepare(
          "UPDATE intelligence_continuations SET manifest_version='2' WHERE task_id=?",
        )
        .run(f.t.task_id),
    ).toThrow();
  });
  it("Account A→B→A invalidates old callbacks, fresh A resumes", async () => {
    const f = await fixture(fk);
    await f.repo.create(f.context, f.t);
    let lease = await beginAccountTransition();
    f.setAccount(randomUUID());
    endAccountTransition(lease);
    lease = await beginAccountTransition();
    f.setAccount(account);
    endAccountTransition(lease);
    await expect(f.repo.read(f.context, f.t.task_id)).rejects.toThrow("Account changed");
    const fresh = await captureAccountRequestContext("", async () => account);
    expect((await f.repo.read(fresh, f.t.task_id)).task_id).toBe(f.t.task_id);
  });
  it("cyclic task dependencies and wrong queue Account reject", async () => {
    const f = await fixture(fk);
    await expect(
      f.repo.create(f.context, {
        ...f.t,
        dependencies: [{ kind: "TASK", id: f.t.task_id }],
      }),
    ).rejects.toThrow("CYCLE");
    await expect(
      f.repo.create(f.context, {
        ...f.t,
        dependencies: Array.from({ length: 65 }, () => ({
          kind: "TASK" as const,
          id: randomUUID(),
        })),
      }),
    ).rejects.toThrow();
    await f.repo.create(f.context, f.t);
    const q = await f.enqueue();
    f.sql
      .prepare("UPDATE sync_operations SET owner_user_id=? WHERE id=?")
      .run(randomUUID(), q);
    await expect(f.repo.bindQueue(f.context, f.t.task_id, 1, q)).rejects.toThrow("SCOPE");
  });
  it("shadow remains separate and never installs", async () => {
    const f = await fixture(fk);
    await f.repo.create(f.context, f.t);
    const a = await f.a();
    await f.repo.reserveAttempt(f.context, a);
    const shadow = {
      ...a,
      attempt_id: randomUUID(),
      request_id: randomUUID(),
      idempotency_key: randomUUID(),
      attempt_sequence: 2,
      shadow: true,
      shadow_of_attempt_id: a.attempt_id,
    };
    await f.repo.reserveAttempt(f.context, shadow);
    expect((await f.repo.read(f.context, f.t.task_id)).current_attempt_id).toBe(
      a.attempt_id,
    );
    await expect(
      f.repo.installResult(
        f.context,
        shadow.attempt_id,
        1,
        randomUUID(),
        h,
        async () => {},
      ),
    ).rejects.toThrow("SHADOW_NO_INSTALL");
  });
  it("unsupported waits terminate and bounded policy admission rejects escalation", async () => {
    const f = await fixture(fk);
    await f.repo.create(f.context, f.t);
    f.setWaitEligible(false);
    const t = await f.repo.wait(
      f.context,
      f.t.task_id,
      1,
      [
        {
          reason: "POLICY_BLOCKED",
          dependency_id: null,
          capability: null,
          policy_sha256: f.t.policy_sha256,
        },
      ],
      true,
    );
    expect(t.work_disposition).toBe("FAILED");
    expect(t.current_pass_complete).toBe(true);
    const a = await f.a();
    f.setAttemptAdmitted(false);
    await expect(f.repo.reserveAttempt(f.context, a)).rejects.toThrow(
      "BUDGET_UNQUALIFIED",
    );
    expect(
      f.sql.prepare("select count(*) n from intelligence_continuation_attempts").get()?.n,
    ).toBe(0);
  });
  it("Capture integrity and revision pins fence installation; retention works FK OFF", async () => {
    const f = await fixture(fk);
    const bytes = new TextEncoder().encode("synthetic evidence");
    const sha = await hash(bytes);
    const capture = randomUUID(),
      payload = randomUUID();
    f.sql
      .prepare(
        "insert into local_capture_payloads(account_id,id,byte_count,sha256,bytes) values(?,?,CAST(? AS INTEGER),?,?)",
      )
      .run(account, payload, bytes.length, sha, bytes);
    f.sql
      .prepare(
        "insert into local_capture_inbox(account_id,id,payload_id,kind,created_at,state,revision) values(?,?,?,'FILE',?,'INBOX',1)",
      )
      .run(account, capture, payload, now);
    const t = {
      ...f.t,
      input_pins: [
        {
          kind: "CAPTURE" as const,
          capture_id: capture,
          payload_id: payload,
          revision: 1,
          payload_sha256: sha,
          byte_count: bytes.length,
        },
      ],
    };
    t.input_sha256 = await digest(t.input_pins);
    await f.repo.create(f.context, t);
    const a = await f.a(t);
    await f.repo.reserveAttempt(f.context, a);
    expect(() =>
      f.sql.prepare("delete from local_capture_inbox where id=?").run(capture),
    ).toThrow("RETAINED");
    expect(() =>
      f.sql.prepare("delete from local_capture_payloads where id=?").run(payload),
    ).toThrow();
    await f.repo.observeAttempt(f.context, a.attempt_id, 1, f.observation("RUNNING"));
    await f.repo.observeAttempt(
      f.context,
      a.attempt_id,
      2,
      f.observation("TERMINAL", "SUCCEEDED", h),
    );
    f.sql
      .prepare(
        "update local_capture_inbox set trip_id=?,state='ASSIGNED',revision=2 where id=?",
      )
      .run(randomUUID(), capture);
    await expect(
      f.repo.installResult(f.context, a.attempt_id, 3, randomUUID(), h, async () => {
        throw new Error("MUST_NOT_INSTALL");
      }),
    ).rejects.toThrow("STALE_CAPTURE");
  });
  it("retains real Source revision/Input/Run/Candidate pins and rejects changed hashes", async () => {
    const f = await fixture(fk),
      trip = randomUUID(),
      source = randomUUID(),
      representation = randomUUID(),
      run = randomUUID(),
      input = randomUUID(),
      candidate = randomUUID();
    const text = "synthetic original",
      sha = await hash(new TextEncoder().encode(text));
    f.sql.exec("BEGIN");
    f.sql
      .prepare(
        "insert into trip_sources(cache_account_id,id,trip_id,acquired_by,acquisition_key,acquisition_sha256,source_kind,acquisition_channel,capture_time_basis,current_material_revision,row_revision) values(?,?,?,?,?,?,'TEXT','SYNTHETIC','UNKNOWN',1,1)",
      )
      .run(account, source, trip, account, randomUUID(), h);
    f.sql
      .prepare(
        "insert into trip_source_revisions(cache_account_id,source_id,material_revision,created_by,operation_key,capture_sha256,original_representation_ids,completeness,reason) values(?,?,1,?,?,?,?,'AS_SUPPLIED','ACQUISITION')",
      )
      .run(account, source, account, randomUUID(), h, JSON.stringify([representation]));
    f.sql
      .prepare(
        "insert into trip_source_representations(cache_account_id,id,row_revision,source_id,introduced_revision,role,material_kind,payload_sha256,byte_count,text_content,regenerability,remote_state,local_state,local_verified_at,transfer_state) values(?,?,1,?,1,'ORIGINAL','TEXT',?,?,?,'NOT_APPLICABLE','NOT_APPLICABLE','VERIFIED',?,'NOT_REQUIRED')",
      )
      .run(account, representation, source, sha, text.length, text, now);
    f.sql
      .prepare(
        "insert into trip_source_runs(cache_account_id,id,row_revision,trip_id,actor_account_id,operation_key,scope_source_ids,scope_sha256,generation,input_sha256,extractor_key,extractor_version,extractor_options_sha256,state) values(?,?,1,?,?,?,?,?,1,?,'synthetic','v1',?,'PENDING')",
      )
      .run(account, run, trip, account, randomUUID(), JSON.stringify([source]), h, h, h);
    f.sql
      .prepare(
        "insert into trip_source_inputs(cache_account_id,id,run_id,source_id,material_revision,representation_id,payload_sha256,byte_count,observed_source_row_revision) values(?,?,?,?,1,?,?,?,1)",
      )
      .run(account, input, run, source, representation, sha, text.length);
    f.sql
      .prepare(
        "insert into trip_source_candidates(cache_account_id,id,run_id,candidate_key,candidate_kind,proposal_version,proposal_sha256,proposal) values(?,?,?,?,'UNCLASSIFIED',1,?,'{}')",
      )
      .run(account, candidate, run, randomUUID(), h);
    f.sql.exec("COMMIT");
    const context = await captureAccountRequestContext(trip, async () => account);
    const pin = {
      kind: "SOURCE" as const,
      source_id: source,
      material_revision: 1,
      representation_id: representation,
      payload_sha256: sha,
      byte_count: text.length,
      input_id: input,
      transform_sha256: null,
    };
    const t = {
      ...f.t,
      trip_id: trip,
      input_pins: [pin],
      input_sha256: await digest([pin]),
      run_id: run,
      expected_run_generation: 1,
      candidate_id: candidate,
      expected_candidate_sha256: h,
    };
    await f.repo.create(context, t);
    for (const [table, key, value] of [
      ["trip_source_inputs", "id", input],
      ["trip_source_revisions", "source_id", source],
      ["trip_source_representations", "id", representation],
      ["trip_source_runs", "id", run],
      ["trip_source_candidates", "id", candidate],
    ] as const)
      expect(() =>
        f.sql.prepare(`delete from ${table} where ${key}=?`).run(value),
      ).toThrow();
    expect(() =>
      f.sql
        .prepare("update trip_source_inputs set payload_sha256=? where id=?")
        .run(h, input),
    ).toThrow("PIN_IMMUTABLE");
    f.sql
      .prepare("update trip_source_candidates set proposal_sha256=? where id=?")
      .run("b".repeat(64), candidate);
    await expect(f.repo.create(context, t)).rejects.toThrow("STALE_CANDIDATE");
    f.sql
      .prepare("update trip_source_candidates set proposal_sha256=? where id=?")
      .run(h, candidate);
    f.sql.prepare("update trip_source_runs set generation=2 where id=?").run(run);
    await expect(f.repo.create(context, t)).rejects.toThrow("STALE_RUN");
    f.sql.prepare("update trip_source_runs set generation=1 where id=?").run(run);
    const a = await f.a(t);
    await f.repo.reserveAttempt(context, a);
    await f.repo.observeAttempt(context, a.attempt_id, 1, f.observation("RUNNING"));
    await f.repo.observeAttempt(
      context,
      a.attempt_id,
      2,
      f.observation("TERMINAL", "SUCCEEDED", h),
    );
    f.sql
      .prepare("update trip_source_candidates set proposal_sha256=? where id=?")
      .run("b".repeat(64), candidate);
    await expect(
      f.repo.installResult(context, a.attempt_id, 3, randomUUID(), h, async () => {}),
    ).rejects.toThrow("STALE_CANDIDATE");
    f.sql
      .prepare("update trip_source_candidates set proposal_sha256=? where id=?")
      .run(h, candidate);
    f.sql.prepare("update trip_source_runs set generation=2 where id=?").run(run);
    await expect(
      f.repo.installResult(context, a.attempt_id, 3, randomUUID(), h, async () => {}),
    ).rejects.toThrow("STALE_RUN");
    expect((await f.repo.readAttempt(context, a.attempt_id)).execution_outcome).toBe(
      "SUCCEEDED",
    );
  });
  it("missing Source, Run, Candidate and Event pins reject before publication", async () => {
    const f = await fixture(fk);
    const source = {
      kind: "SOURCE" as const,
      source_id: randomUUID(),
      material_revision: 1,
      representation_id: randomUUID(),
      payload_sha256: h,
      byte_count: 1,
      input_id: null,
      transform_sha256: null,
    };
    await expect(
      f.repo.create(f.context, {
        ...f.t,
        input_pins: [source],
        input_sha256: await digest([source]),
      }),
    ).rejects.toThrow("STALE_SOURCE");
    await expect(
      f.repo.create(f.context, {
        ...f.t,
        run_id: randomUUID(),
        expected_run_generation: 1,
      }),
    ).rejects.toThrow("STALE_RUN");
    await expect(
      f.repo.create(f.context, {
        ...f.t,
        candidate_id: randomUUID(),
        expected_candidate_sha256: h,
      }),
    ).rejects.toThrow("STALE_CANDIDATE");
    await expect(
      f.repo.create(f.context, {
        ...f.t,
        event_id: randomUUID(),
        expected_event_revision: 1,
      }),
    ).rejects.toThrow("STALE_EVENT");
  });
  it("task→attempt→call→usage→publication correlation survives completion meter loss", async () => {
    const f = await fixture(fk);
    const policy = {
      ...f.t.policy_snapshot,
      privacy: "OTR_ONLY" as const,
      route: "SELF_HOSTED",
    };
    const t = { ...f.t, policy_snapshot: policy, policy_sha256: await digest(policy) };
    await f.repo.create(f.context, t);
    const admission = {
      version: 1 as const,
      allowed: true,
      policy_sha256: t.policy_sha256,
    };
    const a = {
      ...(await f.a(t)),
      integration_id: "synthetic-compute",
      provider_config_id: randomUUID(),
      config_version: "1",
      configuration_sha256: h,
      usage_correlation_id: randomUUID(),
      provider_id: "synthetic",
      model_id: "compute",
      model_version: "v1",
      adapter_version: "v1",
      descriptor_snapshot: {
        version: 1 as const,
        provider_class: "OTR_SELF_HOSTED" as const,
        replay_support: "UNKNOWN" as const,
        capabilities: ["EXTRACT"],
        modalities: ["TEXT"],
        network_required: false,
      },
      policy_admission: admission,
      policy_admission_sha256: await digest(admission),
      metering_disposition: "START_PENDING" as const,
    };
    await f.repo.reserveAttempt(f.context, a);
    await expect(
      f.repo.observeAttempt(f.context, a.attempt_id, 1, {
        ...f.observation("RUNNING"),
        metering_disposition: "START_PENDING",
      }),
    ).rejects.toThrow("START_NOT_DURABLE");
    await f.repo.observeAttempt(f.context, a.attempt_id, 1, {
      ...f.observation("RUNNING"),
      metering_disposition: "START_DURABLE",
    });
    const final = await f.repo.observeAttempt(f.context, a.attempt_id, 2, {
      ...f.observation("TERMINAL", "SUCCEEDED", h),
      metering_disposition: "COMPLETION_PENDING",
    });
    const call = {
      account_id: a.account_id,
      task_id: a.task_id,
      attempt_id: a.attempt_id,
      attempt_sequence: a.attempt_sequence,
      call_id: a.usage_correlation_id,
      integration_id: a.integration_id,
      request_id: a.request_id,
      request_sha256: a.request_sha256,
      configuration_sha256: h,
      config_version: 1,
      provider_config_id: a.provider_config_id,
      input_sha256: t.input_sha256,
      schema_sha256: t.schema_sha256,
      publication_fence: t.publication_fence,
      fallback_chain_id: a.fallback_chain_id,
      shadow: false,
      shadow_of_call_id: null,
    };
    const publication = { result_sha256: h, publication_sha256: h };
    expect(
      verifyPublicationCorrelation(
        t,
        final,
        call,
        [{ call_id: call.call_id, response_sha256: h, publication_sha256: null }],
        publication,
      ).call_id,
    ).toBe(call.call_id);
    expect(() =>
      verifyPublicationCorrelation(
        t,
        final,
        call,
        [{ call_id: randomUUID(), response_sha256: h, publication_sha256: null }],
        publication,
      ),
    ).toThrow("USAGE_CORRELATION");
    const installed = await f.repo.installResult(
      f.context,
      a.attempt_id,
      3,
      randomUUID(),
      h,
      async () => {},
    );
    expect(installed.metering_disposition).toBe("COMPLETION_PENDING");
    const next = {
      ...a,
      attempt_id: randomUUID(),
      attempt_sequence: 2,
      request_id: randomUUID(),
      idempotency_key: randomUUID(),
      usage_correlation_id: randomUUID(),
      predecessor_attempt_id: a.attempt_id,
      predecessor_request_id: a.request_id,
    };
    await expect(f.repo.reserveAttempt(f.context, next)).rejects.toThrow("FENCE");
  });
  it("UNKNOWN requires trusted exact recovery, never RUNNING or NOT_STARTED", async () => {
    const f = await fixture(fk);
    await f.repo.create(f.context, f.t);
    const a = await f.a();
    await f.repo.reserveAttempt(f.context, a);
    await f.repo.observeAttempt(f.context, a.attempt_id, 1, f.observation("RUNNING"));
    await f.repo.observeAttempt(f.context, a.attempt_id, 2, f.observation("UNKNOWN"));
    for (const state of ["NOT_STARTED", "RUNNING"] as const)
      await expect(
        f.repo.observeAttempt(f.context, a.attempt_id, 3, f.observation(state), h),
      ).rejects.toThrow("TRANSITION");
    await expect(
      f.repo.observeAttempt(
        f.context,
        a.attempt_id,
        3,
        f.observation("TERMINAL", "SUCCEEDED", h),
        "b".repeat(64),
      ),
    ).rejects.toThrow("UNTRUSTED_RECOVERY");
    expect(
      (
        await f.repo.observeAttempt(
          f.context,
          a.attempt_id,
          3,
          f.observation("TERMINAL", "SUCCEEDED", h),
          h,
        )
      ).execution_observation,
    ).toBe("TERMINAL");
  });
  it("fresh owning manifest/Trip admission fences installation", async () => {
    const f = await fixture(fk);
    await f.repo.create(f.context, f.t);
    const a = await f.a();
    await f.repo.reserveAttempt(f.context, a);
    await f.repo.observeAttempt(f.context, a.attempt_id, 1, f.observation("RUNNING"));
    await f.repo.observeAttempt(
      f.context,
      a.attempt_id,
      2,
      f.observation("TERMINAL", "SUCCEEDED", h),
    );
    f.setAdmission(false);
    await expect(
      f.repo.installResult(f.context, a.attempt_id, 3, randomUUID(), h, async () => {}),
    ).rejects.toThrow("STALE_MANIFEST_OR_TRIP");
  });
});
it("file cold reopen preserves task/attempt UNKNOWN exactly", async () => {
  const folder = mkdtempSync(join(tmpdir(), "cp14-"));
  folders.push(folder);
  const path = join(folder, "journal.db"),
    f = await fixture(true, path);
  await f.repo.create(f.context, f.t);
  const a = await f.a();
  await f.repo.reserveAttempt(f.context, a);
  await f.repo.observeAttempt(f.context, a.attempt_id, 1, f.observation("RUNNING"));
  await f.repo.observeAttempt(f.context, a.attempt_id, 2, f.observation("UNKNOWN"));
  f.sql.close();
  const reopened = await fixture(true, path, false);
  expect(await reopened.repo.recoveryDisposition(reopened.context, f.t.task_id)).toBe(
    "EXACT_RECOVERY_REQUIRED",
  );
});

type Fixture = Awaited<ReturnType<typeof fixture>>;
async function c2(
  f: Fixture,
  reason:
    | "WAITING_FOR_NETWORK"
    | "WAITING_FOR_REMOTE_INTELLIGENCE"
    | "WAITING_FOR_ENRICHMENT" = "WAITING_FOR_REMOTE_INTELLIGENCE",
) {
  await f.repo.create(f.context, f.t);
  let online = reason !== "WAITING_FOR_NETWORK",
    eligible = false;
  const runtime = createIntelligenceContinuationRuntime(f.repo, {
    ...f.deps,
    online: () => online,
    routePolicy: () => ({
      modalities: ["TEXT"],
      latencyBudgetMs: null,
      risk: "NORMAL",
      shadowEligible: false,
    }),
    router: async ({ task }): Promise<ContinuationRoute> =>
      eligible
        ? {
            status: "ELIGIBLE",
            attempt: await f.a(task, task.sync_operation_id!),
          }
        : { status: "WAIT", reason },
  });
  const scheduler = createIntelligenceContinuationScheduling({
    db: f.db,
    repo: f.repo,
    runtime,
    ...f.deps,
  });
  const queue = createIntelligenceWakeQueue(f.db, f.deps);
  const pending = async () =>
    (await createSyncOperationRepository(f.db, f.deps.getAccountId).listPending())[0];
  const signal = () => f.repo.scheduleWake(f.context, f.t.task_id);
  const count = () =>
    f.sql.prepare("SELECT count(*) AS n FROM intelligence_continuation_attempts").get()!
      .n;
  return {
    runtime,
    scheduler,
    queue,
    pending,
    signal,
    count,
    setEligible: () => {
      eligible = true;
      online = true;
    },
  };
}
function report(a: Attempt, overrides: Partial<ExecutionReport> = {}): ExecutionReport {
  return {
    account_id: a.account_id,
    task_id: a.task_id,
    attempt_id: a.attempt_id,
    request_id: a.request_id,
    request_sha256: a.request_sha256,
    usage_correlation_id: a.usage_correlation_id,
    execution_observation: "TERMINAL",
    execution_outcome: "SUCCEEDED",
    response_material_reference: null,
    response_material_sha256: null,
    response_sha256: h,
    metering_disposition: a.metering_disposition,
    reported_usage_summary: null,
    recovery_sha256: null,
    ...overrides,
  };
}
const executor = (a: Attempt, execute = async () => report(a)) => ({
  proveUndispatched: async () => true,
  prepareUsage: async () => "NOT_REQUIRED" as const,
  execute,
});
describe.each([true, false])("C2 approved queue FK=%s", (fk) => {
  it("first/concurrent enqueue deduplicates; deterministic identity and changed body reject", async () => {
    const f = await fixture(fk),
      c = await c2(f);
    const ids = await Promise.all([c.signal(), c.signal(), c.signal()]);
    expect(new Set(ids).size).toBe(1);
    expect(f.sql.prepare("SELECT count(*) AS n FROM sync_operations").get()!.n).toBe(1);
    expect(c.count()).toBe(0);
    const op = await c.pending(),
      payload = await validateIntelligenceWake(op, hash);
    expect(op.id).toBe(await intelligenceWakeIdentity(payload, hash));
    await expect(
      f.repo.scheduleWake(f.context, f.t.task_id, {
        ...payload,
        expected_publication_fence: 2,
      }),
    ).rejects.toThrow("CHANGED_WAKE");
    await expect(
      validateIntelligenceWake({ ...op, idempotencyKey: randomUUID() }, hash),
    ).rejects.toThrow("WAKE_IDENTITY");
    await expect(
      validateIntelligenceWake(
        { ...op, payloadJson: JSON.stringify({ ...payload, unexpected: true }) },
        hash,
      ),
    ).rejects.toThrow();
    f.sql
      .prepare("UPDATE sync_operations SET idempotency_key=? WHERE id=?")
      .run(randomUUID(), op.id);
    await expect(c.signal()).rejects.toThrow("WAKE_IDENTITY");
  });
  it("pending signals coalesce, completed row re-arms, in-flight signal survives old finalizer", async () => {
    const f = await fixture(fk),
      c = await c2(f);
    await c.signal();
    const op = await c.pending();
    expect(await c.queue.claim(f.context, op, "owner-1")).toBe(true);
    await c.signal();
    await c.queue.settle(f.context, op);
    const newer = await c.pending();
    expect(newer.id).toBe(op.id);
    expect(newer.baseVersion).toBe(2);
    expect(await c.queue.claim(f.context, newer, "owner-2")).toBe(true);
    await expect(
      c.queue.settle(f.context, { ...newer, claimOwner: "other" }),
    ).rejects.toThrow("WAKE_CLAIM");
    await c.queue.settle(f.context, newer);
    expect(await c.pending()).toBeUndefined();
    await c.signal();
    expect((await c.pending()).id).toBe(op.id);
    expect(f.sql.prepare("SELECT count(*) AS n FROM sync_operations").get()!.n).toBe(1);
  });
  it("reclaimed owner cannot be finalized by old owner; retry preserves a newer signal", async () => {
    const f = await fixture(fk),
      c = await c2(f);
    await c.signal();
    const op = await c.pending();
    await c.queue.claim(f.context, op, "old");
    f.sql.prepare("UPDATE sync_operations SET status='RETRYABLE',claim_owner=NULL").run();
    const other = await c.pending();
    await c.queue.claim(f.context, other, "new");
    await expect(c.queue.settle(f.context, op)).rejects.toThrow("WAKE_CLAIM");
    await c.signal();
    await c.queue.settle(f.context, other, new Error("evaluation failed"), now);
    expect((await c.pending()).status).toBe("PENDING");
    expect(c.count()).toBe(0);
  });
  it.each([
    "WAITING_FOR_NETWORK",
    "WAITING_FOR_REMOTE_INTELLIGENCE",
    "WAITING_FOR_ENRICHMENT",
  ] as const)("%s completes wake only and preserves completed pass", async (reason) => {
    const f = await fixture(fk),
      c = await c2(f, reason);
    await f.repo.finishPass(f.context, f.t.task_id, 1);
    await c.signal();
    await c.scheduler.run();
    const t = await f.repo.read(f.context, f.t.task_id);
    expect(t.work_disposition).toBe("WAITING");
    expect(t.wait_reason).toBe(reason);
    expect(t.current_pass_complete).toBe(true);
    expect(c.count()).toBe(0);
    expect(f.sql.prepare("SELECT status FROM sync_operations").get()!.status).toBe(
      "COMPLETED",
    );
    await c.scheduler.resume("RECONNECT");
    await c.scheduler.run();
    expect((await f.repo.read(f.context, f.t.task_id)).row_revision).toBe(t.row_revision);
    const fact = await c.runtime.fact(f.context, f.t.task_id, {
      now,
      urgencyHorizonMs: 1000,
      evidencedDeadline: null,
    });
    expect(fact.outstanding_work).toBe(true);
    expect(fact.requires_attention).toBe(false);
  });
  it("reconnect creates exactly one admitted attempt; duplicate wake does not execute or retry it", async () => {
    const f = await fixture(fk),
      c = await c2(f, "WAITING_FOR_NETWORK");
    await c.signal();
    await c.scheduler.run();
    c.setEligible();
    await c.scheduler.resume("RECONNECT");
    await c.scheduler.run();
    expect(c.count()).toBe(1);
    await c.scheduler.resume("RECONNECT");
    await c.scheduler.run();
    expect(c.count()).toBe(1);
    const t = await f.repo.read(f.context, f.t.task_id),
      a = await f.repo.readAttempt(f.context, t.current_attempt_id!);
    expect(a.execution_observation).toBe("NOT_STARTED");
    expect(a.attempt_sequence).toBe(1);
    expect(a.request_id).not.toBe(t.logical_request_id);
  });
  it("A→B and A→B→A fence claim/evaluation/finalization; fresh A can resume", async () => {
    const f = await fixture(fk),
      c = await c2(f);
    await c.signal();
    const op = await c.pending();
    await c.queue.claim(f.context, op, "a");
    let lease = await beginAccountTransition();
    f.setAccount(randomUUID());
    endAccountTransition(lease);
    await expect(c.queue.settle(f.context, op)).rejects.toThrow("Account changed");
    await expect(c.runtime.evaluate(f.context, op)).rejects.toThrow("Account changed");
    lease = await beginAccountTransition();
    f.setAccount(account);
    endAccountTransition(lease);
    await expect(c.queue.settle(f.context, op)).rejects.toThrow("Account changed");
    const fresh = await captureAccountRequestContext("", f.deps.getAccountId);
    await f.repo.scheduleWake(fresh, f.t.task_id);
    await c.scheduler.run();
    expect(c.count()).toBe(0);
  });
  it("stale publication fence terminates wake; canceled NOT_STARTED stays undispatched", async () => {
    const f = await fixture(fk),
      c = await c2(f);
    await c.signal();
    c.setEligible();
    await c.scheduler.run();
    const t = await f.repo.read(f.context, f.t.task_id);
    await f.repo.fence(f.context, t.task_id, t.row_revision, "CANCELED");
    await c.signal();
    await c.scheduler.run();
    const a = await f.repo.readAttempt(f.context, t.current_attempt_id!);
    expect(a.execution_observation).toBe("NOT_STARTED");
    expect(c.count()).toBe(1);
    await expect(c.runtime.execute(f.context, a.attempt_id, executor(a))).rejects.toThrow(
      "EXECUTION_FENCE",
    );
    expect(
      (await f.repo.readAttempt(f.context, a.attempt_id)).execution_observation,
    ).toBe("NOT_STARTED");
  });
  it.each(["RUNNING", "UNKNOWN"] as const)(
    "queue retries/lease expiry cannot redispatch %s",
    async (state) => {
      const f = await fixture(fk),
        c = await c2(f);
      await c.signal();
      c.setEligible();
      await c.scheduler.run();
      const t = await f.repo.read(f.context, f.t.task_id);
      let a = await f.repo.readAttempt(f.context, t.current_attempt_id!);
      a = await f.repo.beginExecution(
        f.context,
        a.attempt_id,
        a.row_revision,
        "NOT_REQUIRED",
      );
      if (state === "UNKNOWN")
        a = await f.repo.observeAttempt(
          f.context,
          a.attempt_id,
          a.row_revision,
          f.observation("UNKNOWN"),
        );
      f.sql
        .prepare(
          "UPDATE sync_operations SET status='RETRYABLE',attempt_count=19,lease_expires_at=?",
        )
        .run(now);
      await c.scheduler.run();
      expect(c.count()).toBe(1);
      expect(
        (await f.repo.readAttempt(f.context, a.attempt_id)).execution_observation,
      ).toBe(state);
      await expect(
        c.runtime.execute(f.context, a.attempt_id, executor(a)),
      ).rejects.toThrow("EXACT_RECOVERY");
      expect(a.attempt_sequence).toBe(1);
    },
  );
  it("wake COMPLETED is forbidden as intelligence-success dependency", async () => {
    const f = await fixture(fk),
      c = await c2(f);
    const id = await c.signal();
    await c.scheduler.run();
    await expect(
      f.repo.create(f.context, {
        ...f.t,
        task_id: randomUUID(),
        logical_request_id: randomUUID(),
        logical_idempotency_key: randomUUID(),
        dependencies: [{ kind: "QUEUE_OPERATION", id }],
      }),
    ).rejects.toThrow("DEPENDENCY_SCOPE");
  });
  it("intelligence activity is Account/kind scoped and WAIT leaves no actionable timer work", async () => {
    const f = await fixture(fk),
      c = await c2(f);
    await c.signal();
    expect((await getIntelligenceQueueActivity(f.db, account)).actionableNow).toBe(1);
    expect((await getIntelligenceQueueActivity(f.db, randomUUID())).actionableNow).toBe(
      0,
    );
    await c.scheduler.run();
    expect((await c.scheduler.activity()).actionableNow).toBe(0);
  });
});

it.each([
  "WAITING_FOR_NETWORK",
  "WAITING_FOR_REMOTE_INTELLIGENCE",
  "WAITING_FOR_ENRICHMENT",
  "RUNNING",
  "RESULT_PENDING",
  "UNKNOWN",
  "CANCELED",
] as const)(
  "C2 file cold restart rehydrates %s with outstanding/pass/attempt facts",
  async (state) => {
    const dir = mkdtempSync(join(tmpdir(), "c2-cold-"));
    folders.push(dir);
    const path = join(dir, "db.sqlite");
    const f = await fixture(true, path),
      c = await c2(
        f,
        state.startsWith("WAITING") ? (state as "WAITING_FOR_NETWORK") : undefined,
      );
    await f.repo.finishPass(f.context, f.t.task_id, 1);
    await c.signal();
    await c.scheduler.run();
    if (!state.startsWith("WAITING")) {
      c.setEligible();
      await c.signal();
      await c.scheduler.run();
      let t = await f.repo.read(f.context, f.t.task_id);
      let a = await f.repo.readAttempt(f.context, t.current_attempt_id!);
      a = await f.repo.beginExecution(
        f.context,
        a.attempt_id,
        a.row_revision,
        "NOT_REQUIRED",
      );
      if (state === "UNKNOWN" || state === "CANCELED")
        await f.repo.observeAttempt(
          f.context,
          a.attempt_id,
          a.row_revision,
          f.observation("UNKNOWN"),
        );
      if (state === "RESULT_PENDING")
        await f.repo.observeAttempt(
          f.context,
          a.attempt_id,
          a.row_revision,
          f.observation("TERMINAL", "SUCCEEDED", h),
        );
      if (state === "CANCELED") {
        t = await f.repo.read(f.context, t.task_id);
        await f.repo.fence(f.context, t.task_id, t.row_revision, "CANCELED");
      }
    }
    const before = await f.repo.read(f.context, f.t.task_id);
    f.sql.close();
    const reopened = await fixture(true, path, false);
    expect(await reopened.repo.read(reopened.context, before.task_id)).toEqual(before);
    const runtime = createIntelligenceContinuationRuntime(reopened.repo, {
      ...reopened.deps,
      online: () => false,
      routePolicy: () => ({
        modalities: ["TEXT"],
        latencyBudgetMs: null,
        risk: "NORMAL",
        shadowEligible: false,
      }),
      router: async () => ({
        status: "WAIT",
        reason: state.startsWith("WAITING")
          ? (state as "WAITING_FOR_NETWORK")
          : "WAITING_FOR_REMOTE_INTELLIGENCE",
      }),
    });
    const scheduler = createIntelligenceContinuationScheduling({
      db: reopened.db,
      repo: reopened.repo,
      runtime,
      ...reopened.deps,
    });
    await scheduler.resume("COLD_START");
    await scheduler.run();
    const after = await reopened.repo.read(reopened.context, before.task_id);
    expect(after.current_pass_complete).toBe(true);
    expect(after.current_attempt_id).toBe(before.current_attempt_id);
    expect(after.work_disposition).toBe(before.work_disposition);
  },
);

it("C2 execute uses positive proof, persists uncertainty on ACK/timeout/meter loss, and accepts only exact late recovery", async () => {
  for (const failure of [
    "DISPATCH_ACK_LOST",
    "MAY_HAVE_STARTED",
    "TIMEOUT",
    "METER_COMPLETION_LOST",
  ]) {
    const f = await fixture(),
      c = await c2(f);
    await c.signal();
    c.setEligible();
    await c.scheduler.run();
    const t = await f.repo.read(f.context, f.t.task_id),
      a = await f.repo.readAttempt(f.context, t.current_attempt_id!);
    await expect(
      c.runtime.execute(f.context, a.attempt_id, {
        ...executor(a),
        proveUndispatched: async () => false,
      }),
    ).rejects.toThrow("UNDISPATCHED_PROOF");
    await expect(
      c.runtime.execute(
        f.context,
        a.attempt_id,
        executor(a, async () => {
          throw new Error(failure);
        }),
      ),
    ).rejects.toThrow(failure);
    expect(
      (await f.repo.readAttempt(f.context, a.attempt_id)).execution_observation,
    ).toBe("UNKNOWN");
    await c.signal();
    await c.scheduler.run();
    expect(c.count()).toBe(1);
    await expect(c.runtime.attach(f.context, report(a))).rejects.toThrow(
      "EXECUTION_TRANSITION",
    );
    await c.runtime.attach(f.context, report(a, { recovery_sha256: h }));
    expect(
      (await f.repo.readAttempt(f.context, a.attempt_id)).result_install_disposition,
    ).toBe("PENDING");
  }
});
it("C2 late terminal/usage after canceled UNKNOWN remains fenced and keeps exact call identity", async () => {
  const f = await fixture(),
    c = await c2(f);
  await c.signal();
  c.setEligible();
  await c.scheduler.run();
  let t = await f.repo.read(f.context, f.t.task_id);
  let a = await f.repo.readAttempt(f.context, t.current_attempt_id!);
  a = await f.repo.beginExecution(
    f.context,
    a.attempt_id,
    a.row_revision,
    "NOT_REQUIRED",
  );
  a = await f.repo.observeAttempt(
    f.context,
    a.attempt_id,
    a.row_revision,
    f.observation("UNKNOWN"),
  );
  t = await f.repo.read(f.context, t.task_id);
  await f.repo.fence(f.context, t.task_id, t.row_revision, "CANCELED");
  a = await c.runtime.attach(f.context, report(a, { recovery_sha256: h }));
  const installed = await f.repo.installResult(
    f.context,
    a.attempt_id,
    a.row_revision,
    randomUUID(),
    h,
    async () => {
      throw new Error("must not install");
    },
  );
  expect(installed.result_install_disposition).toBe("REJECTED_CANCELED");
  expect(installed.request_id).toBe(a.request_id);
  expect(installed.execution_outcome).toBe("SUCCEEDED");
  const fact = await c.runtime.fact(f.context, t.task_id, {
    now,
    urgencyHorizonMs: 1000,
    evidencedDeadline: null,
  });
  expect(fact.requires_attention).toBe(false);
});
it("C2 local sufficient publication has no deferred work or attempt; evidence-based attention is configurable", async () => {
  const f = await fixture(),
    c = await c2(f);
  await c.signal();
  await c.scheduler.run();
  const fact = await c.runtime.fact(f.context, f.t.task_id, {
    now,
    urgencyHorizonMs: 1000,
    evidencedDeadline: {
      at: new Date(Date.parse(now) + 500).toISOString(),
      evidenceId: randomUUID(),
    },
  });
  expect(fact.requires_attention).toBe(true);
  expect(fact.reason).toBe("EVIDENCED_DEADLINE");
  const t = await f.repo.read(f.context, f.t.task_id);
  await f.repo.publishLocal(
    f.context,
    t.task_id,
    t.row_revision,
    randomUUID(),
    h,
    async () => {},
  );
  const done = await c.runtime.fact(f.context, t.task_id, {
    now,
    urgencyHorizonMs: 0,
    evidencedDeadline: null,
  });
  expect(done.current_pass_complete).toBe(true);
  expect(done.outstanding_work).toBe(false);
  expect(c.count()).toBe(0);
  f.setAdmission(false);
  await expect(
    c.runtime.fact(f.context, t.task_id, {
      now,
      urgencyHorizonMs: 0,
      evidencedDeadline: null,
    }),
  ).rejects.toThrow("TRIP");
});

it("C2 concurrent queue runners retain a live same-process claim; stale row CAS rejects admitted route", async () => {
  const f = await fixture();
  await f.repo.create(f.context, f.t);
  await f.repo.scheduleWake(f.context, f.t.task_id);
  let release!: () => void, entered!: () => void;
  const inside = new Promise<void>((r) => {
      entered = r;
    }),
    barrier = new Promise<void>((r) => {
      release = r;
    });
  const runtime = createIntelligenceContinuationRuntime(f.repo, {
    ...f.deps,
    online: () => true,
    routePolicy: () => ({
      modalities: ["TEXT"],
      latencyBudgetMs: null,
      risk: "NORMAL",
      shadowEligible: false,
    }),
    router: async ({ task }) => {
      entered();
      await barrier;
      return { status: "ELIGIBLE", attempt: await f.a(task, task.sync_operation_id!) };
    },
  });
  const scheduler = createIntelligenceContinuationScheduling({
    db: f.db,
    repo: f.repo,
    runtime,
    ...f.deps,
  });
  const first = scheduler.run();
  await inside;
  await scheduler.run();
  expect(f.sql.prepare("SELECT status FROM sync_operations").get()!.status).toBe(
    "PROCESSING",
  );
  release();
  await first;
  expect((await f.repo.attempts(f.context, f.t.task_id)).length).toBe(1);
});
it("C2 executor and router run outside transactions; success installs once, with rollback-only retry", async () => {
  const f = await fixture(),
    c = await c2(f);
  await c.signal();
  c.setEligible();
  await c.scheduler.run();
  const t = await f.repo.read(f.context, f.t.task_id),
    a = await f.repo.readAttempt(f.context, t.current_attempt_id!);
  const terminal = await c.runtime.execute(
    f.context,
    a.attempt_id,
    executor(a, async () => {
      expect(f.sql.isTransaction).toBe(false);
      return report(a, { metering_disposition: "COMPLETION_PENDING" });
    }),
  );
  expect(terminal.execution_observation).toBe("TERMINAL");
  expect(terminal.result_install_disposition).toBe("PENDING");
  const publication = randomUUID();
  let installs = 0;
  await expect(
    f.repo.installResult(
      f.context,
      a.attempt_id,
      terminal.row_revision,
      publication,
      h,
      async () => {
        expect(f.sql.isTransaction).toBe(true);
        throw new Error("rollback");
      },
    ),
  ).rejects.toThrow("rollback");
  let current = await f.repo.readAttempt(f.context, a.attempt_id);
  expect(current.result_install_disposition).toBe("PENDING");
  current = await f.repo.installResult(
    f.context,
    a.attempt_id,
    current.row_revision,
    publication,
    h,
    async () => {
      installs++;
    },
  );
  await f.repo.installResult(
    f.context,
    a.attempt_id,
    current.row_revision,
    publication,
    h,
    async () => {
      installs++;
    },
  );
  expect(installs).toBe(1);
  expect(c.count()).toBe(1);
  expect(
    (
      await c.runtime.fact(f.context, t.task_id, {
        now,
        urgencyHorizonMs: 0,
        evidencedDeadline: null,
      })
    ).outstanding_work,
  ).toBe(true);
  await c.runtime.attach(
    f.context,
    report(current, { metering_disposition: "COMPLETE" }),
  );
  expect(
    (
      await c.runtime.fact(f.context, t.task_id, {
        now,
        urgencyHorizonMs: 0,
        evidencedDeadline: null,
      })
    ).outstanding_work,
  ).toBe(false);
});

it("C2 router revalidates current task revision after awaits; no I/O is held under gate", async () => {
  const f = await fixture();
  await f.repo.create(f.context, f.t);
  await f.repo.scheduleWake(f.context, f.t.task_id);
  const runtime = createIntelligenceContinuationRuntime(f.repo, {
    ...f.deps,
    online: () => true,
    routePolicy: () => ({
      modalities: ["TEXT"],
      latencyBudgetMs: null,
      risk: "NORMAL",
      shadowEligible: false,
    }),
    router: async ({ task }) => {
      expect(f.sql.isTransaction).toBe(false);
      await f.repo.finishPass(f.context, task.task_id, task.row_revision);
      return { status: "ELIGIBLE", attempt: await f.a(task, task.sync_operation_id!) };
    },
  });
  const scheduler = createIntelligenceContinuationScheduling({
    db: f.db,
    repo: f.repo,
    runtime,
    ...f.deps,
  });
  await scheduler.run();
  expect((await f.repo.attempts(f.context, f.t.task_id)).length).toBe(0);
  expect(
    f.sql.prepare("SELECT status,attempt_count FROM sync_operations").get(),
  ).toMatchObject({ status: "RETRYABLE", attempt_count: 1 });
});
it("C2 explicitly admitted fallback has distinct attempt/request/key with retained predecessor; shadow never installs", async () => {
  const f = await fixture(),
    c = await c2(f);
  await c.signal();
  c.setEligible();
  await c.scheduler.run();
  let t = await f.repo.read(f.context, f.t.task_id),
    first = await f.repo.readAttempt(f.context, t.current_attempt_id!);
  first = await f.repo.beginExecution(
    f.context,
    first.attempt_id,
    first.row_revision,
    "NOT_REQUIRED",
  );
  first = await f.repo.observeAttempt(
    f.context,
    first.attempt_id,
    first.row_revision,
    f.observation("TERMINAL", "FAILED"),
  );
  const runtime = createIntelligenceContinuationRuntime(f.repo, {
    ...f.deps,
    online: () => true,
    routePolicy: () => ({
      modalities: ["TEXT"],
      latencyBudgetMs: null,
      risk: "NORMAL",
      shadowEligible: false,
    }),
    router: async ({ task }) => ({
      status: "ELIGIBLE",
      attempt: {
        ...(await f.a(task, task.sync_operation_id!)),
        attempt_sequence: 2,
        predecessor_attempt_id: first.attempt_id,
        predecessor_request_id: first.request_id,
        fallback_chain_id: first.fallback_chain_id,
      },
    }),
  });
  const scheduler = createIntelligenceContinuationScheduling({
    db: f.db,
    repo: f.repo,
    runtime,
    ...f.deps,
  });
  await c.signal();
  await scheduler.run();
  t = await f.repo.read(f.context, t.task_id);
  const next = await f.repo.readAttempt(f.context, t.current_attempt_id!);
  expect(next.attempt_sequence).toBe(2);
  expect(next.predecessor_attempt_id).toBe(first.attempt_id);
  expect(next.request_id).not.toBe(first.request_id);
  expect(next.idempotency_key).not.toBe(first.idempotency_key);
  expect(next.fallback_chain_id).toBe(first.fallback_chain_id);
  const shadow = {
    ...next,
    attempt_id: randomUUID(),
    request_id: randomUUID(),
    idempotency_key: randomUUID(),
    attempt_sequence: 3,
    shadow: true,
    shadow_of_attempt_id: next.attempt_id,
  };
  // Reserve a shadow under the same explicitly claimed retained wake row; no provider runs.
  await c.signal();
  const op = await c.pending();
  await c.queue.claim(f.context, op, "shadow-test");
  await f.repo.reserveAttempt(f.context, shadow);
  await expect(
    f.repo.installResult(
      f.context,
      shadow.attempt_id,
      1,
      randomUUID(),
      h,
      async () => {},
    ),
  ).rejects.toThrow("SHADOW_NO_INSTALL");
  expect((await f.repo.read(f.context, t.task_id)).current_attempt_id).toBe(
    next.attempt_id,
  );
});
it("C2 unsupported admission terminates with attention; current pass stays independent", async () => {
  const f = await fixture();
  await f.repo.create(f.context, f.t);
  await f.repo.finishPass(f.context, f.t.task_id, 1);
  const runtime = createIntelligenceContinuationRuntime(f.repo, {
    ...f.deps,
    online: () => true,
    routePolicy: () => ({
      modalities: ["TEXT"],
      latencyBudgetMs: null,
      risk: "NORMAL",
      shadowEligible: false,
    }),
    router: async () => ({ status: "UNAVAILABLE", reason: "UNSUPPORTED" }),
  });
  const scheduler = createIntelligenceContinuationScheduling({
    db: f.db,
    repo: f.repo,
    runtime,
    ...f.deps,
  });
  await scheduler.resume("COLD_START");
  await scheduler.run();
  const fact = await runtime.fact(f.context, f.t.task_id, {
    now,
    urgencyHorizonMs: 0,
    evidencedDeadline: null,
  });
  expect(fact.state).toBe("FAILED");
  expect(fact.requires_attention).toBe(true);
  expect(fact.current_pass_complete).toBe(true);
  expect(fact.outstanding_work).toBe(false);
});
it("C2 revoked Trip and old A callback cannot install/disclose but retain execution/usage facts", async () => {
  const f = await fixture(),
    c = await c2(f);
  await c.signal();
  c.setEligible();
  await c.scheduler.run();
  const t = await f.repo.read(f.context, f.t.task_id);
  let a = await f.repo.readAttempt(f.context, t.current_attempt_id!);
  a = await c.runtime.execute(f.context, a.attempt_id, executor(a));
  f.setAdmission(false);
  await expect(
    f.repo.installResult(
      f.context,
      a.attempt_id,
      a.row_revision,
      randomUUID(),
      h,
      async () => {},
    ),
  ).rejects.toThrow("TRIP");
  expect((await f.repo.readAttempt(f.context, a.attempt_id)).execution_outcome).toBe(
    "SUCCEEDED",
  );
  let lease = await beginAccountTransition();
  f.setAccount(randomUUID());
  endAccountTransition(lease);
  lease = await beginAccountTransition();
  f.setAccount(account);
  endAccountTransition(lease);
  await expect(
    c.runtime.attach(f.context, report(a, { metering_disposition: "COMPLETE" })),
  ).rejects.toThrow("Account changed");
  const fresh = await captureAccountRequestContext("", f.deps.getAccountId);
  await c.runtime.attach(fresh, report(a, { metering_disposition: "COMPLETE" }));
  expect((await f.repo.readAttempt(fresh, a.attempt_id)).metering_disposition).toBe(
    "COMPLETE",
  );
});

it("C2 dependency and network waits coexist; router preserves additional exact wait pins", async () => {
  const f = await fixture();
  const dependency = {
    ...f.t,
    task_id: randomUUID(),
    logical_request_id: randomUUID(),
    logical_idempotency_key: randomUUID(),
  };
  await f.repo.create(f.context, dependency);
  const policy = {
    ...f.t.policy_snapshot,
    network_required: true,
    privacy: "REMOTE_ALLOWED" as const,
  };
  const task = {
    ...f.t,
    policy_snapshot: policy,
    policy_sha256: await digest(policy),
    dependencies: [{ kind: "TASK" as const, id: dependency.task_id }],
  };
  await f.repo.create(f.context, task);
  await f.repo.scheduleWake(f.context, task.task_id);
  const runtime = createIntelligenceContinuationRuntime(f.repo, {
    ...f.deps,
    online: () => false,
    routePolicy: () => ({
      modalities: ["TEXT"],
      latencyBudgetMs: null,
      risk: "NORMAL",
      shadowEligible: false,
    }),
    router: async () => {
      throw new Error("not eligible yet");
    },
  });
  const scheduler = createIntelligenceContinuationScheduling({
    db: f.db,
    repo: f.repo,
    runtime,
    ...f.deps,
  });
  await scheduler.run();
  expect(
    (await f.repo.read(f.context, task.task_id)).wait_reasons.map((r) => r.reason),
  ).toEqual(["WAITING_FOR_ENRICHMENT", "WAITING_FOR_NETWORK"]);
});

it("C2 Event base revision change rejects install while preserving executed success", async () => {
  const f = await fixture(),
    trip = randomUUID(),
    event = randomUUID();
  const context = await captureAccountRequestContext(trip, f.deps.getAccountId);
  f.sql
    .prepare(
      `INSERT INTO trip_canonical_events(account_id,trip_id,event_id,read_version,read_disposition,
    legacy_compatible,observation_sequence,observed_generation,temporal_contract_version,temporal_shape,
    semantic_revision,title,event_type,status,participant_scope,is_estimated_time)
    VALUES(?,?,?,1,'READ_ONLY',0,1,0,1,'GENERAL',1,'Synthetic','NOTE','ACTIVE','UNASSIGNED',0)`,
    )
    .run(account, trip, event);
  const t = { ...f.t, trip_id: trip, event_id: event, expected_event_revision: 1 };
  await f.repo.create(context, t);
  const a = await f.a(t);
  await f.repo.reserveAttempt(context, a);
  await f.repo.observeAttempt(context, a.attempt_id, 1, f.observation("RUNNING"));
  await f.repo.observeAttempt(
    context,
    a.attempt_id,
    2,
    f.observation("TERMINAL", "SUCCEEDED", h),
  );
  f.sql
    .prepare("UPDATE trip_canonical_events SET semantic_revision=2 WHERE event_id=?")
    .run(event);
  await expect(
    f.repo.installResult(context, a.attempt_id, 3, randomUUID(), h, async () => {}),
  ).rejects.toThrow("STALE_EVENT");
  const retained = await f.repo.readAttempt(context, a.attempt_id);
  expect(retained.execution_outcome).toBe("SUCCEEDED");
  expect(retained.result_install_disposition).toBe("PENDING");
});

// Targeted F1–F4 reproductions use the existing real SQLite and injected runtime.
const deferred = <T = void>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
async function childOperation(f: Fixture, id = randomUUID()) {
  const q = createSyncOperationRepository(f.db, f.deps.getAccountId, f.deps.now);
  await q.enqueue({
    id,
    tripId: null,
    entityType: "ledger_expense",
    entityId: randomUUID(),
    operationType: "REQUIRES_INTELLIGENCE_RESULT",
    idempotencyKey: randomUUID(),
    baseVersion: 1,
    payloadJson: "{}",
    status: "PENDING",
    nextAttemptAt: null,
  });
  return { q, id };
}
describe("C2 targeted F1 generic dependency boundary / independent R6", () => {
  it.each([
    "WAITING_FOR_NETWORK",
    "WAITING_FOR_REMOTE_INTELLIGENCE",
    "WAITING_FOR_ENRICHMENT",
  ] as const)(
    "%s wake completion rejects admission and fences a pre-existing dependent",
    async (reason) => {
      const f = await fixture(),
        c = await c2(f, reason);
      const wake = await c.signal();
      await c.scheduler.run();
      const child = await childOperation(f);
      await expect(child.q.markDependencyBlocked(child.id, wake)).rejects.toThrow(
        "NOT_SUCCESS_DEPENDENCY",
      );
      f.sql
        .prepare(
          "UPDATE sync_operations SET status='DEPENDENCY_BLOCKED',failure_category='DEPENDENCY',dependency_operation_id=? WHERE id=?",
        )
        .run(wake, child.id);
      await expect(child.q.markDependencyBlocked(child.id)).rejects.toThrow(
        "NOT_SUCCESS_DEPENDENCY",
      );
      expect(await child.q.listPending()).toEqual([]);
      await child.q.markCompleted(wake); // Generic completion consumer is protected too.
      expect(
        f.sql.prepare("SELECT status FROM sync_operations WHERE id=?").get(child.id)!
          .status,
      ).toBe("DEPENDENCY_BLOCKED");
      expect((await f.repo.read(f.context, f.t.task_id)).wait_reason).toBe(reason);
      expect(c.count()).toBe(0);
    },
  );
  it("ordinary completed queue dependencies still release", async () => {
    const f = await fixture(),
      parent = await childOperation(f),
      child = await childOperation(f);
    await child.q.markDependencyBlocked(child.id, parent.id);
    expect(await child.q.listPending()).toHaveLength(1);
    await parent.q.markCompleted(parent.id);
    expect((await child.q.listPending()).map((o) => o.id)).toEqual([child.id]);
  });
  it("PUBLISHED TASK disposition releases result-dependent continuation work", async () => {
    const f = await fixture();
    await f.repo.create(f.context, f.t);
    const task = {
      ...f.t,
      task_id: randomUUID(),
      logical_request_id: randomUUID(),
      logical_idempotency_key: randomUUID(),
      dependencies: [{ kind: "TASK" as const, id: f.t.task_id }],
    };
    await f.repo.create(f.context, task);
    const runtime = createIntelligenceContinuationRuntime(f.repo, {
      ...f.deps,
      online: () => true,
      routePolicy: () => ({
        modalities: ["TEXT"],
        latencyBudgetMs: null,
        risk: "NORMAL",
        shadowEligible: false,
      }),
      router: async ({ task }) => ({
        status: "ELIGIBLE",
        attempt: await f.a(task, task.sync_operation_id!),
      }),
    });
    const scheduler = createIntelligenceContinuationScheduling({
      db: f.db,
      repo: f.repo,
      runtime,
      ...f.deps,
    });
    await f.repo.scheduleWake(f.context, task.task_id);
    await scheduler.run();
    expect((await f.repo.read(f.context, task.task_id)).wait_reason).toBe(
      "WAITING_FOR_ENRICHMENT",
    );
    await f.repo.publishLocal(f.context, f.t.task_id, 1, randomUUID(), h, async () => {});
    await f.repo.scheduleWake(f.context, task.task_id);
    await scheduler.run();
    expect(
      (await f.repo.read(f.context, task.task_id)).current_attempt_id,
    ).not.toBeNull();
  });
});
describe("C2 targeted F2 post-commit work notification / independent R7", () => {
  it("first enqueue, completed re-arm and PROCESSING signal notify only committed rows", async () => {
    const f = await fixture(),
      c = await c2(f);
    const observed: string[] = [];
    const stop = subscribeLedgerQueueWorkAvailable(() => {
      expect(f.sql.isTransaction).toBe(false);
      observed.push(
        String(f.sql.prepare("SELECT status FROM sync_operations").get()!.status),
      );
    });
    try {
      await c.signal();
      await c.scheduler.run();
      await c.signal();
      const op = await c.pending();
      await c.queue.claim(f.context, op, "owner");
      await c.signal();
      await c.queue.settle(f.context, op);
      expect(observed).toEqual(["PENDING", "PENDING", "PROCESSING"]);
      expect((await c.pending()).baseVersion).toBe(3);
    } finally {
      stop();
    }
  });
  it("rollback and Account-generation failure emit no signal", async () => {
    const f = await fixture(),
      c = await c2(f),
      signal = vi.fn();
    const stop = subscribeLedgerQueueWorkAvailable(signal);
    const run = f.db.runAsync;
    try {
      f.db.runAsync = async (q, ...p) => {
        if (q.startsWith("UPDATE intelligence_continuations"))
          throw new Error("ROLLBACK");
        return run(q, ...(p as unknown as never[]));
      };
      await expect(c.signal()).rejects.toThrow("ROLLBACK");
      expect(f.sql.prepare("SELECT count(*) AS n FROM sync_operations").get()!.n).toBe(0);
      expect(signal).not.toHaveBeenCalled();
      f.db.runAsync = run;
      const lease = await beginAccountTransition();
      f.setAccount(randomUUID());
      endAccountTransition(lease);
      await expect(c.signal()).rejects.toThrow("Account changed");
      expect(signal).not.toHaveBeenCalled();
    } finally {
      f.db.runAsync = run;
      stop();
    }
  });
});
async function meteredFixture() {
  const f = await fixture();
  await f.repo.create(f.context, f.t);
  const a = {
    ...(await f.a()),
    integration_id: "synthetic-meter",
    usage_correlation_id: randomUUID(),
    metering_disposition: "START_PENDING" as const,
  };
  await f.repo.reserveAttempt(f.context, a);
  const runtime = createIntelligenceContinuationRuntime(f.repo, {
    ...f.deps,
    online: () => true,
    routePolicy: () => ({
      modalities: ["TEXT"],
      latencyBudgetMs: null,
      risk: "NORMAL",
      shadowEligible: false,
    }),
    router: async () => ({ status: "WAIT", reason: "WAITING_FOR_NETWORK" }),
  });
  return { f, a, runtime };
}
describe("C2 targeted F3 pre-start ownership / independent R9", () => {
  it.each([false, true])(
    "losing meter error cannot regress RUNNING/START or normal terminal completion; reversed=%s",
    async (reversed) => {
      const { f, a, runtime } = await meteredFixture();
      const winnerReady = deferred(),
        loserReady = deferred(),
        releaseStart = deferred(),
        entered = deferred(),
        finish = deferred();
      let calls = 0;
      const win = () =>
        runtime.execute(f.context, a.attempt_id, {
          proveUndispatched: async () => true,
          prepareUsage: async () => {
            winnerReady.resolve();
            await releaseStart.promise;
            return "START_DURABLE";
          },
          execute: async (running) => {
            calls++;
            entered.resolve();
            await finish.promise;
            return report(running, { metering_disposition: "COMPLETE" });
          },
        });
      const lose = () =>
        runtime.execute(f.context, a.attempt_id, {
          proveUndispatched: async () => true,
          prepareUsage: async () => {
            loserReady.resolve();
            await entered.promise;
            throw new Error("LOSER_METER_ERROR");
          },
          execute: async () => {
            calls++;
            return report(a);
          },
        });
      let winner: Promise<Attempt>, loser: Promise<Attempt>;
      if (reversed) {
        loser = lose();
        void loser.catch(() => {});
        await loserReady.promise;
        winner = win();
      } else {
        winner = win();
        await winnerReady.promise;
        loser = lose();
        void loser.catch(() => {});
      }
      await Promise.all([winnerReady.promise, loserReady.promise]);
      releaseStart.resolve();
      await entered.promise;
      await expect(loser).rejects.toThrow("LOSER_METER_ERROR");
      const running = await f.repo.readAttempt(f.context, a.attempt_id);
      expect(running.execution_observation).toBe("RUNNING");
      expect(running.metering_disposition).toBe("START_DURABLE");
      finish.resolve();
      const terminal = await winner;
      expect(terminal.execution_observation).toBe("TERMINAL");
      expect(terminal.execution_outcome).toBe("SUCCEEDED");
      expect(calls).toBe(1);
    },
  );
  it("still-current pre-start meter failure preserves NOT_STARTED and blocks uncertain meter redispatch", async () => {
    const { f, a, runtime } = await meteredFixture(),
      execute = vi.fn();
    await expect(
      runtime.execute(f.context, a.attempt_id, {
        proveUndispatched: async () => true,
        prepareUsage: async () => {
          throw new Error("METER_ACK_LOST");
        },
        execute,
      }),
    ).rejects.toThrow("METER_ACK_LOST");
    const current = await f.repo.readAttempt(f.context, a.attempt_id);
    expect(current.execution_observation).toBe("NOT_STARTED");
    expect(current.metering_disposition).toBe("UNKNOWN");
    expect(execute).not.toHaveBeenCalled();
    await expect(
      runtime.execute(f.context, a.attempt_id, { ...executor(a), execute }),
    ).rejects.toThrow("EXACT_RECOVERY");
  });
  it("post-start dispatch uncertainty retains confirmed meter START", async () => {
    const { f, a, runtime } = await meteredFixture();
    await expect(
      runtime.execute(f.context, a.attempt_id, {
        proveUndispatched: async () => true,
        prepareUsage: async () => "START_DURABLE",
        execute: async () => {
          throw new Error("DISPATCH_ACK_LOST");
        },
      }),
    ).rejects.toThrow("DISPATCH_ACK_LOST");
    const current = await f.repo.readAttempt(f.context, a.attempt_id);
    expect(current.execution_observation).toBe("UNKNOWN");
    expect(current.metering_disposition).toBe("START_DURABLE");
    await expect(runtime.attach(f.context, report(current))).rejects.toThrow(
      "EXECUTION_TRANSITION",
    );
    expect(
      (await runtime.attach(f.context, report(current, { recovery_sha256: h })))
        .execution_outcome,
    ).toBe("SUCCEEDED");
  });
});
describe("C2 targeted F4 invalid wake fencing / independent R8", () => {
  it.each(["{}", "not-json", "KEY", "ID"])(
    "pre-claim %s quarantines and valid later work proceeds without invalid router call",
    async (corruption) => {
      const f = await fixture(),
        c = await c2(f);
      const id = await c.signal();
      if (corruption === "KEY")
        f.sql
          .prepare("UPDATE sync_operations SET idempotency_key='wrong' WHERE id=?")
          .run(id);
      else if (corruption === "ID") {
        const body = JSON.parse((await c.pending()).payloadJson);
        f.sql
          .prepare("UPDATE sync_operations SET payload_json=? WHERE id=?")
          .run(JSON.stringify({ ...body, expected_publication_fence: 2 }), id);
      } else
        f.sql
          .prepare("UPDATE sync_operations SET payload_json=? WHERE id=?")
          .run(corruption, id);
      const valid = {
        ...f.t,
        task_id: randomUUID(),
        logical_request_id: randomUUID(),
        logical_idempotency_key: randomUUID(),
      };
      await f.repo.create(f.context, valid);
      const good = await f.repo.scheduleWake(f.context, valid.task_id);
      const evaluate = vi.spyOn(c.runtime, "evaluate");
      await c.scheduler.run();
      await c.scheduler.run();
      expect(evaluate).toHaveBeenCalledOnce();
      expect(evaluate.mock.calls[0][1].id).toBe(good);
      expect(
        f.sql
          .prepare("SELECT status,failure_category FROM sync_operations WHERE id=?")
          .get(id),
      ).toEqual({ status: "FAILED", failure_category: "VALIDATION" });
      expect(
        f.sql.prepare("SELECT status FROM sync_operations WHERE id=?").get(good)!.status,
      ).toBe("COMPLETED");
      expect(c.count()).toBe(0);
    },
  );
  it("post-claim invalid body is fenced before router and finalized without retry", async () => {
    const f = await fixture(),
      c = await c2(f);
    await c.signal();
    const op = await c.pending();
    await c.queue.claim(f.context, op, "owner");
    f.sql.prepare("UPDATE sync_operations SET payload_json='{}' WHERE id=?").run(op.id);
    await expect(c.runtime.evaluate(f.context, op)).rejects.toThrow("WAKE_BODY");
    await c.queue.settle(f.context, op);
    expect(
      f.sql.prepare("SELECT status FROM sync_operations WHERE id=?").get(op.id)!.status,
    ).toBe("FAILED");
    expect(c.count()).toBe(0);
  });
  it.each([false, true])(
    "conditional invalid finalizer cannot overwrite newer signal/claim; postclaim=%s",
    async (postclaim) => {
      const f = await fixture(),
        c = await c2(f);
      await c.signal();
      const op = await c.pending();
      if (postclaim) await c.queue.claim(f.context, op, "old");
      f.sql.prepare("UPDATE sync_operations SET payload_json='{}' WHERE id=?").run(op.id);
      const observed = postclaim ? op : await c.pending(),
        run = f.db.runAsync;
      f.db.runAsync = async (q, ...p) => {
        if (q.includes("last_error_message=?,attempt_count=attempt_count+1")) {
          f.sql
            .prepare(
              "UPDATE sync_operations SET payload_json=?,base_version=base_version+1,status='PENDING',claim_owner=NULL WHERE id=?",
            )
            .run(op.payloadJson, op.id);
        }
        return run(q, ...(p as unknown as never[]));
      };
      try {
        if (postclaim) await c.queue.settle(f.context, observed);
        else await c.queue.claim(f.context, observed, "old");
      } finally {
        f.db.runAsync = run;
      }
      const newer = await c.pending();
      expect(newer.baseVersion).toBe(2);
      expect(newer.payloadJson).toBe(op.payloadJson);
      await c.scheduler.run();
      expect(f.sql.prepare("SELECT status FROM sync_operations").get()!.status).toBe(
        "COMPLETED",
      );
    },
  );
  it("Account switch during invalid quarantine rolls back and cannot mutate A as B", async () => {
    const f = await fixture(),
      c = await c2(f);
    await c.signal();
    f.sql.prepare("UPDATE sync_operations SET payload_json='{}'").run();
    const run = f.db.runAsync;
    f.db.runAsync = async (q, ...p) => {
      const result = await run(q, ...(p as unknown as never[]));
      if (q.includes("last_error_message=?,attempt_count=attempt_count+1"))
        f.setAccount(randomUUID());
      return result;
    };
    try {
      await expect(c.queue.claim(f.context, await c.pending(), "owner")).rejects.toThrow(
        "Account changed",
      );
    } finally {
      f.db.runAsync = run;
    }
    expect(f.sql.prepare("SELECT status FROM sync_operations").get()!.status).toBe(
      "PENDING",
    );
  });
  it("transient pre-claim SQLite failure is retryable, not invalid quarantine", async () => {
    const f = await fixture(),
      c = await c2(f);
    await c.signal();
    const get = f.db.getFirstAsync;
    let failed = false;
    f.db.getFirstAsync = async (q, ...p) => {
      if (!failed && q.includes("owner_user_id AS ownerUserId")) {
        failed = true;
        throw new Error("SQLITE_BUSY");
      }
      return get(q, ...(p as unknown as never[]));
    };
    try {
      await c.scheduler.run();
    } finally {
      f.db.getFirstAsync = get;
    }
    expect(
      f.sql.prepare("SELECT status,failure_category FROM sync_operations").get(),
    ).toEqual({ status: "RETRYABLE", failure_category: "UNKNOWN" });
    expect(c.count()).toBe(0);
  });
});

it("F2 idle central owner runs first enqueue/re-arm and in-flight follow-up on its one existing timer", async () => {
  vi.useFakeTimers();
  const f = await fixture(),
    c = await c2(f);
  central.db = f.db;
  const adapter = { ...c.scheduler, resume: async () => {} };
  try {
    allowLedgerOperationalSync();
    await setIntelligenceSchedulingAdapter(adapter);
    await runLedgerOperationalSync();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0); // Owner has gone idle.
    await c.signal();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(0);
    await runLedgerOperationalSync();
    expect((await f.repo.read(f.context, f.t.task_id)).work_disposition).toBe("WAITING");
    expect(vi.getTimerCount()).toBe(0);
    await c.signal();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(0);
    await runLedgerOperationalSync();
    expect(vi.getTimerCount()).toBe(0);
    const entered = deferred(),
      release = deferred();
    const evaluate = c.runtime.evaluate;
    let passes = 0;
    vi.spyOn(c.runtime, "evaluate").mockImplementation(async (context, op) => {
      passes++;
      if (passes === 1) {
        entered.resolve();
        await release.promise;
      }
      return evaluate(context, op);
    });
    await c.signal();
    const running = runLedgerOperationalSync();
    await entered.promise;
    await c.signal();
    expect(vi.getTimerCount()).toBe(0); // No second controller while running.
    release.resolve();
    await running;
    await vi.advanceTimersByTimeAsync(0);
    await runLedgerOperationalSync();
    expect(passes).toBe(2);
    expect(vi.getTimerCount()).toBe(0);
    expect(c.count()).toBe(0);
  } finally {
    await pauseLedgerOperationalSync();
    await setIntelligenceSchedulingAdapter(null);
    central.db = null;
    vi.useRealTimers();
  }
});
it("F2 committed A signal cannot run as B after central timer's generation fence", async () => {
  vi.useFakeTimers();
  const f = await fixture(),
    c = await c2(f);
  central.db = f.db;
  const run = vi.fn(c.scheduler.run),
    adapter = { ...c.scheduler, run, resume: async () => {} };
  try {
    allowLedgerOperationalSync();
    await setIntelligenceSchedulingAdapter(adapter);
    await runLedgerOperationalSync();
    await vi.advanceTimersByTimeAsync(0);
    run.mockClear();
    await c.signal();
    const lease = await beginAccountTransition();
    f.setAccount(randomUUID());
    endAccountTransition(lease);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).not.toHaveBeenCalled();
    expect(f.sql.prepare("SELECT status FROM sync_operations").get()!.status).toBe(
      "PENDING",
    );
    expect(c.count()).toBe(0);
  } finally {
    await pauseLedgerOperationalSync();
    await setIntelligenceSchedulingAdapter(null);
    central.db = null;
    vi.useRealTimers();
  }
});

it("F1 Ledger activity/completion projections cannot use wake pass as success", async () => {
  vi.useFakeTimers();
  const f = await fixture(),
    c = await c2(f);
  central.db = f.db;
  try {
    const wake = await c.signal();
    await c.scheduler.run();
    const child = await childOperation(f);
    f.sql
      .prepare(
        "UPDATE sync_operations SET status='DEPENDENCY_BLOCKED',failure_category='DEPENDENCY',dependency_operation_id=?,trip_id=? WHERE id=?",
      )
      .run(wake, randomUUID(), child.id);
    expect(await getLedgerQueueActivity()).toEqual({
      unresolvedCount: 1,
      actionableNow: 0,
      nextActionableAt: null,
    });
    const completion = vi.fn(),
      stop = subscribeLedgerOperationalSyncCompletion(completion);
    try {
      allowLedgerOperationalSync();
      await runLedgerOperationalSync();
      expect(completion).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  } finally {
    await pauseLedgerOperationalSync();
    central.db = null;
    vi.useRealTimers();
  }
});
it("F2 Account context failure after writes rolls back without announcing work", async () => {
  const f = await fixture(),
    c = await c2(f),
    signal = vi.fn(),
    stop = subscribeLedgerQueueWorkAvailable(signal),
    run = f.db.runAsync;
  f.db.runAsync = async (q, ...p) => {
    const changed = await run(q, ...(p as unknown as never[]));
    if (q.startsWith("UPDATE intelligence_continuations")) f.setAccount(randomUUID());
    return changed;
  };
  try {
    await expect(c.signal()).rejects.toThrow("Account changed");
    expect(signal).not.toHaveBeenCalled();
    expect(f.sql.prepare("SELECT count(*) AS n FROM sync_operations").get()!.n).toBe(0);
  } finally {
    f.db.runAsync = run;
    stop();
  }
});
it("F4 transient post-claim evaluator failure remains retryable", async () => {
  const f = await fixture(),
    c = await c2(f);
  await c.signal();
  vi.spyOn(c.runtime, "evaluate").mockRejectedValueOnce(new Error("SQLITE_BUSY"));
  await c.scheduler.run();
  expect(
    f.sql.prepare("SELECT status,failure_category FROM sync_operations").get(),
  ).toEqual({ status: "RETRYABLE", failure_category: "UNKNOWN" });
  expect(c.count()).toBe(0);
});
it("F4 stale invalid in-memory observation cannot quarantine a valid retained claimed body", async () => {
  const f = await fixture(),
    c = await c2(f);
  await c.signal();
  const op = await c.pending();
  await c.queue.claim(f.context, op, "owner");
  await expect(c.queue.settle(f.context, { ...op, payloadJson: "{}" })).rejects.toThrow(
    "CHANGED_WAKE",
  );
  expect(f.sql.prepare("SELECT status FROM sync_operations").get()!.status).toBe(
    "PROCESSING",
  );
  await c.queue.settle(f.context, op);
  expect(f.sql.prepare("SELECT status FROM sync_operations").get()!.status).toBe(
    "COMPLETED",
  );
});

it("F4 valid JSON with missing durable task is conditionally fenced without router evaluation", async () => {
  const f = await fixture(),
    c = await c2(f);
  const payload = {
    version: 1 as const,
    account_id: account,
    task_id: randomUUID(),
    expected_publication_fence: 1,
    wake_reason: "REEVALUATE" as const,
  };
  const id = await intelligenceWakeIdentity(payload, hash);
  await createSyncOperationRepository(f.db, f.deps.getAccountId, f.deps.now).enqueue({
    id,
    tripId: null,
    entityType: "INTELLIGENCE_CONTINUATION",
    entityId: payload.task_id,
    operationType: "INTELLIGENCE_CONTINUATION_WAKE",
    idempotencyKey: id,
    baseVersion: 1,
    payloadJson: JSON.stringify(payload),
    status: "PENDING",
    nextAttemptAt: null,
  });
  await c.scheduler.run();
  expect(
    f.sql.prepare("SELECT status,last_error_code FROM sync_operations").get(),
  ).toEqual({ status: "FAILED", last_error_code: "INTELLIGENCE_WAKE_INVALID" });
  expect(c.count()).toBe(0);
});
it("F1 admission CAS rejects a dependency that changes to wake evidence before its UPDATE", async () => {
  const f = await fixture(),
    parent = await childOperation(f),
    child = await childOperation(f),
    run = f.db.runAsync;
  f.db.runAsync = async (q, ...p) => {
    if (q.includes("SET status = 'DEPENDENCY_BLOCKED'"))
      f.sql
        .prepare(
          "UPDATE sync_operations SET operation_type='INTELLIGENCE_CONTINUATION_WAKE' WHERE id=?",
        )
        .run(parent.id);
    return run(q, ...(p as unknown as never[]));
  };
  try {
    await expect(child.q.markDependencyBlocked(child.id, parent.id)).rejects.toThrow(
      "ADMISSION_CHANGED",
    );
  } finally {
    f.db.runAsync = run;
  }
  expect(
    f.sql
      .prepare("SELECT status,dependency_operation_id FROM sync_operations WHERE id=?")
      .get(child.id),
  ).toEqual({ status: "PENDING", dependency_operation_id: null });
});
