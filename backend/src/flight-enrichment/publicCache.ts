import type { CachePort } from "./ports";
// Owner V1 scope: request idempotency is durable Host work; public result reuse is closed.
export const closedPublicFlightCache: CachePort = {
  async lookup() {
    return [];
  },
  async put() {
    throw new Error("PUBLIC_FLIGHT_CACHE_LICENSE_CLOSED");
  },
};
