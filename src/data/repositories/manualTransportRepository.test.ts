import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { corePlaceSchema } from "@/domain/trip/tripCoreV2";
import { coreDateBoundary } from "@/domain/trip/tripCoreV2Temporal";
import { migrations } from "../db/migrations";
import { serializeDatabaseTransactions } from "../db/databaseConnection";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { createTripCoreV2Repository, type CoreDatabase } from "./tripCoreV2Repository";
import { createTripRepository } from "./tripRepository";
import { createTripLocalManualReader } from "./tripLocalManualReadRepository";
import { createTripDayFeedReader } from "./tripDayFeedRepository";
import {
  createManualTransportRepository,
  type ManualTransportFields,
} from "./manualTransportRepository";
vi.mock("../auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("../db/database", () => ({ readInitializedDatabase: vi.fn() }));
vi.mock("../files/tripPhotoFileStore", () => ({
  retainTripPhoto: vi.fn(),
  resolveRetainedTripPhoto: vi.fn(),
  probeRetainedTripPhotoIdentity: vi.fn(),
  discardRetainedTripPhoto: vi.fn(),
}));
const opened: DatabaseSync[] = [];
afterEach(() => opened.splice(0).forEach((s) => s.close()));
async function fixture() {
  const sql = new DatabaseSync(":memory:");
  opened.push(sql);
  sql.exec("PRAGMA foreign_keys=ON");
  for (const m of migrations) sql.exec(m.sql);
  let accountId = randomUUID(),
    failAt = 0,
    inserts = 0,
    aba = false;
  const originalAccount = accountId;
  const database: CoreDatabase = serializeDatabaseTransactions({
    async getFirstAsync<T>(q: string, ...args: unknown[]) {
      const result = sql.prepare(q).get(...(args as never[])) ?? null;
      if (aba && q.includes("FROM local_trip_containers")) {
        aba = false;
        advanceAccountGeneration();
        advanceAccountGeneration();
      }
      return result as T | null;
    },
    async getAllAsync<T>(q: string, ...args: unknown[]) {
      return sql.prepare(q).all(...(args as never[])) as T[];
    },
    async runAsync(q: string, ...args: unknown[]) {
      if (q.startsWith("INSERT INTO trip_core_pending_intents") && ++inserts === failAt)
        throw new Error("TEST_WRITE_FAILURE");
      return sql.prepare(q).run(...(args as never[])) as never;
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
  const identity = async () => accountId;
  const clock = () => "2026-10-20T00:00:00.000Z";
  const core = createTripCoreV2Repository(
    database,
    identity,
    async (b) => createHash("sha256").update(b).digest("hex"),
    clock,
  );
  const trips = createTripRepository(database, identity, core, clock);
  const tripId = randomUUID();
  await trips.createTrip({
    tripId,
    operationId: randomUUID(),
    name: "Winter trip",
    destination: null,
    startDate: "2026-12-30",
    endDate: "2027-04-28",
  });
  const repo = () => createManualTransportRepository(database, identity, core, clock);
  const read = createTripLocalManualReader(database, identity, core);
  const days = createTripDayFeedReader({
    account: identity,
    localManual: read,
    projection: async () => null,
    candidates: async () => [],
    services: async () => ({}),
  });
  return {
    sql,
    coreDatabase: database,
    identity,
    core,
    trips,
    tripId,
    repo,
    read,
    days,
    originalAccount,
    failNext(n: number) {
      inserts = 0;
      failAt = n;
    },
    switchAccount() {
      accountId = randomUUID();
      advanceAccountGeneration();
    },
    aba() {
      aba = true;
    },
  };
}
const inputFor = (fields: ManualTransportFields): ManualTransportFields => ({
  ...fields,
  title: "Nelson regional train",
  transportType: "TRAIN",
  departureDate: "2026-10-20",
  departureLocation: "Nelson station",
  departureTime: null,
  arrivalDate: null,
  arrivalTime: null,
  arrivalLocation: null,
  description: "Bring bags",
});
const count = (sql: DatabaseSync) =>
  sql.prepare("SELECT COUNT(*) n FROM trip_core_pending_intents").get()!.n;
it("creates true departure-only NTC Segment, cold reads Notes, and never fills arrival or unknown operator", async () => {
  const f = await fixture(),
    repo = f.repo(),
    d = await repo.createDraft(f.tripId),
    input = inputFor(d.fields);
  const result = await repo.save(d, input);
  expect(result.operationIds).toHaveLength(1);
  expect(result.localStatus).toBe("PENDING");
  expect((await f.repo().read(f.tripId, d.itemId)).fields).toEqual(input);
  const local = (await f.read(f.tripId))!,
    item = local.items[0];
  expect(item).toMatchObject({
    itemId: d.itemId,
    family: "P5",
    title: input.title,
    description: input.description,
    localState: "PENDING",
  });
  expect(item.schedule).toMatchObject({
    shape: "TRANSPORT",
    origin: { time: { localDate: input.departureDate } },
    destination: { time: { comparable: false } },
  });
  const schedule = item.schedule as { destination: { time: Record<string, unknown> } };
  expect(schedule.destination.time).not.toHaveProperty("localDate");
  expect(schedule.destination.time).not.toHaveProperty("localTime");
  expect(
    local.rows(input.departureDate).map((r) => [r.itemRef, r.rowKey.projectionRole]),
  ).toEqual([[d.itemId, "ORIGIN"]]);
  expect(local.rows("2026-10-21")).toEqual([]);
  expect(item.bookingSummaries).toEqual([]);
  expect(item.entitlementSummaries).toEqual([]);
  const command = JSON.parse(
    String(
      f.sql.prepare("SELECT canonical_intent_text FROM trip_core_pending_intents").get()!
        .canonical_intent_text,
    ),
  );
  expect(command.payload.endpoints.destination.time).toMatchObject({
    local_date: null,
    local_time: null,
    instant: null,
    zone_id: null,
  });
  expect(command.payload.service).toMatchObject({
    operator_issuer: "",
    operator_value: "",
    operator_literal: "",
    service_number: "",
    service_literal: "",
  });
  expect((await f.days.trip(f.tripId)).localManual?.items[0].itemId).toBe(d.itemId);
  expect(
    f.sql.prepare("SELECT COUNT(*) n FROM trip_core_read_certificates").get()!.n,
  ).toBe(0);
});
it("performs ordered same-ID text/endpoints/participation transaction and exact retry with retained service identity", async () => {
  const f = await fixture(),
    repo = f.repo(),
    d = await repo.createDraft(f.tripId);
  await repo.save(d, inputFor(d.fields));
  const edit = await repo.read(f.tripId, d.itemId),
    self = edit.participantOptions[0].personId;
  const fields: ManualTransportFields = {
    ...edit.fields,
    title: "Ferry connection",
    transportType: "FERRY",
    departureTime: "11:30",
    arrivalDate: "2026-10-21",
    arrivalTime: "09:00",
    arrivalLocation: "Ferry terminal",
    participation: { mode: "SELECTED_MEMBERS", people: [self], selfPersonId: null },
  };
  const before = (await f.read(f.tripId))!.items[0].details.service;
  const saved = await repo.save(edit, fields);
  expect(saved.operationIds).toHaveLength(3);
  expect(await repo.save(edit, fields)).toEqual(saved);
  expect(count(f.sql)).toBe(4);
  expect((await f.repo().read(f.tripId, d.itemId)).fields).toEqual(fields);
  expect((await f.read(f.tripId))!.items[0].details.service).toMatchObject({
    ...(before as Record<string, unknown>),
    transportSubtype: "FERRY",
  });
  expect(
    f.sql
      .prepare(
        "SELECT canonical_intent_text FROM trip_core_pending_intents ORDER BY created_at,operation_id",
      )
      .all()
      .map((r) => JSON.parse(String(r.canonical_intent_text)).command),
  ).toEqual([
    "CREATE_ITEM",
    "SET_ITEM_TEXT",
    "SET_TRANSPORT_DETAILS",
    "SET_ITEM_PARTICIPATION",
  ]);
  expect((await f.read(f.tripId))!.rows("2026-10-21")[0]).toMatchObject({
    itemRef: d.itemId,
    rowKey: { projectionRole: "DESTINATION" },
  });
  await expect(repo.save(edit, { ...fields, title: "Different retry" })).rejects.toThrow(
    "DRAFT_FROZEN",
  );
});
it("late third write failure rolls back intents/queue/field changes, then retries exact frozen IDs", async () => {
  const f = await fixture(),
    repo = f.repo(),
    d = await repo.createDraft(f.tripId);
  await repo.save(d, inputFor(d.fields));
  const edit = await repo.read(f.tripId, d.itemId),
    before = f.sql.prepare("SELECT * FROM sync_operations ORDER BY id").all();
  const fields: ManualTransportFields = {
    ...edit.fields,
    title: "New title",
    departureLocation: "New station",
    participation: {
      mode: "SELECTED_MEMBERS",
      people: [edit.participantOptions[0].personId],
      selfPersonId: null,
    },
  };
  f.failNext(3);
  await expect(repo.save(edit, fields)).rejects.toThrow("TEST_WRITE_FAILURE");
  expect(count(f.sql)).toBe(1);
  expect(f.sql.prepare("SELECT * FROM sync_operations ORDER BY id").all()).toEqual(
    before,
  );
  expect((await f.repo().read(f.tripId, d.itemId)).fields).toEqual(edit.fields);
  f.failNext(0);
  const saved = await repo.save(edit, fields);
  expect(saved.operationIds).toHaveLength(3);
  expect(await repo.save(edit, fields)).toEqual(saved);
  expect(count(f.sql)).toBe(4);
});
it("validates required departure fields and existing six types while retaining independent partial arrival/NTC", async () => {
  const f = await fixture(),
    repo = f.repo(),
    d = await repo.createDraft(f.tripId),
    input = inputFor(d.fields);
  for (const invalid of [
    { title: "" },
    { departureDate: "" },
    { departureDate: "2026-02-30" },
    { departureLocation: " " },
    { departureTime: "25:00" },
    { arrivalDate: "2026-02-30" },
    { transportType: "CUSTOM" },
  ])
    await expect(
      repo.save(d, { ...input, ...invalid } as ManualTransportFields),
    ).rejects.toThrow();
  expect(count(f.sql)).toBe(0);
  await repo.save(d, {
    ...input,
    arrivalDate: null,
    arrivalTime: "09:00",
    arrivalLocation: "Unscheduled destination",
  });
  const cold = await f.repo().read(f.tripId, d.itemId);
  expect(cold.fields).toMatchObject({ arrivalDate: null, arrivalTime: "09:00" });
  expect(
    (await f.read(f.tripId))!
      .rows(input.departureDate)
      .map((r) => r.rowKey.projectionRole),
  ).toEqual(["ORIGIN"]);
});
it("same named/time segments have distinct Item/service keys and no inferred Ticket or Booking", async () => {
  const f = await fixture(),
    repo = f.repo(),
    a = await repo.createDraft(f.tripId);
  await repo.save(a, inputFor(a.fields));
  const b = await repo.createDraft(f.tripId);
  await repo.save(b, inputFor(b.fields));
  const local = (await f.read(f.tripId))!;
  expect(new Set(local.items.map((i) => i.itemId)).size).toBe(2);
  const keys = local.items.map(
    (i) => (i.details.service as Record<string, unknown>).serviceKey,
  );
  expect(new Set(keys).size).toBe(2);
  expect(keys.every((key) => typeof key === "string" && /^[0-9a-f]{32}$/.test(key))).toBe(
    true,
  );
  expect(
    local.items.every(
      (i) =>
        i.bookingSummaries.length === 0 &&
        i.entitlementSummaries.length === 0 &&
        i.documentSummaries.length === 0,
    ),
  ).toBe(true);
});
it("preserves service fields, endpoint seconds/full spatial data and annotations/operational facts across edits", async () => {
  const f = await fixture(),
    repo = f.repo(),
    d = await repo.createDraft(f.tripId),
    input = {
      ...inputFor(d.fields),
      departureTime: "09:00",
      arrivalDate: "2026-10-21",
      arrivalTime: "10:00",
      arrivalLocation: "City terminal",
    };
  await repo.save(d, input);
  const ctx = await f.core.captureContext(f.tripId),
    create = JSON.parse(
      String(
        f.sql
          .prepare("SELECT canonical_intent_text FROM trip_core_pending_intents")
          .get()!.canonical_intent_text,
      ),
    );
  const time = (date: string, clock: string) => ({
    ...coreDateBoundary(date),
    local_time: clock,
    clock_precision: 0,
    quality: "ESTIMATED",
  });
  const place = corePlaceSchema.parse(
    Object.fromEntries(Object.keys(corePlaceSchema.shape).map((k) => [k, null])),
  );
  const pickup = {
    ...place,
    authored_label: input.departureLocation,
    authored_address: "Retained address",
    accepted_address: "Original station",
    accepted_latitude: -41.27,
    accepted_longitude: 173.28,
    location_input_revision: 1,
    spatial_provenance_refs: { retained: "fixture-evidence-reference" },
  };
  const destination = {
    ...place,
    authored_label: input.arrivalLocation,
    authored_text: "Arrival counter",
  };
  const service = {
    ...create.payload.service,
    operator_issuer: "Retained issuer",
    operator_value: "Rail operator",
    operator_literal: "Original operator",
    service_number: "12",
    service_literal: "Original 12",
  };
  await f.core.enqueue(ctx, {
    ...create,
    operationId: randomUUID(),
    command: "SET_TRANSPORT_DETAILS",
    baseVector: [{ kind: "ITEM", id: d.itemId, revision: 1 }],
    payload: {
      endpoints: {
        origin: { time: time(input.departureDate, "09:00:37"), place: pickup },
        destination: { time: time(input.arrivalDate, "10:00:42"), place: destination },
      },
      service,
      annotations: {
        origin: {
          airport_code: null,
          terminal: "Original terminal",
          platform: "3",
          pier: null,
        },
      },
      operationalFacts: [
        { role: "BOARDING_CUTOFF", time: coreDateBoundary(input.departureDate), place },
      ],
    },
  });
  const actor = {
    accountId: f.originalAccount,
    tripId: f.tripId,
    active: true,
    canManageShared: true,
    personId: d.participantOptions[0].personId,
    personIds: [d.participantOptions[0].personId],
  };
  const original = await f.core.manualReadSnapshot(ctx, actor);
  const edit = await repo.read(f.tripId, d.itemId);
  await repo.save(edit, {
    ...edit.fields,
    title: "Personal title",
    departureDate: "2026-10-22",
  });
  const changed = await f.core.manualReadSnapshot(ctx, actor);
  expect(
    changed.graph.itinerary_transport_endpoints.find((r) => r.role === "ORIGIN"),
  ).toMatchObject({
    ...pickup,
    local_time: "09:00:37",
    clock_precision: 0,
    local_date: "2026-10-22",
    instant: null,
    supplied_offset_seconds: null,
  });
  expect(
    changed.graph.itinerary_transport_endpoints.find((r) => r.role === "DESTINATION"),
  ).toEqual(
    original.graph.itinerary_transport_endpoints.find((r) => r.role === "DESTINATION"),
  );
  expect(changed.graph.itinerary_transport_services).toEqual(
    original.graph.itinerary_transport_services,
  );
  expect(changed.graph.trip_endpoint_details).toEqual(
    original.graph.trip_endpoint_details,
  );
  expect(changed.graph.trip_transport_operational_facts).toEqual(
    original.graph.trip_transport_operational_facts,
  );
  const next = await repo.read(f.tripId, d.itemId);
  await repo.save(next, { ...next.fields, transportType: "SHUTTLE" });
  const now = await f.core.manualReadSnapshot(ctx, actor);
  expect(now.graph.itinerary_transport_endpoints).toEqual(
    changed.graph.itinerary_transport_endpoints,
  );
  expect(now.graph.itinerary_transport_services[0]).toMatchObject({
    ...service,
    transport_subtype: "SHUTTLE",
  });
  const last = JSON.parse(
    String(
      f.sql
        .prepare(
          "SELECT canonical_intent_text FROM trip_core_pending_intents ORDER BY created_at DESC,operation_id DESC LIMIT 1",
        )
        .get()!.canonical_intent_text,
    ),
  );
  expect(last.payload).not.toHaveProperty("endpoints");
  const changePlace = await repo.read(f.tripId, d.itemId);
  await repo.save(changePlace, {
    ...changePlace.fields,
    departureLocation: "New authored origin",
  });
  const raw = await f.core.manualReadSnapshot(ctx, actor);
  expect(
    raw.graph.itinerary_transport_endpoints.find((r) => r.role === "ORIGIN"),
  ).toMatchObject({
    authored_label: "New authored origin",
    accepted_latitude: null,
    accepted_longitude: null,
    spatial_provenance_refs: null,
  });
  expect(
    raw.graph.itinerary_transport_endpoints.find((r) => r.role === "DESTINATION"),
  ).toEqual(
    now.graph.itinerary_transport_endpoints.find((r) => r.role === "DESTINATION"),
  );
});
it("rejects stale/foreign/revoked/account-generation/ABA writes without granting passenger rights", async () => {
  const f = await fixture(),
    repo = f.repo(),
    d = await repo.createDraft(f.tripId);
  await repo.save(d, inputFor(d.fields));
  const a = await repo.read(f.tripId, d.itemId),
    b = await repo.read(f.tripId, d.itemId);
  await repo.save(b, { ...b.fields, description: "Updated" });
  const n = count(f.sql);
  await expect(repo.save(a, { ...a.fields, title: "Stale" })).rejects.toThrow("CONFLICT");
  await expect(repo.read(f.tripId, randomUUID())).rejects.toThrow("UNAVAILABLE");
  const edit = await repo.read(f.tripId, d.itemId);
  await expect(
    repo.save(edit, {
      ...edit.fields,
      participation: {
        mode: "SELECTED_MEMBERS",
        people: [randomUUID()],
        selfPersonId: null,
      },
    }),
  ).rejects.toThrow("CROSS_TRIP_PERSON");
  expect(count(f.sql)).toBe(n);
  await f.core.revoke(await f.core.captureContext(f.tripId), 1);
  await expect(repo.save(edit, edit.fields)).rejects.toThrow("REVOKED");
  expect(count(f.sql)).toBe(n);
  const g = await fixture(),
    gr = g.repo(),
    gd = await gr.createDraft(g.tripId);
  g.switchAccount();
  await expect(gr.save(gd, inputFor(gd.fields))).rejects.toThrow("Account changed");
  expect(count(g.sql)).toBe(0);
  const h = await fixture(),
    hr = h.repo(),
    hd = await hr.createDraft(h.tripId);
  h.aba();
  await expect(hr.save(hd, inputFor(hd.fields))).rejects.toThrow();
  expect(count(h.sql)).toBe(0);
});
it("owning finite batch rejects legacy root SCHEDULE/PLACE commands for actual transport target", async () => {
  const f = await fixture(),
    repo = f.repo(),
    d = await repo.createDraft(f.tripId);
  await repo.save(d, inputFor(d.fields));
  const ctx = await f.core.captureContext(f.tripId),
    n = count(f.sql);
  for (const [command, payload] of [
    ["SET_ITEM_SCHEDULE", { schedule: { start: coreDateBoundary("2026-10-20") } }],
    [
      "SET_ITEM_PLACE",
      {
        place: corePlaceSchema.parse(
          Object.fromEntries(Object.keys(corePlaceSchema.shape).map((k) => [k, null])),
        ),
      },
    ],
  ] as const) {
    await expect(
      f.core.commitManualBatch(ctx, async () => ({
        commands: [
          {
            contractVersion: 2,
            intentVersion: 2,
            operationId: randomUUID(),
            tripId: f.tripId,
            command,
            target: { kind: "ITEM", id: d.itemId },
            baseVector: [{ kind: "ITEM", id: d.itemId, revision: 1 }],
            admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
            payload,
          },
        ],
        result: async () => true,
      })),
    ).rejects.toThrow("MANUAL_BATCH_INVALID");
  }
  expect(count(f.sql)).toBe(n);
});

it("serializes competing saves of one opaque draft without acknowledging different frozen inputs", async () => {
  const f = await fixture(),
    repo = f.repo(),
    d = await repo.createDraft(f.tripId);
  await repo.save(d, inputFor(d.fields));
  const edit = await repo.read(f.tripId, d.itemId);
  const first = { ...edit.fields, title: "First submitted title" },
    other = { ...edit.fields, title: "Later competing title" };
  const outcomes = await Promise.allSettled([
    repo.save(edit, first),
    repo.save(edit, other),
  ]);
  expect(outcomes[0].status).toBe("fulfilled");
  expect(outcomes[1]).toMatchObject({
    status: "rejected",
    reason: expect.objectContaining({ message: "MANUAL_TRANSPORT_DRAFT_FROZEN" }),
  });
  expect(count(f.sql)).toBe(2);
  expect((await f.repo().read(f.tripId, d.itemId)).fields.title).toBe(first.title);
});
