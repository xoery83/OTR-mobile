import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { migrations } from "@/data/db/migrations";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import type { LedgerReportingDatabase } from "./ledgerReportingRepository";
import { createTripPreparationSetupRepository } from "./tripPreparationSetupRepository";

vi.mock("@/data/auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("@/data/db/database", () => ({ readInitializedDatabase: vi.fn() }));
const tripId = "10000000-0000-4000-8000-000000000001";
const missingTrip = "10000000-0000-4000-8000-000000000002";
const connections: DatabaseSync[] = [];
afterEach(() => connections.splice(0).forEach((db) => db.close()));

function fixture() {
  const sql = new DatabaseSync(":memory:");
  connections.push(sql);
  for (const migration of migrations) sql.exec(migration.sql);
  sql.exec(`
    INSERT INTO ledger_journeys (journey_id,title,settlement_currency,settlement_scale,valuation_policy,updated_at)
    VALUES ('${tripId}','Trip','JPY',0,'REFERENCE_RATE','2026-10-17');
    INSERT INTO ledger_members (id,journey_id,display_name,role,status,updated_at)
    VALUES ('owner','${tripId}','Local owner','owner','local','2026-10-17'),
      ('named','${tripId}','Tina',NULL,'unlinked','2026-10-17'),
      ('blank','${tripId}','  ',NULL,'invite_pending','2026-10-17');
    INSERT INTO ledger_actor_context (user_id,journey_id,member_id,role,capabilities_json,updated_at)
    VALUES ('actor','${tripId}','owner','owner','{}','2026-10-17');
  `);
  let account = "actor";
  let failQuery = "";
  let onRead = () => {};
  const database: LedgerReportingDatabase = {
    async getAllAsync<T>(query: string, ...params: unknown[]) {
      if (failQuery && query.includes(failQuery)) throw new Error("read unavailable");
      const rows = sql.prepare(query).all(...(params as never[])) as T[];
      onRead();
      return rows;
    },
    async getFirstAsync<T>(query: string, ...params: unknown[]) {
      if (failQuery && query.includes(failQuery)) throw new Error("read unavailable");
      return (sql.prepare(query).get(...(params as never[])) ?? null) as T | null;
    },
    async runAsync() {
      throw new Error("read-only adapter");
    },
    async withTransactionAsync(task) {
      sql.exec("BEGIN");
      try {
        await task();
        sql.exec("COMMIT");
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return {
    sql,
    read: (id = tripId) =>
      createTripPreparationSetupRepository(database, async () => account).read(id),
    user: (value: string) => {
      account = value;
    },
    fail: (value: string) => {
      failQuery = value;
    },
    duringRead: (callback: () => void) => {
      onRead = callback;
    },
  };
}

it("reads actual currency/scale, owner and named people without guessing invitations", async () => {
  const f = fixture();
  expect(await f.read()).toMatchObject({
    context: { accountId: "actor", tripId },
    currency: {
      state: "AVAILABLE",
      code: "JPY",
      scale: 0,
      permission: "OWNER",
      lock: "NOT_OBSERVED",
    },
    members: {
      state: "AVAILABLE",
      namedCount: 2,
      people: [
        { personId: "owner", displayName: "Local owner" },
        { personId: "named", displayName: "Tina" },
      ],
    },
    invitations: "UNKNOWN",
    connections: "UNKNOWN",
  });
});

it("preserves three local-pending identities separately from the exact current Actor", async () => {
  const f = fixture();
  f.sql.exec(`
    UPDATE ledger_members SET status='local' WHERE id='named';
    INSERT INTO ledger_members (id,journey_id,display_name,role,status,updated_at)
      VALUES ('second','${tripId}','Bob',NULL,'local','2026-10-17'),
        ('third','${tripId}','旅行者',NULL,'local','2026-10-17');
  `);
  for (const id of ["named", "second", "third"])
    f.sql
      .prepare(
        `INSERT INTO sync_operations
      (id,trip_id,entity_type,entity_id,operation_type,idempotency_key,payload_json,
       owner_user_id,status,attempt_count,created_at,updated_at)
      VALUES (?,?,'TRIP_PERSON',?,'TRIP_PERSON_CREATE',?,'{}','actor',
        'DEPENDENCY_BLOCKED',0,'2026-10-17','2026-10-17')`,
      )
      .run(`create-${id}`, tripId, id, `create-${id}`);
  const setup = await f.read();
  expect(setup.members.state).toBe("AVAILABLE");
  if (setup.members.state !== "AVAILABLE") throw new Error("Expected real roster");
  expect(setup.members.namedCount).toBe(4);
  expect(setup.members.people.filter((p) => p.localState === "LOCAL_PENDING")).toEqual(
    expect.arrayContaining([
      {
        personId: "named",
        displayName: "Tina",
        localState: "LOCAL_PENDING",
        isCurrentActor: false,
      },
      {
        personId: "second",
        displayName: "Bob",
        localState: "LOCAL_PENDING",
        isCurrentActor: false,
      },
      {
        personId: "third",
        displayName: "旅行者",
        localState: "LOCAL_PENDING",
        isCurrentActor: false,
      },
    ]),
  );
  expect(setup.members.people.filter((p) => p.isCurrentActor)).toEqual([
    { personId: "owner", displayName: "Local owner", isCurrentActor: true },
  ]);
  expect(setup.invitations).toBe("UNKNOWN");
  expect(setup.connections).toBe("UNKNOWN");
});

it("does not label unmarked existing people as synced, canonical or connected", async () => {
  const setup = await fixture().read();
  if (setup.members.state !== "AVAILABLE") throw new Error("Expected real roster");
  expect(setup.members.people).toEqual([
    { personId: "owner", displayName: "Local owner", isCurrentActor: true },
    { personId: "named", displayName: "Tina", isCurrentActor: false },
  ]);
  expect(setup.members.people.every((p) => !Object.hasOwn(p, "localState"))).toBe(true);
  expect(setup.connections).toBe("UNKNOWN");
});

it("matches the Actor by Member ID, never a matching name or Person role", async () => {
  const f = fixture();
  f.sql.exec(
    "UPDATE ledger_actor_context SET member_id='named'; UPDATE ledger_members SET display_name='Same name'",
  );
  const setup = await f.read();
  if (setup.members.state !== "AVAILABLE") throw new Error("Expected real roster");
  expect(setup.members.people.filter((p) => p.isCurrentActor)).toEqual([
    { personId: "named", displayName: "Same name", isCurrentActor: true },
  ]);
});

it("never borrows another account's currency or roster, or substitutes another Trip", async () => {
  const f = fixture();
  expect(await f.read(missingTrip)).toMatchObject({
    currency: { state: "UNKNOWN" },
    members: { state: "UNKNOWN" },
  });
  f.user("other");
  expect(await f.read()).toMatchObject({
    currency: { state: "UNKNOWN" },
    members: { state: "UNKNOWN" },
  });
});

it("does not infer owner permission from a Person role", async () => {
  const f = fixture();
  f.sql.exec("UPDATE ledger_actor_context SET role='member'");
  expect((await f.read()).currency).toMatchObject({ permission: "READ_ONLY" });
});

it.each(["FINALIZED", "SUPERSEDED"])(
  "preserves the permanent currency lock for %s history",
  async (status) => {
    const f = fixture();
    f.sql
      .prepare(
        `INSERT INTO ledger_settlements
    (id,journey_id,status,through_timestamp,settlement_currency,settlement_scale,
     settings_revision,algorithm_version,input_digest,revision,finalized_by,finalized_at)
    VALUES ('settlement',?,?, '2026-10-17','JPY',0,1,'v1','digest',1,'actor','2026-10-17')`,
      )
      .run(tripId, status);
    expect((await f.read()).currency).toMatchObject({
      state: "AVAILABLE",
      permission: "OWNER",
      lock: "FINALIZED",
    });
  },
);

it("keeps currency readable but lock UNKNOWN if history cannot load", async () => {
  const f = fixture();
  f.fail("FROM ledger_settlements");
  expect(await f.read()).toMatchObject({
    currency: { state: "AVAILABLE", code: "JPY", lock: "UNKNOWN" },
    members: { state: "AVAILABLE" },
  });
});

it("does not replace an unavailable member read with zero people or invitation counts", async () => {
  const f = fixture();
  f.fail("m.participation_active");
  expect(await f.read()).toMatchObject({
    currency: { state: "AVAILABLE" },
    members: { state: "UNKNOWN" },
    invitations: "UNKNOWN",
    connections: "UNKNOWN",
  });
});

it("retains members if the independent settings read fails", async () => {
  const f = fixture();
  f.fail("SELECT source.*");
  expect(await f.read()).toMatchObject({
    currency: { state: "UNKNOWN" },
    members: { state: "AVAILABLE", namedCount: 2 },
  });
});

it("keeps both sections unknown when actor context cannot be read", async () => {
  const f = fixture();
  f.fail("SELECT actor.member_id AS memberId");
  expect(await f.read()).toMatchObject({
    currency: { state: "UNKNOWN" },
    members: { state: "UNKNOWN" },
  });
});

it("does not present orphaned actor membership as an empty available roster", async () => {
  const f = fixture();
  f.sql.exec("DELETE FROM ledger_members WHERE id='owner'");
  expect((await f.read()).members).toEqual({ state: "UNKNOWN" });
});

it.each(["account", "generation"])(
  "rejects %s changes during asynchronous reads",
  async (kind) => {
    const f = fixture();
    let changed = false;
    f.duringRead(() => {
      if (changed) return;
      changed = true;
      if (kind === "account") f.user("other");
      else advanceAccountGeneration();
    });
    await expect(f.read()).rejects.toThrow("Account changed");
  },
);

it("validates Trip identity before any repository read", async () => {
  await expect(fixture().read("not-a-trip-id")).rejects.toThrow();
});
