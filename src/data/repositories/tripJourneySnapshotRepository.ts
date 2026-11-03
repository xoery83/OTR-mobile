import {
  readCoreDisplaySnapshot,
  coreDayProjectionContext,
  type CoreDisplayReader,
} from "./coreDayProjectionContext";
import { readCommittedLocalPrincipal, requireActiveUserId } from "../auth/authRepository";
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
import type { LocalManualRead } from "./tripLocalManualReadRepository";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";

type Core = CoreDisplayReader;
export function createTripJourneySnapshotReader(
  core: Core,
  root: (tripId: string) => Promise<SnapshotTripFacts | null>,
  account: () => Promise<string>,
  localManual?: (tripId: string) => Promise<LocalManualRead | null>,
) {
  async function current(tripId: string) {
    coreUuid.parse(tripId);
    const context = await core.captureContext(tripId);
    const facts = await root(tripId);
    const snapshot = await readCoreDisplaySnapshot(core, context);
    const manual = (await localManual?.(tripId)) ?? null;
    await assertAccountRequestContext(context, account);
    if (manual && (manual.scope.accountId !== context.accountId || manual.scope.tripId !== tripId || manual.scope.generation !== context.generation))
      throw Error("SNAPSHOT_MANUAL_SCOPE");
    if (localManual) {
      const after = await readCoreDisplaySnapshot(core, context);
      const identity = (value: typeof snapshot) => ({
        certificate: value?.certificate ?? null,
        localRevision: value && "localRevision" in value ? value.localRevision : 0,
      });
      if (canonicalCoreJson(identity(snapshot) as Json) !== canonicalCoreJson(identity(after) as Json))
        throw Error("SNAPSHOT_SOURCE_CHANGED");
      await assertAccountRequestContext(context, account);
    }
    if (facts && facts.id !== tripId) throw new Error("SNAPSHOT_TRIP_SCOPE");
    if (!snapshot && !manual) return null;
    if (snapshot && (
      snapshot.actor.accountId !== context.accountId ||
      snapshot.actor.tripId !== tripId
    ))
      throw new Error("SNAPSHOT_ACTOR_SCOPE");
    const authority = snapshot ? {
      rosterHash: coreDayProjectionContext(snapshot, context.generation).participatingRosterHash,
      participatingPersonIds: snapshot.participatingPersonIds,
    } : {};
    const localTargets = new Set(
      snapshot ? coreDayProjectionContext(snapshot, context.generation).localTargetIds ?? [] : [],
    );
    const items = snapshot?.graph.itinerary_events
      .map((row) =>
        projectCoreItem(
          snapshot.graph,
          snapshot.actor,
          String(row.id),
          authority,
          localTargets.has(String(row.id)) ? "PENDING" : "ACCEPTED",
        ),
      )
      .filter((item): item is NonNullable<typeof item> => item !== null && !manual?.hasPendingItem(item.itemId)) ?? [];
    items.push(...(manual?.items ?? []));
    return { context, facts, snapshot, items, manual };
  }
  return {
    async read(tripId: string) {
      const result = await current(tripId);
      return result
        ? {
            scope: result.context,
            trip: result.facts,
            epoch: result.snapshot?.certificate?.epoch ?? null,
            candidateDays: journeySnapshotDayCandidates(result.facts, result.items),
            snapshot: selectJourneySnapshot(result.facts, result.items),
            ...(result.manual ? { localSource: { scope: result.manual.scope, source: result.manual.source } } : {}),
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
        !result?.snapshot ||
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
      if (!result || (result.snapshot?.certificate?.epoch ?? null) !== expectedEpoch)
        return null;
      const item = result.items.find(
        (item) =>
          item.itemId === itemId &&
          !item.hidden &&
          !["cancelled", "skipped"].includes(String(item.status)),
      );
      return item
        ? { scope: result.context, item, certificate: result.snapshot?.certificate ?? null,
            ...(result.manual?.hasPendingItem(item.itemId) ? { localSource: { scope: result.manual.scope, source: result.manual.source } } : {}),
          }
        : null;
    },
  };
}
export async function readTripJourneySnapshot() {
  if ((await readCommittedLocalPrincipal())?.kind === "GUEST") {
    const { openGuestLocalWorkspace } = await import("../auth/guestLocalWorkspace");
    return (await openGuestLocalWorkspace()).journeySnapshot;
  }
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
