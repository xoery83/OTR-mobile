import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { AccountRequestContext } from "../../src/data/auth/accountRequestContext";
import {
  createIntelligenceContinuationRepository,
  type ContinuationDatabase,
} from "../../src/data/repositories/intelligenceContinuationRepository";
import {
  attemptJsonColumns,
  attemptMutableColumns,
  attemptSchema,
  taskJsonColumns,
  taskMutableColumns,
  taskSchema,
  type Attempt,
  type Task,
} from "../../src/domain/intelligence/persistence";
import {
  createIntelligenceWakeQueue,
  intelligenceWakeIdentity,
  signalIntelligenceWake,
  validateIntelligenceWake,
  type SyncOperation,
} from "../../src/data/sync/syncOperationRepository";
import { canonicalEventJson, type Json } from "../../src/domain/trip/eventIntentJson";
import {
  universalBatchIdentity,
  universalRunBindingSchema,
} from "./universalBatchSource";

const sha = z.string().regex(/^[0-9a-f]{64}$/);
const uuid = z.uuid();
const original = z.strictObject({
  inputId: uuid,
  sourceId: uuid,
  originalRepresentationId: uuid,
  byteCount: z.number().int().positive().max(4194304),
  sha256: sha,
  operationId: uuid,
  operationKey: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
  operationSha256: sha,
});

// Server-owned exact enrollment input only. This schema is not a Source absence proof.
export const mixedBInitialManifestSchema = z
  .strictObject({
    version: z.literal("otr.import.mixed-b-initial/1"),
    actorId: uuid,
    tripId: uuid,
    batchId: uuid,
    submissionSha256: sha,
    runId: uuid,
    taskId: uuid,
    originals: z.tuple([
      original.extend({
        ordinal: z.literal(0),
        profile: z.literal("OTR_PNG_CAPTURE_ORIGINAL_V1"),
      }),
      original.extend({
        ordinal: z.literal(1),
        profile: z.literal("OTR_PDF_CAPTURE_ORIGINAL_V1"),
      }),
      original.extend({
        ordinal: z.literal(2),
        profile: z.literal("OTR_SUBMITTED_TEXT_V1"),
        byteCount: z.number().int().positive().max(262144),
      }),
    ]),
  })
  .superRefine((initial, ctx) => {
    const { actorId, tripId, batchId, runId, taskId, originals } = initial;
    if (
      runId !== universalBatchIdentity(actorId, tripId, batchId, "run") ||
      taskId !== universalBatchIdentity(actorId, tripId, batchId, "task") ||
      (
        [
          "inputId",
          "sourceId",
          "originalRepresentationId",
          "operationId",
          "operationKey",
        ] as const
      ).some((key) => new Set(originals.map((pin) => pin[key])).size !== originals.length)
    )
      ctx.addIssue({ code: "custom", message: "MIXED_B_INITIAL_BINDING" });
  });
export type MixedBInitialManifest = z.infer<typeof mixedBInitialManifestSchema>;
export type MixedBTaskReservation = Readonly<{
  initial: MixedBInitialManifest;
  // The existing owning Run result after FINAL receipt/material reconciliation.
  finalRun: z.infer<typeof universalRunBindingSchema>;
}>;
type TaskDb = ContinuationDatabase & {
  isInTransactionAsync(): Promise<boolean>;
  withImmediateTransactionAsync(work: () => Promise<void>): Promise<void>;
};

export function assertTaskForeignKeys(sql: DatabaseSync) {
  if (sql.prepare("PRAGMA foreign_keys").get()?.foreign_keys !== 1)
    throw Error("UNIVERSAL_TASK_FOREIGN_KEYS_REQUIRED");
}
const digest = (value: Json) =>
  createHash("sha256").update(canonicalEventJson(value)).digest("hex");
