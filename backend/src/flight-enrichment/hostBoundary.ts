import { coreUuid } from "../../../src/domain/trip/tripCoreV2";
import { createOtrEnrichmentHandler } from "./otrAdapter";
import type { createFlightEnrichmentService } from "./service";
import type { TrustedContext } from "./ports";

// Candidate only: the owning Host must supply ordinary auth/Trip authorization and a metered runtime.
export function createFlightEnrichmentBoundary(options: {
  resolve(request: Request, tripId: string): Promise<TrustedContext>;
  service?: ReturnType<typeof createFlightEnrichmentService>;
  enabled?: boolean;
}) {
  return async (request: Request): Promise<Response | null> => {
    const match = /^\/v1\/trips\/([^/]+)\/flight-enrichment(\/capabilities)?$/.exec(
      new URL(request.url).pathname,
    );
    if (!match) return null;
    const tripId = coreUuid.safeParse(match[1]);
    if (!tripId.success) return Response.json({ error: "INVALID_TRIP" }, { status: 400 });
    let context: TrustedContext;
    try {
      context = await options.resolve(request, tripId.data);
      if (context.tripId !== tripId.data) throw Error("TRIP_SCOPE_MISMATCH");
      await context.assertCurrent();
    } catch {
      return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const enabled = options.enabled === true && !!options.service;
    if (match[2])
      return request.method === "GET"
        ? Response.json({ version: "otr-flight-enrichment/1", enabled })
        : Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });
    if (!enabled)
      return Response.json({ error: "ENRICHMENT_PROFILE_CLOSED" }, { status: 503 });
    return createOtrEnrichmentHandler(
      options.service!,
      async () => context,
      true,
    )(request);
  };
}
