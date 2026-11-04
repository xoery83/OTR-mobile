import { corePlaceSchema } from "../../domain/trip/tripCoreV2";
import { coreDateBoundary } from "../../domain/trip/tripCoreV2Temporal";
import { withAccountApplyGate } from "../auth/accountRequestContext";
import { validateCoreCommand } from "../../domain/trip/tripCoreV2Commands";
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
import {
  createTripLocalManualReader,
  readLocalManualSnapshotWithinTransaction,
} from "./tripLocalManualReadRepository";
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
const count = (sql: DatabaseSync): number =>
  Number(sql.prepare("SELECT COUNT(*) n FROM trip_core_pending_intents").get()!.n);
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
  expect(cold.fields).toEqual({
    ...input,
    checkInInstruction: "",
    checkOutInstruction: "",
  });
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

it("commits a valid handwritten P3 ARRIVAL instruction through the owning manual transaction", async () => {
  const f = await fixture(),
    repo = f.repo();
  const draft = await repo.createDraft(f.tripId);
  await repo.save(draft, inputFor(draft.fields));
  const ctx = await f.core.captureContext(f.tripId);
  const entryId = randomUUID();
  const instruction = validateCoreCommand({
    contractVersion: 2,
    intentVersion: 2,
    operationId: randomUUID(),
    tripId: f.tripId,
    command: "APPEND_INSTRUCTION",
    target: { kind: "INSTRUCTION", id: entryId },
    baseVector: [
      { kind: "INSTRUCTION", id: entryId, revision: null },
      { kind: "ITEM", id: draft.itemId, revision: 1 },
    ],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: {
      itemId: draft.itemId,
      section: "ARRIVAL",
      body: "Ring the reception bell.",
      sensitivity: "NORMAL",
      sourceRepresentationId: null,
      acl: { visibility: "GROUP", people: [] },
    },
  });
  await expect(
    f.core.commitManualBatch(ctx, async () => ({
      commands: [instruction],
      result: async () => entryId,
    })),
  ).resolves.toBe(entryId);
  expect((await f.core.pending(ctx)).map((x) => x.command.target.kind)).toEqual([
    "ITEM",
    "INSTRUCTION",
  ]);
});

