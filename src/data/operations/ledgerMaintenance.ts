import type * as SQLite from "expo-sqlite";
import { receiptBytesSha256, resolveReceiptFile } from "@/data/files/receiptFileStore";
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
) {
  const rows = await database.getAllAsync<{
    id: string;
    serverId: string | null;
    journeyId: string;
    localUri: string | null;
    sizeBytes: number;
    sha256: string;
    uploadStatus: string;
  }>(
    `SELECT id, server_id AS serverId, journey_id AS journeyId,
      local_uri AS localUri, size_bytes AS sizeBytes, sha256,
      upload_status AS uploadStatus
     FROM ledger_receipt_assets WHERE local_uri IS NOT NULL
     ORDER BY updated_at ASC`,
  );
  let totalBytes = rows.reduce((sum, row) => sum + row.sizeBytes, 0);
  let evictedCount = 0;
  let recoveryUnavailableCount = 0;

  for (const row of rows) {
    if (totalBytes <= limitBytes) break;
    if (row.uploadStatus !== "UPLOADED" || !row.serverId || !row.localUri) continue;
    let canonical: Uint8Array;
    try {
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
    const file = resolveReceiptFile(row.localUri);
    if (file.exists) file.delete();
    await database.runAsync(
      "UPDATE ledger_receipt_assets SET local_uri = NULL, updated_at = ? WHERE id = ?",
      new Date().toISOString(),
      row.id,
    );
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