export function mixedBInitialDigest(initial: MixedBInitialManifest) {
  return createHash("sha256")
    .update("otr.import.mixed-b-initial/1\n")
    .update(canonicalEventJson(initial as Json))
    .digest("hex");
}
const fields = (initial: MixedBInitialManifest) => [
  initial.taskId,
  initial.actorId,
  initial.tripId,
  initial.batchId,
  initial.runId,
  initial.submissionSha256,
  mixedBInitialDigest(initial),
];
const exact =
  "task_id=? AND account_id=? AND trip_id=? AND batch_id=? AND run_id=? AND submission_sha256=? AND initial_manifest_sha256=?";

// One exact snapshot covers the reservation and every task-side mutation seam.
export async function readMixedBRunBeginState(db: ContinuationDatabase, initial: MixedBInitialManifest) {
  const wakeId = await intelligenceWakeIdentity({
    version: 1, account_id: initial.actorId, task_id: initial.taskId,
    expected_publication_fence: 1, wake_reason: "REEVALUATE",
  }, async (bytes) => createHash("sha256").update(bytes).digest("hex"));
  const row = await db.getFirstAsync<{ run_begin_material_sha256: string | null }>(
    `SELECT run_begin_material_sha256 FROM universal_mixed_b_task_reservations WHERE ${exact} AND phase='RESERVED'
     AND NOT EXISTS(SELECT 1 FROM universal_mixed_b_task_reservations r WHERE r.batch_id=? AND r.task_id<>?)
     AND NOT EXISTS(SELECT 1 FROM intelligence_continuations WHERE task_id=? OR import_id=?)
     AND NOT EXISTS(SELECT 1 FROM intelligence_continuation_attempts WHERE task_id=?)
     AND NOT EXISTS(SELECT 1 FROM sync_operations WHERE id=? OR (entity_type='INTELLIGENCE_CONTINUATION' AND entity_id=?))`,
    ...fields(initial), initial.batchId, initial.taskId, initial.taskId, initial.batchId, initial.taskId, wakeId, initial.taskId,
  );
  if (!row) throw Error("MIXED_B_TASK_FENCE");
  return row.run_begin_material_sha256;
}

export async function spendMixedBRunBegin(
  db: TaskDb,
  initial: MixedBInitialManifest,
  materialInputSha256: string,
  assertCurrent: () => void,
) {
  const material = sha.parse(materialInputSha256);
  await db.withImmediateTransactionAsync(async () => {
    assertCurrent();
    if ((await readMixedBRunBeginState(db, initial)) !== null)
      throw Error("MIXED_B_RUN_BEGIN_OUTCOME_UNQUALIFIED");
    const changed = await db.runAsync(
      `UPDATE universal_mixed_b_task_reservations SET run_begin_material_sha256=?
       WHERE ${exact} AND phase='RESERVED' AND run_begin_material_sha256 IS NULL`,
      material, ...fields(initial),
    );
    if (changed.changes !== 1) throw Error("MIXED_B_RUN_BEGIN_OUTCOME_UNQUALIFIED");
    assertCurrent();
  });
  assertCurrent();
}

export async function readProtectedMixedBReservation(
  db: ContinuationDatabase,
  batch: string | null,
  taskId: string,
) {
  const installed = await db.getFirstAsync<{ present: number }>(
    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='universal_mixed_b_task_reservations') AS present",
  );
  if (installed?.present === 0) return null;
  if (installed?.present !== 1) throw Error("MIXED_B_RESERVATION_UNAVAILABLE");
  const rows = await db.getAllAsync<{
    account_id: string;
    trip_id: string;
    task_id: string;
    batch_id: string;
  }>(
    "SELECT account_id,trip_id,task_id,batch_id FROM universal_mixed_b_task_reservations WHERE batch_id=? OR task_id=? LIMIT 2",
    batch,
    taskId,
  );
  if (rows.length > 1) throw Error("MIXED_B_INITIAL_BINDING");
  return rows[0] ?? null;
}

