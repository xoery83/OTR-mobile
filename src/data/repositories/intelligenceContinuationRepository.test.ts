import { spawnSync } from "node:child_process";
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
import {
  commandDigest,
  callCorrelationSchema,
  verifyPublicationCorrelation,
  createClosedPersistenceGateway,
} from "../../../backend/src/externalIntegrationPersistence";
import { migrations } from "../db/migrations";
import {
  createIntelligenceContinuationRepository,
  type ContinuationDatabase,
} from "./intelligenceContinuationRepository";
import {
  captureAccountRequestContext,
  beginAccountTransition,
  endAccountTransition,
  withAccountApplyGate,
} from "../auth/accountRequestContext";
import { canonicalEventJson, type Json } from "@/domain/trip/eventIntentJson";
import {
  taskSchema,
  attemptSchema,
  type Task,
  type Attempt,
  type ContinuationRoute,
  executionReportSchema,
  type ExecutionReport,
} from "@/domain/intelligence/persistence";
import {
  createClosedOutboundHarness,
  createOutboundContinuationRouter,
  type SyntheticObservation,
} from "../intelligence/closedOutboundHarness";
import {
  createServer83OutboundReservation,
  outboundReservationCommand,
} from "../../../backend/src/outboundReservation";
import {
  readOutboundSnapshots,
  routeOutbound,
  createOutboundAdmission,
  verifyOutboundAdmission,
  type OutboundAdmission,
} from "@/domain/intelligence/outboundRouting";
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
      Array.from({ length: 51 }, (_, i) => i + 1),
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

