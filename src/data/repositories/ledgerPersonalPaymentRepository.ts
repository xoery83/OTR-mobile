import type * as SQLite from "expo-sqlite";

import {
  createPersonalSettlementPaymentRequestSchema,
  updatePersonalSettlementPaymentRequestSchema,
  type PersonalSettlementPaymentDto,
  type PersonalSettlementPaymentFxProjectionDto,
} from "@/data/api/ledgerSettlementContracts";
import type { LedgerChangesResponse } from "@/data/api/ledgerReadContracts";
import type { SyncStatus } from "@/domain/sync/syncStatus";

export type LedgerPersonalPaymentDatabase = Pick<
  SQLite.SQLiteDatabase,
  "getAllAsync" | "getFirstAsync" | "runAsync" | "withTransactionAsync"
>;

export type PersonalPaymentCommand = Omit<
  PersonalSettlementPaymentDto,
  | "id"
  | "ownerUserId"
  | "ownerMemberId"
  | "revision"
  | "createdAt"
  | "updatedAt"
  | "deletedAt"
  | "economicDate"
> & { auditReason?: string | null; economicDate?: string };

export type LocalPersonalPayment = PersonalSettlementPaymentDto & {
  fxProjections?: PersonalSettlementPaymentFxProjectionDto[];
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  lastErrorCode: string | null;
};

const entityType = "ledger_personal_payment";
export const personalPaymentOperations = {
  create: "CREATE_PERSONAL_PAYMENT",
  update: "UPDATE_PERSONAL_PAYMENT",
  delete: "DELETE_PERSONAL_PAYMENT",
} as const;

