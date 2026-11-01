import { createTripPrivateRealtimeAuthorization } from "../auth/tripPrivateRealtimeAuthorization";
import type { TripPrivateSubscribe } from "./tripRealtimeTrigger";

type OwningPorts = Parameters<typeof createTripPrivateRealtimeAuthorization>[0];

// The cache fence is an explicit owning port; an Auth revision is not a Core revision.
export function createTripPrivateSubscription(
  ports?: OwningPorts,
): TripPrivateSubscribe | undefined {
  if (!ports?.open) return undefined;
  return createTripPrivateRealtimeAuthorization(ports);
}

// Auth/Core must qualify atomic admission, private join and the authoritative cache fence.
export const tripPrivateSubscription = createTripPrivateSubscription();
