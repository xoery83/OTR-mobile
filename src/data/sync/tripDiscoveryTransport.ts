import { createAuthenticatedApiClient } from "@/data/api/authenticatedClient";
import type { ApiClientOptions } from "@/data/api/client";
import {
  tripDiscoveryPageSchema,
  type TripDiscoveryPage,
  type TripDiscoverySummary,
} from "@/domain/trip/tripDiscoveryContract";
import {
  assertAccountRequestContext,
  captureAccountScope,
  type AccountScope,
} from "../auth/accountRequestContext";

export type TripDiscoveryTransport = {
  page(scope: AccountScope, cursor: string | null): Promise<TripDiscoveryPage>;
};

export function createTripDiscoveryTransport(
  account: () => Promise<string>,
  options: Omit<ApiClientOptions, "accessToken" | "accessTokenProvider"> = {},
  tokenProvider?: Parameters<typeof createAuthenticatedApiClient>[1],
): TripDiscoveryTransport {
  return {
    async page(scope, cursor) {
      await assertAccountRequestContext(scope, account);
      const query = cursor
        ? `?cursor=${encodeURIComponent(cursor)}&limit=25`
        : "?limit=25";
      const page = await createAuthenticatedApiClient(
        {
          ...options,
          maxResponseBytes: Math.min(options.maxResponseBytes ?? 262_144, 262_144),
        },
        tokenProvider,
        scope,
      ).get(`/v2/trips${query}`, tripDiscoveryPageSchema);
      await assertAccountRequestContext(scope, account);
      return page;
    },
  };
}

// Explicitly invoked read; no background refresh, port activation or queue mutation.
export async function refreshTripDiscovery(
  account: () => Promise<string>,
  transport: TripDiscoveryTransport,
  cache: {
    replaceSnapshot(scope: AccountScope, trips: TripDiscoverySummary[]): Promise<void>;
  },
) {
  const scope = await captureAccountScope(account);
  let cursor: string | null = null;
  const seen = new Set<string>();
  const trips: TripDiscoverySummary[] = [];
  for (let pageNumber = 0; pageNumber < 40; pageNumber += 1) {
    const page = tripDiscoveryPageSchema.parse(await transport.page(scope, cursor));
    let previous = cursor;
    for (const trip of page.trips) {
      if ((previous !== null && trip.id <= previous) || seen.has(trip.id))
        throw new Error("TRIP_DISCOVERY_PAGE_ORDER");
      seen.add(trip.id);
      trips.push(trip);
      previous = trip.id;
    }
    await assertAccountRequestContext(scope, account);
    if (page.nextCursor === null) {
      await cache.replaceSnapshot(scope, trips);
      return trips.length;
    }
    if (
      (cursor !== null && page.nextCursor <= cursor) ||
      (previous !== null && page.nextCursor < previous)
    )
      throw new Error("TRIP_DISCOVERY_PAGE_ORDER");
    cursor = page.nextCursor;
  }
  throw new Error("TRIP_DISCOVERY_LIMIT");
}