export function createLedgerPersonalPaymentRepository(
  database: LedgerPersonalPaymentDatabase,
  getActiveUserId: () => Promise<string>,
) {
  return {
    async listForJourney(journeyId: string, includeDeleted = false) {
      const userId = await getActiveUserId();
      const rows = await database.getAllAsync<PersonalPaymentRow>(
        `${selectPayment} WHERE projection_user_id = ? AND journey_id = ?
           AND (? = 1 OR deleted_at IS NULL)
           ORDER BY occurred_at DESC, created_at DESC, id`,
        userId,
        journeyId,
        includeDeleted ? 1 : 0,
      );
      return attachProjections(database, userId, rows.map(fromRow));
    },

    async get(id: string) {
      const userId = await getActiveUserId();
      const row = await database.getFirstAsync<PersonalPaymentRow>(
        `${selectPayment} WHERE id = ? AND projection_user_id = ?`,
        id,
        userId,
      );
      return row ? (await attachProjections(database, userId, [fromRow(row)]))[0] : null;
    },

    async create(command: PersonalPaymentCommand) {
      const userId = await getActiveUserId();
      const ownerMemberId = await requireActor(database, userId, command.journeyId);
      await requireCounterparty(
        database,
        command.journeyId,
        ownerMemberId,
        command.counterpartyMemberId,
      );
      const id = createUuid();
      const input = createPersonalSettlementPaymentRequestSchema.parse({
        id,
        ...paymentInput(command),
      });
      const now = new Date().toISOString();
      const record: LocalPersonalPayment = {
        ...input,
        economicDate: input.economicDate ?? compatibilityEconomicDate(command.occurredAt),
        note: input.note ?? null,
        recordedEquivalentMinor: input.recordedEquivalentMinor ?? null,
        recordedEquivalentCurrency: input.recordedEquivalentCurrency ?? null,
        recordedEquivalentScale: input.recordedEquivalentScale ?? null,
        referenceRateDecimal: input.referenceRateDecimal ?? null,
        referenceRateDate: input.referenceRateDate ?? null,
        referenceSource: input.referenceSource ?? null,
        referenceProvenance: input.referenceProvenance ?? null,
        journeyId: command.journeyId,
        ownerUserId: userId,
        ownerMemberId,
        revision: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: "PENDING_CREATE",
        lastSyncedAt: null,
        lastErrorCode: null,
      };
      await database.withTransactionAsync(async () => {
        await upsert(database, userId, record);
        await enqueue(
          database,
          record,
          personalPaymentOperations.create,
          null,
          input,
          userId,
        );
      });
      return record;
    },

    async update(id: string, command: PersonalPaymentCommand) {
      const userId = await getActiveUserId();
      const current = await requireOwned(database, id, userId);
      const ownerMemberId = await requireActor(database, userId, current.journeyId);
      if (current.deletedAt)
        throw new Error("Deleted Personal Payments cannot be edited.");
      if (command.journeyId !== current.journeyId)
        throw new Error("A Personal Payment cannot move between Journeys.");
      await requireCounterparty(
        database,
        current.journeyId,
        ownerMemberId,
        command.counterpartyMemberId,
      );
      const input = updatePersonalSettlementPaymentRequestSchema.parse({
        ...paymentInput(command),
        baseRevision: Math.max(1, current.revision),
      });
      const createInput = createPersonalSettlementPaymentRequestSchema.parse({
        id,
        ...paymentInput(command),
      });
      const updated: LocalPersonalPayment = {
        ...current,
        ...input,
        economicDate: input.economicDate ?? compatibilityEconomicDate(command.occurredAt),
        note: input.note ?? null,
        recordedEquivalentMinor: input.recordedEquivalentMinor ?? null,
        recordedEquivalentCurrency: input.recordedEquivalentCurrency ?? null,
        recordedEquivalentScale: input.recordedEquivalentScale ?? null,
        referenceRateDecimal: input.referenceRateDecimal ?? null,
        referenceRateDate: input.referenceRateDate ?? null,
        referenceSource: input.referenceSource ?? null,
        referenceProvenance: input.referenceProvenance ?? null,
        syncStatus: current.revision === 0 ? "PENDING_CREATE" : "PENDING_UPDATE",
        updatedAt: new Date().toISOString(),
        lastErrorCode: null,
      };
      await database.withTransactionAsync(async () => {
        const pendingCreate =
          current.revision === 0
            ? await findCoalescibleCreate(database, id, userId)
            : null;
        if (!pendingCreate) updated.syncStatus = "PENDING_UPDATE";
        await upsert(database, userId, updated);
        if (pendingCreate) {
          await coalesceIntoCreate(database, pendingCreate.id, id, userId, createInput);
        } else {
          await enqueue(
            database,
            updated,
            personalPaymentOperations.update,
            current.revision,
            input,
            userId,
          );
        }
      });
      return updated;
    },

    async remove(id: string, auditReason: string | null = null) {
      const userId = await getActiveUserId();
      const current = await requireOwned(database, id, userId);
      await requireActor(database, userId, current.journeyId);
      if (current.deletedAt) return current;
      const now = new Date().toISOString();
      const deleted = {
        ...current,
        deletedAt: now,
        updatedAt: now,
        syncStatus: "PENDING_DELETE" as const,
        lastErrorCode: null,
      };
      await database.withTransactionAsync(async () => {
        await upsert(database, userId, deleted);
        await enqueue(
          database,
          deleted,
          personalPaymentOperations.delete,
          current.revision,
          { baseRevision: Math.max(1, current.revision), auditReason },
          userId,
        );
      });
      return deleted;
    },

    async applyCanonical(
      canonical: PersonalSettlementPaymentDto,
      completedOperationId?: string,
    ) {
      const userId = await getActiveUserId();
      const current = await database.getFirstAsync<PersonalPaymentRow>(
        `${selectPayment} WHERE id = ? AND projection_user_id = ?`,
        canonical.id,
        userId,
      );
      if (current && pendingStatuses.has(current.syncStatus)) {
        if (!completedOperationId) return;
        await completeSupersededMutations(
          database,
          userId,
          canonical.id,
          completedOperationId,
        );
        const later = await database.getFirstAsync<{ operationType: string }>(
          `SELECT operation_type AS operationType FROM sync_operations
           WHERE owner_user_id = ? AND entity_type = ? AND entity_id = ? AND id <> ?
             AND status <> 'COMPLETED' ORDER BY created_at DESC, rowid DESC LIMIT 1`,
          userId,
          entityType,
          canonical.id,
          completedOperationId,
        );
        if (later) {
          await database.runAsync(
            `UPDATE ledger_personal_payment_records
             SET server_revision = ?, owner_member_id = ?, last_synced_at = ?,
               sync_status = ?, last_error_code = NULL WHERE id = ? AND projection_user_id = ?`,
            canonical.revision,
            canonical.ownerMemberId,
            new Date().toISOString(),
            statusForOperation(later.operationType),
            canonical.id,
            userId,
          );
          return;
        }
      }
      if (current && current.serverRevision > canonical.revision) return;
      await upsert(database, userId, canonicalRecord(canonical));
    },

    async applyFxProjections(projections: PersonalSettlementPaymentFxProjectionDto[]) {
      const userId = await getActiveUserId();
      for (const projection of projections)
        await upsertProjection(database, userId, projection);
    },

    async applyFxProjectionList(
      journeyId: string,
      projections: PersonalSettlementPaymentFxProjectionDto[],
    ) {
      const userId = await getActiveUserId();
      await database.runAsync(
        `DELETE FROM ledger_personal_payment_fx_projections
         WHERE projection_user_id = ? AND journey_id = ?`,
        userId,
        journeyId,
      );
      for (const projection of projections)
        await upsertProjection(database, userId, projection);
    },

    async applyFxTombstone(id: string) {
      await database.runAsync(
        `DELETE FROM ledger_personal_payment_fx_projections
         WHERE projection_user_id = ? AND id = ?`,
        await getActiveUserId(),
        id,
      );
    },

    async applyTombstone(journeyId: string, id: string, revision: number) {
      const userId = await getActiveUserId();
      const current = await database.getFirstAsync<PersonalPaymentRow>(
        `${selectPayment} WHERE id = ? AND projection_user_id = ? AND journey_id = ?`,
        id,
        userId,
        journeyId,
      );
      if (
        !current ||
        pendingStatuses.has(current.syncStatus) ||
        current.serverRevision >= revision
      )
        return;
      const now = new Date().toISOString();
      await database.runAsync(
        `UPDATE ledger_personal_payment_records SET deleted_at = COALESCE(deleted_at, ?),
          server_revision = ?, sync_status = 'SYNCED', last_synced_at = ?,
          last_error_code = NULL, updated_at = ?
         WHERE id = ? AND projection_user_id = ? AND journey_id = ?`,
        now,
        revision,
        now,
        now,
        id,
        userId,
        journeyId,
      );
    },

    async applyHistoricalList(
      journeyId: string,
      records: PersonalSettlementPaymentDto[],
      serverTime: string,
    ) {
      const userId = await getActiveUserId();
      await database.withTransactionAsync(async () => {
        for (const record of records) {
          if (record.journeyId === journeyId)
            await applyCanonicalRecord(database, userId, record);
        }
        const ids = records
          .filter((record) => record.journeyId === journeyId)
          .map((record) => record.id);
        await database.runAsync(
          `DELETE FROM ledger_personal_payment_records
           WHERE projection_user_id = ? AND journey_id = ? AND sync_status = 'SYNCED'
             ${ids.length ? `AND id NOT IN (${ids.map(() => "?").join(",")})` : ""}`,
          userId,
          journeyId,
          ...ids,
        );
        await database.runAsync(
          `INSERT INTO ledger_personal_payment_sync_cursors
            (user_id, journey_id, cursor, server_time, updated_at)
           VALUES (?, ?, NULL, ?, ?)
           ON CONFLICT(user_id, journey_id) DO UPDATE SET
             server_time = excluded.server_time, updated_at = excluded.updated_at`,
          userId,
          journeyId,
          serverTime,
          new Date().toISOString(),
        );
      });
    },

    async getCursor(journeyId: string) {
      const userId = await getActiveUserId();
      return database.getFirstAsync<{ cursor: string | null }>(
        `SELECT cursor FROM ledger_personal_payment_sync_cursors
         WHERE user_id = ? AND journey_id = ?`,
        userId,
        journeyId,
      );
    },

    async saveCursor(journeyId: string, cursor: string | null, serverTime: string) {
      await saveCursor(database, await getActiveUserId(), journeyId, cursor, serverTime);
    },

    async applyChanges(journeyId: string, response: LedgerChangesResponse) {
      const userId = await getActiveUserId();
      await database.withTransactionAsync(async () => {
        for (const change of response.changes) {
          if (change.entityType === "PERSONAL_SETTLEMENT_PAYMENT_FX_PROJECTION") {
            if (change.isTombstone) {
              await database.runAsync(
                `DELETE FROM ledger_personal_payment_fx_projections
                 WHERE projection_user_id = ? AND id = ?`,
                userId,
                change.entityId,
              );
            } else if (change.aggregate && "targetCurrency" in change.aggregate) {
              await upsertProjection(database, userId, change.aggregate);
            }
            continue;
          }
          if (change.entityType !== "PERSONAL_SETTLEMENT_PAYMENT") continue;
          if (change.isTombstone) {
            const current = await database.getFirstAsync<PersonalPaymentRow>(
              `${selectPayment} WHERE id = ? AND projection_user_id = ? AND journey_id = ?`,
              change.entityId,
              userId,
              journeyId,
            );
            if (
              current &&
              !pendingStatuses.has(current.syncStatus) &&
              current.serverRevision < change.revision
            ) {
              const now = new Date().toISOString();
              await database.runAsync(
                `UPDATE ledger_personal_payment_records
                 SET deleted_at = COALESCE(deleted_at, ?), server_revision = ?,
                   sync_status = 'SYNCED', last_synced_at = ?, last_error_code = NULL,
                   updated_at = ? WHERE id = ? AND projection_user_id = ? AND journey_id = ?`,
                now,
                change.revision,
                now,
                now,
                change.entityId,
                userId,
                journeyId,
              );
            }
          } else if (
            change.aggregate &&
            "ownerUserId" in change.aggregate &&
            change.aggregate.journeyId === journeyId
          ) {
            await applyCanonicalRecord(database, userId, change.aggregate);
          }
        }
        await saveCursor(
          database,
          userId,
          journeyId,
          response.cursor,
          response.serverTime,
        );
      });
    },

    async markSyncing(id: string) {
      await setStatus(database, id, await getActiveUserId(), "SYNCING", null);
    },
    async markPending(id: string, operationType: string) {
      await setStatus(
        database,
        id,
        await getActiveUserId(),
        statusForOperation(operationType),
        null,
      );
    },
    async markConflict(id: string, code = "REVISION_CONFLICT") {
      await setStatus(database, id, await getActiveUserId(), "CONFLICT", code);
    },
    async markFailed(id: string, code: string) {
      await setStatus(database, id, await getActiveUserId(), "FAILED", code);
    },

    async revokeJourneyAuthorization(journeyId: string) {
      await database.runAsync(
        "DELETE FROM ledger_actor_context WHERE user_id = ? AND journey_id = ?",
        await getActiveUserId(),
        journeyId,
      );
    },
  };
}

