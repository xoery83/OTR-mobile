import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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
} from "@/domain/intelligence/persistence";
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
      return (sql.prepare(q).get(...(p as never[])) ?? null) as T | null;
    },
    async getAllAsync<T>(q: string, ...p: unknown[]) {
      return sql.prepare(q).all(...(p as never[])) as T[];
    },
    async runAsync(q: string, ...p: unknown[]) {
      return sql.prepare(q).run(...(p as never[])) as never;
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
        "INSERT INTO sync_operations(id,owner_user_id,entity_type,entity_id,operation_type,idempotency_key,payload_json,status,created_at,updated_at) VALUES(?,?,'INTELLIGENCE_CONTINUATION',?,'CP14_CLOSED',?,'{}','PROCESSING',?,?)",
      )
      .run(q, account, task.task_id, randomUUID(), now, now);
    return q;
  }
  async function a(task = t): Promise<Attempt> {
    const op = await enqueue(task);
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