async function instructionFixture() {
  const f = await fixture(),
    repo = f.repo(),
    draft = await repo.createDraft(f.tripId);
  await repo.save(draft, inputFor(draft.fields));
  const ctx = await f.core.captureContext(f.tripId);
  // Build the target's null base only after allocating its stable identity.
  const command = (itemId = draft.itemId, revision = 1) => {
    const id = randomUUID();
    return validateCoreCommand({
      contractVersion: 2,
      intentVersion: 2,
      operationId: randomUUID(),
      tripId: f.tripId,
      command: "APPEND_INSTRUCTION",
      target: { kind: "INSTRUCTION", id },
      baseVector: [
        { kind: "INSTRUCTION", id, revision: null },
        { kind: "ITEM", id: itemId, revision },
      ],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: {
        itemId,
        section: "ARRIVAL",
        body: "Ring reception.",
        sensitivity: "NORMAL",
        sourceRepresentationId: null,
        acl: { visibility: "GROUP", people: [] },
      },
    });
  };
  const commit = (commands: readonly unknown[], result = async () => true) =>
    f.core.commitManualBatch(ctx, async () => ({ commands, result }));
  const graph = async () => {
    const current = await f.core.captureContext(f.tripId);
    let snapshot: Awaited<ReturnType<typeof readLocalManualSnapshotWithinTransaction>>;
    await withAccountApplyGate(async () =>
      f.coreDatabase.withTransactionAsync(async () => {
        snapshot = await readLocalManualSnapshotWithinTransaction(
          f.coreDatabase,
          f.identity,
          f.core,
          current,
          await f.core.readAcceptedSnapshotWithinTransaction(current),
        );
      }),
    );
    return snapshot!.graph;
  };
  return { ...f, ctx, draft, command, commit, graph };
}
function departure(command: ReturnType<typeof validateCoreCommand>) {
  return validateCoreCommand({
    ...command,
    payload: {
      ...(command.payload as object),
      section: "DEPARTURE",
      body: "Leave key at reception.",
    },
  });
}
function correctedInstruction(
  f: Awaited<ReturnType<typeof instructionFixture>>,
  oldId: string,
  itemRevision = 2,
  entryRevision = 1,
  newId = randomUUID(),
) {
  return validateCoreCommand({
    contractVersion: 2,
    intentVersion: 2,
    operationId: randomUUID(),
    tripId: f.tripId,
    command: "CORRECT_INSTRUCTION",
    target: { kind: "INSTRUCTION", id: oldId },
    baseVector: [
      { kind: "INSTRUCTION", id: oldId, revision: entryRevision },
      { kind: "INSTRUCTION", id: newId, revision: null },
      { kind: "ITEM", id: f.draft.itemId, revision: itemRevision },
    ].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)),
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: {
      newEntryId: newId,
      body: "Use the side reception bell.",
      sensitivity: "NORMAL",
      acl: { visibility: "GROUP", people: [] },
    },
  });
}
it("P3 instruction transaction corrects immutably and retains genuine Queue target/blocked state on duplicate or UNKNOWN", async () => {
  const f = await instructionFixture(),
    append = f.command();
  await f.commit([append]);
  const correction = correctedInstruction(f, append.target.id);
  await f.commit([correction]);
  const graph = await f.graph();
  expect(graph.trip_instruction_entries).toHaveLength(2);
  expect(
    graph.trip_instruction_entries.find((r) => r.id === append.target.id),
  ).toMatchObject({
    body: "Ring reception.",
    source_representation_id: null,
  });
  expect(
    graph.trip_instruction_entries.find(
      (r) => r.id === (correction.payload as { newEntryId: string }).newEntryId,
    ),
  ).toMatchObject({
    body: "Use the side reception bell.",
    supersedes_id: append.target.id,
  });
  expect(graph.itinerary_events[0].semantic_revision).toBe(3);
  const rows = f.sql
    .prepare(
      "SELECT id,entity_id,status,payload_json FROM sync_operations WHERE operation_type='CORE_V2_COMMAND' ORDER BY created_at",
    )
    .all();
  expect(rows).toHaveLength(3);
  expect(rows.slice(1).map((r) => r.entity_id)).toEqual([
    append.target.id,
    append.target.id,
  ]);
  expect(rows.every((r) => r.status === "DEPENDENCY_BLOCKED")).toBe(true);
  const n = count(f.sql);
  await f.commit([append]);
  await f.commit([correction]);
  expect(count(f.sql)).toBe(n);
  f.sql
    .prepare(
      "UPDATE trip_core_pending_intents SET state='IN_FLIGHT' WHERE operation_id=?",
    )
    .run(correction.operationId);
  f.sql
    .prepare("UPDATE sync_operations SET status='RETRYABLE' WHERE id=?")
    .run(correction.operationId);
  await f.commit([correction]);
  expect(count(f.sql)).toBe(n);
  expect(
    f.sql
      .prepare("SELECT state FROM trip_core_pending_intents WHERE operation_id=?")
      .get(correction.operationId)!.state,
  ).toBe("IN_FLIGHT");
  expect(
    f.sql
      .prepare("SELECT status FROM sync_operations WHERE id=?")
      .get(correction.operationId)!.status,
  ).toBe("RETRYABLE");
  expect((await f.core.pending(f.ctx)).map((r) => r.command.operationId)).toContain(
    correction.operationId,
  );
});
it("P3 instruction transaction atomically rejects stale parent/entry/new-entry bases, mixed target families and missing correction identity", async () => {
  const f = await instructionFixture(),
    append = f.command();
  await f.commit([append]);
  const n = count(f.sql);
  for (const command of [
    f.command(f.draft.itemId, 1),
    correctedInstruction(f, append.target.id, 1),
    correctedInstruction(f, append.target.id, 2, 2),
    correctedInstruction(f, randomUUID(), 2, 1),
  ]) {
    await expect(f.commit([command])).rejects.toThrow();
    expect(count(f.sql)).toBe(n);
  }
});
it("P3 instruction transaction rejects cross-Trip, source-backed/manual laundering, wrong scope and changed original operation", async () => {
  const f = await instructionFixture(),
    append = f.command();
  const n = count(f.sql);
  for (const command of [
    { ...append, tripId: randomUUID() },
    {
      ...append,
      payload: { ...(append.payload as object), sourceRepresentationId: randomUUID() },
    },
    {
      ...append,
      admission: {
        mode: "REVIEWED_SOURCE",
        sourceIntentId: randomUUID(),
        policyVersion: null,
      },
    },
    { ...append, payload: { ...(append.payload as object), section: "DURING" } },
  ]) {
    await expect(f.commit([command])).rejects.toThrow();
    expect(count(f.sql)).toBe(n);
  }
  await f.commit([append]);
  await expect(
    f.commit([
      { ...append, payload: { ...(append.payload as object), body: "Different" } },
    ]),
  ).rejects.toThrow("OPERATION_REUSE_MISMATCH");
  expect(count(f.sql)).toBe(n + 1);
  f.switchAccount();
  await expect(f.commit([f.command()])).rejects.toThrow();
  expect(count(f.sql)).toBe(n + 1);
});
it("P3 instruction transaction rolls back queue and projection for second-write/result failures and account-generation changes", async () => {
  for (const failure of ["write", "result", "generation"] as const) {
    const f = await instructionFixture(),
      a = f.command(),
      b = departure(f.command(f.draft.itemId, 2));
    const n = count(f.sql);
    if (failure === "write") f.failNext(2);
    const result = async () => {
      if (failure === "result") throw Error("TEST_RESULT_FAILURE");
      if (failure === "generation") {
        advanceAccountGeneration();
        advanceAccountGeneration();
      }
      return true;
    };
    await expect(f.commit([a, b], result)).rejects.toThrow();
    expect(count(f.sql)).toBe(n);
    expect((await f.graph()).trip_instruction_entries).toHaveLength(0);
  }
});