type PersonalPaymentRow = {
  id: string;
  journeyId: string;
  projectionUserId: string;
  ownerUserId: string;
  ownerMemberId: string;
  counterpartyMemberId: string;
  direction: "PAID" | "RECEIVED";
  amountMinor: number;
  currency: string;
  scale: number;
  occurredAt: string;
  economicDate: string;
  note: string | null;
  recordedEquivalentMinor: number | null;
  recordedEquivalentCurrency: string | null;
  recordedEquivalentScale: number | null;
  referenceRateDecimal: string | null;
  referenceRateDate: string | null;
  referenceSource: string | null;
  referenceProvenanceJson: string | null;
  serverRevision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  lastErrorCode: string | null;
};

const selectPayment = `SELECT id, projection_user_id AS projectionUserId,
  journey_id AS journeyId,
  owner_user_id AS ownerUserId, owner_member_id AS ownerMemberId,
  counterparty_member_id AS counterpartyMemberId, direction,
  amount_minor AS amountMinor, currency, scale, occurred_at AS occurredAt,
  economic_date AS economicDate, note,
  recorded_equivalent_minor AS recordedEquivalentMinor,
  recorded_equivalent_currency AS recordedEquivalentCurrency,
  recorded_equivalent_scale AS recordedEquivalentScale,
  reference_rate_decimal AS referenceRateDecimal,
  reference_rate_date AS referenceRateDate, reference_source AS referenceSource,
  reference_provenance_json AS referenceProvenanceJson,
  server_revision AS serverRevision, created_at AS createdAt, updated_at AS updatedAt,
  deleted_at AS deletedAt, sync_status AS syncStatus,
  last_synced_at AS lastSyncedAt, last_error_code AS lastErrorCode
  FROM ledger_personal_payment_records`;

