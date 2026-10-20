import {
  canonicalReadBytes,
  collectionManifestBytes,
  collectionUuid,
  eventCollectionPageSchema,
  eventCollectionWithheldSchema,
  decodeMobileEventCollectionCursor,
  utf8Length,
  EventCollectionError,
  type EventCollectionPage,
} from "@/data/api/tripEventCollectionCodec";
import type { CanonicalEventRead } from "@/data/api/tripCanonicalReadContracts";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";

type ReadOnly = Extract<CanonicalEventRead, { disposition: "READ_ONLY" }>;
export type CertifiedEventCollection = Pick<
  EventCollectionPage,
  "accountId" | "tripId" | "snapshot" | "eventCount" | "fingerprint"
> & { events: ReadOnly[] };
export type CollectionPageFetcher = (
  context: AccountRequestContext,
  cursor: string | null,
) => Promise<unknown>;
const invalid = () => new EventCollectionError(500, "CANONICAL_EVENT_SNAPSHOT_INVALID");
const limit = () => new EventCollectionError(503, "CANONICAL_EVENT_SNAPSHOT_LIMIT");
export async function fingerprintEventCollection(
  tripId: string,
  events: readonly ReadOnly[],
) {
  const crypto = await import("expo-crypto");
  const sha = (s: string) =>
    crypto.digestStringAsync(crypto.CryptoDigestAlgorithm.SHA256, s);
  const manifest: string[][] = [];
  for (const read of events)
    manifest.push([
      read.event.id,
      await sha("otr-trip-canonical-event-read-v1\n" + canonicalReadBytes(read)),
    ]);
  manifest.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return sha(collectionManifestBytes(tripId, manifest));
}
export async function verifyEventCollection(
  context: AccountRequestContext,
  getAccount: () => Promise<string>,
  fetchPage: CollectionPageFetcher,
): Promise<CertifiedEventCollection | null> {
  collectionUuid.parse(context.accountId);
  collectionUuid.parse(context.tripId);
  let cursor: string | null = null,
    identity: string | null = null,
    ordinal = 0,
    bytes = 0,
    previousId = "";
  const events: ReadOnly[] = [];
  for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
    await assertAccountRequestContext(context, getAccount);
    const raw = await fetchPage(context, cursor);
    await assertAccountRequestContext(context, getAccount);
    if (utf8Length(JSON.stringify(raw)) > 4 * 1024 * 1024) throw limit();
    if (eventCollectionWithheldSchema.safeParse(raw).success) return null;
    const result = eventCollectionPageSchema.safeParse(raw);
    if (!result.success) throw invalid();
    const page = result.data;
    const nextIdentity = JSON.stringify([
      page.accountId,
      page.tripId,
      page.snapshot,
      page.eventCount,
      page.fingerprint,
    ]);
    if (
      page.accountId !== context.accountId ||
      page.tripId !== context.tripId ||
      (identity !== null && identity !== nextIdentity) ||
      page.startOrdinal !== ordinal ||
      page.endOrdinal !== ordinal + page.events.length ||
      page.events.length !== Math.min(100, page.eventCount - ordinal) ||
      page.complete !== (page.endOrdinal === page.eventCount) ||
      (page.complete ? page.nextCursor !== null : page.nextCursor === null)
    )
      throw invalid();
    identity = nextIdentity;
    for (const read of page.events) {
      if (
        read.disposition !== "READ_ONLY" ||
        read.event.trip_id !== context.tripId ||
        read.event.participant_scope !== "UNASSIGNED" ||
        read.event.id <= previousId
      )
        throw invalid();
      for (const id of [
        read.event.id,
        read.event.trip_id,
        read.event.trip_day_id,
        read.event.reservation_id,
        read.event.accepted_place_id,
        ...read.event.itinerary_transport_endpoints.flatMap((e) => [
          e.event_id,
          e.accepted_place_id,
        ]),
      ])
        if (id !== null && !collectionUuid.safeParse(id).success) throw invalid();
      previousId = read.event.id;
      bytes += utf8Length(canonicalReadBytes(read));
      if (bytes > 64 * 1024 * 1024) throw limit();
      events.push(read);
    }
    ordinal = page.endOrdinal;
    if (page.complete) {
      if (
        events.length !== page.eventCount ||
        (await fingerprintEventCollection(context.tripId, events)) !== page.fingerprint
      )
        throw invalid();
      await assertAccountRequestContext(context, getAccount);
      return {
        accountId: page.accountId,
        tripId: page.tripId,
        snapshot: page.snapshot,
        eventCount: page.eventCount,
        fingerprint: page.fingerprint,
        events,
      };
    }
    const next = decodeMobileEventCollectionCursor(page.nextCursor!);
    if (
      next.accountId !== page.accountId ||
      next.tripId !== page.tripId ||
      next.snapshotEpochId !== page.snapshot.epochId ||
      next.snapshotRevision !== page.snapshot.collectionRevision ||
      next.fingerprint !== page.fingerprint ||
      next.eventCount !== page.eventCount ||
      next.nextOrdinal !== ordinal
    )
      throw invalid();
    cursor = page.nextCursor;
  }
  throw limit();
}