// Call only after owning Source proves pristine and while its actual fence is held.
// The short local transaction ends before any Source I/O. Existing reservations never re-arm.
export function reserveMixedBTask(sql: DatabaseSync, raw: MixedBInitialManifest) {
  const initial = mixedBInitialManifestSchema.parse(raw);
  assertTaskForeignKeys(sql);
  sql.exec("BEGIN IMMEDIATE");
  try {
    if (
      sql
        .prepare(
          "SELECT EXISTS(SELECT 1 FROM intelligence_continuations WHERE task_id=?) AS present",
        )
        .get(initial.taskId)?.present !== 0
    )
      throw Error("MIXED_B_TASK_COLLISION");
    sql
      .prepare(
        "INSERT INTO universal_mixed_b_task_reservations(task_id,account_id,trip_id,batch_id,run_id,submission_sha256,initial_manifest_sha256,phase) VALUES(?,?,?,?,?,?,?,'RESERVED')",
      )
      .run(...fields(initial));
    sql.exec("COMMIT");
  } catch (error) {
    try {
      sql.exec("ROLLBACK");
    } catch {
      /* Retain the first failure for exact readback. */
    }
    throw error;
  }
}

async function phase(db: TaskDb, initial: MixedBInitialManifest) {
  return (
    await db.getFirstAsync<{ phase: string }>(
      `SELECT phase FROM universal_mixed_b_task_reservations WHERE ${exact}`,
      ...fields(initial),
    )
  )?.phase;
}

async function checkedReservation(db: TaskDb, raw: MixedBTaskReservation, task: Task) {
  const initial = mixedBInitialManifestSchema.parse(raw.initial);
  const run = universalRunBindingSchema.parse(raw.finalRun);
  if (
    run.actorId !== initial.actorId ||
    run.tripId !== initial.tripId ||
    run.batchId !== initial.batchId ||
    run.runId !== initial.runId ||
    run.taskId !== initial.taskId ||
    run.submissionSha256 !== initial.submissionSha256 ||
    task.account_id !== run.actorId ||
    task.trip_id !== run.tripId ||
    task.import_id !== run.batchId ||
    task.run_id !== run.runId ||
    task.task_id !== run.taskId ||
    task.manifest_sha256 !== run.submissionSha256 ||
    task.expected_run_generation !== run.generation ||
    task.stage !== "INTERPRETATION" ||
    run.inputs.length !== initial.originals.length ||
    task.input_pins.length !== run.inputs.length
  )
    throw Error("MIXED_B_TASK_BINDING");
  for (const [i, pin] of run.inputs.entries()) {
    const expected = initial.originals.find((original) => original.inputId === pin.id);
    const taskPin = task.input_pins[i];
    if (
      !expected ||
      pin.source_id !== expected.sourceId ||
      (expected.profile === "OTR_PDF_CAPTURE_ORIGINAL_V1"
        ? pin.pdfSource?.original.representationId !==
            expected.originalRepresentationId ||
          pin.pdfSource.original.sha256 !== expected.sha256 ||
          pin.pdfSource.original.byteCount !== expected.byteCount
        : pin.pdfSource !== undefined ||
          pin.representation_id !== expected.originalRepresentationId ||
          pin.payload_sha256 !== expected.sha256 ||
          pin.byte_count !== expected.byteCount) ||
      taskPin.kind !== "SOURCE" ||
      taskPin.input_id !== pin.id ||
      taskPin.source_id !== pin.source_id ||
      taskPin.representation_id !== pin.representation_id ||
      taskPin.material_revision !== pin.material_revision ||
      taskPin.payload_sha256 !== pin.payload_sha256 ||
      taskPin.byte_count !== pin.byte_count ||
      taskPin.transform_sha256 !== (pin.pdfSource?.transformOptionsSha256 ?? null)
    )
      throw Error("MIXED_B_TASK_MATERIAL");
  }
  if (
    task.input_sha256 !== digest(task.input_pins as Json) ||
    task.input_sha256 === mixedBInitialDigest(initial)
  )
    throw Error("MIXED_B_TASK_MATERIAL");
  const state = await phase(db, initial);
  if (state !== "RESERVED" && state !== "CONSUMED")
    throw Error("MIXED_B_TASK_RESERVATION_UNAVAILABLE");
  return { initial, state };
}

