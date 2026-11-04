import {
  dayHeaderDestinationRead,
  resolveDayHeaderDestination,
} from "@/features/day-feed/dayHeaderDestinationRead";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { migrations } from "../db/migrations";
import { serializeDatabaseTransactions } from "../db/databaseConnection";
import {
  advanceAccountGeneration,
  getAccountGeneration,
} from "../auth/accountGeneration";
import { createTripCoreV2Repository, type CoreDatabase } from "./tripCoreV2Repository";
import { createTripRepository } from "./tripRepository";
import { createTripLocalManualReader } from "./tripLocalManualReadRepository";
import { createTripDayFeedReader } from "./tripDayFeedRepository";
import {
  createManualStayRepository,
  type ManualStayFields,
} from "./manualStayRepository";
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
async function fixture(fresh?: { accountId: string; tripId: string }) {
  const sql = new DatabaseSync(":memory:");
  opened.push(sql);
  sql.exec("PRAGMA foreign_keys=ON");
  for (const m of migrations) sql.exec(m.sql);
  let accountId = fresh?.accountId ?? randomUUID(),
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
  let currentClock = "2026-10-20T00:00:00.000Z";
  const clock = () => currentClock;
  const core = createTripCoreV2Repository(
    database,
    identity,
    async (b) => createHash("sha256").update(b).digest("hex"),
    clock,
  );
  const trips = createTripRepository(database, identity, core, clock);
  const tripId = fresh?.tripId ?? randomUUID();
  if (!fresh)
    await trips.createTrip({
      tripId,
      operationId: randomUUID(),
      name: "Winter trip",
      destination: null,
      startDate: "2026-12-30",
      endDate: "2027-04-28",
    });
  const repo = () => createManualStayRepository(database, identity, core, clock);
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
    setClock(value: string) {
      currentClock = value;
    },
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
const inputFor = (fields: ManualStayFields): ManualStayFields => ({
  ...fields,
  title: "Nelson guesthouse",
  startDate: "2026-10-20",
  endDate: "2026-10-23",
  location: "Nelson city centre",
  description: "Quiet room, arrive after lunch",
});
const count = (sql: DatabaseSync) =>
  sql.prepare("SELECT COUNT(*) n FROM trip_core_pending_intents").get()!.n;
it("creates one normal MANUAL Stay with required dates, optional clocks and Notes; every day resolves the same ID after cold read", async () => {
  const f = await fixture(),
    repo = f.repo(),
    draft = await repo.createDraft(f.tripId);
  const input = inputFor(draft.fields);
  const result = await repo.save(draft, input);
  expect(result).toMatchObject({ localStatus: "PENDING", itemId: draft.itemId });
  expect(result.operationIds).toHaveLength(1);
  const create = (await f.core.pending(await f.core.captureContext(f.tripId)))[0].command;
  expect((create.payload as { place: unknown }).place).toMatchObject({
    authored_label: input.location,
    authored_address: input.location,
  });
  const cold = await f.repo().read(f.tripId, draft.itemId);
  expect(cold.fields).toEqual(input);
  expect(cold.fields.stayDetails.propertyName).toBeNull();
  const local = (await f.read(f.tripId))!;
  expect(local.items[0]).toMatchObject({
    itemId: draft.itemId,
    family: "P3",
    description: input.description,
    localState: "PENDING",
  });
  expect(local.rows("2026-10-20").map((r) => r.rowKey.projectionRole)).toEqual([
    "CHECKIN",
  ]);
  expect(local.rows("2026-10-21").map((r) => r.rowKey.projectionRole)).toEqual([
    "TONIGHT",
  ]);
  expect(local.rows("2026-10-23").map((r) => r.rowKey.projectionRole)).toEqual([
    "CHECKOUT",
  ]);
  for (const date of ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"])
    expect(local.rows(date).every((r) => r.itemRef === draft.itemId)).toBe(true);
  expect((await f.days.trip(f.tripId)).localManual?.items[0].itemId).toBe(draft.itemId);
  expect(
    f.sql
      .prepare("SELECT start_date,end_date FROM local_trip_containers WHERE id=?")
      .get(f.tripId),
  ).toEqual({ start_date: "2026-12-30", end_date: "2027-04-28" });
  expect(
    f.sql.prepare("SELECT COUNT(*) n FROM trip_core_read_certificates").get()!.n,
  ).toBe(0);
});
it("same-ID five-field edit is ordered, retains historical property name and has an exact repeat outcome", async () => {
  const f = await fixture(),
    repo = f.repo(),
    create = await repo.createDraft(f.tripId);
  await repo.save(create, inputFor(create.fields));
  const draft = await repo.read(f.tripId, create.itemId),
    self = draft.participantOptions[0].personId;
  const fields: ManualStayFields = {
    ...draft.fields,
    title: "Guesthouse stay",
    startDate: "2026-10-21",
    startTime: "14:30",
    endDate: "2026-10-24",
    endTime: "10:00",
    location: "Garden entrance",
    description: "Call at the gate",
    participation: { mode: "SELECTED_MEMBERS", people: [self], selfPersonId: null },
    stayDetails: {
      ...draft.fields.stayDetails,
      permittedCheckinFrom: "14:00",
      permittedCheckinUntil: "02:00",
      permittedCheckoutBy: "10:00",
    },
  };
  const first = await repo.save(draft, fields);
  expect(first.operationIds).toHaveLength(5);
  expect(await repo.save(draft, fields)).toEqual(first);
  expect(count(f.sql)).toBe(6);
  const ops = f.sql
    .prepare(
      "SELECT canonical_intent_text FROM trip_core_pending_intents ORDER BY created_at,operation_id",
    )
    .all();
  expect(ops.map((r) => JSON.parse(String(r.canonical_intent_text)).command)).toEqual([
    "CREATE_ITEM",
    "SET_ITEM_TEXT",
    "SET_ITEM_SCHEDULE",
    "SET_ITEM_PLACE",
    "SET_ITEM_PARTICIPATION",
    "SET_STAY_DETAILS",
  ]);
  const cold = await f.repo().read(f.tripId, create.itemId);
  expect(cold.fields).toEqual(fields);
  expect(cold.fields.stayDetails.propertyName).toBeNull();
  expect((await f.read(f.tripId))!.items[0]).toMatchObject({
    itemId: create.itemId,
    itemRevision: 6,
  });
  await expect(repo.save(draft, { ...fields, title: "Different retry" })).rejects.toThrow(
    "DRAFT_FROZEN",
  );
});
it("failed final Stay-details write rolls back all earlier SET commands and exact retry succeeds", async () => {
  const f = await fixture(),
    repo = f.repo(),
    d = await repo.createDraft(f.tripId);
  await repo.save(d, inputFor(d.fields));
  const edit = await repo.read(f.tripId, d.itemId);
  const fields: ManualStayFields = {
    ...edit.fields,
    title: "Renamed",
    startDate: "2026-10-21",
    location: "New door",
    participation: {
      mode: "SELECTED_MEMBERS",
      people: [edit.participantOptions[0].personId],
      selfPersonId: null,
    },
    stayDetails: { ...edit.fields.stayDetails, permittedCheckoutBy: "11:00" },
  };
  const before = f.sql.prepare("SELECT * FROM sync_operations ORDER BY id").all();
  f.failNext(5);
  await expect(repo.save(edit, fields)).rejects.toThrow("TEST_WRITE_FAILURE");
  expect(count(f.sql)).toBe(1);
  expect(f.sql.prepare("SELECT * FROM sync_operations ORDER BY id").all()).toEqual(
    before,
  );
  expect((await f.repo().read(f.tripId, d.itemId)).fields.title).toBe(
    "Nelson guesthouse",
  );
  f.failNext(0);
  expect((await repo.save(edit, fields)).operationIds).toHaveLength(5);
});
it("legacy Stay rooms and unchanged detail seconds survive a title/details edit without creating Booking or extra Stay IDs", async () => {
  const f = await fixture(),
    id = randomUUID(),
    room = randomUUID();
  await f.core.enqueue(await f.core.captureContext(f.tripId), {
    contractVersion: 2,
    intentVersion: 2,
    tripId: f.tripId,
    operationId: randomUUID(),
    command: "CREATE_ITEM",
    target: { kind: "ITEM", id },
    baseVector: [{ kind: "ITEM", id, revision: null }],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: {
      family: "P3",
      core: { title: "Private stay label" },
      schedule: {
        start: {
          instant: null,
          local_date: "2026-10-20",
          local_time: null,
          clock_precision: null,
          quality: "UNKNOWN",
          basis: "DERIVED_CIVIL",
          zone_id: null,
          supplied_offset_seconds: null,
          source_instant: null,
          source_instant_precision: null,
          civil_resolution: "PENDING",
          resolution_offset_seconds: null,
          interpretation_key: null,
          interpretation_input_sha256: null,
          provenance_refs: null,
        },
        end: {
          instant: null,
          local_date: "2026-10-23",
          local_time: null,
          clock_precision: null,
          quality: "UNKNOWN",
          basis: "DERIVED_CIVIL",
          zone_id: null,
          supplied_offset_seconds: null,
          source_instant: null,
          source_instant_precision: null,
          civil_resolution: "PENDING",
          resolution_offset_seconds: null,
          interpretation_key: null,
          interpretation_input_sha256: null,
          provenance_refs: null,
        },
      },
      details: {
        property_name: "Original property name",
        permitted_checkin_from: "14:00:30",
      },
      rooms: [{ room_id: room, category: "Double", quantity: 1, capacity: 2 }],
      participation: { mode: "WHOLE_GROUP", people: [], selfPersonId: null },
      acl: { visibility: "GROUP", people: [] },
    },
  });
  const repo = f.repo(),
    draft = await repo.read(f.tripId, id);
  await repo.save(draft, {
    ...draft.fields,
    title: "New display label",
    stayDetails: { ...draft.fields.stayDetails, permittedCheckoutBy: "10:00" },
  });
  const ctx = await f.core.captureContext(f.tripId),
    personId = draft.participantOptions[0].personId;
  const snapshot = await f.core.manualReadSnapshot(ctx, {
    accountId: f.originalAccount,
    tripId: f.tripId,
    active: true,
    canManageShared: true,
    personId,
    personIds: [personId],
  });
  expect(snapshot.graph.itinerary_events).toHaveLength(1);
  expect(snapshot.graph.itinerary_events[0].id).toBe(id);
  expect(snapshot.graph.trip_stay_details[0]).toMatchObject({
    property_name: "Original property name",
    permitted_checkin_from: "14:00:30",
    permitted_checkout_by: "10:00",
  });
  expect(snapshot.graph.trip_stay_rooms).toEqual([
    {
      trip_id: f.tripId,
      event_id: id,
      room_id: room,
      category: "Double",
      quantity: 1,
      capacity: 2,
    },
  ]);
  expect(snapshot.graph.itinerary_reservations).toEqual([]);
});
it("requires checkout/name, rejects reversed date, stale/revoked/account/foreign people and writes nothing on canceled draft", async () => {
  const f = await fixture(),
    repo = f.repo(),
    d = await repo.createDraft(f.tripId);
  expect(count(f.sql)).toBe(0);
  await expect(repo.save(d, { ...inputFor(d.fields), endDate: "" })).rejects.toThrow();
  await expect(repo.save(d, { ...inputFor(d.fields), title: "" })).rejects.toThrow();
  await expect(
    repo.save(d, { ...inputFor(d.fields), endDate: "2026-10-19" }),
  ).rejects.toThrow();
  expect(count(f.sql)).toBe(0);
  await repo.save(d, inputFor(d.fields));
  const a = await repo.read(f.tripId, d.itemId),
    b = await repo.read(f.tripId, d.itemId);
  await repo.save(b, { ...b.fields, description: "Updated" });
  await expect(repo.save(a, { ...a.fields, title: "Stale" })).rejects.toThrow("CONFLICT");
  const current = await repo.read(f.tripId, d.itemId),
    n = count(f.sql);
  await expect(
    repo.save(current, {
      ...current.fields,
      participation: {
        mode: "SELECTED_MEMBERS",
        people: [randomUUID()],
        selfPersonId: null,
      },
    }),
  ).rejects.toThrow("CROSS_TRIP_PERSON");
  expect(count(f.sql)).toBe(n);
  await f.core.revoke(await f.core.captureContext(f.tripId), 1);
  await expect(repo.save(current, current.fields)).rejects.toThrow("CORE_ACCESS_REVOKED");
  const g = await fixture(),
    r = g.repo(),
    draft = await r.createDraft(g.tripId);
  g.switchAccount();
  await expect(r.save(draft, inputFor(draft.fields))).rejects.toThrow("Account changed");
  expect(count(g.sql)).toBe(0);
});
it("keeps lawful same-date zero-night Stay explicit, without inventing a checkout day", async () => {
  const f = await fixture(),
    r = f.repo(),
    d = await r.createDraft(f.tripId);
  await r.save(d, { ...inputFor(d.fields), endDate: "2026-10-20" });
  const local = (await f.read(f.tripId))!;
  expect(local.rows("2026-10-20").map((row) => row.rowKey.projectionRole)).toEqual([
    "CHECKIN",
    "CHECKOUT",
  ]);
  expect(local.rows("2026-10-21")).toEqual([]);
  expect((await f.repo().read(f.tripId, d.itemId)).fields.endDate).toBe("2026-10-20");
});
it("P3 editor still rejects a Plan while the owning batch now accepts a lawful P6 create", async () => {
  const f = await fixture();
  const plan = randomUUID();
  await f.trips.addItem(f.tripId, {
    itemId: plan,
    operationId: randomUUID(),
    family: "P1",
    title: "Walk",
    startDate: "2026-10-20",
  });
  await expect(f.repo().read(f.tripId, plan)).rejects.toThrow("MANUAL_PLAN_UNAVAILABLE");
  const original = JSON.parse(
    String(
      f.sql.prepare("SELECT canonical_intent_text FROM trip_core_pending_intents").get()!
        .canonical_intent_text,
    ),
  );
  const other = randomUUID();
  const activity = {
    ...original,
    operationId: randomUUID(),
    target: { kind: "ITEM", id: other },
    baseVector: [{ kind: "ITEM", id: other, revision: null }],
    payload: { ...original.payload, family: "P6" },
  };
  const n = count(f.sql);
  await expect(
    f.core.commitManualBatch(await f.core.captureContext(f.tripId), async () => ({
      commands: [activity],
      result: async () => true,
    })),
  ).resolves.toBe(true);
  expect(count(f.sql)).toBe(Number(n) + 1);
});

it("finite batch accepts SET on an existing P6 target and generic replay does not duplicate its queue", async () => {
  const f = await fixture(),
    id = randomUUID(),
    ctx = await f.core.captureContext(f.tripId);
  const time = {
    instant: null,
    local_date: "2026-10-20",
    local_time: null,
    clock_precision: null,
    quality: "UNKNOWN",
    basis: "DERIVED_CIVIL",
    zone_id: null,
    supplied_offset_seconds: null,
    source_instant: null,
    source_instant_precision: null,
    civil_resolution: "PENDING",
    resolution_offset_seconds: null,
    interpretation_key: null,
    interpretation_input_sha256: null,
    provenance_refs: null,
  };
  await f.core.enqueue(ctx, {
    contractVersion: 2,
    intentVersion: 2,
    operationId: randomUUID(),
    tripId: f.tripId,
    command: "CREATE_ITEM",
    target: { kind: "ITEM", id },
    baseVector: [{ kind: "ITEM", id, revision: null }],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: {
      family: "P6",
      core: { title: "Activity" },
      schedule: { start: time },
      participation: { mode: "WHOLE_GROUP", people: [], selfPersonId: null },
      acl: { visibility: "GROUP", people: [] },
    },
  });
  const command = {
    contractVersion: 2,
    intentVersion: 2,
    operationId: randomUUID(),
    tripId: f.tripId,
    command: "SET_ITEM_TEXT",
    target: { kind: "ITEM", id },
    baseVector: [{ kind: "ITEM", id, revision: 1 }],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: { title: "New activity label" },
  };
  const before = f.sql.prepare("SELECT * FROM sync_operations ORDER BY id").all();
  await expect(
    f.core.commitManualBatch(ctx, async () => ({
      commands: [command],
      result: async () => true,
    })),
  ).resolves.toBe(true);
  expect(count(f.sql)).toBe(2);
  expect(f.sql.prepare("SELECT * FROM sync_operations ORDER BY id").all()).toHaveLength(
    before.length + 1,
  );
  expect((await f.core.enqueue(ctx, command)).localStatus).toBe("PENDING");
  expect(count(f.sql)).toBe(2);
});
it("SET_STAY_DETAILS requires an actual P3 target even when the current target is a legal P1", async () => {
  const f = await fixture(),
    id = randomUUID(),
    ctx = await f.core.captureContext(f.tripId);
  await f.trips.addItem(f.tripId, {
    itemId: id,
    operationId: randomUUID(),
    family: "P1",
    title: "Plan",
    startDate: "2026-10-20",
  });
  const n = count(f.sql);
  const command = {
    contractVersion: 2,
    intentVersion: 2,
    operationId: randomUUID(),
    tripId: f.tripId,
    command: "SET_STAY_DETAILS",
    target: { kind: "ITEM", id },
    baseVector: [{ kind: "ITEM", id, revision: 1 }],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: { details: {}, rooms: [] },
  };
  await expect(
    f.core.commitManualBatch(ctx, async () => ({
      commands: [command],
      result: async () => true,
    })),
  ).rejects.toThrow("MANUAL_BATCH_INVALID");
  expect(count(f.sql)).toBe(n);
});

it("ordinary Create stores Name only in title; cold Rename has no duplicated property name and exact retry keeps one SET", async () => {
  const f = await fixture(),
    repo = f.repo(),
    draft = await repo.createDraft(f.tripId);
  await repo.save(draft, inputFor(draft.fields));
  const cold = await f.repo().read(f.tripId, draft.itemId);
  expect(cold.fields.stayDetails.propertyName).toBeNull();
  const owner = f.repo(),
    edit = await owner.read(f.tripId, draft.itemId);
  const fields = { ...edit.fields, title: "Harbour guesthouse" };
  const result = await owner.save(edit, fields);
  expect(result.operationIds).toHaveLength(1);
  expect(await owner.save(edit, fields)).toEqual(result);
  expect(count(f.sql)).toBe(2);
  const reopened = await f.repo().read(f.tripId, draft.itemId);
  expect(reopened.fields).toEqual(fields);
  expect(reopened.fields.stayDetails.propertyName).toBeNull();
  const item = (await f.read(f.tripId))!.items.find((i) => i.itemId === draft.itemId)!;
  expect(item.title).toBe(fields.title);
  expect(item.details).not.toHaveProperty("propertyName");
});
it("explicit independent property and permitted windows survive a title-only rename even when originally the same text", async () => {
  const f = await fixture(),
    repo = f.repo(),
    draft = await repo.createDraft(f.tripId);
  const input = inputFor(draft.fields);
  input.stayDetails = {
    ...input.stayDetails,
    propertyName: input.title,
    permittedCheckinFrom: "14:00",
    permittedCheckinUntil: "02:00",
    permittedCheckoutBy: "10:00",
  };
  await repo.save(draft, input);
  const edit = await repo.read(f.tripId, draft.itemId);
  await repo.save(edit, { ...edit.fields, title: "Personal stay label" });
  const cold = await f.repo().read(f.tripId, draft.itemId);
  expect(cold.fields.title).toBe("Personal stay label");
  expect(cold.fields.stayDetails).toEqual(input.stayDetails);
});

it("reviewer: title-only legacy rename followed by independent property match never relinks", async () => {
  const f = await fixture(),
    repo = f.repo(),
    d = await repo.createDraft(f.tripId);
  const original = inputFor(d.fields);
  original.stayDetails.propertyName = original.title;
  await repo.save(d, original);
  const ctx = await f.core.captureContext(f.tripId);
  await f.core.enqueue(ctx, {
    contractVersion: 2,
    intentVersion: 2,
    operationId: randomUUID(),
    tripId: f.tripId,
    command: "SET_ITEM_TEXT",
    target: { kind: "ITEM", id: d.itemId },
    baseVector: [{ kind: "ITEM", id: d.itemId, revision: 1 }],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: { title: "Legacy renamed title" },
  });
  let edit = await repo.read(f.tripId, d.itemId);
  await repo.save(edit, {
    ...edit.fields,
    stayDetails: { ...edit.fields.stayDetails, propertyName: "Legacy renamed title" },
  });
  edit = await repo.read(f.tripId, d.itemId);
  await repo.save(edit, { ...edit.fields, title: "Later display title" });
  expect((await f.repo().read(f.tripId, d.itemId)).fields.stayDetails.propertyName).toBe(
    "Legacy renamed title",
  );
});

const appleSelectionFor = (tripId: string, itemId: string, location: string) => ({
  authority: "UNACCEPTED_PROVIDER_DRAFT" as const,
  binding: {
    tripId,
    itemId,
    location,
    accountGeneration: getAccountGeneration(),
    inputRevision: 1,
  },
  provider: "apple" as const,
  selectionSessionId: randomUUID(),
  selectionGeneration: 1,
  providerPlaceId: "opaque-apple-poi-not-an-internal-uuid",
  addressComponents: {
    locality: "Nelson",
    administrativeArea: "Nelson",
    country: "New Zealand",
    countryCode: "NZ",
  },
  point: { latitude: -41.27, longitude: 173.28 },
});
it("owning candidate retains an unaccepted provider draft without automatically promoting geography", async () => {
  const f = await fixture(),
    repo = f.repo(),
    draft = await repo.createDraft(f.tripId);
  const input = inputFor(draft.fields),
    selection = appleSelectionFor(f.tripId, draft.itemId, input.location!);
  await repo.save(draft, input, selection);
  const item = (await f.read(f.tripId))!.items[0];
  expect(item.place).toMatchObject({
    authoredAddressLocality: "Nelson",
    spatialProvenanceRefs: { acceptance: "UNACCEPTED_PROVIDER_DRAFT" },
  });
  expect(item.place).not.toHaveProperty("acceptedAddressLocality");
  expect(item.place).not.toHaveProperty("latitude");
  expect(
    resolveDayHeaderDestination(
      dayHeaderDestinationRead(await f.days.trip(f.tripId))!,
      "2026-10-21",
    ).kind,
  ).toBe("unresolved");
});
it("only an explicit reviewed Save commits accepted geography through the existing same-ID Core and Queue", async () => {
  const f = await fixture(),
    repo = f.repo(),
    draft = await repo.createDraft(f.tripId);
  const input = inputFor(draft.fields),
    selection = appleSelectionFor(f.tripId, draft.itemId, input.location!);
  const request = { intent: "ACCEPT_SELECTED_APPLE_PLACE_V1" as const, draft: selection };
  const result = await repo.save(draft, input, request);
  const item = (await f.read(f.tripId))!.items[0];
  expect(item.itemId).toBe(draft.itemId);
  expect(item.place).toMatchObject({
    acceptedAddressLocality: "Nelson",
    acceptedAddressRegion: "Nelson",
    acceptedAddressCountry: "New Zealand",
    latitude: -41.27,
    longitude: 173.28,
    spatialProvenanceRefs: {
      source: "MANUAL_USER_REVIEWED_APPLE_SELECTION_V1",
      acceptance: "USER_CONFIRMED_SAVE",
    },
  });
  expect(item.place).not.toHaveProperty("placeId");
  expect(
    resolveDayHeaderDestination(
      dayHeaderDestinationRead(await f.days.trip(f.tripId))!,
      "2026-10-21",
    ),
  ).toEqual({ kind: "single", source: "stay", label: "Nelson" });
  expect(item.schedule).toMatchObject({
    start: { localDate: input.startDate },
    end: { localDate: input.endDate },
  });
  expect(count(f.sql)).toBe(1);
  expect(await repo.save(draft, input, request)).toEqual(result);
  await expect(
    repo.save(draft, input, {
      ...request,
      draft: { ...selection, binding: { ...selection.binding, inputRevision: 2 } },
    }),
  ).rejects.toThrow("MANUAL_PLAN_DRAFT_FROZEN");
  const other = await repo.createDraft(f.tripId);
  await expect(repo.save(other, input, request)).rejects.toThrow(
    "MANUAL_PLACE_DRAFT_BINDING",
  );
  expect(count(f.sql)).toBe(1);
});

it("reuses the exact reviewed Place after first SQLite insert rollback and a changed retry clock", async () => {
  const f = await fixture(),
    repo = f.repo(),
    draft = await repo.createDraft(f.tripId);
  const input = inputFor(draft.fields),
    selection = appleSelectionFor(f.tripId, draft.itemId, input.location!);
  const request = { intent: "ACCEPT_SELECTED_APPLE_PLACE_V1" as const, draft: selection };
  f.failNext(1);
  await expect(repo.save(draft, input, request)).rejects.toThrow("TEST_WRITE_FAILURE");
  expect(count(f.sql)).toBe(0);
  f.setClock("2026-10-21T12:34:56.000Z");
  f.failNext(0);
  const saved = await repo.save(draft, input, request);
  expect(saved.itemId).toBe(draft.itemId);
  expect(count(f.sql)).toBe(1);
  const item = (await f.read(f.tripId))!.items[0];
  expect(item.place).toMatchObject({
    acceptedAddressLocality: "Nelson",
    spatialProvenanceRefs: {
      reviewed_at: "2026-10-20T00:00:00.000Z",
      acceptance: "USER_CONFIRMED_SAVE",
    },
  });
  expect(await repo.save(draft, input, request)).toEqual(saved);
});

async function freshAcceptedFixture(
  decorate?: (graph: import("@/domain/trip/tripCoreV2Mutation").CoreGraph) => void,
) {
  const source = await fixture(),
    repository = source.repo(),
    draft = await repository.createDraft(source.tripId);
  await repository.save(draft, inputFor(draft.fields));
  const context = await source.core.captureContext(source.tripId);
  const { readLocalManualSnapshotWithinTransaction } =
    await import("./tripLocalManualReadRepository");
  const local = (await readLocalManualSnapshotWithinTransaction(
    source.coreDatabase,
    source.identity,
    source.core,
    context,
    null,
  ))!;
  const { executeCoreCommandV2 } =
    await import("../../../backend/src/tripCoreV2Commands");
  const { emptyCoreGraph } = await import("@/domain/trip/tripCoreV2Mutation");
  const { buildCoreActorCollection } =
    await import("../../../backend/src/tripCoreV2Collection");
  const hash = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
  let graph = emptyCoreGraph();
  const create = (await source.core.pending(context))[0].command;
  await executeCoreCommandV2(
    {
      withLockedCommand: async (_scope, work) =>
        work({
          actor: local.actor,
          readReceipt: async () => null,
          hasLegacyOperation: async () => false,
          canReadReceipt: async () => true,
          enabledCommands: async () => ["CREATE_ITEM"],
          readLockedGraph: async () => graph,
          verifyAdmission: async () => {},
          lifecycleGraphHash: async () => undefined,
          commit: async (mutation) => {
            if (mutation) graph = mutation.graph;
            return randomUUID();
          },
        }),
    },
    source.originalAccount,
    source.tripId,
    create,
    hash,
    () => "2026-10-20T00:00:00Z",
  );
  decorate?.(graph);
  const bundle = await buildCoreActorCollection(
    graph,
    local.actor,
    {
      epoch: randomUUID(),
      revision: 1,
      accessRevision: 1,
      generatedAt: "2026-10-20T00:00:00Z",
    },
    local.participatingPersonIds.map((id) => ({
      person_id: id,
      account_id: source.originalAccount,
      active: true,
      participating: true,
      revision: 1,
    })),
    hash,
  );
  const fresh = await fixture({
    accountId: source.originalAccount,
    tripId: source.tripId,
  });
  await fresh.core.refresh(await fresh.core.captureContext(fresh.tripId), {
    collection: async () => bundle,
  });
  return { ...fresh, itemId: draft.itemId };
}
it("fresh Accepted own P3 edits via original finite MANUAL batch with no local Create history", async () => {
  const f = await freshAcceptedFixture(),
    repo = f.repo();
  expect(f.sql.prepare("SELECT count(*) n FROM sync_operations").get()).toEqual({ n: 0 });
  const draft = await repo.read(f.tripId, f.itemId, 1);
  const saved = await repo.save(draft, { ...draft.fields, title: "Fresh P3 edit" });
  expect(saved.itemId).toBe(f.itemId);
  const pending = await f.core.pending(await f.core.captureContext(f.tripId));
  expect(pending).toHaveLength(1);
  expect(pending[0].command).toMatchObject({
    command: "SET_ITEM_TEXT",
    admission: { mode: "MANUAL" },
    target: { id: f.itemId },
    baseVector: [{ revision: 1 }],
  });
  expect(f.sql.prepare("SELECT count(*) n FROM local_trip_containers").get()).toEqual({
    n: 0,
  });
});

it.each(["SOURCE_INSTANT", "INTERPRETED_CIVIL"])(
  "fresh P3 title edit preserves %s facts; unsupported schedule re-authoring is refused without queue writes",
  async (kind) => {
    const { coreBoundarySchema, coreDateBoundary } =
      await import("@/domain/trip/tripCoreV2Temporal");
    const boundary = coreBoundarySchema.parse({
      ...coreDateBoundary("2026-10-20"),
      local_time: "09:00:00",
      clock_precision: 0,
      instant: "2026-10-20T09:00:00Z",
      quality: "EXACT",
      basis: kind === "SOURCE_INSTANT" ? "SOURCE_INSTANT" : "DERIVED_CIVIL",
      source_instant: kind === "SOURCE_INSTANT" ? "2026-10-20T09:00:00Z" : null,
      source_instant_precision: kind === "SOURCE_INSTANT" ? 0 : null,
      zone_id: "Etc/UTC",
      civil_resolution: kind === "SOURCE_INSTANT" ? "PENDING" : "UNIQUE",
      resolution_offset_seconds: kind === "SOURCE_INSTANT" ? null : 0,
      interpretation_key:
        kind === "SOURCE_INSTANT" ? null : "synthetic-retained-interpretation",
      interpretation_input_sha256: kind === "SOURCE_INSTANT" ? null : "a".repeat(64),
      provenance_refs: null,
    });
    const f = await freshAcceptedFixture((graph) =>
      Object.assign(
        graph.itinerary_events[0],
        Object.fromEntries(
          Object.entries(boundary).map(([key, value]) => [
            key === "instant" ? "planned_start" : `start_${key}`,
            value,
          ]),
        ),
      ),
    );
    const repository = f.repo(),
      draft = await repository.read(f.tripId, f.itemId, 1);
    await expect(
      repository.save(draft, { ...draft.fields, endDate: "2026-10-24" }),
    ).rejects.toThrow("MANUAL_PLAN_TEMPORAL_AUTHORITY_REQUIRED");
    expect(f.sql.prepare("SELECT count(*) n FROM sync_operations").get()).toEqual({
      n: 0,
    });
    await repository.save(draft, {
      ...draft.fields,
      title: "Preserve qualified Source clock",
    });
    const pending = await f.core.pending(await f.core.captureContext(f.tripId));
    expect(pending.map((intent) => intent.command.command)).toEqual(["SET_ITEM_TEXT"]);
    const { coreStoredBoundary } = await import("@/domain/trip/tripCoreV2Temporal");
    expect(
      coreStoredBoundary(
        (await f.core.acceptedSnapshot(await f.core.captureContext(f.tripId)))!.graph
          .itinerary_events[0],
        "start",
      ),
    ).toEqual(boundary);
  },
);

it("fresh P3 details retain every room ID/quantity and unchanged permitted-clock precision", async () => {
  const roomId = randomUUID();
  const f = await freshAcceptedFixture((graph) => {
    Object.assign(graph.trip_stay_details[0], {
      property_name: "Original Lodge",
      permitted_checkin_from: "14:00:30",
    });
    graph.trip_stay_rooms.push({
      event_id: graph.itinerary_events[0].id,
      trip_id: graph.itinerary_events[0].trip_id,
      room_id: roomId,
      category: "Suite",
      quantity: 2,
      capacity: 3,
    });
  });
  const repository = f.repo(),
    draft = await repository.read(f.tripId, f.itemId, 1);
  await repository.save(draft, {
    ...draft.fields,
    stayDetails: { ...draft.fields.stayDetails, propertyName: "Correct Lodge" },
  });
  const pending = await f.core.pending(await f.core.captureContext(f.tripId));
  expect(pending.map((p) => p.command.command)).toEqual(["SET_STAY_DETAILS"]);
  expect(pending[0].command.payload).toMatchObject({
    details: { property_name: "Correct Lodge", permitted_checkin_from: "14:00:30" },
    rooms: [{ room_id: roomId, category: "Suite", quantity: 2, capacity: 3 }],
  });
});