// Test-only stand-ins share the real file-backed fixture. These tables are never migrations.
function a2Snapshot() {
  return readOutboundSnapshots([
    {
      environment: "TEST",
      environment_version: 1,
      environment_killed: false,
      runtime_enabled: false,
      integration_id: "synthetic-outbound",
      integration_version: 7,
      integration_sha256: h,
      enabled: true,
      killed: false,
      provider_config_id: randomUUID(),
      provider_id: "synthetic",
      model_id: "extractor",
      model_version: "1",
      adapter_version: "1",
      config_version: 7,
      configuration_sha256: h,
      provider_class: "DETERMINISTIC",
      capabilities: ["EXTRACT"],
      modalities: ["TEXT"],
      schemas: [{ id: "flight", version: 1, dialect: "otr" }],
      schema_output: true,
      privacy: "LOCAL_ONLY",
      network_required: false,
      region: "DEVICE",
      routing_class: "DETERMINISTIC",
      priority: 0,
      eligibility: "ELIGIBLE",
      input_byte_limit: 1048576,
      input_count_limit: 64,
      output_byte_limit: 1048576,
      max_risk: 1,
      max_complexity: 10,
      replay_support: "UNSUPPORTED",
      quota_admitted: true,
      rate_admitted: true,
      latency_ms: null,
      expected_cost_nanos: "0",
      expected_currency: "USD",
      price: { id: randomUUID(), version: "1", sha256: h, currency: "USD" },
      health: "UNKNOWN",
      health_reference: null,
      health_config_version: null,
      quality_reference: null,
      quality_policy_reference: null,
      quality_policy_sha256: null,
    },
  ])[0];
}
function a2Request(t: Task) {
  return {
    task: t,
    capabilities: t.capability_requirements,
    modalities: ["TEXT"],
    schema: { id: t.schema_id, version: t.schema_version, sha256: t.schema_sha256 },
    privacy: t.policy_snapshot.privacy,
    online: true,
    networkRequired: false,
    latencyBudgetMs: null,
    risk: "NORMAL" as const,
    budget: { currency: null, nanos: null },
    shadowEligible: true,
    environment: "TEST" as const,
  };
}
async function a2Fixture(f: Fixture, initialize = true) {
  if (initialize) {
    f.sql.exec(
      "CREATE TABLE a2_test_journal(reference TEXT PRIMARY KEY,envelope TEXT NOT NULL,started INTEGER NOT NULL DEFAULT 0,observation TEXT,meter TEXT); CREATE TABLE a2_test_server(call_id TEXT PRIMARY KEY,command TEXT NOT NULL)",
    );
    await f.repo.create(f.context, f.t);
  }
  let snapshot = a2Snapshot(),
    failure = "",
    executions = 0,
    disposition: SyntheticObservation["disposition"] = "SUCCESS";
  let onIO = async (_e: Readonly<OutboundAdmission>) => {};
  let transformObservation = (o: SyntheticObservation): SyntheticObservation => o;
  const runtime = createIntelligenceContinuationRuntime(f.repo, {
    ...f.deps,
    online: () => true,
    routePolicy: () => ({
      modalities: ["TEXT"],
      latencyBudgetMs: null,
      risk: "NORMAL",
      shadowEligible: true,
    }),
    router: async () => ({ status: "UNAVAILABLE", reason: "UNSUPPORTED" }),
  });
  const gateway = createClosedPersistenceGateway({
    gatewayIdentity: "otr_external_integration_call_gateway",
    now: () => now,
    async verify(r) {
      return {
        version: 1,
        principal_kind: "TRUSTED_WORKLOAD",
        verified_actor_id: account,
        verified_account_id: account,
        verified_client_identity: null,
        verified_external_subject: null,
        verified_environment: "TEST",
        auth_source: "TEST_ONLY_INJECTED_VERIFIER",
        auth_config_version: 1,
        auth_session_reference: null,
        verified_at: now,
        expires_at: "2070-01-01T00:00:00.000Z",
        revoked: false,
        request_id: r.requestId,
        request_sha256: r.requestSha256,
        command_kind: r.command,
        gateway_identity: "otr_external_integration_call_gateway",
      };
    },
    async execute(kind, _context, command) {
      if (kind === "external_integration_mark_dispatch") {
        if (failure === "closed") return {};
        if (failure === "closed-auth") throw new Error("CP14_SCOPE_FORBIDDEN");
        throw new Error("CP14_RUNTIME_CLOSED");
      }
      if (failure === "reserve") throw new Error("RESERVE_FAILED");
      const row = command.row as {
        call_id: string;
        shadow: boolean;
        shadow_of_call_id: string | null;
      };
      if (
        row.shadow &&
        !f.sql
          .prepare("SELECT call_id FROM a2_test_server WHERE call_id=?")
          .get(row.shadow_of_call_id!)
      )
        throw new Error("SHADOW_PARENT_RESERVATION_REQUIRED");
      const old = f.sql
        .prepare("SELECT command FROM a2_test_server WHERE call_id=?")
        .get(row.call_id) as { command: string } | undefined;
      const bytes = canonicalEventJson(command as Json);
      if (old && old.command !== bytes) throw new Error("CP14_CHANGED_REQUEST");
      if (!old)
        f.sql.prepare("INSERT INTO a2_test_server VALUES(?,?)").run(row.call_id, bytes);
      if (failure === "reserve-ack") throw new Error("START_ACK_LOST");
      return command.row;
    },
  });
  const server = createServer83OutboundReservation({
    gateway,
    hash,
    id: randomUUID,
    async assertCurrentAuthorization() {
      if (failure === "server-auth") throw new Error("CP14_TRIP_FORBIDDEN");
    },
    async readCurrent() {
      return [snapshot];
    },
    async readReserved(e) {
      const retained = f.sql
        .prepare("SELECT command FROM a2_test_server WHERE call_id=?")
        .get(e.attempt.usage_correlation_id!) as { command: string };
      const c = JSON.parse(retained.command),
        a = c.row;
      return {
        account_id: a.account_id,
        task_id: a.task_id,
        attempt_id: a.attempt_id,
        attempt_sequence: a.attempt_sequence,
        call_id: a.call_id,
        integration_id: a.integration_id,
        request_id: a.request_id,
        request_sha256: a.request_sha256,
        configuration_sha256: a.configuration_sha256,
        config_version: a.config_version,
        provider_config_id: a.provider_config_id,
        input_sha256: a.input_sha256,
        schema_sha256: a.schema_sha256,
        publication_fence: a.publication_fence,
        fallback_chain_id: a.fallback_chain_id,
        shadow: a.shadow,
        shadow_of_call_id: a.shadow_of_call_id,
        environment: a.environment,
        price_schedule_id: a.price_schedule_id,
        provider_id: a.provider_id,
        model_id: a.model_id,
        model_version: a.model_version,
        adapter_version: a.adapter_version,
        trip_id: a.trip_id,
        import_id: a.import_id,
        idempotency_key: a.idempotency_key,
        admission_sha256: c.request_sha256,
        start_sha256: c.start.observation_sha256,
        row_revision: 1,
        dispatch_state: "RESERVED",
        execution_certainty: "NOT_STARTED",
        start_durable: failure !== "start",
      };
    },
  });
  const read = (e: Readonly<OutboundAdmission>) =>
    f.sql
      .prepare("SELECT * FROM a2_test_journal WHERE reference=?")
      .get(e.attempt.request_material_reference!) as {
      started: number;
      observation: string | null;
      meter: string | null;
      envelope: string;
    };
  const synthetic = {
    async proveUndispatched(e: Readonly<OutboundAdmission>) {
      return read(e).started === 0;
    },
    async begin(e: Readonly<OutboundAdmission>) {
      if (failure === "begin") throw new Error("SYNTHETIC_START_FAILED");
      const changed = f.sql
        .prepare("UPDATE a2_test_journal SET started=1 WHERE reference=? AND started=0")
        .run(e.attempt.request_material_reference!);
      if (changed.changes !== 1) throw new Error("SYNTHETIC_ALREADY_STARTED");
    },
    async retain(e: Readonly<OutboundAdmission>, o: SyntheticObservation) {
      if (failure === "retain") throw new Error("CUSTODY_FAILED");
      const old = read(e).observation,
        bytes = canonicalEventJson(o as unknown as Json);
      if (old && old !== bytes) throw new Error("CHANGED_SYNTHETIC_RESULT");
      f.sql
        .prepare("UPDATE a2_test_journal SET observation=? WHERE reference=?")
        .run(bytes, e.attempt.request_material_reference!);
    },
    async read(e: Readonly<OutboundAdmission>): Promise<SyntheticObservation | null> {
      const bytes = read(e).observation;
      return bytes ? JSON.parse(bytes) : null;
    },
    async appendMeter(e: Readonly<OutboundAdmission>, o: SyntheticObservation) {
      if (failure === "meter") throw new Error("COMPLETION_METER_FAILED");
      f.sql
        .prepare("UPDATE a2_test_journal SET meter=? WHERE reference=?")
        .run(
          canonicalEventJson(o as unknown as Json),
          e.attempt.request_material_reference!,
        );
    },
  };
  f.deps.verifyRecovery = async (a, evidenceDigest) => {
    const o = await synthetic.read(
      JSON.parse(
        (
          f.sql
            .prepare("SELECT envelope FROM a2_test_journal WHERE reference=?")
            .get(a.request_material_reference!) as { envelope: string }
        ).envelope,
      ),
    );
    if (!o || (await digest(o)) !== evidenceDigest)
      throw new Error("UNTRUSTED_SYNTHETIC_RECOVERY");
  };
  const harness = createClosedOutboundHarness({
    mode: "TEST_ONLY",
    repo: f.repo,
    runtime,
    server,
    hash,
    getAccountId: f.deps.getAccountId,
    async loadAdmission(a) {
      return JSON.parse(
        (
          f.sql
            .prepare("SELECT envelope FROM a2_test_journal WHERE reference=?")
            .get(a.request_material_reference!) as { envelope: string }
        ).envelope,
      );
    },
    synthetic,
    adapter: {
      kind: "INJECTED_DETERMINISTIC_FAKE",
      async execute(e) {
        executions++;
        // Acquiring the same gate here would deadlock if I/O were accidentally inside it.
        await withAccountApplyGate(async () => {
          f.sql.exec("BEGIN; ROLLBACK;");
        });
        await onIO(e);
        if (failure === "throw")
          throw new Error("private provider error must not become proof");
        const terminal = [
          "SUCCESS",
          "SAFE_FAILURE",
          "DEFINITELY_NOT_DISPATCHED",
          "CANCELED_TERMINAL",
        ].includes(disposition);
        const r = report(e.attempt, {
          execution_observation: terminal ? "TERMINAL" : "UNKNOWN",
          execution_outcome:
            disposition === "SUCCESS"
              ? "SUCCEEDED"
              : disposition === "CANCELED_TERMINAL"
                ? "CANCELED"
                : terminal
                  ? "FAILED"
                  : null,
          response_sha256: disposition === "SUCCESS" ? h : null,
          metering_disposition: "COMPLETION_PENDING",
          recovery_sha256: null,
          reported_usage_summary: {
            version: 1,
            input_tokens: null,
            output_tokens: null,
            total_tokens: null,
            cached_input_tokens: null,
            reasoning_tokens: null,
            image_units: null,
            audio_units: null,
            call_count: null,
            bytes: null,
            wall_ms: null,
            cpu_ms: null,
            gpu_ms: null,
            accelerator_ms: null,
            usage_quality: "UNKNOWN",
          },
        });
        return transformObservation({
          evidence: "CLOSED_SYNTHETIC_EXECUTION_ACCEPTANCE",
          disposition,
          report: r,
          measurement_mode: "NONE",
          other_units: {},
          synthetic_cost: { nanos: null, currency: "USD", quality: "UNKNOWN" },
        });
      },
    },
  });
  async function admit(
    predecessor: Attempt | null = null,
    shadowOf: Attempt | null = null,
  ) {
    let t = await f.repo.read(f.context, f.t.task_id);
    const seed = await f.a(t, t.sync_operation_id ?? undefined);
    if (!t.sync_operation_id)
      t = await f.repo.bindQueue(
        f.context,
        t.task_id,
        t.row_revision,
        seed.sync_operation_id,
      );
    const request = a2Request(t),
      route = await routeOutbound({ ...request, shadow: !!shadowOf }, [snapshot], hash);
    if (route.status !== "ELIGIBLE") throw new Error(route.reason);
    const sequence = (await f.repo.attempts(f.context, t.task_id)).length + 1;
    const e = await createOutboundAdmission({
      request,
      pins: route.pins,
      seed: {
        ...seed,
        attempt_sequence: sequence,
        request_material_reference: randomUUID(),
        usage_correlation_id: randomUUID(),
      },
      predecessor,
      shadowOf,
      hash,
    });
    f.sql
      .prepare("INSERT INTO a2_test_journal(reference,envelope) VALUES(?,?)")
      .run(e.attempt.request_material_reference!, JSON.stringify(e));
    await f.repo.reserveAttempt(f.context, e.attempt);
    return e;
  }
  return {
    runtime,
    harness,
    synthetic,
    server,
    admit,
    read,
    executions: () => executions,
    snapshot: () => snapshot,
    fail: (v: string) => {
      failure = v;
    },
    disposition: (v: SyntheticObservation["disposition"]) => {
      disposition = v;
    },
    config: (v: Partial<typeof snapshot>) => {
      snapshot = { ...snapshot, ...v };
    },
    io: (v: typeof onIO) => {
      onIO = v;
    },
    output: (v: typeof transformObservation) => {
      transformObservation = v;
    },
  };
}
describe("A2 CLOSED SYNTHETIC EXECUTION ACCEPTANCE", () => {
  for (const failure of [
    "reserve",
    "start",
    "closed",
    "closed-auth",
    "begin",
    "server-auth",
  ])
    it(`${failure} pre-dispatch failure leaves fake count zero`, async () => {
      const f = await fixture(),
        a2 = await a2Fixture(f),
        e = await a2.admit();
      a2.fail(failure);
      await expect(
        a2.runtime.execute(
          f.context,
          e.attempt.attempt_id,
          a2.harness.executor(f.context),
        ),
      ).rejects.toThrow();
      expect(a2.executions()).toBe(0);
    });
  for (const change of [
    { killed: true },
    { enabled: false },
    { eligibility: "DISABLED" as const },
    { integration_version: 8 },
  ])
    it(`fresh ${JSON.stringify(change)} excludes fake dispatch and preserves V7`, async () => {
      const f = await fixture(),
        a2 = await a2Fixture(f),
        e = await a2.admit();
      a2.config(change);
      await expect(
        a2.runtime.execute(
          f.context,
          e.attempt.attempt_id,
          a2.harness.executor(f.context),
        ),
      ).rejects.toThrow("INELIGIBLE");
      expect(a2.executions()).toBe(0);
      expect(
        (await f.repo.readAttempt(f.context, e.attempt.attempt_id)).config_version,
      ).toBe("7");
    });
  it("completes with UNKNOWN units, rollback/replay installs without repeating fake I/O", async () => {
    const f = await fixture(),
      a2 = await a2Fixture(f),
      e = await a2.admit();
    const a = await a2.runtime.execute(
      f.context,
      e.attempt.attempt_id,
      a2.harness.executor(f.context),
    );
    expect(a.reported_usage_summary?.input_tokens).toBeNull();
    expect(a.reported_usage_summary?.call_count).toBeNull();
    const publication = randomUUID();
    let installed = 0;
    await expect(
      a2.harness.install(f.context, a.attempt_id, publication, h, async () => {
        throw new Error("ROLLBACK");
      }),
    ).rejects.toThrow("ROLLBACK");
    expect(a2.read(e).meter).toBeTruthy();
    await a2.harness.install(f.context, a.attempt_id, publication, h, async () => {
      installed++;
    });
    await a2.harness.install(f.context, a.attempt_id, publication, h, async () => {
      installed++;
    });
    expect(installed).toBe(1);
    expect(a2.executions()).toBe(1);
    expect(
      JSON.parse(
        (f.sql.prepare("SELECT command FROM a2_test_server").get() as { command: string })
          .command,
      ).row.dispatch_state,
    ).toBe("RESERVED");
  });
  it("meter failure retains success, exact late recovery never recalls fake", async () => {
    const f = await fixture(),
      a2 = await a2Fixture(f),
      e = await a2.admit();
    a2.fail("meter");
    const a = await a2.runtime.execute(
      f.context,
      e.attempt.attempt_id,
      a2.harness.executor(f.context),
    );
    expect(a.execution_outcome).toBe("SUCCEEDED");
    expect(a.metering_disposition).toBe("COMPLETION_PENDING");
    expect(a.response_sha256).toBe(h);
    await expect(
      a2.runtime.execute(f.context, a.attempt_id, a2.harness.executor(f.context)),
    ).rejects.toThrow("RECOVERY");
    a2.fail("");
    await a2.harness.recover(f.context, a.attempt_id);
    await a2.harness.recover(f.context, a.attempt_id);
    expect((await f.repo.readAttempt(f.context, a.attempt_id)).metering_disposition).toBe(
      "COMPLETE",
    );
    expect(a2.executions()).toBe(1);
  });
  for (const disposition of ["MAY_HAVE_STARTED", "TIMEOUT", "RESPONSE_LOST"] as const)
    it(`${disposition} never reexecutes or falls back`, async () => {
      const f = await fixture(),
        a2 = await a2Fixture(f),
        e = await a2.admit();
      a2.disposition(disposition);
      const a = await a2.runtime.execute(
        f.context,
        e.attempt.attempt_id,
        a2.harness.executor(f.context),
      );
      expect(a.execution_observation).toBe("UNKNOWN");
      await expect(
        a2.runtime.execute(f.context, a.attempt_id, a2.harness.executor(f.context)),
      ).rejects.toThrow("RECOVERY");
      await expect(a2.admit(a)).rejects.toThrow("ADMISSION_FENCE");
      expect(a2.executions()).toBe(1);
    });
  for (const failure of ["throw", "retain"])
    it(`${failure} callback/custody loss preserves UNKNOWN responsibility`, async () => {
      const f = await fixture(),
        a2 = await a2Fixture(f),
        e = await a2.admit();
      a2.fail(failure);
      await expect(
        a2.runtime.execute(
          f.context,
          e.attempt.attempt_id,
          a2.harness.executor(f.context),
        ),
      ).rejects.toThrow();
      expect(
        (await f.repo.readAttempt(f.context, e.attempt.attempt_id)).execution_observation,
      ).toBe("UNKNOWN");
      expect(await a2.harness.recover(f.context, e.attempt.attempt_id)).toEqual({
        reason: "RECOVERY_REQUIRED",
      });
      expect(a2.executions()).toBe(1);
    });
  for (const disposition of ["SAFE_FAILURE", "DEFINITELY_NOT_DISPATCHED"] as const)
    it(`${disposition} admits new fallback call using fresh V8 pins`, async () => {
      const f = await fixture(),
        a2 = await a2Fixture(f),
        e = await a2.admit();
      a2.disposition(disposition);
      const a = await a2.runtime.execute(
        f.context,
        e.attempt.attempt_id,
        a2.harness.executor(f.context),
      );
      a2.config({
        integration_version: 8,
        config_version: 8,
        provider_config_id: randomUUID(),
      });
      const fallback = await a2.admit(a);
      a2.disposition("SUCCESS");
      await a2.runtime.execute(
        f.context,
        fallback.attempt.attempt_id,
        a2.harness.executor(f.context),
      );
      expect(fallback.attempt.usage_correlation_id).not.toBe(a.usage_correlation_id);
      expect(fallback.attempt.config_version).toBe("8");
      expect(a.config_version).toBe("7");
      expect(a2.read(e).meter).toBeTruthy();
      expect(a2.executions()).toBe(2);
    });
  it("active and shadow retain separate call/usage; late shadow cannot install or block active", async () => {
    const f = await fixture(),
      a2 = await a2Fixture(f),
      e = await a2.admit(),
      shadow = await a2.admit(null, e.attempt);
    let release!: () => void, started!: () => void;
    const barrier = new Promise<void>((r) => {
        release = r;
      }),
      ready = new Promise<void>((r) => {
        started = r;
      });
    a2.io(async (envelope) => {
      if (envelope.attempt.shadow) {
        started();
        await barrier;
      }
    });
    await a2.server.reserve(e);
    const late = a2.runtime.execute(
      f.context,
      shadow.attempt.attempt_id,
      a2.harness.executor(f.context),
    );
    await ready;
    const a = await a2.runtime.execute(
      f.context,
      e.attempt.attempt_id,
      a2.harness.executor(f.context),
    );
    await a2.harness.install(f.context, a.attempt_id, randomUUID(), h, async () => {});
    const fact = await a2.runtime.fact(f.context, f.t.task_id, {
      now,
      urgencyHorizonMs: 0,
      evidencedDeadline: null,
    });
    expect(fact.outstanding_work).toBe(false);
    release();
    const observed = await late;
    expect(observed.result_install_disposition).toBe("SHADOW_ONLY");
    await expect(
      a2.harness.install(
        f.context,
        shadow.attempt.attempt_id,
        randomUUID(),
        h,
        async () => {},
      ),
    ).rejects.toThrow("SHADOW");
    expect(a2.read(e).meter).toBeTruthy();
    expect(a2.read(shadow).meter).toBeTruthy();
    expect(a2.executions()).toBe(2);
    expect((await f.repo.read(f.context, f.t.task_id)).current_attempt_id).toBe(
      a.attempt_id,
    );
  });
  it("concurrent execute callers permit one fake, exact START reservation replay is stable", async () => {
    const f = await fixture(),
      a2 = await a2Fixture(f),
      e = await a2.admit();
    const outcomes = await Promise.allSettled([
      a2.runtime.execute(f.context, e.attempt.attempt_id, a2.harness.executor(f.context)),
      a2.runtime.execute(f.context, e.attempt.attempt_id, a2.harness.executor(f.context)),
    ]);
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(a2.executions()).toBe(1);
    await a2.server.reserve(e);
    expect(
      (f.sql.prepare("SELECT count(*) n FROM a2_test_server").get() as { n: number }).n,
    ).toBe(1);
  });
  it("A→B→A callback cannot apply under the old generation; fresh A recovers exact result", async () => {
    const f = await fixture(),
      a2 = await a2Fixture(f),
      e = await a2.admit();
    a2.io(async () => {
      let lease = await beginAccountTransition();
      f.setAccount(randomUUID());
      endAccountTransition(lease);
      lease = await beginAccountTransition();
      f.setAccount(account);
      endAccountTransition(lease);
    });
    await expect(
      a2.runtime.execute(f.context, e.attempt.attempt_id, a2.harness.executor(f.context)),
    ).rejects.toThrow("Account changed");
    const fresh = await captureAccountRequestContext("", f.deps.getAccountId);
    await a2.harness.recover(fresh, e.attempt.attempt_id);
    expect((await f.repo.readAttempt(fresh, e.attempt.attempt_id)).response_sha256).toBe(
      h,
    );
    expect(a2.executions()).toBe(1);
  });
  it("cold reopen recovers metering and retained result without fake redispatch", async () => {
    const folder = mkdtempSync(join(tmpdir(), "a2-"));
    folders.push(folder);
    const path = join(folder, "journal.db");
    const f = await fixture(true, path),
      a2 = await a2Fixture(f),
      e = await a2.admit();
    a2.fail("meter");
    await a2.runtime.execute(
      f.context,
      e.attempt.attempt_id,
      a2.harness.executor(f.context),
    );
    f.sql.close();
    const cold = await fixture(true, path, false),
      reopened = await a2Fixture(cold, false);
    await reopened.harness.recover(cold.context, e.attempt.attempt_id);
    expect(
      (await cold.repo.readAttempt(cold.context, e.attempt.attempt_id))
        .metering_disposition,
    ).toBe("COMPLETE");
    expect(reopened.executions()).toBe(0);
  });
  it("retained admission binds price, provider pins and body; mutation rejects", async () => {
    const f = await fixture(),
      a2 = await a2Fixture(f),
      e = await a2.admit();
    await expect(
      verifyOutboundAdmission(e.attempt, { ...e, body_sha256: "b".repeat(64) }, hash),
    ).rejects.toThrow("DIGEST");
    const changed = {
      ...e,
      pins: {
        ...e.pins,
        snapshot: {
          ...e.pins.snapshot,
          price: { ...e.pins.snapshot.price!, id: randomUUID() },
        },
      },
    };
    await expect(verifyOutboundAdmission(e.attempt, changed, hash)).rejects.toThrow(
      "DIGEST",
    );
    expect(outboundReservationCommand(e).row.request_sha256).toBe(
      e.attempt.request_sha256,
    );
  });
});

