import { createManualStayRepository } from "./manualStayRepository";
import { p1CivilMoveItem, p1CivilProposal } from "@/features/day-feed/p1CivilMove";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { migrations } from "../db/migrations";
import { serializeDatabaseTransactions } from "../db/databaseConnection";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { createTripCoreV2Repository, type CoreDatabase } from "./tripCoreV2Repository";
import { createTripRepository } from "./tripRepository";
import { createLocalTripPersonRepository } from "./localTripPersonRepository";
import { createTripPersonRepository } from "./tripPersonRepository";
import { createTripLocalManualReader } from "./tripLocalManualReadRepository";
import { createTripDayFeedReader } from "./tripDayFeedRepository";
import {
  createManualPlanRepository,
  type ManualPlanFields,
} from "./manualPlanRepository";
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
async function fixture(structured = false) {
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
    ...(structured ? { syncFormatVersion: 2 as const, destinations: [] } : {}),
    destination: null,
    startDate: "2026-12-30",
    endDate: "2027-04-28",
  });
  const repo = () => createManualPlanRepository(database, identity, core, clock);
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
const values = (
  fields: ManualPlanFields,
  title = "Botanic garden",
): ManualPlanFields => ({
  ...fields,
  title,
  startDate: "2026-10-20",
  location: "Nelson gardens",
  description: "Meet at the gate",
});
const count = (sql: DatabaseSync) =>
  sql.prepare("SELECT COUNT(*) n FROM trip_core_pending_intents").get()!.n;

it("normal P1 Create persists rich date-only MANUAL fields and reads the same Item via normal Day without changing Trip dates", async () => {
  const f = await fixture(),
    repo = f.repo(),
    draft = await repo.createDraft(f.tripId);
  const input = values(draft.fields);
  const result = await repo.save(draft, input);
  expect(result).toMatchObject({ localStatus: "PENDING", itemId: draft.itemId });
  expect(result.operationIds).toHaveLength(1);
  const local = (await f.read(f.tripId))!;
  expect(local.items[0]).toMatchObject({
    itemId: draft.itemId,
    title: input.title,
    localState: "PENDING",
  });
  expect(local.rows(input.startDate)[0]).toMatchObject({
    itemRef: draft.itemId,
    localState: "PENDING",
  });
  const day = await f.days.trip(f.tripId);
  expect(day.observed).toBeNull();
  expect(day.localManual?.items[0].itemId).toBe(draft.itemId);
  const reopened = await f.repo().read(f.tripId, draft.itemId);
  expect(reopened.fields).toEqual(input);
  expect(
    f.sql
      .prepare("SELECT start_date,end_date FROM local_trip_containers WHERE id=?")
      .get(f.tripId),
  ).toEqual({ start_date: "2026-12-30", end_date: "2027-04-28" });
  expect(
    f.sql.prepare("SELECT COUNT(*) n FROM trip_core_read_certificates").get()!.n,
  ).toBe(0);
});

