import { serializeDatabaseTransactions } from "../../src/data/db/databaseConnection";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { migrations } from "../../src/data/db/migrations";
import { createTripImportAdmissionRepository } from "../../src/data/repositories/tripImportAdmissionRepository";
import { createLedgerReadRepository } from "../../src/data/repositories/ledgerReadRepository";
import {
  createIntelligenceContinuationRepository,
  type ContinuationDatabase,
} from "../../src/data/repositories/intelligenceContinuationRepository";
import {
  createIntelligenceWakeQueue,
  signalIntelligenceWake,
  validateIntelligenceWake,
} from "../../src/data/sync/syncOperationRepository";
import {
  captureAccountRequestContext,
  type AccountRequestContext,
} from "../../src/data/auth/accountRequestContext";
import {
  taskSchema,
  attemptSchema,
  attemptMutableColumns,
  type Task,
  type Attempt,
} from "../../src/domain/intelligence/persistence";
import type { LedgerBootstrapResponse } from "../../src/data/api/ledgerReadContracts";
import { persistenceDigest } from "./externalIntegrationPersistence";
import {
  assertTaskForeignKeys,
  createReservedMixedBTask,
  mixedBTaskReservationState,
  readExactTaskWake,
  readProtectedMixedBReservation,
  recoverMixedBTaskWake,
  type MixedBTaskReservation,
} from "./universalMixedBTaskReservation";

const sharedDatabases = new WeakMap<DatabaseSync, ReturnType<typeof makeDatabase>>();
export function universalTaskDatabase(sql: DatabaseSync) {
  assertTaskForeignKeys(sql);
  let db = sharedDatabases.get(sql);
  if (!db) {
    db = makeDatabase(sql);
    sharedDatabases.set(sql, db);
  }
  return db;
}
function makeDatabase(sql: DatabaseSync) {
  let inTransaction = false;
  const immediate = new WeakSet<() => Promise<void>>();
  const db = serializeDatabaseTransactions({
    async getFirstAsync<T>(q: string, ...p: unknown[]) {
      return (sql.prepare(q).get(...(p as never[])) ?? null) as T | null;
    },
    async getAllAsync<T>(q: string, ...p: unknown[]) {
      return sql.prepare(q).all(...(p as never[])) as T[];
    },
    async runAsync(q: string, ...p: unknown[]) {
      return sql.prepare(q).run(...(p as never[])) as never;
    },
    async isInTransactionAsync() {
      return inTransaction;
    },
    async withTransactionAsync(work: () => Promise<void>) {
      assertTaskForeignKeys(sql);
      sql.exec(immediate.has(work) ? "BEGIN IMMEDIATE" : "BEGIN");
      inTransaction = true;
      try {
        await work();
        sql.exec("COMMIT");
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      } finally {
        inTransaction = false;
      }
    },
  });
  return Object.assign(db, {
    withImmediateTransactionAsync(work: () => Promise<void>) {
      const run = () => work();
      immediate.add(run);
      return db.withTransactionAsync(run);
    },
  });
}
// Dedicated Backend SQLite only. Never opens, copies or migrates an App database.
export function initializeUniversalTaskDatabase(sql: DatabaseSync) {
  const current = Number(
    (sql.prepare("PRAGMA user_version").get() as { user_version: number }).user_version,
  );
  // Native Photo state must not migrate Backend Task storage or break retained-image rollback.
  const taskMigrations = migrations.filter((m) => m.id <= 74);
  if (current > taskMigrations.at(-1)!.id) throw Error("UNIVERSAL_TASK_DATABASE_VERSION");
  for (const m of taskMigrations.filter((m) => m.id > current)) {
    sql.exec("BEGIN");
    try {
      sql.exec(m.sql);
      sql.exec(`PRAGMA user_version=${m.id}`);
      sql.exec("COMMIT");
    } catch (e) {
      sql.exec("ROLLBACK");
      throw e;
    }
  }
  sql.exec("PRAGMA foreign_keys=ON");
  return universalTaskDatabase(sql);
}

