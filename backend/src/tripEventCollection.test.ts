import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  canonicalEventFactsSchema,
  canonicalEndpointSchema,
  type CanonicalEventRead,
} from "../../src/data/api/tripCanonicalReadContracts";
import {
  canonicalReadBytes,
  collectionFingerprint,
  decodeEventCollectionCursor,
  eventCollectionPage,
  EventCollectionError,
} from "./tripEventCollection";
import { createDevBackendHandler, type DevBackendGateway } from "./app";
import { createSupabaseDevGateway } from "./supabaseGateway";
const trip = "20000000-0000-4000-8000-000000000001",
  account = "10000000-0000-4000-8000-000000000001",
  epoch = "40000000-0000-4000-8000-000000000001",
  place = "50000000-0000-4000-8000-000000000001";
type ReadOnly = Extract<CanonicalEventRead, { disposition: "READ_ONLY" }>;
function fixture(id = "30000000-0000-4000-8000-000000000001"): ReadOnly {
  return {
    readVersion: 1,
    disposition: "READ_ONLY",
    legacyCompatible: false,
    event: {
      ...Object.fromEntries(
        Object.keys(canonicalEventFactsSchema.shape).map((k) => [k, null]),
      ),
      id,
      trip_id: trip,
      temporal_contract_version: 1,
      temporal_shape: "POINT",
      semantic_revision: 1,
      title: "Canonical",
      event_type: "activity",
      status: "planned",
      order_index: 0,
      participant_scope: "UNASSIGNED",
      is_estimated_time: false,
      location_input_revision: 1,
      start_quality: "UNKNOWN",
      start_basis: "DERIVED_CIVIL",
      start_civil_resolution: "PENDING",
      start_provenance_refs: {},
      itinerary_transport_endpoints: [],
    },
  } as unknown as ReadOnly;
}
const observation = (events: CanonicalEventRead[] = [], collectionRevision = "1") => ({
  disposition: "OBSERVATION",
  snapshot: { epochId: epoch, collectionRevision },
  events,
});
const many = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    fixture(`30000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`),
  );
function transport() {
  const read = fixture();
  Object.assign(read.event, {
    temporal_shape: "TRANSPORT",
    start_quality: null,
    start_basis: null,
    start_civil_resolution: null,
    start_provenance_refs: null,
    location_input_revision: null,
    itinerary_transport_endpoints: ["ORIGIN", "DESTINATION"].map((role) => ({
      ...Object.fromEntries(
        Object.keys(canonicalEndpointSchema.shape).map((k) => [k, null]),
      ),
      event_id: read.event.id,
      role,
      quality: "UNKNOWN",
      basis: "DERIVED_CIVIL",
      civil_resolution: "PENDING",
      provenance_refs: {},
      location_input_revision: 1,
    })),
  });
  return read;
}
const asToken = (c: unknown) => Buffer.from(JSON.stringify(c)).toString("base64url");
const request = (query = "", method = "GET", headers: Record<string, string> = {}) =>
  new Request(`http://local/v2/trips/${trip}/canonical-events/snapshot${query}`, {
    method,
    headers: {
      Authorization: "Bearer valid",
      "X-OTR-Canonical-Event-Collection-Version": "1",
      "X-OTR-Canonical-Event-Read-Version": "1",
      ...headers,
    },
  });
const handler = (extra: Partial<DevBackendGateway> = {}) =>
  createDevBackendHandler({
    gateway: {
      validateAccessToken: async () => ({ id: account }),
      canReadTrip: async () => true,
      observeCanonicalEventCollection: async () => observation(),
      ...extra,
    } as DevBackendGateway,
  });
