import {
  captureAccountScope,
  assertAccountRequestContext,
  withAccountApplyGate,
  type AccountScope,
} from "@/data/auth/accountRequestContext";
import { requireActiveUserId } from "@/data/auth/authRepository";
import { readInitializedDatabase } from "@/data/db/database";
import { collectionUuid } from "@/data/api/tripEventCollectionCodec";
import { flightServicesSchema, type FlightService } from "@/domain/trip/flightAdmission";
import {
  createTripDayReadRepository,
  type ObservedDayProjection,
} from "./tripDayReadRepository";
import { createLedgerReportingRepository } from "./ledgerReportingRepository";
import { createTripCoreV2Repository } from "./tripCoreV2Repository";
import {
  createCoreFlightDayFeedReader,
  type ObservedCoreFlightProjection,
} from "./tripCoreV2DayFeedRepository";

type Dependencies = {
  account: () => Promise<string>;
  projection: (id: string) => Promise<ObservedDayProjection | null>;
  coreProjection?: (id: string) => Promise<ObservedCoreFlightProjection | null>;
  candidates: () => Promise<{ journeyId: string; title: string }[]>;
  services: (
    scope: AccountScope,
    observed: ObservedDayProjection,
  ) => Promise<Record<string, FlightService[]>>;
};
// Discovery never admits a Trip. The account-scoped accepted projection is the read boundary.
export function createTripDayFeedReader(deps: Dependencies) {
  return {
    async candidates() {
      const scope = await captureAccountScope(deps.account);
      const candidates = await deps.candidates();
      await assertAccountRequestContext(scope, deps.account);
      return { scope, candidates };
    },
    async trip(tripId: string) {
      collectionUuid.parse(tripId);
      const scope = await captureAccountScope(deps.account);
      const observed =
        (await deps.coreProjection?.(tripId)) ?? (await deps.projection(tripId));
      await assertAccountRequestContext(scope, deps.account);
      if (!observed) return { scope, observed: null, services: {} };
      if (
        observed.projection.accountId !== scope.accountId ||
        observed.projection.tripId !== tripId
      )
        throw new Error("DAY_FEED_SCOPE");
      let services: Record<string, FlightService[]> = {};
      try {
        if (observed.projection.version === 2)
          services = Object.fromEntries(
            Object.entries(observed.projection.flightFacts).map(([id, facts]) => [
              id,
              facts.services,
            ]),
          );
        else if (observed.sourceStatus === "CURRENTLY_MATCHES_SOURCE")
          services = await deps.services(scope, observed as ObservedDayProjection);
      } catch {
        // Supplemental failure does not revoke accepted local facts; account validity is mandatory.
        await assertAccountRequestContext(scope, deps.account);
      }
      await assertAccountRequestContext(scope, deps.account);
      return { scope, observed, services };
    },
  };
}
export async function readTripDayFeed() {
  // Startup owns migrations. This entry never initializes storage, imports or rebuilds data.
  const database = await readInitializedDatabase();
  const days = createTripDayReadRepository(database, requireActiveUserId);
  const ledger = createLedgerReportingRepository(database, requireActiveUserId);
  const core = createTripCoreV2Repository(
    database,
    requireActiveUserId,
    async (bytes) => {
      const { digest, CryptoDigestAlgorithm } = await import("expo-crypto");
      return Array.from(
        new Uint8Array(await digest(CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes))),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
    },
  );
  return createTripDayFeedReader({
    account: requireActiveUserId,
    projection: days.getProjection,
    coreProjection: createCoreFlightDayFeedReader(core),
    candidates: ledger.listJourneys,
    services: async (scope, observed) =>
      withAccountApplyGate(async () => {
        const context = { ...scope, tripId: observed.projection.tripId };
        await assertAccountRequestContext(context, requireActiveUserId);
        const values: Record<string, FlightService[]> = {};
        await database.withTransactionAsync(async () => {
          for (const event of observed.projection.events.filter(
            (e) => e.temporal_shape === "TRANSPORT",
          )) {
            const rows = await database.getAllAsync<Record<string, unknown>>(
              "SELECT s.* FROM trip_transport_service_mirrors s JOIN trip_canonical_events e ON e.account_id=s.cache_account_id AND e.trip_id=s.trip_id AND e.event_id=s.event_id AND e.semantic_revision=s.semantic_revision WHERE s.cache_account_id=? AND s.trip_id=? AND s.event_id=? AND s.semantic_revision=? ORDER BY s.service_key",
              scope.accountId,
              context.tripId,
              event.id,
              event.semantic_revision,
            );
            const parsed = flightServicesSchema.safeParse(
              rows.map((r) =>
                Object.fromEntries(
                  Object.keys(flightServicesSchema.element.shape).map((k) => [k, r[k]]),
                ),
              ),
            );
            if (parsed.success) values[event.id] = parsed.data;
          }
          await assertAccountRequestContext(context, requireActiveUserId);
        });
        return values;
      }),
  });
}
