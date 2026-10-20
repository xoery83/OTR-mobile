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
  createManualRentalRepository,
  type ManualRentalFields,
} from "./manualRentalRepository";
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
  const repo = () => createManualRentalRepository(database, identity, core, clock);
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
const inputFor = (fields: ManualRentalFields): ManualRentalFields => ({
  ...fields,
  title: "Nelson rental",
  startDate: "2026-10-20",
  startTime: "09:00",
  endDate: "2026-10-23",
  endTime: "17:00",
  pickupLocation: "Nelson Airport",
  returnLocation: "City rental office",
  description: "Bring the rental agreement",
});
const count = (sql: DatabaseSync) =>
  sql.prepare("SELECT COUNT(*) n FROM trip_core_pending_intents").get()!.n;
it("creates one MANUAL vehicle, cold reads true Rental fields/Notes, and only Pickup/Return resolve the same ID", async () => {
  const f = await fixture(),
    repo = f.repo(),
    d = await repo.createDraft(f.tripId);
  expect(d.participantOptions).toEqual([]);
  const input = inputFor(d.fields),
    saved = await repo.save(d, input);
  expect(saved).toMatchObject({ localStatus: "PENDING", itemId: d.itemId });
  expect(saved.operationIds).toHaveLength(1);
  expect((await f.repo().read(f.tripId, d.itemId)).fields).toEqual(input);
  const local = (await f.read(f.tripId))!;
  expect(local.items[0]).toMatchObject({
    itemId: d.itemId,
    family: "P4",
    title: input.title,
    description: input.description,
    localState: "PENDING",
  });
  expect(local.items[0].details).toMatchObject({
    pickupPlace: { authoredLabel: input.pickupLocation },
    returnPlace: { authoredLabel: input.returnLocation },
  });
  expect(local.items[0].details).not.toHaveProperty("supplier");
  expect(
    local.rows(input.startDate).map((r) => [r.itemRef, r.rowKey.projectionRole]),
  ).toEqual([[d.itemId, "PICKUP"]]);
  expect(local.rows("2026-10-21")).toEqual([]);
  expect(local.rows("2026-10-22")).toEqual([]);
  expect(
    local.rows(input.endDate).map((r) => [r.itemRef, r.rowKey.projectionRole]),
  ).toEqual([[d.itemId, "RETURN"]]);
  expect((await f.days.trip(f.tripId)).localManual?.items[0].itemId).toBe(d.itemId);
  expect(
    f.sql.prepare("SELECT COUNT(*) n FROM trip_core_read_certificates").get()!.n,
  ).toBe(0);
  expect(
    f.sql
      .prepare("SELECT start_date,end_date FROM local_trip_containers WHERE id=?")
      .get(f.tripId),
  ).toEqual({ start_date: "2026-12-30", end_date: "2027-04-28" });
});
it("same-ID Rental edit uses three ordered atomic commands and exact retry; vehicle facts never rename title", async () => {
  const f = await fixture(),
    repo = f.repo(),
    d = await repo.createDraft(f.tripId);
  await repo.save(d, inputFor(d.fields));
  const edit = await repo.read(f.tripId, d.itemId);
  const fields: ManualRentalFields = {
    ...edit.fields,
    title: "Family car",
    startDate: "2026-10-21",
    pickupLocation: "Other pickup office",
    returnLocation: "Other return office",
    rentalDetails: {
      supplier: "Local rental",
      reservedCategory: "SUV",
      orSimilar: true,
      actualVehicleModel: "Chosen model",
      verifiedPlate: "TEST123",
    },
  };
  const saved = await repo.save(edit, fields);
  expect(saved.operationIds).toHaveLength(3);
  expect(await repo.save(edit, fields)).toEqual(saved);
  expect(count(f.sql)).toBe(4);
  expect((await f.repo().read(f.tripId, d.itemId)).fields).toEqual(fields);
  expect(
    f.sql
      .prepare(
        "SELECT canonical_intent_text FROM trip_core_pending_intents ORDER BY created_at,operation_id",
      )
      .all()
      .map((r) => JSON.parse(String(r.canonical_intent_text)).command),
  ).toEqual(["CREATE_ITEM", "SET_ITEM_TEXT", "SET_ITEM_SCHEDULE", "SET_RENTAL_DETAILS"]);
  const item = (await f.read(f.tripId))!.items[0];
  expect(item.title).toBe("Family car");
  expect(item.details).toMatchObject(fields.rentalDetails);
  await expect(repo.save(edit, { ...fields, title: "Changed retry" })).rejects.toThrow(
    "DRAFT_FROZEN",
  );
});
it("rolls back a late Rental detail write including earlier text/schedule/queue changes, then exact retry succeeds", async () => {
  const f = await fixture(),
    repo = f.repo(),
    d = await repo.createDraft(f.tripId);
  await repo.save(d, inputFor(d.fields));
  const edit = await repo.read(f.tripId, d.itemId),
    before = f.sql.prepare("SELECT * FROM sync_operations ORDER BY id").all();
  const fields = {
    ...edit.fields,
    title: "Renamed rental",
    startTime: "10:00",
    returnLocation: "New return",
  };
  f.failNext(3);
  await expect(repo.save(edit, fields)).rejects.toThrow("TEST_WRITE_FAILURE");
  expect(count(f.sql)).toBe(1);
  expect(f.sql.prepare("SELECT * FROM sync_operations ORDER BY id").all()).toEqual(
    before,
  );
  expect((await f.repo().read(f.tripId, d.itemId)).fields).toEqual(edit.fields);
  f.failNext(0);
  expect((await repo.save(edit, fields)).operationIds).toHaveLength(3);
  expect((await f.repo().read(f.tripId, d.itemId)).fields).toEqual(fields);
});
it("requires Name, both dates/clocks/manual places and ordered range without requiring a point", async () => {
  const f = await fixture(),
    repo = f.repo(),
    d = await repo.createDraft(f.tripId),
    input = inputFor(d.fields);
  for (const invalid of [
    { title: "" },
    { startDate: "2026-02-30" },
    { endDate: "" },
    { startTime: "" },
    { endTime: "" },
    { pickupLocation: " " },
    { returnLocation: "" },
    { endDate: "2026-10-19" },
    { endDate: input.startDate, endTime: "08:59" },
  ])
    await expect(repo.save(d, { ...input, ...invalid })).rejects.toThrow();
  expect(count(f.sql)).toBe(0);
  await repo.save(d, { ...input, endDate: input.startDate, endTime: input.startTime });
  const rows = (await f.read(f.tripId))!.rows(input.startDate);
  expect(rows.map((r) => r.rowKey.projectionRole)).toEqual(["PICKUP", "RETURN"]);
});
it("keeps two identical rentals independent by Item ID and never manufactures Booking/holder/driver identities", async () => {
  const f = await fixture(),
    repo = f.repo(),
    a = await repo.createDraft(f.tripId),
    b = await repo.createDraft(f.tripId);
  await repo.save(a, inputFor(a.fields));
  await expect(repo.save(b, inputFor(b.fields))).rejects.toThrow("CONFLICT");
  const fresh = await repo.createDraft(f.tripId);
  await repo.save(fresh, inputFor(fresh.fields));
  const local = (await f.read(f.tripId))!;
  expect(new Set(local.items.map((i) => i.itemId)).size).toBe(2);
  expect(local.items.every((i) => i.bookingSummaries.length === 0)).toBe(true);
  expect(local.rows("2026-10-20").map((r) => r.itemRef)).toEqual(
    expect.arrayContaining([a.itemId, fresh.itemId]),
  );
});
it("retains unchanged endpoint seconds, full spatial facts and independent vehicle data through title/date-only edits", async () => {
  const f = await fixture(),
    repo = f.repo(),
    d = await repo.createDraft(f.tripId);
  const input = inputFor(d.fields);
  input.rentalDetails = {
    supplier: "Supplier",
    reservedCategory: "Compact",
    orSimilar: false,
    actualVehicleModel: "Actual",
    verifiedPlate: "TEST42",
  };
  await repo.save(d, input);
  const ctx = await f.core.captureContext(f.tripId);
  const boundary = (date: string, time: string) => ({
    ...coreDateBoundary(date),
    local_time: time,
    clock_precision: 0,
    quality: "ESTIMATED",
  });
  await f.core.enqueue(ctx, {
    contractVersion: 2,
    intentVersion: 2,
    operationId: randomUUID(),
    tripId: f.tripId,
    command: "SET_ITEM_SCHEDULE",
    target: { kind: "ITEM", id: d.itemId },
    baseVector: [{ kind: "ITEM", id: d.itemId, revision: 1 }],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: {
      schedule: {
        start: boundary(input.startDate, "09:00:37"),
        end: boundary(input.endDate, "17:00:42"),
      },
    },
  });
  const place = corePlaceSchema.parse(
    Object.fromEntries(Object.keys(corePlaceSchema.shape).map((k) => [k, null])),
  );
  const pickup = {
    ...place,
    authored_label: input.pickupLocation,
    authored_address: "Original address",
    accepted_address: "Retained point address",
    accepted_latitude: -41.27,
    accepted_longitude: 173.28,
    location_input_revision: 1,
    spatial_provenance_refs: { retained: "fixture-original-reference" },
  };
  const back = {
    ...place,
    authored_label: input.returnLocation,
    authored_text: "Return at rear counter",
  };
  await f.core.enqueue(ctx, {
    contractVersion: 2,
    intentVersion: 2,
    operationId: randomUUID(),
    tripId: f.tripId,
    command: "SET_RENTAL_DETAILS",
    target: { kind: "ITEM", id: d.itemId },
    baseVector: [{ kind: "ITEM", id: d.itemId, revision: 2 }],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: { details: {}, places: { pickup, return: back } },
  });
  const before = f.sql
    .prepare(
      "SELECT canonical_intent_text FROM trip_core_pending_intents ORDER BY created_at,operation_id",
    )
    .all();
  const edit = await repo.read(f.tripId, d.itemId);
  await repo.save(edit, { ...edit.fields, title: "New title", startDate: "2026-10-21" });
  const cold = await f.repo().read(f.tripId, d.itemId);
  expect(cold.fields.rentalDetails).toEqual(input.rentalDetails);
  const after = f.sql
    .prepare(
      "SELECT canonical_intent_text FROM trip_core_pending_intents ORDER BY created_at,operation_id",
    )
    .all();
  expect(after.slice(0, before.length)).toEqual(before);
  const command = JSON.parse(String(after.at(-1)!.canonical_intent_text));
  expect(command.command).toBe("SET_ITEM_SCHEDULE");
  expect(command.payload.schedule.start).toMatchObject({
    local_time: "09:00:37",
    clock_precision: 0,
    instant: null,
    supplied_offset_seconds: null,
  });
  expect(command.payload.schedule.end).toMatchObject({
    local_time: "17:00:42",
    clock_precision: 0,
  });
  const original = await repo.read(f.tripId, d.itemId);
  await repo.save(original, {
    ...original.fields,
    rentalDetails: {
      ...original.fields.rentalDetails,
      actualVehicleModel: "New actual model",
    },
  });
  const item = (await f.read(f.tripId))!.items[0];
  expect(item.details.pickupPlace).toMatchObject({
    authoredAddress: pickup.authored_address,
    acceptedAddress: pickup.accepted_address,
    latitude: pickup.accepted_latitude,
    longitude: pickup.accepted_longitude,
  });
  const current = await f.core.manualReadSnapshot(ctx, {
    accountId: f.originalAccount,
    tripId: f.tripId,
    active: true,
    canManageShared: true,
    personId: original.participantOptions[0]?.personId ?? null,
    personIds: [],
  });
  expect(current.graph.trip_rental_places.find((p) => p.role === "PICKUP")).toMatchObject(
    pickup,
  );
  expect(current.graph.trip_rental_places.find((p) => p.role === "RETURN")).toMatchObject(
    back,
  );
  const changedPickup = await repo.read(f.tripId, d.itemId);
  await repo.save(changedPickup, {
    ...changedPickup.fields,
    pickupLocation: "New manual pickup",
  });
  const refreshed = await f.core.manualReadSnapshot(ctx, {
    accountId: f.originalAccount,
    tripId: f.tripId,
    active: true,
    canManageShared: true,
    personId: null,
    personIds: [],
  });
  expect(
    refreshed.graph.trip_rental_places.find((p) => p.role === "PICKUP"),
  ).toMatchObject({
    authored_label: "New manual pickup",
    accepted_latitude: null,
    accepted_longitude: null,
    spatial_provenance_refs: null,
  });
  expect(
    refreshed.graph.trip_rental_places.find((p) => p.role === "RETURN"),
  ).toMatchObject(back);
});
it("rejects changed participation, stale drafts, revoked/account/ABA and foreign target without writes", async () => {
  const f = await fixture(),
    repo = f.repo(),
    d = await repo.createDraft(f.tripId),
    input = inputFor(d.fields);
  await expect(
    repo.save(d, {
      ...input,
      participation: {
        mode: "SELECTED_MEMBERS",
        people: [randomUUID()],
        selfPersonId: null,
      },
    }),
  ).rejects.toThrow("PARTICIPATION_UNAVAILABLE");
  expect(count(f.sql)).toBe(0);
  await repo.save(d, input);
  const a = await repo.read(f.tripId, d.itemId),
    b = await repo.read(f.tripId, d.itemId);
  await repo.save(b, { ...b.fields, description: "New notes" });
  await expect(repo.save(a, { ...a.fields, title: "Stale" })).rejects.toThrow("CONFLICT");
  const n = count(f.sql);
  await expect(repo.read(f.tripId, randomUUID())).rejects.toThrow("UNAVAILABLE");
  const current = await repo.read(f.tripId, d.itemId);
  await f.core.revoke(await f.core.captureContext(f.tripId), 1);
  await expect(repo.save(current, current.fields)).rejects.toThrow("REVOKED");
  expect(count(f.sql)).toBe(n);
  const g = await fixture(),
    r = g.repo(),
    fresh = await r.createDraft(g.tripId);
  g.switchAccount();
  await expect(r.save(fresh, inputFor(fresh.fields))).rejects.toThrow("Account changed");
  expect(count(g.sql)).toBe(0);
  const h = await fixture(),
    hr = h.repo(),
    hd = await hr.createDraft(h.tripId);
  h.aba();
  await expect(hr.save(hd, inputFor(hd.fields))).rejects.toThrow();
  expect(count(h.sql)).toBe(0);
});
