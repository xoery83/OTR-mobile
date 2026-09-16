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
  adoptLegacyState?: (userId: string) => Promise<unknown>;
  resumeSync?: () => Promise<unknown>;
};

export async function bootstrapApplication(
  dependencies: FoundationBootstrapDependencies,
): Promise<FoundationBootstrapState> {
  await dependencies.openDatabase();
  const session = await dependencies.readLocalSession();
  if (session?.identity?.userId)
    await dependencies.adoptLegacyState?.(session.identity.userId);
  const authState = stateFromLocalSession(session);
  void dependencies.resumeSync?.().catch(() => {
    // Startup and cached reads never depend on network sync success.
  });

  return {
    authState,
    syncStatus: getSyncEngineStatus(authState),
  };
}
