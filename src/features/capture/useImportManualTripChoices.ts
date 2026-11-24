import { useEffect, useState } from "react";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import { requireActiveUserId } from "@/data/auth/authRepository";
import { listCaptureTripPriors } from "@/data/operations/captureTripPrior";

export function useImportManualTripChoices(
  params: { tripId?: string; originGeneration?: string },
  generation: number,
) {
  const [choices, setChoices] = useState<{ id: string; name: string }[] | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const current = params.originGeneration === String(generation);
  useEffect(() => {
    let active = true;
    if (!current) return;
    void captureAccountRequestContext("", requireActiveUserId)
      .then((context) => listCaptureTripPriors(context))
      .then((trips) => {
        if (!active || generation !== getAccountGeneration()) return;
        setChoices(trips);
        if (params.tripId) {
          if (trips.some((trip) => trip.id === params.tripId)) setTarget(params.tripId);
          else setFailed(true);
        }
      })
      .catch(() => {
        if (active && generation === getAccountGeneration()) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [current, generation, params.tripId]);
  return { choices, target, failed, current, setTarget };
}
