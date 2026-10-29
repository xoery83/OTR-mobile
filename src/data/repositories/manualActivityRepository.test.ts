import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { migrations } from "../db/migrations";
import { serializeDatabaseTransactions } from "../db/databaseConnection";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { createTripCoreV2Repository, type CoreDatabase } from "./tripCoreV2Repository";
import { createTripRepository } from "./tripRepository";
import { createTripLocalManualReader } from "./tripLocalManualReadRepository";
import { createTripDayFeedReader } from "./tripDayFeedRepository";
import {
  createManualActivityRepository,
  type ManualActivityFields,
} from "./manualActivityRepository";
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
  const repo = () => createManualActivityRepository(database, identity, core, clock);
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

const values = (fields: ManualActivityFields): ManualActivityFields => ({
  ...fields,
  title: "Museum",
  startDate: "2026-12-30",
});
it("minimum name/date Create and same-ID Edit use the existing Core journal/Reader", async () => {
  const f = await fixture(),
    repo = f.repo(),
    draft = await repo.createDraft(f.tripId);
  const input = values(draft.fields);
  const created = await repo.save(draft, input);
  expect(created.itemId).toBe(draft.itemId);
  expect(created.operationIds).toHaveLength(1);
  expect((await f.read(f.tripId))!.items[0]).toMatchObject({
    family: "P6",
    itemId: draft.itemId,
    title: "Museum",
    localState: "PENDING",
  });
  const reopened = await f.repo().read(f.tripId, draft.itemId);
  expect(reopened.fields).toEqual(input);
  expect(reopened.fields.startTime).toBeNull();
  const editRepo = f.repo(),
    edit = await editRepo.read(f.tripId, draft.itemId);
  await editRepo.save(edit, {
    ...edit.fields,
    title: "Gallery",
    startTime: "10:00",
    endDate: "2026-12-31",
    endTime: "11:00",
    activityDetails: {
      sessionLabel: "Morning",
      admissionNote: "North entrance",
      entryLocation: "North gate",
    },
  });
  const restore = await f.repo().read(f.tripId, draft.itemId);
  expect(restore.itemId).toBe(draft.itemId);
  expect(restore.fields.activityDetails).toEqual({
    sessionLabel: "Morning",
    admissionNote: "North entrance",
    entryLocation: "North gate",
  });
  const read = (await f.read(f.tripId))!;
  expect(
    read
      .rows("2026-12-31")
      .some((r) => r.itemRef === draft.itemId && r.rowKey.projectionRole === "END"),
  ).toBe(true);
});
it("rollback keeps opaque retry idempotent and a changed frozen retry is rejected", async () => {
  const f = await fixture(),
    repo = f.repo(),
    draft = await repo.createDraft(f.tripId),
    input = values(draft.fields);
  f.failNext(1);
  await expect(repo.save(draft, input)).rejects.toThrow("TEST_WRITE_FAILURE");
  expect(f.sql.prepare("SELECT COUNT(*) n FROM trip_core_pending_intents").get()!.n).toBe(
    0,
  );
  expect(
    f.sql
      .prepare(
        "SELECT COUNT(*) n FROM sync_operations WHERE operation_type='CORE_V2_COMMAND'",
      )
      .get()!.n,
  ).toBe(0);
  await expect(repo.save(draft, { ...input, title: "Different" })).rejects.toThrow(
    "MANUAL_PLAN_DRAFT_FROZEN",
  );
  f.failNext(0);
  const result = await repo.save(draft, input);
  const again = await repo.save(draft, input);
  expect(again.operationIds).toEqual(result.operationIds);
});
it("no Draft write and account switch cannot Save a stale activity", async () => {
  const f = await fixture(),
    repo = f.repo(),
    draft = await repo.createDraft(f.tripId);
  expect(f.sql.prepare("SELECT COUNT(*) n FROM trip_core_pending_intents").get()!.n).toBe(
    0,
  );
  f.switchAccount();
  await expect(repo.save(draft, values(draft.fields))).rejects.toThrow();
});

