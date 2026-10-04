import type * as SQLite from "expo-sqlite";
import { z } from "zod";
import {
  canonicalEndpointSchema,
  canonicalEventFactsSchema,
  canonicalEventReadSchema,
  type CanonicalEventRead,
} from "@/data/api/tripCanonicalReadContracts";
import {
  assertAccountRequestContext,
  captureAccountRequestContext,
  withAccountApplyGate,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";

export type TripCanonicalEventDatabase = Pick<
  SQLite.SQLiteDatabase,
  "getFirstAsync" | "getAllAsync" | "runAsync" | "withTransactionAsync"
>;
export type ScopedCanonicalEventRead = {
  context: AccountRequestContext;
  data: CanonicalEventRead;
};
export type CanonicalEventMirrorOutcome =
  "APPLIED" | "UNCHANGED" | "IGNORED_OLDER" | "WITHHELD";
type ReadOnlyEvent = Extract<CanonicalEventRead, { disposition: "READ_ONLY" }>;
type Row = Record<string, unknown>;
const rootFields = Object.keys(canonicalEventFactsSchema.shape).filter(
  (key) => !["id", "trip_id", "itinerary_transport_endpoints"].includes(key),
);
const endpointFields = Object.keys(canonicalEndpointSchema.shape).filter(
  (key) => !["event_id", "role"].includes(key),
);
const booleanFields = new Set(["is_estimated_time", "legacy_is_estimated_time"]);
const rootColumns = [
  "account_id",
  "trip_id",
  "event_id",
  "read_version",
  "read_disposition",
  "legacy_compatible",
  "observation_sequence",
  "observed_generation",
  ...rootFields,
];
const endpointColumns = ["account_id", "trip_id", "event_id", "role", ...endpointFields];
function integrity(): never {
  throw new Error("CANONICAL_EVENT_MIRROR_INTEGRITY");
}
function encode(key: string, value: unknown): string | number | null {
  if (value === null) return null;
  if (key.endsWith("provenance_refs")) return JSON.stringify(value);
  if (booleanFields.has(key)) return value ? 1 : 0;
  return value as string | number;
}
function decodeFields(fields: string[], row: Row): Row {
  return Object.fromEntries(
    fields.map((key) => {
      const value = row[key];
      if (key.endsWith("provenance_refs") && value !== null)
        return [key, JSON.parse(value as string)];
      if (booleanFields.has(key) && value !== null) {
        if (value !== 0 && value !== 1) integrity();
        return [key, value === 1];
      }
      return [key, value];
    }),
  );
}
// One deterministic comparison for this read projection, not the command intent codec.
// Endpoint role is a key; map member order never changes an accepted fact.
function mirrorBytes(read: ReadOnlyEvent) {
  return JSON.stringify(
    {
      ...read,
      event: {
        ...read.event,
        itinerary_transport_endpoints: [...read.event.itinerary_transport_endpoints].sort(
          (a, b) => (a.role < b.role ? -1 : a.role > b.role ? 1 : 0),
        ),
      },
    },
    (_key, value) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
          )
        : value,
  );
}