for (const change of ["Account", "Trip", "task fence"])
  it(`A2 ${change} change before execution leaves fake count zero`, async () => {
    const f = await fixture(),
      a2 = await a2Fixture(f),
      e = await a2.admit();
    if (change === "Account") {
      const lease = await beginAccountTransition();
      f.setAccount(randomUUID());
      endAccountTransition(lease);
    } else if (change === "Trip") f.setAdmission(false);
    else {
      const t = await f.repo.read(f.context, f.t.task_id);
      await f.repo.fence(f.context, t.task_id, t.row_revision, "CANCELED");
    }
    await expect(
      a2.runtime.execute(f.context, e.attempt.attempt_id, a2.harness.executor(f.context)),
    ).rejects.toThrow();
    expect(a2.executions()).toBe(0);
  });
it("A2 cancel during synthetic I/O retains late result/meter and rejects install", async () => {
  const f = await fixture(),
    a2 = await a2Fixture(f),
    e = await a2.admit();
  a2.io(async () => {
    await a2.runtime.cancel(f.context, f.t.task_id);
  });
  const a = await a2.runtime.execute(
    f.context,
    e.attempt.attempt_id,
    a2.harness.executor(f.context),
  );
  const installed = await a2.harness.install(
    f.context,
    a.attempt_id,
    randomUUID(),
    h,
    async () => {
      throw new Error("must not install");
    },
  );
  expect(installed.result_install_disposition).toBe("REJECTED_CANCELED");
  expect(a2.read(e).meter).toBeTruthy();
  expect(a2.executions()).toBe(1);
});
it("A2 stale Trip blocks install without erasing usage or success", async () => {
  const f = await fixture(),
    a2 = await a2Fixture(f),
    e = await a2.admit();
  await a2.runtime.execute(
    f.context,
    e.attempt.attempt_id,
    a2.harness.executor(f.context),
  );
  f.setAdmission(false);
  await expect(
    a2.harness.install(f.context, e.attempt.attempt_id, randomUUID(), h, async () => {}),
  ).rejects.toThrow("TRIP");
  expect(a2.read(e).meter).toBeTruthy();
  expect(a2.executions()).toBe(1);
});
it("A2 kill while synthetic I/O is possible does not prove termination", async () => {
  const f = await fixture(),
    a2 = await a2Fixture(f),
    e = await a2.admit();
  a2.disposition("TIMEOUT");
  a2.io(async () => {
    a2.config({ killed: true });
  });
  const a = await a2.runtime.execute(
    f.context,
    e.attempt.attempt_id,
    a2.harness.executor(f.context),
  );
  expect(a.execution_observation).toBe("UNKNOWN");
  await expect(a2.admit(a)).rejects.toThrow("PROVIDER_UNAVAILABLE");
  expect(a2.read(e).meter).toBeTruthy();
});
it("A2 kill after success retains historical responsibility and immutable pins", async () => {
  const f = await fixture(),
    a2 = await a2Fixture(f),
    e = await a2.admit();
  const a = await a2.runtime.execute(
    f.context,
    e.attempt.attempt_id,
    a2.harness.executor(f.context),
  );
  a2.config({ killed: true });
  await a2.harness.install(f.context, a.attempt_id, randomUUID(), h, async () => {});
  expect(a2.read(e).meter).toBeTruthy();
  expect(a.config_version).toBe("7");
});
for (const provider_class of [
  "DETERMINISTIC",
  "ON_DEVICE",
  "OTR_SELF_HOSTED",
  "COMMERCIAL_REMOTE",
] as const)
  it(`A2 fake ${provider_class} keeps absent tokens/compute UNKNOWN and preserves generic units`, async () => {
    const f = await fixture();
    // LOCAL_ONLY still correctly excludes remote classes; select their offline fake metadata under REMOTE_ALLOWED.
    if (["OTR_SELF_HOSTED", "COMMERCIAL_REMOTE"].includes(provider_class)) {
      f.t.policy_snapshot.privacy = "REMOTE_ALLOWED";
      f.t.policy_sha256 = await digest(f.t.policy_snapshot);
    }
    const a2 = await a2Fixture(f);
    a2.config({
      provider_class,
      privacy: provider_class === "COMMERCIAL_REMOTE" ? "REMOTE_ALLOWED" : "LOCAL_ONLY",
    });
    a2.output((o) => ({
      ...o,
      measurement_mode: "CUMULATIVE",
      other_units: { measured_wall_ticks: 17 },
      report: {
        ...o.report,
        reported_usage_summary: {
          ...o.report.reported_usage_summary!,
          wall_ms: 5,
          usage_quality: "ACTUAL_REPORTED",
        },
      },
    }));
    const e = await a2.admit(),
      a = await a2.runtime.execute(
        f.context,
        e.attempt.attempt_id,
        a2.harness.executor(f.context),
      );
    expect(a.reported_usage_summary?.input_tokens).toBeNull();
    expect(a.reported_usage_summary?.cpu_ms).toBeNull();
    expect(a.reported_usage_summary?.wall_ms).toBe(5);
    expect(JSON.parse(a2.read(e).meter!).other_units.measured_wall_ticks).toBe(17);
  });
