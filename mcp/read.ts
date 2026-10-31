import { createHash } from "node:crypto";
import { z } from "zod";
import { tripDiscoveryPageSchema } from "../src/domain/trip/tripDiscoveryContract";
import { validateCoreReadCollection } from "../src/domain/trip/tripCoreV2Read";
import { createRequestBoundary, readBoundedJson } from "../src/data/api/requestBoundary";
import {
  envelopeValue,
  itemSchema,
  itemSummarySchema,
  listItemsInput,
  listTripsInput,
  tripInput,
  itemInput,
} from "./contract";

// The host binds this GET-only port to its verified actor. No token or actor override is a tool argument.
export type BackendRead = (path: string, signal: AbortSignal) => Promise<Response>;
export class ReadError extends Error {
  constructor(
    public readonly code:
      | "NOT_VISIBLE"
      | "BACKEND_UNAVAILABLE"
      | "BACKEND_TIMEOUT"
      | "INVALID_INPUT"
      | "STALE_CURSOR"
      | "READ_LIMIT"
      | "AUTH_REQUIRED",
  ) {
    super(code);
  }
}
const digest = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const cursorSchema = z.strictObject({
  snapshot: z.string().regex(/^[a-f0-9]{64}$/),
  after: z.uuid(),
});
export function createReadTools(
  accountId: string,
  read: BackendRead,
  signal?: AbortSignal,
) {
  async function json(path: string) {
    const boundary = createRequestBoundary(50000, signal);
    try {
      const response = await boundary.run(() => read(path, boundary.signal));
      if (!response.ok) {
        void response.body?.cancel().catch(() => undefined);
        throw new ReadError(
          response.status === 404 || response.status === 403
            ? "NOT_VISIBLE"
            : response.status === 401
              ? "AUTH_REQUIRED"
              : "BACKEND_UNAVAILABLE",
        );
      }
      return await readBoundedJson(response, 67108864, boundary);
    } catch (error) {
      if (error instanceof ReadError) throw error;
      if (boundary.signal.aborted) throw new ReadError("BACKEND_TIMEOUT");
      throw new ReadError("BACKEND_UNAVAILABLE");
    } finally {
      boundary.close();
    }
  }
  async function trips(cursor: string | undefined, limit: number) {
    return tripDiscoveryPageSchema.parse(
      await json(`/v2/trips?limit=${limit}${cursor ? `&cursor=${cursor}` : ""}`),
    );
  }
  async function item(trip: string, id: string) {
    const result = itemSchema.parse(
      await json(`/v2/trips/${trip}/core/objects/ITEM/${id}`),
    );
    if (result.tripId !== trip || result.itemId !== id)
      throw new ReadError("BACKEND_UNAVAILABLE");
    return result;
  }
  return {
    async list_trips(raw: unknown) {
      const q = listTripsInput.parse(raw),
        p = await trips(q.cursor, q.limit);
      if (
        p.trips.length > q.limit ||
        p.trips.some((t) => q.cursor && t.id <= q.cursor) ||
        (p.nextCursor && p.nextCursor <= (q.cursor ?? ""))
      )
        throw new ReadError("BACKEND_UNAVAILABLE");
      return { ...envelopeValue, trips: p.trips, next_cursor: p.nextCursor };
    },
    async get_trip(raw: unknown) {
      const q = tripInput.parse(raw);
      let cursor: string | undefined;
      // shortcut: discovery has no single-Trip summary port, replace bounded scan when the owner supplies one.
      for (let page = 0; page < 200; page++) {
        const p = await trips(cursor, 25);
        const found = p.trips.find((t) => t.id === q.trip_id);
        if (found) return { ...envelopeValue, trip: found };
        if (!p.nextCursor) throw new ReadError("NOT_VISIBLE");
        if (p.nextCursor <= (cursor ?? "")) throw new ReadError("BACKEND_UNAVAILABLE");
        cursor = p.nextCursor;
      }
      throw new ReadError("READ_LIMIT");
    },
    async get_trip_item(raw: unknown) {
      const q = itemInput.parse(raw);
      return { ...envelopeValue, item: await item(q.trip_id, q.item_id) };
    },
    async list_trip_items(raw: unknown) {
      const q = listItemsInput.parse(raw);
      const wire = z
        .object({ manifest: z.unknown(), pages: z.array(z.unknown()).max(100) })
        .parse(await json(`/v2/trips/${q.trip_id}/core/collection`));
      const current = await validateCoreReadCollection(
        wire.manifest,
        wire.pages,
        accountId,
        q.trip_id,
        async (bytes) => digest(bytes),
      );
      const snapshot = digest(
        JSON.stringify([
          accountId,
          q.trip_id,
          current.manifest.epoch,
          current.manifest.revision,
          current.manifest.accessRevision,
          q.date_from,
          q.date_to,
        ]),
      );
      let after = "";
      if (q.cursor) {
        let c: z.infer<typeof cursorSchema>;
        try {
          c = cursorSchema.parse(
            JSON.parse(Buffer.from(q.cursor, "base64url").toString("utf8")),
          );
        } catch {
          throw new ReadError("INVALID_INPUT");
        }
        if (c.snapshot !== snapshot) throw new ReadError("STALE_CURSOR");
        after = c.after;
      }
      const localDates = (row: (typeof current.graph.itinerary_events)[number]) =>
        [
          ...new Set(
            [
              row.start_local_date,
              row.end_local_date,
              ...current.graph.itinerary_transport_endpoints
                .filter((e) => e.event_id === row.id)
                .map((e) => e.local_date),
            ].filter((d): d is string => typeof d === "string"),
          ),
        ].sort();
      const candidates = current.graph.itinerary_events
        .filter((row) => {
          if (!q.date_from) return true;
          const dates = localDates(row);
          return (
            dates.length > 0 &&
            dates[0] <= (q.date_to ?? q.date_from) &&
            dates[dates.length - 1] >= q.date_from
          );
        })
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
        .filter((row) => String(row.id) > after);
      const rows = candidates.slice(0, q.limit);
      // Project only the already-validated visible snapshot; object GET repeats the entire snapshot.
      const items = rows.map((row) => {
        const flight = current.graph.trip_flight_intents.find(
          (r) => r.event_id === row.id,
        );
        return itemSummarySchema.parse({
          view: "SUMMARY",
          itemId: row.id,
          tripId: row.trip_id,
          itemRevision: row.semantic_revision,
          family: row.experience_family,
          title: row.title,
          localDates: localDates(row),
          status: row.status,
          hidden: row.hidden_at !== null,
          temporalShape: row.temporal_shape,
          ...(row.experience_family === "P2" && flight
            ? {
                flight: {
                  qualification: flight.qualification,
                  flightNumberLiteral: flight.flight_number_literal,
                },
              }
            : {}),
          ...(row.experience_family === "P5"
            ? {
                transportServices: current.graph.itinerary_transport_services
                  .filter((r) => r.event_id === row.id)
                  .sort((a, b) =>
                    String(a.service_key).localeCompare(String(b.service_key)),
                  )
                  .map((r) => ({
                    serviceKey: r.service_key,
                    transportSubtype: r.transport_subtype,
                    attribution: r.attribution,
                    operatorNamespace: r.operator_namespace ?? undefined,
                    operatorIssuer: r.operator_issuer ?? undefined,
                    operatorValue: r.operator_value ?? undefined,
                    operatorLiteral: r.operator_literal ?? undefined,
                    serviceNumber: r.service_number ?? undefined,
                    serviceLiteral: r.service_literal ?? undefined,
                    codeshareOperatingKey: r.codeshare_operating_key ?? undefined,
                  })),
              }
            : {}),
          detail: {
            tool: "get_trip_item",
            arguments: { trip_id: row.trip_id, item_id: row.id },
          },
        });
      });
      return {
        ...envelopeValue,
        items,
        snapshot,
        next_cursor:
          candidates.length > q.limit
            ? Buffer.from(
                JSON.stringify({ snapshot, after: String(rows.at(-1)!.id) }),
              ).toString("base64url")
            : null,
      };
    },
  };
}
