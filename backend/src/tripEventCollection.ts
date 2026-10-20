import {
  collectionUuid,
  collectionSnapshot,
  eventCollectionCursorSchema,
  canonicalReadBytes,
  EventCollectionError,
  collectionManifestBytes,
  type EventCollectionCursor,
} from "../../src/data/api/tripEventCollectionCodec";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  canonicalEventReadSchema,
  type CanonicalEventRead,
} from "../../src/data/api/tripCanonicalReadContracts";

const uuid = collectionUuid,
  snapshot = collectionSnapshot,
  cursorSchema = eventCollectionCursorSchema;
type Cursor = EventCollectionCursor;
export { canonicalReadBytes, EventCollectionError };
const invalid = () => new EventCollectionError(500, "CANONICAL_EVENT_SNAPSHOT_INVALID");
const invalidCursor = () =>
  new EventCollectionError(400, "INVALID_EVENT_COLLECTION_CURSOR");
const limit = () => new EventCollectionError(503, "CANONICAL_EVENT_SNAPSHOT_LIMIT");
const sha = (bytes: string) => createHash("sha256").update(bytes, "utf8").digest("hex");
export function collectionFingerprint(tripId: string, events: CanonicalEventRead[]) {
  const manifest = events
    .map((read) => {
      if (read.disposition !== "READ_ONLY") throw invalid();
      return [
        read.event.id,
        sha("otr-trip-canonical-event-read-v1\n" + canonicalReadBytes(read)),
      ];
    })
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return sha(collectionManifestBytes(tripId, manifest));
}
function encodeCursor(input: Cursor) {
  const c = cursorSchema.parse(input);
  // z.strictObject produces the normative key order; re-encoding rejects duplicates,
  // alternate UTF-8/base64/numeric/key spellings even when JSON.parse accepts them.
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}
export function decodeEventCollectionCursor(token: string): Cursor {
  try {
    if (token.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(token)) throw invalidCursor();
    const bytes = Buffer.from(token, "base64url");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const result = cursorSchema.parse(JSON.parse(text));
    if (encodeCursor(result) !== token) throw invalidCursor();
    return result;
  } catch {
    throw invalidCursor();
  }
}
export function parseEventCollectionQuery(url: URL): string | null {
  if (!url.search) return null;
  const entries = [...url.searchParams.entries()];
  if (entries.length !== 1 || entries[0][0] !== "cursor" || !entries[0][1])
    throw invalidCursor();
  decodeEventCollectionCursor(entries[0][1]);
  return entries[0][1];
}
const observationSchema = z.strictObject({
  disposition: z.literal("OBSERVATION"),
  snapshot,
  events: z.array(canonicalEventReadSchema),
});
const withheldSchema = z.strictObject({
  disposition: z.literal("WITHHELD"),
  reason: z.enum(["UNSUPPORTED_EVENT_CONTRACT", "COLLECTION_CERTIFICATION_UNAVAILABLE"]),
});
export function eventCollectionPage(
  raw: unknown,
  accountId: string,
  tripId: string,
  token: string | null,
) {
  try {
    uuid.parse(accountId);
    uuid.parse(tripId);
  } catch {
    throw invalid();
  }
  const cursor = token === null ? null : decodeEventCollectionCursor(token);
  if (cursor && (cursor.accountId !== accountId || cursor.tripId !== tripId))
    throw invalidCursor();
  const withheld = withheldSchema.safeParse(raw);
  if (withheld.success)
    return { collectionContractVersion: 1 as const, ...withheld.data };
  const parsed = observationSchema.safeParse(raw);
  if (!parsed.success) throw invalid();
  const observation = parsed.data;
  if (observation.events.length > 10000) throw limit();
  let byteCount = 0;
  const events = observation.events
    .map((read) => {
      if (
        read.disposition !== "READ_ONLY" ||
        read.event.trip_id !== tripId ||
        read.event.participant_scope !== "UNASSIGNED"
      )
        throw invalid();
      for (const field of [
        read.event.id,
        read.event.trip_id,
        read.event.trip_day_id,
        read.event.reservation_id,
        read.event.accepted_place_id,
        ...read.event.itinerary_transport_endpoints.flatMap((end) => [
          end.event_id,
          end.accepted_place_id,
        ]),
      ])
        if (field !== null && !uuid.safeParse(field).success) throw invalid();
      byteCount += Buffer.byteLength(canonicalReadBytes(read), "utf8");
      if (byteCount > 64 * 1024 * 1024) throw limit();
      return read;
    })
    .sort((a, b) => (a.event!.id < b.event!.id ? -1 : a.event!.id > b.event!.id ? 1 : 0));
  if (new Set(events.map((r) => r.event.id)).size !== events.length) throw invalid();
  const fingerprint = collectionFingerprint(tripId, events);
  if (cursor) {
    if (
      cursor.accountId !== accountId ||
      cursor.tripId !== tripId ||
      cursor.snapshotEpochId !== observation.snapshot.epochId ||
      cursor.snapshotRevision !== observation.snapshot.collectionRevision
    )
      throw invalidCursor();
    if (cursor.fingerprint !== fingerprint) throw invalid();
    if (cursor.eventCount !== events.length) throw invalidCursor();
  }
  const startOrdinal = cursor?.nextOrdinal ?? 0;
  const endOrdinal = Math.min(startOrdinal + 100, events.length);
  const complete = endOrdinal === events.length;
  const nextCursor = complete
    ? null
    : encodeCursor({
        version: 1,
        purpose: "TRIP_CANONICAL_EVENTS",
        accountId,
        tripId,
        collectionContractVersion: 1,
        readVersion: 1,
        temporalContractVersion: 1,
        fingerprintVersion: 1,
        snapshotEpochId: observation.snapshot.epochId,
        snapshotRevision: observation.snapshot.collectionRevision,
        fingerprint,
        eventCount: events.length,
        nextOrdinal: endOrdinal,
        ordering: "EVENT_ID_ASC",
      });
  const page = {
    collectionContractVersion: 1,
    readVersion: 1,
    temporalContractVersion: 1,
    fingerprintVersion: 1,
    disposition: "SNAPSHOT_PAGE",
    accountId,
    tripId,
    snapshot: observation.snapshot,
    eventCount: events.length,
    fingerprint,
    ordering: "EVENT_ID_ASC",
    startOrdinal,
    endOrdinal,
    events: events.slice(startOrdinal, endOrdinal),
    nextCursor,
    complete,
  };
  if (Buffer.byteLength(JSON.stringify(page), "utf8") > 4 * 1024 * 1024) throw limit();
  return page;
}
export type EventCollectionConnection = {
  sessionUser(): Promise<string>;
  observe(actor: string, trip: string): Promise<unknown>;
};
