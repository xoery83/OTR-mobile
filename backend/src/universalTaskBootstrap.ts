import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { migrations } from "../../src/data/db/migrations";
import { createTripImportAdmissionRepository } from "../../src/data/repositories/tripImportAdmissionRepository";
import { createLedgerReadRepository } from "../../src/data/repositories/ledgerReadRepository";
import { createIntelligenceContinuationRepository } from "../../src/data/repositories/intelligenceContinuationRepository";
import {
  createIntelligenceWakeQueue,
  signalIntelligenceWake,
  type SyncOperation,
} from "../../src/data/sync/syncOperationRepository";
import { captureAccountRequestContext } from "../../src/data/auth/accountRequestContext";
import {
  taskSchema,
  attemptSchema,
  attemptMutableColumns,
  type Task,
  type Attempt,
} from "../../src/domain/intelligence/persistence";
import type { LedgerBootstrapResponse } from "../../src/data/api/ledgerReadContracts";
import { persistenceDigest } from "./externalIntegrationPersistence";

export function universalTaskDatabase(sql: DatabaseSync) {
  let inTransaction = false;
  return {
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
      sql.exec("BEGIN");
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
  };
}
// Dedicated Backend SQLite only. Never opens, copies or migrates an App database.
export function initializeUniversalTaskDatabase(sql: DatabaseSync) {
  const current = Number(
    (sql.prepare("PRAGMA user_version").get() as { user_version: number }).user_version,
  );
  if (current > migrations.at(-1)!.id) throw Error("UNIVERSAL_TASK_DATABASE_VERSION");
  for (const m of migrations.filter((m) => m.id > current)) {
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

export async function bootstrapUniversalTask(input: {
  db: ReturnType<typeof universalTaskDatabase>;
  task: Task;
  attempt: Attempt;
  catalog: string;
  ledger: LedgerBootstrapResponse;
  getAccountId(): Promise<string>;
  assertCurrent(): void;
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
  const repo = createIntelligenceContinuationRepository(input.db, {
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
  });
  const created = await repo.create(context, t);
  if (persistenceDigest(t) !== taskIdentity)
    throw Error("UNIVERSAL_BOOTSTRAP_TASK_CHANGED");
  let task = created;
  if (!task.sync_operation_id) {
    let operationId!: string;
    await input.db.withTransactionAsync(async () => {
      operationId = await signalIntelligenceWake(input.db, task, hash, now());
    });
    task = await repo.bindQueue(context, t.task_id, task.row_revision, operationId);
  }
  if (task.sync_operation_id !== a.sync_operation_id)
    throw Error("UNIVERSAL_BOOTSTRAP_QUEUE_CHANGED");
  const operation = await input.db.getFirstAsync<SyncOperation>(
    `SELECT id,owner_user_id AS ownerUserId,trip_id AS tripId,entity_type AS entityType,entity_id AS entityId,operation_type AS operationType,idempotency_key AS idempotencyKey,base_version AS baseVersion,payload_json AS payloadJson,status,attempt_count AS attemptCount,next_attempt_at AS nextAttemptAt,claim_owner AS claimOwner,created_at AS createdAt,updated_at AS updatedAt FROM sync_operations WHERE id=?`,
    task.sync_operation_id,
  );
  if (!operation) throw Error("UNIVERSAL_BOOTSTRAP_QUEUE_MISSING");
  if (["PENDING", "RETRYABLE"].includes(operation.status)) {
    if (
      !(await createIntelligenceWakeQueue(input.db, {
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
