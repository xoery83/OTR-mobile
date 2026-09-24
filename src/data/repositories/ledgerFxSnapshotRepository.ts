import type * as SQLite from "expo-sqlite";

import {
  ledgerFxReferenceSnapshotBundleSchema,
  type LedgerFxReferenceSnapshotBundle,
} from "@/data/api/ledgerFxContracts";

export type LedgerFxSnapshotDatabase = Pick<
  SQLite.SQLiteDatabase,
  "getAllAsync" | "runAsync" | "withTransactionAsync"
>;

type SnapshotRow = {
  referenceDate: string;
  ratesJson: string;
  observedAt: string;
  expiresAt: string;
  sourceReference: string;
  providerReference: string;
};

export function createLedgerFxSnapshotRepository(
  database: LedgerFxSnapshotDatabase,
  getActiveUserId: () => Promise<string>,
) {
  return {
    async cacheBundle(input: LedgerFxReferenceSnapshotBundle) {
      const bundle = ledgerFxReferenceSnapshotBundleSchema.parse(input);
      const accountId = await getActiveUserId();
      await database.withTransactionAsync(async () => {
        for (const snapshot of bundle.snapshots) {
          await database.runAsync(
            `INSERT OR REPLACE INTO ledger_fx_reference_snapshots (
              account_id, provider, policy_version, reference_date, base_currency,
              rates_json, source_reference, provider_reference, observed_at, expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            accountId,
            bundle.provider,
            bundle.policyVersion,
            snapshot.referenceDate,
            bundle.baseCurrency,
            JSON.stringify(snapshot.rates),
            bundle.sourceReference,
            bundle.providerReference,
            snapshot.observedAt,
            snapshot.expiresAt,
          );
        }
        await database.runAsync(
          `DELETE FROM ledger_fx_reference_snapshots
           WHERE account_id = ? AND provider = ? AND policy_version = ?
             AND reference_date NOT IN (
               SELECT reference_date FROM ledger_fx_reference_snapshots
               WHERE account_id = ? AND provider = ? AND policy_version = ?
               ORDER BY reference_date DESC LIMIT 32
             )`,
          accountId,
          bundle.provider,
          bundle.policyVersion,
          accountId,
          bundle.provider,
          bundle.policyVersion,
        );
      });
    },

    async list(): Promise<LedgerFxReferenceSnapshotBundle | null> {
      const accountId = await getActiveUserId();
      const rows = await database.getAllAsync<SnapshotRow>(
        `SELECT reference_date AS referenceDate, rates_json AS ratesJson,
          observed_at AS observedAt, expires_at AS expiresAt,
          source_reference AS sourceReference, provider_reference AS providerReference
         FROM ledger_fx_reference_snapshots
         WHERE account_id = ? AND provider = 'ECB'
           AND policy_version = 'ECB_LOCAL_SNAPSHOT_V1'
         ORDER BY reference_date DESC LIMIT 32`,
        accountId,
      );
      if (!rows.length) return null;
      return ledgerFxReferenceSnapshotBundleSchema.parse({
        provider: "ECB",
        policyVersion: "ECB_LOCAL_SNAPSHOT_V1",
        baseCurrency: "EUR",
        sourceReference: rows[0].sourceReference,
        providerReference: rows[0].providerReference,
        snapshots: rows.map((row) => ({
          referenceDate: row.referenceDate,
          rates: JSON.parse(row.ratesJson),
          observedAt: row.observedAt,
          expiresAt: row.expiresAt,
        })),
      });
    },
  };
}
