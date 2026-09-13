import type * as SQLite from "expo-sqlite";

import type { ReceiptDto, ReceiptSuggestion } from "@/data/api/ledgerReceiptContracts";
import { createLocalId } from "@/domain/localId";

const processClaimOwner = createLocalId("receipt-process");

export type ReceiptAsset = {
  id: string;
  serverId: string | null;
  journeyId: string;
  expenseId: string | null;
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

export function createLedgerReceiptRepository(database: Database) {
  return {
    async importReceipt(input: {
      id: string;
      journeyId: string;
      expenseId?: string | null;
      localUri: string;
      mimeType: ReceiptAsset["mimeType"];
      sizeBytes: number;
      sha256: string;
    }) {
      if (!/^file:\/\//.test(input.localUri) || !/^[a-f0-9]{64}$/.test(input.sha256))
        throw new Error("Receipt must be copied and hashed before import.");
      const now = new Date().toISOString();
      await database.withTransactionAsync(async () => {
        await database.runAsync(
          `INSERT INTO ledger_receipt_assets (
            id, journey_id, expense_id, local_uri, mime_type, size_bytes, sha256,
            upload_status, ocr_status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', ?, ?)`,
          input.id,
          input.journeyId,
          input.expenseId ?? null,
          input.localUri,
          input.mimeType,
          input.sizeBytes,
          input.sha256,
          now,
          now,
        );
        await enqueue(database, input.journeyId, input.id, "UPLOAD_RECEIPT", now);
        await enqueue(database, input.journeyId, input.id, "OCR_RECEIPT", now);
        if (input.expenseId)
          await enqueue(database, input.journeyId, input.id, "LINK_RECEIPT", now);
      });
      return this.getReceipt(input.id);
    },

    async attachExpense(assetId: string, expenseId: string) {
      const asset = await requireReceipt(database, assetId);
      const now = new Date().toISOString();
      await database.withTransactionAsync(async () => {
        await database.runAsync(
          "UPDATE ledger_receipt_assets SET expense_id = ?, updated_at = ? WHERE id = ?",
          expenseId,
          now,
          assetId,
        );
        await enqueue(database, asset.journeyId, assetId, "LINK_RECEIPT", now);
      });
    },

    async getReceipt(id: string) {
      return readReceipt(database, id);
    },
    async listReceipts(journeyId: string) {
      const rows = await database.getAllAsync<ReceiptRow>(
        `${receiptSelect} WHERE journey_id = ? ORDER BY created_at DESC`,
        journeyId,
      );
      return rows.map(mapReceipt);
    },
    async listPendingOperations() {
      return database.getAllAsync<AssetOperation>(
        `SELECT id, journey_id AS journeyId, asset_id AS assetId,
        operation_type AS operationType, idempotency_key AS idempotencyKey, status,
        attempt_count AS attemptCount, next_attempt_at AS nextAttemptAt
        FROM ledger_asset_operations WHERE status IN ('PENDING', 'RETRYABLE')
          AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
        ORDER BY created_at`,
        new Date().toISOString(),
      );
    },
    async claimOperation(id: string) {
      const now = new Date().toISOString();
      const result = await database.runAsync(
        `UPDATE ledger_asset_operations SET status = 'PROCESSING', claim_owner = ?,
          lease_expires_at = ?, updated_at = ?
         WHERE id = ? AND status IN ('PENDING', 'RETRYABLE')
           AND (next_attempt_at IS NULL OR next_attempt_at <= ?)`,
        processClaimOwner,
        new Date(Date.now() + 5 * 60_000).toISOString(),
        now,
        id,
        now,
      );
      return result.changes === 1;
    },
    async recoverInterruptedOperations() {
      const now = new Date().toISOString();
      await database.withTransactionAsync(async () => {
        await database.runAsync(
          `UPDATE ledger_asset_operations SET status = 'RETRYABLE',
            attempt_count = attempt_count + 1, next_attempt_at = ?, claim_owner = NULL,
            lease_expires_at = NULL, updated_at = ? WHERE status = 'PROCESSING'
            AND (claim_owner IS NULL OR claim_owner <> ? OR lease_expires_at <= ?)`,
          now,
          now,
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
      await database.runAsync(
        `UPDATE ledger_asset_operations SET status = ?, attempt_count = attempt_count + CASE WHEN ? = 'RETRYABLE' THEN 1 ELSE 0 END,
        last_error_code = ?, next_attempt_at = ?, claim_owner = NULL,
        lease_expires_at = NULL, updated_at = ? WHERE id = ?`,
        status,
        status,
        error,
        nextAttemptAt,
        new Date().toISOString(),
        id,
      );
    },
    async markUploading(id: string) {
      await setAsset(database, id, "upload_status", "UPLOADING");
    },
    async markUploadFailed(id: string) {
      await setAsset(database, id, "upload_status", "FAILED");
    },
    async updateLocalUri(id: string, localUri: string) {
      await database.runAsync(
        "UPDATE ledger_receipt_assets SET local_uri = ?, updated_at = ? WHERE id = ?",
        localUri,
        new Date().toISOString(),
        id,
      );
    },
    async markOcrStatus(id: string, status: ReceiptAsset["ocrStatus"]) {
      await setAsset(database, id, "ocr_status", status);
    },
    async reconcile(assetId: string, receipt: ReceiptDto) {
      await database.runAsync(
        `UPDATE ledger_receipt_assets SET server_id = ?, expense_id = COALESCE(expense_id, ?), object_path = ?,
        upload_status = ?, ocr_status = ?, ocr_suggestion_json = ?, updated_at = ? WHERE id = ?`,
        receipt.id,
        receipt.expenseId,
        receipt.objectPath,
        receipt.uploadStatus,
        receipt.ocrStatus,
        receipt.ocrSuggestion ? JSON.stringify(receipt.ocrSuggestion) : null,
        receipt.updatedAt,
        assetId,
      );
    },
  };
}

type ReceiptRow = Omit<ReceiptAsset, "ocrSuggestion" | "createdAt" | "updatedAt"> & {
  ocrSuggestionJson: string | null;
  createdAt: string;
  updatedAt: string;
};
const receiptSelect = `SELECT id, server_id AS serverId, journey_id AS journeyId, expense_id AS expenseId,
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
async function readReceipt(database: Database, id: string) {
  const row = await database.getFirstAsync<ReceiptRow>(
    `${receiptSelect} WHERE id = ?`,
    id,
  );
  return row ? mapReceipt(row) : null;
}
async function requireReceipt(database: Database, id: string) {
  const value = await readReceipt(database, id);
  if (!value) throw new Error("Receipt is missing from local storage.");
  return value;
}
async function enqueue(
  database: Database,
  journeyId: string,
  assetId: string,
  operationType: AssetOperation["operationType"],
  now: string,
) {
  await database.runAsync(
    `INSERT OR IGNORE INTO ledger_asset_operations (id, journey_id, asset_id, operation_type, idempotency_key,
    status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
    createLocalId("asset-operation"),
    journeyId,
    assetId,
    operationType,
    createLocalId(`receipt-${operationType.toLowerCase()}`),
    now,
    now,
  );
}
async function setAsset(
  database: Database,
  id: string,
  column: "upload_status" | "ocr_status",
  value: string,
) {
  await database.runAsync(
    `UPDATE ledger_receipt_assets SET ${column} = ?, updated_at = ? WHERE id = ?`,
    value,
    new Date().toISOString(),
    id,
  );
}
