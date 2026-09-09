import { useCallback, useEffect, useState } from "react";

import { getDefaultItineraryRepository } from "@/data/repositories/defaultItineraryRepository";
import {
  failNextItineraryDemoSync,
  runItineraryDemoSync,
} from "@/data/sync/itineraryDemoCoordinator";
import type { CreateItineraryItemInput, ItineraryItem } from "@/domain/itinerary/types";

export const phase2BJourneyAId = "phase-2b-journey-a";
export const phase2BJourneyBId = "phase-2b-journey-b";

export function useItinerarySlice(tripId: string) {
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const repository = await getDefaultItineraryRepository();
    setItems(await repository.listItineraryItems(tripId));
  }, [tripId]);

  useEffect(() => {
    void Promise.resolve()
      .then(refresh)
      .catch(() => setError("Itinerary is unavailable."))
      .finally(() => setIsLoading(false));
  }, [refresh]);

  const createItineraryItem = useCallback(
    async (input: CreateItineraryItemInput) => {
      setIsSaving(true);
      setError(null);

      try {
        const repository = await getDefaultItineraryRepository();
        await repository.createItineraryItem(tripId, input);
        await refresh();
        return true;
      } catch (createError) {
        setError(
          createError instanceof Error
            ? createError.message
            : "Itinerary item was not saved.",
        );
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [refresh, tripId],
  );

  const runDemoSync = useCallback(async () => {
    setError(null);

    try {
      await runItineraryDemoSync();
      await refresh();
    } catch {
      setError("Demo sync could not run.");
    }
  }, [refresh]);

  return {
    createItineraryItem,
    error,
    failNextDemoSync: failNextItineraryDemoSync,
    isLoading,
    isSaving,
    items,
    runDemoSync,
  };
}
