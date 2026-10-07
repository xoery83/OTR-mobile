import { useCallback, useRef, useMemo, useState, useSyncExternalStore } from "react";
import { useFocusEffect } from "expo-router";
import { AppState } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import {
  readFoundationDiagnostics,
  type FoundationDiagnostics,
} from "@/data/foundation/foundationDiagnostics";
import { authenticateToSupabaseDev } from "@/data/auth/devSupabaseAuth";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { t } from "@/ui/locale";
import { createDefaultAccountSwitchCoordinator } from "@/data/auth/defaultAccountSwitchCoordinator";
import { getSyncTransportMode } from "@/data/sync/transportSelection";

export function useFoundationDiagnostics() {
  const queryClient = useQueryClient();
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
    getAccountGeneration,
  );
  const [diagnostics, setDiagnostics] = useState<FoundationDiagnostics | null>(null);
  const [error, setError] = useState<{ generation: number; message: string } | null>(
    null,
  );
  const accountSwitch = useMemo(
    () =>
      createDefaultAccountSwitchCoordinator({
        clearInMemoryState: () => queryClient.clear(),
        bootstrapAccount: async () => undefined,
      }),
    [queryClient],
  );

  const reload = useRef<() => Promise<void>>(async () => {});
  const refresh = useCallback(() => reload.current(), []);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      let sequence = 0;
      setDiagnostics(null);
      setError(null);
      const read = async () => {
        if (!active) return;
        const request = ++sequence;
        const expectedGeneration = generation;
        setDiagnostics(null);
        setError(null);
        try {
          const next = await readFoundationDiagnostics();
          if (
            active &&
            request === sequence &&
            expectedGeneration === getAccountGeneration() &&
            next.generation === expectedGeneration
          )
            setDiagnostics(next);
        } catch {
          if (
            active &&
            request === sequence &&
            expectedGeneration === getAccountGeneration()
          )
            setError({
              generation: expectedGeneration,
              message: t("operations.unavailable"),
            });
        }
      };
      reload.current = read;
      void read();
      const foreground = AppState.addEventListener("change", (state) => {
        if (active && state === "active") void read();
      });
      return () => {
        active = false;
        reload.current = async () => {};
        foreground.remove();
        setDiagnostics(null);
        setError(null);
      };
    }, [generation]),
  );

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
    diagnostics: diagnostics?.generation === generation ? diagnostics : null,
    error: error?.generation === generation ? error.message : null,
    refresh,
    signIn,
    signOut,
    transportMode: getSyncTransportMode(),
  };
}