it("ordered same-ID multi-field edit is atomic, revision-CASed and cold-reader recoverable with no fake certificate", async () => {
  const f = await fixture(),
    repo = f.repo(),
    create = await repo.createDraft(f.tripId);
  await repo.save(create, values(create.fields));
  const originalCreate = f.sql
    .prepare("SELECT canonical_intent_text FROM trip_core_pending_intents")
    .get();
  const draft = await repo.read(f.tripId, create.itemId);
  const self = draft.participantOptions[0].personId;
  const changed = {
    ...draft.fields,
    title: "Garden lunch",
    startDate: "2026-10-21",
    startTime: "10:00",
    endDate: "2026-10-21",
    endTime: "11:00",
    location: "Garden cafe",
    description: "Bring water",
    participation: {
      mode: "SELECTED_MEMBERS" as const,
      people: [self],
      selfPersonId: null,
    },
  };
  const result = await repo.save(draft, changed);
  expect(result.itemId).toBe(create.itemId);
  expect(result.operationIds).toHaveLength(4);
  const rows = f.sql
    .prepare(
      "SELECT canonical_intent_text FROM trip_core_pending_intents ORDER BY created_at,operation_id",
    )
    .all();
  expect(rows[0]).toEqual(originalCreate);
  expect(rows.map((r) => JSON.parse(String(r.canonical_intent_text)).command)).toEqual([
    "CREATE_ITEM",
    "SET_ITEM_TEXT",
    "SET_ITEM_SCHEDULE",
    "SET_ITEM_PLACE",
    "SET_ITEM_PARTICIPATION",
  ]);
  expect(
    rows
      .slice(1)
      .map((r) => JSON.parse(String(r.canonical_intent_text)).baseVector[0].revision),
  ).toEqual([1, 2, 3, 4]);
  const queued = f.sql
    .prepare(
      "SELECT payload_json FROM sync_operations WHERE operation_type='CORE_V2_COMMAND' ORDER BY created_at,id",
    )
    .all();
  expect(queued.map((r) => r.payload_json)).toEqual(
    rows.map((r) => r.canonical_intent_text),
  );
  const cold = await f.repo().read(f.tripId, create.itemId);
  expect(cold.fields).toEqual(changed);
  const local = (await f.read(f.tripId))!;
  expect(local.items[0]).toMatchObject({ itemId: create.itemId, itemRevision: 5 });
  expect(local.rows("2026-10-20")).toEqual([]);
  expect(local.rows("2026-10-21")[0].itemRef).toBe(create.itemId);
  const schedule = JSON.parse(String(rows[2].canonical_intent_text)).payload.schedule;
  expect(schedule.start).toMatchObject({
    local_time: "10:00",
    clock_precision: -1,
    quality: "ESTIMATED",
    instant: null,
    zone_id: null,
    interpretation_key: null,
  });
  expect(
    f.sql.prepare("SELECT COUNT(*) n FROM trip_core_read_certificates").get()!.n,
  ).toBe(0);
});

it("Cancel writes nothing, unknown-success retry uses identical IDs/fields, changed retry is rejected", async () => {
  const f = await fixture(),
    repo = f.repo();
  await repo.createDraft(f.tripId);
  expect(count(f.sql)).toBe(0);
  const draft = await repo.createDraft(f.tripId),
    input = values(draft.fields);
  const first = await repo.save(draft, input);
  expect(await repo.save(draft, input)).toEqual(first);
  expect(count(f.sql)).toBe(1);
  await expect(repo.save(draft, { ...input, title: "Other answer" })).rejects.toThrow(
    "DRAFT_FROZEN",
  );
  expect(count(f.sql)).toBe(1);
});

it("second write failure rolls back the complete edit and exact retry retains operation IDs", async () => {
  const f = await fixture(),
    repo = f.repo(),
    create = await repo.createDraft(f.tripId);
  await repo.save(create, values(create.fields));
  const draft = await repo.read(f.tripId, create.itemId),
    changed = {
      ...draft.fields,
      title: "New name",
      startDate: "2026-10-22",
      location: "New place",
    };
  const before = f.sql.prepare("SELECT * FROM sync_operations ORDER BY id").all();
  f.failNext(2);
  await expect(repo.save(draft, changed)).rejects.toThrow("TEST_WRITE_FAILURE");
  expect(count(f.sql)).toBe(1);
  expect(f.sql.prepare("SELECT * FROM sync_operations ORDER BY id").all()).toEqual(
    before,
  );
  expect((await f.repo().read(f.tripId, create.itemId)).fields.title).toBe(
    create.fields.title || "Botanic garden",
  );
  await expect(
    repo.save(draft, { ...changed, title: "Changed after failure" }),
  ).rejects.toThrow("DRAFT_FROZEN");
  f.failNext(0);
  const saved = await repo.save(draft, changed);
  expect(saved.operationIds).toHaveLength(3);
  expect(await repo.save(draft, changed)).toEqual(saved);
});

it("stale edit conflicts instead of overwriting newer data; foreign person cannot be selected", async () => {
  const f = await fixture(),
    repo = f.repo(),
    d = await repo.createDraft(f.tripId);
  await repo.save(d, values(d.fields));
  const a = await repo.read(f.tripId, d.itemId),
    b = await repo.read(f.tripId, d.itemId);
  await repo.save(b, { ...b.fields, title: "Current" });
  await expect(repo.save(a, { ...a.fields, title: "Stale" })).rejects.toThrow(
    "MANUAL_PLAN_CONFLICT",
  );
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
});

