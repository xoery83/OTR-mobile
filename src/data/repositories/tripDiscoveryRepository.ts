import type * as SQLite from "expo-sqlite";
import type { BuiltInTripCoverId } from "@/domain/trip/types";
import {
  tripDiscoverySummarySchema,
  type TripDiscoverySummary,
} from "@/domain/trip/tripDiscoveryContract";
import {
  assertAccountRequestContext,
  captureAccountScope,
  withAccountApplyGate,
  type AccountScope,
} from "../auth/accountRequestContext";
import { requireActiveUserId } from "../auth/authRepository";
import { readInitializedDatabase } from "../db/database";

type Database = Pick<
  SQLite.SQLiteDatabase,
  "getAllAsync" | "getFirstAsync" | "runAsync" | "withTransactionAsync"
>;
type SummaryRow = {
  id: string;
  name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
};
type LocalRow = SummaryRow & {
  accepted_at: string | null;
  selected_cover_asset_id: string | null;
};

export type TripListSummary = TripDiscoverySummary & {
  localStatus: "PENDING_CREATE" | "SYNCED" | null;
  selectedCoverAssetId: BuiltInTripCoverId | null;
  remoteListed: boolean;
};
export type CachedTripList = {
  cachedAt: string | null;
  trips: TripListSummary[];
};

const cover = (id: string | null): BuiltInTripCoverId | null =>
  id === "city" || id === "coast" || id === "mountain" ? id : null;
const summary = (row: SummaryRow): TripDiscoverySummary => ({
  id: row.id,
  name: row.name,
  destination: row.destination,
  startDate: row.start_date,
  endDate: row.end_date,
  createdAt: row.created_at,
});

// The cache is a read projection, not a local Trip or permission certificate.
export function createTripDiscoveryRepository(
  database: Database,
  account: () => Promise<string>,
  clock = () => new Date().toISOString(),
) {
  return {
    async replaceSnapshot(scope: AccountScope, incoming: TripDiscoverySummary[]) {
      if (incoming.length > 1000) throw new Error("TRIP_DISCOVERY_LIMIT");
      const trips = incoming.map((item) => tripDiscoverySummarySchema.parse(item));
      if (new Set(trips.map((item) => item.id)).size !== trips.length)
        throw new Error("TRIP_DISCOVERY_DUPLICATE");
      await withAccountApplyGate(async () => {
        await assertAccountRequestContext(scope, account);
        await database.withTransactionAsync(async () => {
          await database.runAsync(
            "INSERT INTO trip_discovery_snapshots(account_id,refreshed_at) VALUES(?,?) ON CONFLICT(account_id) DO UPDATE SET refreshed_at=excluded.refreshed_at",
            scope.accountId,
            clock(),
          );
          await database.runAsync(
            "DELETE FROM trip_discovery_summaries WHERE account_id=?",
            scope.accountId,
          );
          for (const item of trips)
            await database.runAsync(
              "INSERT INTO trip_discovery_summaries(account_id,id,name,destination,start_date,end_date,created_at) VALUES(?,?,?,?,?,?,?)",
              scope.accountId,
              item.id,
              item.name,
              item.destination,
              item.startDate,
              item.endDate,
              item.createdAt,
            );
          await assertAccountRequestContext(scope, account);
        });
      });
    },
    async readMerged(): Promise<CachedTripList> {
      const scope = await captureAccountScope(account);
      const snapshot = await database.getFirstAsync<{ refreshed_at: string }>(
        "SELECT refreshed_at FROM trip_discovery_snapshots WHERE account_id=?",
        scope.accountId,
      );
      const remote = snapshot
        ? await database.getAllAsync<SummaryRow>(
            "SELECT id,name,destination,start_date,end_date,created_at FROM trip_discovery_summaries WHERE account_id=?",
            scope.accountId,
          )
        : [];
      const local = await database.getAllAsync<LocalRow>(
        "SELECT id,name,destination,start_date,end_date,created_at,accepted_at,selected_cover_asset_id FROM local_trip_containers WHERE account_id=?",
        scope.accountId,
      );
      await assertAccountRequestContext(scope, account);
      const entries = new Map<string, TripListSummary>();
      for (const row of remote)
        entries.set(row.id, {
          ...summary(row),
          localStatus: null,
          selectedCoverAssetId: null,
          remoteListed: true,
        });
      for (const row of local)
        entries.set(row.id, {
          ...summary(row), // The local source of truth wins on equal UUID, especially pending CREATE.
          localStatus: row.accepted_at ? "SYNCED" : "PENDING_CREATE",
          selectedCoverAssetId: cover(row.selected_cover_asset_id),
          remoteListed: entries.has(row.id),
        });
      return {
        cachedAt: snapshot?.refreshed_at ?? null,
        trips: [...entries.values()].sort(
          (a, b) =>
            (b.createdAt ?? "").localeCompare(a.createdAt ?? "") ||
            a.id.localeCompare(b.id),
        ),
      };
    },
  };
}

export async function readLocalTripDiscoveryRepository() {
  return createTripDiscoveryRepository(
    await readInitializedDatabase(),
    requireActiveUserId,
  );
}