export async function assertMixedBTaskReserved(
  db: TaskDb,
  reservation: MixedBTaskReservation,
  task: Task,
) {
  const { initial, state } = await checkedReservation(db, reservation, task);
  if (state === "CONSUMED") throw Error("MIXED_B_TASK_CONSUMED");
  return initial;
}

export async function mixedBTaskReservationState(
  db: TaskDb,
  reservation: MixedBTaskReservation,
  task: Task,
) {
  return (await checkedReservation(db, reservation, task)).state;
}

export async function createReservedMixedBTask(
  db: TaskDb,
  deps: Parameters<typeof createIntelligenceContinuationRepository>[1],
  context: AccountRequestContext,
  task: Task,
  reservation: MixedBTaskReservation,
  assertLockedCurrent: () => void,
  assertTaskCurrent: () => void,
) {
  const assertCurrent = () => {
    assertLockedCurrent();
    assertTaskCurrent();
  };
  assertCurrent();
  const initial = await assertMixedBTaskReserved(db, reservation, task);
  const createOnlyDb: ContinuationDatabase = {
    ...db,
    withTransactionAsync(work) {
      // Use the owning create transaction and validate its trigger postimage before commit.
      return db.withImmediateTransactionAsync(async () => {
        assertCurrent();
        const scope = await readProtectedMixedBReservation(db, initial.batchId, initial.taskId);
        const collision = await db.getFirstAsync<{ present: number }>(
          "SELECT EXISTS(SELECT 1 FROM intelligence_continuations WHERE task_id=? OR import_id=?) AS present",
          initial.taskId,
          initial.batchId,
        );
        if (scope?.task_id !== initial.taskId || collision?.present !== 0)
          throw Error("MIXED_B_TASK_COLLISION");
        await work();
        if ((await phase(db, initial)) !== "CONSUMED")
          throw Error("MIXED_B_TASK_NOT_CONSUMED");
        assertCurrent();
      });
    },
  };
  return createIntelligenceContinuationRepository(createOnlyDb, {
    ...deps,
    async validateAdmission(value) {
      await deps.validateAdmission(value);
      if (!(await db.isInTransactionAsync())) throw Error("MIXED_B_TASK_TRANSACTION");
      assertCurrent();
      const result = await db.runAsync(
        `UPDATE universal_mixed_b_task_reservations SET phase='INSERTING' WHERE ${exact} AND phase='RESERVED'`,
        ...fields(initial),
      );
      if (result.changes !== 1) throw Error("MIXED_B_TASK_RESERVATION_UNAVAILABLE");
    },
  }).create(context, task);
}

export function readExactTaskWake(
  db: ContinuationDatabase,
  id: string,
  scope?: { accountId: string; tripId: string; taskId: string },
) {
  return db.getFirstAsync<
    SyncOperation & { leaseExpiresAt: string | null; lastAttemptAt: string | null }
  >(
    `SELECT id,owner_user_id AS ownerUserId,trip_id AS tripId,entity_type AS entityType,
      entity_id AS entityId,operation_type AS operationType,idempotency_key AS idempotencyKey,
      base_version AS baseVersion,payload_json AS payloadJson,status,attempt_count AS attemptCount,
      next_attempt_at AS nextAttemptAt,claim_owner AS claimOwner,lease_expires_at AS leaseExpiresAt,
      last_attempt_at AS lastAttemptAt,created_at AS createdAt,updated_at AS updatedAt
      FROM sync_operations WHERE id=?${scope ? " AND owner_user_id=? AND trip_id=? AND entity_type='INTELLIGENCE_CONTINUATION' AND entity_id=?" : ""}`,
    id,
    ...(scope ? [scope.accountId, scope.tripId, scope.taskId] : []),
  );
}

type TaskRepo = ReturnType<typeof createIntelligenceContinuationRepository>;
const immutableTask = (task: Task) =>
  digest(
    Object.fromEntries(
      Object.entries(task).filter(
        ([k]) => !(taskMutableColumns as readonly string[]).includes(k),
      ),
    ) as Json,
  );

