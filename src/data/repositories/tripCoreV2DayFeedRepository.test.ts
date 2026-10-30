import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { afterEach, expect, it, vi } from "vitest";
import {
  executeCoreCommandV2,
  type CoreCommandStorage,
} from "../../../backend/src/tripCoreV2Commands";
import {
  createDevBackendHandler,
  type DevBackendGateway,
} from "../../../backend/src/app";
import { buildCoreActorCollection } from "../../../backend/src/tripCoreV2Collection";
import { coreDefaults } from "../../domain/trip/tripCoreV2";
import { emptyCoreGraph, type CoreActor } from "../../domain/trip/tripCoreV2Mutation";
import {
  flightCommandLeaves,
  type FlightValues,
} from "../../domain/trip/flightAdmission";
import { createCoreV2Transport } from "../api/tripCoreV2Transport";
import { migrations } from "../db/migrations";
import { serializeDatabaseTransactions } from "../db/databaseConnection";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { createTripCoreV2Repository, type CoreDatabase } from "./tripCoreV2Repository";
import { createCoreFlightDayFeedReader } from "./tripCoreV2DayFeedRepository";
import { createCoreP1P3DayFeedReader } from "./tripCoreV2P1P3DayFeedRepository";
import { coreDateBoundary } from "../../domain/trip/tripCoreV2Temporal";
import { createTripDayFeedReader, readTripDayFeed } from "./tripDayFeedRepository";
import { readInitializedDatabase } from "../db/database";
import { requireActiveUserId, readAdoptedLocalSession } from "../auth/authRepository";
import {
  createTripDayFeedLabReader,
  readTripDayFeedLab,
} from "./tripDayFeedLabRepository";
import { composeDayStream, dayRowKey } from "../../features/day-feed/composition";
import { DayFeed } from "../../features/day-feed/DayFeed";
import intents from "./__fixtures__/tripImportIntents.json";

