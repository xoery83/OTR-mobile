import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { migrations } from "@/data/db/migrations";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import {
  beginAccountTransition,
  endAccountTransition,
} from "@/data/auth/accountRequestContext";
import {
  readLocalOperations,
  readDefaultLocalOperations,
  operationsAgeSeconds,
  classifyOperationsFailure,
} from "./localOperations";

const mode = vi.hoisted(() => ({ value: "dev" }));
vi.mock("@/data/sync/transportSelection", () => ({
  getSyncTransportMode: () => mode.value,
}));
const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
  vi.unstubAllGlobals();
  mode.value = "dev";
});
const observedAt = "2026-10-08T00:01:00.000Z";
const updatedAt = "2026-10-08T00:00:00.000Z";
function fixture(full = false) {
  const sql = new DatabaseSync(":memory:");
  opened.push(sql);
  if (full) for (const migration of migrations) sql.exec(migration.sql);
  else
    sql.exec(`
    CREATE TABLE ledger_actor_context(user_id TEXT,journey_id TEXT);
    CREATE TABLE intelligence_continuations(account_id TEXT,trip_id TEXT,task_id TEXT,stage TEXT,row_revision INTEGER,work_disposition TEXT,current_pass_complete INTEGER,wait_reason TEXT,updated_at TEXT,update_clock TEXT,current_attempt_id TEXT);
    CREATE TABLE intelligence_continuation_attempts(account_id TEXT,task_id TEXT,attempt_id TEXT,shadow INTEGER,execution_observation TEXT,execution_outcome TEXT,result_install_disposition TEXT,metering_disposition TEXT,safe_failure_code TEXT,reported_usage_summary TEXT);
    CREATE TABLE sync_operations(owner_user_id TEXT,id TEXT,entity_type TEXT,operation_type TEXT,status TEXT,failure_category TEXT,updated_at TEXT);
    CREATE TABLE data_health_state(account_id TEXT,run_state TEXT,last_aggregate_outcome TEXT,last_finding_count INTEGER,last_attention_count INTEGER,last_manual_scan_at TEXT,updated_at TEXT);
  `);
  let account: string = randomUUID();
  const initialAccount = account;
  const queries: { query: string; params: unknown[] }[] = [];
  const db = {
    async getAllAsync<T>(query: string, ...params: unknown[]): Promise<T[]> {
      queries.push({ query, params });
      return sql.prepare(query).all(...(params as never[])) as T[];
    },
    async getFirstAsync<T>(query: string, ...params: unknown[]): Promise<T | null> {
      queries.push({ query, params });
      return (sql.prepare(query).get(...(params as never[])) ?? null) as T | null;
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
    runAsync: vi.fn(() => {
      throw new Error("WRITE_FORBIDDEN");
    }),
  };
  const task = (
    state = "WAITING",
    extra: { trip?: string; current?: string; clock?: string; pass?: number } = {},
  ) => {
    const id = randomUUID();
    sql
      .prepare("INSERT INTO intelligence_continuations VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .run(
        account,
        extra.trip ?? null,
        id,
        "INTERPRETATION",
        1,
        state,
        extra.pass ?? 0,
        state === "WAITING" ? "WAITING_FOR_REMOTE_INTELLIGENCE" : null,
        updatedAt,
        extra.clock ?? "DEVICE_WALL",
        extra.current ?? null,
      );
    return id;
  };
  const attempt = (
    taskId: string,
    execution = "TERMINAL",
    meter = "COMPLETE",
    install = "INSTALLED",
    extra: { shadow?: number; failure?: string; usage?: Record<string, unknown> } = {},
  ) => {
    const id = randomUUID();
    sql
      .prepare(
        "INSERT INTO intelligence_continuation_attempts VALUES(?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        account,
        taskId,
        id,
        extra.shadow ?? 0,
        execution,
        execution === "TERMINAL" ? "SUCCEEDED" : null,
        install,
        meter,
        extra.failure ?? null,
        extra.usage ? JSON.stringify(extra.usage) : null,
      );
    return id;
  };
  const current = (taskId: string, attemptId: string) =>
    sql
      .prepare(
        "UPDATE intelligence_continuations SET current_attempt_id=? WHERE task_id=?",
      )
      .run(attemptId, taskId);
  const operation = (status = "COMPLETED", failure: string | null = null) => {
    const id = randomUUID();
    sql
      .prepare("INSERT INTO sync_operations VALUES(?,?,?,?,?,?,?)")
      .run(
        account,
        id,
        "INTELLIGENCE_CONTINUATION",
        "INTELLIGENCE_CONTINUATION_WAKE",
        status,
        failure,
        updatedAt,
      );
    return id;
  };
  const read = () =>
    readLocalOperations(
      db,
      async () => account,
      () => observedAt,
    );
  return {
    sql,
    db,
    task,
    attempt,
    current,
    operation,
    read,
    queries,
    initialAccount,
    setAccount: (id: string) => {
      account = id;
    },
  };
}
const usage = (quality = "ACTUAL_REPORTED") => ({
  version: 1,
  input_tokens: 10,
  output_tokens: 2,
  total_tokens: 12,
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
  usage_quality: quality,
});

it("reads actual SQLite1–50 with query-only enabled and no initialization/writes", async () => {
  const f = fixture(true);
  f.sql.exec("PRAGMA query_only=ON");
  const before = f.sql.prepare("SELECT total_changes() AS n").get();
  const s = await f.read();
  expect(s.coverage).toEqual({
    intake: "UNAVAILABLE",
    semanticReview: "UNAVAILABLE",
    server: "UNAVAILABLE",
    continuation: "AVAILABLE",
    sync: "AVAILABLE",
    dataHealth: "AVAILABLE",
  });
  expect(s.rows).toEqual([]);
  expect(s.dataHealth).toBeNull();
  expect(f.sql.prepare("SELECT total_changes() AS n").get()).toEqual(before);
  expect(f.db.runAsync).not.toHaveBeenCalled();
});
it("keeps older UNKNOWN despite published task/pass and completed queue; shadow never changes truth", async () => {
  const f = fixture();
  const t = f.task("PUBLISHED", { pass: 1 });
  f.attempt(t, "UNKNOWN", "START_DURABLE", "NONE");
  f.current(t, f.attempt(t));
  f.operation();
  const second = f.task("PUBLISHED");
  f.attempt(second, "UNKNOWN", "UNKNOWN", "SHADOW_ONLY", { shadow: 1 });
  f.sql.exec("PRAGMA query_only=ON");
  const s = await f.read();
  expect(s.rows.find((r) => r.correlationId === t)).toMatchObject({
    health: "UNKNOWN_OUTCOME",
    passComplete: true,
    userActionRequired: null,
    operatorAttentionRequired: true,
    automaticRecovery: "NONE",
  });
  expect(s.rows.find((r) => r.correlationId === second)?.health).toBe("SETTLED");
  expect(s.rows.find((r) => r.source === "SYNC")?.health).toBe("SETTLED");
});
it("distinguishes all six health states, metering/install pending, and semantic versus operator attention", async () => {
  const f = fixture();
  f.task();
  const active = f.task("RUNNING");
  f.attempt(active, "RUNNING", "START_DURABLE", "NONE");
  const recover = f.task("RESULT_PENDING");
  f.current(recover, f.attempt(recover, "TERMINAL", "COMPLETION_PENDING", "PENDING"));
  f.task("FAILED");
  f.task("PUBLISHED");
  f.task("UNKNOWN");
  f.operation("CONFLICT", "CONFLICT");
  f.operation("RETRYABLE", "UNKNOWN");
  const s = await f.read();
  expect(
    new Set(s.rows.filter((r) => r.source === "CONTINUATION").map((r) => r.health)),
  ).toEqual(
    new Set([
      "WAITING",
      "ACTIVE",
      "RECOVERABLE_FAILURE",
      "TERMINAL_FAILURE",
      "SETTLED",
      "UNKNOWN_OUTCOME",
    ]),
  );
  expect(s.rows.find((r) => r.correlationId === recover)).toMatchObject({
    execution: "TERMINAL",
    installation: "PENDING",
    metering: "COMPLETION_PENDING",
    automaticRecovery: "DEFERRED",
  });
  expect(s.rows.find((r) => r.source === "SYNC" && r.userActionRequired)).toMatchObject({
    operatorAttentionRequired: false,
  });
  expect(
    s.rows.find((r) => r.source === "SYNC" && r.health === "RECOVERABLE_FAILURE")?.health,
  ).not.toBe("UNKNOWN_OUTCOME");
});
it("retains nullable/estimated/reported usage, never invents local cost, and redacts arbitrary failure labels", async () => {
  const f = fixture();
  const t = f.task("RESULT_PENDING");
  f.current(
    t,
    f.attempt(t, "TERMINAL", "COMPLETION_PENDING", "PENDING", {
      failure: "PRIVATE_DOCUMENT_TEXT",
      usage: usage(),
    }),
  );
  const other = f.task("RUNNING");
  f.current(
    other,
    f.attempt(other, "UNKNOWN", "UNKNOWN", "NONE", {
      usage: {
        ...usage("UNKNOWN"),
        input_tokens: null,
        output_tokens: null,
        total_tokens: null,
      },
    }),
  );
  const estimated = f.task("PUBLISHED");
  f.current(
    estimated,
    f.attempt(estimated, "TERMINAL", "COMPLETE", "INSTALLED", {
      usage: usage("ESTIMATED"),
    }),
  );
  const s = await f.read();
  const row = s.rows.find((r) => r.correlationId === t)!;
  expect(row.usage).toEqual({
    inputTokens: 10,
    outputTokens: 2,
    totalTokens: 12,
    quality: "ACTUAL_REPORTED",
  });
  expect(row.cost).toEqual({ nanos: null, currency: null, quality: "UNKNOWN" });
  expect(s.rows.find((r) => r.correlationId === other)?.usage.inputTokens).toBeNull();
  expect(s.rows.find((r) => r.correlationId === estimated)?.usage.quality).toBe(
    "ESTIMATED",
  );
  expect(JSON.stringify(s)).not.toContain("PRIVATE_DOCUMENT_TEXT");
  for (const code of ["__proto__", "constructor", "toString", "private text"])
    expect(classifyOperationsFailure(code)).toBe("OTHER_OR_UNKNOWN");
  expect(classifyOperationsFailure("RATE_LIMITED")).toBe("RATE_LIMITED");
});
it("fences account switch and A→B→A during a source await, then admits fresh A", async () => {
  const f = fixture();
  const id = f.task();
  const original = f.db.getAllAsync;
  let changed = false;
  f.db.getAllAsync = async (q, ...p) => {
    if (!changed) {
      changed = true;
      f.setAccount(randomUUID());
      advanceAccountGeneration();
      f.setAccount(f.initialAccount);
      advanceAccountGeneration();
    }
    return original(q, ...p);
  };
  await expect(f.read()).rejects.toThrow("Account changed");
  expect((await f.read()).rows.map((r) => r.correlationId)).toContain(id);
  f.setAccount(randomUUID());
  advanceAccountGeneration();
  const b = await f.read();
  expect(b.rows).toEqual([]);
  expect(b.dataHealth).toBeNull();
});
it("fails closed for a pending transition without holding it across source reads", async () => {
  const f = fixture();
  let release!: () => void;
  let entered!: () => void;
  const ready = new Promise<void>((r) => {
    entered = r;
  });
  const wait = new Promise<void>((r) => {
    release = r;
  });
  const original = f.db.getAllAsync;
  let first = true;
  f.db.getAllAsync = async (q, ...p) => {
    if (first) {
      first = false;
      entered();
      await wait;
    }
    return original(q, ...p);
  };
  const reading = f.read();
  await ready;
  const transition = beginAccountTransition();
  release();
  await expect(reading).rejects.toThrow("Account changed");
  endAccountTransition(await transition);
});
it("denies revoked Trip metadata without exposing IDs and does not invent missing health/provider coverage", async () => {
  const f = fixture();
  const deniedId = f.task("UNKNOWN", { trip: randomUUID() });
  f.operation("RETRYABLE", "NETWORK");
  const s = await f.read();
  expect(s.coverage.continuation).toBe("DENIED");
  expect(s.coverage.sync).toBe("AVAILABLE");
  expect(JSON.stringify(s)).not.toContain(deniedId);
  expect(s.coverage.server).toBe("UNAVAILABLE");
});
it("marks corruption/source errors unavailable rather than healthy and keeps other sources", async () => {
  const f = fixture();
  f.task("PRIVATE_BOGUS");
  f.operation();
  f.sql.exec(
    "INSERT INTO data_health_state VALUES('" +
      f.initialAccount +
      "','IDLE','BAD',0,0,NULL,'" +
      updatedAt +
      "')",
  );
  const s = await f.read();
  expect(s.coverage.continuation).toBe("UNAVAILABLE");
  expect(s.coverage.dataHealth).toBe("UNAVAILABLE");
  expect(s.rows).toHaveLength(1);
});
it("limits detail with truthful coverage, but sees unresolved attempts outside the current attempt", async () => {
  const f = fixture();
  for (let i = 0; i < 51; i++) {
    f.task();
    f.operation();
  }
  const s = await f.read();
  expect(s.coverage.continuation).toBe("LIMITED");
  expect(s.coverage.sync).toBe("LIMITED");
  expect(s.rows).toHaveLength(100);
  for (const { query, params } of f.queries) {
    expect(query.trim().toUpperCase().startsWith("SELECT")).toBe(true);
    expect(params[0]).toBe(f.initialAccount);
    expect(query).not.toMatch(
      /SELECT \*|payload_json|input_pins|raw|bytes|filename|model/,
    );
  }
});
it("reports clock-aware measured ages without thresholds, future-clamping, or ETA", () => {
  expect(operationsAgeSeconds(updatedAt, observedAt, "DEVICE_WALL")).toBe(60);
  for (const clock of ["SERVER_OBSERVED", "CALLER_OBSERVED"] as const)
    expect(operationsAgeSeconds(updatedAt, observedAt, clock)).toBeNull();
  expect(operationsAgeSeconds("bad", observedAt, "DEVICE_WALL")).toBeNull();
  expect(operationsAgeSeconds(observedAt, updatedAt, "DEVICE_WALL")).toBeNull();
  expect(operationsAgeSeconds(null, observedAt, "DEVICE_WALL")).toBeNull();
});
it("default composition rejects non-DEV and non-dev transport before database/auth readers", async () => {
  vi.stubGlobal("__DEV__", false);
  await expect(readDefaultLocalOperations()).rejects.toThrow("OPERATIONS_DEV_ONLY");
  vi.stubGlobal("__DEV__", true);
  mode.value = "production";
  await expect(readDefaultLocalOperations()).rejects.toThrow("OPERATIONS_DEV_ONLY");
});

it("completed sync does not resurrect stale failure/semantic attention", async () => {
  const f = fixture();
  f.operation("COMPLETED", "VALIDATION");
  const row = (await f.read()).rows[0];
  expect(row).toMatchObject({
    health: "SETTLED",
    clock: null,
    ageSeconds: null,
    failure: null,
    userActionRequired: null,
    operatorAttentionRequired: false,
  });
});

it.each([
  "execution_observation",
  "execution_outcome",
  "result_install_disposition",
  "metering_disposition",
])(
  "F3 rejects corrupt older non-shadow %s without losing other readable sources",
  async (column) => {
    const f = fixture();
    const t = f.task("PUBLISHED", { pass: 1 });
    const older = f.attempt(t);
    f.current(t, f.attempt(t));
    f.operation();
    f.sql
      .prepare(
        `UPDATE intelligence_continuation_attempts SET ${column}='UNRECOGNIZED' WHERE attempt_id=?`,
      )
      .run(older);
    f.sql.exec("PRAGMA query_only=ON");
    const s = await f.read();
    expect(s.coverage.continuation).toBe("UNAVAILABLE");
    expect(s.rows.filter((r) => r.source === "CONTINUATION")).toEqual([]);
    expect(s.coverage.sync).toBe("AVAILABLE");
    expect(s.rows).toHaveLength(1);
    expect(JSON.stringify(s)).not.toContain(older);
  },
);

it("F3 excludes corrupt shadow responsibility labels", async () => {
  const f = fixture();
  const t = f.task("PUBLISHED");
  f.attempt(t, "UNRECOGNIZED", "INVALID", "INVALID", { shadow: 1 });
  f.current(t, f.attempt(t));
  expect((await f.read()).rows[0].health).toBe("SETTLED");
});

it("F4 terminal current failure outranks retained RUNNING without authorizing retry; older UNKNOWN still dominates", async () => {
  const f = fixture();
  const t = f.task("RUNNING");
  const a = f.attempt(t, "TERMINAL", "COMPLETE", "NONE");
  f.current(t, a);
  f.sql
    .prepare(
      "UPDATE intelligence_continuation_attempts SET execution_outcome='FAILED' WHERE attempt_id=?",
    )
    .run(a);
  expect((await f.read()).rows[0]).toMatchObject({
    health: "TERMINAL_FAILURE",
    execution: "TERMINAL",
    operatorAttentionRequired: true,
    automaticRecovery: "DEFERRED",
  });
  f.attempt(t, "UNKNOWN", "UNKNOWN", "NONE");
  expect((await f.read()).rows[0]).toMatchObject({
    health: "UNKNOWN_OUTCOME",
    operatorAttentionRequired: true,
    automaticRecovery: "NONE",
  });
});