const pendingStatuses = new Set<SyncStatus>([
  "PENDING_CREATE",
  "PENDING_UPDATE",
  "PENDING_DELETE",
  "SYNCING",
  "CONFLICT",
  "FAILED",
]);

function fromRow(row: PersonalPaymentRow): LocalPersonalPayment {
  const {
    projectionUserId: _projectionUserId,
    serverRevision,
    referenceProvenanceJson,
    ...record
  } = row;
  return {
    ...record,
    revision: serverRevision,
    referenceProvenance: referenceProvenanceJson
      ? (JSON.parse(referenceProvenanceJson) as Record<string, unknown>)
      : null,
  };
}

function paymentInput(command: PersonalPaymentCommand) {
  const { journeyId: _journeyId, ...input } = command;
  return {
    ...input,
    economicDate: command.economicDate ?? compatibilityEconomicDate(command.occurredAt),
  };
}

function canonicalRecord(record: PersonalSettlementPaymentDto): LocalPersonalPayment {
  return {
    ...record,
    note: record.note ?? null,
    recordedEquivalentMinor: record.recordedEquivalentMinor ?? null,
    recordedEquivalentCurrency: record.recordedEquivalentCurrency ?? null,
    recordedEquivalentScale: record.recordedEquivalentScale ?? null,
    referenceRateDecimal: record.referenceRateDecimal ?? null,
    referenceRateDate: record.referenceRateDate ?? null,
    referenceSource: record.referenceSource ?? null,
    referenceProvenance: record.referenceProvenance ?? null,
    syncStatus: "SYNCED",
    lastSyncedAt: new Date().toISOString(),
    lastErrorCode: null,
  };
}