describe("B-T3H protected collection page", () => {
  it("reproduces all independent B-T3G golden bytes and hashes", () => {
    const point = fixture(),
      pointer = fixture(),
      loss = fixture();
    Object.assign(pointer.event, {
      accepted_address: "Station",
      accepted_place_id: place,
      spatial_provenance_refs: { accepted_address: "otr-event/confirmation/address" },
    });
    Object.assign(loss.event, { ...pointer.event, accepted_place_id: null });
    expect(collectionFingerprint(trip, [])).toBe(
      "2de0e2f1c8e62730cbe6c2a9fad7fe95962d0549b25e83b36bc1f8079cd6cbb2",
    );
    for (const [read, length, leaf, digest] of [
      [
        point,
        2140,
        "146f954a8f869d78d246f30284cb77bef4e669eafdb955839e8091c8e1e95e68",
        "c309fd3f17c8722fdb92805c3f8be2fd883f8f69c4a7783ee520b2ae4ed420a7",
      ],
      [
        pointer,
        2228,
        "09b5daee7b9fe27dca6afc6fed9d832050f0647cde8ace1a58f5218d063e5d2c",
        "2ef7b999cae0fbae1fd2b027d081cc3dcb1a99aca838d7c7bc1a5086483f82e6",
      ],
      [
        loss,
        2194,
        "92be2fa0d01bb4eba4335d3bca9db248f263c7d1d2e373b1b1958490f621ff53",
        "c48e08190a25614721677542c64a742b863ced01fbfb069e52b8127336e4f972",
      ],
      [
        transport(),
        4212,
        "e2994781763cf82f41c45a6ec58a28a9c69579ff7d98d8db1cdc3af4ff4f852b",
        "05ff9d868a7822415e280936bc0124b01846dfc0c44fd205dd3716e21b67a561",
      ],
    ] as const) {
      const bytes = "otr-trip-canonical-event-read-v1\n" + canonicalReadBytes(read);
      expect(Buffer.byteLength(bytes)).toBe(length);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(leaf);
      expect(collectionFingerprint(trip, [read])).toBe(digest);
    }
  });
  it("pins ECMAScript binary64, control/Unicode scalar and key/endpoint ordering", () => {
    const r = transport();
    r.event.description = '雪🚆\b\t\n\f\r"\\/\u000b\u2028';
    Object.assign(r.event.itinerary_transport_endpoints[0], {
      accepted_latitude: -0,
      accepted_longitude: 1e-7,
      spatial_provenance_refs: { z: "雪", a: "🚆" },
    });
    const bytes = canonicalReadBytes(r);
    expect(bytes).toContain('"accepted_latitude":0,"accepted_longitude":1e-7');
    expect(bytes).toContain('"spatial_provenance_refs":{"a":"🚆","z":"雪"}');
    expect(bytes).toContain('雪🚆\\b\\t\\n\\f\\r\\"\\\\/\\u000b\u2028');
    const reversed = structuredClone(r);
    reversed.event.itinerary_transport_endpoints.reverse();
    expect(canonicalReadBytes(reversed)).toBe(bytes);
    r.event.title = "\ud800";
    expect(() => eventCollectionPage(observation([r]), account, trip, null)).toThrow(
      "CANONICAL_EVENT_SNAPSHOT_INVALID",
    );
  });
  it("empty is certified; one remains lossless read-only", () => {
    expect(eventCollectionPage(observation(), account, trip, null)).toMatchObject({
      eventCount: 0,
      startOrdinal: 0,
      endOrdinal: 0,
      events: [],
      complete: true,
      nextCursor: null,
    });
    const read = fixture();
    read.event.start_source_instant = "2026-12-17T06:00:00.123456+12:00";
    expect(eventCollectionPage(observation([read]), account, trip, null)).toMatchObject({
      events: [read],
      complete: true,
      nextCursor: null,
    });
  });
  it("1203 complete aggregates produce 13 contiguous pages and identical page retries", () => {
    const raw = observation(many(1203).reverse());
    let token: string | null = null;
    let seen = 0;
    let pages = 0;
    do {
      const page = eventCollectionPage(raw, account, trip, token);
      expect(page).toEqual(eventCollectionPage(raw, account, trip, token));
      if (!("events" in page)) throw new Error("unexpected withholding");
      expect(page.startOrdinal).toBe(seen);
      seen += page.events.length;
      pages++;
      if (page.nextCursor)
        expect(decodeEventCollectionCursor(page.nextCursor).nextOrdinal).toBe(seen);
      else
        expect(page).toMatchObject({
          endOrdinal: 1203,
          events: many(1203).slice(1200),
          complete: true,
        });
      token = page.nextCursor;
    } while (token);
    expect([seen, pages]).toEqual([1203, 13]);
  });
  it.each(["mutation", "ABA", "delete", "Place loss"])(
    "%s between pages invalidates the old snapshot",
    (kind) => {
      const raw = observation(many(101));
      const first = eventCollectionPage(raw, account, trip, null);
      if (!("nextCursor" in first)) throw new Error("unexpected withholding");
      if (kind === "delete") raw.events.pop();
      if (kind === "mutation") (raw.events[0] as ReadOnly).event.title = "changed";
      raw.snapshot.collectionRevision = "2";
      expect(() => eventCollectionPage(raw, account, trip, first.nextCursor)).toThrow(
        "INVALID_EVENT_COLLECTION_CURSOR",
      );
    },
  );
  it("equal snapshot identity with contradictory hash is an integrity error", () => {
    const raw = observation(many(101));
    const first = eventCollectionPage(raw, account, trip, null);
    if (!("nextCursor" in first)) throw new Error("unexpected withholding");
    (raw.events[0] as ReadOnly).event.title = "tampered";
    expect(() => eventCollectionPage(raw, account, trip, first.nextCursor)).toThrow(
      "CANONICAL_EVENT_SNAPSHOT_INVALID",
    );
  });
  it("rejects duplicate/cross-Trip/noncanonical UUIDs and invalid TRANSPORT aggregates", () => {
    for (const reads of [
      [fixture(), fixture()],
      [{ ...fixture(), event: { ...fixture().event, trip_id: account } }],
      [
        {
          ...fixture(),
          event: { ...fixture().event, id: "ABCDEF00-0000-4000-8000-000000000001" },
        },
      ],
      [
        {
          ...transport(),
          event: { ...transport().event, itinerary_transport_endpoints: [] },
        },
      ],
    ])
      expect(() => eventCollectionPage(observation(reads), account, trip, null)).toThrow(
        "CANONICAL_EVENT_SNAPSHOT_INVALID",
      );
  });
  it("unsupported whole-set observation returns no Events or certificate", () => {
    expect(
      eventCollectionPage(
        { disposition: "WITHHELD", reason: "UNSUPPORTED_EVENT_CONTRACT" },
        account,
        trip,
        null,
      ),
    ).toEqual({
      collectionContractVersion: 1,
      disposition: "WITHHELD",
      reason: "UNSUPPORTED_EVENT_CONTRACT",
    });
  });
  it("checks the complete 64 MiB budget before certifying a small first page", () => {
    const reads = many(101);
    reads[100].event.description = "x".repeat(64 * 1024 * 1024);
    expect(() => eventCollectionPage(observation(reads), account, trip, null)).toThrow(
      "CANONICAL_EVENT_SNAPSHOT_LIMIT",
    );
  });
  it("caps count and actual response bytes without truncating", () => {
    expect(() =>
      eventCollectionPage(observation(many(10001)), account, trip, null),
    ).toThrow("CANONICAL_EVENT_SNAPSHOT_LIMIT");
    const r = fixture();
    r.event.description = "x".repeat(4 * 1024 * 1024);
    expect(() => eventCollectionPage(observation([r]), account, trip, null)).toThrow(
      "CANONICAL_EVENT_SNAPSHOT_LIMIT",
    );
  });
  it("rejects malformed/future/extra/duplicate/noncanonical encoded cursors and scope changes", () => {
    const page = eventCollectionPage(observation(many(101)), account, trip, null);
    if (!("nextCursor" in page) || !page.nextCursor) throw new Error("missing cursor");
    const c = decodeEventCollectionCursor(page.nextCursor);
    for (const bad of [
      "?",
      page.nextCursor + "=",
      asToken({ ...c, version: 2 }),
      asToken({ ...c, extra: true }),
      asToken({ ...c, nextOrdinal: 0 }),
      asToken({ ...c, nextOrdinal: 101 }),
      asToken({ ...c, snapshotRevision: "01" }),
      Buffer.from(
        JSON.stringify(c).replace('"version":1', '"version":1,"version":1'),
      ).toString("base64url"),
      Buffer.from(JSON.stringify(c).replace('"version":1', '"version":1.0')).toString(
        "base64url",
      ),
      Buffer.from([0xff]).toString("base64url"),
      "x".repeat(2049),
    ])
      expect(() => decodeEventCollectionCursor(bad)).toThrow(
        "INVALID_EVENT_COLLECTION_CURSOR",
      );
    for (const changed of [
      { ...c, accountId: trip },
      { ...c, tripId: account },
      { ...c, snapshotEpochId: account },
      { ...c, eventCount: 102 },
    ])
      expect(() =>
        eventCollectionPage(observation(many(101)), account, trip, asToken(changed)),
      ).toThrow("INVALID_EVENT_COLLECTION_CURSOR");
  });
  it("dispatches literal snapshot before Event UUID and uses no-store", async () => {
    const response = await handler()(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      disposition: "SNAPSHOT_PAGE",
      accountId: account,
      tripId: trip,
      complete: true,
    });
  });
  it.each([
    "?pageSize=10",
    "?offset=0",
    "?actor=any",
    "?cursor=",
    "?cursor=x&cursor=y",
    "?cursor=x&filter=all",
  ])("rejects query %s", async (query) => {
    expect((await handler()(request(query))).status).toBe(400);
  });
  it("authenticates/read-admits every page before observation; methods stay disabled", async () => {
    const observe = vi.fn(async () => observation());
    expect(
      (
        await handler({
          validateAccessToken: async () => null,
          observeCanonicalEventCollection: observe,
        })(request())
      ).status,
    ).toBe(401);
    expect(
      (
        await handler({
          canReadTrip: async () => false,
          observeCanonicalEventCollection: observe,
        })(request())
      ).status,
    ).toBe(404);
    expect(observe).not.toHaveBeenCalled();
    expect((await handler()(request("", "POST"))).status).toBe(503);
  });
  it("requires both version headers and distinguishes withholding/unavailable/invalid", async () => {
    expect(
      await (
        await handler()(
          request("", "GET", { "X-OTR-Canonical-Event-Collection-Version": "2" }),
        )
      ).json(),
    ).toMatchObject({ disposition: "WITHHELD", reason: "UNSUPPORTED_CLIENT" });
    expect(
      await (
        await handler({ observeCanonicalEventCollection: undefined })(request())
      ).json(),
    ).toMatchObject({ reason: "COLLECTION_CERTIFICATION_UNAVAILABLE" });
    expect(
      (
        await handler({
          observeCanonicalEventCollection: async () => {
            throw new EventCollectionError(503, "READ_UNAVAILABLE");
          },
        })(request())
      ).status,
    ).toBe(503);
    expect(
      (await handler({ observeCanonicalEventCollection: async () => ({}) })(request()))
        .status,
    ).toBe(500);
  });
  it("uses only actual dedicated session; service client cannot substitute for collection certification", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("unexpected network"));
    for (const role of [
      undefined,
      "service_role",
      "otr_trip_event_command_gateway",
      "otr_trip_event_collection_gateway",
    ]) {
      const observe = vi.fn(async () => observation());
      const gateway = createSupabaseDevGateway({
        url: "https://tuqigdxrvrerfewsxqgm.supabase.co",
        publishableKey: "test",
        secretKey: "test",
        canonicalCollectionConnection: role
          ? { sessionUser: async () => role, observe }
          : undefined,
      });
      const result = await gateway.observeCanonicalEventCollection!(account, trip);
      expect(result).toMatchObject({
        disposition:
          role === "otr_trip_event_collection_gateway" ? "OBSERVATION" : "WITHHELD",
      });
      expect(observe).toHaveBeenCalledTimes(
        role === "otr_trip_event_collection_gateway" ? 1 : 0,
      );
    }
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
});