async function readConsumedTask(db: TaskDb, reservation: MixedBTaskReservation, draft: Task) {
  if ((await checkedReservation(db, reservation, draft)).state !== "CONSUMED")
    throw Error("MIXED_B_TASK_NOT_CONSUMED");
  const scope = await readProtectedMixedBReservation(db, draft.import_id, draft.task_id);
  if (scope?.task_id !== draft.task_id || scope.account_id !== draft.account_id ||
    scope.trip_id !== draft.trip_id || scope.batch_id !== draft.import_id)
    throw Error("MIXED_B_TASK_BINDING");
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM intelligence_continuations WHERE task_id=? OR import_id=? LIMIT 2",
    draft.task_id,
    draft.import_id,
  );
  const row = rows[0];
  if (
    rows.length !== 1 ||
    row.account_id !== draft.account_id ||
    (row.current_pass_complete !== 0 && row.current_pass_complete !== 1)
  )
    throw Error("MIXED_B_TASK_BINDING");
  const decoded: Record<string, unknown> = {
    ...row,
    current_pass_complete: row.current_pass_complete === 1,
  };
  for (const key of taskJsonColumns) {
    const value = row[key];
    if (typeof value === "string") decoded[key] = JSON.parse(value);
  }
  const head = taskSchema.parse(decoded);
  if (immutableTask(head) !== immutableTask(draft)) throw Error("MIXED_B_TASK_BINDING");
  return head;
}

export async function assertMixedBTaskStaged(db: TaskDb, reservation: MixedBTaskReservation, draft: Task) {
  await db.withTransactionAsync(async () => {
    const task = await readConsumedTask(db, reservation, draft);
    const conflict = await db.getFirstAsync<{ present: number }>(
      `SELECT EXISTS(SELECT 1 FROM intelligence_continuation_attempts WHERE task_id=?) OR
        EXISTS(SELECT 1 FROM sync_operations WHERE entity_type='INTELLIGENCE_CONTINUATION' AND entity_id=?) AS present`,
      draft.task_id,
      draft.task_id,
    );
    if (task.row_revision !== 1 || task.publication_fence !== 1 || task.sync_operation_id !== null ||
      task.current_attempt_id !== null || task.work_disposition !== "PENDING" ||
      task.cancellation_disposition !== "NONE" || conflict?.present !== 0)
      throw Error("MIXED_B_TASK_OUTCOME_UNQUALIFIED");
  });
}

type MixedBWakeInput = {
  db: TaskDb;
  context: AccountRequestContext;
  reservation: MixedBTaskReservation;
  task: Task;
  expectedWakeId?: string;
  assertCurrent(): void;
};
export type MixedBQueueClaim = {
  operationId: string;
  owner: string;
  baseVersion: number;
};

