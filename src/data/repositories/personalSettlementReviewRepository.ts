import type * as SQLite from "expo-sqlite";

import type {
  PersonalSettlementReviewResponse,
  PersonalSettlementStatementDto,
} from "@/data/api/ledgerSettlementContracts";

type Database = Pick<
  SQLite.SQLiteDatabase,
  "getFirstAsync" | "runAsync" | "withTransactionAsync"
>;

export type LocalPersonalSettlementReview = PersonalSettlementReviewResponse & {
  syncStatus: "SYNCED" | "PENDING" | "SYNCING" | "CONFLICT" | "FAILED";
  pendingOperationId: string | null;
  lastErrorCode: string | null;
};

type Row = {
  statementJson: string;
  statementFingerprint: string;
  checkpointJson: string | null;
  deltaJson: string | null;
  coverageJson: string;
  syncStatus: LocalPersonalSettlementReview["syncStatus"];
  pendingOperationId: string | null;
  lastErrorCode: string | null;
};

const selectState = `SELECT statement_json AS statementJson,
  statement_fingerprint AS statementFingerprint, checkpoint_json AS checkpointJson,
  delta_json AS deltaJson, coverage_json AS coverageJson, sync_status AS syncStatus,
  pending_operation_id AS pendingOperationId, last_error_code AS lastErrorCode
  FROM ledger_personal_settlement_review_state`;

export function createPersonalSettlementReviewRepository(
  database: Database,
  getActiveUserId: () => Promise<string>,
) {
  return {
    async get(journeyId: string) {
      const userId = await getActiveUserId();
      const row = await database.getFirstAsync<Row>(
        `${selectState} WHERE user_id = ? AND journey_id = ?`,
        userId,
        journeyId,
      );
      return row ? fromRow(row) : null;
    },

    async applyRemote(journeyId: string, response: PersonalSettlementReviewResponse) {
      const userId = await getActiveUserId();
      const current = await database.getFirstAsync<Row>(
        `${selectState} WHERE user_id = ? AND journey_id = ?`,
        userId,
        journeyId,
      );
      await save(
        database,
        userId,
        journeyId,
        response,
        current?.syncStatus === "PENDING" || current?.syncStatus === "SYNCING"
          ? current.syncStatus
          : "SYNCED",
        current?.pendingOperationId ?? null,
        current?.lastErrorCode ?? null,
      );
    },

    async checkpoint(journeyId: string) {
      const userId = await getActiveUserId();
      const current = await database.getFirstAsync<Row>(
        `${selectState} WHERE user_id = ? AND journey_id = ?`,
        userId,
        journeyId,
      );
      if (!current) throw new Error("Open the current Settlement statement first.");
      const id = createUuid();
      const input = {
        id,
        statementFingerprint: current.statementFingerprint,
        operationId: id,
      };
      const now = new Date().toISOString();
      await database.withTransactionAsync(async () => {
        await database.runAsync(
          `UPDATE ledger_personal_settlement_review_state SET
            sync_status = 'PENDING', pending_operation_id = ?, last_error_code = NULL,
            updated_at = ? WHERE user_id = ? AND journey_id = ?`,
          id,
          now,
          userId,
          journeyId,
        );
        await database.runAsync(
          `INSERT INTO sync_operations (
            id, trip_id, entity_type, entity_id, operation_type, idempotency_key,
            base_version, payload_json, owner_user_id, status, attempt_count,
            created_at, updated_at
          ) VALUES (?, ?, 'settlement_review', ?, 'CREATE_SETTLEMENT_REVIEW_CHECKPOINT',
            ?, NULL, ?, ?, 'PENDING', 0, ?, ?)`,
          id,
          journeyId,
          journeyId,
          id,
          JSON.stringify(input),
          userId,
          now,
          now,
        );
      });
      return id;
    },

    async markSynced(
      journeyId: string,
      operationId: string,
      response: PersonalSettlementReviewResponse,
    ) {
      const userId = await getActiveUserId();
      await save(database, userId, journeyId, response, "SYNCED", null, null);
      await database.runAsync(
        `UPDATE ledger_personal_settlement_review_state SET pending_operation_id = NULL
         WHERE user_id = ? AND journey_id = ? AND pending_operation_id = ?`,
        userId,
        journeyId,
        operationId,
      );
    },

    async markRejected(journeyId: string, code: string) {
      const userId = await getActiveUserId();
      await database.runAsync(
        `UPDATE ledger_personal_settlement_review_state SET
          sync_status = 'CONFLICT', last_error_code = ?, updated_at = ?
         WHERE user_id = ? AND journey_id = ?`,
        code,
        new Date().toISOString(),
        userId,
        journeyId,
      );
    },
  };
}

function fromRow(row: Row): LocalPersonalSettlementReview {
  return {
    statement: JSON.parse(row.statementJson) as PersonalSettlementStatementDto,
    statementFingerprint: row.statementFingerprint,
    checkpoint: row.checkpointJson ? JSON.parse(row.checkpointJson) : null,
    delta: row.deltaJson ? JSON.parse(row.deltaJson) : null,
    coverage: JSON.parse(row.coverageJson),
    syncStatus: row.syncStatus,
    pendingOperationId: row.pendingOperationId,
    lastErrorCode: row.lastErrorCode,
  };
}

async function save(
  database: Database,
  userId: string,
  journeyId: string,
  response: PersonalSettlementReviewResponse,
  status: LocalPersonalSettlementReview["syncStatus"],
  operationId: string | null,
  errorCode: string | null,
) {
  await database.runAsync(
    `INSERT INTO ledger_personal_settlement_review_state (
      user_id, journey_id, statement_json, statement_fingerprint,
      checkpoint_json, delta_json, coverage_json, sync_status, pending_operation_id,
      last_error_code, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id, journey_id) DO UPDATE SET
      statement_json = excluded.statement_json,
      statement_fingerprint = excluded.statement_fingerprint,
      checkpoint_json = excluded.checkpoint_json,
      delta_json = excluded.delta_json,
      coverage_json = excluded.coverage_json,
      sync_status = excluded.sync_status,
      pending_operation_id = excluded.pending_operation_id,
      last_error_code = excluded.last_error_code,
      updated_at = excluded.updated_at`,
    userId,
    journeyId,
    JSON.stringify(response.statement),
    response.statementFingerprint,
    response.checkpoint ? JSON.stringify(response.checkpoint) : null,
    response.delta ? JSON.stringify(response.delta) : null,
    JSON.stringify(response.coverage),
    status,
    operationId,
    errorCode,
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