it("account switch, account ABA and revocation all reject without writes", async () => {
  const f = await fixture(),
    repo = f.repo(),
    draft = await repo.createDraft(f.tripId);
  f.aba();
  await expect(repo.save(draft, values(draft.fields))).rejects.toThrow("Account changed");
  expect(count(f.sql)).toBe(0);
  const next = await repo.createDraft(f.tripId);
  f.switchAccount();
  await expect(repo.save(next, values(next.fields))).rejects.toThrow("Account changed");
  expect(count(f.sql)).toBe(0);
  const g = await fixture(),
    r = g.repo(),
    d = await r.createDraft(g.tripId);
  await g.core.revoke(await g.core.captureContext(g.tripId), 1);
  await expect(r.save(d, values(d.fields))).rejects.toThrow("CORE_ACCESS_REVOKED");
  expect(count(g.sql)).toBe(0);
});

it("invalid dates/clocks and unknown target cannot save; same-ID canceled Item cannot be revived by Form", async () => {
  const f = await fixture(),
    repo = f.repo(),
    draft = await repo.createDraft(f.tripId);
  await expect(
    repo.save(draft, { ...values(draft.fields), startDate: "" }),
  ).rejects.toThrow();
  await expect(
    repo.save(draft, { ...values(draft.fields), startTime: "25:00" }),
  ).rejects.toThrow();
  await expect(
    repo.save(draft, { ...values(draft.fields), endDate: "2026-10-19" }),
  ).rejects.toThrow();
  await expect(repo.read(f.tripId, randomUUID())).rejects.toThrow(
    "MANUAL_PLAN_UNAVAILABLE",
  );
  expect(count(f.sql)).toBe(0);
  await repo.save(draft, values(draft.fields));
  // The upstream strict projection may become hidden/canceled between openings.
  for (const change of [{ status: "cancelled" }, { hidden_at: "2026-10-20T00:00:00Z" }]) {
    const guarded = createManualPlanRepository(f.coreDatabase, f.identity, {
      ...f.core,
      manualReadSnapshot: async (...args) => {
        const snapshot = await f.core.manualReadSnapshot(...args);
        Object.assign(
          snapshot.graph.itinerary_events.find((r) => r.id === draft.itemId)!,
          change,
        );
        return snapshot;
      },
    });
    await expect(guarded.read(f.tripId, draft.itemId)).rejects.toThrow(
      "MANUAL_PLAN_UNAVAILABLE",
    );
  }
});

it("unchanged edit is a verified no-write result; clearing an end boundary really removes its old date/clock", async () => {
  const f = await fixture(),
    repo = f.repo(),
    draft = await repo.createDraft(f.tripId);
  await repo.save(draft, {
    ...values(draft.fields),
    startTime: "08:00",
    endDate: "2026-10-20",
    endTime: "09:00",
  });
  const edit = await repo.read(f.tripId, draft.itemId),
    n = count(f.sql);
  expect((await repo.save(edit, edit.fields)).operationIds).toEqual([]);
  expect(count(f.sql)).toBe(n);
  const clear = await repo.read(f.tripId, draft.itemId);
  await repo.save(clear, { ...clear.fields, endDate: null, endTime: null });
  expect((await f.repo().read(f.tripId, draft.itemId)).fields).toMatchObject({
    endDate: null,
    endTime: null,
  });
});

it("has no public transaction-bypass writer and rolls back an intent when the owning batch queue write fails", async () => {
  const f = await fixture(),
    repo = f.repo(),
    draft = await repo.createDraft(f.tripId);
  expect(f.core).not.toHaveProperty("enqueueWithinTransaction");
  const before = f.sql.prepare("SELECT * FROM sync_operations ORDER BY id").all();
  f.sql.exec(`CREATE TEMP TRIGGER fail_core_queue BEFORE INSERT ON sync_operations
    WHEN NEW.operation_type='CORE_V2_COMMAND'
    BEGIN SELECT RAISE(ABORT,'TEST_QUEUE_FAILURE'); END;`);
  await expect(repo.save(draft, values(draft.fields))).rejects.toThrow(
    "TEST_QUEUE_FAILURE",
  );
  expect(count(f.sql)).toBe(0);
  expect(f.sql.prepare("SELECT * FROM sync_operations ORDER BY id").all()).toEqual(
    before,
  );
  f.sql.exec("DROP TRIGGER fail_core_queue");
  expect((await repo.save(draft, values(draft.fields))).localStatus).toBe("PENDING");
  expect(count(f.sql)).toBe(1);
});

