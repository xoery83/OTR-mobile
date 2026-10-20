import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { migrations } from "../db/migrations";
import { serializeDatabaseTransactions } from "../db/databaseConnection";
import { advanceAccountGeneration } from "../auth/accountGeneration";
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
  const cold = await f.repo().read(f.tripId, draft.itemId);
  expect(cold.fields).toEqual({
    ...input,
    stayDetails: { ...input.stayDetails, propertyName: input.title },
  });
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
it("same-ID five-field edit is ordered, updates the linked manual name and has an exact repeat outcome", async () => {
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
  expect(cold.fields).toEqual({
    ...fields,
    stayDetails: { ...fields.stayDetails, propertyName: fields.title },
  });
  expect(cold.fields.stayDetails.propertyName).toBe("Guesthouse stay");
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
it.each(["Original property name", "Private stay label"])(
  "legacy Stay rooms and unchanged detail seconds survive a title/details edit for %s",
  async (propertyName) => {
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
          property_name: propertyName,
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
      property_name:
        propertyName === "Private stay label" ? "New display label" : propertyName,
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
  },
);
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
it("stays finite to P1/P3: P3 editor rejects an existing Plan and atomic batch rejects a valid Rental command without writing", async () => {
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
  const rental = {
    ...original,
    operationId: randomUUID(),
    target: { kind: "ITEM", id: other },
    baseVector: [{ kind: "ITEM", id: other, revision: null }],
    payload: { ...original.payload, family: "P4" },
  };
  const n = count(f.sql);
  await expect(
    f.core.commitManualBatch(await f.core.captureContext(f.tripId), async () => ({
      commands: [rental],
      result: async () => true,
    })),
  ).rejects.toThrow("MANUAL_BATCH_INVALID");
  expect(count(f.sql)).toBe(n);
});

it("finite batch rejects SET on an existing P4 target while the original generic enqueue remains unchanged", async () => {
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
      family: "P4",
      core: { title: "Rental" },
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
    payload: { title: "New rental label" },
  };
  const before = f.sql.prepare("SELECT * FROM sync_operations ORDER BY id").all();
  await expect(
    f.core.commitManualBatch(ctx, async () => ({
      commands: [command],
      result: async () => true,
    })),
  ).rejects.toThrow("MANUAL_BATCH_INVALID");
  expect(count(f.sql)).toBe(1);
  expect(f.sql.prepare("SELECT * FROM sync_operations ORDER BY id").all()).toEqual(
    before,
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

it("renames the persisted MANUAL Create name alias atomically, cold reads it and retries the same two IDs", async () => {
  const f = await fixture(),
    repo = f.repo(),
    d = await repo.createDraft(f.tripId);
  await repo.save(d, inputFor(d.fields));
  const edit = await f.repo().read(f.tripId, d.itemId);
  const owner = f.repo();
  const coldEdit = await owner.read(f.tripId, d.itemId);
  const input = { ...coldEdit.fields, title: "Harbour guesthouse" };
  f.failNext(2);
  await expect(owner.save(coldEdit, input)).rejects.toThrow("TEST_WRITE_FAILURE");
  expect(count(f.sql)).toBe(1);
  expect((await f.repo().read(f.tripId, d.itemId)).fields.title).toBe(edit.fields.title);
  f.failNext(0);
  const saved = await owner.save(coldEdit, input);
  expect(saved.operationIds).toHaveLength(2);
  expect(await owner.save(coldEdit, input)).toEqual(saved);
  expect(count(f.sql)).toBe(3);
  const cold = await f.repo().read(f.tripId, d.itemId);
  expect(cold.fields).toMatchObject({
    title: input.title,
    stayDetails: { propertyName: input.title },
  });
  const nextOwner = f.repo(),
    next = await nextOwner.read(f.tripId, d.itemId);
  await nextOwner.save(next, { ...next.fields, title: "Second explicit name" });
  expect((await f.repo().read(f.tripId, d.itemId)).fields.stayDetails.propertyName).toBe(
    "Second explicit name",
  );
});
it("does not relink an independently changed property even when title later matches it", async () => {
  const f = await fixture(),
    repo = f.repo(),
    d = await repo.createDraft(f.tripId);
  await repo.save(d, inputFor(d.fields));
  let edit = await repo.read(f.tripId, d.itemId);
  await repo.save(edit, {
    ...edit.fields,
    stayDetails: { ...edit.fields.stayDetails, propertyName: "Independent property" },
  });
  edit = await repo.read(f.tripId, d.itemId);
  await repo.save(edit, { ...edit.fields, title: "Independent property" });
  edit = await repo.read(f.tripId, d.itemId);
  await repo.save(edit, { ...edit.fields, title: "New display name" });
  expect((await f.repo().read(f.tripId, d.itemId)).fields.stayDetails.propertyName).toBe(
    "Independent property",
  );
});
it("retains an explicitly edited independent property and unchanged permitted clocks on rename", async () => {
  const f = await fixture(),
    repo = f.repo(),
    d = await repo.createDraft(f.tripId);
  const input = inputFor(d.fields);
  input.stayDetails = {
    ...input.stayDetails,
    permittedCheckinFrom: "14:00",
    permittedCheckinUntil: "02:00",
    permittedCheckoutBy: "10:00",
  };
  await repo.save(d, input);
  const edit = await repo.read(f.tripId, d.itemId);
  const changed = {
    ...edit.fields,
    title: "Personal stay label",
    stayDetails: { ...edit.fields.stayDetails, propertyName: "Explicit property name" },
  };
  await repo.save(edit, changed);
  expect((await f.repo().read(f.tripId, d.itemId)).fields).toEqual(changed);
});