it("A2 response identity mismatch retains uncertainty and cannot install", async () => {
  const f = await fixture(),
    a2 = await a2Fixture(f),
    e = await a2.admit();
  a2.output((o) => ({ ...o, report: { ...o.report, attempt_id: randomUUID() } }));
  await expect(
    a2.runtime.execute(f.context, e.attempt.attempt_id, a2.harness.executor(f.context)),
  ).rejects.toThrow("RESULT_IDENTITY");
  expect(
    (await f.repo.readAttempt(f.context, e.attempt.attempt_id)).execution_observation,
  ).toBe("UNKNOWN");
  expect(a2.executions()).toBe(1);
});
it("A2 UNKNOWN queue retries and cold reopen cannot invoke the fake again", async () => {
  const folder = mkdtempSync(join(tmpdir(), "a2-unknown-"));
  folders.push(folder);
  const path = join(folder, "journal.db");
  const f = await fixture(true, path),
    a2 = await a2Fixture(f),
    e = await a2.admit();
  a2.disposition("RESPONSE_LOST");
  await a2.runtime.execute(
    f.context,
    e.attempt.attempt_id,
    a2.harness.executor(f.context),
  );
  f.sql
    .prepare(
      "UPDATE sync_operations SET attempt_count=100,status='RETRYABLE',claim_owner=NULL,next_attempt_at=NULL WHERE id=?",
    )
    .run(e.attempt.sync_operation_id);
  f.sql.close();
  const cold = await fixture(true, path, false),
    reopened = await a2Fixture(cold, false);
  await expect(
    reopened.runtime.execute(
      cold.context,
      e.attempt.attempt_id,
      reopened.harness.executor(cold.context),
    ),
  ).rejects.toThrow("RECOVERY");
  expect(reopened.executions()).toBe(0);
});

it("A2 exact trusted terminal recovery resolves synthetic timeout without blind replay", async () => {
  const f = await fixture(),
    a2 = await a2Fixture(f),
    e = await a2.admit();
  a2.disposition("TIMEOUT");
  await a2.runtime.execute(
    f.context,
    e.attempt.attempt_id,
    a2.harness.executor(f.context),
  );
  const unknown = JSON.parse(a2.read(e).observation!) as SyntheticObservation;
  const terminal: SyntheticObservation = {
    ...unknown,
    disposition: "SUCCESS",
    report: {
      ...unknown.report,
      execution_observation: "TERMINAL",
      execution_outcome: "SUCCEEDED",
      response_sha256: h,
    },
  };
  // The test-only trusted custody owner admits new exact evidence; original UNKNOWN meter is retained.
  const oldMeter = a2.read(e).meter;
  f.sql
    .prepare("UPDATE a2_test_journal SET observation=? WHERE reference=?")
    .run(JSON.stringify(terminal), e.attempt.request_material_reference!);
  await a2.harness.recover(f.context, e.attempt.attempt_id);
  const recovered = await f.repo.readAttempt(f.context, e.attempt.attempt_id);
  expect(recovered.execution_observation).toBe("TERMINAL");
  expect(recovered.response_sha256).toBe(h);
  expect(oldMeter).toBeTruthy();
  expect(a2.executions()).toBe(1);
});

it("A2 router adapts actual C2 wake admission; wake never executes fake", async () => {
  const f = await fixture(),
    a2 = await a2Fixture(f);
  const router = createOutboundContinuationRouter({
    environment: "TEST",
    hash,
    complexity: () => 0,
    snapshots: async () => [a2.snapshot()],
    predecessor: async () => null,
    async seed(r) {
      return {
        ...(await f.a(r.task, r.task.sync_operation_id!)),
        request_material_reference: randomUUID(),
        usage_correlation_id: randomUUID(),
      };
    },
    async retainAdmission(e) {
      f.sql
        .prepare("INSERT INTO a2_test_journal(reference,envelope) VALUES(?,?)")
        .run(e.attempt.request_material_reference!, JSON.stringify(e));
    },
  });
  const runtime = createIntelligenceContinuationRuntime(f.repo, {
    ...f.deps,
    router,
    online: () => true,
    routePolicy: () => ({
      modalities: ["TEXT"],
      latencyBudgetMs: null,
      risk: "NORMAL",
      shadowEligible: false,
    }),
  });
  await f.repo.scheduleWake(f.context, f.t.task_id);
  const queue = createIntelligenceWakeQueue(f.db, f.deps),
    pending = (
      await createSyncOperationRepository(f.db, f.deps.getAccountId).listPending()
    )[0];
  expect(await queue.claim(f.context, pending, "a2-wake-owner")).toBe(true);
  expect(await runtime.evaluate(f.context, pending)).toBe("CREATE_ATTEMPT");
  expect(a2.executions()).toBe(0);
  const t = await f.repo.read(f.context, f.t.task_id);
  await runtime.execute(f.context, t.current_attempt_id!, a2.harness.executor(f.context));
  expect(a2.executions()).toBe(1);
});
it("A2 shadow sequence never consumes the active attempt bound; competing fallback admits once", async () => {
  const f = await fixture();
  f.t.policy_snapshot.max_attempts = 2;
  f.t.policy_sha256 = await digest(f.t.policy_snapshot);
  const a2 = await a2Fixture(f),
    e = await a2.admit(),
    shadow = await a2.admit(null, e.attempt);
  a2.disposition("SAFE_FAILURE");
  await a2.server.reserve(e);
  await a2.runtime.execute(
    f.context,
    shadow.attempt.attempt_id,
    a2.harness.executor(f.context),
  );
  const active = await a2.runtime.execute(
    f.context,
    e.attempt.attempt_id,
    a2.harness.executor(f.context),
  );
  const attempts = await Promise.allSettled([a2.admit(active), a2.admit(active)]);
  expect(attempts.filter((o) => o.status === "fulfilled")).toHaveLength(1);
  const admitted = attempts.find(
    (o) => o.status === "fulfilled",
  ) as PromiseFulfilledResult<OutboundAdmission>;
  expect(admitted.value.attempt.attempt_sequence).toBe(3);
  a2.disposition("SUCCESS");
  await a2.runtime.execute(
    f.context,
    admitted.value.attempt.attempt_id,
    a2.harness.executor(f.context),
  );
});