it("proposed manual gate still rejects Activity detail commands on another family", async () => {
  const f = await fixture(),
    itemId = randomUUID();
  await f.trips.addItem(f.tripId, {
    itemId,
    operationId: randomUUID(),
    family: "P1",
    title: "Walk",
    startDate: "2026-12-30",
  });
  const original = JSON.parse(
    String(
      f.sql.prepare("SELECT canonical_intent_text FROM trip_core_pending_intents").get()!
        .canonical_intent_text,
    ),
  );
  const command = {
    ...original,
    operationId: randomUUID(),
    command: "SET_ACTIVITY_DETAILS",
    baseVector: [{ kind: "ITEM", id: itemId, revision: 1 }],
    payload: { details: { session_label: null, admission_note: null }, entryPlace: null },
  };
  const before = f.sql.prepare("SELECT COUNT(*) n FROM trip_core_pending_intents").get()!
    .n;
  await expect(
    f.core.commitManualBatch(await f.core.captureContext(f.tripId), async () => ({
      commands: [command],
      result: async () => true,
    })),
  ).rejects.toThrow("MANUAL_BATCH_INVALID");
  expect(f.sql.prepare("SELECT COUNT(*) n FROM trip_core_pending_intents").get()!.n).toBe(
    before,
  );
});

it("fresh Repository/Core cold read retains exact authored fields, stable identity and one existing queue per command", async () => {
  const f = await fixture(),
    repo = f.repo(),
    draft = await repo.createDraft(f.tripId);
  const input = {
    ...values(draft.fields),
    startTime: "10:15",
    endDate: "2026-12-31",
    endTime: "12:30",
    location: "Museum",
    description: "Note",
    activityDetails: {
      sessionLabel: "Morning",
      admissionNote: "North entrance",
      entryLocation: "North gate",
    },
  };
  const result = await repo.save(draft, input);
  const newCore = createTripCoreV2Repository(f.coreDatabase, f.identity, async (b) =>
    createHash("sha256").update(b).digest("hex"),
  );
  const coldRepo = createManualActivityRepository(f.coreDatabase, f.identity, newCore);
  const reopened = await coldRepo.read(f.tripId, draft.itemId);
  expect(reopened.itemId).toBe(result.itemId);
  expect(reopened.fields).toEqual(input);
  const intents = f.sql
    .prepare(
      "SELECT canonical_intent_text FROM trip_core_pending_intents ORDER BY created_at,operation_id",
    )
    .all();
  const queued = f.sql
    .prepare(
      "SELECT payload_json FROM sync_operations WHERE entity_type='TRIP_CORE_V2' AND operation_type='CORE_V2_COMMAND' ORDER BY created_at,id",
    )
    .all();
  expect(queued.map((r) => r.payload_json)).toEqual(
    intents.map((r) => r.canonical_intent_text),
  );
  expect(new Set(result.operationIds).size).toBe(result.operationIds.length);
  expect(
    f.sql.prepare("SELECT COUNT(*) n FROM trip_core_read_certificates").get()!.n,
  ).toBe(0);
  const again = await repo.save(draft, input);
  expect(again.operationIds).toEqual(result.operationIds);
  expect(f.sql.prepare("SELECT COUNT(*) n FROM trip_core_pending_intents").get()!.n).toBe(
    intents.length,
  );
});
it("a stale semantic revision cannot overwrite a newer P6 edit", async () => {
  const f = await fixture(),
    repo = f.repo(),
    draft = await repo.createDraft(f.tripId);
  await repo.save(draft, values(draft.fields));
  const first = await repo.read(f.tripId, draft.itemId),
    stale = await repo.read(f.tripId, draft.itemId);
  await repo.save(first, { ...first.fields, title: "Newer activity" });
  const before = f.sql
    .prepare("SELECT * FROM trip_core_pending_intents ORDER BY operation_id")
    .all();
  await expect(
    repo.save(stale, { ...stale.fields, title: "Stale activity" }),
  ).rejects.toThrow("MANUAL_PLAN_CONFLICT");
  expect(
    f.sql.prepare("SELECT * FROM trip_core_pending_intents ORDER BY operation_id").all(),
  ).toEqual(before);
  expect((await f.repo().read(f.tripId, draft.itemId)).fields.title).toBe(
    "Newer activity",
  );
});
it("revoked Core scope rejects P6 read/save without new intents", async () => {
  const f = await fixture(),
    repo = f.repo(),
    draft = await repo.createDraft(f.tripId);
  await repo.save(draft, values(draft.fields));
  const edit = await repo.read(f.tripId, draft.itemId);
  const before = f.sql
    .prepare("SELECT * FROM trip_core_pending_intents ORDER BY operation_id")
    .all();
  await f.core.revoke(await f.core.captureContext(f.tripId), 1);
  await expect(
    repo.save(edit, { ...edit.fields, title: "After revoke" }),
  ).rejects.toThrow("CORE_ACCESS_REVOKED");
  await expect(f.repo().read(f.tripId, draft.itemId)).rejects.toThrow(
    "CORE_ACCESS_REVOKED",
  );
  expect(
    f.sql.prepare("SELECT * FROM trip_core_pending_intents ORDER BY operation_id").all(),
  ).toEqual(before);
});
it.each([
  { command: "SET_STAY_DETAILS", payload: { details: {}, rooms: [] } },
  { command: "SET_RENTAL_DETAILS", payload: { details: {}, places: {} } },
])(
  "P6 target cannot accept another family's detail command: $command",
  async ({ command, payload }) => {
    const f = await fixture(),
      repo = f.repo(),
      draft = await repo.createDraft(f.tripId);
    await repo.save(draft, values(draft.fields));
    const original = JSON.parse(
      String(
        f.sql
          .prepare("SELECT canonical_intent_text FROM trip_core_pending_intents")
          .get()!.canonical_intent_text,
      ),
    );
    const other = {
      ...original,
      operationId: randomUUID(),
      command,
      baseVector: [{ kind: "ITEM", id: draft.itemId, revision: 1 }],
      payload,
    };
    const before = f.sql
      .prepare("SELECT * FROM trip_core_pending_intents ORDER BY operation_id")
      .all();
    await expect(
      f.core.commitManualBatch(await f.core.captureContext(f.tripId), async () => ({
        commands: [other],
        result: async () => true,
      })),
    ).rejects.toThrow("MANUAL_BATCH_INVALID");
    expect(
      f.sql
        .prepare("SELECT * FROM trip_core_pending_intents ORDER BY operation_id")
        .all(),
    ).toEqual(before);
  },
);
it("a complete five-command P6 edit retains the finite batch and stable revision chain", async () => {
  const f = await fixture(),
    repo = f.repo(),
    draft = await repo.createDraft(f.tripId);
  await repo.save(draft, values(draft.fields));
  const edit = await repo.read(f.tripId, draft.itemId);
  const owner = String(
    f.sql
      .prepare("SELECT person_id FROM local_trip_ledger_bindings WHERE trip_id=?")
      .get(f.tripId)!.person_id,
  );
  const changed: ManualActivityFields = {
    ...edit.fields,
    title: "All changed",
    description: "New note",
    startTime: "10:30",
    location: "Venue",
    participation: { mode: "SELF", people: [], selfPersonId: owner },
    activityDetails: {
      sessionLabel: "Morning",
      admissionNote: "North gate",
      entryLocation: "Gate",
    },
  };
  f.failNext(2);
  await expect(repo.save(edit, changed)).rejects.toThrow("TEST_WRITE_FAILURE");
  expect(f.sql.prepare("SELECT COUNT(*) n FROM trip_core_pending_intents").get()!.n).toBe(
    1,
  );
  expect((await f.repo().read(f.tripId, draft.itemId)).fields).toEqual(edit.fields);
  f.failNext(0);
  const result = await repo.save(edit, changed);
  expect(result.operationIds).toHaveLength(5);
  expect((await repo.save(edit, changed)).operationIds).toEqual(result.operationIds);
  const rows = f.sql
    .prepare(
      "SELECT canonical_intent_text FROM trip_core_pending_intents ORDER BY created_at,operation_id",
    )
    .all();
  const commands = rows.map((r) => JSON.parse(String(r.canonical_intent_text)));
  expect(new Set(commands.slice(1).map((c) => c.command))).toEqual(
    new Set([
      "SET_ITEM_TEXT",
      "SET_ITEM_SCHEDULE",
      "SET_ITEM_PLACE",
      "SET_ITEM_PARTICIPATION",
      "SET_ACTIVITY_DETAILS",
    ]),
  );
  expect((await f.repo().read(f.tripId, draft.itemId)).fields).toEqual(changed);
  expect((await f.read(f.tripId))!.items[0].itemRevision).toBe(6);
});