vi.mock("../auth/sessionAccessToken", () => ({ sessionAccessToken: vi.fn() }));
vi.mock("../auth/authRepository", () => ({
  requireActiveUserId: vi.fn(),
  readAdoptedLocalSession: vi.fn(),
}));
vi.mock("../db/database", () => ({ readInitializedDatabase: vi.fn() }));
vi.mock("../../components/AppIcon", () => ({ AppIcon: () => null }));
vi.mock("../../features/day-feed/useMinuteClock", () => ({
  useMinuteClock: () => ({ instant: "2026-01-01T00:00:00Z" }),
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: (p: any) => createElement("div", {}, p.children),
  SafeAreaProvider: (p: any) => createElement("div", {}, p.children),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("@react-native-community/datetimepicker", () => ({ default: () => null }));
vi.mock("react-native", async () => {
  const { createElement } = await import("react");
  const primitive = (p: Record<string, any>) =>
    createElement(
      "div",
      { "data-testid": p.testID, "aria-label": p.accessibilityLabel },
      p.children,
    );
  return {
    Platform: { OS: "ios", Version: "27.0" },
    View: primitive,
    Text: primitive,
    ScrollView: primitive,
    FlatList: (p: Record<string, any>) =>
      primitive({
        ...p,
        children: [
          p.ListHeaderComponent,
          ...p.data.map((item: any, index: number) =>
            createElement(
              "div",
              { key: p.keyExtractor(item) },
              p.renderItem({ item, index }),
            ),
          ),
        ],
      }),
    Pressable: primitive,
    Modal: (p: Record<string, any>) => (p.visible ? primitive(p) : null),
    StyleSheet: { create: (s: unknown) => s, hairlineWidth: 0.5 },
    useWindowDimensions: () => ({ width: 375, height: 812, fontScale: 1 }),
    useColorScheme: () => "light",
  };
});
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const account = randomUUID(),
  trip = randomUUID(),
  person = randomUUID(),
  otherPerson = randomUUID();
const first = randomUUID(),
  second = randomUUID();
const stamp = "2026-10-12T00:00:00Z";
const actor: CoreActor = {
  accountId: account,
  tripId: trip,
  active: true,
  canManageShared: false,
  personId: person,
  personIds: [person, otherPerson],
};
const dates = ["2026-12-17", "2026-12-24"];
const sparse = (id: string, date: string, literal = "NZ0289A") => ({
  contractVersion: 2,
  intentVersion: 2,
  operationId: randomUUID(),
  tripId: trip,
  command: "CREATE_SPARSE_FLIGHT",
  target: { kind: "ITEM", id },
  baseVector: [{ kind: "ITEM", id, revision: null }],
  admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
  payload: {
    flightNumberLiteral: literal,
    departureDate: date,
    ...coreDefaults("member"),
  },
});
async function acceptedServer(qualified = true) {
  let graph = emptyCoreGraph();
  const receipts = new Map<string, { domainReceiptId: string; receiptText: string }>();
  const storage: CoreCommandStorage = {
    async withLockedCommand(scope, work) {
      if (scope.actorAccountId !== account || scope.tripId !== trip)
        throw new Error("NOT_VISIBLE");
      return work({
        actor,
        readReceipt: async () => receipts.get(scope.operationId) ?? null,
        hasLegacyOperation: async () => false,
        canReadReceipt: async () => true,
        enabledCommands: async () => [
          "CREATE_SPARSE_FLIGHT",
          "CREATE_ITEM",
          "QUALIFY_FLIGHT",
          "SET_OBJECT_VISIBILITY",
          "SET_ITEM_PARTICIPATION",
        ],
        readLockedGraph: async () => graph,
        // Synthetic owning admission seam, not Capture or a Source publisher implementation.
        verifyAdmission: async () => {},
        lifecycleGraphHash: async () => undefined,
        async commit(mutation, receipt) {
          if (mutation) graph = mutation.graph;
          const stored = {
            domainReceiptId: randomUUID(),
            receiptText: JSON.stringify(receipt),
          };
          receipts.set(scope.operationId, stored);
          return stored.domainReceiptId;
        },
      });
    },
  };
  const execute = async (command: unknown) => {
    const result = await executeCoreCommandV2(
      storage,
      account,
      trip,
      command,
      hash,
      () => stamp,
    );
    expect(result.projection).toBe("FULL");
    if (result.projection === "FULL") expect(result.receipt.outcome).toBe("APPLIED");
    return result;
  };
  for (const [i, id] of [first, second].entries()) {
    const literal = i ? "NZ0290A" : "NZ0289A";
    await execute(sparse(id, dates[i], literal));
    if (qualified) {
      const v = structuredClone(
        intents.confirmation.slots[0].reviewed_payload.edits,
      ) as unknown as Required<FlightValues>;
      v.origin.time.local_date = dates[i];
      v.origin.time.source_instant = i
        ? "2026-12-23T20:00:00.123456Z"
        : "2026-12-16T20:00:00.123456Z";
      v.services[0].service_number = i ? "0290A" : "0289A";
      v.services[0].service_literal = literal;
      const { origin, destination, services } = v;
      const source = randomUUID();
      await execute({
        contractVersion: 2,
        intentVersion: 2,
        operationId: randomUUID(),
        tripId: trip,
        command: "QUALIFY_FLIGHT",
        target: { kind: "ITEM", id },
        baseVector: [{ kind: "ITEM", id, revision: 1 }],
        admission: {
          mode: "REVIEWED_SOURCE",
          sourceIntentId: source,
          policyVersion: null,
        },
        payload: {
          origin,
          destination,
          services,
          proofs: Object.fromEntries(
            Object.keys(flightCommandLeaves({ origin, destination, services })).map(
              (field) => [
                field,
                { kind: "TRACK_C", ref: `track-c/field-evidence/${source}/${field}` },
              ],
            ),
          ),
        },
      });
    }
  }
  const epoch = randomUUID();
  const bindings = [
    {
      person_id: person,
      account_id: account,
      active: true,
      participating: false,
      revision: 1,
    },
    {
      person_id: otherPerson,
      account_id: null,
      active: true,
      participating: true,
      revision: 1,
    },
  ];
  return {
    graph: () => graph,
    receipts,
    execute,
    bundle: (who = actor) =>
      buildCoreActorCollection(
        graph,
        who,
        { epoch, revision: 1, accessRevision: 1, generatedAt: stamp },
        bindings,
        hash,
      ),
  };
}
const connections: DatabaseSync[] = [],
  folders: string[] = [];
afterEach(() => {
  for (const db of connections.splice(0))
    try {
      db.close();
    } catch {}
  for (const p of folders.splice(0)) rmSync(p, { recursive: true, force: true });
});
function local(path = ":memory:", initialize = true) {
  const sql = new DatabaseSync(path);
  connections.push(sql);
  sql.exec("PRAGMA foreign_keys=ON");
  if (initialize) for (const migration of migrations) sql.exec(migration.sql);
  let active: string = account;
  const database: CoreDatabase = serializeDatabaseTransactions({
    async getFirstAsync<T>(query: string, ...args: unknown[]) {
      return (sql.prepare(query).get(...(args as never[])) ?? null) as T | null;
    },
    async getAllAsync<T>(query: string, ...args: unknown[]) {
      return sql.prepare(query).all(...(args as never[])) as T[];
    },
    async runAsync(query: string, ...args: unknown[]) {
      return sql.prepare(query).run(...(args as never[])) as never;
    },
    async withTransactionAsync(work: () => Promise<void>) {
      sql.exec("BEGIN");
      try {
        await work();
        sql.exec("COMMIT");
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  });
  const repo = createTripCoreV2Repository(database, async () => active, hash);
  const v1 = vi.fn(async () => null),
    supplemental = vi.fn(async () => ({}));
  const coreRead = createCoreFlightDayFeedReader(repo);
  const read = createTripDayFeedReader({
    account: async () => active,
    projection: v1,
    coreProjection: coreRead,
    candidates: async () => [],
    services: supplemental,
  });
  return {
    sql,
    database,
    repo,
    coreRead,
    read,
    v1,
    supplemental,
    account: () => active,
    switchTo(id: string) {
      active = id;
    },
  };
}
async function pull(
  f: ReturnType<typeof local>,
  server: Awaited<ReturnType<typeof acceptedServer>>,
  who: CoreActor = actor,
) {
  const handler = createDevBackendHandler({
    gateway: {
      validateAccessToken: async (token: string) =>
        token === "fixture" ? { id: f.account(), accountClass: "NORMAL_ACCOUNT" } : null,
      canReadTrip: async (a: string, t: string) => a === who.accountId && t === trip,
    } as unknown as DevBackendGateway,
    coreConnection: {
      hash,
      commands: {} as CoreCommandStorage,
      readOperation: async () => null,
      read: {
        collection: async (a, t) => {
          expect([a, t]).toEqual([who.accountId, trip]);
          return server.bundle(who);
        },
        item: async () => null,
      },
    },
  });
  const transport = createCoreV2Transport(
    async () => f.account(),
    hash,
    {
      baseUrl: "http://core-fixture.local",
      fetchImplementation: (input, init) => handler(new Request(input, init)),
    },
    async () => ({ token: "fixture", userId: f.account() }),
  );
  return f.repo.refresh(await f.repo.captureContext(trip), transport);
}
it("accepted Canonical commands → authenticated collection2 → SQLite54 → G2 Flight rendering; replay and cold offline reopen keep UUIDs", async () => {
  const server = await acceptedServer();
  const folder = mkdtempSync(join(tmpdir(), "otr-flight-day-"));
  folders.push(folder);
  const path = join(folder, "mirror.db");
  let f = local(path);
  await pull(f, server);
  await pull(f, server);
  expect(
    f.sql.prepare("SELECT count(*) AS n FROM trip_core_itinerary_events").get()?.n,
  ).toBe(2);
  expect(f.sql.prepare("SELECT count(*) AS n FROM trip_day_events").get()?.n).toBe(0);
  expect(server.receipts.size).toBe(4);
  f.sql.close();
  f = local(path, false);
  vi.mocked(readInitializedDatabase).mockResolvedValue(
    f.database as Awaited<ReturnType<typeof readInitializedDatabase>>,
  );
  vi.mocked(requireActiveUserId).mockResolvedValue(account);
  const observed = (await (await readTripDayFeed()).trip(trip)).observed!;
  expect(observed.projection.version).toBe(2);
  if (observed.projection.version !== 2) throw new Error("V2_REQUIRED");
  const p = observed.projection;
  expect(p.events.map((e) => e.id).sort()).toEqual([first, second].sort());
  expect(p.items.every((i) => i.localState === "ACCEPTED")).toBe(true);
  expect(p.items.map((i) => i.participation.selfPersonId)).toEqual([person, person]);
  expect(f.v1).not.toHaveBeenCalled();
  expect(f.supplemental).not.toHaveBeenCalled();
  for (const [i, id] of [first, second].entries()) {
    const query = p.query(dates[i], "UTC");
    expect(query.timed.map((r) => r.event.id)).toEqual([id]);
    expect(query.coreRows.map((r) => r.rowKey)).toEqual([
      { itemId: id, projectionRole: "ORIGIN", localDate: dates[i] },
    ]);
    expect(
      query.timed[0].event.boundaries.find((b) => b.role === "DESTINATION")?.local_date,
    ).toBeNull();
    expect(query.timed[0].event.boundaries[0].accepted_latitude).toBeNull();
    const html = renderToStaticMarkup(
      createElement(DayFeed, {
        projection: p,
        date: dates[i],
        zone: "UTC",
        services: {},
      }),
    );
    expect(html).toContain(i ? "NZ0290A" : "NZ0289A");
    expect(html.match(new RegExp(i ? ">NZ0290A<" : ">NZ0289A<", "g"))).toHaveLength(1);
    expect(html).not.toContain('data-testid="flight-row-3"');
    expect(html).not.toContain("00:00");
  }
  expect(p.query("2026-12-16", "UTC").timed).toEqual([]);
  expect(p.query("2026-12-17", "Pacific/Auckland").coreRows.map((r) => r.rowKey)).toEqual(
    p.query("2026-12-17", "UTC").coreRows.map((r) => r.rowKey),
  );
  const before = p.events.map((e) => e.id);
  await expect(
    f.repo.refresh(await f.repo.captureContext(trip), {
      collection: async () => {
        throw new Error("OFFLINE");
      },
    }),
  ).rejects.toThrow("OFFLINE");
  expect((await f.coreRead(trip))?.projection.events.map((e) => e.id)).toEqual(before);
});
it("sparse accepted Flights use real departure dates without fabricated routes, clocks, qualification or empty Flight rows", async () => {
  const f = local();
  await pull(f, await acceptedServer(false));
  const p = (await f.coreRead(trip))!.projection;
  expect(p.flightFacts[first].qualification).toBe("SPARSE");
  expect(p.events[0].temporal_shape).toBe("CALENDAR");
  expect(p.query(dates[0], "UTC").nonComparable[0].event.id).toBe(first);
  const html = renderToStaticMarkup(
    createElement(DayFeed, { projection: p, date: dates[0], zone: "UTC", services: {} }),
  );
  expect(html).toContain("NZ0289A");
  expect(html).not.toContain("flight-browse-geometry");
  expect(html).not.toContain("00:00");
});
it("accepted partition never promotes a pending local intent or raw Candidate; damaged collection does not replace accepted data", async () => {
  const f = local(),
    server = await acceptedServer();
  await pull(f, server);
  const ctx = await f.repo.captureContext(trip),
    pending = randomUUID();
  await f.repo.enqueue(ctx, sparse(pending, dates[0], "PENDING"));
  expect((await f.coreRead(trip))?.projection.events.map((e) => e.id)).not.toContain(
    pending,
  );
  const bundle = await server.bundle();
  const damaged = structuredClone(bundle.pages);
  const candidate = {
    schemaId: "otr.trip.capture.candidate/2",
    candidateId: randomUUID(),
    sourceId: randomUUID(),
    family: "P2",
    status: "REVIEW",
  };
  damaged[0].records[0].body = candidate;
  await expect(
    f.repo.install(await f.repo.beginRefresh(ctx, 1), bundle.manifest, damaged),
  ).rejects.toThrow();
  expect((await f.coreRead(trip))?.projection.events.map((e) => e.id).sort()).toEqual(
    [first, second].sort(),
  );
});
it("Account/Trip partitions, revoked access and ABA callbacks cannot fall through to v1 authority", async () => {
  const f = local();
  await pull(f, await acceptedServer());
  expect(await f.coreRead(randomUUID())).toBeNull();
  f.switchTo(randomUUID());
  expect(await f.coreRead(trip)).toBeNull();
  f.switchTo(account);
  const ctx = await f.repo.captureContext(trip);
  await f.repo.revoke(ctx, 2);
  await expect(f.read.trip(trip)).rejects.toThrow("CORE_ACCESS_REVOKED");
  expect(f.v1).not.toHaveBeenCalled();
  const g = local();
  await pull(g, await acceptedServer());
  const changing = createTripDayFeedReader({
    account: async () => account,
    projection: g.v1,
    coreProjection: async () => {
      const result = await g.coreRead(trip);
      advanceAccountGeneration();
      return result;
    },
    candidates: async () => [],
    services: g.supplemental,
  });
  await expect(changing.trip(trip)).rejects.toThrow("Account changed");
});
it("Person visibility stays distinct from participation; a linked nonparticipant can read while selected applicability remains exact", async () => {
  const f = local(),
    server = await acceptedServer();
  await server.execute({
    contractVersion: 2,
    intentVersion: 2,
    operationId: randomUUID(),
    tripId: trip,
    command: "SET_OBJECT_VISIBILITY",
    target: { kind: "ITEM", id: first },
    baseVector: [{ kind: "ITEM", id: first, revision: 2 }],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: { acl: { visibility: "GROUP", people: [] } },
  });
  await server.execute({
    contractVersion: 2,
    intentVersion: 2,
    operationId: randomUUID(),
    tripId: trip,
    command: "SET_ITEM_PARTICIPATION",
    target: { kind: "ITEM", id: first },
    baseVector: [{ kind: "ITEM", id: first, revision: 3 }],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: {
      participation: {
        mode: "SELECTED_MEMBERS",
        people: [otherPerson],
        selfPersonId: null,
      },
    },
  });
  await pull(f, server);
  const p = (await f.coreRead(trip))!.projection;
  expect(p.items.find((i) => i.itemId === first)?.participation).toMatchObject({
    mode: "SELECTED_MEMBERS",
    personIds: [otherPerson],
  });
  expect(p.query(dates[0], "UTC").timed[0].event.id).toBe(first);
  const foreign = { ...actor, accountId: randomUUID(), personId: null, personIds: [] };
  const visible = await server.bundle(foreign);
  expect(
    visible.pages.flatMap((page) =>
      page.records.filter((r) => r.kind === "ITEM").map((r) => r.id),
    ),
  ).toEqual([first]);
});

it("preserves independently accepted endpoint places, airport details, local zones and destination occurrence keys in a read2 fixture", async () => {
  const f = local(),
    server = await acceptedServer();
  const originPlace = randomUUID(),
    destinationPlace = randomUUID();
  const origin = server
    .graph()
    .itinerary_transport_endpoints.find(
      (r) => r.event_id === first && r.role === "ORIGIN",
    )!;
  const destination = server
    .graph()
    .itinerary_transport_endpoints.find(
      (r) => r.event_id === first && r.role === "DESTINATION",
    )!;
  // Synthetic accepted read facts; no geocoder, spatial mutation command or live authority is claimed.
  Object.assign(origin, {
    accepted_place_id: originPlace,
    accepted_latitude: -37.0082,
    accepted_longitude: 174.785,
    zone_id: "Pacific/Auckland",
    local_time: "09:00:00.123456",
    clock_precision: 6,
  });
  Object.assign(destination, {
    accepted_place_id: destinationPlace,
    accepted_latitude: 31.1443,
    accepted_longitude: 121.8083,
    local_date: "2026-12-18",
    local_time: "04:00:00.123456",
    clock_precision: 6,
    zone_id: "Asia/Shanghai",
    quality: "EXACT",
    basis: "SOURCE_INSTANT",
    source_instant: "2026-12-17T20:00:00.123456Z",
    source_instant_precision: 6,
    instant: "2026-12-17T20:00:00.123456Z",
    civil_resolution: null,
  });
  server.graph().trip_endpoint_details.push(
    {
      event_id: first,
      trip_id: trip,
      role: "ORIGIN",
      airport_code: "AKL",
      terminal: "I",
      platform: null,
      pier: null,
    },
    {
      event_id: first,
      trip_id: trip,
      role: "DESTINATION",
      airport_code: "PVG",
      terminal: null,
      platform: null,
      pier: null,
    },
  );
  await pull(f, server);
  const p = (await f.coreRead(trip))!.projection;
  const event = p.events.find((r) => r.id === first)!;
  expect(event.accepted_place_id).toBeNull();
  expect(event.boundaries.find((r) => r.role === "ORIGIN")).toMatchObject({
    accepted_place_id: originPlace,
    accepted_latitude: -37.0082,
    zone_id: "Pacific/Auckland",
  });
  expect(event.boundaries.find((r) => r.role === "DESTINATION")).toMatchObject({
    accepted_place_id: destinationPlace,
    accepted_longitude: 121.8083,
    zone_id: "Asia/Shanghai",
  });
  expect(p.flightFacts[first].endpoints).toMatchObject({
    ORIGIN: { code: "AKL", terminal: "I" },
    DESTINATION: { code: "PVG", terminal: null },
  });
  expect(p.query("2026-12-18", "UTC").coreRows.map((r) => r.rowKey)).toEqual([
    { itemId: first, projectionRole: "DESTINATION", localDate: "2026-12-18" },
  ]);
  const html = renderToStaticMarkup(
    createElement(DayFeed, { projection: p, date: dates[0], zone: "UTC", services: {} }),
  );
  expect(html).toContain("AKL");
  expect(html).toContain("PVG");
  expect(html).toContain("09:00");
});

it("an access-generation change blocks the old certificate rather than borrowing v1; wrong Trip collection cannot install", async () => {
  const f = local(),
    server = await acceptedServer();
  await pull(f, server);
  const wrong = await f.repo.captureContext(randomUUID());
  const bundle = await server.bundle();
  await expect(
    f.repo.install(await f.repo.beginRefresh(wrong, 1), bundle.manifest, bundle.pages),
  ).rejects.toThrow();
  expect(await f.coreRead(wrong.tripId)).toBeNull();
  await f.repo.beginRefresh(await f.repo.captureContext(trip), 2);
  await expect(f.read.trip(trip)).rejects.toThrow("CORE_READ_ACCESS_MISMATCH");
  expect(f.v1).not.toHaveBeenCalled();
});

it("DL2 lists only accepted actor-scoped local Trips, including an empty complete Trip", async () => {
  const f = local(),
    server = await acceptedServer();
  await pull(f, server);
  const emptyTrip = randomUUID();
  const bundle = await buildCoreActorCollection(
    emptyCoreGraph(),
    { ...actor, tripId: emptyTrip, personId: null, personIds: [] },
    { epoch: randomUUID(), revision: 1, accessRevision: 1, generatedAt: stamp },
    [],
    hash,
  );
  const ctx = await f.repo.captureContext(emptyTrip);
  await f.repo.install(await f.repo.beginRefresh(ctx, 1), bundle.manifest, bundle.pages);
  const reader = createTripDayFeedLabReader(f.repo, async () => f.account());
  const candidates = await reader.candidates();
  expect(candidates.tripIds.sort()).toEqual([trip, emptyTrip].sort());
  const populated = await reader.trip(trip, candidates.scope);
  expect(populated.projection.events.map((e) => e.id).sort()).toEqual(
    [first, second].sort(),
  );
  expect(populated.unsupportedFamilies).toEqual([]);
  const empty = await reader.trip(emptyTrip, candidates.scope);
  expect(empty.projection.events).toEqual([]);
  expect(empty.projection.query(dates[0], "UTC").coreRows).toEqual([]);
  expect(empty.dates).toEqual([]);
  await expect(reader.trip(randomUUID(), candidates.scope)).rejects.toThrow(
    "CORE_LAB_NO_ACCEPTED_READ",
  );
});
it("DL2 rejects wrong certificate versions/completeness, stale access and revocation without fallback", async () => {
  const f = local();
  await pull(f, await acceptedServer());
  const reader = createTripDayFeedLabReader(f.repo, async () => f.account());
  const { scope } = await reader.candidates();
  f.sql.exec("PRAGMA ignore_check_constraints=ON");
  for (const [field, bad, good] of [
    ["read_version", 3, 2],
    ["business_version", 1, 2],
    ["temporal_version", 2, 1],
    ["complete", 0, 1],
  ] as const) {
    f.sql.prepare(`UPDATE trip_core_read_certificates SET ${field}=?`).run(bad);
    expect((await reader.candidates()).tripIds).toEqual([]);
    await expect(reader.trip(trip, scope)).rejects.toThrow("CORE_READ_VERSION_MISMATCH");
    f.sql.prepare(`UPDATE trip_core_read_certificates SET ${field}=?`).run(good);
  }
  await f.repo.beginRefresh(await f.repo.captureContext(trip), 2);
  expect((await reader.candidates()).tripIds).toEqual([]);
  await expect(reader.trip(trip, scope)).rejects.toThrow("CORE_READ_ACCESS_MISMATCH");
  await f.repo.revoke(await f.repo.captureContext(trip), 2);
  expect((await reader.candidates()).tripIds).toEqual([]);
  await expect(reader.trip(trip, scope)).rejects.toThrow("CORE_ACCESS_REVOKED");
  expect(f.v1).not.toHaveBeenCalled();
});
it("DL2 private/SELF records stay actor-scoped; A→B→A never revives an old read context", async () => {
  const f = local(),
    server = await acceptedServer();
  await pull(f, server);
  const reader = createTripDayFeedLabReader(f.repo, async () => f.account());
  const old = await reader.candidates();
  const b = randomUUID();
  f.switchTo(b);
  advanceAccountGeneration();
  expect((await reader.candidates()).tripIds).toEqual([]);
  await expect(reader.trip(trip, old.scope)).rejects.toThrow("Account changed");
  const privateBundle = await server.bundle({
    ...actor,
    accountId: b,
    personId: null,
    personIds: [],
  });
  const ctx = await f.repo.captureContext(trip);
  await f.repo.install(
    await f.repo.beginRefresh(ctx, 1),
    privateBundle.manifest,
    privateBundle.pages,
  );
  const bScope = (await reader.candidates()).scope;
  expect((await reader.trip(trip, bScope)).projection.events).toEqual([]);
  f.switchTo(account);
  advanceAccountGeneration();
  await expect(reader.trip(trip, old.scope)).rejects.toThrow("Account changed");
  const fresh = await reader.candidates();
  expect(
    (await reader.trip(trip, fresh.scope)).projection.events.map((e) => e.id).sort(),
  ).toEqual([first, second].sort());
});
it("DL2 withholds a late accepted read after an Account generation changes", async () => {
  const f = local();
  await pull(f, await acceptedServer());
  const reader = createTripDayFeedLabReader(
    {
      ...f.repo,
      acceptedSnapshot: async (ctx) => {
        const snapshot = await f.repo.acceptedSnapshot(ctx);
        advanceAccountGeneration();
        return snapshot;
      },
    },
    async () => f.account(),
  );
  const scope = (await reader.candidates()).scope;
  await expect(reader.trip(trip, scope)).rejects.toThrow("Account changed");
});
it("DL2 G2 display preserves the owning origin/destination DayRow identities without a second composer", async () => {
  const f = local(),
    server = await acceptedServer();
  const destination = server
    .graph()
    .itinerary_transport_endpoints.find(
      (r) => r.event_id === first && r.role === "DESTINATION",
    )!;
  Object.assign(destination, {
    local_date: dates[0],
    local_time: "14:00:00",
    clock_precision: 0,
    zone_id: "Pacific/Auckland",
    quality: "EXACT",
    basis: "SOURCE_INSTANT",
    source_instant: "2026-12-17T01:00:00Z",
    source_instant_precision: 0,
    instant: "2026-12-17T01:00:00Z",
    civil_resolution: null,
  });
  await pull(f, server);
  const reader = createTripDayFeedLabReader(f.repo, async () => f.account());
  const result = await reader.trip(trip, (await reader.candidates()).scope);
  const query = result.projection.query(dates[0], "UTC");
  const stream = composeDayStream(query, "2026-12-17T00:00:00Z", { focus: first });
  expect(stream.rows).toHaveLength(1); // Production compact Flight groups its two endpoints.
  expect(stream.rows[0].coreRowKeys).toEqual(query.coreRows.map((row) => row.rowKey));
  expect(stream.rows[0].coreRowKeys.map((row) => row.projectionRole)).toEqual([
    "ORIGIN",
    "DESTINATION",
  ]);
  expect(stream.rows[0].key).toBe(
    JSON.stringify(
      query.coreRows.map((row) => [
        row.rowKey.itemId,
        row.rowKey.projectionRole,
        row.rowKey.localDate,
      ]),
    ),
  );
  const single = result.projection.query(dates[1], "UTC");
  expect(composeDayStream(single, stamp).rows[0].key).toBe(
    dayRowKey(second, "ORIGIN", dates[1]),
  );
});
it("DL2 native facade requires an adopted session but permits an expired offline access token without refresh", async () => {
  vi.mocked(readAdoptedLocalSession).mockResolvedValue(null);
  await expect(readTripDayFeedLab()).rejects.toThrow("CORE_LAB_AUTH_REQUIRED");
  const f = local();
  await pull(f, await acceptedServer(false));
  vi.mocked(readInitializedDatabase).mockResolvedValue(
    f.database as Awaited<ReturnType<typeof readInitializedDatabase>>,
  );
  vi.mocked(readAdoptedLocalSession).mockResolvedValue({
    accessToken: "synthetic-test-token",
    refreshToken: "synthetic-test-refresh",
    expiresAt: "2000-01-01T00:00:00Z",
    identity: { userId: account, displayName: "Synthetic", email: null },
  });
  const reader = await readTripDayFeedLab();
  const scope = (await reader.candidates()).scope;
  const result = await reader.trip(trip, scope);
  expect(result.projection.query(dates[0], "UTC").nonComparable[0].event.id).toBe(first);
  expect(result.projection.events[0].boundaries[0].local_time).toBeNull();
});

it("DL2 explicitly reports unsupported visible Core families instead of fabricating a renderer", async () => {
  const f = local(),
    server = await acceptedServer(false);
  const row = server.graph().itinerary_events.find((r) => r.id === first)!;
  row.experience_family = "P1";
  row.event_type = "activity";
  server.graph().trip_flight_intents = server
    .graph()
    .trip_flight_intents.filter((r) => r.event_id !== first);
  await pull(f, server);
  const reader = createTripDayFeedLabReader(f.repo, async () => f.account());
  const result = await reader.trip(trip, (await reader.candidates()).scope);
  expect(result.unsupportedFamilies).toEqual(["P1"]);
  expect(result.projection.events.map((e) => e.id)).toEqual([second]);
});

async function acceptedGeneric(
  server: Awaited<ReturnType<typeof acceptedServer>>,
  family: "P1" | "P3",
  start: string,
  end?: string,
  title: string = family,
) {
  const id = randomUUID();
  await server.execute({
    contractVersion: 2,
    intentVersion: 2,
    operationId: randomUUID(),
    tripId: trip,
    command: "CREATE_ITEM",
    target: { kind: "ITEM", id },
    baseVector: [{ kind: "ITEM", id, revision: null }],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: {
      family,
      core: { title },
      schedule: {
        start: coreDateBoundary(start),
        ...(end ? { end: coreDateBoundary(end) } : {}),
      },
      ...coreDefaults("member"),
    },
  });
  return id;
}

it("P1/P3 accepted read2 bridge preserves Core occurrences and P2 facts through file restart without a v1 projection", async () => {
  const server = await acceptedServer();
  const stay = await acceptedGeneric(server, "P3", "2026-12-16", "2026-12-20");
  const activity = await acceptedGeneric(server, "P1", "2026-12-18");
  const folder = mkdtempSync(join(tmpdir(), "otr-p1p3-day-"));
  folders.push(folder);
  const path = join(folder, "mirror.db");
  let f = local(path);
  await pull(f, server);
  const before = (await createCoreP1P3DayFeedReader(f.repo)(trip))!.projection;
  const flight = (await f.coreRead(trip))!.projection;
  expect(before.flightFacts).toEqual(flight.flightFacts);
  expect(before.events.filter((e) => e.id === first || e.id === second)).toEqual(
    flight.events,
  );
  expect(before.query(dates[0], "UTC").timed.filter((r) => r.event.id === first)).toEqual(
    flight.query(dates[0], "UTC").timed,
  );
  expect(before.items.every((i) => i.localState === "ACCEPTED")).toBe(true);
  expect(before.items.find((i) => i.itemId === stay)?.details.nights).toBe(4);
  expect(before.query("2026-12-16", "UTC").coreRows.map((r) => r.rowKey)).toEqual([
    { itemId: stay, projectionRole: "CHECKIN", localDate: "2026-12-16" },
  ]);
  const middle = before.query("2026-12-18", "UTC");
  expect(middle.coreRows.filter((r) => r.family === "P3").map((r) => r.rowKey)).toEqual([
    { itemId: stay, projectionRole: "BASE_FROM", localDate: "2026-12-18" },
    { itemId: stay, projectionRole: "BASE_RETURN", localDate: "2026-12-18" },
  ]);
  const base = middle.nonComparable.find((r) => r.event.id === stay)!;
  expect(base).toMatchObject({
    anchor: null,
    roles: [],
    occupancy: true,
    occupancyBasis: "CALENDAR_NIGHTS",
  });
  const composed = composeDayStream(middle, "2026-12-18T12:00:00Z");
  expect(composed.rows).toHaveLength(2);
  expect(composed.rows.find((r) => r.item.event.id === stay)).toMatchObject({
    position: "BASE",
    coreRowKeys: middle.coreRows.filter((r) => r.family === "P3").map((r) => r.rowKey),
  });
  expect(middle.nonComparable.find((r) => r.event.id === activity)).toMatchObject({
    anchor: null,
    roles: ["START"],
    occupancy: false,
  });
  expect(
    before.query("2026-12-19", "UTC").coreRows.map((r) => r.rowKey.projectionRole),
  ).toEqual(["TONIGHT"]);
  expect(
    before.query("2026-12-20", "UTC").coreRows.map((r) => r.rowKey.projectionRole),
  ).toEqual(["CHECKOUT"]);
  expect(before.query("2026-12-21", "UTC").nonComparable).toEqual([]);
  expect(before.events.find((e) => e.id === activity)?.boundaries[0]).toMatchObject({
    local_time: null,
    instant: null,
    zone_id: null,
  });
  expect(f.sql.prepare("SELECT count(*) AS n FROM trip_day_events").get()?.n).toBe(0);
  expect(
    f.sql.prepare("SELECT count(*) AS n FROM trip_core_itinerary_events").get()?.n,
  ).toBe(4);
  f.sql.close();
  f = local(path, false);
  const after = (await createCoreP1P3DayFeedReader(f.repo)(trip))!.projection;
  expect(after.source).toEqual(before.source);
  expect(after.generation).toBe(before.generation);
  expect(after.events).toEqual(before.events);
  expect(after.query("2026-12-18", "UTC")).toEqual(middle);
  await expect(
    f.repo.refresh(await f.repo.captureContext(trip), {
      collection: async () => {
        throw new Error("OFFLINE");
      },
    }),
  ).rejects.toThrow("OFFLINE");
  expect(
    (await createCoreP1P3DayFeedReader(f.repo)(trip))!.projection.query(
      "2026-12-18",
      "UTC",
    ),
  ).toEqual(middle);
});

it("P3 zero-night and private overlapping stays use only owning Day/ACL semantics in the accepted consumer", async () => {
  const server = await acceptedServer(false);
  const zero = await acceptedGeneric(
    server,
    "P3",
    "2026-12-21",
    "2026-12-21",
    "Private zero-night",
  );
  const privateStay = await acceptedGeneric(
    server,
    "P3",
    "2026-12-16",
    "2026-12-20",
    "Private lodging",
  );
  const groupStay = await acceptedGeneric(
    server,
    "P3",
    "2026-12-16",
    "2026-12-20",
    "Shared lodging",
  );
  await server.execute({
    contractVersion: 2,
    intentVersion: 2,
    operationId: randomUUID(),
    tripId: trip,
    command: "SET_OBJECT_VISIBILITY",
    target: { kind: "ITEM", id: groupStay },
    baseVector: [{ kind: "ITEM", id: groupStay, revision: 1 }],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: { acl: { visibility: "GROUP", people: [] } },
  });
  await server.execute({
    contractVersion: 2,
    intentVersion: 2,
    operationId: randomUUID(),
    tripId: trip,
    command: "SET_ITEM_PARTICIPATION",
    target: { kind: "ITEM", id: groupStay },
    baseVector: [{ kind: "ITEM", id: groupStay, revision: 2 }],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: { participation: { mode: "WHOLE_GROUP", people: [], selfPersonId: null } },
  });
  const owner = local();
  await pull(owner, server);
  const own = (await createCoreP1P3DayFeedReader(owner.repo)(trip))!.projection;
  expect(
    own
      .query("2026-12-21", "UTC")
      .coreRows.map((r) => r.rowKey.projectionRole)
      .sort(),
  ).toEqual(["CHECKIN", "CHECKOUT"]);
  expect(own.query("2026-12-21", "UTC").nonComparable[0]).toMatchObject({
    event: { id: zero },
    occupancy: false,
    anchor: null,
  });
  expect(own.query("2026-12-19", "UTC").coreRows).toEqual([]);
  const foreign: CoreActor = {
    ...actor,
    accountId: randomUUID(),
    personId: null,
    personIds: [],
  };
  const other = local();
  other.switchTo(foreign.accountId);
  await pull(other, server, foreign);
  const view = (await createCoreP1P3DayFeedReader(other.repo)(trip))!.projection;
  expect(view.items.map((i) => i.itemId)).toEqual([groupStay]);
  expect(view.events.map((e) => e.id)).toEqual([groupStay]);
  const tonight = view.query("2026-12-19", "UTC");
  expect(tonight.coreRows.map((r) => r.rowKey)).toEqual([
    { itemId: groupStay, projectionRole: "TONIGHT", localDate: "2026-12-19" },
  ]);
  expect(tonight.nonComparable[0]).toMatchObject({ occupancy: true, anchor: null });
  const exposed = JSON.stringify({ items: view.items, events: view.events, tonight });
  for (const secret of [zero, privateStay, "Private zero-night", "Private lodging"])
    expect(exposed).not.toContain(secret);
});

it("P1/P3 consumer rejects Account ABA at the existing read facade and never borrows legacy admission", async () => {
  const f = local(),
    server = await acceptedServer(false);
  await acceptedGeneric(server, "P1", "2026-12-18");
  await pull(f, server);
  const coreRead = createCoreP1P3DayFeedReader(f.repo);
  const reader = createTripDayFeedReader({
    account: async () => f.account(),
    projection: f.v1,
    coreProjection: async () => {
      const accepted = await coreRead(trip);
      advanceAccountGeneration();
      return accepted;
    },
    candidates: async () => [],
    services: f.supplemental,
  });
  await expect(reader.trip(trip)).rejects.toThrow("Account changed");
  expect(f.v1).not.toHaveBeenCalled();
  expect(f.supplemental).not.toHaveBeenCalled();
});