it("A2 shadow cannot execute until its active parent call is durably reserved", async () => {
  const f = await fixture(),
    a2 = await a2Fixture(f),
    active = await a2.admit(),
    shadow = await a2.admit(null, active.attempt);
  await expect(
    a2.runtime.execute(
      f.context,
      shadow.attempt.attempt_id,
      a2.harness.executor(f.context),
    ),
  ).rejects.toThrow("SHADOW_PARENT_RESERVATION_REQUIRED");
  expect(a2.executions()).toBe(0);
  expect((await f.repo.read(f.context, f.t.task_id)).current_attempt_id).toBe(
    active.attempt.attempt_id,
  );
});

it("A2 admission snapshots caller-owned pins before asynchronous digest verification", async () => {
  const f = await fixture(),
    a2 = await a2Fixture(f),
    e = await a2.admit();
  const mutable = structuredClone(e);
  const verified = verifyOutboundAdmission(e.attempt, mutable, async (bytes) => {
    mutable.trip_id = randomUUID();
    return hash(bytes);
  });
  expect((await verified).trip_id).toBe(e.trip_id);
});

it("A2 lost START acknowledgement recovers exact call/START and positive undispatched proof", async () => {
  const f = await fixture(),
    a2 = await a2Fixture(f),
    e = await a2.admit();
  a2.fail("reserve-ack");
  await expect(
    a2.runtime.execute(f.context, e.attempt.attempt_id, a2.harness.executor(f.context)),
  ).rejects.toThrow("START_ACK_LOST");
  const unknownMeter = await f.repo.readAttempt(f.context, e.attempt.attempt_id);
  expect(unknownMeter.execution_observation).toBe("NOT_STARTED");
  expect(unknownMeter.metering_disposition).toBe("UNKNOWN");
  expect(a2.executions()).toBe(0);
  a2.fail("");
  await a2.harness.recoverStart(f.context, e.attempt.attempt_id);
  await a2.runtime.execute(
    f.context,
    e.attempt.attempt_id,
    a2.harness.executor(f.context),
  );
  expect(a2.executions()).toBe(1);
  expect(
    (f.sql.prepare("SELECT count(*) n FROM a2_test_server").get() as { n: number }).n,
  ).toBe(1);
});
it("A2 START recovery cannot reset possible synthetic execution", async () => {
  const f = await fixture(),
    a2 = await a2Fixture(f),
    e = await a2.admit();
  a2.disposition("TIMEOUT");
  await a2.runtime.execute(
    f.context,
    e.attempt.attempt_id,
    a2.harness.executor(f.context),
  );
  await expect(a2.harness.recoverStart(f.context, e.attempt.attempt_id)).rejects.toThrow(
    "RECOVERY_REQUIRED",
  );
  expect(a2.executions()).toBe(1);
});

// F1: explicit rendezvous, never sleeps/lease inference. Change commits before begin resumes.
function a2F1Barrier() {
  let entered!: () => void, resume!: () => void;
  const reached = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const released = new Promise<void>((resolve) => {
    resume = resolve;
  });
  return {
    reached,
    resume,
    async pause() {
      entered();
      await released;
    },
  };
}
describe("A2 F1 final execution admission", () => {
  for (const change of [
    "kill",
    "disable",
    "V8 DISABLED",
    "cancel",
    "Trip revoke",
    "A→B",
    "A→B→A",
    "stale attempt",
    "retained identity",
  ])
    it(`${change} committed during synthetic.begin leaves fake zero and responsibility intact`, async () => {
      const f = await fixture(),
        a2 = await a2Fixture(f),
        e = await a2.admit(),
        barrier = a2F1Barrier();
      const begin = a2.synthetic.begin;
      a2.synthetic.begin = async (admission) => {
        await barrier.pause();
        await begin(admission);
      };
      // Attach rejection handling before releasing the barrier, including Account failures.
      const execution = a2.runtime
        .execute(f.context, e.attempt.attempt_id, a2.harness.executor(f.context))
        .then(
          () => null,
          (error: unknown) => error,
        );
      await barrier.reached;
      if (change === "kill") a2.config({ killed: true });
      else if (change === "disable") a2.config({ enabled: false });
      else if (change === "V8 DISABLED")
        a2.config({
          config_version: 8,
          provider_config_id: randomUUID(),
          eligibility: "DISABLED",
        });
      else if (change === "cancel") await a2.runtime.cancel(f.context, e.attempt.task_id);
      else if (change === "Trip revoke") f.setAdmission(false);
      else if (change === "A→B" || change === "A→B→A") {
        const b = await beginAccountTransition();
        f.setAccount(randomUUID());
        endAccountTransition(b);
        if (change === "A→B→A") {
          const a = await beginAccountTransition();
          f.setAccount(account);
          endAccountTransition(a);
        }
      } else if (change === "stale attempt") {
        const a = await f.repo.readAttempt(f.context, e.attempt.attempt_id);
        await f.repo.observeAttempt(f.context, a.attempt_id, a.row_revision, {
          ...f.observation("UNKNOWN"),
          metering_disposition: "START_DURABLE",
        });
      } else {
        const changed = { ...e, body_sha256: "b".repeat(64) };
        f.sql
          .prepare("UPDATE a2_test_journal SET envelope=? WHERE reference=?")
          .run(JSON.stringify(changed), e.attempt.request_material_reference!);
      }
      const reserved = f.sql
        .prepare("SELECT command FROM a2_test_server WHERE call_id=?")
        .get(e.attempt.usage_correlation_id!) as { command: string };
      barrier.resume();
      expect(await execution).toBeInstanceOf(Error);
      expect(a2.executions()).toBe(0);
      expect(a2.read(e)).toMatchObject({ started: 1, observation: null, meter: null });
      expect(
        f.sql
          .prepare("SELECT command FROM a2_test_server WHERE call_id=?")
          .get(e.attempt.usage_correlation_id!),
      ).toEqual(reserved);
      const retained = JSON.parse(reserved.command);
      expect(retained.start).toBeTruthy();
      // A fresh context can inspect responsibility; equality alone did not admit old A.
      f.setAccount(account);
      const fresh = await captureAccountRequestContext("", f.deps.getAccountId);
      const a = await f.repo.readAttempt(fresh, e.attempt.attempt_id);
      expect(["UNKNOWN", "RUNNING"]).toContain(a.execution_observation);
      expect(a.metering_disposition).toBe("START_DURABLE");
      expect(a.execution_outcome).toBeNull();
      expect(a.reported_usage_summary).toBeNull();
      await expect(
        a2.runtime.execute(fresh, a.attempt_id, a2.harness.executor(fresh)),
      ).rejects.toThrow("RECOVERY");
      await expect(a2.admit(a)).rejects.toThrow();
      expect(a2.executions()).toBe(0);
    });

  it("valid unchanged begin admits exactly one fake under concurrent callers", async () => {
    const f = await fixture(),
      a2 = await a2Fixture(f),
      e = await a2.admit(),
      barrier = a2F1Barrier();
    const begin = a2.synthetic.begin;
    a2.synthetic.begin = async (admission) => {
      await barrier.pause();
      await begin(admission);
    };
    const first = a2.runtime.execute(
      f.context,
      e.attempt.attempt_id,
      a2.harness.executor(f.context),
    );
    await barrier.reached;
    await expect(
      a2.runtime.execute(f.context, e.attempt.attempt_id, a2.harness.executor(f.context)),
    ).rejects.toThrow("RECOVERY");
    barrier.resume();
    expect((await first).execution_outcome).toBe("SUCCEEDED");
    expect(a2.executions()).toBe(1);
  });

  it("local cancel after successful final server recheck is caught by final local CAS", async () => {
    const f = await fixture(),
      a2 = await a2Fixture(f),
      e = await a2.admit(),
      barrier = a2F1Barrier();
    let began = false;
    const begin = a2.synthetic.begin,
      eligibility = a2.server.freshEligibility;
    a2.synthetic.begin = async (admission) => {
      await begin(admission);
      began = true;
    };
    a2.server.freshEligibility = async (admission) => {
      await eligibility(admission);
      if (began) await barrier.pause();
    };
    const execution = a2.runtime
      .execute(f.context, e.attempt.attempt_id, a2.harness.executor(f.context))
      .then(
        () => null,
        (error: unknown) => error,
      );
    await barrier.reached;
    await a2.runtime.cancel(f.context, e.attempt.task_id);
    barrier.resume();
    expect(await execution).toBeInstanceOf(Error);
    expect(a2.executions()).toBe(0);
    expect(a2.read(e)).toMatchObject({ started: 1, observation: null, meter: null });
  });

  it("final CAS rejects cancellation arriving after local reads before conditional UPDATE", async () => {
    const f = await fixture(),
      a2 = await a2Fixture(f),
      e = await a2.admit(),
      run = f.db.runAsync;
    f.db.runAsync = async (sql, ...params) => {
      if (sql.includes("SET row_revision=row_revision+1"))
        f.sql
          .prepare(
            "UPDATE intelligence_continuations SET publication_fence=publication_fence+1, row_revision=row_revision+1, cancellation_disposition='REQUESTED', work_disposition='CANCELED' WHERE task_id=?",
          )
          .run(e.attempt.task_id);
      return run(sql, ...(params as unknown as never[]));
    };
    await expect(
      a2.runtime.execute(f.context, e.attempt.attempt_id, a2.harness.executor(f.context)),
    ).rejects.toThrow();
    expect(a2.executions()).toBe(0);
    expect(a2.read(e).started).toBe(1);
  });

  it("failed final eligibility permits exact evidence recovery, never reexecution or implicit fallback", async () => {
    const f = await fixture(),
      a2 = await a2Fixture(f),
      e = await a2.admit(),
      barrier = a2F1Barrier();
    const begin = a2.synthetic.begin;
    a2.synthetic.begin = async (admission) => {
      await barrier.pause();
      await begin(admission);
    };
    const execution = a2.runtime
      .execute(f.context, e.attempt.attempt_id, a2.harness.executor(f.context))
      .then(
        () => null,
        (error: unknown) => error,
      );
    await barrier.reached;
    a2.config({ killed: true });
    barrier.resume();
    expect(await execution).toBeInstanceOf(Error);
    expect(await a2.harness.recover(f.context, e.attempt.attempt_id)).toEqual({
      reason: "RECOVERY_REQUIRED",
    });
    a2.config({ killed: false });
    const a = await f.repo.readAttempt(f.context, e.attempt.attempt_id);
    await expect(a2.admit(a)).rejects.toThrow();
    // Explicit trusted terminal evidence is required; missing fake execution is not proof.
    const terminal: SyntheticObservation = {
      evidence: "CLOSED_SYNTHETIC_EXECUTION_ACCEPTANCE",
      disposition: "CANCELED_TERMINAL",
      report: report(a, {
        execution_observation: "TERMINAL",
        execution_outcome: "CANCELED",
        response_sha256: null,
        reported_usage_summary: null,
      }),
      measurement_mode: "NONE",
      other_units: {},
      synthetic_cost: { nanos: null, currency: null, quality: "UNKNOWN" },
    };
    await a2.synthetic.retain(e, terminal);
    await a2.harness.recover(f.context, a.attempt_id);
    expect((await f.repo.readAttempt(f.context, a.attempt_id)).execution_outcome).toBe(
      "CANCELED",
    );
    expect(a2.read(e).meter).toBeTruthy();
    expect(a2.executions()).toBe(0);
  });
});