export function bindOrdinaryUniversalTaskWake(input: {
  db: ReturnType<typeof universalTaskDatabase>;
  context: AccountRequestContext;
  task: Task;
  expectedWakeId: string;
  repository(
    db: ContinuationDatabase,
  ): ReturnType<typeof createIntelligenceContinuationRepository>;
  assertCurrent(): void;
}) {
  const { db, context, task, expectedWakeId } = input;
  const hash = async (bytes: Uint8Array) =>
    createHash("sha256").update(bytes).digest("hex");
  const bindDb: ContinuationDatabase = {
    ...db,
    withTransactionAsync(work) {
      return db.withImmediateTransactionAsync(async () => {
        input.assertCurrent();
        if (await readProtectedMixedBReservation(db, task.import_id, task.task_id))
          throw Error("MIXED_B_TASK_OUTCOME_UNQUALIFIED");
        const eligible = await db.getFirstAsync<{ present: number }>(
          `SELECT EXISTS(SELECT 1 FROM intelligence_continuations t
            WHERE t.account_id=? AND t.trip_id=? AND t.task_id=? AND t.row_revision=1
              AND t.publication_fence=1 AND t.work_disposition='PENDING'
              AND t.cancellation_disposition='NONE' AND t.sync_operation_id IS NULL
              AND t.current_attempt_id IS NULL
              AND NOT EXISTS(SELECT 1 FROM intelligence_continuation_attempts a
                WHERE a.account_id=t.account_id AND a.task_id=t.task_id)
              AND NOT EXISTS(SELECT 1 FROM sync_operations q
                WHERE q.entity_type='INTELLIGENCE_CONTINUATION' AND q.entity_id=t.task_id
                  AND q.id<>?)) AS present`,
          context.accountId,
          context.tripId,
          task.task_id,
          expectedWakeId,
        );
        if (
          eligible?.present !== 1 ||
          task.row_revision !== 1 ||
          !(Date.parse(task.policy_snapshot.deadline ?? "") > Date.now())
        )
          throw Error("UNIVERSAL_WAKE_RECOVERY_UNQUALIFIED");
        const prior = await readExactTaskWake(db, expectedWakeId);
        if (prior) {
          const payload = await validateIntelligenceWake(prior, hash);
          if (
            prior.ownerUserId !== context.accountId ||
            prior.tripId !== context.tripId ||
            prior.entityId !== task.task_id ||
            payload.expected_publication_fence !== 1 ||
            payload.wake_reason !== "REEVALUATE" ||
            prior.status !== "PENDING" ||
            prior.baseVersion !== 1 ||
            prior.attemptCount !== 0 ||
            prior.claimOwner !== null ||
            prior.leaseExpiresAt !== null ||
            prior.lastAttemptAt !== null ||
            prior.nextAttemptAt !== null
          )
            throw Error("UNIVERSAL_WAKE_RECOVERY_UNQUALIFIED");
        } else if (
          (await signalIntelligenceWake(db, task, hash, new Date().toISOString())) !==
          expectedWakeId
        )
          throw Error("UNIVERSAL_BOOTSTRAP_QUEUE_CHANGED");
        await work();
        input.assertCurrent();
      });
    },
  };
  return input
    .repository(bindDb)
    .bindQueue(context, task.task_id, task.row_revision, expectedWakeId);
}

