import { requireActiveUserId } from "@/data/auth/authRepository";
import {
  assertAccountRequestContext,
  type AccountScope,
} from "@/data/auth/accountRequestContext";
import { readLocalTripRepository } from "@/data/repositories/tripRepository";

// Readonly prior context is never a Trip association, admission or business-write grant.
export async function readCaptureTripPrior(tripId: string, scope: AccountScope) {
  await assertAccountRequestContext(scope, requireActiveUserId);
  const trip = await (await readLocalTripRepository()).getTrip(tripId);
  await assertAccountRequestContext(scope, requireActiveUserId);
  return trip?.id === tripId ? { id: trip.id, name: trip.name } : null;
}