export function createTripCanonicalEventRepository(
  database: TripCanonicalEventDatabase,
  getActiveUserId: () => Promise<string>,
  fetchEvent?: (tripId: string, eventId: string) => Promise<ScopedCanonicalEventRead>,
) {
  async function load(context: AccountRequestContext, eventId: string) {
    const row = await database.getFirstAsync<Row>(
      "SELECT * FROM trip_canonical_events WHERE account_id=? AND trip_id=? AND event_id=?",
      context.accountId,
      context.tripId,
      eventId,
    );
    if (!row) return null;
    if (row.read_version !== 1 || row.temporal_contract_version !== 1)
      return {
        data: {
          readVersion: 1,
          disposition: "WITHHELD",
          reason: "UNSUPPORTED_CONTRACT",
        } as CanonicalEventRead,
        sequence: row.observation_sequence as number,
      };
    const endpoints = await database.getAllAsync<Row>(
      "SELECT * FROM trip_canonical_transport_endpoints WHERE account_id=? AND trip_id=? AND event_id=? ORDER BY role",
      context.accountId,
      context.tripId,
      eventId,
    );
    try {
      const data = canonicalEventReadSchema.parse({
        readVersion: row.read_version,
        disposition: row.read_disposition,
        legacyCompatible: row.legacy_compatible === 0 ? false : row.legacy_compatible,
        event: {
          id: row.event_id,
          trip_id: row.trip_id,
          ...decodeFields(rootFields, row),
          itinerary_transport_endpoints: endpoints.map((endpoint) => ({
            event_id: endpoint.event_id,
            role: endpoint.role,
            ...decodeFields(endpointFields, endpoint),
          })),
        },
      });
      const sequence = z
        .number()
        .int()
        .min(1)
        .max(Number.MAX_SAFE_INTEGER)
        .parse(row.observation_sequence);
      return { data, sequence };
    } catch {
      return integrity();
    }
  }
  async function applyRead(
    context: AccountRequestContext,
    eventId: string,
    input: CanonicalEventRead,
  ): Promise<CanonicalEventMirrorOutcome> {
    z.uuid().parse(context.accountId);
    z.uuid().parse(context.tripId);
    z.uuid().parse(eventId);
    const read = canonicalEventReadSchema.parse(input);
    if (
      read.disposition === "READ_ONLY" &&
      (read.event.id !== eventId || read.event.trip_id !== context.tripId)
    )
      integrity();
    let outcome: CanonicalEventMirrorOutcome = "WITHHELD";
    await withAccountApplyGate(() =>
      database.withTransactionAsync(async () => {
        await assertAccountRequestContext(context, getActiveUserId);
        if (read.disposition === "READ_ONLY") {
          const current = await load(context, eventId);
          if (current?.data.disposition === "WITHHELD") integrity();
          const previous = current?.data as ReadOnlyEvent | undefined;
          if (
            previous &&
            read.event.semantic_revision < previous.event.semantic_revision
          ) {
            outcome = "IGNORED_OLDER";
          } else if (
            previous &&
            read.event.semantic_revision === previous.event.semantic_revision
          ) {
            // B-T3A permits only optional Place-cache UUID -> null at equal revision.
            // Compare every other fact before writing only the lost pointers.
            const losesRootPlace =
              previous.event.accepted_place_id !== null &&
              read.event.accepted_place_id === null;
            const lostEndpointRoles = previous.event.itinerary_transport_endpoints
              .filter(
                (endpoint) =>
                  endpoint.accepted_place_id !== null &&
                  read.event.itinerary_transport_endpoints.some(
                    (incoming) =>
                      incoming.role === endpoint.role &&
                      incoming.accepted_place_id === null,
                  ),
              )
              .map((endpoint) => endpoint.role);
            const normalized: ReadOnlyEvent = {
              ...previous,
              event: {
                ...previous.event,
                accepted_place_id: losesRootPlace
                  ? null
                  : previous.event.accepted_place_id,
                itinerary_transport_endpoints:
                  previous.event.itinerary_transport_endpoints.map((endpoint) =>
                    lostEndpointRoles.includes(endpoint.role)
                      ? { ...endpoint, accepted_place_id: null }
                      : endpoint,
                  ),
              },
            };
            if (mirrorBytes(read) !== mirrorBytes(normalized)) integrity();
            if (losesRootPlace)
              await database.runAsync(
                "UPDATE trip_canonical_events SET accepted_place_id=NULL WHERE account_id=? AND trip_id=? AND event_id=?",
                context.accountId,
                context.tripId,
                eventId,
              );
            for (const role of lostEndpointRoles)
              await database.runAsync(
                "UPDATE trip_canonical_transport_endpoints SET accepted_place_id=NULL WHERE account_id=? AND trip_id=? AND event_id=? AND role=?",
                context.accountId,
                context.tripId,
                eventId,
                role,
              );
            outcome =
              losesRootPlace || lostEndpointRoles.length ? "APPLIED" : "UNCHANGED";
          } else {
            const sequence = (current?.sequence ?? 0) + 1;
            if (!Number.isSafeInteger(sequence)) integrity();
            const event = read.event as unknown as Row;
            // UPSERT retains the scoped parent; endpoints are replaced in the same transaction.
            await database.runAsync(
              `INSERT INTO trip_canonical_events (${rootColumns.join(",")})
             VALUES (${rootColumns.map(() => "?").join(",")})
             ON CONFLICT(account_id,trip_id,event_id) DO UPDATE SET
             ${rootColumns
               .slice(3)
               .map((key) => `${key}=excluded.${key}`)
               .join(",")}`,
              context.accountId,
              context.tripId,
              eventId,
              read.readVersion,
              read.disposition,
              0,
              sequence,
              context.generation,
              ...rootFields.map((key) => encode(key, event[key])),
            );
            await database.runAsync(
              "DELETE FROM trip_canonical_transport_endpoints WHERE account_id=? AND trip_id=? AND event_id=?",
              context.accountId,
              context.tripId,
              eventId,
            );
            for (const endpoint of read.event.itinerary_transport_endpoints) {
              const fields = endpoint as unknown as Row;
              await database.runAsync(
                `INSERT INTO trip_canonical_transport_endpoints (${endpointColumns.join(",")})
               VALUES (${endpointColumns.map(() => "?").join(",")})`,
                context.accountId,
                context.tripId,
                eventId,
                endpoint.role,
                ...endpointFields.map((key) => encode(key, fields[key])),
              );
            }
            outcome = "APPLIED";
          }
        }
        await assertAccountRequestContext(context, getActiveUserId);
      }),
    );
    return outcome;
  }
  return {
    applyRead,
    async getEvent(
      tripId: string,
      eventId: string,
    ): Promise<ScopedCanonicalEventRead | null> {
      z.uuid().parse(tripId);
      z.uuid().parse(eventId);
      const context = await captureAccountRequestContext(tripId, getActiveUserId);
      let result: ScopedCanonicalEventRead | null = null;
      await withAccountApplyGate(() =>
        database.withTransactionAsync(async () => {
          await assertAccountRequestContext(context, getActiveUserId);
          const current = await load(context, eventId);
          if (current) result = { context, data: current.data };
          await assertAccountRequestContext(context, getActiveUserId);
        }),
      );
      await assertAccountRequestContext(context, getActiveUserId);
      return result;
    },
    async refreshEvent(tripId: string, eventId: string) {
      if (!fetchEvent) throw new Error("CANONICAL_EVENT_READ_TRANSPORT_UNAVAILABLE");
      z.uuid().parse(tripId);
      z.uuid().parse(eventId);
      const { context, data } = await fetchEvent(tripId, eventId); // No apply gate across I/O.
      if (context.tripId !== tripId) integrity();
      return applyRead(context, eventId, data);
    },
  };
}
