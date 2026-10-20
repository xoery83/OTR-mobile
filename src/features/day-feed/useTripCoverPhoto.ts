import { useEffect, useState, useSyncExternalStore } from "react";
import { parseTripPhotoCoverRef } from "@/domain/trip/tripCoverAssets";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import {
  readLocalTripPhotoRepository,
  type TripPhoto,
} from "@/data/repositories/tripPhotoRepository";

export function useTripCoverPhoto(tripId?: string, raw?: string | null) {
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const requested = parseTripPhotoCoverRef(raw) !== null;
  const key = JSON.stringify([generation, tripId, raw]);
  const [read, setRead] = useState<{ key: string; photo: TripPhoto | null } | null>(null);
  useEffect(() => {
    let alive = true;
    if (requested && tripId) {
      void (async () => {
        try {
          const repo = await readLocalTripPhotoRepository();
          if (!alive || generation !== getAccountGeneration()) return;
          const photo = await repo.readSelectedTripCoverPhoto(tripId, raw);
          if (alive && generation === getAccountGeneration()) setRead({ key, photo });
        } catch {
          if (alive && generation === getAccountGeneration())
            setRead({ key, photo: null });
        }
      })();
    }
    return () => {
      alive = false;
    };
  }, [key, generation, requested, tripId, raw]);
  return {
    requested,
    photo:
      requested && read?.key === key && generation === getAccountGeneration()
        ? read.photo
        : null,
  };
}
