import type * as SQLite from "expo-sqlite";

import type { ReceiptDto, ReceiptSuggestion } from "@/data/api/ledgerReceiptContracts";
import { createLocalId } from "@/domain/localId";
import { MAX_EXPENSE_ATTACHMENTS } from "@/domain/ledger/attachments";

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
  originalFilename?: string | null;
  originalMimeType?: string | null;
  originalSizeBytes?: number | null;
  width?: number | null;
  height?: number | null;
  objectPath: string | null;
  deletedAt: string | null;
  localDeletedByUserId: string | null;
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
  operationType: "UPLOAD_RECEIPT" | "OCR_RECEIPT" | "LINK_RECEIPT" | "DELETE_RECEIPT";
  idempotencyKey: string;
  status: "PENDING" | "PROCESSING" | "RETRYABLE" | "FAILED" | "COMPLETED";
  attemptCount: number;
  nextAttemptAt: string | null;
};

type Database = Pick<
  SQLite.SQLiteDatabase,
  "getAllAsync" | "getFirstAsync" | "runAsync" | "withTransactionAsync"
>;

export type PreparedExpenseReceipt = Pick<
  ReceiptAsset,
  "id" | "mimeType" | "sizeBytes" | "sha256"
> & {
  localUri: string;
  originalFilename?: string | null;
  originalMimeType?: string | null;
  originalSizeBytes?: number | null;
  width?: number | null;
  height?: number | null;
};