it("changing only a date retains an unchanged authored seconds tuple while clearing date-specific resolution", async () => {
  const f = await fixture(),
    itemId = randomUUID();
  const boundary = {
    instant: "2026-10-19T21:00:30Z",
    local_date: "2026-10-20",
    local_time: "10:00:30",
    clock_precision: 0,
    quality: "EXACT",
    basis: "DERIVED_CIVIL",
    zone_id: "Pacific/Auckland",
    supplied_offset_seconds: 46800,
    source_instant: null,
    source_instant_precision: null,
    civil_resolution: "UNIQUE",
    resolution_offset_seconds: 46800,
    interpretation_key: "test-immutable-existing-interpretation",
    interpretation_input_sha256: "a".repeat(64),
    provenance_refs: null,
  };
  // Existing valid MANUAL boundary fixture, not a newly minted production certificate.
  await f.core.enqueue(await f.core.captureContext(f.tripId), {
    contractVersion: 2,
    intentVersion: 2,
    operationId: randomUUID(),
    tripId: f.tripId,
    command: "CREATE_ITEM",
    target: { kind: "ITEM", id: itemId },
    baseVector: [{ kind: "ITEM", id: itemId, revision: null }],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: {
      family: "P1",
      core: { title: "Precise planned visit" },
      participation: { mode: "WHOLE_GROUP", people: [], selfPersonId: null },
      acl: { visibility: "GROUP", people: [] },
      schedule: { start: boundary },
    },
  });
  const repo = f.repo(),
    draft = await repo.read(f.tripId, itemId);
  expect(draft.fields.startTime).toBe("10:00");
  await repo.save(draft, { ...draft.fields, startDate: "2026-10-21" });
  const edits = f.sql
    .prepare(
      "SELECT canonical_intent_text FROM trip_core_pending_intents ORDER BY created_at,operation_id",
    )
    .all();
  const after = JSON.parse(String(edits[1].canonical_intent_text)).payload.schedule.start;
  expect(after).toMatchObject({
    local_date: "2026-10-21",
    local_time: "10:00:30",
    clock_precision: 0,
    zone_id: "Pacific/Auckland",
    quality: "ESTIMATED",
    instant: null,
    supplied_offset_seconds: null,
    source_instant: null,
    civil_resolution: "PENDING",
    resolution_offset_seconds: null,
    interpretation_key: null,
    interpretation_input_sha256: null,
  });
  expect((await f.repo().read(f.tripId, itemId)).fields).toMatchObject({
    startDate: "2026-10-21",
    startTime: "10:00",
  });
});

async function namedPeople(f: Awaited<ReturnType<typeof fixture>>) {
  const people = ["Other named traveller", "第三位旅客"].map((displayName) => ({
    personId: randomUUID(),
    operationId: randomUUID(),
    displayName,
  }));
  await createLocalTripPersonRepository(f.coreDatabase, f.identity).initialize(
    f.tripId,
    people,
  );
  return people;
}
it("uses qualified retained local Person intents for multi-person P1 Save/reopen without inventing accepted membership", async () => {
  const f = await fixture(),
    people = await namedPeople(f);
  const roster = await createTripPersonRepository(
    f.coreDatabase,
    f.identity,
  ).listTripPersons(f.tripId);
  expect(roster).toHaveLength(3);
  expect(roster.filter((p) => p.localState === "LOCAL_PENDING")).toHaveLength(2);
  const repo = f.repo(),
    draft = await repo.createDraft(f.tripId);
  expect(draft.participantOptions).toHaveLength(3);
  const participation = {
    mode: "SELECTED_MEMBERS" as const,
    people: people.map((p) => p.personId).sort(),
    selfPersonId: null,
  };
  await repo.save(draft, { ...values(draft.fields), participation });
  const reopened = await f.repo().read(f.tripId, draft.itemId);
  expect(reopened.fields.participation).toEqual(participation);
  expect(reopened.participantOptions).toHaveLength(3);
  expect((await f.read(f.tripId))?.items).toHaveLength(1);
  const operations = f.sql
    .prepare(
      "SELECT status,last_error_code FROM sync_operations WHERE entity_type='TRIP_PERSON'",
    )
    .all();
  expect(operations).toEqual(
    Array(2).fill({
      status: "DEPENDENCY_BLOCKED",
      last_error_code: "PERSON_CREATE_HOSTED_UNAVAILABLE",
    }),
  );
  expect(
    f.sql.prepare("SELECT count(*) n FROM trip_core_read_certificates").get()!.n,
  ).toBe(0);
  expect(f.sql.prepare("SELECT count(*) n FROM trip_core_person_bindings").get()!.n).toBe(
    0,
  );
  expect(
    f.sql
      .prepare("SELECT role,status FROM ledger_members WHERE id=?")
      .get(people[0].personId),
  ).toEqual({ role: null, status: "local" });
});

