import type * as SQLite from "expo-sqlite";

import type { SettlementExportPrivacy } from "@/domain/ledger/settlementExport";

export type SettlementExportFormat = "PDF" | "CSV";

export type SettlementExportManifest = {
  statementDigest: string;
  journeyId: string;
  rootSettlementId: string;
  headSettlementId: string;
  exportSchemaVersion: number;
  privacyMode: SettlementExportPrivacy;
  format: SettlementExportFormat;
  fileUri: string;
  fileSha256: string;
  generatedAt: string;
};

type Database = Pick<SQLite.SQLiteDatabase, "getAllAsync" | "runAsync">;

export function createLedgerExportRepository(database: Database) {
  return {
    list(journeyId: string) {
      return database.getAllAsync<SettlementExportManifest>(
        `SELECT statement_digest AS statementDigest, journey_id AS journeyId,
                root_settlement_id AS rootSettlementId,
                head_settlement_id AS headSettlementId,
                export_schema_version AS exportSchemaVersion,
                privacy_mode AS privacyMode, format, file_uri AS fileUri,
                file_sha256 AS fileSha256, generated_at AS generatedAt
         FROM ledger_settlement_exports
         WHERE journey_id = ? ORDER BY generated_at DESC, format, privacy_mode`,
        journeyId,
      );
    },

    async save(manifest: SettlementExportManifest) {
      await database.runAsync(
        `INSERT OR REPLACE INTO ledger_settlement_exports (
          statement_digest, journey_id, root_settlement_id, head_settlement_id,
          export_schema_version, privacy_mode, format, file_uri, file_sha256,
          generated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        manifest.statementDigest,
        manifest.journeyId,
        manifest.rootSettlementId,
        manifest.headSettlementId,
        manifest.exportSchemaVersion,
        manifest.privacyMode,
        manifest.format,
        manifest.fileUri,
        manifest.fileSha256,
        manifest.generatedAt,
      );
    },
  };
}
