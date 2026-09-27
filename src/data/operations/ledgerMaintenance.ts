import type * as SQLite from "expo-sqlite";
import { Directory, File, Paths } from "expo-file-system";
import {
  receiptBytesSha256,
  resolveReceiptFile,
  verifyReceiptFile,
} from "@/data/files/receiptFileStore";
import { createLedgerReceiptTransport } from "@/data/sync/ledgerReceiptTransport";

type Database = Pick<SQLite.SQLiteDatabase, "getAllAsync" | "getFirstAsync" | "runAsync">;

export async function cleanupReconstructibleLedgerData(
  database: Database,
  completedBefore: string,
) {
  await database.runAsync(
    "UPDATE sync_operations SET next_attempt_at = NULL WHERE status = 'COMPLETED' AND next_attempt_at IS NOT NULL",
  );
  const sync = await database.runAsync(
    "DELETE FROM sync_operations WHERE status = 'COMPLETED' AND updated_at < ?",
    completedBefore,
  );
  const assets = await database.runAsync(
    "DELETE FROM ledger_asset_operations WHERE status = 'COMPLETED' AND updated_at < ?",
    completedBefore,
  );
  await database.runAsync("PRAGMA optimize");
  return { deletedSyncOperations: sync.changes, deletedAssetOperations: assets.changes };
}

export async function enforceReceiptCacheLimit(
  database: Database,
  limitBytes: number,
  download = (journeyId: string, receiptId: string) =>
    createLedgerReceiptTransport().download(journeyId, receiptId),
  stat = (journeyId: string, receiptId: string) =>
    createLedgerReceiptTransport().stat(journeyId, receiptId),
) {
  const rows = await database.getAllAsync<{
    id: string;
    serverId: string | null;
    journeyId: string;
    localUri: string | null;
    sizeBytes: number;
    sha256: string;
    mimeType: "image/jpeg" | "image/png" | "application/pdf";
    objectPath: string | null;
    uploadStatus: string;
    deletedAt: string | null;
    personalPaymentLinkStatus: string | null;
  }>(
    `SELECT id, server_id AS serverId, journey_id AS journeyId,
      local_uri AS localUri, size_bytes AS sizeBytes, sha256,
      mime_type AS mimeType, object_path AS objectPath,
      upload_status AS uploadStatus, deleted_at AS deletedAt,
      personal_payment_link_status AS personalPaymentLinkStatus
     FROM ledger_receipt_assets WHERE local_uri IS NOT NULL
     ORDER BY updated_at ASC`,
  );
  let totalBytes = rows.reduce((sum, row) => sum + row.sizeBytes, 0);
  let evictedCount = 0;
  let recoveryUnavailableCount = 0;

  for (const row of rows) {
    if (totalBytes <= limitBytes) break;
    if (
      row.uploadStatus !== "UPLOADED" ||
      !row.serverId ||
      !row.objectPath ||
      !row.localUri ||
      row.deletedAt ||
      row.personalPaymentLinkStatus === "DELETE_PENDING" ||
      !["image/jpeg", "image/png", "application/pdf"].includes(row.mimeType)
    )
      continue;
    const extension =
      row.mimeType === "application/pdf"
        ? ".pdf"
        : row.mimeType === "image/png"
          ? ".png"
          : ".jpg";
    const file = resolveReceiptFile(row.localUri);
    const owned = new File(
      new Directory(Paths.document, "ledger-receipts"),
      `${row.id}${extension}`,
    );
    if (file.uri !== owned.uri || !file.exists) continue;
    const blocked = await database.getFirstAsync<{ id: string }>(
      `SELECT id FROM ledger_asset_operations WHERE asset_id = ?
       AND status <> 'COMPLETED' LIMIT 1`,
      row.id,
    );
    if (blocked) continue;
    let canonical: Uint8Array;
    try {
      await verifyReceiptFile({
        localUri: row.localUri,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        sha256: row.sha256,
      });
      const remote = await stat(row.journeyId, row.serverId);
      if (
        remote.objectPath !== row.objectPath ||
        remote.sizeBytes !== row.sizeBytes ||
        remote.sha256 !== row.sha256 ||
        remote.mimeType !== row.mimeType
      )
        throw new Error("Remote receipt does not match local metadata.");
      canonical = await download(row.journeyId, row.serverId);
    } catch {
      recoveryUnavailableCount += 1;
      continue;
    }
    if (
      canonical.byteLength !== row.sizeBytes ||
      (await receiptBytesSha256(canonical)) !== row.sha256
    ) {
      recoveryUnavailableCount += 1;
      continue;
    }
    const cleared = await database.runAsync(
      `UPDATE ledger_receipt_assets SET local_uri = NULL, updated_at = ?
       WHERE id = ? AND local_uri = ? AND server_id = ? AND object_path = ?
         AND mime_type = ? AND size_bytes = ? AND sha256 = ?
         AND upload_status = 'UPLOADED' AND deleted_at IS NULL
         AND (personal_payment_link_status IS NULL OR personal_payment_link_status = 'ACTIVE')
         AND NOT EXISTS (SELECT 1 FROM ledger_asset_operations op
           WHERE op.asset_id = ledger_receipt_assets.id AND op.status <> 'COMPLETED')`,
      new Date().toISOString(),
      row.id,
      row.localUri,
      row.serverId,
      row.objectPath,
      row.mimeType,
      row.sizeBytes,
      row.sha256,
    );
    if (cleared.changes !== 1) continue;
    // A crash here leaves only a recoverable duplicate, never a missing local URI.
    if (file.exists) file.delete();
    totalBytes -= row.sizeBytes;
    evictedCount += 1;
  }

  return {
    totalBytes,
    limitBytes,
    evictedCount,
    recoveryUnavailableCount,
    overLimit: totalBytes > limitBytes,
  };
}

export async function readLedgerSupportDiagnostics(database: Database) {
  const [pageCount, pageSize, sync, assets, receipts, findings] = await Promise.all([
    database.getFirstAsync<{ page_count: number }>("PRAGMA page_count"),
    database.getFirstAsync<{ page_size: number }>("PRAGMA page_size"),
    database.getAllAsync<{ status: string; count: number }>(
      "SELECT status, COUNT(*) AS count FROM sync_operations GROUP BY status",
    ),
    database.getAllAsync<{ status: string; count: number }>(
      "SELECT status, COUNT(*) AS count FROM ledger_asset_operations GROUP BY status",
    ),
    database.getFirstAsync<{ count: number; bytes: number }>(
      "SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS bytes FROM ledger_receipt_assets",
    ),
    database.getAllAsync<{ status: string; count: number }>(
      "SELECT status, COUNT(*) AS count FROM ledger_review_findings GROUP BY status",
    ),
  ]);
  return {
    schemaVersion: 16,
    databaseBytes: Number(pageCount?.page_count ?? 0) * Number(pageSize?.page_size ?? 0),
    syncCounts: Object.fromEntries(sync.map((row) => [row.status, row.count])),
    assetCounts: Object.fromEntries(assets.map((row) => [row.status, row.count])),
    receiptCount: receipts?.count ?? 0,
    receiptBytes: receipts?.bytes ?? 0,
    reviewCounts: Object.fromEntries(findings.map((row) => [row.status, row.count])),
  };
}