// Reads only the exact durable local postimage. The caller supplies a fresh committed Source proof.
async function prepareMixedBWakeCheck(input: MixedBWakeInput) {
  const { db, reservation, task: draft } = input;
  const deadline = Date.parse(draft.policy_snapshot.deadline ?? "");
  function assertCurrent() {
    input.assertCurrent();
    if (!(Date.now() < deadline)) throw Error("MIXED_B_TASK_WINDOW_CLOSED");
  }
  assertCurrent();
  const hash = async (bytes: Uint8Array) =>
    createHash("sha256").update(bytes).digest("hex");
  const payload = {
    version: 1 as const,
    account_id: draft.account_id,
    task_id: draft.task_id,
    expected_publication_fence: 1,
    wake_reason: "REEVALUATE" as const,
  };
  const wakeId = await intelligenceWakeIdentity(payload, hash);
  if (input.expectedWakeId !== undefined && wakeId !== input.expectedWakeId)
    throw Error("MIXED_B_WAKE_IDENTITY");

  async function currentTask(attempt?: MixedBKnownAttempt) {
    assertCurrent();
    const head = await readConsumedTask(db, reservation, draft);
    const attempts = await db.getAllAsync<Record<string, unknown>>(
      "SELECT * FROM intelligence_continuation_attempts WHERE task_id=? LIMIT 2",
      draft.task_id,
    );
    if (attempts.length !== (attempt ? 1 : 0))
      throw Error("MIXED_B_TASK_ATTEMPT_REQUIRES_DISPOSITION");
    if (attempt) {
      const [row] = attempts;
      const decoded = { ...row };
      for (const key of attemptJsonColumns) {
        const value = row[key];
        if (typeof value === "string") decoded[key] = JSON.parse(value);
      }
      if (row.shadow !== 0 && row.shadow !== 1)
        throw Error("MIXED_B_TASK_ATTEMPT_REQUIRES_DISPOSITION");
      decoded.shadow = row.shadow === 1;
      const actual = attemptSchema.parse(decoded);
      const immutableAttempt = (a: Attempt) =>
        canonicalEventJson(
          Object.fromEntries(
            Object.entries(a).filter(
              ([key]) => !(attemptMutableColumns as readonly string[]).includes(key),
            ),
          ) as Json,
        );
      if (
        immutableAttempt(actual) !== immutableAttempt(attempt.expected) ||
        actual.account_id !== draft.account_id ||
        actual.execution_observation !==
          (attempt.phase === "RESERVED" ? "NOT_STARTED" : "RUNNING") ||
        actual.metering_disposition !==
          (attempt.phase === "RESERVED" ? "START_PENDING" : "START_DURABLE") ||
        actual.row_revision !==
          (attempt.phase === "RESERVED" ? 1 : attempt.phase === "RUNNING" ? 2 : 3) ||
        actual.execution_outcome !== null ||
        actual.safe_failure_code !== null ||
        actual.publication_sha256 !== null ||
        actual.result_install_disposition !== "NONE" ||
        actual.response_material_reference !== null ||
        actual.response_material_sha256 !== null ||
        actual.response_sha256 !== null ||
        actual.reported_usage_summary !== null ||
        actual.sync_operation_id !== wakeId
      )
        throw Error("MIXED_B_TASK_ATTEMPT_REQUIRES_DISPOSITION");
    }
    if (
      head.publication_fence !== 1 ||
      head.work_disposition !== (attempt ? "RUNNING" : "PENDING") ||
      head.current_attempt_id !== (attempt?.expected.attempt_id ?? null) ||
      head.cancellation_disposition !== "NONE"
    )
      throw Error("MIXED_B_WAKE_STATE");
    if (
      (
        await db.getFirstAsync<{ present: number }>(
          `SELECT EXISTS(SELECT 1 FROM sync_operations WHERE entity_type='INTELLIGENCE_CONTINUATION'
          AND entity_id=? AND id<>?) AS present`,
          draft.task_id,
          wakeId,
        )
      )?.present !== 0
    )
      throw Error("MIXED_B_WAKE_IDENTITY");
    assertCurrent();
    return head;
  }

  async function exactWake(claim?: MixedBQueueClaim) {
    const wake = await readExactTaskWake(db, wakeId, {
      accountId: draft.account_id,
      tripId: reservation.initial.tripId,
      taskId: draft.task_id,
    });
    if (
      !wake ||
      wake.tripId !== draft.trip_id ||
      canonicalEventJson(await validateIntelligenceWake(wake, hash)) !==
        canonicalEventJson(payload) ||
      wake.baseVersion !== 1 ||
      wake.attemptCount !== 0 ||
      wake.nextAttemptAt !== null ||
      (claim
        ? claim.operationId !== wakeId ||
          claim.baseVersion !== wake.baseVersion ||
          !claim.owner ||
          wake.status !== "PROCESSING" ||
          wake.claimOwner !== claim.owner ||
          wake.lastAttemptAt === null ||
          !(Date.now() < Date.parse(wake.leaseExpiresAt ?? ""))
        : wake.status !== "PENDING" ||
          wake.claimOwner !== null ||
          wake.leaseExpiresAt !== null ||
          wake.lastAttemptAt !== null)
    )
      throw Error("MIXED_B_WAKE_STATE");
    assertCurrent();
    return wake;
  }

  function assertBound(task: Task) {
    if (task.sync_operation_id !== wakeId) throw Error("MIXED_B_WAKE_IDENTITY");
  }
  return { assertCurrent, currentTask, exactWake, assertBound, wakeId, hash, payload };
}

