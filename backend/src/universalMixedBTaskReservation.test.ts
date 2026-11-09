import {
  intelligenceWakeIdentity,
  signalIntelligenceWake,
} from "../../src/data/sync/syncOperationRepository";
import { createHash, randomUUID } from "node:crypto";
import { lstatSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Client } from "pg";
import { expect, it, vi } from "vitest";
import { captureAccountRequestContext } from "../../src/data/auth/accountRequestContext";
import { createIntelligenceContinuationRepository } from "../../src/data/repositories/intelligenceContinuationRepository";
import {
  taskMutableColumns,
  taskSchema,
} from "../../src/domain/intelligence/persistence";
import { canonicalEventJson, type Json } from "../../src/domain/trip/eventIntentJson";
import {
  bootstrapUniversalTask,
  initializeUniversalTaskDatabase,
  universalTaskDatabase,
} from "./universalTaskBootstrap";
import { createUniversalContinuousHost } from "./universalContinuousHost";
import { universalContinuousConfigSchema } from "./universalContinuousConfig";
import * as universalRuntime from "./universalRuntime";
import * as universalCatalog from "./universalCatalog";
import { createUniversalDeepSeekProvider } from "./universalDeepSeekProvider";
import { universalAdvisoryInstruction, universalInstruction } from "./universalPrompt";
import { COMPACT_PROMPT_VERSION } from "../frozen-workbench/scripts/import-workbench/real-llm-compact";
import {
  createUniversalBatchSource,
  universalProviderBatchContext,
  universalBatchIdentity,
  universalRunBindingSchema,
} from "./universalBatchSource";
import { buildUniversalRegisteredTaskDraft } from "./universalRegisteredTaskDraft";
import { universalBatchPrepareSchema } from "../../src/data/api/universalImportContracts";
import { tripImportCatalogSchemas } from "../../src/data/api/tripImportCatalogContracts";
import { createUniversalOriginalSourceConnection, universalOriginalSourceBoundary } from "./universalOriginalSource";
import { createSourcePgConnection } from "./tripCoreV2PgConnection";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
import { prepareUniversalDispatch, universalBoundary, UNIVERSAL_IMPORT_VERSION } from "./universalImport";
import {
  prepareUniversalQueuedRuntime,
  universalPrepareBoundary,
} from "./universalPrepareHttp";
import { PDF_V2_OPTIONS_SHA } from "./sourcePdfV2Contracts";
import {
  assertMixedBClaimCurrent,
  assertMixedBTaskReserved,
  createReservedMixedBTask,
  mixedBInitialDigest,
  mixedBInitialManifestSchema,
  mixedBTaskReservationState,
  reserveMixedBTask,
  recoverMixedBTaskWake,
  readProtectedMixedBReservation,
  readExactTaskWake,
  readMixedBRunBeginState,
  spendMixedBRunBegin,
} from "./universalMixedBTaskReservation";

const input = readFileSync(
  "/Users/xoery/Project/otr-mobile-import/lane-c-imp-c01-txt-shortest-20261105/docs/ops/lane-c-imp-c01-txt-shortest-20261105/C01_B_QA158_OWNING_INPUTS_20261106.json",
);
const sha = (data: Uint8Array | string) =>
  createHash("sha256").update(data).digest("hex");
const pins = JSON.parse(input.toString());
const { accountId: actor, tripId: trip, batchId: batch, createdAt: now } = pins.batch;
const taskId = pins.projectedTaskId;
const digest = (v: Json) => sha(canonicalEventJson(v));
const forbidden = vi.fn(async () => {
  throw Error("UNEXPECTED_IO");
});

