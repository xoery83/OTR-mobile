import type { createClosedPersistenceGateway } from "../externalIntegrationPersistence";
import type { createFlightHttpsSend } from "../flightHttpsTransport";
import { createFlightEnrichmentHostRun } from "./hostRun";
import { createFlightEnrichmentIdempotency } from "./idempotency";
import { closedPublicFlightCache } from "./publicCache";
import { createHostLookupProvider } from "./provider";
import { createFlightEnrichmentService } from "./service";
import type { EntitlementPort, TrustedContext, UsagePort } from "./ports";

// Explicit trusted composition only; no env switch, secret resolver or SQL grant is manufactured.
export function createConfiguredFlightEnrichmentService(ports: {
  gateway(context: TrustedContext): ReturnType<typeof createClosedPersistenceGateway>;
  // Construct the existing protected meter adapter; admission occurs inside service idempotency.
  usage(context: TrustedContext): UsagePort;
  reserve: Parameters<typeof createFlightEnrichmentHostRun>[0]["reserve"];
  send: ReturnType<typeof createFlightHttpsSend>;
  entitlement?: EntitlementPort;
}): ReturnType<typeof createFlightEnrichmentService> {
  const provider = createHostLookupProvider(createFlightEnrichmentHostRun(ports), true);
  return {
    async enrich(request, context, signal) {
      await context.assertCurrent();
      if (!context.tripId) throw Error("ENRICHMENT_TRIP_REQUIRED");
      return createFlightEnrichmentService({
        provider,
        cache: closedPublicFlightCache,
        idempotency: createFlightEnrichmentIdempotency(ports.gateway(context), {
          accountId: context.accountId,
          actorId: context.actorId,
          tripId: context.tripId,
        }),
        usage: ports.usage(context),
        entitlement: ports.entitlement,
      }).enrich(request, context, signal);
    },
  };
}
