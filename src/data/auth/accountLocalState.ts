import type * as SQLite from "expo-sqlite";

type Database = Pick<
  SQLite.SQLiteDatabase,
  "getFirstAsync" | "runAsync" | "withTransactionAsync"
>;

export async function adoptLegacyAccountState(database: Database, userId: string) {
  const proof = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM ledger_actor_context WHERE user_id = ?",
    userId,
  );
  if (!proof?.count) return false;

  await database.withTransactionAsync(async () => {
    for (const sql of [
      "UPDATE ledger_my_journey_summaries SET user_id = ? WHERE user_id IS NULL",
      "UPDATE ledger_sync_cursors SET user_id = ? WHERE user_id IS NULL",
      "UPDATE sync_operations SET owner_user_id = ? WHERE owner_user_id IS NULL",
      "UPDATE ledger_asset_operations SET owner_user_id = ? WHERE owner_user_id IS NULL",
      "UPDATE ledger_expenses SET local_owner_user_id = ? WHERE local_owner_user_id IS NULL AND sync_status <> 'SYNCED'",
      "UPDATE expenses SET local_owner_user_id = ? WHERE local_owner_user_id IS NULL AND sync_status <> 'SYNCED'",
      "UPDATE itinerary_items SET local_owner_user_id = ? WHERE local_owner_user_id IS NULL AND sync_status <> 'SYNCED'",
      "UPDATE ledger_receipt_assets SET local_owner_user_id = ? WHERE local_owner_user_id IS NULL AND server_id IS NULL",
    ]) {
      await database.runAsync(sql, userId);
    }
  });
  return true;
}