async function withTaskStore(
  work: (
    sql: DatabaseSync,
    db: ReturnType<typeof initializeUniversalTaskDatabase>,
    path: string,
  ) => Promise<void>,
) {
  const dir = mkdtempSync(join(tmpdir(), "otr-mixed-b-preacquire-"));
  const path = join(dir, "proof.sqlite");
  const sql = new DatabaseSync(path);
  try {
    await work(sql, initializeUniversalTaskDatabase(sql), path);
  } finally {
    sql.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function taskDeps(account: string) {
  return {
    getAccountId: async () => account,
    now: () => now,
    sha256: async (bytes: Uint8Array) => sha(bytes),
    validateAdmission: async () => {}, // Local synthetic Task fixture only.
    validateAttemptAdmission: forbidden,
    eligibleWait: async () => false,
    verifyRecovery: forbidden,
  };
}
function syntheticTask(account: string) {
  const policy = {
    version: 1,
    privacy: "LOCAL_ONLY",
    network_required: false,
    region: "DEVICE",
    budget_currency: null,
    budget_nanos: null,
    route: "DETERMINISTIC",
    max_attempts: 1,
    deadline: null,
  };
  return taskSchema.parse({
    account_id: account,
    task_id: taskId,
    format_version: 1,
    import_id: randomUUID(),
    manifest_version: 1,
    manifest_sha256: "a".repeat(64),
    trip_id: null,
    stage: "INTERPRETATION",
    logical_request_id: randomUUID(),
    logical_idempotency_key: randomUUID(),
    input_pins: [],
    input_sha256: digest([]),
    consumer_id: "fixture",
    schema_id: "fixture",
    schema_dialect: "otr",
    consumer_version: 1,
    schema_version: 1,
    schema_sha256: "a".repeat(64),
    capability_requirements: [],
    policy_snapshot: policy,
    policy_sha256: digest(policy),
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
}

const ddl = readFileSync(
  new URL("../sql/universal_mixed_b_task_reservation_candidate.sql", import.meta.url),
  "utf8",
);
const initial = mixedBInitialManifestSchema.parse({
  version: "otr.import.mixed-b-initial/1",
  actorId: actor,
  tripId: trip,
  batchId: batch,
  submissionSha256: pins.batch.submissionSha256,
  runId: pins.projectedRunId,
  taskId,
  originals: pins.originals.map((row: any) => {
    const command = row.commands.find(
      (c: { command: string }) => c.command === "ACQUIRE_SOURCE",
    );
    return {
      ordinal: row.ordinal,
      profile: row.profile,
      inputId: row.inputId,
      sourceId: row.sourceId,
      originalRepresentationId: row.originalRepresentationId,
      byteCount: row.bytes,
      sha256: row.sha256,
      operationId: command.operation_id,
      operationKey: command.operation_key,
      operationSha256: command.operation_sha256,
    };
  }),
});
function finalFixture(deadline?: string) {
  // Controlled existing Run grammar and material catalogue. No PG FINAL receipt is minted.
  const inputs = initial.originals.map((o) => ({
    id: o.inputId,
    source_id: o.sourceId,
    material_revision: o.ordinal === 1 ? 2 : 1,
    representation_id: o.ordinal === 1 ? randomUUID() : o.originalRepresentationId,
    payload_sha256: o.ordinal === 1 ? "d".repeat(64) : o.sha256,
    byte_count: o.ordinal === 1 ? 130 : o.byteCount,
    observed_source_row_revision: o.ordinal === 1 ? 2 : 1,
    historical_selection: false as const,
    ...(o.ordinal === 1
      ? {
          pdfSource: {
            original: {
              representationId: o.originalRepresentationId,
              sha256: o.sha256,
              byteCount: o.byteCount,
            },
            sealSha256: "a".repeat(64),
            pageMapSha256: "b".repeat(64),
            transformOptionsSha256: PDF_V2_OPTIONS_SHA,
          },
        }
      : {}),
  }));
  const finalRun = {
    actorId: actor,
    tripId: trip,
    batchId: batch,
    taskId,
    runId: initial.runId,
    submissionSha256: initial.submissionSha256,
    generation: 1,
    createdAt: now,
    inputs,
  };
  const inputPins = inputs.map((p) => ({
    kind: "SOURCE" as const,
    source_id: p.source_id,
    material_revision: p.material_revision,
    representation_id: p.representation_id,
    payload_sha256: p.payload_sha256,
    byte_count: p.byte_count,
    input_id: p.id,
    transform_sha256: p.pdfSource?.transformOptionsSha256 ?? null,
  }));
  const base = syntheticTask(actor);
  const policy = { ...base.policy_snapshot, deadline: deadline ?? null };
  const task = taskSchema.parse({
    ...base,
    policy_snapshot: policy,
    policy_sha256: digest(policy),
    trip_id: trip,
    import_id: batch,
    run_id: initial.runId,
    expected_run_generation: finalRun.generation,
    manifest_sha256: initial.submissionSha256,
    input_pins: inputPins,
    input_sha256: digest(inputPins),
  });
  return { reservation: { initial, finalRun }, task };
}
function materialCatalogue(sql: DatabaseSync, fixture: ReturnType<typeof finalFixture>) {
  const initial = fixture.reservation.initial;
  const { actorId: actor, tripId: trip } = initial;
  sql.exec("BEGIN");
  try {
    sql
      .prepare(
        `INSERT INTO trip_source_runs(cache_account_id,id,row_revision,trip_id,actor_account_id,operation_key,scope_source_ids,scope_sha256,generation,input_sha256,extractor_key,extractor_version,extractor_options_sha256)
      VALUES(?,?,1,?,?,'fixture-run',?,?,1,?,'fixture','1',?)`,
      )
      .run(
        actor,
        initial.runId,
        trip,
        actor,
        JSON.stringify(initial.originals.map((o) => o.sourceId)),
        "a".repeat(64),
        fixture.task.input_sha256,
        "b".repeat(64),
      );
    for (const p of fixture.reservation.finalRun.inputs) {
      const orig = initial.originals.find((o) => o.inputId === p.id)!;
      sql
        .prepare(
          `INSERT INTO trip_sources(cache_account_id,id,trip_id,acquired_by,acquisition_key,acquisition_sha256,source_kind,acquisition_channel,capture_time_basis,current_material_revision,row_revision)
      VALUES(?,?,?,?,?,?,?,?,'UNKNOWN',?,?)`,
        )
        .run(
          actor,
          p.source_id,
          trip,
          actor,
          orig.operationKey,
          orig.sha256,
          orig.ordinal === 0 ? "IMAGE" : orig.ordinal === 1 ? "FILE" : "TEXT",
          orig.ordinal === 2 ? "PASTE" : "FILES",
          p.material_revision,
          p.observed_source_row_revision,
        );
      sql
        .prepare(
          `INSERT INTO trip_source_revisions(cache_account_id,source_id,material_revision,created_by,operation_key,original_representation_ids,completeness,reason)
      VALUES(?,?,?,?,?,?,'AS_SUPPLIED','ACQUISITION')`,
        )
        .run(
          actor,
          p.source_id,
          p.material_revision,
          actor,
          orig.operationKey,
          JSON.stringify([orig.originalRepresentationId]),
        );
      sql
        .prepare(
          `INSERT INTO trip_source_representations(cache_account_id,id,row_revision,source_id,introduced_revision,role,material_kind,payload_sha256,byte_count,transform_options_sha256,regenerability,remote_state,transfer_state)
      VALUES(?,?,1,?,?,?,?,?,?,?,'NOT_APPLICABLE','NOT_APPLICABLE','NOT_REQUIRED')`,
        )
        .run(
          actor,
          p.representation_id,
          p.source_id,
          p.material_revision,
          p.pdfSource ? "DERIVED" : "ORIGINAL",
          orig.ordinal === 0 ? "BINARY" : "TEXT",
          p.payload_sha256,
          p.byte_count,
          p.pdfSource?.transformOptionsSha256 ?? null,
        );
      sql
        .prepare(
          `INSERT INTO trip_source_inputs(cache_account_id,id,run_id,source_id,material_revision,representation_id,payload_sha256,byte_count,observed_source_row_revision)
      VALUES(?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          actor,
          p.id,
          initial.runId,
          p.source_id,
          p.material_revision,
          p.representation_id,
          p.payload_sha256,
          p.byte_count,
          p.observed_source_row_revision,
        );
    }
    sql.exec("COMMIT");
  } catch (e) {
    sql.exec("ROLLBACK");
    throw e;
  }
}
const phase = (sql: DatabaseSync) =>
  sql
    .prepare("SELECT phase FROM universal_mixed_b_task_reservations WHERE task_id=?")
    .get(taskId)?.phase;

// Readback is a local SQLite observation. It grants no authority to resume or send.
async function readCommitPostimage(
  path: string,
  context: Awaited<ReturnType<typeof captureAccountRequestContext>>,
  expected: ReturnType<typeof finalFixture>,
) {
  let sql: DatabaseSync | undefined;
  let outcome = "UNCERTAIN";
  try {
    sql = new DatabaseSync(path, { readOnly: true });
    const db = universalTaskDatabase(sql);
    await db.withTransactionAsync(async () => {
      const taskId = expected.task.task_id;
      const global = await db.getAllAsync<{ account_id: string }>(
        "SELECT account_id FROM intelligence_continuations WHERE task_id=? LIMIT 2",
        taskId,
      );
      if (
        global.length > 1 ||
        (global.length === 1 && global[0].account_id !== expected.task.account_id)
      )
        return;
      const state = await mixedBTaskReservationState(
        db,
        expected.reservation,
        expected.task,
      );
      if (state === "RESERVED" && global.length === 0) {
        outcome = "EXACT_RESERVED_NO_TASK";
        return;
      }
      if (state !== "CONSUMED" || global.length !== 1) return;
      const repo = createIntelligenceContinuationRepository(
        // The owning reader runs within the already-open read-only snapshot.
        { ...db, withTransactionAsync: (work) => work() },
        taskDeps(expected.task.account_id),
      );
      const actual = await repo.read(context, taskId);
      const immutable = (task: typeof expected.task) =>
        digest(
          Object.fromEntries(
            Object.entries(task).filter(
              ([key]) => !(taskMutableColumns as readonly string[]).includes(key),
            ),
          ) as Json,
        );
      if (immutable(actual) === immutable(expected.task))
        outcome = "EXACT_TASK_PRESENT_CONSUMED";
    });
  } catch {
    return "UNCERTAIN";
  } finally {
    sql?.close();
  }
  return outcome;
}

it("readback isolates the exact snapshot and rejects global foreign Task collisions and read failures", async () => {
  await withTaskStore(async (sql, db, path) => {
    sql.exec(ddl);
    const expected = finalFixture();
    const context = await captureAccountRequestContext(trip, async () => actor);
    expect(await readCommitPostimage(path, context, expected)).toBe("UNCERTAIN");
    for (const other of [randomUUID(), randomUUID()]) {
      const foreign = await captureAccountRequestContext("", async () => other);
      await createIntelligenceContinuationRepository(db, taskDeps(other)).create(
        foreign,
        syntheticTask(other),
      );
      expect(await readCommitPostimage(path, context, expected)).toBe("UNCERTAIN");
    }
    expect(await readCommitPostimage(path + ".missing", context, expected)).toBe(
      "UNCERTAIN",
    );
  });
});

it("commits exactly one durable Run Begin marker across independent SQLite handles", async () => {
  await withTaskStore(async (sql, db, path) => {
    sql.exec(ddl);
    reserveMixedBTask(sql, initial);
    const other = new DatabaseSync(path);
    try {
      const second = initializeUniversalTaskDatabase(other);
      const material = "a".repeat(64);
      const claim = (handle: typeof db) => spendMixedBRunBegin(handle, initial, material, () => {});
      const results = await Promise.allSettled([claim(db), claim(second)]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(await readMixedBRunBeginState(db, initial)).toBe(material);
      expect(await readMixedBRunBeginState(second, initial)).toBe(material);
      await expect(claim(second)).rejects.toThrow("MIXED_B_RUN_BEGIN_OUTCOME_UNQUALIFIED");
    } finally {
      other.close();
    }
  });
});

it("reserves once and consumes in the owning repo.create transaction, with exact replay closed before writes", async () => {
  expect(sha(input)).toBe(
    "4bf14c653d552c68331f21430c1197b518b8b07ea90f71c49ca9f08bef946b9b",
  );
  await withTaskStore(async (sql, db, path) => {
    sql.exec(ddl);
    const file = lstatSync(path);
    const other = new DatabaseSync(path);
    try {
      const opened = lstatSync(path);
      expect([opened.dev, opened.ino]).toEqual([file.dev, file.ino]);
      const sameDb = initializeUniversalTaskDatabase(other);
      expect(other.prepare("PRAGMA foreign_keys").get()?.foreign_keys).toBe(1);
      reserveMixedBTask(sql, initial);
      expect(() => reserveMixedBTask(other, initial)).toThrow();
      expect(phase(other)).toBe("RESERVED");
      const fixture = finalFixture();
      materialCatalogue(sql, fixture);
      const context = await captureAccountRequestContext(trip, async () => actor);
      const deps = taskDeps(actor);
      const observed = vi.spyOn(db, "withTransactionAsync");
      const created = await createReservedMixedBTask(
        db,
        deps,
        context,
        fixture.task,
        fixture.reservation,
        () => {},
        () => {},
      );
      expect(created).toEqual(fixture.task);
      expect(observed).toHaveBeenCalledOnce();
      expect(phase(other)).toBe("CONSUMED");
      const baseline = other.prepare("SELECT total_changes() AS n").get();
      await expect(
        createReservedMixedBTask(
          sameDb,
          deps,
          context,
          fixture.task,
          fixture.reservation,
          () => {},
          () => {},
        ),
      ).rejects.toThrow("MIXED_B_TASK_CONSUMED");
      expect(other.prepare("SELECT total_changes() AS n").get()).toEqual(baseline);
      expect(
        await createIntelligenceContinuationRepository(sameDb, deps).read(
          context,
          taskId,
        ),
      ).toEqual(fixture.task);
      expect(phase(other)).toBe("CONSUMED");
    } finally {
      other.close();
    }
  });
});
it("fails closed on unbound/stale material, nested reservation, and FK-off handles", async () => {
  await withTaskStore(async (sql, db, path) => {
    sql.exec(ddl);
    await db.withTransactionAsync(async () => {
      expect(() => reserveMixedBTask(sql, initial)).toThrow("transaction");
      expect(await db.isInTransactionAsync()).toBe(true);
    });
    expect(phase(sql)).toBeUndefined();
    reserveMixedBTask(sql, initial);
    const f = finalFixture();
    const context = await captureAccountRequestContext(trip, async () => actor);
    const wrong = structuredClone(f.reservation);
    wrong.finalRun.inputs[0].payload_sha256 = "e".repeat(64);
    await expect(assertMixedBTaskReserved(db, wrong, f.task)).rejects.toThrow(
      "MIXED_B_TASK_MATERIAL",
    );
    // Even a mutually consistent Run and Task cannot substitute the original PNG.
    const forgedTask = structuredClone(f.task);
    const forgedPin = forgedTask.input_pins[0];
    if (forgedPin.kind !== "SOURCE") throw Error("FIXTURE");
    forgedPin.payload_sha256 = wrong.finalRun.inputs[0].payload_sha256;
    forgedTask.input_sha256 = digest(forgedTask.input_pins);
    await expect(assertMixedBTaskReserved(db, wrong, forgedTask)).rejects.toThrow(
      "MIXED_B_TASK_MATERIAL",
    );
    // Owning repo detects absent local material after activation and rolls it back.
    await expect(
      createReservedMixedBTask(
        db,
        taskDeps(actor),
        context,
        f.task,
        f.reservation,
        () => {},
        () => {},
      ),
    ).rejects.toThrow("INTELLIGENCE_STALE_SOURCE");
    expect(phase(sql)).toBe("RESERVED");
    expect(
      sql.prepare("SELECT count(*) AS n FROM intelligence_continuations").get(),
    ).toEqual({ n: 0 });
    const other = new DatabaseSync(path);
    try {
      other.exec("PRAGMA foreign_keys=OFF");
      expect(() => universalTaskDatabase(other)).toThrow(
        "UNIVERSAL_TASK_FOREIGN_KEYS_REQUIRED",
      );
      expect(() => reserveMixedBTask(other, initial)).toThrow(
        "UNIVERSAL_TASK_FOREIGN_KEYS_REQUIRED",
      );
      other.exec("PRAGMA foreign_keys=ON");
      expect(universalTaskDatabase(other)).toBeTruthy();
      expect(phase(other)).toBe("RESERVED");
    } finally {
      other.close();
    }
  });
});

function exactBResumeFixture(
  db: ReturnType<typeof universalTaskDatabase>,
  context: Awaited<ReturnType<typeof captureAccountRequestContext>>,
  finalRun: ReturnType<typeof finalFixture>["reservation"]["finalRun"],
  expiresAt: string,
  assertActive: () => void,
) {
  const host = createUniversalContinuousHost({
    enabled: true,
    context,
    finiteDeadline: expiresAt,
    mixedBInitial: initial,
    mixedBPristineSource: {
      async proveInitialMixedBTaskAbsent() {
        throw Error("TEST_MATERIAL_ALREADY_PRESENT");
      },
    },
    db,
    assertCurrentAuth: async () => {},
    assertNewExecutionAllowed: assertActive,
    catalogConnection: { withLease: forbidden },
    bootstrapLedger: forbidden,
    selectProvider: forbidden,
    runtime: {
      stores: {} as never,
      sourceConnection: { withLease: forbidden },
      taskReceiptConnection: { withLease: forbidden },
      gateway: {} as never,
      readBinary: forbidden,
      environment: () => undefined,
    },
    readAdmittedPrice: forbidden,
    publishedSource: {
      async lookup(a, t, b) {
        if (a !== actor || t !== trip || b !== batch) throw Error("TEST_SCOPE");
        return finalRun;
      },
      readManifest: forbidden,
    },
  });
  const drainTargeted = vi.fn(async () => {});
  const url = `http://local/v2/import-batches/${batch}/interpretations`;
  const send = (target = taskId, allowed = true) =>
    universalPrepareBoundary(
      new Request(`${url}/prepare`, {
        method: "POST",
        headers: { "Idempotency-Key": target },
        body: JSON.stringify({
          version: "otr.backend.universal-resume/1",
          batchId: batch,
          tripId: trip,
          taskId: target,
        }),
      }),
      actor,
      async (a, t) => allowed && a === actor && t === trip,
      (requestedTrip, input) =>
        prepareUniversalQueuedRuntime(actor, requestedTrip, input, {
          async resume(pinnedTrip, pinnedBatch, pinnedTask) {
            if (pinnedTrip !== trip) throw Error("TEST_SCOPE");
            return host.resume(pinnedBatch, pinnedTask);
          },
          prepare: forbidden,
          drainTargeted,
        }),
    );
  return { host, url, send, drainTargeted };
}

it.each([false, true])(
  "blocks normal Resume after exact ambiguous commit readback (prior wake present: %s)",
  async (signalled) => {
    await withTaskStore(async (sql, db, path) => {
      sql.exec(ddl);
      reserveMixedBTask(sql, initial);
      const expiresAt = new Date(Date.now() + 60000).toISOString();
      const f = finalFixture(expiresAt);
      materialCatalogue(sql, f);
      const context = await captureAccountRequestContext(trip, async () => actor);
      const commit = db.withImmediateTransactionAsync.bind(db);
      const lostAck = vi
        .spyOn(db, "withImmediateTransactionAsync")
        .mockImplementationOnce(async (work) => {
          await commit(work);
          throw Error("FIXTURE_SQLITE_COMMIT_ACK_LOST");
        });
      await expect(
        createReservedMixedBTask(
          db,
          taskDeps(actor),
          context,
          f.task,
          f.reservation,
          () => {},
          () => {},
        ),
      ).rejects.toThrow("FIXTURE_SQLITE_COMMIT_ACK_LOST");
      lostAck.mockRestore();
      expect(await readCommitPostimage(path, context, f)).toBe(
        "EXACT_TASK_PRESENT_CONSUMED",
      );
      const wrong = { ...f, task: { ...f.task, logical_request_id: randomUUID() } };
      expect(await readCommitPostimage(path, context, wrong)).toBe("UNCERTAIN");
      const hash = async (bytes: Uint8Array) => sha(bytes);
      const wakeId = await intelligenceWakeIdentity(
        {
          version: 1,
          account_id: actor,
          task_id: taskId,
          expected_publication_fence: 1,
          wake_reason: "REEVALUATE",
        },
        hash,
      );
      if (signalled)
        await db.withTransactionAsync(async () => {
          expect(await signalIntelligenceWake(db, f.task, hash, now)).toBe(wakeId);
        });

      const restarted = new DatabaseSync(path);
      try {
        restarted.exec("PRAGMA foreign_keys=ON");
        const restartDb = universalTaskDatabase(restarted);
        const repo = createIntelligenceContinuationRepository(restartDb, taskDeps(actor));
        const scope = {
          db: restartDb,
          repository: (db = restartDb) =>
            createIntelligenceContinuationRepository(db, taskDeps(actor)),
          context,
          reservation: f.reservation,
          task: f.task,
          expectedWakeId: wakeId,
          assertCurrent: () => {},
          now: () => now,
        };
        await expect(
          recoverMixedBTaskWake({ ...scope, expectedWakeId: "wrong" }),
        ).rejects.toThrow("MIXED_B_WAKE_IDENTITY");
        if (signalled) {
          restarted
            .prepare("UPDATE sync_operations SET status='PROCESSING' WHERE id=?")
            .run(wakeId);
          await expect(recoverMixedBTaskWake(scope)).rejects.toThrow(
            "MIXED_B_WAKE_STATE",
          );
          expect((await repo.read(context, taskId)).sync_operation_id).toBeNull();
          restarted
            .prepare("UPDATE sync_operations SET status='PENDING' WHERE id=?")
            .run(wakeId);
        }
        let active = true;
        const assertActive = () => {
          if (!active) throw Error("TEST_MIXED_B_CLOSED");
        };
        const { host, url, send, drainTargeted } = exactBResumeFixture(
          restartDb,
          context,
          f.reservation.finalRun,
          expiresAt,
          assertActive,
        );
        const readOnly = restarted.prepare("SELECT total_changes() AS n").get();
        const passive = await universalBoundary(
          new Request(`${url}?tripId=${trip}`),
          actor,
          async () => true,
          {
            readContext: (_a, b) => host.readContext(b),
            read: forbidden,
            execute: forbidden,
          },
        );
        expect(passive.status).toBe(200);
        expect(restarted.prepare("SELECT total_changes() AS n").get()).toEqual(readOnly);
        expect((await repo.read(context, taskId)).sync_operation_id).toBeNull();
        expect((await send(randomUUID())).status).toBe(503);
        expect((await send(taskId, false)).status).toBe(404);
        expect((await send()).status).toBe(503);
        await expect(host.resume(batch, taskId)).rejects.toThrow(
          "MIXED_B_TASK_OUTCOME_UNQUALIFIED",
        );
        await expect(
          host.claimTargetedMixedBWake(batch, taskId, "fixture"),
        ).rejects.toThrow("MIXED_B_TASK_OUTCOME_UNQUALIFIED");
        await expect(
          host.claimTargetedMixedBWake(randomUUID(), taskId, "fixture"),
        ).rejects.toThrow("MIXED_B_INITIAL_BINDING");
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(drainTargeted).not.toHaveBeenCalled();
        expect(restarted.prepare("SELECT total_changes() AS n").get()).toEqual(readOnly);
        expect(await readExactTaskWake(restartDb, wakeId)).toEqual(
          signalled
            ? expect.objectContaining({ status: "PENDING", attemptCount: 0 })
            : null,
        );

        // The existing private Wake helper remains an isolated prototype, not an HTTP fallback.
        if (signalled) {
          // Independent SQLite handle races after the previous read and before bind acquires the writer lock.
          const originalImmediate =
            restartDb.withImmediateTransactionAsync.bind(restartDb);
          const claim = vi
            .spyOn(restartDb, "withImmediateTransactionAsync")
            .mockImplementationOnce(async (work) => {
              sql
                .prepare(
                  "UPDATE sync_operations SET status='PROCESSING',attempt_count=1,claim_owner='other-worker' WHERE id=?",
                )
                .run(wakeId);
              return originalImmediate(work);
            });
          await expect(recoverMixedBTaskWake(scope)).rejects.toThrow(
            "MIXED_B_WAKE_STATE",
          );
          expect((await repo.read(context, taskId)).sync_operation_id).toBeNull();
          claim.mockRestore();
          sql
            .prepare(
              "UPDATE sync_operations SET status='PENDING',attempt_count=0,claim_owner=NULL WHERE id=?",
            )
            .run(wakeId);

          // Expiry/close while the existing bind CAS is in flight rolls the exact bind back.
          const run = restartDb.runAsync.bind(restartDb);
          const update = vi
            .spyOn(restartDb, "runAsync")
            .mockImplementation(async (statement, ...parameters) => {
              const result = await run(statement, ...parameters);
              if (/UPDATE intelligence_continuations/i.test(statement)) {
                expect(() =>
                  sql
                    .prepare("UPDATE sync_operations SET attempt_count=1 WHERE id=?")
                    .run(wakeId),
                ).toThrow(/locked/);
                active = false;
              }
              return result;
            });
          await expect(
            recoverMixedBTaskWake({ ...scope, assertCurrent: assertActive }),
          ).rejects.toThrow("TEST_MIXED_B_CLOSED");
          expect(active).toBe(false);
          expect((await repo.read(context, taskId)).sync_operation_id).toBeNull();
          expect(drainTargeted).not.toHaveBeenCalled();
          update.mockRestore();
          active = true;
        }
        expect((await recoverMixedBTaskWake(scope)).sync_operation_id).toBe(wakeId);
        const boundReadOnly = restarted.prepare("SELECT total_changes() AS n").get();
        expect((await send()).status).toBe(503);
        expect(restarted.prepare("SELECT total_changes() AS n").get()).toEqual(
          boundReadOnly,
        );
        expect(drainTargeted).not.toHaveBeenCalled();
        expect(await readExactTaskWake(restartDb, wakeId)).toMatchObject({
          baseVersion: 1,
          status: "PENDING",
          attemptCount: 0,
        });
        expect(phase(restarted)).toBe("CONSUMED");
        const changes = restarted.prepare("SELECT total_changes() AS n").get();
        expect((await recoverMixedBTaskWake(scope)).sync_operation_id).toBe(wakeId);
        expect(restarted.prepare("SELECT total_changes() AS n").get()).toEqual(changes);
        expect(
          restarted.prepare("SELECT count(*) AS n FROM sync_operations").get(),
        ).toEqual({ n: 1 });
        expect(
          restarted.prepare("SELECT count(*) AS n FROM intelligence_continuations").get(),
        ).toEqual({ n: 1 });
        expect(
          restarted
            .prepare("SELECT count(*) AS n FROM intelligence_continuation_attempts")
            .get(),
        ).toEqual({ n: 0 });
      } finally {
        restarted.close();
      }
    });
  },
);

it("creates and consumes only inside an exact existing material lease, rolling back on expiry during SQLite create", async () => {
  await withTaskStore(async (sql, db, path) => {
    sql.exec(ddl);
    reserveMixedBTask(sql, initial);
    const expiresAt = new Date(Date.now() + 60000).toISOString();
    const taskDeadline = Date.now() + 10000;
    const f = finalFixture(new Date(taskDeadline).toISOString());
    let taskClock = taskDeadline - 1;
    materialCatalogue(sql, f);
    const observer = new DatabaseSync(path);
    try {
      const context = await captureAccountRequestContext(trip, async () => actor);
      const runBinding = f.reservation.finalRun;
      const originalInputs = runBinding.inputs.map(({ pdfSource, ...pin }) =>
        pdfSource
          ? {
              ...pin,
              representation_id: pdfSource.original.representationId,
              payload_sha256: pdfSource.original.sha256,
              byte_count: pdfSource.original.byteCount,
            }
          : pin,
      );
      const raw = {
        batchId: batch,
        submissionSha256: initial.submissionSha256,
        inputs: originalInputs,
      };
      const materialInputSha256 = "e".repeat(64);
      const expected = {
        version: "otr.import.mixed-b-material-current/1",
        initialManifestSha256: mixedBInitialDigest(initial),
        materialInputSha256,
        scopeExpiresAt: expiresAt,
        scopeRemainingMs: 60000,
        binding: runBinding,
      };
      let reply = expected;
      let transportDelay = false;
      let active = true;
      let locked = false;
      const statements: string[] = [];
      const hash = async (bytes: Uint8Array) => sha(bytes);
      const material = createUniversalOriginalSourceConnection(
        {
          withLease: async (work) =>
            work({
              retire: vi.fn(),
              async query(statement, parameters) {
                statements.push(statement);
                if (statement.startsWith("SELECT")) {
                  locked = true;
                  expect(JSON.parse(String(parameters?.[6]))).toEqual({
                    version: expected.version,
                    initialManifest: initial,
                    inputs: originalInputs,
                  });
                  if (transportDelay)
                    await new Promise<void>((resolve) => setTimeout(resolve, 5));
                  return { rows: [{ result: reply }] };
                }
                if (["COMMIT", "ROLLBACK"].includes(statement)) locked = false;
                return { rows: [] };
              },
            }),
        },
        hash,
        {
          mixedBInitial: {
            manifest: initial,
            taskDb: sql,
            expectedMaterial: { inputSha256: materialInputSha256, expiresAt },
            assertCurrent() {
              if (!active) throw Error("FIXTURE_OBSERVED_LEASE_LOSS");
            },
          },
        },
      );
      const create = vi.fn(async (assertLockedCurrent: () => void) => {
        expect(locked).toBe(true);
        expect(await db.isInTransactionAsync()).toBe(false);
        const task = await createReservedMixedBTask(
          db,
          taskDeps(actor),
          context,
          f.task,
          f.reservation,
          assertLockedCurrent,
          () => {
            if (taskClock >= Date.parse(f.task.policy_snapshot.deadline!))
              throw Error("FIXTURE_SHORTER_TASK_DEADLINE");
          },
        );
        expect(locked).toBe(true);
        expect(phase(observer)).toBe("CONSUMED");
        return task;
      });
      reply = { ...expected, materialInputSha256: "f".repeat(64) };
      await expect(
        material.withCurrentMixedBMaterial(raw, runBinding, create),
      ).rejects.toThrow();
      expect(create).not.toHaveBeenCalled();
      reply = { ...expected, scopeRemainingMs: 1 };
      transportDelay = true;
      await expect(
        material.withCurrentMixedBMaterial(raw, runBinding, create),
      ).rejects.toThrow("MIXED_B_MATERIAL_WINDOW_CLOSED");
      expect(create).not.toHaveBeenCalled();
      expect(phase(observer)).toBe("RESERVED");
      reply = expected;
      transportDelay = false;
      const begin = db.withImmediateTransactionAsync.bind(db);
      const lossBeforeWrite = vi
        .spyOn(db, "withImmediateTransactionAsync")
        .mockImplementationOnce((work) => {
          active = false;
          return begin(work);
        });
      const observedWrites = vi.spyOn(db, "runAsync");
      await expect(
        material.withCurrentMixedBMaterial(raw, runBinding, create),
      ).rejects.toThrow("FIXTURE_OBSERVED_LEASE_LOSS");
      expect(observedWrites).not.toHaveBeenCalled();
      expect(phase(observer)).toBe("RESERVED");
      observedWrites.mockRestore();
      lossBeforeWrite.mockRestore();
      active = true;

      const run = db.runAsync.bind(db);
      const close = vi
        .spyOn(db, "runAsync")
        .mockImplementation(async (statement, ...parameters) => {
          const output = await run(statement, ...parameters);
          if (/INSERT INTO intelligence_continuations/i.test(statement)) active = false;
          return output;
        });
      await expect(
        material.withCurrentMixedBMaterial(raw, runBinding, create),
      ).rejects.toThrow("FIXTURE_OBSERVED_LEASE_LOSS");
      close.mockRestore();
      expect(phase(observer)).toBe("RESERVED");
      expect(
        observer.prepare("SELECT count(*) AS n FROM intelligence_continuations").get(),
      ).toEqual({ n: 0 });
      expect(statements.at(-1)).toBe("ROLLBACK");
      active = true;
      const shortTask = vi
        .spyOn(db, "runAsync")
        .mockImplementation(async (statement, ...parameters) => {
          const output = await run(statement, ...parameters);
          if (/INSERT INTO intelligence_continuations/i.test(statement))
            taskClock = taskDeadline;
          return output;
        });
      await expect(
        material.withCurrentMixedBMaterial(raw, runBinding, create),
      ).rejects.toThrow("FIXTURE_SHORTER_TASK_DEADLINE");
      shortTask.mockRestore();
      expect(active).toBe(true);
      expect(phase(observer)).toBe("RESERVED");
      expect(
        observer.prepare("SELECT count(*) AS n FROM intelligence_continuations").get(),
      ).toEqual({ n: 0 });
      expect(statements.at(-1)).toBe("ROLLBACK");
      expect(await readCommitPostimage(path, context, f)).toBe("EXACT_RESERVED_NO_TASK");

      taskClock = taskDeadline - 1;
      expect(await material.withCurrentMixedBMaterial(raw, runBinding, create)).toEqual(
        f.task,
      );
      expect(statements.at(-1)).toBe("COMMIT");
      expect(phase(observer)).toBe("CONSUMED");
      expect(observer.prepare("SELECT count(*) AS n FROM sync_operations").get()).toEqual(
        { n: 0 },
      );
    } finally {
      observer.close();
    }
  });
});

it.each([false, true])(
  "normal exact B Prepare is read-only and closed before Source begin/Task/Wake (existing Run: %s)",
  async (exists) => {
    await withTaskStore(async (sql, db) => {
      sql.exec(ddl);
      if (exists) reserveMixedBTask(sql, initial);
      const f = finalFixture();
      const context = await captureAccountRequestContext(trip, async () => actor);
      const original = f.reservation.finalRun.inputs.map(({ pdfSource, ...pin }) =>
        pdfSource
          ? {
              ...pin,
              representation_id: pdfSource.original.representationId,
              payload_sha256: pdfSource.original.sha256,
              byte_count: pdfSource.original.byteCount,
            }
          : pin,
      );
      const raw = {
        batchId: batch,
        submissionSha256: initial.submissionSha256,
        inputs: original,
      };
      const statements: string[] = [];
      const unexpected = vi.fn(async () => {
        throw Error("UNEXPECTED_WRITE_OR_IO");
      });
      const host = createUniversalContinuousHost({
        enabled: true,
        context,
        finiteDeadline: new Date(Date.now() + 60000).toISOString(),
        finiteBatch: universalProviderBatchContext(actor, trip, raw),
        mixedBInitial: initial,
        db,
        assertCurrentAuth: async () => {},
        assertNewExecutionAllowed: () => {},
        catalogConnection: { withLease: unexpected },
        bootstrapLedger: unexpected,
        selectProvider: unexpected,
        runtime: {
          stores: {} as never,
          sourceConnection: {
            withLease: async (work) =>
              work({
                retire: vi.fn(),
                async query(statement) {
                  statements.push(statement);
                  return {
                    rows: statement.includes("trip_source_find_finite_universal_binding")
                      ? [{ binding: exists ? f.reservation.finalRun : null }]
                      : [],
                  };
                },
              }),
          },
          taskReceiptConnection: { withLease: unexpected },
          gateway: {} as never,
          readBinary: unexpected,
          environment: () => undefined,
        },
        readAdmittedPrice: unexpected,
      });
      const before = sql.prepare("SELECT total_changes() AS n").get();
      let owningError: unknown;
      const response = await universalPrepareBoundary(
        new Request(`http://local/v2/import-batches/${batch}/interpretations/prepare`, {
          method: "POST",
          headers: { "Idempotency-Key": batch },
          body: JSON.stringify({ ...raw, tripId: trip }),
        }),
        actor,
        async () => true,
        (requestedTrip, input) =>
          prepareUniversalQueuedRuntime(actor, requestedTrip, input, {
            resume: unexpected,
            async prepare(t, value) {
              const { tripId, ...pins } = universalBatchPrepareSchema.parse(value);
              expect([t, tripId]).toEqual([trip, trip]);
              try {
                return await host.prepare(pins);
              } catch (error) {
                owningError = error;
                throw error;
              }
            },
            drainTargeted: unexpected,
          }),
      );
      expect(response.status).toBe(503);
      expect(owningError).toEqual(
        Error(
          exists ? "MIXED_B_MATERIAL_LEASE_UNQUALIFIED" : "MIXED_B_EXISTING_RUN_REQUIRED",
        ),
      );
      expect(
        statements.filter((q) => q.includes("trip_source_find_finite_universal_binding")),
      ).toHaveLength(1);
      expect(statements.filter((q) => q.includes("trip_source_begin_"))).toHaveLength(0);
      expect(sql.prepare("SELECT total_changes() AS n").get()).toEqual(before);
      expect(phase(sql)).toBe(exists ? "RESERVED" : undefined);
      expect(
        sql.prepare("SELECT count(*) AS n FROM intelligence_continuations").get(),
      ).toEqual({ n: 0 });
      expect(sql.prepare("SELECT count(*) AS n FROM sync_operations").get()).toEqual({
        n: 0,
      });
      expect(unexpected).not.toHaveBeenCalled();
    });
  },
);

it.skipIf(!process.env.OTR_C01_FIXTURE_PG_PORT || !process.env.OTR_C01_FIXTURE_PG_CA)(
  "actual Source driver lease loss distinguishes precommit observation from exact applied SQLite postimage",
  async () => {
    const port = Number(process.env.OTR_C01_FIXTURE_PG_PORT);
    const ca = readFileSync(process.env.OTR_C01_FIXTURE_PG_CA!, "utf8");
    const connection = createSourcePgConnection({
      host: "127.0.0.1",
      port,
      database: "postgres",
      password: "otr-c01-local-fixture",
      ca,
    });
    const admin = new Client({
      host: "127.0.0.1",
      port,
      database: "postgres",
      user: "supabase_admin",
      connectionTimeoutMillis: 3000,
      query_timeout: 5000,
      ssl: { ca, rejectUnauthorized: true },
    });
    await admin.connect();
    try {
      async function waitForUnlocked(key: number) {
        for (let attempt = 0; attempt < 80; attempt++) {
          if (
            (
              await admin.query("SELECT pg_try_advisory_lock($1::bigint) AS unlocked", [
                key,
              ])
            ).rows[0].unlocked === true
          ) {
            await admin.query("SELECT pg_advisory_unlock($1::bigint)", [key]);
            return;
          }
          await new Promise<void>((resolve) => setTimeout(resolve, 100));
        }
        throw Error("FIXTURE_LOCK_DID_NOT_RELEASE");
      }
      await withTaskStore(async (sql, db, path) => {
        sql.exec(ddl);
        reserveMixedBTask(sql, initial);
        const f = finalFixture();
        materialCatalogue(sql, f);
        const context = await captureAccountRequestContext(trip, async () => actor);
        let beforeLocalCreate = true;
        await expect(
          connection.withLease(async (lease) => {
            await lease.query("BEGIN");
            const id = (await lease.query("SELECT pg_backend_pid() AS id")).rows[0].id;
            await lease.query("SELECT pg_advisory_xact_lock(714129::bigint)");
            expect(
              (await admin.query("SELECT pg_terminate_backend($1::int) AS killed", [id]))
                .rows[0].killed,
            ).toBe(true);
            await waitForUnlocked(714129);
            // This awaits actual driver observation before even calling the local writer.
            await lease.query("SELECT 1");
            beforeLocalCreate = false;
          }),
        ).rejects.toThrow(/RETIRED|terminating|closed/i);
        expect(beforeLocalCreate).toBe(true);
        expect(await readCommitPostimage(path, context, f)).toBe(
          "EXACT_RESERVED_NO_TASK",
        );
      });

      await withTaskStore(async (sql, db, path) => {
        sql.exec(ddl);
        reserveMixedBTask(sql, initial);
        const f = finalFixture();
        materialCatalogue(sql, f);
        const context = await captureAccountRequestContext(trip, async () => actor);
        let callbackOutlivedLock = false;
        let localCommitReturned = false;
        await expect(
          connection.withLease(async (lease) => {
            await lease.query("BEGIN");
            const id = (await lease.query("SELECT pg_backend_pid() AS id")).rows[0].id;
            await lease.query("SELECT pg_advisory_xact_lock(714130::bigint)");
            const run = db.runAsync.bind(db);
            const inject = vi
              .spyOn(db, "runAsync")
              .mockImplementation(async (statement, ...parameters) => {
                const result = await run(statement, ...parameters);
                if (/INSERT INTO intelligence_continuations/i.test(statement)) {
                  // Test-only cut: the external administrator ends the session mid SQLite callback.
                  expect(
                    (
                      await admin.query(
                        "SELECT pg_terminate_backend($1::int) AS killed",
                        [id],
                      )
                    ).rows[0].killed,
                  ).toBe(true);
                  await waitForUnlocked(714130);
                  callbackOutlivedLock = true;
                }
                return result;
              });
            try {
              // Intentionally lacks a real owning lease guard to reproduce the closed path's gap.
              await createReservedMixedBTask(
                db,
                taskDeps(actor),
                context,
                f.task,
                f.reservation,
                () => {},
                () => {},
              );
              localCommitReturned = true;
            } finally {
              inject.mockRestore();
            }
            await lease.query("COMMIT");
          }),
        ).rejects.toThrow(/RETIRED|terminating|closed/i);
        expect(callbackOutlivedLock).toBe(true);
        expect(localCommitReturned).toBe(true);
        expect(await readCommitPostimage(path, context, f)).toBe(
          "EXACT_TASK_PRESENT_CONSUMED",
        );
        const snapshot = () => ({
          task: sql
            .prepare("SELECT * FROM intelligence_continuations WHERE task_id=?")
            .all(taskId),
          reservation: sql
            .prepare("SELECT * FROM universal_mixed_b_task_reservations WHERE task_id=?")
            .all(taskId),
          queue: sql.prepare("SELECT * FROM sync_operations ORDER BY id").all(),
          changes: sql.prepare("SELECT total_changes() AS n").get(),
        });
        const before = snapshot();
        expect(before.task).toHaveLength(1);
        expect(before.reservation).toHaveLength(1);
        expect(before.queue).toEqual([]);
        const { host, send, drainTargeted } = exactBResumeFixture(
          db,
          context,
          f.reservation.finalRun,
          new Date(Date.now() + 60_000).toISOString(),
          () => {},
        );
        const resume = vi.spyOn(host, "resume");
        const write = vi.spyOn(db, "runAsync");
        const response = await send();
        expect(response.status).toBe(503);
        expect(resume).toHaveBeenCalledExactlyOnceWith(batch, taskId);
        await expect(resume.mock.results[0].value).rejects.toThrow(
          "MIXED_B_TASK_OUTCOME_UNQUALIFIED",
        );
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(drainTargeted).not.toHaveBeenCalled();
        expect(write).not.toHaveBeenCalled();
        expect(snapshot()).toEqual(before);
        expect(await readCommitPostimage(path, context, f)).toBe(
          "EXACT_TASK_PRESENT_CONSUMED",
        );
      });
    } finally {
      await admin.end();
    }
  },
  20000,
);

it("normal mixed Resume and deferred claim require separate committed owning proof and preserve an uncertain claim", async () => {
  // No QA material is used here. The owning SQL response is a test double.
  const bodies = [
    Buffer.from("Synthetic PNG material"),
    Buffer.from("Synthetic PDF extraction"),
    Buffer.from("Synthetic typed input"),
  ];
  const pdfOriginal = Buffer.from("Synthetic original PDF");
  const original = initial.originals.map((pin) => {
    const bytes = pin.ordinal === 1 ? pdfOriginal : bodies[pin.ordinal];
    return { ...pin, byteCount: bytes.length, sha256: sha(bytes) };
  });
  const enrollment = mixedBInitialManifestSchema.parse({ ...initial, originals: original });
  const finalRun = finalFixture().reservation.finalRun;
  const binding = universalRunBindingSchema.parse({
    ...finalRun,
    createdAt: new Date().toISOString(),
    inputs: finalRun.inputs.map((pin) => {
      const { ordinal, sha256, byteCount } = original.find((p) => p.inputId === pin.id)!;
      const body = bodies[ordinal];
      return {
        ...pin,
        byte_count: body.length,
        payload_sha256: sha(body),
        ...(pin.pdfSource
          ? {
              pdfSource: {
                ...pin.pdfSource,
                original: { ...pin.pdfSource.original, sha256, byteCount },
              },
            }
          : {}),
      };
    }),
  });
  const expiresAt = new Date(Date.now() + 60000).toISOString();
  const materialInputSha256 = "e".repeat(64);
  const raw = {
    batchId: batch,
    submissionSha256: enrollment.submissionSha256,
    inputs: binding.inputs.map(({ pdfSource, ...pin }) =>
      pdfSource
        ? {
            ...pin,
            representation_id: pdfSource.original.representationId,
            byte_count: pdfSource.original.byteCount,
            payload_sha256: pdfSource.original.sha256,
          }
        : pin,
    ),
  };
  const finiteBatch = universalProviderBatchContext(actor, trip, raw);
  const manifest = {
    accountId: actor,
    tripId: trip,
    batchId: batch,
    representations: binding.inputs.map((p) => {
      const { ordinal } = original.find((pin) => pin.inputId === p.id)!;
      return {
        accountId: actor,
        tripId: trip,
        batchId: batch,
        inputId: p.id,
        sourceId: p.source_id,
        representationId: p.representation_id,
        revision: p.material_revision,
        originalSha256: p.payload_sha256,
        pdfSource: p.pdfSource,
        mime: ordinal === 0 ? "image/png" : "text/plain",
        bytes: bodies[ordinal],
      };
    }),
  };
  const selection = {
    integrationId: "synthetic",
    configVersion: 2,
    configurationSha256: "c".repeat(64),
    providerConfigId: randomUUID(),
    priceScheduleId: randomUUID(),
    providerId: "DeepSeek" as const,
    modelId: "deepseek-flash" as const,
    modelVersion: "DeepSeek-V4.1-Flash" as const,
    adapterVersion: "fixture",
    region: "fixture",
    route: "fixture",
    maxCostNanos: "50000000",
    taskLifetimeMs: 600000,
  };
  const draft = await buildUniversalRegisteredTaskDraft(binding, manifest, selection, expiresAt);
  const f = { reservation: { initial: enrollment, finalRun: binding }, task: draft.task };
  const pg = {
    host: "db.tuqigdxrvrerfewsxqgm.supabase.co",
    port: 5432,
    database: "postgres",
    password: "synthetic-unused",
    ca: "synthetic-unused",
  };
  const finiteNative = {
    version: 1,
    startsAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt,
    batch: { ...raw, actorId: actor, tripId: trip },
    selection,
  };
  const configuration = {
    version: 2,
    environment: "DEV",
    project: "tuqigdxrvrerfewsxqgm",
    enabled: true,
    integrationId: selection.integrationId,
    directory: "/var/lib/otr/universal-custody",
    identity: { store_id: randomUUID(), device: "1", inode: "1" },
    taskDatabase: "/var/lib/otr/universal-custody/continuations.db",
    sourcePg: pg,
    taskPg: pg,
    catalogPg: pg,
  };
  const parse = (mixedBForwardRecovery?: unknown, materialPins = raw.inputs) =>
    universalContinuousConfigSchema.safeParse({
      ...configuration,
      finiteNative: {
        ...finiteNative,
        batch: { ...finiteNative.batch, inputs: materialPins },
        mixedBForwardRecovery,
      },
    });
  expect(parse().success).toBe(true);
  expect(parse({ initial: enrollment, materialInputSha256 }).success).toBe(true);
  expect(parse({
    initial: enrollment, materialInputSha256: mixedBInitialDigest(enrollment),
  }).success).toBe(false);
  expect(parse({ initial: enrollment, materialInputSha256 }, [
    { ...raw.inputs[0], payload_sha256: "b".repeat(64) },
    ...raw.inputs.slice(1),
  ]).success).toBe(false);
  const initialAcquisition = {
    initial: enrollment, startsAt: finiteNative.startsAt, expiresAt,
  };
  expect(universalContinuousConfigSchema.safeParse({
    ...configuration, mixedBInitialAcquisition: initialAcquisition,
  }).success).toBe(true);
  expect(universalContinuousConfigSchema.safeParse({
    ...configuration, finiteNative, mixedBInitialAcquisition: initialAcquisition,
  }).success).toBe(false);
  const proofEvents: string[] = [];
  let proofState: "CURRENT" | "ACK_LOST" | "CLOSED" = "CURRENT";
  const normalizedInputSha256 = "f".repeat(64);
  let runPresent = true;
  let runBegins = 0;
  let runAckLost = false;
  const connection: CorePgConnection = {
    async withLease(work) {
      let material = false, beginRun = false;
      return work({
        retire() {},
        async query(statement, parameters) {
          if (/^BEGIN/.test(statement)) return { rows: [] };
          if (statement === "COMMIT") {
            if (beginRun) {
              runPresent = true;
              if (runAckLost) throw Error("FIXTURE_RUN_COMMIT_ACK_LOST");
            }
            if (material) {
              if (proofState === "ACK_LOST") throw Error("FIXTURE_COMMIT_ACK_LOST");
              proofEvents.push("COMMIT");
            }
            return { rows: [] };
          }
          if (statement === "ROLLBACK") return { rows: [] };
          if (statement.includes("trip_source_begin_finite_universal_inputs")) {
            expect(parameters?.slice(0, 2)).toEqual([actor, trip]);
            expect(JSON.parse(String(parameters?.[2]))).toEqual({
              ...raw, runId: binding.runId, taskId, materialInputSha256, normalizedInputSha256,
            });
            expect(runPresent).toBe(false);
            beginRun = true;
            runBegins++;
            return { rows: [{ run: { id: binding.runId } }] };
          }
          expect(statement).toContain("trip_source_find_finite_universal_binding");
          expect(parameters?.slice(0, 6)).toEqual([
            actor, trip, batch, taskId, enrollment.runId, enrollment.submissionSha256,
          ]);
          const request = JSON.parse(String(parameters?.[6]));
          if (Array.isArray(request)) return { rows: [{ binding: runPresent ? binding : null }] };
          if (request.version === "otr.import.mixed-b-material-ready/1") {
            expect(request).toEqual({
              version: request.version, initialManifest: enrollment,
              inputs: finiteBatch.inputs, materialInputSha256,
            });
            return { rows: [{ result: {
              version: request.version, initialManifestSha256: mixedBInitialDigest(enrollment),
              materialInputSha256, normalizedInputSha256, runState: runPresent ? "PENDING" : "ABSENT",
              scopeExpiresAt: expiresAt, scopeRemainingMs: 60000,
            } }] };
          }
          expect(request).toEqual({
            version: "otr.import.mixed-b-material-current/1",
            initialManifest: enrollment,
            inputs: finiteBatch.inputs,
          });
          material = true;
          proofEvents.push("PROOF");
          if (proofState === "CLOSED") throw Error("FIXTURE_SOURCE_CLOSED");
          return {
            rows: [{
              result: {
                version: request.version,
                initialManifestSha256: mixedBInitialDigest(enrollment),
                materialInputSha256,
                scopeExpiresAt: expiresAt,
                scopeRemainingMs: 60000,
                binding,
              },
            }],
          };
        },
      });
    },
  };
  for (const point of ["fresh run", "Run commit acknowledgement lost", "SQLite commit acknowledgement lost", "SQLite latch acknowledgement lost"] as const) {
    await withTaskStore(async (sql, db, path) => {
      sql.exec(ddl);
      reserveMixedBTask(sql, enrollment);
      materialCatalogue(sql, f);
      runPresent = point === "SQLite commit acknowledgement lost";
      runAckLost = point === "Run commit acknowledgement lost";
      const localAckLost = point === "SQLite commit acknowledgement lost";
      const latchAckLost = point === "SQLite latch acknowledgement lost";
      const beforeBegin = runBegins;
      const context = await captureAccountRequestContext(trip, async () => actor);
      const emptyCatalog = JSON.stringify({
        version: 2, actor_account_id: actor, trip_id: trip,
        ...Object.fromEntries(Object.keys(tripImportCatalogSchemas).map((key) => [key, []])),
      });
      const catalog = vi.spyOn(universalCatalog, "readUniversalCatalog")
        .mockResolvedValueOnce(emptyCatalog);
      const host = createUniversalContinuousHost({
        enabled: true, context, finiteBatch, finiteDeadline: expiresAt,
        mixedBInitial: enrollment,
        mixedBForwardRecovery: {
          taskDatabase: sql, materialInputSha256, assertConfigCurrent() {},
        },
        db,
        assertCurrentAuth: async () => {},
        assertNewExecutionAllowed() {},
        catalogConnection: { withLease: forbidden },
        bootstrapLedger: async () => ({
          journey: { id: trip, title: "Fixture", startDate: null, endDate: null,
            settlementCurrency: "NZD", settlementScale: 2,
            valuationPolicy: "REFERENCE_RATE", updatedAt: binding.createdAt },
          members: [], households: [], expenses: [], corrections: [], rateQuotes: [],
          actor: { userId: actor, memberId: null, role: "owner", capabilities: {
            canRead: true, canCreateExpense: false, canEditOwnExpense: false,
            canCorrectAnyExpense: false, canSuggestCorrection: false,
            canResolveOwnExpenseConflict: false, canAddOwnPaymentEvidence: false,
            canManageExpenseValuation: false, canManageLedgerValuationPolicy: false,
          }},
          cursor: null, serverTime: binding.createdAt,
        }),
        selectProvider: async () => selection,
        runtime: {
          stores: {} as never, sourceConnection: connection,
          taskReceiptConnection: { withLease: forbidden }, gateway: { invoke: forbidden },
          readBinary: forbidden, environment: () => undefined,
        },
        readAdmittedPrice: forbidden,
        publishedSource: {
          lookup: createUniversalBatchSource({
            enabled: true, finiteBatch, connection, authorize: async () => {},
          }).lookup,
          readManifest: async () => manifest,
        },
      });
      const drainTargeted = vi.fn(async () => {});
      const prepare = () => universalPrepareBoundary(
        new Request(`http://local/v2/import-batches/${batch}/interpretations/prepare`, {
          method: "POST", headers: { "Idempotency-Key": batch },
          body: JSON.stringify({ tripId: trip, ...raw }),
        }),
        actor,
        async (a, t) => a === actor && t === trip,
        (t, input) => prepareUniversalQueuedRuntime(actor, t, input, {
          resume: forbidden,
          prepare: (_trip, value) => {
            const { tripId: _t, ...body } = universalBatchPrepareSchema.parse(value);
            return host.prepare(body);
          },
          drainTargeted,
        }),
      );
      const ready = (query = "&materialReady=1") => universalBoundary(
        new Request(`http://local/v2/import-batches/${batch}/interpretations?tripId=${trip}${query}`),
        actor,
        async (a, t) => a === actor && t === trip,
        {
          readMaterialReady: (_a, b) => host.readMaterialReady(b),
          readContext: (_a, b) => host.readContext(b),
          execute: forbidden,
          read: forbidden,
        },
      );
      let stageObserved = false;
      let spentObserved = false;
      const immediate = db.withImmediateTransactionAsync.bind(db);
      const cut = vi.spyOn(db, "withImmediateTransactionAsync").mockImplementation(async (work) => {
        await immediate(work);
        const observer = new DatabaseSync(path, { readOnly: true });
        try {
          const reservation = observer.prepare("SELECT phase,run_begin_material_sha256 FROM universal_mixed_b_task_reservations WHERE task_id=?").get(taskId);
          if (reservation?.phase === "RESERVED") {
            expect(reservation.run_begin_material_sha256).toBe(materialInputSha256);
            spentObserved = true;
            if (latchAckLost) throw Error("FIXTURE_LATCH_COMMIT_ACK_LOST");
            return;
          }
          if (stageObserved) return;
          expect(reservation?.phase).toBe("CONSUMED");
          stageObserved = true;
          expect(observer.prepare("SELECT sync_operation_id FROM intelligence_continuations WHERE task_id=?").get(taskId))
            .toEqual({ sync_operation_id: null });
          expect(observer.prepare("SELECT count(*) AS n FROM sync_operations").get()).toEqual({ n: 0 });
        } finally {
          observer.close();
        }
        expect(proofEvents.slice(-2)).toEqual(["PROOF", "COMMIT"]);
        if (localAckLost) throw Error("FIXTURE_SQLITE_COMMIT_ACK_LOST");
      });
      try {
        await expect(host.readContext(batch)).rejects.toThrow();
        const beforeReady = sql.prepare("SELECT total_changes() AS n").get();
        const observation = await ready();
        expect(observation.status).toBe(200);
        expect(await observation.json()).toEqual({
          version: "otr.backend.universal-material-ready/1", state: "MATERIAL_READY_NO_TASK",
          accountId: actor, actorId: actor,
          prepare: { tripId: trip, ...raw, inputs: finiteBatch.inputs },
        });
        expect((await ready("")).status).toBe(503);
        expect((await ready("&materialReady=0")).status).toBe(400);
        expect(sql.prepare("SELECT total_changes() AS n").get()).toEqual(beforeReady);
        if (latchAckLost) {
          expect((await prepare()).status).toBe(503);
          expect(spentObserved).toBe(true);
          expect(stageObserved).toBe(false);
          expect(runBegins).toBe(beforeBegin);
          expect(await readCommitPostimage(path, context, f)).toBe("EXACT_RESERVED_NO_TASK");
          const reopened = new DatabaseSync(path);
          try {
            expect(reopened.prepare("SELECT run_begin_material_sha256 FROM universal_mixed_b_task_reservations WHERE task_id=?").get(taskId))
              .toEqual({ run_begin_material_sha256: materialInputSha256 });
            expect(() => reopened.prepare("UPDATE universal_mixed_b_task_reservations SET run_begin_material_sha256=NULL WHERE task_id=?").run(taskId))
              .toThrow("MIXED_B_RESERVATION_TRANSITION_DENIED");
          } finally { reopened.close(); }
          expect((await ready()).status).toBe(503);
          expect((await prepare()).status).toBe(503);
          expect(runBegins).toBe(beforeBegin);
          expect(drainTargeted).not.toHaveBeenCalled();
          return;
        }
        if (runAckLost) {
          expect((await prepare()).status).toBe(503);
          expect(runPresent).toBe(true);
          expect(spentObserved).toBe(true);
          expect(stageObserved).toBe(false);
          expect(drainTargeted).not.toHaveBeenCalled();
          expect(await readCommitPostimage(path, context, f)).toBe("EXACT_RESERVED_NO_TASK");
          runAckLost = false;
        }
        const response = await prepare();
        expect(response.status).toBe(localAckLost ? 503 : 202);
        expect(stageObserved).toBe(true);
        expect((await ready()).status).toBe(503);
        expect(await readCommitPostimage(path, context, f)).toBe("EXACT_TASK_PRESENT_CONSUMED");
        expect(runBegins - beforeBegin).toBe(localAckLost ? 0 : 1);
        const firstWake = await readExactTaskWake(db, draft.attempt.sync_operation_id);
        if (!localAckLost) {
          expect(await response.json()).toMatchObject({ status: "QUEUED", context: { taskId } });
          expect(firstWake).toMatchObject({ status: "PENDING", attemptCount: 0 });
          expect(proofEvents.slice(-4)).toEqual(["PROOF", "COMMIT", "PROOF", "COMMIT"]);
        } else {
          expect(firstWake).toBeNull();
          expect(drainTargeted).not.toHaveBeenCalled();
        }
        const changes = () => sql.prepare("SELECT total_changes() AS n").get();
        const beforeRepeat = changes();
        expect((await host.prepare(raw)).status).toBe("EXISTING");
        expect(changes()).toEqual(beforeRepeat);
        expect(await readExactTaskWake(db, draft.attempt.sync_operation_id)).toEqual(firstWake);
        if (localAckLost) {
          await host.resume(batch, taskId);
          expect(await readExactTaskWake(db, draft.attempt.sync_operation_id))
            .toMatchObject({ status: "PENDING", attemptCount: 0 });
        }
      } finally {
        cut.mockRestore();
        catalog.mockRestore();
      }
    });
    proofEvents.length = 0;
  }
  runPresent = true;
  const donor = new DatabaseSync(":memory:");
  let protectedTaskRow: Record<string, string | number | null>;
  try {
    const db = initializeUniversalTaskDatabase(donor);
    donor.exec(ddl);
    reserveMixedBTask(donor, enrollment);
    materialCatalogue(donor, f);
    const context = await captureAccountRequestContext(trip, async () => actor);
    await createReservedMixedBTask(db, taskDeps(actor), context, f.task, f.reservation, () => {}, () => {});
    protectedTaskRow = donor.prepare("SELECT * FROM intelligence_continuations WHERE task_id=?")
      .get(taskId) as Record<string, string | number | null>;
  } finally {
    donor.close();
  }
  for (const stage of ["create", "bind"] as const) {
    await withTaskStore(async (sql, db, path) => {
      sql.exec(ddl);
      materialCatalogue(sql, f);
      expect(await readProtectedMixedBReservation(db, batch, taskId)).toBeNull();
      const other = new DatabaseSync(path);
      other.exec("PRAGMA foreign_keys=ON");
      const immediate = db.withImmediateTransactionAsync.bind(db);
      let writes = 0;
      const interpose = vi.spyOn(db, "withImmediateTransactionAsync")
        .mockImplementation((work) => {
          writes++;
          if (writes === ({ create: 1, bind: 2 })[stage]) {
            if (stage === "create") {
              reserveMixedBTask(other, enrollment);
              other.exec("BEGIN IMMEDIATE");
              other.prepare("UPDATE universal_mixed_b_task_reservations SET phase='INSERTING' WHERE task_id=?").run(taskId);
              const keys = Object.keys(protectedTaskRow);
              const values = keys.map((key) =>
                typeof protectedTaskRow[key] === "number" ? "CAST(? AS INTEGER)" : "?",
              );
              other.prepare(`INSERT INTO intelligence_continuations (${keys.join(",")}) VALUES (${values.join(",")})`)
                .run(...keys.map((key) => protectedTaskRow[key]));
              other.exec("COMMIT");
            } else {
              const foreign = randomUUID();
              reserveMixedBTask(other, {
                ...enrollment,
                actorId: foreign,
                runId: universalBatchIdentity(foreign, trip, batch, "run"),
                taskId: universalBatchIdentity(foreign, trip, batch, "task"),
              });
            }
          }
          return immediate(work);
        });
      try {
        await expect(bootstrapUniversalTask({
          db, task: f.task, attempt: draft.attempt, claimQueue: false,
          getAccountId: async () => actor,
          assertCurrent() {},
          catalog: JSON.stringify({
            version: 2, actor_account_id: actor, trip_id: trip,
            ...Object.fromEntries(Object.keys(tripImportCatalogSchemas).map((key) => [key, []])),
          }),
          ledger: {
            journey: {
              id: trip, title: "Fixture", startDate: null, endDate: null,
              settlementCurrency: "NZD", settlementScale: 2,
              valuationPolicy: "REFERENCE_RATE", updatedAt: binding.createdAt,
            },
            members: [], households: [], expenses: [], corrections: [], rateQuotes: [],
            actor: {
              userId: actor, memberId: null, role: "owner",
              capabilities: {
                canRead: true, canCreateExpense: false, canEditOwnExpense: false,
                canCorrectAnyExpense: false, canSuggestCorrection: false,
                canResolveOwnExpenseConflict: false,
                canAddOwnPaymentEvidence: false, canManageExpenseValuation: false,
                canManageLedgerValuationPolicy: false,
              },
            },
            cursor: null, serverTime: binding.createdAt,
          },
        })).rejects.toThrow("MIXED_B_TASK_OUTCOME_UNQUALIFIED");
        expect(sql.prepare("SELECT sync_operation_id FROM intelligence_continuations WHERE task_id=?")
          .get(taskId)).toEqual({ sync_operation_id: null });
        expect(sql.prepare("SELECT count(*) AS n FROM sync_operations").get())
          .toEqual({ n: 0 });
        expect(sql.prepare("SELECT count(*) AS n FROM intelligence_continuation_attempts").get())
          .toEqual({ n: 0 });
      } finally {
        interpose.mockRestore();
        other.close();
      }
    });
  }
  await withTaskStore(async (sql, db, path) => {
    sql.exec(ddl);
    reserveMixedBTask(sql, enrollment);
    materialCatalogue(sql, f);
    const context = await captureAccountRequestContext(trip, async () => actor);
    let configCurrent = true;
    const gateway = vi.fn(async (_kind: string, _raw: Record<string, unknown>) => ({}));
    const makeHost = (
      enableForward: boolean,
      expectedMaterialSha256 = materialInputSha256,
    ) =>
      createUniversalContinuousHost({
        enabled: true,
        context,
        finiteBatch,
        finiteDeadline: expiresAt,
        ...(enableForward
          ? {
              mixedBInitial: enrollment,
              mixedBForwardRecovery: {
                taskDatabase: sql,
                materialInputSha256: expectedMaterialSha256,
                assertConfigCurrent() {
                  if (!configCurrent) throw Error("FIXTURE_CONFIG_CHANGED");
                },
              },
            }
          : {}),
        db,
        assertCurrentAuth: async () => {},
        assertNewExecutionAllowed() {},
        catalogConnection: { withLease: forbidden },
        bootstrapLedger: forbidden,
        selectProvider: async () => selection,
        runtime: {
          stores: {} as never,
          sourceConnection: connection,
          taskReceiptConnection: { withLease: forbidden },
          gateway: { invoke: gateway },
          readBinary: forbidden,
          environment: () => undefined,
        },
        readAdmittedPrice: forbidden,
        publishedSource: {
          lookup: createUniversalBatchSource({
            enabled: true, finiteBatch, connection, authorize: async () => {},
          }).lookup,
          readManifest: async () => manifest,
        },
      });
    const host = makeHost(true);
    const drainTargeted = vi.fn(async (_batch: string, _task: string) => {});
    let resumeFailure: unknown;
    const send = (target = host, requestTask = taskId) =>
      universalPrepareBoundary(
        new Request(`http://local/v2/import-batches/${batch}/interpretations/prepare`, {
          method: "POST",
          headers: { "Idempotency-Key": taskId },
          body: JSON.stringify({
            version: "otr.backend.universal-resume/1", batchId: batch, tripId: trip, taskId: requestTask,
          }),
        }),
        actor,
        async (a, t) => a === actor && t === trip,
        (t, input) =>
          prepareUniversalQueuedRuntime(actor, t, input, {
            async resume(_t, b, id) {
              try {
                return await target.resume(b, id);
              } catch (error) {
                resumeFailure = error;
                throw error;
              }
            },
            prepare: forbidden,
            drainTargeted,
          }),
      );
    const wakeId = draft.attempt.sync_operation_id;
    expect((await send()).status).toBe(503);
    expect(await readExactTaskWake(db, wakeId)).toBeNull();
    await createReservedMixedBTask(db, taskDeps(actor), context, f.task, f.reservation, () => {}, () => {});
    expect(await readCommitPostimage(path, context, f)).toBe("EXACT_TASK_PRESENT_CONSUMED");
    expect((await send(makeHost(false))).status).toBe(503);
    const malformedClient = await send(host, "not-a-uuid");
    expect(malformedClient.status).toBe(400);
    expect(await malformedClient.json()).toMatchObject({ error: { code: "INVALID_REQUEST" } });
    expect(proofEvents).toEqual([]);
    const wrongDigest = await send(makeHost(true, "0".repeat(64)));
    expect(wrongDigest.status).toBe(503);
    expect(await wrongDigest.json()).toMatchObject({
      error: { code: "UNIVERSAL_PREPARATION_UNAVAILABLE" },
    });
    expect(proofEvents).toEqual(["PROOF"]);
    expect(await readExactTaskWake(db, wakeId)).toBeNull();
    expect(drainTargeted).not.toHaveBeenCalled();
    proofEvents.length = 0;
    proofState = "ACK_LOST";
    expect((await send()).status).toBe(503);
    expect(proofEvents).toEqual(["PROOF"]);
    expect(await readExactTaskWake(db, wakeId)).toBeNull();
    expect(drainTargeted).not.toHaveBeenCalled();
    proofState = "CURRENT";
    resumeFailure = undefined;
    expect((await send()).status, String(resumeFailure)).toBe(202);
    expect(proofEvents).toEqual(["PROOF", "PROOF", "COMMIT"]);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(drainTargeted).toHaveBeenCalledExactlyOnceWith(batch, taskId);
    const changes = () => sql.prepare("SELECT total_changes() AS n").get();
    const boundChanges = changes();
    expect((await send()).status).toBe(202);
    expect(changes()).toEqual(boundChanges);
    await expect(makeHost(false).claimTargetedMixedBWake(batch, taskId, "fixture"))
      .rejects.toThrow("MIXED_B_TASK_OUTCOME_UNQUALIFIED");
    proofState = "CLOSED";
    await expect(host.claimTargetedMixedBWake(batch, taskId, "fixture"))
      .rejects.toThrow("FIXTURE_SOURCE_CLOSED");
    expect(changes()).toEqual(boundChanges);
    expect(await readExactTaskWake(db, wakeId)).toMatchObject({ status: "PENDING", claimOwner: null });
    proofState = "CURRENT";
    const run = db.runAsync.bind(db);
    const closeDuringClaim = vi.spyOn(db, "runAsync").mockImplementation(
      async (statement, ...parameters) => {
        const result = await run(statement, ...parameters);
        if (/SET status='PROCESSING'/i.test(statement)) configCurrent = false;
        return result;
      },
    );
    try {
      await expect(host.claimTargetedMixedBWake(batch, taskId, "fixture"))
        .rejects.toThrow("FIXTURE_CONFIG_CHANGED");
      expect(await readExactTaskWake(db, wakeId)).toMatchObject({
        status: "PENDING", claimOwner: null, lastAttemptAt: null, leaseExpiresAt: null,
      });
    } finally {
      configCurrent = true;
      closeDuringClaim.mockRestore();
    }
    const second = new DatabaseSync(path);
    try {
      second.exec("PRAGMA foreign_keys=ON");
      const competing = randomUUID();
      const immediate = db.withImmediateTransactionAsync.bind(db);
      const interleave = vi.spyOn(db, "withImmediateTransactionAsync")
        .mockImplementationOnce((work) => {
          expect(proofEvents.slice(-2)).toEqual(["PROOF", "COMMIT"]);
          second.prepare(`
            INSERT INTO sync_operations(
              id,owner_user_id,trip_id,entity_type,entity_id,operation_type,idempotency_key,
              base_version,payload_json,status,attempt_count,created_at,updated_at
            ) SELECT ?,?,trip_id,entity_type,entity_id,operation_type,?,base_version,
                     payload_json,status,attempt_count,created_at,updated_at
              FROM sync_operations WHERE id=?
          `).run(competing, randomUUID(), competing, wakeId);
          return immediate(work);
        });
      try {
        const beforeConflict = changes();
        await expect(host.claimTargetedMixedBWake(batch, taskId, "fixture"))
          .rejects.toThrow("MIXED_B_WAKE_IDENTITY");
        expect(changes()).toEqual(beforeConflict);
        expect(await readExactTaskWake(db, wakeId)).toMatchObject({
          status: "PENDING", claimOwner: null,
        });
      } finally {
        interleave.mockRestore();
        second.prepare("DELETE FROM sync_operations WHERE id=?").run(competing);
      }
    } finally {
      second.close();
    }
    const claimed = await host.claimTargetedMixedBWake(batch, taskId, "fixture");
    expect(claimed?.claim).toEqual({ operationId: wakeId, owner: "fixture", baseVersion: 1 });
    expect(proofEvents.slice(-2)).toEqual(["PROOF", "COMMIT"]);
    const claimingChanges = changes();
    await expect(host.claimTargetedMixedBWake(batch, taskId, "fixture"))
      .rejects.toThrow("MIXED_B_WAKE_STATE");
    expect(changes()).toEqual(claimingChanges);
    expect(await readExactTaskWake(db, wakeId)).toMatchObject({
      status: "PROCESSING", claimOwner: "fixture", baseVersion: 1, attemptCount: 0,
    });
    expect(await readCommitPostimage(path, context, f)).toBe("EXACT_TASK_PRESENT_CONSUMED");
    const attempts = () =>
      sql.prepare("SELECT count(*) AS n FROM intelligence_continuation_attempts").get();
    const accepted = await createIntelligenceContinuationRepository(db, taskDeps(actor)).read(
      context, taskId,
    );
    const execute = vi.spyOn(universalRuntime, "createUniversalBackendRuntime");
    try {
      execute.mockImplementationOnce(async (p) => ({
        status: "CONFIGURED_NOT_ACTIVATED",
        universalImportPort: {
          async execute() {
            proofState = "CLOSED";
            return p!.repository.reserveAttempt(p!.context, p!.attempt, accepted.row_revision);
          },
        } as never,
      }));
      await expect(host.executeQueued(batch, taskId, claimed!.claim))
        .rejects.toThrow("FIXTURE_SOURCE_CLOSED");
      expect(attempts()).toEqual({ n: 0 });
      expect(gateway).not.toHaveBeenCalled();
      proofState = "CURRENT";
      execute.mockImplementationOnce(async (p) => ({
        status: "CONFIGURED_NOT_ACTIVATED",
        universalImportPort: {
          async execute() {
            const a = await p!.repository.reserveAttempt(p!.context, p!.attempt, accepted.row_revision);
            expect(a.execution_observation).toBe("NOT_STARTED");
            await p!.gateway.invoke("universal_activation_reserve_call", {});
            await p!.gateway.invoke("external_integration_mark_dispatch", {});
            const running = await p!.repository.beginExecution(
              p!.context, a.attempt_id, a.row_revision, "START_DURABLE",
            );
            expect(running.execution_observation).toBe("RUNNING");
            await p!.repository.admitExecution(p!.context, running, () => {});
            const sourceFence = await p!.beforeRemoteSend!();
            (await sourceFence.readCurrentClaim())();
            const sendProvider = vi.fn(async () => { throw Error("UNEXPECTED_FIXTURE_SEND"); });
            const { ready } = prepareUniversalDispatch(
              actor,
              batch,
              { version: UNIVERSAL_IMPORT_VERSION, tripId: trip, taskId },
              manifest,
            );
            const providerInput: Parameters<
              ReturnType<typeof createUniversalDeepSeekProvider>["interpret"]
            >[0] = {
              actorId: actor, accountId: actor, tripId: trip, batchId: batch, taskId,
              promptVersion: COMPACT_PROMPT_VERSION,
              instruction: universalInstruction,
              advisoryInstruction: universalAdvisoryInstruction,
              sources: ready.map((source, index) => ({
                index,
                sourceId: source.sourceId,
                mime: source.mime,
                modality: source.modality as "TEXT" | "IMAGE",
                sha256: source.submittedSha256,
                bytes: source.bytes,
              })),
            };
            const credentialCheck = async (afterCredential: () => Promise<unknown>) =>
              createUniversalDeepSeekProvider({
                beforeRemoteSend: p!.beforeRemoteSend,
                send: sendProvider,
                custody: {
                  acquire: async () => ({
                    secret: "fixture-only",
                    async assertCurrent() {
                      await Promise.resolve();
                      await afterCredential();
                    },
                  }),
                  retainResponse: forbidden,
                  settle: forbidden,
                },
              }).interpret(providerInput);
            const other = new DatabaseSync(path);
            try {
              other.exec("PRAGMA foreign_keys=ON");
              const owner = other.prepare("UPDATE sync_operations SET claim_owner=? WHERE id=?");
              await expect(credentialCheck(async () => owner.run("changed-claim", wakeId)))
                .rejects.toThrow("MIXED_B_WAKE_STATE");
              owner.run("fixture", wakeId);
            } finally {
              other.close();
            }
            await expect(credentialCheck(async () => {
              const task = await p!.repository.read(p!.context, taskId);
              return p!.repository.fence(p!.context, taskId, task.row_revision, "CANCELED");
            })).rejects.toThrow("MIXED_B_WAKE_STATE");
            expect(sendProvider).not.toHaveBeenCalled();
            proofState = "CLOSED";
            await p!.beforeRemoteSend!();
            throw Error("FIXTURE_SHOULD_STAY_CLOSED");
          },
        } as never,
      }));
      await expect(host.executeQueued(batch, taskId, claimed!.claim))
        .rejects.toThrow("FIXTURE_SOURCE_CLOSED");
      expect(gateway.mock.calls.map(([kind]) => kind)).toEqual([
        "universal_activation_reserve_call", "external_integration_mark_dispatch",
      ]);
      expect(attempts()).toEqual({ n: 1 });
      const protectedChanges = changes();
      expect((await send()).status).toBe(503);
      await expect(host.claimTargetedMixedBWake(batch, taskId, "fixture"))
        .rejects.toThrow("MIXED_B_TASK_OUTCOME_UNQUALIFIED");
      expect(changes()).toEqual(protectedChanges);
    } finally {
      execute.mockRestore();
    }
  });
});

it.skipIf(!process.env.OTR_C01_FIXTURE_ORDERED)(
  "actual TLS normal original HTTP accepts exact ordered PNG PDF and typed text once",
  async () => {
    const witness = JSON.parse(readFileSync(process.env.OTR_C01_FIXTURE_ORDERED!, "utf8"));
    const initial = mixedBInitialManifestSchema.parse(witness.initial);
    const { actorId: actor, tripId: trip, batchId: batch } = initial;
    const connection = createSourcePgConnection({
      host: "127.0.0.1",
      port: Number(process.env.OTR_C01_FIXTURE_PG_PORT),
      database: "postgres",
      password: "otr-c01-local-fixture",
      ca: readFileSync(process.env.OTR_C01_FIXTURE_PG_CA!, "utf8"),
    });
    await withTaskStore(async (sql) => {
      sql.exec(ddl);
      const owner = createUniversalOriginalSourceConnection(connection, async (bytes) => sha(bytes), {
        pendingPdf: true,
        pendingPng: true,
        mixedBInitial: { manifest: initial, taskDb: sql, assertCurrent() {} },
      });
      const send = (ordinal: number, mode: "acquire" | "result") => universalOriginalSourceBoundary(
        new Request(`http://local/v2/trips/${trip}/universal-source-originals/${mode}`, {
          method: "POST", body: JSON.stringify(witness.commands[ordinal]),
        }),
        actor,
        async (a, t) => a === actor && t === trip,
        owner,
      );
      const ready = () => owner.proveContinuationMixedBTaskAbsent!(actor, trip, batch, mixedBInitialDigest(initial));
      await ready();
      expect((await send(1, "acquire")).status).toBe(503);
      for (const [ordinal, original] of initial.originals.entries()) {
        const response = await send(ordinal, "acquire");
        expect(response.status).toBe(200);
        const receipt = await response.json();
        expect(receipt).toMatchObject({ operation_id: original.operationId, source_id: original.sourceId, outcome: "APPLIED" });
        expect(await (await send(ordinal, "result")).json()).toEqual(receipt);
        expect(await (await send(ordinal, "acquire")).json()).toEqual(receipt);
        expect(sql.prepare("SELECT phase FROM universal_mixed_b_task_reservations WHERE task_id=?").get(initial.taskId))
          .toEqual({ phase: "RESERVED" });
        if (ordinal < 2) await ready();
        if (ordinal === 0) expect((await send(2, "acquire")).status).toBe(409);
      }
      await expect(ready()).rejects.toThrow("UNIVERSAL_SOURCE_RUN_UNAVAILABLE");
      expect(sql.prepare("SELECT count(*) AS n FROM intelligence_continuations").get()).toEqual({ n: 0 });
      expect(sql.prepare("SELECT count(*) AS n FROM sync_operations").get()).toEqual({ n: 0 });
    });
  },
  15000,
);

it.skipIf(!process.env.OTR_C01_FIXTURE_MATERIAL)(
  "actual Source material proof after ambiguous local commit reconstructs the exact original Task",
  async () => {
    const witness = JSON.parse(
      readFileSync(process.env.OTR_C01_FIXTURE_MATERIAL!, "utf8"),
    );
    const initial = mixedBInitialManifestSchema.parse(witness.initial);
    const binding = universalRunBindingSchema.parse(witness.binding);
    const { actorId: actor, tripId: trip, batchId: batch } = initial;
    const manifest = {
      accountId: actor,
      tripId: trip,
      batchId: batch,
      representations: binding.inputs.map((pin) => {
        const ordinal = initial.originals.find(
          (original) => original.inputId === pin.id,
        )!.ordinal;
        return {
          accountId: actor,
          tripId: trip,
          batchId: batch,
          inputId: pin.id,
          sourceId: pin.source_id,
          representationId: pin.representation_id,
          revision: pin.material_revision,
          originalSha256: pin.payload_sha256,
          pdfSource: pin.pdfSource,
          mime: ordinal === 0 ? "image/png" : "text/plain",
          bytes: Buffer.from(witness.bytesByOrdinal[ordinal], "hex"),
        };
      }),
    };
    const selection = {
      integrationId: "synthetic",
      configVersion: 2,
      configurationSha256: "c".repeat(64),
      providerConfigId: randomUUID(),
      priceScheduleId: randomUUID(),
      providerId: "DeepSeek" as const,
      modelId: "deepseek-flash" as const,
      modelVersion: "DeepSeek-V4.1-Flash" as const,
      adapterVersion: "fixture",
      region: "fixture",
      route: "fixture",
      maxCostNanos: "50000000",
      taskLifetimeMs: 600000,
    };
    const draft = await buildUniversalRegisteredTaskDraft(
      binding,
      manifest,
      selection,
      witness.expectedMaterial.expiresAt,
    );
    const f = { reservation: { initial, finalRun: binding }, task: draft.task };
    const port = Number(process.env.OTR_C01_FIXTURE_PG_PORT);
    const ca = readFileSync(process.env.OTR_C01_FIXTURE_PG_CA!, "utf8");
    const config = {
      host: "127.0.0.1",
      port,
      database: "postgres",
      password: "otr-c01-local-fixture",
      ca,
    };
    const connection = createSourcePgConnection(config);
    const admin = new Client({
      host: config.host,
      port,
      database: config.database,
      user: "supabase_admin",
      connectionTimeoutMillis: 3000,
      query_timeout: 5000,
      ssl: { ca, rejectUnauthorized: true },
    });
    await admin.connect();
    try {
      await withTaskStore(async (sql, db, path) => {
        sql.exec(ddl);
        reserveMixedBTask(sql, initial);
        materialCatalogue(sql, f);
        const context = await captureAccountRequestContext(trip, async () => actor);
        const owner = createUniversalOriginalSourceConnection(
          connection,
          async (bytes) => sha(bytes),
          {
            mixedBInitial: {
              manifest: initial,
              taskDb: sql,
              assertCurrent() {},
              expectedMaterial: witness.expectedMaterial,
            },
          },
        );
        const raw = {
          batchId: batch,
          submissionSha256: initial.submissionSha256,
          inputs: witness.inputs,
        };
        const fresh = () =>
          owner.withCurrentMixedBMaterial(raw, binding, async (check) => check);
        const wakeId = draft.attempt.sync_operation_id;
        const scope = {
          db,
          repository: (connection = db) =>
            createIntelligenceContinuationRepository(connection, taskDeps(actor)),
          context,
          reservation: f.reservation,
          task: f.task,
          expectedWakeId: wakeId,
          now: () => new Date().toISOString(),
        };
        const noTaskProof = await fresh();
        await expect(
          recoverMixedBTaskWake({ ...scope, assertCurrent: noTaskProof }),
        ).rejects.toThrow("MIXED_B_TASK_NOT_CONSUMED");
        expect(await readCommitPostimage(path, context, f)).toBe(
          "EXACT_RESERVED_NO_TASK",
        );
        let lockReleased = false;
        await expect(
          connection.withLease(async (lease) => {
            await lease.query("BEGIN");
            const id = (await lease.query("SELECT pg_backend_pid() AS id")).rows[0].id;
            await lease.query("SELECT pg_advisory_xact_lock(714131::bigint)");
            const run = db.runAsync.bind(db);
            const cut = vi
              .spyOn(db, "runAsync")
              .mockImplementation(async (q, ...parameters) => {
                const result = await run(q, ...parameters);
                if (/INSERT INTO intelligence_continuations/i.test(q)) {
                  expect(
                    (
                      await admin.query(
                        "SELECT pg_terminate_backend($1::int,1000) AS killed",
                        [id],
                      )
                    ).rows[0].killed,
                  ).toBe(true);
                  expect(
                    (
                      await admin.query(
                        "SELECT pg_try_advisory_xact_lock(714131::bigint) AS free",
                      )
                    ).rows[0].free,
                  ).toBe(true);
                  lockReleased = true;
                }
                return result;
              });
            try {
              await createReservedMixedBTask(
                db,
                taskDeps(actor),
                context,
                f.task,
                f.reservation,
                () => {},
                () => {},
              );
            } finally {
              cut.mockRestore();
            }
            await lease.query("COMMIT");
          }),
        ).rejects.toThrow(/RETIRED|terminating|closed/i);
        expect(lockReleased).toBe(true);
        expect(await readCommitPostimage(path, context, f)).toBe(
          "EXACT_TASK_PRESENT_CONSUMED",
        );
        // The callback only returns a guard. The owning proof commits before local work.
        const assertFresh = await fresh();
        assertFresh();
        const rebuilt = await buildUniversalRegisteredTaskDraft(
          binding,
          manifest,
          selection,
          witness.expectedMaterial.expiresAt,
        );
        expect(rebuilt.task).toEqual(f.task);
        expect(rebuilt.attempt.sync_operation_id).toBe(draft.attempt.sync_operation_id);
        expect(await readCommitPostimage(path, context, f)).toBe(
          "EXACT_TASK_PRESENT_CONSUMED",
        );
        const queueCount = () =>
          sql.prepare("SELECT count(*) AS n FROM sync_operations").get();
        expect(queueCount()).toEqual({ n: 0 });
        const stalePins = structuredClone(raw.inputs);
        stalePins[0].observed_source_row_revision++;
        await expect(
          owner.withCurrentMixedBMaterial(
            { ...raw, inputs: stalePins },
            binding,
            async () => {},
          ),
        ).rejects.toThrow();
        await expect(
          owner.withCurrentMixedBMaterial(
            { ...raw, batchId: randomUUID() },
            binding,
            async () => {},
          ),
        ).rejects.toThrow("MIXED_B_MATERIAL_BINDING");
        expect(queueCount()).toEqual({ n: 0 });
        const mismatch = await fresh();
        await expect(
          recoverMixedBTaskWake({
            ...scope,
            task: { ...f.task, logical_request_id: randomUUID() },
            assertCurrent: mismatch,
          }),
        ).rejects.toThrow("MIXED_B_TASK_BINDING");
        const activeSource = await fresh();
        const taskDeadline = Date.parse(f.task.policy_snapshot.deadline!);
        expect(taskDeadline).toBeLessThan(Date.parse(witness.expectedMaterial.expiresAt));
        const clock = vi.spyOn(Date, "now").mockReturnValue(taskDeadline + 1);
        try {
          activeSource();
          await expect(
            recoverMixedBTaskWake({ ...scope, assertCurrent: activeSource }),
          ).rejects.toThrow("MIXED_B_TASK_WINDOW_CLOSED");
        } finally {
          clock.mockRestore();
        }
        expect(queueCount()).toEqual({ n: 0 });

        const read = db.getAllAsync.bind(db);
        const immediate = db.withImmediateTransactionAsync.bind(db);
        let writing = false;
        let sawWriterHead = false;
        const writer = vi
          .spyOn(db, "withImmediateTransactionAsync")
          .mockImplementation((work) =>
            immediate(async () => {
              writing = true;
              try {
                await work();
              } finally {
                writing = false;
              }
            }),
          );
        const replaceHead = vi
          .spyOn(db, "getAllAsync")
          .mockImplementation(async (query, ...parameters) => {
            const rows = await read<Record<string, unknown>>(query, ...parameters);
            if (
              rows.length === 1 &&
              writing &&
              query === "SELECT * FROM intelligence_continuations WHERE task_id=? OR import_id=? LIMIT 2"
            ) {
              sawWriterHead = true;
              return [{ ...rows[0], logical_request_id: randomUUID() }];
            }
            return rows;
          });
        const earlyWrite = vi.spyOn(db, "runAsync");
        const mismatchInWriter = await fresh();
        try {
          await expect(
            recoverMixedBTaskWake({ ...scope, assertCurrent: mismatchInWriter }),
          ).rejects.toThrow("MIXED_B_TASK_BINDING");
          expect(sawWriterHead).toBe(true);
          expect(earlyWrite).not.toHaveBeenCalled();
        } finally {
          writer.mockRestore();
          replaceHead.mockRestore();
          earlyWrite.mockRestore();
        }
        expect(queueCount()).toEqual({ n: 0 });
        const run = db.runAsync.bind(db);
        const delay = vi
          .spyOn(db, "runAsync")
          .mockImplementation(async (q, ...params) => {
            const result = await run(q, ...params);
            if (/INSERT INTO sync_operations/i.test(q))
              await new Promise<void>((resolve) => setTimeout(resolve, 1050));
            return result;
          });
        const expiring = await fresh();
        try {
          await expect(
            recoverMixedBTaskWake({ ...scope, assertCurrent: expiring }),
          ).rejects.toThrow("MIXED_B_MATERIAL_WINDOW_CLOSED");
        } finally {
          delay.mockRestore();
        }
        expect(queueCount()).toEqual({ n: 0 });
        expect(
          (await scope.repository().read(context, initial.taskId)).sync_operation_id,
        ).toBeNull();
        let configCurrent = true;
        const finiteBatch = universalProviderBatchContext(actor, trip, raw);
        const owningRead = createUniversalBatchSource({
          enabled: true,
          finiteBatch,
          connection,
          async authorize(a, t) {
            expect([a, t]).toEqual([actor, trip]);
          },
        });
        const makeHost = (
          forward: boolean,
          materialInputSha256 = witness.expectedMaterial.inputSha256,
        ) =>
          createUniversalContinuousHost({
            enabled: true,
            context,
            finiteBatch,
            finiteDeadline: witness.expectedMaterial.expiresAt,
            ...(forward
              ? {
                  mixedBInitial: initial,
                  mixedBForwardRecovery: {
                    taskDatabase: sql,
                    materialInputSha256,
                    assertConfigCurrent() {
                      if (!configCurrent) throw Error("MIXED_B_FORWARD_CONFIG_CHANGED");
                    },
                  },
                }
              : {}),
            db,
            assertCurrentAuth: async () => {},
            assertNewExecutionAllowed() {},
            catalogConnection: { withLease: forbidden },
            bootstrapLedger: forbidden,
            selectProvider: async () => selection,
            runtime: {
              stores: {} as never,
              sourceConnection: connection,
              taskReceiptConnection: { withLease: forbidden },
              gateway: { invoke: forbidden },
              readBinary: forbidden,
              environment: () => undefined,
            },
            readAdmittedPrice: forbidden,
            publishedSource: {
              lookup: owningRead.lookup,
              readManifest: async () => manifest,
            },
          });
        const forward = makeHost(true);
        const drainTargeted = vi.fn(async (_batch: string, _task: string) => {});
        const send = (host = forward, task = initial.taskId, allowed = true) =>
          universalPrepareBoundary(
            new Request(`http://local/v2/import-batches/${batch}/interpretations/prepare`, {
              method: "POST",
              headers: { "Idempotency-Key": task },
              body: JSON.stringify({
                version: "otr.backend.universal-resume/1",
                batchId: batch,
                tripId: trip,
                taskId: task,
              }),
            }),
            actor,
            async (a, t) => allowed && a === actor && t === trip,
            (t, input) =>
              prepareUniversalQueuedRuntime(actor, t, input, {
                resume: (_trip, batch, task) => host.resume(batch, task),
                prepare: forbidden,
                drainTargeted,
              }),
          );
        expect((await send(makeHost(false))).status).toBe(503);
        expect((await send(makeHost(true, "0".repeat(64)))).status).toBe(503);
        expect((await send(forward, randomUUID())).status).toBe(503);
        expect((await send(forward, initial.taskId, false)).status).toBe(404);
        expect(drainTargeted).not.toHaveBeenCalled();
        expect(queueCount()).toEqual({ n: 0 });
        const positive = await send();
        expect(positive.status).toBe(202);
        expect(await positive.json()).toMatchObject({
          status: "EXISTING",
          context: { accountId: actor, tripId: trip, batchId: batch, taskId: initial.taskId },
        });
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(drainTargeted).toHaveBeenCalledOnce();
        expect(drainTargeted).toHaveBeenCalledWith(batch, initial.taskId);
        const bound = await scope.repository().read(context, initial.taskId);
        expect(bound.sync_operation_id).toBe(wakeId);
        expect(queueCount()).toEqual({ n: 1 });
        expect(await readExactTaskWake(db, wakeId)).toMatchObject({
          status: "PENDING",
          attemptCount: 0,
          baseVersion: 1,
        });
        const changes = () => sql.prepare("SELECT total_changes() AS n").get();
        const boundChanges = changes();
        expect((await send()).status).toBe(202);
        expect(changes()).toEqual(boundChanges);
        const replay = await fresh();
        expect(await recoverMixedBTaskWake({ ...scope, assertCurrent: replay })).toEqual(
          bound,
        );
        expect(changes()).toEqual(boundChanges);
        expect(await readCommitPostimage(path, context, f)).toBe(
          "EXACT_TASK_PRESENT_CONSUMED",
        );
        for (const owner of [actor, randomUUID()]) {
          const competing = randomUUID();
          sql
            .prepare(
              `INSERT INTO sync_operations(
            id,owner_user_id,trip_id,entity_type,entity_id,operation_type,idempotency_key,
            base_version,payload_json,status,attempt_count,created_at,updated_at
          ) SELECT ?,?,trip_id,entity_type,entity_id,operation_type,?,base_version,
                   payload_json,status,attempt_count,created_at,updated_at
            FROM sync_operations WHERE id=?`,
            )
            .run(competing, owner, competing, wakeId);
          const beforeConflict = changes();
          const conflicted = await fresh();
          await expect(
            recoverMixedBTaskWake({ ...scope, assertCurrent: conflicted }),
          ).rejects.toThrow("MIXED_B_WAKE_IDENTITY");
          expect(changes()).toEqual(beforeConflict);
          sql.prepare("DELETE FROM sync_operations WHERE id=?").run(competing);
        }

        const repository = createIntelligenceContinuationRepository(db, {
          ...taskDeps(actor),
          now: () => new Date().toISOString(),
          async validateAttemptAdmission(task, attempt, predecessor) {
            expect(task.task_id).toBe(initial.taskId);
            expect(attempt).toEqual(draft.attempt);
            expect(predecessor).toBeNull();
          },
        });
        await expect(
          makeHost(false).claimTargetedMixedBWake(batch, initial.taskId, "fixture"),
        ).rejects.toThrow("MIXED_B_TASK_OUTCOME_UNQUALIFIED");
        configCurrent = false;
        await expect(
          forward.claimTargetedMixedBWake(batch, initial.taskId, "fixture"),
        ).rejects.toThrow("MIXED_B_FORWARD_CONFIG_CHANGED");
        configCurrent = true;
        const beforeExpiry = changes();
        const { rows: saved } = await admin.query(
          "SELECT expires_at::text AS expires_at FROM trip_source_universal_scope",
        );
        await admin.query(
          "UPDATE trip_source_universal_scope SET expires_at=clock_timestamp()-interval '1 second'",
        );
        try {
          await expect(
            forward.claimTargetedMixedBWake(batch, initial.taskId, "fixture"),
          ).rejects.toThrow();
          expect(changes()).toEqual(beforeExpiry);
        } finally {
          await admin.query("UPDATE trip_source_universal_scope SET expires_at=$1", [
            saved[0].expires_at,
          ]);
        }
        const second = new DatabaseSync(path);
        try {
          second.exec("PRAGMA foreign_keys=ON");
          const competing = randomUUID();
          const interleave = vi
            .spyOn(db, "withImmediateTransactionAsync")
            .mockImplementationOnce((work) => {
              second.prepare(`
                INSERT INTO sync_operations(
                  id,owner_user_id,trip_id,entity_type,entity_id,operation_type,idempotency_key,
                  base_version,payload_json,status,attempt_count,created_at,updated_at
                ) SELECT ?,?,trip_id,entity_type,entity_id,operation_type,?,base_version,
                         payload_json,status,attempt_count,created_at,updated_at
                  FROM sync_operations WHERE id=?
              `).run(competing, randomUUID(), competing, wakeId);
              return immediate(work);
            });
          try {
            await expect(
              forward.claimTargetedMixedBWake(batch, initial.taskId, "fixture"),
            ).rejects.toThrow("MIXED_B_WAKE_IDENTITY");
            expect(interleave).toHaveBeenCalledOnce();
            expect(changes()).toEqual(beforeExpiry);
            expect(await readExactTaskWake(db, wakeId)).toMatchObject({
              status: "PENDING",
              claimOwner: null,
            });
          } finally {
            interleave.mockRestore();
            second.prepare("DELETE FROM sync_operations WHERE id=?").run(competing);
          }
        } finally {
          second.close();
        }
        const claimed = await forward.claimTargetedMixedBWake(batch, initial.taskId, "fixture");
        expect(claimed?.claim).toEqual({ operationId: wakeId, owner: "fixture", baseVersion: 1 });
        expect(await readExactTaskWake(db, wakeId)).toMatchObject({
          status: "PROCESSING",
          claimOwner: "fixture",
          attemptCount: 0,
        });
        const beforeRepeatedClaim = changes();
        await expect(
          forward.claimTargetedMixedBWake(batch, initial.taskId, "fixture"),
        ).rejects.toThrow("MIXED_B_WAKE_STATE");
        expect(changes()).toEqual(beforeRepeatedClaim);
        const attempt = await repository.reserveAttempt(
          context,
          draft.attempt,
          bound.row_revision,
        );
        const reserved = await fresh();
        await db.withTransactionAsync(async () => {
          await assertMixedBClaimCurrent({ ...scope, assertCurrent: reserved }, claimed!.claim, {
            expected: draft.attempt,
            phase: "RESERVED",
          });
        });
        const running = await repository.beginExecution(
          context, attempt.attempt_id, attempt.row_revision, "START_DURABLE",
        );
        const beforeSend = await fresh();
        await db.withTransactionAsync(async () => {
          await assertMixedBClaimCurrent({ ...scope, assertCurrent: beforeSend }, claimed!.claim, {
            expected: draft.attempt,
            phase: "RUNNING",
          });
        });
        await repository.observeAttempt(
          context,
          running.attempt_id,
          running.row_revision,
          {
            execution_observation: "UNKNOWN",
            execution_outcome: null,
            metering_disposition: "START_PENDING",
            response_material_reference: null,
            response_material_sha256: null,
            response_sha256: null,
            reported_usage_summary: null,
          },
        );
        const unknownChanges = changes();
        expect((await send()).status).toBe(503);
        await expect(
          forward.claimTargetedMixedBWake(batch, initial.taskId, "fixture"),
        ).rejects.toThrow("MIXED_B_TASK_OUTCOME_UNQUALIFIED");
        await expect(
          forward.executeQueued(batch, initial.taskId, claimed!.claim),
        ).rejects.toThrow("MIXED_B_TASK_OUTCOME_UNQUALIFIED");
        const unknown = await fresh();
        await expect(
          recoverMixedBTaskWake({ ...scope, assertCurrent: unknown }),
        ).rejects.toThrow("MIXED_B_TASK_ATTEMPT_REQUIRES_DISPOSITION");
        expect(changes()).toEqual(unknownChanges);
        expect(queueCount()).toEqual({ n: 1 });
      });
      // A second empty Task store exercises the normal fresh route on the same synthetic PG scope.
      await admin.query("DELETE FROM trip_source_inputs WHERE run_id=$1", [binding.runId]);
      await admin.query("DELETE FROM trip_source_runs WHERE id=$1", [binding.runId]);
      await withTaskStore(async (sql, db, path) => {
        sql.exec(ddl);
        reserveMixedBTask(sql, initial);
        materialCatalogue(sql, f);
        const context = await captureAccountRequestContext(trip, async () => actor);
        const raw = { batchId: batch, submissionSha256: initial.submissionSha256, inputs: witness.inputs };
        const finiteBatch = universalProviderBatchContext(actor, trip, raw);
        const owningRead = createUniversalBatchSource({
          enabled: true, finiteBatch, connection, authorize: async () => {},
        });
        const host = createUniversalContinuousHost({
          enabled: true, context, finiteBatch,
          finiteDeadline: witness.expectedMaterial.expiresAt,
          mixedBInitial: initial,
          mixedBForwardRecovery: {
            taskDatabase: sql,
            materialInputSha256: witness.expectedMaterial.inputSha256,
            assertConfigCurrent() {},
          },
          db,
          assertCurrentAuth: async () => {},
          assertNewExecutionAllowed() {},
          catalogConnection: { withLease: forbidden },
          bootstrapLedger: async () => ({
            journey: { id: trip, title: "Fixture", startDate: null, endDate: null,
              settlementCurrency: "NZD", settlementScale: 2,
              valuationPolicy: "REFERENCE_RATE", updatedAt: binding.createdAt },
            members: [], households: [], expenses: [], corrections: [], rateQuotes: [],
            actor: { userId: actor, memberId: null, role: "owner", capabilities: {
              canRead: true, canCreateExpense: false, canEditOwnExpense: false,
              canCorrectAnyExpense: false, canSuggestCorrection: false,
              canResolveOwnExpenseConflict: false, canAddOwnPaymentEvidence: false,
              canManageExpenseValuation: false, canManageLedgerValuationPolicy: false,
            }},
            cursor: null, serverTime: binding.createdAt,
          }),
          selectProvider: async () => selection,
          runtime: {
            stores: {} as never, sourceConnection: connection,
            taskReceiptConnection: { withLease: forbidden }, gateway: { invoke: forbidden },
            readBinary: forbidden, environment: () => undefined,
          },
          readAdmittedPrice: forbidden,
          publishedSource: { lookup: owningRead.lookup, readManifest: async () => manifest },
        });
        const catalog = vi.spyOn(universalCatalog, "readUniversalCatalog")
          .mockResolvedValueOnce(JSON.stringify({
            version: 2, actor_account_id: actor, trip_id: trip,
            ...Object.fromEntries(Object.keys(tripImportCatalogSchemas).map((key) => [key, []])),
          }));
        const drainTargeted = vi.fn(async () => {});
        let failure: unknown;
        const sendPrepare = () => universalPrepareBoundary(
          new Request(`http://local/v2/import-batches/${batch}/interpretations/prepare`, {
            method: "POST", headers: { "Idempotency-Key": batch },
            body: JSON.stringify({ tripId: trip, ...raw }),
          }),
          actor,
          async (a, t) => a === actor && t === trip,
          (t, input) => prepareUniversalQueuedRuntime(actor, t, input, {
            resume: forbidden,
            async prepare(_t, value) {
              const { tripId: _t2, ...input } = universalBatchPrepareSchema.parse(value);
              try { return await host.prepare(input); }
              catch (error) { failure = error; throw error; }
            },
            drainTargeted,
          }),
        );
        const immediate = db.withImmediateTransactionAsync.bind(db);
        const cut = vi.spyOn(db, "withImmediateTransactionAsync").mockImplementation(async (work) => {
          await immediate(work);
          const reader = new DatabaseSync(path, { readOnly: true });
          try {
            const reservation = reader.prepare("SELECT phase,run_begin_material_sha256 FROM universal_mixed_b_task_reservations WHERE task_id=?").get(initial.taskId);
            expect(reservation?.run_begin_material_sha256).toBe(witness.expectedMaterial.inputSha256);
            if (reservation?.phase === "RESERVED") return;
            expect(reservation?.phase).toBe("CONSUMED");
            expect(reader.prepare("SELECT sync_operation_id FROM intelligence_continuations WHERE task_id=?")
              .get(initial.taskId)).toEqual({ sync_operation_id: null });
            expect(reader.prepare("SELECT count(*) AS n FROM sync_operations").get()).toEqual({ n: 0 });
          } finally {
            reader.close();
          }
          throw Error("FIXTURE_ACTUAL_SQLITE_ACK_LOST");
        });
        try {
          expect(await owningRead.lookup(actor, trip, batch)).toBeNull();
          const ready = await universalBoundary(
            new Request(`http://local/v2/import-batches/${batch}/interpretations?tripId=${trip}&materialReady=1`),
            actor, async (a, t) => a === actor && t === trip,
            { readMaterialReady: (_actor, id) => host.readMaterialReady(id), readContext: forbidden, execute: forbidden, read: forbidden },
          );
          expect(ready.status).toBe(200);
          expect(await ready.json()).toMatchObject({
            version: "otr.backend.universal-material-ready/1", state: "MATERIAL_READY_NO_TASK",
            accountId: actor, actorId: actor, prepare: { tripId: trip, batchId: batch, inputs: finiteBatch.inputs },
          });
          expect(await readMixedBRunBeginState(db, initial)).toBeNull();
          expect((await sendPrepare()).status).toBe(503);
          expect(String(failure)).toContain("FIXTURE_ACTUAL_SQLITE_ACK_LOST");
          expect(cut).toHaveBeenCalledTimes(2);
          cut.mockRestore();
          expect(drainTargeted).not.toHaveBeenCalled();
          const actual = await owningRead.lookup(actor, trip, batch);
          expect(actual).toMatchObject({ runId: initial.runId, taskId: initial.taskId });
          expect((await admin.query("SELECT count(*)::int AS n FROM trip_source_inputs WHERE run_id=$1", [binding.runId])).rows[0].n).toBe(3);
          const stage = await buildUniversalRegisteredTaskDraft(actual!, manifest, selection, witness.expectedMaterial.expiresAt);
          expect(await readCommitPostimage(path, context, { reservation: { initial, finalRun: actual! }, task: stage.task }))
            .toBe("EXACT_TASK_PRESENT_CONSUMED");
          const changes = sql.prepare("SELECT total_changes() AS n").get();
          expect((await host.prepare(raw)).status).toBe("EXISTING");
          expect(sql.prepare("SELECT total_changes() AS n").get()).toEqual(changes);
          expect(await readExactTaskWake(db, stage.attempt.sync_operation_id)).toBeNull();
          await host.resume(batch, initial.taskId);
          expect(await readExactTaskWake(db, stage.attempt.sync_operation_id))
            .toMatchObject({ status: "PENDING", attemptCount: 0 });
          expect(sql.prepare("SELECT count(*) AS n FROM sync_operations").get()).toEqual({ n: 1 });
          console.info("FIXTURE_TLS_FIRST_PREPARE_SAME_RUN_TASK_NO_WAKE_ON_COMMIT_UNKNOWN_PASS");
        } finally {
          cut.mockRestore();
          catalog.mockRestore();
        }
      });
    } finally {
      await admin.end();
    }
  },
  20000,
);
