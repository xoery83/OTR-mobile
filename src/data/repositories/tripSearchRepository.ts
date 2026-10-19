import type * as SQLite from "expo-sqlite";
import {
  captureAccountScope,
  assertAccountRequestContext,
  withAccountApplyGate,
  type AccountScope,
} from "../auth/accountRequestContext";
import { requireActiveUserId } from "../auth/authRepository";
import { readInitializedDatabase } from "../db/database";
import {
  createTripCoreV2Repository,
  type CoreAcceptedSnapshot,
} from "./tripCoreV2Repository";
import { tripCoreSha256Hex } from "./tripCoreSha256";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import { projectCoreItem } from "@/domain/trip/tripCoreV2Views";
import { projectCoreP6Feed } from "@/domain/trip/tripCoreV2P6DayFeed";
import { localCalendarDate, validateCalendarDate } from "@/domain/trip/dayReadModel";
import {
  itemSearchBoundary,
  matchSearchItem,
  matchSearchTrip,
  type SearchInput,
  type SearchResult,
  type SearchTrip,
} from "@/domain/trip/tripSearch";

type Database = Pick<
  SQLite.SQLiteDatabase,
  "getFirstAsync" | "getAllAsync" | "withTransactionAsync"
>;
type Core = Pick<
  ReturnType<typeof createTripCoreV2Repository>,
  "captureContext" | "acceptedSnapshot"
>;
export type SearchProof = {
  scope: AccountScope;
  tripId: string;
  fingerprint: string;
  inventory: string;
};
export type SearchCursor = {
  scope: AccountScope;
  key: string;
  afterTrip: string;
  within: { tripId: string; afterItem: string; fingerprint: string } | null;
};
export type SearchPage = {
  scope: AccountScope;
  key: string;
  inventory: string;
  results: SearchResult[];
  proofs: SearchProof[];
  cursor: SearchCursor | null;
};
// Account-local metadata only. Matching this cache is not Item admission. The
// local Trip source wins; a remote summary exists only with its accepted cache.
const roots = `WITH roots AS (
 SELECT id,name,destination,start_date,end_date FROM local_trip_containers WHERE account_id=?
 UNION ALL SELECT d.id,d.name,d.destination,d.start_date,d.end_date FROM trip_discovery_summaries d
 WHERE d.account_id=? AND EXISTS(SELECT 1 FROM trip_discovery_snapshots s WHERE s.account_id=d.account_id)
 AND NOT EXISTS(SELECT 1 FROM local_trip_containers l WHERE l.account_id=d.account_id AND l.id=d.id))`;
const certificateFields =
  "epoch,revision,access_revision,applied_generation,actor_person_binding_hash,roster_hash,manifest_sha256,ordinary_order_version,business_version,read_version,temporal_version,complete";