// Optional actual-root bridge: only a task-owned network-none disposable fixture.
// Normal runs retain the accepted fault-injected bridge; CP14_SERVER83=1 exercises
// the same C2 -> A2 -> protected reservation/START -> CLOSED dispatch -> install.
async function cp14ActualServer(f: Fixture, a2: Awaited<ReturnType<typeof a2Fixture>>) {
  const container = process.env.CP14_TEST_CONTAINER!;
  expect(container).toBe("otr-cp14-final-acceptance");
  expect(
    spawnSync(
      "docker",
      ["inspect", container, "--format", "{{.HostConfig.NetworkMode}}"],
      { encoding: "utf8" },
    ).stdout.trim(),
  ).toBe("none");
  function sql(body: string) {
    const r = spawnSync(
      "docker",
      [
        "exec",
        "-i",
        container,
        "psql",
        "-X",
        "-qAt",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "supabase_admin",
        "-d",
        "postgres",
      ],
      { input: body, encoding: "utf8" },
    );
    if (r.status !== 0)
      throw new Error(r.stderr.match(/ERROR:\s+([^\n]+)/)?.[1] ?? "CP14_FIXTURE_FAILURE");
    return r.stdout.trim();
  }
  const literal = (v: unknown) =>
    "'" + JSON.stringify(v).replaceAll("'", "''") + "'::jsonb";
  const actor = sql(
    "select actor_id from public.external_integration_admin_grants where permission='CONFIG_ADMIN' and revoked_at is null limit 1;",
  );
  const template = (table: string) =>
    JSON.parse(sql(`select to_jsonb(t) from public.${table} t limit 1;`));
  sql(`insert into auth.users(id) values('${account}') on conflict do nothing;`);
  const context = (
    kind: string,
    requestId: string,
    digest: string,
    who: "OTR_ADMIN" | "TRUSTED_WORKLOAD",
    identity: string,
    gateway:
      "otr_external_integration_admin_gateway" | "otr_external_integration_call_gateway",
  ) => ({
    version: 1 as const,
    principal_kind: who,
    verified_actor_id: identity,
    verified_account_id: identity,
    verified_client_identity: null,
    verified_external_subject: null,
    verified_environment: "TEST" as const,
    auth_source: "TEST_ONLY_INJECTED_VERIFIER",
    auth_config_version: 1,
    auth_session_reference: null,
    verified_at: now,
    expires_at: "2070-01-01T00:00:00Z",
    revoked: false,
    request_id: requestId,
    request_sha256: digest,
    command_kind: kind,
    gateway_identity: gateway,
  });
  const admin = createClosedPersistenceGateway({
    gatewayIdentity: "otr_external_integration_admin_gateway",
    now: () => now,
    async verify(r) {
      return context(
        r.command,
        r.requestId,
        r.requestSha256,
        "OTR_ADMIN",
        actor,
        "otr_external_integration_admin_gateway",
      );
    },
    async execute(kind, ctx, body) {
      return JSON.parse(
        sql(
          `set session authorization otr_external_integration_admin_gateway;select public.${kind}(${literal(ctx)},${literal(body)});`,
        ),
      );
    },
  });
  async function administer(
    kind: Parameters<typeof admin.invoke>[0],
    fields: Record<string, unknown>,
  ) {
    const body = {
      version: 1,
      environment: "TEST",
      request_id: randomUUID(),
      actor_id: actor,
      ...fields,
    };
    return admin.invoke(kind, { ...body, request_sha256: commandDigest(body) });
  }
  const integration = `cp14-final-${randomUUID()}`;
  const registry = {
    ...template("external_integrations"),
    integration_id: integration,
    category: "INTELLIGENCE_OUTBOUND",
    environment: "TEST",
    config_version: 1,
    config_sha256: h,
    enabled: true,
    kill_switch: true,
    quota_limit: null,
    quota_window_seconds: null,
    rate_per_minute: null,
    health_state: "UNKNOWN",
    health_observed_at: null,
    health_observation_id: null,
    created_at: now,
    updated_at: now,
    created_by: actor,
    updated_by: actor,
  };
  await administer("external_integration_configure", {
    integration_id: integration,
    expected_version: null,
    audit_id: randomUUID(),
    reason_code: "SYNTHETIC",
    row: registry,
  });
  await administer("external_integration_set_kill", {
    integration_id: integration,
    expected_version: 1,
    audit_id: randomUUID(),
    reason_code: "SYNTHETIC",
    kill_switch: false,
  });
  const provider = {
    ...template("intelligence_provider_configs"),
    provider_config_id: randomUUID(),
    integration_id: integration,
    provider_id: "synthetic",
    model_id: "extractor",
    model_version: "1",
    adapter_version: "1",
    config_version: 1,
    configuration_sha256: h,
    provider_class: "DETERMINISTIC",
    capabilities: ["EXTRACT"],
    modalities: ["TEXT"],
    schema_contracts: [{ id: "flight", version: 1, dialect: "otr" }],
    schema_output: true,
    privacy_policy: "LOCAL_ONLY",
    network_required: false,
    data_region: "DEVICE",
    routing_class: "DETERMINISTIC",
    routing_priority: 0,
    routing_eligibility: "ELIGIBLE",
    input_byte_limit: 1048576,
    input_count_limit: 64,
    output_byte_limit: 1048576,
    max_complexity: 10,
    max_risk: 1,
    replay_support: "UNSUPPORTED",
    quality_policy_reference: null,
    quality_policy_sha256: null,
    quality_observation_reference: null,
    expected_completion_cost_nanos: null,
    expected_cost_currency: null,
    created_at: now,
    created_by: actor,
  };
  await administer("intelligence_provider_config_append", {
    integration_id: integration,
    expected_version: null,
    audit_id: randomUUID(),
    reason_code: "SYNTHETIC",
    row: provider,
  });
  const environment = JSON.parse(
    sql(
      "select to_jsonb(e) from public.external_integration_environment_state e where environment='TEST';",
    ),
  );
  a2.config({
    integration_id: integration,
    integration_version: 2,
    provider_config_id: provider.provider_config_id,
    config_version: 1,
    price: null,
    expected_cost_nanos: null,
    expected_currency: null,
    environment_version: Number(environment.config_version),
  });
  const gateway = createClosedPersistenceGateway({
    gatewayIdentity: "otr_external_integration_call_gateway",
    now: () => now,
    async verify(r) {
      return context(
        r.command,
        r.requestId,
        r.requestSha256,
        "TRUSTED_WORKLOAD",
        account,
        "otr_external_integration_call_gateway",
      );
    },
    async execute(kind, ctx, body) {
      return JSON.parse(
        sql(
          `set session authorization otr_external_integration_call_gateway;select public.${kind}(${literal(ctx)},${literal(body)});`,
        ),
      );
    },
  });
  const server = createServer83OutboundReservation({
    gateway,
    hash,
    id: randomUUID,
    async assertCurrentAuthorization(e) {
      expect(e.attempt.account_id).toBe(account);
    },
    async readCurrent() {
      const i = JSON.parse(
        sql(
          `select to_jsonb(i) from public.external_integrations i where integration_id='${integration}';`,
        ),
      );
      const env = JSON.parse(
        sql(
          "select to_jsonb(e) from public.external_integration_environment_state e where environment='TEST';",
        ),
      );
      return [
        {
          ...a2.snapshot(),
          enabled: i.enabled,
          killed: i.kill_switch,
          integration_version: i.config_version,
          integration_sha256: i.config_sha256,
          environment_version: env.config_version,
          environment_killed: env.kill_switch,
          runtime_enabled: env.runtime_enabled,
        },
      ];
    },
    async readReserved(e) {
      const c = JSON.parse(
        sql(
          `select to_jsonb(c) from public.external_integration_calls c where call_id='${e.attempt.usage_correlation_id}';`,
        ),
      );
      const start = JSON.parse(
        sql(
          `select to_jsonb(u) from public.external_integration_usage_events u where call_id='${c.call_id}' and observation_kind='START';`,
        ),
      );
      const expected = outboundReservationCommand(e);
      const { admitted_at: _admitted, ...rowPins } = expected.row;
      const {
        observed_at: _observed,
        received_at: _received,
        ...startPins
      } = expected.start;
      void _admitted;
      void _observed;
      void _received;
      expect(c).toMatchObject({ ...rowPins, admission_sha256: expected.request_sha256 });
      expect(start).toMatchObject(startPins);
      return {
        ...Object.fromEntries(
          [
            ...Object.keys(callCorrelationSchema.shape),
            "environment",
            "price_schedule_id",
            "provider_id",
            "model_id",
            "model_version",
            "adapter_version",
            "trip_id",
            "import_id",
            "idempotency_key",
            "admission_sha256",
            "row_revision",
            "dispatch_state",
            "execution_certainty",
          ].map((k) => [k, c[k]]),
        ),
        start_durable: true,
        start_sha256: start.observation_sha256,
      };
    },
  });
  Object.assign(a2.server, server);
  return {
    calls: () =>
      JSON.parse(
        sql(
          `select jsonb_agg(to_jsonb(c)) from public.external_integration_calls c where integration_id='${integration}';`,
        ),
      ),
    usage: () =>
      JSON.parse(
        sql(
          `select jsonb_agg(to_jsonb(u)) from public.external_integration_usage_events u join public.external_integration_calls c using(call_id) where c.integration_id='${integration}';`,
        ),
      ),
    inbound: () =>
      sql(
        `select jsonb_build_array((select count(*) from public.external_client_grants where account_id='${account}'),(select count(*) from public.inbound_ai_import_reservations where account_id='${account}'),(select count(*) from public.inbound_ai_review_decisions where confirmed_user_id='${account}'));`,
      ),
  };
}
it("CP14 final outbound wait/wake/router/START/CLOSED synthetic/install/attention chain", async () => {
  const f = await fixture();
  f.t.policy_snapshot.network_required = true;
  f.t.policy_sha256 = await digest(f.t.policy_snapshot);
  const a2 = await a2Fixture(f);
  const server = process.env.CP14_SERVER83 === "1" ? await cp14ActualServer(f, a2) : null;
  const inboundBefore = server?.inbound();
  let online = false;
  const router = createOutboundContinuationRouter({
    environment: "TEST",
    hash,
    complexity: () => 0,
    snapshots: async () => (online ? [a2.snapshot()] : []),
    predecessor: async () => null,
    async seed(r) {
      return {
        ...(await f.a(r.task, r.task.sync_operation_id!)),
        request_material_reference: randomUUID(),
        usage_correlation_id: randomUUID(),
      };
    },
    async retainAdmission(e) {
      f.sql
        .prepare("INSERT INTO a2_test_journal(reference,envelope) VALUES(?,?)")
        .run(e.attempt.request_material_reference!, JSON.stringify(e));
    },
  });
  const runtime = createIntelligenceContinuationRuntime(f.repo, {
    ...f.deps,
    router,
    online: () => online,
    routePolicy: () => ({
      modalities: ["TEXT"],
      latencyBudgetMs: null,
      risk: "NORMAL",
      shadowEligible: false,
    }),
  });
  const scheduler = createIntelligenceContinuationScheduling({
    db: f.db,
    repo: f.repo,
    runtime,
    ...f.deps,
  });
  await scheduler.resume("COLD_START");
  await scheduler.run();
  const waiting = await f.repo.read(f.context, f.t.task_id);
  expect(waiting.work_disposition).toBe("WAITING");
  expect(await f.repo.attempts(f.context, f.t.task_id)).toHaveLength(0);
  const wake = f.sql
    .prepare("SELECT id,status,attempt_count FROM sync_operations")
    .get()!;
  expect(wake.status).toBe("COMPLETED");
  online = true;
  await scheduler.resume("RECONNECT");
  await scheduler.run();
  const t = await f.repo.read(f.context, f.t.task_id);
  expect(f.sql.prepare("SELECT id FROM sync_operations").get()!.id).toBe(wake.id);
  expect(t.current_attempt_id).toBeTruthy();
  expect(a2.executions()).toBe(0);
  const a = await runtime.execute(
    f.context,
    t.current_attempt_id!,
    a2.harness.executor(f.context),
  );
  expect(a.execution_outcome).toBe("SUCCEEDED");
  const publication = randomUUID();
  let installs = 0;
  await a2.harness.install(f.context, a.attempt_id, publication, h, async () => {
    installs++;
  });
  await a2.harness.install(f.context, a.attempt_id, publication, h, async () => {
    installs++;
  });
  expect(installs).toBe(1);
  expect(a2.executions()).toBe(1);
  expect(
    await runtime.fact(f.context, t.task_id, {
      now,
      urgencyHorizonMs: 0,
      evidencedDeadline: null,
    }),
  ).toMatchObject({ publication_id: publication, result_sha256: h });
  if (server) {
    expect(server.calls()).toHaveLength(1);
    expect(server.calls()[0]).toMatchObject({
      dispatch_state: "RESERVED",
      execution_certainty: "NOT_STARTED",
      account_id: account,
      task_id: t.task_id,
      attempt_id: a.attempt_id,
    });
    expect(server.usage()).toHaveLength(1);
    expect(server.usage()[0]).toMatchObject({
      observation_kind: "START",
      input_tokens: null,
      cost_nanos: null,
    });
    expect(server.inbound()).toBe(inboundBefore);
  }
}, 60000);

