import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

import type { LocalPersonalSettlementReview } from "@/data/repositories/personalSettlementReviewRepository";
import { getDefaultPersonalSettlementReviewRepository } from "@/data/repositories/defaultPersonalSettlementReviewRepository";
import {
  refreshPersonalSettlementReview,
  runPersonalSettlementReviewSync,
} from "@/data/sync/personalSettlementReviewCoordinator";

export function usePersonalSettlementReview(journeyId?: string) {
  const [state, setState] = useState<LocalPersonalSettlementReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!journeyId) return;
    const repository = await getDefaultPersonalSettlementReviewRepository();
    try {
      await refreshPersonalSettlementReview(journeyId);
    } catch {
      // Cached statement remains useful offline.
    }
    setState(await repository.get(journeyId));
  }, [journeyId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const looksGood = useCallback(async () => {
    if (!journeyId) return;
    setBusy(true);
    setMessage(null);
    try {
      const repository = await getDefaultPersonalSettlementReviewRepository();
      await repository.checkpoint(journeyId);
      setState(await repository.get(journeyId));
      try {
        await runPersonalSettlementReviewSync(journeyId);
        await refreshPersonalSettlementReview(journeyId);
      } catch {
        setMessage("Saved on this device · Pending sync");
      }
      setState(await repository.get(journeyId));
    } catch {
      setMessage("Open the latest statement and try again.");
    } finally {
      setBusy(false);
    }
  }, [journeyId]);

  return { state, busy, message, reload: load, looksGood };
}