export function createTripSearchRepository(
  database: Database,
  core: Core,
  account: () => Promise<string>,
) {
  async function inventory(scope: AccountScope) {
    return JSON.stringify(
      await database.getFirstAsync(
        "SELECT (SELECT count(*) FROM local_trip_containers WHERE account_id=?) local_count,(SELECT max(updated_at) FROM local_trip_containers WHERE account_id=?) local_updated,(SELECT refreshed_at FROM trip_discovery_snapshots WHERE account_id=?) discovery_refreshed",
        scope.accountId,
        scope.accountId,
        scope.accountId,
      ),
    );
  }
  async function root(scope: AccountScope, tripId: string) {
    return database.getFirstAsync<SearchTrip>(
      roots + " SELECT * FROM roots WHERE id=?",
      scope.accountId,
      scope.accountId,
      tripId,
    );
  }
  async function metadata(scope: AccountScope, tripId: string) {
    const trip = await root(scope, tripId);
    const certificate = await database.getFirstAsync<CoreAcceptedSnapshot["certificate"]>(
      `SELECT ${certificateFields} FROM trip_core_read_certificates WHERE account_id=? AND trip_id=?`,
      scope.accountId,
      tripId,
    );
    const fence = await database.getFirstAsync<{
      access_revision: number;
      revoked: number;
      refresh_generation: number;
    }>(
      "SELECT access_revision,revoked,refresh_generation FROM trip_core_scopes WHERE account_id=? AND trip_id=?",
      scope.accountId,
      tripId,
    );
    return {
      trip,
      certificate,
      fence,
      fingerprint: JSON.stringify([trip, certificate, fence]),
    };
  }
  async function current(scope: AccountScope, tripId: string, items = true) {
    const before = await metadata(scope, tripId);
    if (!before.trip || before.fence?.revoked) return null;
    const context = await core.captureContext(tripId);
    if (context.accountId !== scope.accountId || context.generation !== scope.generation)
      throw new Error("SEARCH_ACCOUNT_CHANGED");
    const snapshot = items ? await core.acceptedSnapshot(context) : null;
    await assertAccountRequestContext(scope, account);
    const after = await metadata(scope, tripId);
    if (
      before.fingerprint !== after.fingerprint ||
      (snapshot &&
        JSON.stringify(snapshot.certificate) !== JSON.stringify(after.certificate))
    )
      throw new Error("SEARCH_STALE");
    if (
      snapshot &&
      (snapshot.actor.accountId !== scope.accountId || snapshot.actor.tripId !== tripId)
    )
      throw new Error("SEARCH_ACTOR_SCOPE");
    return {
      trip: before.trip,
      snapshot,
      proof: {
        scope,
        tripId,
        fingerprint: before.fingerprint,
        inventory: await inventory(scope),
      },
    };
  }
  async function validate(
    proofs: readonly SearchProof[],
    corpus?: Pick<SearchPage, "scope" | "inventory">,
  ) {
    return withAccountApplyGate(async () => {
      let valid = true;
      const inventories = new Map<string, string>();
      await database.withTransactionAsync(async () => {
        if (corpus) {
          await assertAccountRequestContext(corpus.scope, account);
          if ((await inventory(corpus.scope)) !== corpus.inventory) valid = false;
        }
        for (const proof of proofs) {
          await assertAccountRequestContext(proof.scope, account);
          const scopeKey = JSON.stringify(proof.scope);
          if (!inventories.has(scopeKey))
            inventories.set(scopeKey, await inventory(proof.scope));
          if (
            (await metadata(proof.scope, proof.tripId)).fingerprint !==
              proof.fingerprint ||
            inventories.get(scopeKey) !== proof.inventory
          )
            valid = false;
        }
      });
      return valid;
    });
  }
  return {
    validate,
    async page(
      input: SearchInput,
      cursor: SearchCursor | null = null,
    ): Promise<SearchPage> {
      const scope = cursor?.scope ?? (await captureAccountScope(account));
      await assertAccountRequestContext(scope, account);
      const key = JSON.stringify([input.query, input.tripId, input.category]);
      if (cursor && cursor.key !== key) throw new Error("SEARCH_CURSOR_SCOPE");
      const inventoryKey = await inventory(scope);
      if (input.tripId) coreUuid.parse(input.tripId);
      if (!input.query.trim())
        return {
          scope,
          key,
          inventory: inventoryKey,
          results: [],
          proofs: [],
          cursor: null,
        };
      const rows = cursor?.within
        ? [await root(scope, cursor.within.tripId)].filter(
            (r): r is SearchTrip => r !== null,
          )
        : await database.getAllAsync<SearchTrip>(
            roots +
              " SELECT * FROM roots WHERE id>? AND (? IS NULL OR id=?) ORDER BY id LIMIT 10",
            scope.accountId,
            scope.accountId,
            cursor?.afterTrip ?? "",
            input.tripId,
            input.tripId,
          );
      if (cursor?.within && !rows.length) throw new Error("SEARCH_STALE");
      const results: SearchResult[] = [],
        proofs: SearchProof[] = [];
      let inspected = 0,
        afterTrip = cursor?.afterTrip ?? "",
        within: SearchCursor["within"] = null;
      for (const row of rows) {
        const value = await current(scope, row.id, input.category !== "TRIPS");
        if (!value) {
          afterTrip = row.id;
          continue;
        }
        proofs.push(value.proof);
        if (cursor?.within && cursor.within.fingerprint !== value.proof.fingerprint)
          throw new Error("SEARCH_STALE");
        if (!input.tripId && input.category !== "ITINERARY" && !cursor?.within) {
          const match = matchSearchTrip(value.trip, input.query);
          if (match) results.push(match);
        }
        const snapshot = value.snapshot;
        const events =
          snapshot?.graph.itinerary_events
            .filter((r) => String(r.id) > (cursor?.within?.afterItem ?? ""))
            .sort((a, b) => String(a.id).localeCompare(String(b.id))) ?? [];
        for (let index = 0; index < events.length; index++) {
          const event = events[index];
          const item = snapshot
            ? projectCoreItem(snapshot.graph, snapshot.actor, String(event.id), {
                rosterHash: snapshot.certificate.roster_hash,
                participatingPersonIds: snapshot.participatingPersonIds,
              })
            : null;
          const match = item
            ? matchSearchItem(
                item,
                value.trip,
                input.query,
                typeof event.description === "string" ? event.description : undefined,
              )
            : null;
          if (match) results.push(match);
          inspected++;
          if (inspected >= 100 && index < events.length - 1) {
            within = {
              tripId: row.id,
              afterItem: String(event.id),
              fingerprint: value.proof.fingerprint,
            };
            break;
          }
        }
        if (within) break;
        afterTrip = row.id;
        if (inspected >= 100) break;
      }
      if (!(await validate(proofs, { scope, inventory: inventoryKey })))
        throw new Error("SEARCH_STALE");
      await assertAccountRequestContext(scope, account);
      const hasNext =
        within ||
        (await database.getFirstAsync<{ id: string }>(
          roots +
            " SELECT id FROM roots WHERE id>? AND (? IS NULL OR id=?) ORDER BY id LIMIT 1",
          scope.accountId,
          scope.accountId,
          afterTrip,
          input.tripId,
          input.tripId,
        ));
      return {
        scope,
        key,
        inventory: inventoryKey,
        results,
        proofs,
        cursor: hasNext ? { scope, key, afterTrip, within } : null,
      };
    },
    async resolve(
      result: SearchResult,
      proof: SearchProof,
      view?: { tripId: string; zone: string | null; generation: number },
    ) {
      if (result.tripId !== proof.tripId) return null;
      if (result.category === "TRIPS" && result.id !== result.tripId) return null;
      await assertAccountRequestContext(proof.scope, account);
      const value = await current(proof.scope, result.tripId);
      if (!value || value.proof.fingerprint !== proof.fingerprint) return null;
      if (result.category === "TRIPS")
        return { kind: "TRIP" as const, tripId: value.trip.id };
      const s = value.snapshot;
      if (!s) return null;
      const item = projectCoreItem(s.graph, s.actor, result.id, {
        rosterHash: s.certificate.roster_hash,
        participatingPersonIds: s.participatingPersonIds,
      });
      if (
        !item ||
        item.hidden ||
        !["P1", "P2", "P3", "P4", "P5", "P6"].includes(item.family) ||
        ["cancelled", "skipped"].includes(String(item.status))
      )
        return null;
      const boundary = itemSearchBoundary(item),
        date = boundary?.localDate,
        zone =
          boundary?.zoneId ??
          (view?.tripId === result.tripId && view.generation === proof.scope.generation
            ? view.zone
            : undefined);
      // No inferred Trip zone: this target needs its recorded named boundary zone.
      if (!date || !zone || zone !== zone.trim() || /^[+-]/.test(zone)) return null;
      validateCalendarDate(date);
      localCalendarDate("2000-01-01T00:00:00Z", zone);
      const c = s.certificate;
      const projection = projectCoreP6Feed(
        s.graph,
        s.actor,
        {
          epoch: c.epoch,
          revision: c.revision,
          accessRevision: c.access_revision,
          generation: c.applied_generation,
          actorPersonBindingHash: c.actor_person_binding_hash,
          participatingRosterHash: c.roster_hash,
          manifestSha256: c.manifest_sha256,
        },
        s.participatingPersonIds,
      );
      const query = projection.query(date, zone);
      if (
        ![...query.timed, ...query.nonComparable].some(
          (row) => row.event.id === result.id,
        )
      )
        return null;
      if (!(await validate([value.proof]))) return null;
      return {
        kind: "ITEM" as const,
        itemId: item.itemId,
        proof: value.proof,
        projection,
        date,
        zone,
        services: Object.fromEntries(
          Object.entries(projection.flightFacts).map(([id, facts]) => [
            id,
            facts.services,
          ]),
        ),
      };
    },
  };
}
export async function readTripSearchRepository() {
  const database = await readInitializedDatabase();
  return createTripSearchRepository(
    database,
    createTripCoreV2Repository(database, requireActiveUserId, tripCoreSha256Hex),
    requireActiveUserId,
  );
}
