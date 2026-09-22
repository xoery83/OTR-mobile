import type * as SQLite from "expo-sqlite";

import type { ReceiptDto, ReceiptSuggestion } from "@/data/api/ledgerReceiptContracts";
import { createLocalId } from "@/domain/localId";

const processClaimOwner = createLocalId("receipt-process");

export type ReceiptAsset = {
  id: string;
  serverId: string | null;
  journeyId: string;
  expenseId: string | null;
  personalPaymentId: string | null;
  personalPaymentLinkStatus: "ACTIVE" | "DELETE_PENDING" | null;
  localUri: string | null;
  mimeType: "image/jpeg" | "image/png" | "application/pdf";
  sizeBytes: number;
  sha256: string;
  objectPath: string | null;
  uploadStatus: "PENDING" | "UPLOADING" | "UPLOADED" | "FAILED";
  ocrStatus: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  ocrSuggestion: ReceiptSuggestion | null;
  createdAt: string;
  updatedAt: string;
};

export type AssetOperation = {
  id: string;
  ownerUserId: string;
  journeyId: string;
  assetId: string;
  operationType: "UPLOAD_RECEIPT" | "OCR_RECEIPT" | "LINK_RECEIPT";
  idempotencyKey: string;
  status: "PENDING" | "PROCESSING" | "RETRYABLE" | "FAILED" | "COMPLETED";
  attemptCount: number;
  nextAttemptAt: string | null;
};

type Database = Pick<
  SQLite.SQLiteDatabase,
  "getAllAsync" | "getFirstAsync" | "runAsync" | "withTransactionAsync"
>;

