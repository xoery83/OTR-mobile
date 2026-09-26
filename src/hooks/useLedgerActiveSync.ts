import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { useNetworkState } from "expo-network";

import {
  createLedgerActiveSyncController,
  deriveLedgerSyncStatus,
  getLedgerPendingMutationCount,
  runLedgerActiveSync,
  runPersonalPaymentActiveSync,
  type LedgerActiveSyncResult,
  type LedgerSyncStatus,
} from "@/data/sync/ledgerActiveSync";
import {
  reactivateLongLivedLedgerFailures,
  subscribeLedgerOperationalSyncKick,
} from "@/data/sync/ledgerOperationalSync";
import { getAccountGeneration } from "@/data/auth/accountGeneration";

export function useLedgerActiveSync(
  journeyId: string | null,
  onChanged: (journeyId: string) => void | Promise<void>,
  scope: "LEDGER" | "SETTLEMENT" = "LEDGER",
) {
  const accountGeneration = getAccountGeneration();
  const network = useNetworkState();
  const online = network.isConnected !== false && network.isInternetReachable !== false;
  const wasOnline = useRef(online);
  const [status, setStatus] = useState<{
    journeyId: string;
    value: LedgerSyncStatus;
  } | null>(null);

  const controller = useMemo(() => {
    if (!journeyId) return null;
    return createLedgerActiveSyncController({
      run: () =>
        scope === "SETTLEMENT"
          ? runPersonalPaymentActiveSync(journeyId)
          : runLedgerActiveSync(journeyId),
      initialOnline: false,
      isCurrent: () => accountGeneration === getAccountGeneration(),
      onCycle: (metric) => {
        console.info(JSON.stringify({ event: "ledger_active_sync", scope, ...metric }));
      },
      onStart: () =>
        setStatus({
          journeyId,
          value: deriveLedgerSyncStatus({
            online: true,
            syncing: true,
            pendingCount: 0,
            pullSucceeded: false,
          }),
        }),
      onSuccess: (result: LedgerActiveSyncResult) => {
        setStatus({
          journeyId,
          value: deriveLedgerSyncStatus({
            online: result.pullSucceeded,
            syncing: false,
            pendingCount: result.pendingCount,
            pullSucceeded: result.pullSucceeded,
          }),
        });
        if (result.pullSucceeded && result.changed) void onChanged(journeyId);
      },
      onError: () => {
        setStatus({
          journeyId,
          value: deriveLedgerSyncStatus({
            online: false,
            syncing: false,
            pendingCount: 0,
            pullSucceeded: false,
          }),
        });
      },
    });
  }, [accountGeneration, journeyId, onChanged, scope]);

  useEffect(() => {
    if (!controller) return;
    return subscribeLedgerOperationalSyncKick((generation) => {
      if (generation === accountGeneration) controller.wake();
    });
  }, [accountGeneration, controller]);

  useFocusEffect(
    useCallback(() => {
      controller?.start();
      return () => controller?.stop();
    }, [controller]),
  );

  useEffect(() => {
    if (!controller) return;
    controller.setActive(AppState.currentState === "active");
    const subscription = AppState.addEventListener("change", (state) =>
      controller.setActive(state === "active"),
    );
    return () => subscription.remove();
  }, [controller]);

  useEffect(() => {
    const recovered = online && wasOnline.current === false;
    wasOnline.current = online;
    if (recovered)
      void reactivateLongLivedLedgerFailures()
        .catch(() => undefined)
        .then(() => controller?.setOnline(true));
    else controller?.setOnline(online);
    let current = true;
    if (!online && journeyId)
      void getLedgerPendingMutationCount(journeyId).then((count) => {
        if (!current) return;
        setStatus({
          journeyId,
          value: deriveLedgerSyncStatus({
            online: false,
            syncing: false,
            pendingCount: count,
            pullSucceeded: false,
          }),
        });
      });
    return () => {
      current = false;
    };
  }, [controller, journeyId, online]);

  return status?.journeyId === journeyId ? status.value : null;
}
