import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import {
  tripDiscoveryLifecyclePageSchema,
  tripDiscoveryLifecycleSchema,
  tripDiscoveryPageSchema,
  type TripDiscoveryLifecycle,
  type TripDiscoveryPage,
} from "../../src/domain/trip/tripDiscoveryContract";
export type TripDiscoveryPort = {
  discoverTrips(
    actor: string,
    cursor: string | null,
    limit: number,
    lifecycle?: TripDiscoveryLifecycle,
  ): Promise<TripDiscoveryPage>;
};

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
      Vary: "Authorization",
    },
  });

export async function tripDiscoveryBoundary(
  request: Request,
  actor: string,
  port?: TripDiscoveryPort,
) {
  if (request.method !== "GET" || request.body !== null)
    return reply(405, { error: { code: "METHOD_NOT_ALLOWED" } });
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].some((key) =>
    !["cursor", "limit", "lifecycle"].includes(key),
  ))
    return reply(400, { error: { code: "TRIP_DISCOVERY_INVALID" } });
  if (
    url.searchParams.getAll("cursor").length > 1 ||
    url.searchParams.getAll("limit").length > 1 ||
    url.searchParams.getAll("lifecycle").length > 1
  )
    return reply(400, { error: { code: "TRIP_DISCOVERY_INVALID" } });
  const cursor = url.searchParams.get("cursor");
  const rawLimit = url.searchParams.get("limit") ?? "20";
  const limit = Number(rawLimit);
  const lifecycle = tripDiscoveryLifecycleSchema.optional().safeParse(
    url.searchParams.get("lifecycle") ?? undefined,
  );
  if (
    (cursor !== null && !coreUuid.safeParse(cursor).success) ||
    !/^[1-9]\d*$/.test(rawLimit) ||
    !Number.isInteger(limit) ||
    limit > 25 ||
    !lifecycle.success
  )
    return reply(400, { error: { code: "TRIP_DISCOVERY_INVALID" } });
  if (!port) return reply(503, { error: { code: "TRIP_DISCOVERY_CLOSED" } });
  try {
    const { data: filter } = lifecycle;
    const page = filter === undefined
      ? tripDiscoveryPageSchema.parse(await port.discoverTrips(actor, cursor, limit))
      : tripDiscoveryLifecyclePageSchema
        .refine((result) =>
          filter === "ALL" || result.trips.every((trip) => trip.lifecycleState === filter),
        )
        .parse(await port.discoverTrips(actor, cursor, limit, filter));
    if (page.trips.some((trip) => cursor !== null && trip.id <= cursor))
      throw new Error("TRIP_DISCOVERY_CURSOR_INVALID");
    return reply(200, page);
  } catch {
    return reply(503, { error: { code: "TRIP_DISCOVERY_UNAVAILABLE" } });
  }
}