it.each([
  ["failed intent", "UPDATE sync_operations SET status='FAILED' WHERE id=?", "operation"],
  ["deleted name", "DELETE FROM ledger_members WHERE id=?", "person"],
  ["inactive name", "UPDATE ledger_members SET status='inactive' WHERE id=?", "person"],
  [
    "observed revoked participation",
    "UPDATE ledger_members SET participation_active=0,participation_revision=1 WHERE id=?",
    "person",
  ],
  [
    "foreign Account",
    "UPDATE sync_operations SET owner_user_id='10000000-0000-4000-8000-000000000099' WHERE id=?",
    "operation",
  ],
  [
    "foreign Trip",
    "UPDATE sync_operations SET trip_id='10000000-0000-4000-8000-000000000099' WHERE id=?",
    "operation",
  ],
  [
    "changed idempotency key",
    "UPDATE sync_operations SET idempotency_key='10000000-0000-4000-8000-000000000099' WHERE id=?",
    "operation",
  ],
] as const)(
  "rejects a stale selected local participant after %s",
  async (_label, query, target) => {
    const f = await fixture(),
      people = await namedPeople(f),
      repo = f.repo(),
      draft = await repo.createDraft(f.tripId);
    f.sql
      .prepare(query)
      .run(target === "person" ? people[0].personId : people[0].operationId);
    await expect(
      repo.save(draft, {
        ...values(draft.fields),
        participation: {
          mode: "SELECTED_MEMBERS",
          people: [people[0].personId],
          selfPersonId: null,
        },
      }),
    ).rejects.toThrow();
    expect(count(f.sql)).toBe(0);
    const next = await f.repo().createDraft(f.tripId);
    expect(next.participantOptions.some((p) => p.personId === people[0].personId)).toBe(
      false,
    );
  },
);

it("pins the full retained Person intent, including same-ID changed name, during an open draft", async () => {
  const f = await fixture(),
    people = await namedPeople(f),
    repo = f.repo(),
    draft = await repo.createDraft(f.tripId);
  const row = f.sql
    .prepare("SELECT payload_json FROM sync_operations WHERE id=?")
    .get(people[0].operationId)!;
  const changed = {
    ...JSON.parse(row.payload_json as string),
    displayName: "Replaced name",
  };
  f.sql
    .prepare("UPDATE sync_operations SET payload_json=? WHERE id=?")
    .run(JSON.stringify(changed), people[0].operationId);
  f.sql
    .prepare("UPDATE ledger_members SET display_name=? WHERE id=?")
    .run(changed.displayName, people[0].personId);
  await expect(
    repo.save(draft, {
      ...values(draft.fields),
      participation: {
        mode: "SELECTED_MEMBERS",
        people: [people[0].personId],
        selfPersonId: null,
      },
    }),
  ).rejects.toThrow("MANUAL_PLAN_CONFLICT");
  expect(count(f.sql)).toBe(0);
});

