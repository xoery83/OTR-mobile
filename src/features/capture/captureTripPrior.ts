import { ApiClientError } from "@/data/api/client";
import {
  readLocalTripDiscoveryRepository,
  refreshTripDiscoveryCache,
} from "@/data/repositories/tripDiscoveryRepository";
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
  if (trip?.id === tripId) return { id: trip.id, name: trip.name };
  const cached = await (await readLocalTripDiscoveryRepository()).readMerged();
  await assertAccountRequestContext(scope, requireActiveUserId);
  const remote = cached.trips.find((item) => item.id === tripId);
  return remote ? { id: remote.id, name: remote.name } : null;
}

export async function listCaptureTripPriors(scope: AccountScope) {
  await assertAccountRequestContext(scope, requireActiveUserId);
  const trips = await (await readLocalTripRepository()).listTrips();
  await assertAccountRequestContext(scope, requireActiveUserId);
  if (process.env.EXPO_PUBLIC_OTR_UNIVERSAL_CONTINUOUS_ENABLED === "true") {
    try {
      await refreshTripDiscoveryCache();
    } catch (error) {
      await assertAccountRequestContext(scope, requireActiveUserId);
      if (!(error instanceof ApiClientError && error.kind === "network")) throw error;
    }
  }
  const cached = await (await readLocalTripDiscoveryRepository()).readMerged();
  await assertAccountRequestContext(scope, requireActiveUserId);
  // Local edits win. Discovery supplies labels only; Source still qualifies authority.
  return [
    ...new Map(
      [...cached.trips, ...trips].map(({ id, name }) => [id, { id, name }]),
    ).values(),
  ];
}
