import { useCallback, useState, useSyncExternalStore, useRef } from "react";
import { useFocusEffect } from "expo-router";
import { AppState } from "react-native";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import {
  readDefaultLocalOperations,
  type LocalOperationsSnapshot,
} from "@/data/operations/localOperations";

export function useLocalOperations(enabled: boolean) {
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
    getAccountGeneration,
  );
  const [snapshot, setSnapshot] = useState<LocalOperationsSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const reload = useRef<() => void>(() => {});
  useFocusEffect(
    useCallback(() => {
      let active = enabled;
      let sequence = 0;

      setSnapshot(null);
      setFailed(false);
      const read = async () => {
        if (!active) return;
        const request = ++sequence;
        setSnapshot(null);
        setFailed(false);
        setRefreshing(true);
        try {
          const next = await readDefaultLocalOperations();
          if (
            active &&
            request === sequence &&
            next.generation === getAccountGeneration()
          )
            setSnapshot(next);
        } catch {
          if (active && request === sequence && generation === getAccountGeneration())
            setFailed(true);
        } finally {
          if (active && request === sequence) setRefreshing(false);
        }
      };
      reload.current = () => {
        void read();
      };
      if (enabled) void read();
      const foreground = enabled
        ? AppState.addEventListener("change", (state) => {
            if (active && state === "active") void read();
          })
        : null;
      return () => {
        active = false;
        reload.current = () => {};
        foreground?.remove();
        setSnapshot(null);
      };
    }, [enabled, generation]),
  );
  return {
    snapshot: enabled && snapshot?.generation === generation ? snapshot : null,
    failed: enabled && failed,
    refreshing,
    refresh: () => reload.current(),
  };
}