it("rejects mismatched retained Person payload rather than trusting a cached display row", async () => {
  const f = await fixture(),
    people = await namedPeople(f);
  const row = f.sql
    .prepare("SELECT payload_json FROM sync_operations WHERE id=?")
    .get(people[0].operationId)!;
  f.sql.prepare("UPDATE sync_operations SET payload_json=? WHERE id=?").run(
    JSON.stringify({
      ...JSON.parse(row.payload_json as string),
      tripCreateOperationId: randomUUID(),
    }),
    people[0].operationId,
  );
  await expect(f.repo().createDraft(f.tripId)).rejects.toThrow(
    "TRIP_PERSON_INTENT_REUSE_MISMATCH",
  );
  expect(count(f.sql)).toBe(0);
});

it("retains Account/generation/creator fences with a qualified local Person roster", async () => {
  const f = await fixture();
  await namedPeople(f);
  const repo = f.repo(),
    draft = await repo.createDraft(f.tripId);
  f.switchAccount();
  await expect(repo.save(draft, values(draft.fields))).rejects.toThrow();
  expect(count(f.sql)).toBe(0);
  const g = await fixture();
  await namedPeople(g);
  g.aba();
  await expect(g.repo().createDraft(g.tripId)).rejects.toThrow();
  expect(count(g.sql)).toBe(0);
  const h = await fixture();
  await namedPeople(h);
  h.sql
    .prepare("UPDATE ledger_actor_context SET role='member' WHERE journey_id=?")
    .run(h.tripId);
  await expect(h.repo().createDraft(h.tripId)).rejects.toThrow();
  expect(count(h.sql)).toBe(0);
});

