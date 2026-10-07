import * as Network from "expo-network";

import { readAdoptedLocalSession } from "@/data/auth/authRepository";
import { readInitializedDatabase } from "@/data/db/database";
import { getSchemaVersion, type MigrationDatabase } from "@/data/db/migrationRunner";
import { readPendingSyncCounts } from "@/data/sync/syncOperationRepository";
import { stateFromSessionAndNetwork } from "@/domain/auth/localSession";
import { readLedgerSupportDiagnostics } from "@/data/operations/ledgerMaintenance";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { assertAccountRequestContext } from "@/data/auth/accountRequestContext";

export type FoundationDiagnostics = {
  generation: number;
  dbInitialized: boolean;
  schemaVersion: number;
  authState: string;
  networkState: "online" | "offline" | "unknown";
  pendingSyncCount: number;
  pendingItineraryCreateCount: number;
  databaseBytes: number;
  receiptCacheBytes: number;
  reviewFindingCount: number;
};

export async function readFoundationDiagnostics(): Promise<FoundationDiagnostics> {
  const generation = getAccountGeneration();
  const database = await readInitializedDatabase();
  const [schemaVersion, session, network, support] = await Promise.all([
    getSchemaVersion(database as unknown as MigrationDatabase),
    readAdoptedLocalSession(),
    Network.getNetworkStateAsync(),
    readLedgerSupportDiagnostics(database),
  ]);
  const accountId = session?.identity?.userId ?? "";
  const counts = accountId ? await readPendingSyncCounts(database, accountId) : null;
  await assertAccountRequestContext(
    { accountId, tripId: "", generation },
    async () => (await readAdoptedLocalSession())?.identity?.userId ?? "",
  );

  const isOnline = network.isInternetReachable === true;

  return {
    generation,
    dbInitialized: true,
    schemaVersion,
    authState: stateFromSessionAndNetwork(session, isOnline),
    networkState:
      network.isInternetReachable === true
        ? "online"
        : network.isInternetReachable === false
          ? "offline"
          : "unknown",
    pendingSyncCount: counts?.pending ?? 0,
    pendingItineraryCreateCount: counts?.itinerary ?? 0,
    databaseBytes: support.databaseBytes,
    receiptCacheBytes: support.receiptBytes,
    reviewFindingCount: Object.values(support.reviewCounts).reduce(
      (sum, count) => sum + count,
      0,
    ),
  };
}
