import { z } from "zod";
import {
  canonicalEventReadSchema,
  type CanonicalEventRead,
} from "./tripCanonicalReadContracts";

export const collectionUuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  .pipe(z.uuid());
export const collectionRevision = z
  .string()
  .regex(/^[1-9][0-9]*$/)
  .refine((s) => BigInt(s) <= 9007199254740991n);
export const collectionHash = z.string().regex(/^[0-9a-f]{64}$/);
export const collectionCount = z.number().int().min(0).max(10000);
export const collectionSnapshot = z.strictObject({
  epochId: collectionUuid,
  collectionRevision: collectionRevision,
});
export const eventCollectionCursorSchema = z
  .strictObject({
    version: z.literal(1),
    purpose: z.literal("TRIP_CANONICAL_EVENTS"),
    accountId: collectionUuid,
    tripId: collectionUuid,
    collectionContractVersion: z.literal(1),
    readVersion: z.literal(1),
    temporalContractVersion: z.literal(1),
    fingerprintVersion: z.literal(1),
    snapshotEpochId: collectionUuid,
    snapshotRevision: collectionRevision,
    fingerprint: collectionHash,
    eventCount: collectionCount,
    nextOrdinal: z.number().int().positive(),
    ordering: z.literal("EVENT_ID_ASC"),
  })
  .refine((c) => c.nextOrdinal % 100 === 0 && c.nextOrdinal < c.eventCount);
export type EventCollectionCursor = z.infer<typeof eventCollectionCursorSchema>;
export class EventCollectionError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
const invalid = () => new EventCollectionError(500, "CANONICAL_EVENT_SNAPSHOT_INVALID");
const invalidCursor = () =>
  new EventCollectionError(400, "INVALID_EVENT_COLLECTION_CURSOR");

// B-T3G uses ECMAScript binary64/UTF-16-key JSON, not PostgreSQL jsonb::text.
export function canonicalReadBytes(read: CanonicalEventRead): string {
  if (read.disposition !== "READ_ONLY") throw invalid();
  const ordered = {
    ...read,
    event: {
      ...read.event,
      itinerary_transport_endpoints: [...read.event.itinerary_transport_endpoints].sort(
        (a, b) => (a.role < b.role ? -1 : a.role > b.role ? 1 : 0),
      ),
    },
  };
  return JSON.stringify(ordered, (_key, value) => {
    if (typeof value === "string" && !wellFormed(value)) throw invalid();
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (Object.keys(value).some((key) => !wellFormed(key))) throw invalid();
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, value[key]]),
      );
    }
    return value;
  });
}

function wellFormed(value: string) {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}
export function utf8Length(value: string) {
  if (!wellFormed(value)) throw invalid();
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x80) bytes++;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}
export function collectionManifestBytes(tripId: string, manifest: string[][]) {
  return (
    "otr-trip-canonical-event-collection-v1\n" +
    JSON.stringify([1, 1, 1, tripId, manifest])
  );
}
export function decodeMobileEventCollectionCursor(token: string): EventCollectionCursor {
  try {
    if (token.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(token)) throw invalidCursor();
    const text = atob(token.replace(/-/g, "+").replace(/_/g, "/"));
    // All normative cursor keys/values are ASCII. Non-ASCII cannot round-trip.
    if ([...text].some((c) => c.charCodeAt(0) > 127)) throw invalidCursor();
    const cursor = eventCollectionCursorSchema.parse(JSON.parse(text));
    const canonical = btoa(JSON.stringify(cursor))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    if (canonical !== token) throw invalidCursor();
    return cursor;
  } catch {
    throw invalidCursor();
  }
}
export const eventCollectionPageSchema = z.strictObject({
  collectionContractVersion: z.literal(1),
  readVersion: z.literal(1),
  temporalContractVersion: z.literal(1),
  fingerprintVersion: z.literal(1),
  disposition: z.literal("SNAPSHOT_PAGE"),
  accountId: collectionUuid,
  tripId: collectionUuid,
  snapshot: collectionSnapshot,
  eventCount: collectionCount,
  fingerprint: collectionHash,
  ordering: z.literal("EVENT_ID_ASC"),
  startOrdinal: z.number().int().min(0).max(10000),
  endOrdinal: z.number().int().min(0).max(10000),
  events: z.array(canonicalEventReadSchema).max(100),
  nextCursor: z.string().max(2048).nullable(),
  complete: z.boolean(),
});
export const eventCollectionWithheldSchema = z.strictObject({
  collectionContractVersion: z.literal(1),
  disposition: z.literal("WITHHELD"),
  reason: z.enum([
    "UNSUPPORTED_CLIENT",
    "UNSUPPORTED_EVENT_CONTRACT",
    "COLLECTION_CERTIFICATION_UNAVAILABLE",
  ]),
});
export type EventCollectionPage = z.infer<typeof eventCollectionPageSchema>;