async function acceptedPlanFixture(
  foreignOwner = false,
  withPerson = false,
  stay = false,
) {
  const f = await fixture(true);
  const repo = stay
      ? createManualStayRepository(f.coreDatabase, f.identity, f.core)
      : f.repo(),
    draft = await repo.createDraft(f.tripId);
  const saved = await repo.save(draft, {
    ...values(draft.fields),
    ...(stay ? { endDate: "2026-12-31" } : {}),
  } as never);
  const context = await f.core.captureContext(f.tripId);
  const { readLocalManualSnapshotWithinTransaction } =
    await import("./tripLocalManualReadRepository");
  const snapshot = (await readLocalManualSnapshotWithinTransaction(
    f.coreDatabase,
    f.identity,
    f.core,
    context,
    null,
  ))!;
  const command = (await f.core.pending(context))[0].command;
  const { executeCoreCommandV2 } =
    await import("../../../backend/src/tripCoreV2Commands");
  const { emptyCoreGraph } = await import("@/domain/trip/tripCoreV2Mutation");
  const { buildCoreActorCollection } =
    await import("../../../backend/src/tripCoreV2Collection");
  const hash = async (bytes: Uint8Array) =>
    createHash("sha256").update(bytes).digest("hex");
  let graph = emptyCoreGraph();
  const result = await executeCoreCommandV2(
    {
      withLockedCommand: async (_scope, work) =>
        work({
          actor: snapshot.actor,
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
    f.originalAccount,
    f.tripId,
    command,
    hash,
    () => "2026-10-20T00:00:00.000Z",
  );
  if (result.projection !== "FULL") throw new Error("TEST_RECEIPT");
  await f.core.applyReceipt(context, result.receipt);
  f.sql
    .prepare("UPDATE sync_operations SET status='COMPLETED' WHERE id=?")
    .run(saved.operationIds[0]);
  if (foreignOwner) graph.itinerary_events[0].owner_account_id = randomUUID();
  let personId: string | undefined;
  if (withPerson) {
    const { createTripPersonCloudCreateRepository } =
      await import("./tripPersonCloudCreateRepository");
    const repo = createTripPersonCloudCreateRepository(f.coreDatabase, f.identity);
    const request = await repo.createAuthored({
      tripId: f.tripId,
      operationId: randomUUID(),
      personId: randomUUID(),
      displayName: "Accepted traveller",
      dataOwnership: "CLOUD_SHARED_AUTHORED",
    });
    await repo.accept(
      {
        receiptVersion: 1,
        actorAccountId: f.originalAccount,
        request,
        person: {
          personId: request.personId,
          tripId: f.tripId,
          displayName: request.displayName,
          status: "unlinked",
          userId: null,
          participationActive: true,
          participationRevision: 0,
        },
        acceptedAt: "2026-10-20T00:00:00.000Z",
      },
      context,
    );
    f.sql
      .prepare("UPDATE sync_operations SET status='COMPLETED' WHERE id=?")
      .run(request.operationId);
    personId = request.personId;
  }
  const bundle = await buildCoreActorCollection(
    graph,
    snapshot.actor,
    {
      epoch: randomUUID(),
      revision: 1,
      accessRevision: 1,
      generatedAt: "2026-10-20T00:00:00.000Z",
    },
    [
      {
        person_id: snapshot.actor.personId!,
        account_id: f.originalAccount,
        active: true,
        participating: true,
        revision: 1,
      },
      ...(personId
        ? [
            {
              person_id: personId,
              account_id: null,
              active: true,
              participating: true,
              revision: 0,
            },
          ]
        : []),
    ],
    hash,
  );
  await f.core.refresh(context, { collection: async () => bundle });
  return {
    ...f,
    itemId: draft.itemId,
    personId,
    revision: Number(graph.itinerary_events[0].semantic_revision),
  };
}
it("reopens a receipted accepted P3 for same-Creator Edit and rejects missing provenance or another Creator", async () => {
  const f = await acceptedPlanFixture(false, false, true);
  const repo = createManualStayRepository(f.coreDatabase, f.identity, f.core);
  const draft = await repo.read(f.tripId, f.itemId, f.revision);
  await repo.save(draft, {
    ...draft.fields,
    title: "Accepted Stay edited",
    startTime: "17:00",
    endTime: "10:00",
  });
  const pending = await f.core.pending(await f.core.captureContext(f.tripId));
  expect(pending.map((p) => p.command.command)).toContain("SET_ITEM_TEXT");
  expect(pending.map((p) => p.command.command)).toContain("SET_ITEM_SCHEDULE");
  const foreign = await acceptedPlanFixture(true, false, true);
  await expect(
    createManualStayRepository(foreign.coreDatabase, foreign.identity, foreign.core).read(
      foreign.tripId,
      foreign.itemId,
    ),
  ).rejects.toThrow("MANUAL_PLAN_UNAVAILABLE");
  const unproven = await acceptedPlanFixture(false, false, true);
  unproven.sql.exec("DROP TRIGGER trip_core_intent_binding_immutable");
  unproven.sql.exec(
    "UPDATE trip_core_pending_intents SET canonical_intent_text='{}' WHERE reconciled_revision IS NOT NULL",
  );
  await expect(
    createManualStayRepository(
      unproven.coreDatabase,
      unproven.identity,
      unproven.core,
    ).read(unproven.tripId, unproven.itemId),
  ).rejects.toThrow();
});
it("reopens reconciled accepted self-Creator P1 at its actual revision and saves a normal edit", async () => {
  const f = await acceptedPlanFixture(),
    repo = f.repo();
  expect(await f.core.pending(await f.core.captureContext(f.tripId))).toEqual([]);
  const draft = await repo.read(f.tripId, f.itemId, f.revision);
  expect(draft.mode).toBe("EDIT");
  await repo.save(draft, { ...draft.fields, title: "Accepted plan edited" });
  const pending = await f.core.pending(await f.core.captureContext(f.tripId));
  expect(pending).toHaveLength(1);
  expect(pending[0].command).toMatchObject({
    command: "SET_ITEM_TEXT",
    baseVector: [{ id: f.itemId, revision: f.revision }],
  });
});
it("rejects accepted P1 stale revision and missing immutable manual Create provenance", async () => {
  const f = await acceptedPlanFixture(),
    repo = f.repo();
  await expect(repo.read(f.tripId, f.itemId, f.revision + 1)).rejects.toThrow(
    "MANUAL_PLAN_CONFLICT",
  );
  f.sql.exec("DROP TRIGGER trip_core_intent_binding_immutable");
  f.sql
    .prepare(
      "UPDATE trip_core_pending_intents SET canonical_intent_text='{}' WHERE reconciled_revision IS NOT NULL",
    )
    .run();
  await expect(repo.read(f.tripId, f.itemId, f.revision)).rejects.toThrow();
});
it("accepted P1 cannot be opened under another Account", async () => {
  const f = await acceptedPlanFixture();
  f.switchAccount();
  await expect(f.repo().read(f.tripId, f.itemId, f.revision)).rejects.toThrow();
});

it("does not edit an accepted P1 owned by another Creator even with local Create history", async () => {
  const f = await acceptedPlanFixture(true);
  await expect(f.repo().read(f.tripId, f.itemId, f.revision)).rejects.toThrow(
    "MANUAL_PLAN_UNAVAILABLE",
  );
});

it("accepted P1 picker includes exact receipted unlinked Person without claiming an Account", async () => {
  const f = await acceptedPlanFixture(false, true),
    repo = f.repo();
  const draft = await repo.read(f.tripId, f.itemId, f.revision);
  expect(draft.participantOptions).toContainEqual({
    personId: f.personId,
    displayName: "Accepted traveller",
  });
  await repo.save(draft, {
    ...draft.fields,
    participation: {
      mode: "SELECTED_MEMBERS",
      people: [f.personId!],
      selfPersonId: null,
    },
  });
  const pending = await f.core.pending(await f.core.captureContext(f.tripId));
  expect(pending[0].command).toMatchObject({
    command: "SET_ITEM_PARTICIPATION",
    payload: { participation: { people: [f.personId] } },
  });
  expect(
    f.sql.prepare("SELECT status FROM ledger_members WHERE id=?").get(f.personId!),
  ).toEqual({ status: "unlinked" });
  expect(
    f.sql
      .prepare(
        "SELECT linked_account_id FROM trip_core_person_bindings WHERE account_id=? AND trip_id=? AND person_id=?",
      )
      .get(f.originalAccount, f.tripId, f.personId!),
  ).toEqual({ linked_account_id: null });
});
it("does not expose an inactive receipted Person as a P1 participant", async () => {
  const f = await acceptedPlanFixture(false, true);
  f.sql
    .prepare("UPDATE ledger_members SET participation_active=0 WHERE id=?")
    .run(f.personId!);
  expect(
    (await f.repo().read(f.tripId, f.itemId, f.revision)).participantOptions.some(
      (p) => p.personId === f.personId,
    ),
  ).toBe(false);
});

it("does not use an unlinked name without its completed owning Person receipt operation", async () => {
  const f = await acceptedPlanFixture(false, true);
  f.sql
    .prepare(
      "UPDATE sync_operations SET status='RETRYABLE' WHERE entity_type='TRIP_PERSON'",
    )
    .run();
  expect(
    (await f.repo().read(f.tripId, f.itemId, f.revision)).participantOptions.some(
      (p) => p.personId === f.personId,
    ),
  ).toBe(false);
});

it("real civil move persists the same local P1 and a cancelled frozen attempt can re-read a fresh draft", async () => {
  const f = await fixture(),
    repo = f.repo(),
    created = await repo.createDraft(f.tripId);
  await repo.save(created, {
    ...values(created.fields),
    startTime: "23:30",
    endDate: "2026-10-21",
    endTime: "01:00",
  });
  const local = (await f.read(f.tripId))!,
    item = p1CivilMoveItem(local.items[0])!;
  const proposal = p1CivilProposal(item, "2026-10-25", 1410);
  const opened = await repo.read(f.tripId, created.itemId);
  const fields = {
    ...opened.fields,
    startDate: proposal.date!,
    startTime: proposal.time!,
    endDate: proposal.endDate!,
    endTime: proposal.endTime!,
  };
  f.failNext(1);
  await expect(repo.save(opened, fields)).rejects.toThrow("TEST_WRITE_FAILURE");
  await expect(repo.save(opened, { ...fields, startTime: "23:35" })).rejects.toThrow(
    "MANUAL_PLAN_DRAFT_FROZEN",
  );
  const fresh = await repo.read(f.tripId, created.itemId);
  f.failNext(0);
  const result = await repo.save(fresh, { ...fields, startTime: "23:35" });
  expect(result.itemId).toBe(created.itemId);
  const restored = (await f.read(f.tripId))!;
  expect(restored.items).toHaveLength(1);
  expect(restored.items[0].schedule).toMatchObject({
    start: { localDate: "2026-10-25", localTime: "23:35:00", comparable: false },
    end: { localDate: "2026-10-26", localTime: "01:00:00", comparable: false },
  });
  expect(restored.items[0].place?.authoredLabel).toBe("Nelson gardens");
  expect(count(f.sql)).toBe(2);
});
