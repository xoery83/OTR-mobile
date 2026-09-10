import { useCallback, useEffect, useState } from "react";

import {
  readFoundationDiagnostics,
  type FoundationDiagnostics,
} from "@/data/foundation/foundationDiagnostics";
import {
  revalidateStoredSupabaseDevSession,
  signInToSupabaseDev,
  signOutOfSupabaseDev,
} from "@/data/auth/devSupabaseAuth";
import { getSyncTransportMode } from "@/data/sync/transportSelection";

export function useFoundationDiagnostics() {
  const [diagnostics, setDiagnostics] = useState<FoundationDiagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);

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
            if (await revalidateStoredSupabaseDevSession()) {
              const refreshed = await readFoundationDiagnostics();
              if (active) setDiagnostics(refreshed);
            }
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
      await signInToSupabaseDev(email, password);
      await refresh();
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    await signOutOfSupabaseDev();
    await refresh();
  }, [refresh]);

  return {
    diagnostics,
    error,
    refresh,
    signIn,
    signOut,
    transportMode: getSyncTransportMode(),
  };
}
