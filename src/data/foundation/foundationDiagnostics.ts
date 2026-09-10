import * as Network from "expo-network";

import { readLocalSession } from "@/data/auth/authRepository";
import { openDatabase } from "@/data/db/database";
import { getSchemaVersion, type MigrationDatabase } from "@/data/db/migrationRunner";
import { createSyncOperationRepository } from "@/data/sync/syncOperationRepository";
import { stateFromSessionAndNetwork } from "@/domain/auth/localSession";

export type FoundationDiagnostics = {
  dbInitialized: boolean;
  schemaVersion: number;
  authState: string;
  networkState: "online" | "offline" | "unknown";
  pendingSyncCount: number;
  pendingItineraryCreateCount: number;
};

export async function readFoundationDiagnostics(): Promise<FoundationDiagnostics> {
  const database = await openDatabase();
  const [schemaVersion, session, operations, network] = await Promise.all([
    getSchemaVersion(database as unknown as MigrationDatabase),
    readLocalSession(),
    createSyncOperationRepository(database).listPending(),
    Network.getNetworkStateAsync(),
  ]);

  const isOnline = network.isInternetReachable === true;

  return {
    dbInitialized: true,
    schemaVersion,
    authState: stateFromSessionAndNetwork(session, isOnline),
    networkState:
      network.isInternetReachable === true
        ? "online"
        : network.isInternetReachable === false
          ? "offline"
          : "unknown",
    pendingSyncCount: operations.length,
    pendingItineraryCreateCount: operations.filter(
      (operation) =>
        operation.entityType === "itinerary" &&
        operation.operationType === "CREATE_ITINERARY",
    ).length,
  };
}
