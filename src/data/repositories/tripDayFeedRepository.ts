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
import { tripCoreSha256Hex } from "./tripCoreSha256";
import type { ObservedCoreFlightProjection } from "./tripCoreV2DayFeedRepository";
import { createCoreP6DayFeedReader } from "./tripCoreV2P6DayFeedRepository";
import { projectCoreItem } from "@/domain/trip/tripCoreV2Views";

import {
  createTripLocalManualReader,
  type LocalManualRead,
} from "./tripLocalManualReadRepository";

type Dependencies = {
  localManual?: (id: string) => Promise<LocalManualRead | null>;
  account: () => Promise<string>;
  projection: (id: string) => Promise<ObservedDayProjection | null>;
  coreProjection?: (id: string) => Promise<ObservedCoreFlightProjection | null>;
  candidates: () => Promise<{ journeyId: string; title: string }[]>;
  services: (
    scope: AccountScope,
    observed: ObservedDayProjection,
  ) => Promise<Record<string, FlightService[]>>;
};

// Called only after a verified local journal replay mismatch. A certified Item can
// still be read when no unresolved Core intent or local slot can shadow its facts.
export async function readCertifiedPlanAfterJournalMismatch(
  tripId: string,
  itemId: string,
): Promise<{ scope: AccountScope; item: ReturnType<typeof projectCoreItem> }> {
  const database = await readInitializedDatabase();
  const core = createTripCoreV2Repository(database, requireActiveUserId, tripCoreSha256Hex);
  const scope = await core.captureContext(tripId);
  return withAccountApplyGate(async () => {
    let item: ReturnType<typeof projectCoreItem> = null;
    await database.withTransactionAsync(async () => {
      const snapshot = await core.readAcceptedSnapshotWithinTransaction(scope);
      if (!snapshot) return;
      const unsafeToRead = await database.getFirstAsync(
        `SELECT 1 FROM local_core_authority_slots
          WHERE account_id=? AND trip_id=? AND target_kind='ITEM' AND target_id=?
         UNION ALL
         SELECT 1 FROM trip_core_pending_intents
          WHERE account_id=? AND trip_id=? AND reconciled_revision IS NULL
            AND state IN ('BLOCKED','PENDING','IN_FLIGHT','APPLIED')
         LIMIT 1`,
        scope.accountId, tripId, itemId, scope.accountId, tripId,
      );
      if (unsafeToRead) return;
      item = projectCoreItem(snapshot.graph, snapshot.actor, itemId, {
        rosterHash: snapshot.certificate.roster_hash,
        participatingPersonIds: snapshot.participatingPersonIds,
      });
    });
    await assertAccountRequestContext(scope, requireActiveUserId);
    return { scope, item };
  });
}
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
      let localManual: LocalManualRead | null = null;
      let localManualStatus: "AVAILABLE" | "NONE" | "UNAVAILABLE" = "NONE";
      try {
        localManual = (await deps.localManual?.(tripId)) ?? null;
        if (localManual) localManualStatus = "AVAILABLE";
      } catch {
        await assertAccountRequestContext(scope, deps.account);
        localManualStatus = "UNAVAILABLE";
      }
      await assertAccountRequestContext(scope, deps.account);
      if (
        localManual &&
        (localManual.scope.accountId !== scope.accountId ||
          localManual.scope.generation !== scope.generation ||
          localManual.scope.tripId !== tripId)
      )
        throw new Error("DAY_FEED_SCOPE");
      if (!observed)
        return { scope, observed: null, services: {}, localManual, localManualStatus };
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
      return { scope, observed, services, localManual, localManualStatus };
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
    tripCoreSha256Hex,
  );
  return createTripDayFeedReader({
    account: requireActiveUserId,
    projection: days.getProjection,
    coreProjection: createCoreP6DayFeedReader(core),
    localManual: createTripLocalManualReader(database, requireActiveUserId, core),
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