async function attachProjections(
  database: LedgerPersonalPaymentDatabase,
  userId: string,
  records: LocalPersonalPayment[],
) {
  if (!records.length) return records;
  const rows = await database.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM ledger_personal_payment_fx_projections
     WHERE projection_user_id = ? AND payment_id IN (${records.map(() => "?").join(",")})`,
    userId,
    ...records.map((record) => record.id),
  );
  const projections = rows.map(projectionFromRow);
  return records.map((record) => ({
    ...record,
    fxProjections: projections.filter(
      (projection) =>
        projection.paymentId === record.id && projection.state !== "SUPERSEDED",
    ),
  }));
}

async function upsertProjection(
  database: LedgerPersonalPaymentDatabase,
  userId: string,
  value: PersonalSettlementPaymentFxProjectionDto,
) {
  await database.runAsync(
    `INSERT OR REPLACE INTO ledger_personal_payment_fx_projections (
      projection_user_id,id,payment_id,journey_id,target_currency,target_scale,
      policy_version,source_payment_revision,input_digest,economic_date,
      original_amount_minor,original_currency,original_scale,state,equivalent_minor,
      decimal_rate,rate_quote_id,reference_date,provider,provider_reference,
      source_reference,failure_category,revision,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    userId,
    value.id,
    value.paymentId,
    value.journeyId,
    value.targetCurrency,
    value.targetScale,
    value.policyVersion,
    value.sourcePaymentRevision,
    value.inputDigest,
    value.economicDate,
    value.originalAmountMinor,
    value.originalCurrency,
    value.originalScale,
    value.state,
    value.equivalentMinor,
    value.decimalRate,
    value.rateQuoteId,
    value.referenceDate,
    value.provider,
    value.providerReference,
    value.sourceReference,
    value.failureCategory,
    value.revision,
    value.createdAt,
    value.updatedAt,
  );
}

