import { ttrIdentity, ttrIdentityKey, type TtrInput } from "../ttr";
import {
  openTtr,
  reduceTtr,
  type TtrEvent,
  type TtrSelection,
  type TtrState,
} from "../ttrState";

// Synthetic authoritative tokens are supplied, never derived from dates or rendered rows.
export function ttrFixture(): TtrInput {
  const accountId = "10000000-0000-4000-8000-000000000001";
  const tripId = "20000000-0000-4000-8000-000000000001";
  const make = (
    eventId: string,
    occurrenceToken: string,
    role: "END" | "START",
    longitude: number,
  ) => ({
    accountId,
    tripId,
    travellerKey: "synthetic-person/branch-1",
    sourceKey: "synthetic-source/1",
    eventId,
    occurrenceToken,
    role,
    semanticRevision: 1,
    applicable: "YES" as const,
    title: "Synthetic Event",
    endpoint: {
      role,
      qualification: "QUALIFIED" as const,
      coordinates: { latitude: 0, longitude },
      provenance: "synthetic-accepted-coordinate",
      locationInputRevision: 1,
    },
  });
  return {
    scope: {
      accountId,
      tripId,
      travellerKey: "synthetic-person/branch-1",
      generation: 1,
    },
    source: { key: "synthetic-source/1", accessible: true, complete: true },
    from: make("30000000-0000-4000-8000-000000000001", "synthetic-exit-1", "END", 0),
    to: make("30000000-0000-4000-8000-000000000002", "synthetic-entry-1", "START", 1),
    continuity: {
      fromToken: "synthetic-exit-1",
      toToken: "synthetic-entry-1",
      travellerKey: "synthetic-person/branch-1",
      provenance: "synthetic-authored-chain",
      proven: true,
      crossDay: false,
    },
    special: "ORDINARY",
    blockAnchorsConfirmed: false,
    period: "FUTURE",
    queryTime: null,
    expiry: { eventDate: "2026-10-12", zone: "Pacific/Auckland" },
    anchors: { fromRowKey: "synthetic-row-a", toRowKey: "synthetic-row-b" },
  };
}
export const syntheticObservation = (
  mode: "walking" | "driving" | "transit" = "walking",
) => ({
  source: "SYNTHETIC_FIXTURE",
  provider: "SYNTHETIC",
  method: "ETA",
  mode,
  observedAt: "2026-10-11T22:00:00Z",
  durationSeconds: 600,
  routeDistanceMeters: 1500,
});
export class TtrMemoryTestRepository {
  private readonly rows = new Map<string, TtrSelection>();
  writes = 0;
  open(input: TtrInput, publicationVersion = 0): TtrState {
    const id = ttrIdentity(input);
    return openTtr(
      input,
      id ? (this.rows.get(ttrIdentityKey(id)) ?? null) : null,
      publicationVersion,
    );
  }
  dispatch(state: TtrState, event: TtrEvent): TtrState {
    const next = reduceTtr(state, event);
    if (
      next !== state &&
      next.confirmed &&
      (event.type === "CONFIRM" ||
        (event.type === "REFRESH" && next.qualification.status === "QUALIFIED"))
    ) {
      this.rows.set(next.confirmed.identityKey, { ...next.confirmed });
      this.writes++;
    }
    if (event.type === "CLEANUP" && state.confirmed && !next.confirmed) {
      this.rows.delete(state.confirmed.identityKey);
      this.writes++;
    }
    return next;
  }
  count() {
    return this.rows.size;
  }
}