it("a new on-disk SQLite handle restores the P6 edit and durable queue without the original Core instance", async () => {
  const f = await fixture(),
    repo = f.repo(),
    draft = await repo.createDraft(f.tripId);
  await repo.save(draft, values(draft.fields));
  const edit = await repo.read(f.tripId, draft.itemId);
  const changed = {
    ...edit.fields,
    title: "Disk-restored Activity",
    startTime: "14:15",
    activityDetails: { ...edit.fields.activityDetails, entryLocation: "East gate" },
  };
  await repo.save(edit, changed);
  const originalQueue = f.sql
    .prepare(
      "SELECT id,payload_json FROM sync_operations WHERE operation_type='CORE_V2_COMMAND' ORDER BY id",
    )
    .all();
  const dir = mkdtempSync(join(tmpdir(), "otr-p6-cold-")),
    file = join(dir, "qa.sqlite");
  f.sql.prepare("VACUUM INTO ?").run(file);
  opened.splice(opened.indexOf(f.sql), 1);
  f.sql.close();
  const coldSql = new DatabaseSync(file);
  try {
    coldSql.exec("PRAGMA foreign_keys=ON");
    const database: CoreDatabase = serializeDatabaseTransactions({
      async getFirstAsync<T>(q: string, ...args: unknown[]) {
        return (coldSql.prepare(q).get(...(args as never[])) ?? null) as T | null;
      },
      async getAllAsync<T>(q: string, ...args: unknown[]) {
        return coldSql.prepare(q).all(...(args as never[])) as T[];
      },
      async runAsync(q: string, ...args: unknown[]) {
        return coldSql.prepare(q).run(...(args as never[])) as never;
      },
      async withTransactionAsync(work: () => Promise<void>) {
        coldSql.exec("BEGIN");
        try {
          await work();
          coldSql.exec("COMMIT");
        } catch (error) {
          coldSql.exec("ROLLBACK");
          throw error;
        }
      },
    });
    const core = createTripCoreV2Repository(database, f.identity, async (b) =>
      createHash("sha256").update(b).digest("hex"),
    );
    const restored = await createManualActivityRepository(
      database,
      f.identity,
      core,
    ).read(f.tripId, draft.itemId);
    expect(restored.itemId).toBe(draft.itemId);
    expect(restored.fields).toEqual(changed);
    expect(
      coldSql
        .prepare(
          "SELECT id,payload_json FROM sync_operations WHERE operation_type='CORE_V2_COMMAND' ORDER BY id",
        )
        .all(),
    ).toEqual(originalQueue);
    expect(
      (await createTripLocalManualReader(database, f.identity, core)(f.tripId))!.items[0],
    ).toMatchObject({ itemId: draft.itemId, family: "P6", title: changed.title });
  } finally {
    coldSql.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

async function acceptedActivityFixture(foreignOwner = false) {
  const f = await fixture(true),
    repo = f.repo(),
    draft = await repo.createDraft(f.tripId);
  const saved = await repo.save(draft, values(draft.fields));
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
    ],
    hash,
  );
  await f.core.refresh(context, { collection: async () => bundle });
  return { ...f, itemId: draft.itemId };
}

it("reopens receipted accepted P6 at the same ID/revision and retains details plus ENTRY mapping", async () => {
  const f = await acceptedActivityFixture(),
    repo = f.repo(),
    draft = await repo.read(f.tripId, f.itemId, 1);
  expect(draft.itemId).toBe(f.itemId);
  const saved = await repo.save(draft, {
    ...draft.fields,
    title: "Accepted Activity Edited",
    startTime: "10:20",
    activityDetails: {
      sessionLabel: "Morning session",
      admissionNote: "Use east entrance",
      entryLocation: "East gate",
    },
  });
  expect(saved.itemId).toBe(f.itemId);
  const pending = (await f.core.pending(await f.core.captureContext(f.tripId))).filter(
    (p) => p.state !== "APPLIED",
  );
  expect(
    pending.map((p) => [
      p.command.command,
      p.command.target.id,
      p.command.baseVector[0].revision,
    ]),
  ).toEqual([
    ["SET_ITEM_TEXT", f.itemId, 1],
    ["SET_ITEM_SCHEDULE", f.itemId, 2],
    ["SET_ACTIVITY_DETAILS", f.itemId, 3],
  ]);
  expect(pending[2].command.payload).toMatchObject({
    details: {
      session_label: "Morning session",
      admission_note: "Use east entrance",
    },
    entryPlace: { authored_label: "East gate" },
  });
  const restored = await f.repo().read(f.tripId, f.itemId, 4);
  expect(restored.fields.activityDetails).toEqual({
    sessionLabel: "Morning session",
    admissionNote: "Use east entrance",
    entryLocation: "East gate",
  });
});
it.each([
  "owner",
  "receipt",
  "payload",
  "hash",
  "queue",
  "mode",
  "stale",
  "account",
] as const)("denies accepted P6 with changed %s without new intents", async (kind) => {
  const f = await acceptedActivityFixture(kind === "owner");
  const count = () =>
      Number(
        (
          f.sql.prepare("SELECT count(*) AS n FROM trip_core_pending_intents").get() as {
            n: number;
          }
        ).n,
      ),
    before = count();
  if (kind === "receipt") f.sql.exec("DROP TRIGGER trip_core_receipt_immutable");
  if (["hash", "mode"].includes(kind))
    f.sql.exec("DROP TRIGGER trip_core_intent_binding_immutable");
  if (kind === "receipt")
    f.sql
      .prepare("UPDATE trip_core_trip_core_command_receipts SET receipt_sha256=?")
      .run("0".repeat(64));
  if (kind === "payload")
    f.sql
      .prepare(
        "UPDATE sync_operations SET payload_json='{}' WHERE entity_type='TRIP_CORE_V2'",
      )
      .run();
  if (kind === "hash")
    f.sql
      .prepare("UPDATE trip_core_pending_intents SET intent_sha256=?")
      .run("0".repeat(64));
  if (kind === "queue")
    f.sql
      .prepare(
        "UPDATE sync_operations SET status='RETRYABLE' WHERE entity_type='TRIP_CORE_V2'",
      )
      .run();
  if (kind === "mode")
    f.sql
      .prepare(
        "UPDATE trip_core_pending_intents SET canonical_intent_text=json_set(canonical_intent_text,'$.admission.mode','REVIEWED_SOURCE')",
      )
      .run();
  if (kind === "account") f.switchAccount();
  await expect(
    f.repo().read(f.tripId, f.itemId, kind === "stale" ? 99 : 1),
  ).rejects.toThrow();
  expect(count()).toBe(before);
});