function projectionFromRow(
  row: Record<string, unknown>,
): PersonalSettlementPaymentFxProjectionDto {
  return {
    id: String(row.id),
    paymentId: String(row.payment_id),
    journeyId: String(row.journey_id),
    targetCurrency: String(row.target_currency),
    targetScale: Number(row.target_scale),
    policyVersion: "ECB_DAILY_V1",
    sourcePaymentRevision: Number(row.source_payment_revision),
    inputDigest: String(row.input_digest),
    economicDate: String(row.economic_date),
    originalAmountMinor: Number(row.original_amount_minor),
    originalCurrency: String(row.original_currency),
    originalScale: Number(row.original_scale),
    state: row.state as PersonalSettlementPaymentFxProjectionDto["state"],
    equivalentMinor: row.equivalent_minor == null ? null : Number(row.equivalent_minor),
    decimalRate: row.decimal_rate == null ? null : String(row.decimal_rate),
    rateQuoteId: row.rate_quote_id == null ? null : String(row.rate_quote_id),
    referenceDate: row.reference_date == null ? null : String(row.reference_date),
    provider: row.provider == null ? null : String(row.provider),
    providerReference:
      row.provider_reference == null ? null : String(row.provider_reference),
    sourceReference: row.source_reference == null ? null : String(row.source_reference),
    failureCategory: row.failure_category == null ? null : String(row.failure_category),
    revision: Number(row.revision),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

async function upsert(
  database: LedgerPersonalPaymentDatabase,
  projectionUserId: string,
  record: LocalPersonalPayment,
) {
  await database.runAsync(
    `INSERT OR REPLACE INTO ledger_personal_payment_records (
      id, projection_user_id, journey_id, owner_user_id, owner_member_id, counterparty_member_id,
      direction, amount_minor, currency, scale, occurred_at, economic_date, note,
      recorded_equivalent_minor, recorded_equivalent_currency,
      recorded_equivalent_scale, reference_rate_decimal, reference_rate_date,
      reference_source, reference_provenance_json, server_revision, created_at,
      updated_at, deleted_at, sync_status, last_synced_at, last_error_code
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    record.id,
    projectionUserId,
    record.journeyId,
    record.ownerUserId,
    record.ownerMemberId,
    record.counterpartyMemberId,
    record.direction,
    record.amountMinor,
    record.currency,
    record.scale,
    record.occurredAt,
    record.economicDate ?? compatibilityEconomicDate(record.occurredAt),
    record.note ?? null,
    record.recordedEquivalentMinor ?? null,
    record.recordedEquivalentCurrency ?? null,
    record.recordedEquivalentScale ?? null,
    record.referenceRateDecimal ?? null,
    record.referenceRateDate ?? null,
    record.referenceSource ?? null,
    record.referenceProvenance ? JSON.stringify(record.referenceProvenance) : null,
    record.revision,
    record.createdAt,
    record.updatedAt,
    record.deletedAt,
    record.syncStatus,
    record.lastSyncedAt,
    record.lastErrorCode,
  );
}

function compatibilityEconomicDate(occurredAt: string) {
  return new Date(occurredAt).toISOString().slice(0, 10);
}

async function enqueue(
  database: LedgerPersonalPaymentDatabase,
  record: LocalPersonalPayment,
  operationType: string,
  baseVersion: number | null,
  payload: unknown,
  userId: string,
) {
  const now = new Date().toISOString();
  await database.runAsync(
    `INSERT INTO sync_operations (
      id, trip_id, entity_type, entity_id, operation_type, idempotency_key,
      base_version, payload_json, owner_user_id, status, attempt_count,
      next_attempt_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, NULL, ?, ?)`,
    createUuid(),
    record.journeyId,
    entityType,
    record.id,
    operationType,
    createUuid(),
    baseVersion,
    JSON.stringify(payload),
    userId,
    now,
    now,
  );
}

async function findCoalescibleCreate(
  database: LedgerPersonalPaymentDatabase,
  id: string,
  userId: string,
) {
  return database.getFirstAsync<{ id: string }>(
    `SELECT id FROM sync_operations
     WHERE owner_user_id = ? AND entity_type = ? AND entity_id = ?
       AND operation_type = ? AND status = 'PENDING' AND attempt_count = 0
       AND NOT EXISTS (
         SELECT 1 FROM sync_operations processing
         WHERE processing.owner_user_id = sync_operations.owner_user_id
           AND processing.entity_type = sync_operations.entity_type
           AND processing.entity_id = sync_operations.entity_id
           AND processing.status = 'PROCESSING'
       )
     ORDER BY created_at, rowid LIMIT 1`,
    userId,
    entityType,
    id,
    personalPaymentOperations.create,
  );
}

async function coalesceIntoCreate(
  database: LedgerPersonalPaymentDatabase,
  createOperationId: string,
  entityId: string,
  userId: string,
  payload: unknown,
) {
  const now = new Date().toISOString();
  await database.runAsync(
    `UPDATE sync_operations SET payload_json = ?, status = 'PENDING', attempt_count = 0,
       next_attempt_at = NULL, last_error_code = NULL, last_error_message = NULL,
       claim_owner = NULL, lease_expires_at = NULL, updated_at = ?
     WHERE id = ? AND owner_user_id = ?`,
    JSON.stringify(payload),
    now,
    createOperationId,
    userId,
  );
  await database.runAsync(
    `UPDATE sync_operations SET status = 'COMPLETED', next_attempt_at = NULL,
       last_error_code = NULL, last_error_message = NULL, claim_owner = NULL,
       lease_expires_at = NULL, updated_at = ?
     WHERE owner_user_id = ? AND entity_type = ? AND entity_id = ?
       AND operation_type = ? AND status NOT IN ('PROCESSING', 'COMPLETED')`,
    now,
    userId,
    entityType,
    entityId,
    personalPaymentOperations.update,
  );
}

async function completeSupersededMutations(
  database: LedgerPersonalPaymentDatabase,
  userId: string,
  entityId: string,
  completedOperationId: string,
) {
  const now = new Date().toISOString();
  await database.runAsync(
    `UPDATE sync_operations SET status = 'COMPLETED', next_attempt_at = NULL,
       last_error_code = NULL, last_error_message = NULL, claim_owner = NULL,
       lease_expires_at = NULL, updated_at = ?
     WHERE owner_user_id = ? AND entity_type = ? AND entity_id = ?
       AND operation_type IN (?, ?) AND status IN ('PENDING', 'RETRYABLE', 'FAILED', 'COMPLETED')
       AND rowid < (
         SELECT rowid FROM sync_operations WHERE id = ? AND owner_user_id = ?
           AND operation_type = ?
       )`,
    now,
    userId,
    entityType,
    entityId,
    personalPaymentOperations.create,
    personalPaymentOperations.update,
    completedOperationId,
    userId,
    personalPaymentOperations.update,
  );
}

async function requireActor(
  database: LedgerPersonalPaymentDatabase,
  userId: string,
  journeyId: string,
) {
  const actor = await database.getFirstAsync<{ memberId: string | null }>(
    `SELECT member_id AS memberId FROM ledger_actor_context
     WHERE user_id = ? AND journey_id = ?`,
    userId,
    journeyId,
  );
  if (!actor?.memberId) throw new Error("Current Journey membership is required.");
  return actor.memberId;
}

async function requireCounterparty(
  database: LedgerPersonalPaymentDatabase,
  journeyId: string,
  ownerMemberId: string,
  counterpartyMemberId: string,
) {
  if (counterpartyMemberId === ownerMemberId)
    throw new Error("A Personal Payment counterparty must be another member.");
  const member = await database.getFirstAsync<{ id: string }>(
    "SELECT id FROM ledger_members WHERE journey_id = ? AND id = ?",
    journeyId,
    counterpartyMemberId,
  );
  if (!member) throw new Error("The Personal Payment counterparty was not found.");
}

async function applyCanonicalRecord(
  database: LedgerPersonalPaymentDatabase,
  userId: string,
  canonical: PersonalSettlementPaymentDto,
) {
  const current = await database.getFirstAsync<PersonalPaymentRow>(
    `${selectPayment} WHERE id = ? AND projection_user_id = ?`,
    canonical.id,
    userId,
  );
  if (current && pendingStatuses.has(current.syncStatus)) return;
  if (current && current.serverRevision > canonical.revision) return;
  await upsert(database, userId, canonicalRecord(canonical));
}

async function requireOwned(
  database: LedgerPersonalPaymentDatabase,
  id: string,
  userId: string,
) {
  const row = await database.getFirstAsync<PersonalPaymentRow>(
    `${selectPayment} WHERE id = ? AND projection_user_id = ? AND owner_user_id = ?`,
    id,
    userId,
    userId,
  );
  if (!row) throw new Error("Personal Payment was not found.");
  return fromRow(row);
}

function statusForOperation(operationType: string): SyncStatus {
  if (operationType === personalPaymentOperations.delete) return "PENDING_DELETE";
  if (operationType === personalPaymentOperations.create) return "PENDING_CREATE";
  return "PENDING_UPDATE";
}

async function setStatus(
  database: LedgerPersonalPaymentDatabase,
  id: string,
  userId: string,
  status: SyncStatus,
  errorCode: string | null,
) {
  await database.runAsync(
    `UPDATE ledger_personal_payment_records SET sync_status = ?, last_error_code = ?,
      updated_at = ? WHERE id = ? AND projection_user_id = ?`,
    status,
    errorCode,
    new Date().toISOString(),
    id,
    userId,
  );
}

async function saveCursor(
  database: LedgerPersonalPaymentDatabase,
  userId: string,
  journeyId: string,
  cursor: string | null,
  serverTime: string,
) {
  await database.runAsync(
    `INSERT OR REPLACE INTO ledger_personal_payment_sync_cursors
      (user_id, journey_id, cursor, server_time, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    userId,
    journeyId,
    cursor,
    serverTime,
    new Date().toISOString(),
  );
}

function createUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const value = Math.floor(Math.random() * 16);
    return (token === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}