function p3TextEdit(f: Awaited<ReturnType<typeof instructionFixture>>, revision = 1) {
  return validateCoreCommand({
    contractVersion: 2,
    intentVersion: 2,
    operationId: randomUUID(),
    tripId: f.tripId,
    command: "SET_ITEM_TEXT",
    target: { kind: "ITEM", id: f.draft.itemId },
    baseVector: [{ kind: "ITEM", id: f.draft.itemId, revision }],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: { title: "Updated Stay" },
  });
}
it("P3 mixed Edit stages parent revisions and commits ITEM plus both section entries once", async () => {
  const f = await instructionFixture(),
    edit = p3TextEdit(f),
    a = f.command(f.draft.itemId, 2),
    raw = f.command(f.draft.itemId, 3);
  const b = validateCoreCommand({
    ...raw,
    payload: {
      ...(raw.payload as object),
      section: "DEPARTURE",
      body: "Leave key at reception.",
    },
  });
  const n = count(f.sql);
  await f.commit([edit, a, b]);
  const graph = await f.graph();
  expect(graph.itinerary_events[0]).toMatchObject({
    title: "Updated Stay",
    semantic_revision: 4,
  });
  expect(graph.trip_instruction_entries.map((r) => r.section).sort()).toEqual([
    "ARRIVAL",
    "DEPARTURE",
  ]);
  expect(count(f.sql)).toBe(n + 3);
  await f.commit([edit, a, b]);
  expect(count(f.sql)).toBe(n + 3);
  expect(
    await f.core.manualInstructionEligibility(f.ctx, f.draft.itemId, a.target.id),
  ).toEqual({ status: "ELIGIBLE" });
});
it("P3 mixed Edit failure at the final Instruction rolls back all ITEM and Queue effects without rebasing", async () => {
  for (const kind of ["stale", "write"] as const) {
    const f = await instructionFixture(),
      edit = p3TextEdit(f),
      a = f.command(f.draft.itemId, 2),
      b = departure(f.command(f.draft.itemId, kind === "stale" ? 2 : 3));
    const before = await f.graph(),
      n = count(f.sql);
    if (kind === "write") f.failNext(3);
    await expect(f.commit([edit, a, b])).rejects.toThrow();
    expect(count(f.sql)).toBe(n);
    expect(await f.graph()).toEqual(before);
  }
});
it("P3 Header Save rejects two writes to the same section without partial intents", async () => {
  const f = await instructionFixture(),
    n = count(f.sql);
  await expect(f.commit([f.command(), f.command(f.draft.itemId, 2)])).rejects.toThrow(
    "MANUAL_BATCH_INVALID",
  );
  expect(count(f.sql)).toBe(n);
  expect((await f.graph()).trip_instruction_entries).toHaveLength(0);
});
it("P3 instruction batch refuses other parents, Create mixed with Append, missing new-entry base and forked correction", async () => {
  const f = await instructionFixture(),
    repo = f.repo(),
    other = await repo.createDraft(f.tripId);
  await repo.save(other, inputFor(other.fields));
  const n = count(f.sql);
  await expect(f.commit([f.command(), f.command(other.itemId)])).rejects.toThrow(
    "MANUAL_BATCH_INVALID",
  );
  const create = (await f.core.pending(f.ctx))[0].command;
  await expect(f.commit([create, f.command()])).rejects.toThrow("MANUAL_BATCH_INVALID");
  expect(count(f.sql)).toBe(n);
  const a = f.command();
  await f.commit([a]);
  await expect(f.commit([f.command(f.draft.itemId, 2)])).rejects.toThrow(
    "MANUAL_INSTRUCTION_UNPROVEN",
  );
  const c = correctedInstruction(f, a.target.id);
  await expect(
    f.commit([
      {
        ...c,
        baseVector: c.baseVector.filter(
          (v) => v.kind !== "INSTRUCTION" || v.id === a.target.id,
        ),
      },
    ]),
  ).rejects.toThrow("INVALID_BASE_VECTOR");
  await f.commit([c]);
  await expect(f.commit([correctedInstruction(f, a.target.id, 3)])).rejects.toThrow(
    "REVISION_CONFLICT",
  );
  expect(count(f.sql)).toBe(n + 2);
});

