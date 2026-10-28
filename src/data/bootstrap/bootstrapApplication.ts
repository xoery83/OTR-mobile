import { getSyncEngineStatus, type SyncEngineStatus } from "@/data/sync/syncEngine";
import { stateFromLocalSession, type LocalSession } from "@/domain/auth/localSession";
import type { LaunchIdentity } from "../auth/guestPrincipalRepository";
import type { AuthState } from "@/domain/auth/authState";

export type FoundationBootstrapState = {
  authState: AuthState;
  syncStatus: SyncEngineStatus;
  principal?: LaunchIdentity;
};

export type FoundationBootstrapDependencies = {
  readAuthSnapshot?: () => Promise<{
    session: LocalSession | null;
    principal: LaunchIdentity;
  }>;
  openGuestWorkspace?: () => Promise<unknown>;
  openDatabase: () => Promise<unknown>;
  readLocalSession: () => Promise<LocalSession | null>;
  adoptLegacyState?: (userId: string) => Promise<unknown>;
  pauseSync?: () => Promise<unknown>;
  resumeSync?: () => Promise<unknown>;
  scheduleHealth?: () => Promise<unknown>;
};

export async function bootstrapApplication(
  dependencies: FoundationBootstrapDependencies,
): Promise<FoundationBootstrapState> {
  const snapshot = await dependencies.readAuthSnapshot?.();
  if (snapshot && snapshot.principal.kind !== "ACCOUNT") {
    await dependencies.pauseSync?.();
    if (snapshot.principal.kind === "GUEST") {
      if (!dependencies.openGuestWorkspace)
        throw new Error("GUEST_WORKSPACE_UNAVAILABLE");
      await dependencies.openGuestWorkspace();
    }
    return {
      authState: "SIGNED_OUT",
      syncStatus: "paused_auth",
      principal: snapshot.principal,
    };
  }
  await dependencies.openDatabase();
  const session = snapshot ? snapshot.session : await dependencies.readLocalSession();
  if (session?.identity?.userId)
    await dependencies.adoptLegacyState?.(session.identity.userId);
  const authState = stateFromLocalSession(session);
  void dependencies.resumeSync?.().catch(() => {
    // Startup and cached reads never depend on network sync success.
  });
  void dependencies.scheduleHealth?.().catch(() => {
    // Health is a non-blocking safety net over the already-open local database.
  });

  return {
    authState,
    syncStatus: getSyncEngineStatus(authState),
  };
}
