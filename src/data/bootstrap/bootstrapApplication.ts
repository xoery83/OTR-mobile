import { getSyncEngineStatus, type SyncEngineStatus } from "@/data/sync/syncEngine";
import { stateFromLocalSession, type LocalSession } from "@/domain/auth/localSession";
import type { AuthState } from "@/domain/auth/authState";

export type FoundationBootstrapState = {
  authState: AuthState;
  syncStatus: SyncEngineStatus;
};

export type FoundationBootstrapDependencies = {
  openDatabase: () => Promise<unknown>;
  readLocalSession: () => Promise<LocalSession | null>;
};

export async function bootstrapApplication(
  dependencies: FoundationBootstrapDependencies,
): Promise<FoundationBootstrapState> {
  await dependencies.openDatabase();
  const session = await dependencies.readLocalSession();
  const authState = stateFromLocalSession(session);

  return {
    authState,
    syncStatus: getSyncEngineStatus(authState),
  };
}
