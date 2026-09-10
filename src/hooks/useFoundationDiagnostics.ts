import { useCallback, useEffect, useState } from "react";

import {
  readFoundationDiagnostics,
  type FoundationDiagnostics,
} from "@/data/foundation/foundationDiagnostics";
import { signInToSupabaseDev, signOutOfSupabaseDev } from "@/data/auth/devSupabaseAuth";
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
    void readFoundationDiagnostics()
      .then((value) => {
        if (active) setDiagnostics(value);
      })
      .catch(() => {
        if (active) setError("Diagnostics unavailable.");
      });
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
