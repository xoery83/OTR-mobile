import { z } from "zod";
import {
  canonicalEventFactsSchema,
  canonicalEndpointSchema,
} from "@/data/api/tripCanonicalReadContracts";
import {
  collectionSnapshot,
  collectionHash,
  collectionCount,
  collectionUuid,
} from "@/data/api/tripEventCollectionCodec";
import {
  captureAccountRequestContext,
  assertAccountRequestContext,
  withAccountApplyGate,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import {
  dayEventColumns,
  daySpatialColumns,
  dayTemporalColumns,
} from "@/data/db/migrations/tripDayReadModel";
import {
  instantMicroseconds,
  civilBoundaryMicroseconds,
  validateCalendarDate,
  itemsForLocalDate,
  today,
  tomorrow,
  nextComparableEvent,
  unresolvedCandidates,
  type DayBoundary,
  type DayEvent,
  type DayProjection,
} from "@/domain/trip/dayReadModel";
import {
  createTripCanonicalEventRepository,
  type CertifiedTripEventSource,
  type TripCanonicalEventDatabase,
} from "./tripCanonicalEventRepository";

type Row = Record<string, unknown>;
const boundaryColumns = [...dayTemporalColumns, ...daySpatialColumns];
const boundarySchema = canonicalEndpointSchema
  .omit({ event_id: true, role: true })
  .extend({ role: z.enum(["START", "END", "ORIGIN", "DESTINATION"]) });
const eventSchema = z
  .object(canonicalEventFactsSchema.shape)
  .pick(
    Object.fromEntries(["id", ...dayEventColumns].map((key) => [key, true])) as {
      [K in "id" | (typeof dayEventColumns)[number]]: true;
    },
  )
  .extend({ boundaries: z.array(boundarySchema) });
const generationSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
function invalid(): never {
  throw new Error("DAY_PROJECTION_INTEGRITY");
}
function association(source: CertifiedTripEventSource): DayProjection["source"] {
  return {
    epochId: source.snapshot.epochId,
    revision: source.snapshot.collectionRevision,
    fingerprint: source.fingerprint,
    appliedGeneration: source.appliedGeneration,
  };
}
function encode(key: string, value: unknown): string | number | null {
  if (value === null) return null;
  if (key.endsWith("provenance_refs")) return JSON.stringify(value);
  if (key === "is_estimated_time") return value ? 1 : 0;
  return value as string | number;
}
function decode(row: Row, columns: readonly string[]) {
  return Object.fromEntries(
    columns.map((key) => {
      const value = row[key];
      if (key.endsWith("provenance_refs") && value !== null)
        return [key, JSON.parse(value as string)];
      if (key === "is_estimated_time") {
        if (value !== 0 && value !== 1) invalid();
        return [key, value === 1];
      }
      return [key, value];
    }),
  );
}
function validateEvent(event: DayEvent) {
  const roles = event.boundaries.map((b) => b.role).sort();
  if (
    JSON.stringify(roles) !==
    JSON.stringify(
      event.temporal_shape === "TRANSPORT" ? ["DESTINATION", "ORIGIN"] : ["END", "START"],
    )
  )
    invalid();
  if (event.participant_scope !== "UNASSIGNED") invalid();
  for (const b of event.boundaries) {
    if (b.local_date !== null) validateCalendarDate(b.local_date);
    if (b.source_instant !== null) instantMicroseconds(b.source_instant);
    if (b.instant === null) continue;
    const time = instantMicroseconds(b.instant);
    if (b.quality !== "EXACT" && b.quality !== "ESTIMATED") invalid();
    if (b.basis === "SOURCE_INSTANT") {
      if (b.source_instant === null || instantMicroseconds(b.source_instant) !== time)
        invalid();
    } else if (
      b.basis !== "DERIVED_CIVIL" ||
      !["UNIQUE", "FOLD_RESOLVED"].includes(b.civil_resolution ?? "") ||
      !b.local_date ||
      !b.local_time ||
      !b.zone_id ||
      b.resolution_offset_seconds === null
    )
      invalid();
    if (b.basis === "DERIVED_CIVIL" && civilBoundaryMicroseconds(b) !== time) invalid();
    if (["CALENDAR", "ALL_DAY", "WINDOW"].includes(event.temporal_shape)) invalid();
  }
  const start = event.boundaries.find((b) => b.role === "START" || b.role === "ORIGIN")!;
  const end = event.boundaries.find((b) => b.role === "END" || b.role === "DESTINATION")!;
  if (
    start.instant &&
    end.instant &&
    instantMicroseconds(end.instant) < instantMicroseconds(start.instant)
  )
    invalid();
  if (
    event.temporal_shape === "STAY" &&
    start.local_date &&
    end.local_date &&
    end.local_date < start.local_date
  )
    invalid();
}
function derive(source: CertifiedTripEventSource, generation: number): DayProjection {
  const events = source.events.map(({ event }) => {
    const boundaries =
      event.temporal_shape === "TRANSPORT"
        ? event.itinerary_transport_endpoints.map(
            ({ event_id: _id, ...endpoint }) => endpoint,
          )
        : (["start", "end"] as const).map((prefix) => ({
            ...Object.fromEntries(daySpatialColumns.map((key) => [key, null])),
            ...Object.fromEntries(
              dayTemporalColumns.map((key) => [
                key,
                key === "instant"
                  ? event[`planned_${prefix}`]
                  : event[`${prefix}_${key}` as keyof typeof event],
              ]),
            ),
            role: prefix === "start" ? "START" : "END",
          }));
    if (event.temporal_shape === "TRANSPORT") {
      for (const [role, instant] of [
        ["ORIGIN", event.planned_start],
        ["DESTINATION", event.planned_end],
      ] as const) {
        const boundary = boundaries.find((b) => b.role === role)!;
        if ((boundary as DayBoundary).instant !== instant) invalid();
      }
    }
    const projected = eventSchema.parse({
      id: event.id,
      ...Object.fromEntries(dayEventColumns.map((key) => [key, event[key]])),
      boundaries: boundaries.sort((a, b) =>
        a.role < b.role ? -1 : a.role > b.role ? 1 : 0,
      ),
    });
    validateEvent(projected);
    return projected;
  });
  return {
    accountId: source.context.accountId,
    tripId: source.context.tripId,
    version: 1,
    generation,
    source: association(source),
    events,
  };
}
export type ObservedDayProjection = {
  projection: DayProjection;
  sourceStatus: "CURRENTLY_MATCHES_SOURCE" | "HISTORICAL_ACCEPTED_PROJECTION";
};

export function createTripDayReadRepository(
  database: TripCanonicalEventDatabase,
  getActiveUserId: () => Promise<string>,
) {
  const canonical = createTripCanonicalEventRepository(database, getActiveUserId);
  async function header(context: AccountRequestContext) {
    const row = await database.getFirstAsync<Row>(
      "SELECT *,typeof(projection_generation) AS generation_storage,typeof(source_applied_generation) AS source_storage FROM trip_day_projections WHERE account_id=? AND trip_id=?",
      context.accountId,
      context.tripId,
    );
    if (!row) return null;
    if (
      row.account_id !== context.accountId ||
      row.trip_id !== context.tripId ||
      row.projection_version !== 1 ||
      row.generation_storage !== "integer" ||
      row.source_storage !== "integer"
    )
      invalid();
    const snapshot = collectionSnapshot.parse({
      epochId: row.source_epoch_id,
      collectionRevision: row.source_revision,
    });
    return {
      accountId: context.accountId,
      tripId: context.tripId,
      version: 1 as const,
      generation: generationSchema.parse(row.projection_generation),
      source: {
        epochId: snapshot.epochId,
        revision: snapshot.collectionRevision,
        fingerprint: collectionHash.parse(row.source_fingerprint),
        appliedGeneration: generationSchema.parse(row.source_applied_generation),
      },
      eventCount: collectionCount.parse(row.event_count),
    };
  }
  async function prepare(tripId: string) {
    collectionUuid.parse(tripId);
    const context = await captureAccountRequestContext(tripId, getActiveUserId);
    const captured = await canonical.withCertifiedCollection(context, async (source) =>
      source
        ? { source, previousGeneration: (await header(context))?.generation ?? 0 }
        : null,
    );
    if (!captured) return null;
    const nextGeneration = captured.previousGeneration + 1;
    generationSchema.parse(nextGeneration);
    const projection = derive(captured.source, nextGeneration);
    return {
      async install() {
        return canonical.withCertifiedCollection(context, async (source) => {
          if (
            !source ||
            JSON.stringify(association(source)) !== JSON.stringify(projection.source) ||
            JSON.stringify(source.ids) !==
              JSON.stringify(projection.events.map((e) => e.id)) ||
            ((await header(context))?.generation ?? 0) !== captured.previousGeneration
          )
            throw new Error("DAY_PROJECTION_SUPERSEDED");
          // App connections need not enable FK cascades; replacement owns only this scope.
          for (const table of ["trip_day_boundaries", "trip_day_events"])
            await database.runAsync(
              `DELETE FROM ${table} WHERE account_id=? AND trip_id=?`,
              context.accountId,
              tripId,
            );
          await database.runAsync(
            "DELETE FROM trip_day_projections WHERE account_id=? AND trip_id=?",
            context.accountId,
            tripId,
          );
          await database.runAsync(
            "INSERT INTO trip_day_projections VALUES(?,?,1,CAST(? AS INTEGER),?,?,?,CAST(? AS INTEGER),?)",
            context.accountId,
            tripId,
            projection.generation,
            projection.source.epochId,
            projection.source.revision,
            projection.source.fingerprint,
            projection.source.appliedGeneration,
            projection.events.length,
          );
          for (const event of projection.events) {
            await database.runAsync(
              `INSERT INTO trip_day_events(account_id,trip_id,event_id,${dayEventColumns.join(",")}) VALUES(${[...dayEventColumns, "a", "t", "e"].map(() => "?").join(",")})`,
              context.accountId,
              tripId,
              event.id,
              ...dayEventColumns.map((key) => encode(key, event[key])),
            );
            for (const boundary of event.boundaries)
              await database.runAsync(
                `INSERT INTO trip_day_boundaries(account_id,trip_id,event_id,role,${boundaryColumns.join(",")}) VALUES(${[...boundaryColumns, "a", "t", "e", "r"].map(() => "?").join(",")})`,
                context.accountId,
                tripId,
                event.id,
                boundary.role,
                ...boundaryColumns.map((key) => encode(key, boundary[key])),
              );
          }
          return { generation: projection.generation } as const;
        });
      },
    };
  }
  async function getProjection(tripId: string): Promise<ObservedDayProjection | null> {
    collectionUuid.parse(tripId);
    const context = await captureAccountRequestContext(tripId, getActiveUserId);
    let projection: DayProjection | null = null;
    await withAccountApplyGate(() =>
      database.withTransactionAsync(async () => {
        await assertAccountRequestContext(context, getActiveUserId);
        const current = await header(context);
        if (current) {
          const rows = await database.getAllAsync<Row>(
            "SELECT * FROM trip_day_events WHERE account_id=? AND trip_id=? ORDER BY event_id COLLATE BINARY",
            context.accountId,
            tripId,
          );
          const boundaries = await database.getAllAsync<Row>(
            "SELECT * FROM trip_day_boundaries WHERE account_id=? AND trip_id=? ORDER BY event_id COLLATE BINARY,role",
            context.accountId,
            tripId,
          );
          const byEvent = new Map<string, Row[]>();
          for (const boundary of boundaries) {
            const id = collectionUuid.parse(boundary.event_id);
            const list = byEvent.get(id) ?? [];
            list.push(boundary);
            byEvent.set(id, list);
          }
          const events = rows.map((row) =>
            eventSchema.parse({
              id: row.event_id,
              ...decode(row, dayEventColumns),
              boundaries: (byEvent.get(String(row.event_id)) ?? []).map((b) => ({
                role: b.role,
                ...decode(b, boundaryColumns),
              })),
            }),
          );
          const ids = new Set(events.map((e) => e.id));
          if (
            events.length !== current.eventCount ||
            ids.size !== events.length ||
            [...byEvent.keys()].some((id) => !ids.has(id))
          )
            invalid();
          events.forEach(validateEvent);
          projection = {
            accountId: current.accountId,
            tripId: current.tripId,
            version: current.version,
            generation: current.generation,
            source: current.source,
            events,
          };
        }
        await assertAccountRequestContext(context, getActiveUserId);
      }),
    );
    await assertAccountRequestContext(context, getActiveUserId);
    if (!projection) return null;
    const accepted: DayProjection = projection;
    let sourceStatus: ObservedDayProjection["sourceStatus"] =
      "HISTORICAL_ACCEPTED_PROJECTION";
    try {
      await canonical.withCertifiedCollection(context, async (source) => {
        if (
          source &&
          JSON.stringify(association(source)) === JSON.stringify(accepted.source) &&
          JSON.stringify(source.ids) ===
            JSON.stringify(accepted.events.map((e) => e.id)) &&
          (await header(context))?.generation === accepted.generation &&
          JSON.stringify(derive(source, accepted.generation)) === JSON.stringify(accepted)
        )
          sourceStatus = "CURRENTLY_MATCHES_SOURCE";
      });
    } catch {
      // Source availability is optional for historical offline reads; Account validity is not.
      await assertAccountRequestContext(context, getActiveUserId);
    }
    await assertAccountRequestContext(context, getActiveUserId);
    return { projection: accepted, sourceStatus };
  }
  async function query<T>(tripId: string, run: (p: DayProjection) => T) {
    const observed = await getProjection(tripId);
    return observed ? { ...observed, result: run(observed.projection) } : null;
  }
  return {
    prepare,
    async rebuild(tripId: string) {
      const prepared = await prepare(tripId);
      return prepared ? prepared.install() : null;
    },
    getProjection,
    itemsForLocalDate: (tripId: string, date: string, zone: string) =>
      query(tripId, (p) => itemsForLocalDate(p, date, zone)),
    today: (tripId: string, now: string, zone: string) =>
      query(tripId, (p) => today(p, now, zone)),
    tomorrow: (tripId: string, now: string, zone: string) =>
      query(tripId, (p) => tomorrow(p, now, zone)),
    nextComparableEvent: (tripId: string, now: string, zone: string) =>
      query(tripId, (p) => nextComparableEvent(p, now, zone)),
    unresolvedCandidates: (tripId: string) => query(tripId, unresolvedCandidates),
  };
}