export function createLedgerReceiptRepository(
  database: Database,
  getActiveUserId: () => Promise<string> = defaultGetActiveUserId,
) {
  return {
    async importReceipt(input: {
      id: string;
      journeyId: string;
      expenseId?: string | null;
      personalPaymentId?: string | null;
      localUri: string;
      mimeType: ReceiptAsset["mimeType"];
      sizeBytes: number;
      sha256: string;
      requestOcr: boolean;
    }) {
      if (!/^file:\/\//.test(input.localUri) || !/^[a-f0-9]{64}$/.test(input.sha256))
        throw new Error("Receipt must be copied and hashed before import.");
      const now = new Date().toISOString();
      const userId = await getActiveUserId();
      await database.withTransactionAsync(async () => {
        await database.runAsync(
          `INSERT INTO ledger_receipt_assets (
            id, journey_id, expense_id, personal_payment_id, personal_payment_link_status,
            local_uri, mime_type, size_bytes, sha256,
            upload_status, ocr_status, created_at, updated_at, local_owner_user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', ?, ?, ?)`,
          input.id,
          input.journeyId,
          input.expenseId ?? null,
          input.personalPaymentId ?? null,
          input.personalPaymentId ? "ACTIVE" : null,
          input.localUri,
          input.mimeType,
          input.sizeBytes,
          input.sha256,
          now,
          now,
          userId,
        );
        await enqueue(database, input.journeyId, input.id, "UPLOAD_RECEIPT", now, userId);
        if (input.requestOcr)
          await enqueue(database, input.journeyId, input.id, "OCR_RECEIPT", now, userId);
        if (input.expenseId)
          await enqueue(database, input.journeyId, input.id, "LINK_RECEIPT", now, userId);
        if (input.personalPaymentId)
          await enqueue(database, input.journeyId, input.id, "LINK_RECEIPT", now, userId);
      });
      return this.getReceipt(input.id);
    },

    async attachExpense(assetId: string, expenseId: string) {
      const userId = await getActiveUserId();
      const asset = await requireReceipt(database, assetId, userId);
      const now = new Date().toISOString();
      await database.withTransactionAsync(async () => {
        await database.runAsync(
          `UPDATE ledger_receipt_assets SET expense_id = ?, local_owner_user_id = ?,
           updated_at = ? WHERE id = ?`,
          expenseId,
          userId,
          now,
          assetId,
        );
        await enqueue(database, asset.journeyId, assetId, "LINK_RECEIPT", now, userId);
      });
    },

    async attachPersonalPayment(assetId: string, personalPaymentId: string) {
      const userId = await getActiveUserId();
      const asset = await requireReceipt(database, assetId, userId);
      const now = new Date().toISOString();
      await database.withTransactionAsync(async () => {
        await database.runAsync(
          `UPDATE ledger_receipt_assets SET personal_payment_id = ?,
           personal_payment_link_status = 'ACTIVE', local_owner_user_id = ?,
           updated_at = ? WHERE id = ?`,
          personalPaymentId,
          userId,
          now,
          assetId,
        );
        await enqueue(database, asset.journeyId, assetId, "LINK_RECEIPT", now, userId);
      });
    },
    async detachPersonalPayment(assetId: string) {
      const userId = await getActiveUserId();
      const asset = await requireReceipt(database, assetId, userId);
      if (!asset.personalPaymentId) return;
      const now = new Date().toISOString();
      await database.withTransactionAsync(async () => {
        await database.runAsync(
          `UPDATE ledger_receipt_assets SET personal_payment_link_status = 'DELETE_PENDING',
           updated_at = ? WHERE id = ?`,
          now,
          assetId,
        );
        await database.runAsync(
          `UPDATE ledger_asset_operations SET idempotency_key = ?, status = 'PENDING',
           attempt_count = 0, next_attempt_at = NULL, last_error_code = NULL,
           updated_at = ? WHERE asset_id = ? AND operation_type = 'LINK_RECEIPT'`,
          createLocalId("receipt-unlink-personal-payment"),
          now,
          assetId,
        );
      });
    },
    async markPersonalPaymentUnlinked(assetId: string) {
      await database.runAsync(
        `UPDATE ledger_receipt_assets SET personal_payment_id = NULL,
         personal_payment_link_status = NULL, updated_at = ? WHERE id = ?`,
        new Date().toISOString(),
        assetId,
      );
    },

    async getReceipt(id: string) {
      return readReceipt(database, id, await getActiveUserId());
    },
    async listReceipts(journeyId: string) {
      const userId = await getActiveUserId();
      const rows = await database.getAllAsync<ReceiptRow>(
        `${receiptSelect} WHERE journey_id = ?
         AND (server_id IS NOT NULL OR local_owner_user_id = ?)
         AND EXISTS (SELECT 1 FROM ledger_actor_context actor
           WHERE actor.user_id = ? AND actor.journey_id = ledger_receipt_assets.journey_id)
         ORDER BY created_at DESC`,
        journeyId,
        userId,
        userId,
      );
      return rows.map(mapReceipt);
    },
    async listPersonalPaymentAttachments(personalPaymentId: string) {
      const userId = await getActiveUserId();
      const rows = await database.getAllAsync<ReceiptRow>(
        `${receiptSelect} WHERE personal_payment_id = ?
         AND (server_id IS NOT NULL OR local_owner_user_id = ?)
         ORDER BY created_at, id`,
        personalPaymentId,
        userId,
      );
      return rows.map(mapReceipt);
    },
    async applyPersonalPaymentAttachments(
      personalPaymentId: string,
      attachments: ReceiptDto[],
    ) {
      for (const receipt of attachments) {
        const existing = await database.getFirstAsync<{
          id: string;
          localUri: string | null;
        }>(
          "SELECT id, local_uri AS localUri FROM ledger_receipt_assets WHERE server_id = ? OR id = ?",
          receipt.id,
          receipt.id,
        );
        await database.runAsync(
          `INSERT OR REPLACE INTO ledger_receipt_assets (
            id, server_id, journey_id, expense_id, personal_payment_id,
            personal_payment_link_status, local_uri,
            mime_type, size_bytes, sha256, object_path, upload_status, ocr_status,
            ocr_suggestion_json, created_at, updated_at, local_owner_user_id
          ) VALUES (?, ?, ?, NULL, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
          existing?.id ?? receipt.id,
          receipt.id,
          receipt.journeyId,
          personalPaymentId,
          existing?.localUri ?? null,
          receipt.mimeType,
          receipt.sizeBytes,
          receipt.sha256,
          receipt.objectPath,
          receipt.uploadStatus,
          receipt.ocrStatus,
          receipt.ocrSuggestion ? JSON.stringify(receipt.ocrSuggestion) : null,
          receipt.createdAt,
          receipt.updatedAt,
        );
      }
    },
    async listPendingOperations() {
      const userId = await getActiveUserId();
      return database.getAllAsync<AssetOperation>(
        `SELECT id, journey_id AS journeyId, asset_id AS assetId,
        operation_type AS operationType, idempotency_key AS idempotencyKey,
        owner_user_id AS ownerUserId, status,
        attempt_count AS attemptCount, next_attempt_at AS nextAttemptAt
        FROM ledger_asset_operations WHERE owner_user_id = ?
          AND status IN ('PENDING', 'RETRYABLE')
          AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
        ORDER BY created_at`,
        userId,
        new Date().toISOString(),
      );
    },
    async claimOperation(id: string) {
      const now = new Date().toISOString();
      const userId = await getActiveUserId();
      const result = await database.runAsync(
        `UPDATE ledger_asset_operations SET status = 'PROCESSING', claim_owner = ?,
          lease_expires_at = ?, updated_at = ?
         WHERE id = ? AND owner_user_id = ? AND status IN ('PENDING', 'RETRYABLE')
           AND (next_attempt_at IS NULL OR next_attempt_at <= ?)`,
        processClaimOwner,
        new Date(Date.now() + 5 * 60_000).toISOString(),
        now,
        id,
        userId,
        now,
      );
      return result.changes === 1;
    },
    async recoverInterruptedOperations() {
      const now = new Date().toISOString();
      const userId = await getActiveUserId();
      await database.withTransactionAsync(async () => {
        await database.runAsync(
          `UPDATE ledger_asset_operations SET status = 'RETRYABLE',
            attempt_count = attempt_count + 1, next_attempt_at = ?, claim_owner = NULL,
            lease_expires_at = NULL, updated_at = ? WHERE status = 'PROCESSING'
            AND owner_user_id = ?
            AND (claim_owner IS NULL OR claim_owner <> ? OR lease_expires_at <= ?)`,
          now,
          now,
          userId,
          processClaimOwner,
          now,
        );
      });
    },
    async markOperation(
      id: string,
      status: AssetOperation["status"],
      error: string | null = null,
      nextAttemptAt: string | null = null,
    ) {
      const userId = await getActiveUserId();
      await database.runAsync(
        `UPDATE ledger_asset_operations SET status = ?, attempt_count = attempt_count + CASE WHEN ? = 'RETRYABLE' THEN 1 ELSE 0 END,
        last_error_code = ?, next_attempt_at = ?, claim_owner = NULL,
        lease_expires_at = NULL, updated_at = ? WHERE id = ? AND owner_user_id = ?`,
        status,
        status,
        error,
        nextAttemptAt,
        new Date().toISOString(),
        id,
        userId,
      );
    },
    async markUploading(id: string) {
      await setAsset(database, id, "upload_status", "UPLOADING", await getActiveUserId());
    },
    async markUploadFailed(id: string) {
      await setAsset(database, id, "upload_status", "FAILED", await getActiveUserId());
    },
    async updateLocalUri(id: string, localUri: string) {
      const userId = await getActiveUserId();
      await database.runAsync(
        `UPDATE ledger_receipt_assets SET local_uri = ?, updated_at = ?
         WHERE id = ? AND local_owner_user_id = ?`,
        localUri,
        new Date().toISOString(),
        id,
        userId,
      );
    },
    async markOcrStatus(id: string, status: ReceiptAsset["ocrStatus"]) {
      await setAsset(database, id, "ocr_status", status, await getActiveUserId());
    },
    async reconcile(assetId: string, receipt: ReceiptDto) {
      const userId = await getActiveUserId();
      await database.runAsync(
        `UPDATE ledger_receipt_assets SET server_id = ?, expense_id = COALESCE(expense_id, ?), object_path = ?,
        upload_status = ?, ocr_status = ?, ocr_suggestion_json = ?, local_owner_user_id = NULL,
        updated_at = ? WHERE id = ? AND local_owner_user_id = ?`,
        receipt.id,
        receipt.expenseId,
        receipt.objectPath,
        receipt.uploadStatus,
        receipt.ocrStatus,
        receipt.ocrSuggestion ? JSON.stringify(receipt.ocrSuggestion) : null,
        receipt.updatedAt,
        assetId,
        userId,
      );
    },
  };
}

async function defaultGetActiveUserId() {
  return (await import("@/data/auth/authRepository")).requireActiveUserId();
}

type ReceiptRow = Omit<ReceiptAsset, "ocrSuggestion" | "createdAt" | "updatedAt"> & {
  ocrSuggestionJson: string | null;
  createdAt: string;
  updatedAt: string;
};
const receiptSelect = `SELECT id, server_id AS serverId, journey_id AS journeyId, expense_id AS expenseId,
  personal_payment_id AS personalPaymentId,
  personal_payment_link_status AS personalPaymentLinkStatus,
  local_uri AS localUri, mime_type AS mimeType, size_bytes AS sizeBytes, sha256, object_path AS objectPath,
  upload_status AS uploadStatus, ocr_status AS ocrStatus, ocr_suggestion_json AS ocrSuggestionJson,
  created_at AS createdAt, updated_at AS updatedAt FROM ledger_receipt_assets`;
function mapReceipt(row: ReceiptRow): ReceiptAsset {
  return {
    ...row,
    ocrSuggestion: row.ocrSuggestionJson
      ? (JSON.parse(row.ocrSuggestionJson) as ReceiptSuggestion)
      : null,
    updatedAt: row.updatedAt,
  } as ReceiptAsset;
}
async function readReceipt(database: Database, id: string, userId: string) {
  const row = await database.getFirstAsync<ReceiptRow>(
    `${receiptSelect} WHERE id = ?
     AND (server_id IS NOT NULL OR local_owner_user_id = ?)
     AND EXISTS (SELECT 1 FROM ledger_actor_context actor
       WHERE actor.user_id = ? AND actor.journey_id = ledger_receipt_assets.journey_id)`,
    id,
    userId,
    userId,
  );
  return row ? mapReceipt(row) : null;
}
async function requireReceipt(database: Database, id: string, userId: string) {
  const value = await readReceipt(database, id, userId);
  if (!value) throw new Error("Receipt is missing from local storage.");
  return value;
}
async function enqueue(
  database: Database,
  journeyId: string,
  assetId: string,
  operationType: AssetOperation["operationType"],
  now: string,
  userId: string,
) {
  await database.runAsync(
    `INSERT OR IGNORE INTO ledger_asset_operations (id, journey_id, asset_id, operation_type, idempotency_key,
    owner_user_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
    createLocalId("asset-operation"),
    journeyId,
    assetId,
    operationType,
    createLocalId(`receipt-${operationType.toLowerCase()}`),
    userId,
    now,
    now,
  );
}
async function setAsset(
  database: Database,
  id: string,
  column: "upload_status" | "ocr_status",
  value: string,
  userId: string,
) {
  await database.runAsync(
    `UPDATE ledger_receipt_assets SET ${column} = ?, updated_at = ?
     WHERE id = ? AND local_owner_user_id = ?`,
    value,
    new Date().toISOString(),
    id,
    userId,
  );
}