// Repairs only the two pre-bind crash points. The original wake is never signalled twice.
export async function recoverMixedBTaskWake(
  input: MixedBWakeInput & {
    repository(db?: ContinuationDatabase): TaskRepo;
    now(): string;
  },
) {
  const { db, context, task: draft } = input;
  const check = await prepareMixedBWakeCheck(input);
  if ((await checkedReservation(db, input.reservation, draft)).state !== "CONSUMED")
    throw Error("MIXED_B_TASK_NOT_CONSUMED");
  // Capture the owning CAS revision; the writer revalidates the entire postimage.
  const task = await input.repository().read(context, draft.task_id);
  const replay = Error("MIXED_B_WAKE_ALREADY_BOUND");
  let boundTask: Task | undefined;
  const bindOnlyDb: ContinuationDatabase = {
    ...db,
    withTransactionAsync: (work) =>
      db.withImmediateTransactionAsync(async () => {
        const head = await check.currentTask();
        if (head.sync_operation_id === check.wakeId) {
          await check.exactWake();
          boundTask = head;
          throw replay;
        }
        if (
          head.row_revision !== task.row_revision ||
          head.row_revision !== 1 ||
          head.sync_operation_id !== null
        )
          throw Error("MIXED_B_WAKE_STATE");
        if (await readExactTaskWake(db, check.wakeId)) await check.exactWake();
        else if (
          (await signalIntelligenceWake(
            db,
            head,
            check.hash,
            input.now(),
            check.payload,
          )) !== check.wakeId
        )
          throw Error("MIXED_B_WAKE_IDENTITY");
        check.assertCurrent();
        await work(); // The original signal and owning CAS commit together.
        await check.exactWake();
        check.assertBound(await check.currentTask());
      }),
  };
  try {
    return await input
      .repository(bindOnlyDb)
      .bindQueue(context, task.task_id, task.row_revision, check.wakeId);
  } catch (error) {
    if (error !== replay || !boundTask) throw error;
    return boundTask;
  }
}

// Deferred work obtains a separate proof. Never recover an ambiguous prior claim.
export async function claimMixedBTaskWake(
  input: MixedBWakeInput & { owner: string; now(): string },
) {
  const { db, context, owner } = input;
  const check = await prepareMixedBWakeCheck(input);
  const operation = await check.exactWake();
  const claim = { operationId: check.wakeId, owner, baseVersion: 1 };
  const guarded = {
    ...db,
    withTransactionAsync: (work: () => Promise<void>) =>
      db.withImmediateTransactionAsync(async () => {
        check.assertBound(await check.currentTask());
        await check.exactWake();
        await work();
        await check.exactWake(claim);
        check.assertBound(await check.currentTask());
      }),
  };
  const queue = createIntelligenceWakeQueue(guarded, {
    getAccountId: async () => context.accountId,
    sha256: check.hash,
    now: input.now,
  });
  if (!(await queue.claim(context, operation, owner))) throw Error("MIXED_B_WAKE_STATE");
  return { operation, claim };
}

export type MixedBAttemptPhase = "RESERVED" | "RUNNING" | "START_ADMITTED";

type MixedBKnownAttempt = {
  expected: Attempt;
  phase: MixedBAttemptPhase;
};

// Used inside a SQLite snapshot or writer transaction. Never performs Source I/O.
export async function assertMixedBClaimCurrent(
  input: MixedBWakeInput,
  claim: MixedBQueueClaim,
  attempt?: MixedBKnownAttempt,
) {
  const check = await prepareMixedBWakeCheck(input);
  check.assertBound(await check.currentTask(attempt));
  const wake = await check.exactWake(claim);
  return () => {
    check.assertCurrent();
    if (!(Date.now() < Date.parse(wake.leaseExpiresAt ?? "")))
      throw Error("MIXED_B_WAKE_STATE");
  };
}