it.each([
  "valid",
  "account-switch",
  "account-aba",
  "account-final",
  "trip-before",
  "trip-custody",
  "trip-admission",
  "material-revoke",
  "identity-change",
])("CP15B F1 SQLite50 cold recovery current disclosure authority: %s", async (mode) => {
  const { remoteFixture } =
    await import("../../../backend/src/__fixtures__/flightRemote");
  const {
    minimizeFlightRemoteText,
    rebindFlightRemoteOutput,
    flightRemoteRequestDigest,
  } = await import("@/domain/intelligence/remoteFlightText");
  const { writeFileSync, readFileSync } = await import("node:fs");
  const remote = await remoteFixture();
  const folder = mkdtempSync(join(tmpdir(), "cp15-remote-cold-"));
  folders.push(folder);
  const path = join(folder, "journal.db"),
    f = await fixture(true, path);
  const policy = {
    ...f.t.policy_snapshot,
    privacy: "REMOTE_ALLOWED" as const,
    network_required: true,
    region: "DEV",
    budget_currency: "USD",
    budget_nanos: "1000000",
    route: "DeepSeek",
  };
  const trip = remote.request.binding.trip_id,
    source = randomUUID(),
    representation = randomUUID();
  const text = "Original retained Flight=NZ289",
    materialSha = await hash(new TextEncoder().encode(text));
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
    .run(account, representation, source, materialSha, text.length, text, now);
  f.sql.exec("COMMIT");
  const input_pins = [
    {
      kind: "SOURCE" as const,
      source_id: source,
      material_revision: 1,
      representation_id: representation,
      payload_sha256: materialSha,
      byte_count: text.length,
      input_id: null,
      transform_sha256: null,
    },
  ];
  f.context = await captureAccountRequestContext(trip, async () => account);
  const task = {
    ...f.t,
    trip_id: trip,
    input_pins,
    input_sha256: await digest(input_pins),
    policy_snapshot: policy,
    policy_sha256: await digest(policy),
  };
  await f.repo.create(f.context, task);
  const original = await f.a(task);
  const descriptor = remote.descriptor;
  descriptor.remote.attempt_id = original.attempt_id;
  descriptor.remote.call_id = randomUUID();
  descriptor.remote.request_sha256 = original.request_sha256;
  remote.request.binding.account_id = account;
  remote.request.binding.request_id = original.request_id;
  descriptor.remote.request_sha256 = await flightRemoteRequestDigest(
    remote.request,
    hash,
  );
  original.request_sha256 = descriptor.remote.request_sha256;
  const envelope = await minimizeFlightRemoteText(remote.request, hash);
  const requestRef = randomUUID(),
    responseRef = randomUUID();
  const response = await rebindFlightRemoteOutput(
    remote.output,
    envelope,
    remote.request,
    hash,
  );
  const bundle = {
    descriptor,
    envelope,
    response,
    run_id: remote.request.binding.run_id,
    attempt_id: original.attempt_id,
    call_id: descriptor.remote.call_id,
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      total_tokens: 120,
      quality: "ACTUAL_REPORTED",
    },
  };

  const a = attemptSchema.parse({
    ...original,
    integration_id: "cp15-flight",
    provider_id: "DeepSeek",
    model_id: "deepseek-flash",
    model_version: "DeepSeek-V4.1-Flash",
    adapter_version: descriptor.adapter_version,
    provider_config_id: descriptor.remote.provider_config_id,
    config_version: "1",
    configuration_sha256: descriptor.configuration_sha256,
    request_material_reference: requestRef,
    request_material_sha256: await digest(envelope),
    usage_correlation_id: descriptor.remote.call_id,
    metering_disposition: "START_PENDING",
    descriptor_snapshot: {
      version: 2,
      provider_class: "COMMERCIAL_REMOTE",
      replay_support: "UNSUPPORTED",
      capabilities: ["EXTRACT"],
      modalities: ["TEXT"],
      network_required: true,
      remote_run: descriptor,
    },
  });
  const report = executionReportSchema.parse({
    account_id: a.account_id,
    task_id: a.task_id,
    attempt_id: a.attempt_id,
    request_id: a.request_id,
    request_sha256: a.request_sha256,
    usage_correlation_id: a.usage_correlation_id,
    execution_observation: "TERMINAL",
    execution_outcome: "SUCCEEDED",
    response_material_reference: responseRef,
    response_material_sha256: h,
    response_sha256: await digest(response),
    metering_disposition: "COMPLETION_PENDING",
    reported_usage_summary: null,
    recovery_sha256: null,
  });
  const stored = {
    version: 1,
    attempt_id: a.attempt_id,
    descriptor: a.descriptor_snapshot,
    interpretation: response,
    result: { usage: bundle.usage },
    report,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(stored)),
    responseSha = await hash(bytes);
  writeFileSync(join(folder, responseRef), bytes);
  await f.repo.reserveAttempt(f.context, a);
  await f.repo.observeAttempt(f.context, a.attempt_id, 1, {
    ...f.observation("RUNNING"),
    metering_disposition: "START_DURABLE",
  });
  await f.repo.observeAttempt(f.context, a.attempt_id, 2, {
    ...f.observation("TERMINAL", "SUCCEEDED", await digest(response)),
    metering_disposition: "COMPLETION_PENDING",
    response_material_reference: responseRef,
    response_material_sha256: responseSha,
  });
  f.sql.close();
  const reopened = await fixture(true, path, false);
  reopened.context = await captureAccountRequestContext(trip, async () => account);
  const recovered = await reopened.repo.readAttempt(reopened.context, a.attempt_id);
  expect(recovered.descriptor_snapshot).toEqual(a.descriptor_snapshot);
  expect(recovered.usage_correlation_id).toBe(bundle.call_id);
  expect(recovered.request_material_reference).toBe(requestRef);
  const retained = readFileSync(join(folder, recovered.response_material_reference!));
  expect(await hash(retained)).toBe(recovered.response_material_sha256);
  expect(JSON.parse(retained.toString())).toEqual(stored);
  const { createFlightDevExecutor } =
    await import("../../../backend/src/flightDevDispatch");
  const { advanceAccountGeneration } = await import("../auth/accountGeneration");
  const transport = vi.fn(),
    admission = reopened.deps.validateAdmission;
  let attack = true,
    checks = 0;
  if (mode === "trip-before") reopened.setAdmission(false);
  if (mode === "material-revoke")
    reopened.sql
      .prepare(
        "update trip_sources set lifecycle='DELETED',deleted_at='2026-10-07T00:00:00.000000Z',deleted_by=acquired_by where id=?",
      )
      .run(source);
  reopened.deps.validateAdmission = async (t) => {
    checks++;
    if (attack && mode === "trip-admission" && checks === 1) reopened.setAdmission(false);
    return admission(t);
  };
  const factory = createFlightDevExecutor({
    repo: {
      ...reopened.repo,
      async authorizeResultDisclosure(
        context: typeof reopened.context,
        attempt: Attempt,
      ) {
        await reopened.repo.authorizeResultDisclosure(context, attempt);
        if (attack && mode === "account-final") {
          advanceAccountGeneration();
          advanceAccountGeneration();
        }
      },
    },
    hash,
    transport: { kind: "NETWORK_DISABLED_FIXTURE", send: transport },
    retained: {
      read: async () => ({
        reference: responseRef,
        sha256: responseSha,
        byteCount: bytes.length,
      }),
    },
    custody: {
      read: async () => {
        if (attack && mode === "account-switch") {
          reopened.setAccount(randomUUID());
          advanceAccountGeneration();
        }
        if (attack && mode === "account-aba") {
          advanceAccountGeneration();
          advanceAccountGeneration();
        }
        if (attack && mode === "trip-custody") reopened.setAdmission(false);
        if (attack && mode === "identity-change")
          await reopened.repo.observeAttempt(
            reopened.context,
            a.attempt_id,
            recovered.row_revision,
            {
              ...reopened.observation("TERMINAL", "SUCCEEDED", await digest(response)),
              metering_disposition: "COMPLETE",
              response_material_reference: responseRef,
              response_material_sha256: responseSha,
            },
          );
        return readFileSync(join(folder, responseRef));
      },
    },
  } as unknown as Parameters<typeof createFlightDevExecutor>[0]);
  if (mode === "valid")
    expect(
      (await factory.recover(reopened.context, a.attempt_id)).interpretation,
    ).toEqual(response);
  else await expect(factory.recover(reopened.context, a.attempt_id)).rejects.toThrow();
  expect(readFileSync(join(folder, responseRef))).toEqual(retained);
  expect(transport).not.toHaveBeenCalled();
  reopened.setAccount(account);
  if (mode === "account-switch") advanceAccountGeneration();
  const fresh = await captureAccountRequestContext(trip, reopened.deps.getAccountId);
  if (
    mode === "trip-before" ||
    mode === "trip-custody" ||
    mode === "trip-admission" ||
    mode === "material-revoke"
  )
    await expect(
      reopened.repo.installResult(
        fresh,
        a.attempt_id,
        recovered.row_revision,
        bundle.run_id,
        await digest(response),
        async () => {},
      ),
    ).rejects.toThrow();
  attack = false;
  reopened.setAdmission(true);
  if (mode === "material-revoke") {
    // A deleted Source is not resurrected just to disclose historical evidence.
    await expect(factory.recover(fresh, a.attempt_id)).rejects.toThrow();
    const responsibility = await reopened.repo.readAttempt(fresh, a.attempt_id);
    expect(responsibility.response_material_reference).toBe(responseRef);
    expect(responsibility.response_material_sha256).toBe(responseSha);
    expect(responsibility.execution_observation).toBe("TERMINAL");
    expect(reopened.sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(migrations.at(-1)?.id).toBe(51);
    return;
  }
  expect((await factory.recover(fresh, a.attempt_id)).interpretation).toEqual(response);
  const currentAttempt = await reopened.repo.readAttempt(fresh, a.attempt_id);
  expect(currentAttempt.response_material_reference).toBe(responseRef);
  expect(currentAttempt.response_material_sha256).toBe(responseSha);
  expect(currentAttempt.execution_observation).toBe("TERMINAL");

  expect(await reopened.repo.recoveryDisposition(fresh, task.task_id)).toBe(
    "INSTALL_ONLY",
  );
  await reopened.repo.installResult(
    fresh,
    a.attempt_id,
    currentAttempt.row_revision,
    bundle.run_id,
    await digest(response),
    async () => {},
  );
  const installed = await reopened.repo.read(fresh, task.task_id);
  expect(installed.publication_id).toBe(bundle.run_id);
  expect(installed.result_sha256).toBe(await digest(response));
  expect(reopened.sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  expect(migrations.at(-1)?.id).toBe(51);
});
