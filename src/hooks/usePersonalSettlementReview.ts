import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";

import type { LocalPersonalSettlementReview } from "@/data/repositories/personalSettlementReviewRepository";
import type { PersonalSettlementReviewState } from "@/data/api/ledgerSettlementContracts";
import { getDefaultPersonalSettlementReviewRepository } from "@/data/repositories/defaultPersonalSettlementReviewRepository";
import {
  refreshPersonalSettlementReview,
  runPersonalSettlementReviewSync,
} from "@/data/sync/personalSettlementReviewCoordinator";

export function usePersonalSettlementReview(journeyId?: string) {
  const [state, setState] = useState<LocalPersonalSettlementReview | null>(null);
  const [source, setSource] = useState<"CURRENT_SERVER" | "CURRENT_CACHED">(
    "CURRENT_CACHED",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setBusy(false);
    setMessage(null);
    if (!journeyId) {
      setState(null);
      return;
    }
    const repository = await getDefaultPersonalSettlementReviewRepository();
    const cached = await repository.get(journeyId);
    if (request !== requestRef.current) return;
    setState(cached);
    setSource("CURRENT_CACHED");
    try {
      await refreshPersonalSettlementReview(journeyId);
      const refreshed = await repository.get(journeyId);
      if (request !== requestRef.current) return;
      setState(refreshed);
      setSource("CURRENT_SERVER");
    } catch {
      // Cached statement remains useful offline.
      if (request === requestRef.current) setSource("CURRENT_CACHED");
    }
  }, [journeyId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        requestRef.current += 1;
      };
    }, [load]),
  );

  const setReviewState = useCallback(
    async (reviewState: PersonalSettlementReviewState) => {
      if (!journeyId) return;
      const request = ++requestRef.current;
      setBusy(true);
      setMessage(null);
      try {
        const repository = await getDefaultPersonalSettlementReviewRepository();
        await repository.checkpoint(journeyId, reviewState);
        const pending = await repository.get(journeyId);
        if (request === requestRef.current) setState(pending);
        try {
          await runPersonalSettlementReviewSync(journeyId);
          await refreshPersonalSettlementReview(journeyId);
        } catch {
          if (request === requestRef.current)
            setMessage("Saved on this device · Pending sync");
        }
        const refreshed = await repository.get(journeyId);
        if (request === requestRef.current) setState(refreshed);
      } catch {
        if (request === requestRef.current)
          setMessage("Open the latest statement and try again.");
      } finally {
        if (request === requestRef.current) setBusy(false);
      }
    },
    [journeyId],
  );

  const currentState = state?.statement.journeyId === journeyId ? state : null;

  return {
    state: currentState,
    source,
    projectionAsOf: currentState?.updatedAt ?? null,
    busy,
    message,
    reload: load,
    setReviewState,
    looksGood: () => setReviewState("LOOKS_GOOD"),
  };
}
