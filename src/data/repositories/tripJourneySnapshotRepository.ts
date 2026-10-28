import {
  readCoreDisplaySnapshot,
  coreDayProjectionContext,
  type CoreDisplayReader,
} from "./coreDayProjectionContext";
import { requireActiveUserId } from "../auth/authRepository";
import { assertAccountRequestContext } from "../auth/accountRequestContext";
import { readInitializedDatabase } from "../db/database";
import { createTripCoreV2Repository } from "./tripCoreV2Repository";
import { createTripDiscoveryRepository } from "./tripDiscoveryRepository";
import { tripCoreSha256Hex } from "./tripCoreSha256";
import { projectCoreItem } from "@/domain/trip/tripCoreV2Views";
import {
  selectJourneySnapshot,
  journeySnapshotDayCandidates,
  type SnapshotTripFacts,
} from "@/domain/trip/journeySnapshot";
import { localCalendarDate, validateCalendarDate } from "@/domain/trip/dayReadModel";
import { projectCoreP6Feed } from "@/domain/trip/tripCoreV2P6DayFeed";
import { coreUuid } from "@/domain/trip/tripCoreV2";

type Core = CoreDisplayReader;
export function createTripJourneySnapshotReader(
  core: Core,
  root: (tripId: string) => Promise<SnapshotTripFacts | null>,
  account: () => Promise<string>,
) {
  async function current(tripId: string) {
    coreUuid.parse(tripId);
    const context = await core.captureContext(tripId);
    const facts = await root(tripId);
    const snapshot = await readCoreDisplaySnapshot(core, context);
    await assertAccountRequestContext(context, account);
    if (facts && facts.id !== tripId) throw new Error("SNAPSHOT_TRIP_SCOPE");
    if (!snapshot) return null;
    if (
      snapshot.actor.accountId !== context.accountId ||
      snapshot.actor.tripId !== tripId
    )
      throw new Error("SNAPSHOT_ACTOR_SCOPE");
    const authority = {
      rosterHash: coreDayProjectionContext(snapshot, context.generation)
        .participatingRosterHash,
      participatingPersonIds: snapshot.participatingPersonIds,
    };
    const localTargets = new Set(
      coreDayProjectionContext(snapshot, context.generation).localTargetIds ?? [],
    );
    const items = snapshot.graph.itinerary_events
      .map((row) =>
        projectCoreItem(
          snapshot.graph,
          snapshot.actor,
          String(row.id),
          authority,
          localTargets.has(String(row.id)) ? "PENDING" : "ACCEPTED",
        ),
      )
      .filter((item): item is NonNullable<typeof item> => item !== null);
    return { context, facts, snapshot, items };
  }
  return {
    async read(tripId: string) {
      const result = await current(tripId);
      return result
        ? {
            scope: result.context,
            trip: result.facts,
            epoch: result.snapshot.certificate?.epoch ?? null,
            candidateDays: journeySnapshotDayCandidates(result.facts, result.items),
            snapshot: selectJourneySnapshot(result.facts, result.items),
          }
        : null;
    },
    async resolveDayContext(
      tripId: string,
      expectedEpoch: string | null,
      date: string,
      zone: string,
    ) {
      validateCalendarDate(date);
      if (!zone.trim() || zone !== zone.trim() || /^[+-]/.test(zone))
        throw new Error("DAY_ZONE_INVALID");
      localCalendarDate("2000-01-01T00:00:00Z", zone);
      const result = await current(tripId);
      if (
        !result ||
        (result.snapshot.certificate?.epoch ?? null) !== expectedEpoch ||
        !journeySnapshotDayCandidates(result.facts, result.items).includes(date)
      )
        return null;
      const c = result.snapshot.certificate;
      const projection = projectCoreP6Feed(
        result.snapshot.graph,
        result.snapshot.actor,
        coreDayProjectionContext(result.snapshot, result.context.generation),
        result.snapshot.participatingPersonIds,
      );
      projection.query(date, zone);
      return {
        scope: result.context,
        epoch: c?.epoch ?? null,
        certificate: c,
        projection,
        services: Object.fromEntries(
          Object.entries(projection.flightFacts).map(([id, facts]) => [
            id,
            facts.services,
          ]),
        ),
        date,
        zone,
      };
    },
    async resolveItem(tripId: string, itemId: string, expectedEpoch: string | null) {
      coreUuid.parse(itemId);
      const result = await current(tripId);
      if (!result || (result.snapshot.certificate?.epoch ?? null) !== expectedEpoch)
        return null;
      const item = result.items.find(
        (item) =>
          item.itemId === itemId &&
          !item.hidden &&
          !["cancelled", "skipped"].includes(String(item.status)),
      );
      return item
        ? { scope: result.context, item, certificate: result.snapshot.certificate }
        : null;
    },
  };
}
export async function readTripJourneySnapshot() {
  const database = await readInitializedDatabase();
  const core = createTripCoreV2Repository(
    database,
    requireActiveUserId,
    tripCoreSha256Hex,
  );
  const discovery = createTripDiscoveryRepository(database, requireActiveUserId);
  return createTripJourneySnapshotReader(
    core,
    async (tripId) =>
      (await discovery.readMerged()).trips.find((trip) => trip.id === tripId) ?? null,
    requireActiveUserId,
  );
}
