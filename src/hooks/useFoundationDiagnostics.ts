import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  readFoundationDiagnostics,
  type FoundationDiagnostics,
} from "@/data/foundation/foundationDiagnostics";
import { authenticateToSupabaseDev } from "@/data/auth/devSupabaseAuth";
import { sessionAccessToken } from "@/data/auth/sessionAccessToken";
import { createDefaultAccountSwitchCoordinator } from "@/data/auth/defaultAccountSwitchCoordinator";
import { getSyncTransportMode } from "@/data/sync/transportSelection";

export function useFoundationDiagnostics() {
  const queryClient = useQueryClient();
  const [diagnostics, setDiagnostics] = useState<FoundationDiagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const accountSwitch = useMemo(
    () =>
      createDefaultAccountSwitchCoordinator({
        clearInMemoryState: () => queryClient.clear(),
        bootstrapAccount: async () => undefined,
      }),
    [queryClient],
  );

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setDiagnostics(await readFoundationDiagnostics());
    } catch {
      setError("Diagnostics unavailable.");
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const initial = await readFoundationDiagnostics();
        if (active) setDiagnostics(initial);

        if (
          getSyncTransportMode() === "dev" &&
          initial.networkState === "online" &&
          initial.authState === "AUTHENTICATED_OFFLINE"
        ) {
          try {
            await sessionAccessToken();
            const refreshed = await readFoundationDiagnostics();
            if (active) setDiagnostics(refreshed);
          } catch {
            // A network failure keeps the valid local session available offline.
          }
        }
      } catch {
        if (active) setError("Diagnostics unavailable.");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      await accountSwitch.activateSession(
        await authenticateToSupabaseDev(email, password),
      );
      await refresh();
    },
    [accountSwitch, refresh],
  );

  const signOut = useCallback(async () => {
    await accountSwitch.logout();
    await refresh();
  }, [accountSwitch, refresh]);

  return {
    diagnostics,
    error,
    refresh,
    signIn,
    signOut,
    transportMode: getSyncTransportMode(),
  };
}