// Called inside the Expense create transaction; no nested transaction or OCR.
export async function insertExpenseReceiptInTransaction(
  database: Database,
  receipt: PreparedExpenseReceipt,
  expenseId: string,
  journeyId: string,
  userId: string,
  now: string,
) {
  if (!receipt.localUri?.startsWith("file://") || !/^[a-f0-9]{64}$/.test(receipt.sha256))
    throw new Error("Receipt must have a durable local file and SHA-256.");
  await database.runAsync(
    `INSERT INTO ledger_receipt_assets (
      id, journey_id, expense_id, local_uri, mime_type, size_bytes, sha256,
      upload_status, ocr_status, created_at, updated_at, local_owner_user_id,
      original_filename, original_mime_type, original_size_bytes, width, height
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?)`,
    receipt.id,
    journeyId,
    expenseId,
    receipt.localUri,
    receipt.mimeType,
    receipt.sizeBytes,
    receipt.sha256,
    now,
    now,
    userId,
    receipt.originalFilename ?? null,
    receipt.originalMimeType ?? null,
    receipt.originalSizeBytes ?? null,
    receipt.width ?? null,
    receipt.height ?? null,
  );
  await enqueue(database, journeyId, receipt.id, "UPLOAD_RECEIPT", now, userId);
  await enqueue(database, journeyId, receipt.id, "LINK_RECEIPT", now, userId);
}

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
      originalFilename?: string | null;
      originalMimeType?: string | null;
      originalSizeBytes?: number | null;
      width?: number | null;
      height?: number | null;
      requestOcr: boolean;
    }) {
      if (!/^file:\/\//.test(input.localUri) || !/^[a-f0-9]{64}$/.test(input.sha256))
        throw new Error("Receipt must be copied and hashed before import.");
      const now = new Date().toISOString();
      const userId = await getActiveUserId();
      await database.withTransactionAsync(async () => {
        if (input.expenseId) {
          await requireExpenseMutation(
            database,
            userId,
            input.journeyId,
            input.expenseId,
          );
          if (
            (await activeExpenseAttachmentCount(database, input.expenseId, userId)) >=
            MAX_EXPENSE_ATTACHMENTS
          )
            throw new Error(
              `Maximum ${MAX_EXPENSE_ATTACHMENTS} attachments per expense.`,
            );
        }
        await database.runAsync(
          `INSERT INTO ledger_receipt_assets (
            id, journey_id, expense_id, personal_payment_id, personal_payment_link_status,
            local_uri, mime_type, size_bytes, sha256,
            upload_status, ocr_status, created_at, updated_at, local_owner_user_id,
            original_filename, original_mime_type, original_size_bytes, width, height
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          input.originalFilename ?? null,
          input.originalMimeType ?? null,
          input.originalSizeBytes ?? null,
          input.width ?? null,
          input.height ?? null,
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
      if (asset.deletedAt) throw new Error("Deleted receipt cannot be linked.");
      const now = new Date().toISOString();
      await database.withTransactionAsync(async () => {
        await requireExpenseMutation(database, userId, asset.journeyId, expenseId);
        if (
          (await activeExpenseAttachmentCount(database, expenseId, userId, assetId)) >=
          MAX_EXPENSE_ATTACHMENTS
        )
          throw new Error(`Maximum ${MAX_EXPENSE_ATTACHMENTS} attachments per expense.`);
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
    async getUploadDiagnostic(assetId: string) {
      const userId = await getActiveUserId();
      if (!(await readReceipt(database, assetId, userId))) return null;
      return database.getFirstAsync<{
        id: string;
        status: string;
        attemptCount: number;
        failureCategory: string | null;
        errorCode: string | null;
        errorMessage: string | null;
        requestId: string | null;
      }>(
        `SELECT id, status, attempt_count AS attemptCount,
          failure_category AS failureCategory, last_error_code AS errorCode,
          last_error_message AS errorMessage, last_request_id AS requestId
         FROM ledger_asset_operations WHERE asset_id = ? AND owner_user_id = ?
           AND operation_type = 'UPLOAD_RECEIPT' LIMIT 1`,
        assetId,
        userId,
      );
    },
    async isUploadProcessing(assetId: string) {
      const row = await database.getFirstAsync<{ id: string }>(
        `SELECT id FROM ledger_asset_operations WHERE asset_id = ?
         AND owner_user_id = ? AND operation_type = 'UPLOAD_RECEIPT'
         AND status = 'PROCESSING'`,
        assetId,
        await getActiveUserId(),
      );
      return Boolean(row);
    },
    async hasPendingExpenseDeletion(expenseId: string) {
      const userId = await getActiveUserId();
      const row = await database.getFirstAsync<{ id: string }>(
        `WITH target AS (
           SELECT id, server_id FROM ledger_expenses WHERE id = ? OR server_id = ?
         )
         SELECT op.id FROM ledger_asset_operations op
         JOIN ledger_receipt_assets asset ON asset.id = op.asset_id
         WHERE op.owner_user_id = ? AND op.operation_type = 'DELETE_RECEIPT'
           AND op.status <> 'COMPLETED'
           AND asset.expense_id IN (SELECT id FROM target UNION SELECT server_id FROM target)
         LIMIT 1`,
        expenseId,
        expenseId,
        userId,
      );
      return Boolean(row);
    },
    async reconcileDeletion(assetId: string, deletedAt: string | null) {
      if (!deletedAt) throw new Error("Receipt deletion was not confirmed.");
      await database.runAsync(
        `UPDATE ledger_receipt_assets SET deleted_at = ?,
         local_deleted_by_user_id = NULL, updated_at = ?
         WHERE id = ? AND local_owner_user_id = ?`,
        deletedAt,
        new Date().toISOString(),
        assetId,
        await getActiveUserId(),
      );
    },
    async deleteExpenseAttachment(assetId: string) {
      const userId = await getActiveUserId();
      await database.withTransactionAsync(async () => {
        const asset = await requireReceipt(database, assetId, userId);
        if (!asset.expenseId || asset.personalPaymentId)
          throw new Error("Only an Expense attachment can be deleted here.");
        await requireExpenseMutation(database, userId, asset.journeyId, asset.expenseId);
        if (asset.localDeletedByUserId && asset.localDeletedByUserId !== userId)
          throw new Error("Another account has an attachment change pending.");
        if (asset.deletedAt) return;
        const now = new Date().toISOString();
        await database.runAsync(
          `UPDATE ledger_receipt_assets SET deleted_at = ?, updated_at = ?,
           local_owner_user_id = ?, local_deleted_by_user_id = ?
           WHERE id = ? AND deleted_at IS NULL`,
          now,
          now,
          userId,
          userId,
          assetId,
        );
        await enqueue(database, asset.journeyId, assetId, "DELETE_RECEIPT", now, userId);
      });
    },
    async listReceipts(journeyId: string) {
      const userId = await getActiveUserId();
      const rows = await database.getAllAsync<ReceiptRow>(
        `${receiptSelect} WHERE journey_id = ?
         AND (deleted_at IS NULL OR
           (server_id IS NOT NULL AND local_deleted_by_user_id IS NOT NULL
            AND local_deleted_by_user_id <> ?))
         AND (server_id IS NOT NULL OR local_owner_user_id = ?)
         AND EXISTS (SELECT 1 FROM ledger_actor_context actor
           WHERE actor.user_id = ? AND actor.journey_id = ledger_receipt_assets.journey_id)
         ORDER BY created_at DESC`,
        journeyId,
        userId,
        userId,
        userId,
      );
      return rows.map((row) => mapReceipt(row, userId));
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
      return rows.map((row) => mapReceipt(row, userId));
    },
    async applyPersonalPaymentAttachments(
      personalPaymentId: string,
      attachments: ReceiptDto[],
    ) {
      for (const receipt of attachments) {
        const existing = await database.getFirstAsync<{
          id: string;
          localUri: string | null;
          expenseId: string | null;
          deletedAt: string | null;
          localOwnerUserId: string | null;
          localDeletedByUserId: string | null;
          originalFilename: string | null;
          originalMimeType: string | null;
          originalSizeBytes: number | null;
          width: number | null;
          height: number | null;
        }>(
          `SELECT id, local_uri AS localUri, expense_id AS expenseId,
            deleted_at AS deletedAt, local_owner_user_id AS localOwnerUserId,
            local_deleted_by_user_id AS localDeletedByUserId,
            original_filename AS originalFilename, original_mime_type AS originalMimeType,
            original_size_bytes AS originalSizeBytes, width, height
           FROM ledger_receipt_assets WHERE server_id = ? OR id = ?`,
          receipt.id,
          receipt.id,
        );
        await database.runAsync(
          `INSERT OR REPLACE INTO ledger_receipt_assets (
            id, server_id, journey_id, expense_id, personal_payment_id,
            personal_payment_link_status, local_uri,
            mime_type, size_bytes, sha256, object_path, upload_status, ocr_status,
            ocr_suggestion_json, created_at, updated_at, local_owner_user_id,
            deleted_at, local_deleted_by_user_id,
            original_filename, original_mime_type, original_size_bytes, width, height
          ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          existing?.id ?? receipt.id,
          receipt.id,
          receipt.journeyId,
          existing?.expenseId ?? receipt.expenseId,
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
          existing?.localOwnerUserId ?? null,
          existing?.deletedAt ?? receipt.deletedAt ?? null,
          receipt.deletedAt ? null : (existing?.localDeletedByUserId ?? null),
          existing?.originalFilename ?? null,
          existing?.originalMimeType ?? null,
          existing?.originalSizeBytes ?? null,
          existing?.width ?? null,
          existing?.height ?? null,
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
        ORDER BY CASE WHEN operation_type = 'DELETE_RECEIPT' THEN 0 ELSE 1 END,
          created_at`,
        userId,
        new Date().toISOString(),
      );
    },
    async reactivateLongLivedFailures() {
      const userId = await getActiveUserId();
      await database.runAsync(
        `UPDATE ledger_asset_operations SET next_attempt_at = NULL, updated_at = ?
         WHERE owner_user_id = ? AND status = 'RETRYABLE'
           AND failure_category IN ('UNKNOWN', 'NETWORK', 'TIMEOUT', 'SERVER',
             'RATE_LIMIT', 'RESPONSE_INVALID')`,
        new Date().toISOString(),
        userId,
      );
    },
    async claimOperation(id: string) {
      const now = new Date().toISOString();
      const userId = await getActiveUserId();
      const result = await database.runAsync(
        `UPDATE ledger_asset_operations SET status = 'PROCESSING', claim_owner = ?,
          lease_expires_at = ?, last_attempt_at = ?, updated_at = ?
         WHERE id = ? AND owner_user_id = ? AND status IN ('PENDING', 'RETRYABLE')
           AND (next_attempt_at IS NULL OR next_attempt_at <= ?)`,
        processClaimOwner,
        new Date(Date.now() + 5 * 60_000).toISOString(),
        now,
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
      error: Error | null = null,
      nextAttemptAt: string | null = null,
      failureCategory: string | null = null,
    ) {
      const userId = await getActiveUserId();
      await database.runAsync(
        `UPDATE ledger_asset_operations SET status = ?, attempt_count = attempt_count + CASE WHEN ? = 'RETRYABLE' THEN 1 ELSE 0 END,
        failure_category = ?, last_error_code = ?, last_error_message = ?,
        last_request_id = ?,
        first_failed_at = CASE WHEN ? IS NULL THEN first_failed_at ELSE COALESCE(first_failed_at, ?) END,
        next_attempt_at = ?, claim_owner = NULL, lease_expires_at = NULL,
        updated_at = ? WHERE id = ? AND owner_user_id = ?`,
        status,
        status,
        error ? failureCategory : null,
        error ? safeErrorCode(error) : null,
        error ? safeErrorMessage(error) : null,
        error && "requestId" in error && typeof error.requestId === "string"
          ? error.requestId
          : null,
        error ? failureCategory : null,
        new Date().toISOString(),
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
        upload_status = ?, ocr_status = ?, ocr_suggestion_json = ?,
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

function safeErrorCode(error: Error) {
  const code = (error as Error & { code?: unknown }).code;
  return typeof code === "string" && /^[A-Z0-9_:-]{1,100}$/.test(code)
    ? code
    : "SYNC_FAILED";
}

function safeErrorMessage(error: Error) {
  return error.message
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9_-]{80,}/g, "[redacted]")
    .slice(0, 300);
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
  original_filename AS originalFilename, original_mime_type AS originalMimeType,
  original_size_bytes AS originalSizeBytes, width, height,
  upload_status AS uploadStatus, ocr_status AS ocrStatus, ocr_suggestion_json AS ocrSuggestionJson,
  deleted_at AS deletedAt, local_deleted_by_user_id AS localDeletedByUserId,
  created_at AS createdAt, updated_at AS updatedAt FROM ledger_receipt_assets`;
function mapReceipt(row: ReceiptRow, userId: string): ReceiptAsset {
  return {
    ...row,
    deletedAt:
      row.localDeletedByUserId && row.localDeletedByUserId !== userId
        ? null
        : row.deletedAt,
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
  return row ? mapReceipt(row, userId) : null;
}
async function requireReceipt(database: Database, id: string, userId: string) {
  const value = await readReceipt(database, id, userId);
  if (!value) throw new Error("Receipt is missing from local storage.");
  return value;
}
async function requireExpenseMutation(
  database: Database,
  userId: string,
  journeyId: string,
  expenseId: string,
) {
  const actor = await database.getFirstAsync<{ role: string | null }>(
    `SELECT actor.role FROM ledger_actor_context actor
     JOIN ledger_expenses expense ON expense.journey_id = actor.journey_id
     WHERE actor.user_id = ? AND actor.journey_id = ?
       AND (expense.id = ? OR expense.server_id = ?)`,
    userId,
    journeyId,
    expenseId,
    expenseId,
  );
  if (actor?.role !== "owner" && actor?.role !== "group_member")
    throw new Error("Expense mutation access is required.");
}
async function activeExpenseAttachmentCount(
  database: Database,
  expenseId: string,
  userId: string,
  exceptAssetId = "",
) {
  const row = await database.getFirstAsync<{ count: number }>(
    `WITH target AS (
       SELECT id, server_id FROM ledger_expenses WHERE id = ? OR server_id = ?
     )
     SELECT count(*) AS count FROM ledger_receipt_assets
     WHERE (deleted_at IS NULL OR (server_id IS NOT NULL
       AND local_deleted_by_user_id IS NOT NULL AND local_deleted_by_user_id <> ?))
       AND id <> ?
       AND expense_id IN (SELECT id FROM target UNION SELECT server_id FROM target)`,
    expenseId,
    expenseId,
    userId,
    exceptAssetId,
  );
  return row?.count ?? 0;
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