it("P3 mixed Edit permits the existing five ITEM edits plus two Instruction commands without widening ITEM-only batches", async () => {
  const f = await instructionFixture(),
    graph = await f.graph(),
    row = graph.itinerary_events[0];
  const item = (command: string, revision: number, payload: unknown) =>
    validateCoreCommand({
      contractVersion: 2,
      intentVersion: 2,
      operationId: randomUUID(),
      tripId: f.tripId,
      command,
      target: { kind: "ITEM", id: f.draft.itemId },
      baseVector: [{ kind: "ITEM", id: f.draft.itemId, revision }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload,
    });
  const commands = [
    p3TextEdit(f),
    item("SET_ITEM_SCHEDULE", 2, {
      schedule: {
        start: coreDateBoundary("2026-10-21"),
        end: coreDateBoundary("2026-10-24"),
      },
    }),
    item("SET_ITEM_PLACE", 3, {
      place: Object.fromEntries(
        Object.keys(corePlaceSchema.shape).map((k) => [k, row[k]]),
      ),
    }),
    item("SET_ITEM_PARTICIPATION", 4, {
      participation: { mode: "SELF", people: [], selfPersonId: row.self_person_id },
    }),
    item("SET_STAY_DETAILS", 5, {
      details: { property_name: "Literal property" },
      rooms: [],
    }),
    f.command(f.draft.itemId, 6),
  ];
  const last = f.command(f.draft.itemId, 7);
  commands.push(
    validateCoreCommand({
      ...last,
      payload: { ...(last.payload as object), section: "DEPARTURE" },
    }),
  );
  const n = count(f.sql);
  await f.commit(commands);
  expect(count(f.sql)).toBe(n + 7);
  const after = await f.graph();
  expect(after.itinerary_events[0].semantic_revision).toBe(8);
  expect(after.trip_instruction_entries).toHaveLength(2);
  expect(after.trip_stay_details[0].property_name).toBe("Literal property");
  await expect(
    f.commit(Array.from({ length: 6 }, () => p3TextEdit(f, 8))),
  ).rejects.toThrow("MANUAL_BATCH_INVALID");
  await expect(
    f.commit([
      ...Array.from({ length: 6 }, (_, i) => p3TextEdit(f, 8 + i)),
      f.command(f.draft.itemId, 14),
    ]),
  ).rejects.toThrow("MANUAL_BATCH_INVALID");
  expect(count(f.sql)).toBe(n + 7);
});

it("P3 Header Save appends both typed instructions atomically and reopens through the real SQLite reader", async () => {
  const f = await fixture(),
    repo = f.repo();
  const created = await repo.createDraft(f.tripId);
  await repo.save(created, inputFor(created.fields));
  const draft = await repo.read(f.tripId, created.itemId);
  expect(draft.instructions?.checkInInstruction.editable).toBe(true);
  const fields = {
    ...draft.fields,
    checkInInstruction: "到店按门铃",
    checkOutInstruction: "Leave keys at reception",
  };
  const result = await repo.save(draft, fields);
  expect(result).toMatchObject({ itemId: created.itemId, localStatus: "PENDING" });
  expect(result.operationIds).toHaveLength(2);
  const pending = await f.core.pending(await f.core.captureContext(f.tripId));
  const instructions = pending.filter((r) =>
    result.operationIds.includes(r.command.operationId),
  );
  expect(instructions.map((r) => r.command.command)).toEqual([
    "APPEND_INSTRUCTION",
    "APPEND_INSTRUCTION",
  ]);
  for (const row of instructions) {
    expect(row.command.target.kind).toBe("INSTRUCTION");
    expect(row.command.target.id).not.toBe(created.itemId);
    expect(
      f.sql
        .prepare("SELECT entity_id,status FROM sync_operations WHERE id=?")
        .get(row.command.operationId),
    ).toMatchObject({ entity_id: row.command.target.id, status: "DEPENDENCY_BLOCKED" });
  }
  const reopenedRepo = f.repo();
  const reopened = await reopenedRepo.read(f.tripId, created.itemId);
  expect(reopened.fields).toMatchObject(fields);
  expect(reopened.instructions?.checkInInstruction.editable).toBe(true);
  // Original Header Save retry preserves the exact two operations and queue rows.
  expect(await repo.save(draft, fields)).toEqual(result);
  expect((await f.core.pending(await f.core.captureContext(f.tripId))).length).toBe(3);
  const oldId = reopened.instructions!.checkInInstruction.entries[0].entryId;
  const corrected = await reopenedRepo.save(reopened, {
    ...reopened.fields,
    checkInInstruction: "Use the side door",
  });
  expect(corrected.operationIds).toHaveLength(1);
  const correction = (await f.core.pending(await f.core.captureContext(f.tripId))).find(
    (r) => r.command.operationId === corrected.operationIds[0],
  )!.command;
  expect(correction).toMatchObject({
    command: "CORRECT_INSTRUCTION",
    target: { kind: "INSTRUCTION", id: oldId },
  });
  const latest = await f.repo().read(f.tripId, created.itemId);
  expect(latest.fields.checkInInstruction).toBe("Use the side door");
  expect(latest.instructions!.checkInInstruction.entries[0].supersedesId).toBe(oldId);
});
it("P3 mixed Header Save stages five ITEM edits and two Instructions in one owning SQLite transaction", async () => {
  const f = await fixture(),
    repo = f.repo();
  const created = await repo.createDraft(f.tripId);
  await repo.save(created, inputFor(created.fields));
  const draft = await repo.read(f.tripId, created.itemId);
  const fields = {
    ...draft.fields,
    title: "Updated stay",
    startDate: "2026-10-21",
    endDate: "2026-10-24",
    location: "New location",
    description: "Updated note",
    participation: {
      mode: "SELECTED_MEMBERS" as const,
      people: [draft.participantOptions[0].personId],
      selfPersonId: null,
    },
    stayDetails: { ...draft.fields.stayDetails, propertyName: "Confirmed property" },
    checkInInstruction: "Reception",
    checkOutInstruction: "Key box",
  };
  const before = count(f.sql);
  f.failNext(7);
  await expect(repo.save(draft, fields)).rejects.toThrow("TEST_WRITE_FAILURE");
  expect(count(f.sql)).toBe(before);
  expect((await f.repo().read(f.tripId, created.itemId)).fields.title).toBe(
    draft.fields.title,
  );
  f.failNext(0);
  const result = await repo.save(draft, fields);
  expect(result.operationIds).toHaveLength(7);
  expect(count(f.sql)).toBe(Number(before) + 7);
  const reopened = await f.repo().read(f.tripId, created.itemId);
  expect(reopened.fields).toEqual(fields);
  const pending = (await f.core.pending(await f.core.captureContext(f.tripId))).filter(
    (r) => result.operationIds.includes(r.command.operationId),
  );
  expect(
    pending.map((r) => r.command.baseVector.find((b) => b.kind === "ITEM")!.revision),
  ).toEqual([1, 2, 3, 4, 5, 6, 7]);
});
it("P3 Header Save keeps blank/omitted instructions, rejects stale drafts and never adds instructions during Create", async () => {
  const f = await fixture(),
    repo = f.repo();
  const created = await repo.createDraft(f.tripId);
  await expect(
    repo.save(created, {
      ...inputFor(created.fields),
      checkInInstruction: "Unapproved create input",
    }),
  ).rejects.toThrow("EDIT_ONLY");
  await repo.save(created, inputFor(created.fields));
  const initial = await repo.read(f.tripId, created.itemId);
  await repo.save(initial, {
    ...initial.fields,
    checkInInstruction: "Existing guidance",
  });
  const current = await repo.read(f.tripId, created.itemId);
  const before = count(f.sql);
  await repo.save(current, {
    ...current.fields,
    checkInInstruction: "   ",
    checkOutInstruction: undefined,
  });
  expect(count(f.sql)).toBe(before);
  expect((await repo.read(f.tripId, created.itemId)).fields.checkInInstruction).toBe(
    "Existing guidance",
  );
  const stale = await repo.read(f.tripId, created.itemId);
  const other = await repo.read(f.tripId, created.itemId);
  await repo.save(other, { ...other.fields, description: "Concurrent change" });
  await expect(
    repo.save(stale, { ...stale.fields, checkInInstruction: "Stale replacement" }),
  ).rejects.toThrow("MANUAL_PLAN_CONFLICT");
});

it("normal P3 Edit does not infer correction eligibility from a source reference redacted by the actual Reader", async () => {
  const sourceId = randomUUID();
  const f = await freshAcceptedFixture((graph) => {
    const parent = graph.itinerary_events[0];
    graph.trip_instruction_entries.push({
      id: randomUUID(),
      trip_id: parent.trip_id,
      revision: 1,
      owner_account_id: parent.owner_account_id,
      visibility: "GROUP",
      hidden_at: null,
      created_at: parent.created_at,
      updated_at: parent.updated_at,
      field_state: {},
      event_id: parent.id,
      section: "ARRIVAL",
      body: "Evidence-bound reception guidance",
      sensitivity: "NORMAL",
      supersedes_id: null,
      source_representation_id: sourceId,
    });
  });
  const repo = f.repo();
  const draft = await repo.read(f.tripId, f.itemId);
  expect(draft.fields.checkInInstruction).toBe("Evidence-bound reception guidance");
  expect(
    draft.instructions!.checkInInstruction.entries[0].sourceRepresentationId,
  ).toBeNull();
  expect(draft.instructions!.checkInInstruction.editable).toBe(false);
  await expect(
    repo.save(draft, {
      ...draft.fields,
      checkInInstruction: "Replace redacted-source head",
    }),
  ).rejects.toThrow("READ_ONLY");
  expect(count(f.sql)).toBe(0);
  const keep = await repo.save(draft, {
    ...draft.fields,
    description: "Independent user note",
  });
  expect(keep.operationIds).toHaveLength(1);
  const command = (await f.core.pending(await f.core.captureContext(f.tripId)))[0]
    .command;
  expect(command.command).toBe("SET_ITEM_TEXT");
  expect(
    (await f.core.acceptedSnapshot(await f.core.captureContext(f.tripId)))!.graph
      .trip_instruction_entries[0].body,
  ).toBe("Evidence-bound reception guidance");
});