export async function bootstrapUniversalTask(input: {
  db: ReturnType<typeof universalTaskDatabase>;
  task: Task;
  attempt: Attempt;
  catalog: string;
  ledger: LedgerBootstrapResponse;
  getAccountId(): Promise<string>;
  assertCurrent(): void;
  claimQueue?: boolean;
  mixedBReservation?: MixedBTaskReservation;
  proveMixedBStage?(): Promise<() => void>;
  withMixedBMaterial?<T>(
    use: (assertLockedCurrent: () => void) => Promise<T>,
  ): Promise<T>;
}) {
  const t = taskSchema.parse(input.task),
    a = attemptSchema.parse(input.attempt);
  const now = () => new Date().toISOString();
  const hash = async (bytes: Uint8Array) =>
    createHash("sha256").update(bytes).digest("hex");
  if (
    !t.trip_id ||
    t.sync_operation_id !== null ||
    a.account_id !== t.account_id ||
    a.task_id !== t.task_id ||
    input.ledger.journey.id !== t.trip_id ||
    !input.ledger.actor.capabilities.canRead ||
    (input.ledger.actor.userId !== undefined &&
      input.ledger.actor.userId !== t.account_id)
  )
    throw Error("UNIVERSAL_BOOTSTRAP_BINDING");
  const context = await captureAccountRequestContext(t.trip_id, input.getAccountId);
  if (context.accountId !== t.account_id) throw Error("UNIVERSAL_BOOTSTRAP_ACTOR");
  input.assertCurrent();
  const mixedBReservation = input.mixedBReservation;
  if (mixedBReservation && input.claimQueue !== false)
    throw Error("MIXED_B_TASK_BOOTSTRAP_SCOPE");
  if (input.proveMixedBStage && (!mixedBReservation || input.withMixedBMaterial))
    throw Error("MIXED_B_TASK_BOOTSTRAP_SCOPE");
  const mixedBState = mixedBReservation
    ? await mixedBTaskReservationState(input.db, mixedBReservation, t)
    : null;
  const immutableAttempt = (value: Attempt) =>
    persistenceDigest(
      Object.fromEntries(
        Object.entries(value).filter(
          ([k]) => !(attemptMutableColumns as readonly string[]).includes(k),
        ),
      ),
    );
  const taskIdentity = persistenceDigest(t),
    attemptIdentity = immutableAttempt(a);
  const repositoryDeps: Parameters<typeof createIntelligenceContinuationRepository>[1] = {
    getAccountId: input.getAccountId,
    now,
    sha256: hash,
    async validateAdmission(value) {
      input.assertCurrent();
      if (
        value.task_id !== t.task_id ||
        value.account_id !== t.account_id ||
        value.input_sha256 !== t.input_sha256 ||
        value.manifest_sha256 !== t.manifest_sha256 ||
        value.policy_sha256 !== t.policy_sha256 ||
        value.import_id !== t.import_id ||
        value.run_id !== t.run_id
      )
        throw Error("UNIVERSAL_BOOTSTRAP_TASK_CHANGED");
    },
    async validateAttemptAdmission(value, attempt, predecessor) {
      input.assertCurrent();
      if (
        predecessor ||
        value.task_id !== a.task_id ||
        immutableAttempt(attempt) !== attemptIdentity
      )
        throw Error("UNIVERSAL_BOOTSTRAP_ATTEMPT_CHANGED");
    },
    async eligibleWait() {
      return false;
    },
    async verifyRecovery() {
      throw Error("UNIVERSAL_EXACT_RECOVERY_REQUIRED");
    },
  };
  const repo = createIntelligenceContinuationRepository(input.db, repositoryDeps);
  const ordinaryDb = {
    ...input.db,
    withTransactionAsync(work: () => Promise<void>) {
      return input.db.withImmediateTransactionAsync(async () => {
        if (await readProtectedMixedBReservation(input.db, t.import_id, t.task_id))
          throw Error("MIXED_B_TASK_OUTCOME_UNQUALIFIED");
        await work();
      });
    },
  };
  const ordinaryRepo = createIntelligenceContinuationRepository(ordinaryDb, repositoryDeps);
  const repairMixedBWake = (reservation: MixedBTaskReservation) =>
    recoverMixedBTaskWake({
      db: input.db,
      repository: (db = input.db) =>
        createIntelligenceContinuationRepository(db, repositoryDeps),
      context,
      reservation,
      task: t,
      expectedWakeId: a.sync_operation_id,
      assertCurrent: input.assertCurrent,
      now,
    });
  if (mixedBReservation && mixedBState === "CONSUMED")
    throw Error("MIXED_B_TASK_OUTCOME_UNQUALIFIED");
  const materialLease = input.withMixedBMaterial;
  if (mixedBReservation && !materialLease && !input.proveMixedBStage)
    throw Error("MIXED_B_MATERIAL_SCOPE_UNAVAILABLE");
  await createLedgerReadRepository(input.db, input.getAccountId).applyBootstrap(
    input.ledger,
    context,
  );
  await createTripImportAdmissionRepository(
    input.db,
    input.getAccountId,
    hash,
    now,
    () => {
      throw Error("UNIVERSAL_READ_ONLY_CATALOG");
    },
  ).applyUniversalCatalogs(context, input.catalog);
  if (mixedBReservation && input.proveMixedBStage) {
    const assertCurrentMaterial = await input.proveMixedBStage();
    await createReservedMixedBTask(
      input.db, repositoryDeps, context, t, mixedBReservation, assertCurrentMaterial, input.assertCurrent,
    );
    return { repository: repo, context };
  }
  const created =
    mixedBReservation && materialLease
      ? await materialLease((assertLockedCurrent) =>
          createReservedMixedBTask(
            input.db,
            repositoryDeps,
            context,
            t,
            mixedBReservation,
            assertLockedCurrent,
            input.assertCurrent,
          ),
        )
      : await ordinaryRepo.create(context, t);
  if (persistenceDigest(t) !== taskIdentity)
    throw Error("UNIVERSAL_BOOTSTRAP_TASK_CHANGED");
  if (mixedBReservation) {
    await repairMixedBWake(mixedBReservation);
    return { repository: repo, context };
  }
  let task = created;
  if (!task.sync_operation_id) {
    task = await bindOrdinaryUniversalTaskWake({
      db: input.db,
      context,
      task,
      expectedWakeId: a.sync_operation_id,
      repository: (db) => createIntelligenceContinuationRepository(db, repositoryDeps),
      assertCurrent: input.assertCurrent,
    });
  }
  if (task.sync_operation_id !== a.sync_operation_id)
    throw Error("UNIVERSAL_BOOTSTRAP_QUEUE_CHANGED");
  const operation = await readExactTaskWake(input.db, task.sync_operation_id);
  if (!operation) throw Error("UNIVERSAL_BOOTSTRAP_QUEUE_MISSING");
  if (input.claimQueue === false) {
    if (!["PENDING", "RETRYABLE", "PROCESSING", "COMPLETED"].includes(operation.status))
      throw Error("UNIVERSAL_BOOTSTRAP_QUEUE_STATE");
  } else if (["PENDING", "RETRYABLE"].includes(operation.status)) {
    if (
      !(await createIntelligenceWakeQueue(ordinaryDb, {
        getAccountId: input.getAccountId,
        sha256: hash,
        now,
      }).claim(context, operation, `universal-${a.attempt_id}`))
    )
      throw Error("UNIVERSAL_BOOTSTRAP_QUEUE_CLAIM");
  } else if (operation.status !== "PROCESSING")
    throw Error("UNIVERSAL_BOOTSTRAP_QUEUE_STATE");
  input.assertCurrent();
  return { repository: repo, context };
}
