import { isDeepStrictEqual } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { serializeDatabaseTransactions } from "../db/databaseConnection";
import {
  getAccountGeneration,
  advanceAccountGeneration,
} from "../auth/accountGeneration";
import { withAccountApplyGate } from "../auth/accountRequestContext";
import { ttrFixture } from "@/domain/trip/__fixtures__/ttr";
import { qualifyTtr, ttrIdentityKey } from "@/domain/trip/ttr";
import { openTtr, reduceTtr } from "@/domain/trip/ttrState";
import {
  createTtrSelectionRepository,
  validateTtrSelectionIdentity,
  type TtrSelectionDatabase,
  type TtrSelectionRelation,
  type TtrSelectionClock,
} from "./ttrSelectionRepository";

// Test-only schema: no production migration module, number or registry entry.
const schema = `CREATE TABLE ttr_selections (
 account_id TEXT NOT NULL, trip_id TEXT NOT NULL,
 from_event_id TEXT NOT NULL, to_event_id TEXT NOT NULL,
 occurrence_discriminator TEXT NOT NULL CHECK(json_valid(occurrence_discriminator)),
 confirmed_mode TEXT NOT NULL CHECK(confirmed_mode IN ('walking','driving','transit')),
 selected_at TEXT NOT NULL, applicable_event_date TEXT, expiry_zone_id TEXT,
 CHECK((applicable_event_date IS NULL)=(expiry_zone_id IS NULL)),
 PRIMARY KEY(account_id,trip_id,from_event_id,to_event_id,occurrence_discriminator)
);`;
const disposals: (() => void)[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  while (disposals.length) disposals.pop()!();
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "otr-ttr-selection-")),
    path = join(dir, "selection.sqlite");
  let sql = new DatabaseSync(path);
  sql.exec(schema);
  const input = ttrFixture();
  input.scope.generation = getAccountGeneration();
  input.expiry = { eventDate: "2027-01-15", zone: "UTC" };
  const relation: TtrSelectionRelation = {
    input,
    accessRevision: 1,
    publicationVersion: 1,
  };
  const q = qualifyTtr(input);
  if (q.status !== "QUALIFIED") throw new Error("Invalid synthetic input");
  let activeAccount = input.scope.accountId,
    activeTrip = input.scope.tripId,
    traveller = input.scope.travellerKey;
  let clock: TtrSelectionClock = { instant: "2027-01-14T12:00:00Z", certain: true };
  const authorities = new Map<string, TtrSelectionRelation>();
  let revoked = false,
    failCommit = false,
    afterWrite: (() => void) | undefined,
    checkHook: (() => Promise<void>) | undefined;
  let transactions = 0,
    writes = 0,
    depth = 0;
  const key = (r: TtrSelectionRelation) => {
    const q = qualifyTtr(r.input);
    return q.status === "QUALIFIED" ? ttrIdentityKey(q.identity) : "UNQUALIFIED";
  };
  const admit = (r: TtrSelectionRelation) => authorities.set(key(r), structuredClone(r));
  admit(relation);
  const database = serializeDatabaseTransactions({
    async getFirstAsync<T>(query: string, ...params: unknown[]) {
      return (sql.prepare(query).get(...(params as never[])) ?? null) as T | null;
    },
    async runAsync(query: string, ...params: unknown[]) {
      writes++;
      const result = sql.prepare(query).run(...(params as never[]));
      afterWrite?.();
      return result as never;
    },
    async withTransactionAsync(work: () => Promise<void>) {
      transactions++;
      expect(depth++).toBe(0);
      sql.exec("BEGIN");
      try {
        await work();
        if (failCommit) throw new Error("INJECTED_COMMIT_FAILURE");
        sql.exec("COMMIT");
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      } finally {
        depth--;
      }
    },
  }) as TtrSelectionDatabase;
  const dependencies = {
    clock: () => clock,
    isCurrentRelation: async (
      ctx: { accountId: string; tripId: string },
      r: TtrSelectionRelation,
    ) => {
      await checkHook?.();
      const current = authorities.get(key(r));
      return (
        !revoked &&
        ctx.accountId === activeAccount &&
        ctx.tripId === activeTrip &&
        r.input.scope.travellerKey === traveller &&
        !!current &&
        isDeepStrictEqual(current, r)
      );
    },
  };
  const repository = () =>
    createTtrSelectionRepository(database, async () => activeAccount, dependencies);
  const context = () => ({
    accountId: activeAccount,
    tripId: activeTrip,
    generation: getAccountGeneration(),
  });
  const repo = repository();
  const rows = () =>
    sql.prepare("SELECT * FROM ttr_selections ORDER BY occurrence_discriminator").all();
  disposals.push(() => {
    sql.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    repo,
    database,
    repository,
    relation,
    context,
    rows,
    admit,
    key,
    counts: () => ({ writes, transactions }),
    raw: () => sql,
    reopen: () => {
      sql.close();
      sql = new DatabaseSync(path);
      return repository();
    },
    setClock: (next: TtrSelectionClock) => {
      clock = next;
    },
    setAccount: (next: string) => {
      activeAccount = next;
      advanceAccountGeneration();
    },
    setTrip: (next: string) => {
      activeTrip = next;
    },
    setTraveller: (next: string) => {
      traveller = next;
    },
    revoke: () => {
      revoked = true;
    },
    failCommit: () => {
      failCommit = true;
    },
    afterWrite: (fn: () => void) => {
      afterWrite = fn;
    },
    onCheck: (fn: () => Promise<void>) => {
      checkHook = fn;
    },
  };
}

describe("dormant TTR real SQLite-file repository", () => {
  it("creates exactly nine columns and five-part PK, with no cascade, route or sync tables", () => {
    const f = fixture();
    const cols = f.raw().prepare("PRAGMA table_info(ttr_selections)").all();
    expect(cols.map((c) => c.name)).toEqual([
      "account_id",
      "trip_id",
      "from_event_id",
      "to_event_id",
      "occurrence_discriminator",
      "confirmed_mode",
      "selected_at",
      "applicable_event_date",
      "expiry_zone_id",
    ]);
    expect(cols.map((c) => c.pk)).toEqual([1, 2, 3, 4, 5, 0, 0, 0, 0]);
    expect(f.raw().prepare("PRAGMA foreign_key_list(ttr_selections)").all()).toEqual([]);
    expect(
      f.raw().prepare("SELECT name FROM sqlite_master WHERE type='table'").all(),
    ).toEqual([{ name: "ttr_selections" }]);
  });
  it("Confirms offline, atomically upserts, then restores exact choice after file close/reopen", async () => {
    const f = fixture();
    const first = await f.repo.confirm(f.context(), f.relation, "walking");
    f.setClock({ instant: "2027-01-14T13:00:00Z", certain: true });
    const second = await f.repo.confirm(f.context(), f.relation, "transit");
    expect(second.selectedAt).not.toBe(first.selectedAt);
    expect(f.rows()).toHaveLength(1);
    const reopened = f.reopen();
    expect(await reopened.read(f.context(), f.relation)).toEqual(second);
    expect(f.counts().writes).toBe(2);
  });
  it.each(["PENDING", "FAILED"] as const)(
    "route %s and Preview/Dismiss cannot affect durable Confirm",
    async (status) => {
      const f = fixture();
      let state = reduceTtr(openTtr(f.relation.input), {
        type: "PREVIEW",
        mode: "driving",
      });
      state = reduceTtr(state, { type: "BEGIN_FIXTURE_REQUEST" });
      if (state.route.status !== "PENDING") throw new Error("Expected pending");
      if (status === "FAILED")
        state = reduceTtr(state, {
          type: "FIXTURE_FAILURE",
          ticket: state.route.ticket,
          reason: "TIMEOUT",
        });
      expect(state.route.status).toBe(status);
      expect(f.counts().writes).toBe(0);
      expect(
        (await f.repo.confirm(f.context(), f.relation, state.preview!.mode!)).mode,
      ).toBe("driving");
      const before = f.rows();
      reduceTtr(state, { type: "DISMISS" });
      await f.repo.read(f.context(), f.relation);
      expect(f.rows()).toEqual(before);
      expect(f.counts().writes).toBe(1);
    },
  );
  it("preserves mode/selectedAt across location/time/date edits and reconciles unknown expiry to NULL", async () => {
    const f = fixture(),
      saved = await f.repo.confirm(f.context(), f.relation, "walking");
    const edited = structuredClone(f.relation);
    edited.input.to!.endpoint!.coordinates!.longitude = 2;
    edited.input.to!.endpoint!.locationInputRevision = 2;
    edited.input.queryTime = {
      kind: "DEPARTURE",
      instant: "2027-01-15T13:00:00Z",
      zone: "UTC",
      quality: "EXACT",
      precision: 0,
      comparable: true,
    };
    edited.input.expiry!.eventDate = "2027-01-20";

    f.admit(edited);
    await f.repo.reconcileExpiry(f.context(), [edited]);
    expect(await f.repo.read(f.context(), edited)).toEqual({
      ...saved,
      expiry: edited.input.expiry,
    });
    edited.input.expiry = null;
    f.admit(edited);
    await f.repo.reconcileExpiry(f.context(), [edited]);
    expect(await f.repo.read(f.context(), edited)).toEqual({ ...saved, expiry: null });
    expect(f.rows()[0].applicable_event_date).toBeNull();
    expect(f.rows()[0].expiry_zone_id).toBeNull();
  });
  it("keeps reversed and repeated occurrences separate, without writing on read or missing-row reconciliation", async () => {
    const f = fixture();
    await f.repo.confirm(f.context(), f.relation, "walking");
    const repeated = structuredClone(f.relation);
    repeated.input.to!.occurrenceToken = repeated.input.continuity!.toToken =
      "synthetic-entry-2";
    const reversed = structuredClone(f.relation);
    [reversed.input.from, reversed.input.to] = [reversed.input.to, reversed.input.from];
    [reversed.input.continuity!.fromToken, reversed.input.continuity!.toToken] = [
      reversed.input.continuity!.toToken,
      reversed.input.continuity!.fromToken,
    ];
    for (const r of [repeated, reversed]) {
      const count = f.rows().length;
      f.admit(r);
      expect(await f.repo.read(f.context(), r)).toBeNull();
      await f.repo.reconcileExpiry(f.context(), [r]);
      expect(f.rows()).toHaveLength(count);
      await f.repo.confirm(f.context(), r, "transit");
    }
    expect(f.rows()).toHaveLength(3);
    expect((await f.repo.read(f.context(), f.relation))?.mode).toBe("walking");
  });
  it.each(["account", "trip", "traveller", "access", "relation"] as const)(
    "rejects queued work after %s authority changes",
    async (kind) => {
      const f = fixture(),
        ctx = f.context(),
        entered = deferred(),
        release = deferred();
      const hold = withAccountApplyGate(async () => {
        entered.resolve();
        await release.promise;
      });
      await entered.promise;
      const request = f.repo.confirm(ctx, f.relation, "walking").catch((e) => e as Error);
      if (kind === "account") {
        f.setAccount("90000000-0000-4000-8000-000000000001");
        f.setAccount(ctx.accountId);
      }
      if (kind === "trip") f.setTrip("90000000-0000-4000-8000-000000000001");
      if (kind === "traveller") f.setTraveller("other-person/branch");
      if (kind === "access") f.admit({ ...f.relation, accessRevision: 2 });
      if (kind === "relation") {
        const changed = structuredClone(f.relation);
        changed.input.continuity = null;
        f.admit(changed);
        f.revoke();
      }
      release.resolve();
      await hold;
      expect(await request).toBeInstanceOf(Error);
      expect(f.rows()).toEqual([]);
      expect(f.counts().writes).toBe(0);
    },
  );
  it("latest explicit Confirm wins even across repository instances on the same connection", async () => {
    const f = fixture(),
      entered = deferred(),
      release = deferred();
    const hold = withAccountApplyGate(async () => {
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    const old = f.repo
      .confirm(f.context(), f.relation, "walking")
      .catch((e) => e as Error);
    const newer = f.repository().confirm(f.context(), f.relation, "driving");
    release.resolve();
    await hold;
    expect(await old).toMatchObject({ message: "TTR_SUPERSEDED_CONFIRM" });
    expect((await newer).mode).toBe("driving");
    expect(f.rows()).toHaveLength(1);
    expect(f.counts().writes).toBe(1);
  });
  it("serializes distinct-key concurrent Confirms and acknowledges only after commit", async () => {
    const f = fixture(),
      second = structuredClone(f.relation),
      entered = deferred(),
      release = deferred();
    second.input.to!.occurrenceToken = second.input.continuity!.toToken = "second";
    f.admit(second);
    let firstCheck = true,
      acknowledged = false;
    f.onCheck(async () => {
      if (firstCheck) {
        firstCheck = false;
        entered.resolve();
        await release.promise;
      }
    });
    const first = f.repo.confirm(f.context(), f.relation, "walking").then((v) => {
      acknowledged = true;
      return v;
    });
    await entered.promise;
    const another = f.repo.confirm(f.context(), second, "transit");
    expect(acknowledged).toBe(false);
    expect(f.rows()).toHaveLength(0);
    release.resolve();
    await Promise.all([first, another]);
    expect(f.rows()).toHaveLength(2);
    expect(f.counts().transactions).toBe(2);
  });
  it.each(["commit", "sql", "authority"] as const)(
    "%s failure rolls back a Confirm and preserves prior durable selection",
    async (kind) => {
      const f = fixture();
      await f.repo.confirm(f.context(), f.relation, "walking");
      const before = f.rows();
      if (kind === "commit") f.failCommit();
      if (kind === "sql")
        f.raw().exec(
          "CREATE TRIGGER reject_mode BEFORE UPDATE ON ttr_selections WHEN NEW.confirmed_mode='driving' BEGIN SELECT RAISE(ABORT,'SQL_FAIL'); END;",
        );
      if (kind === "authority") f.afterWrite(f.revoke);
      await expect(f.repo.confirm(f.context(), f.relation, "driving")).rejects.toThrow();
      expect(f.rows()).toEqual(before);
    },
  );
  it("rechecks authority before read publication and rejects stale Account context without writes", async () => {
    const f = fixture();
    await f.repo.confirm(f.context(), f.relation, "walking");
    let check = 0;
    f.onCheck(async () => {
      if (++check === 2) f.revoke();
    });
    await expect(f.repo.read(f.context(), f.relation)).rejects.toThrow(
      "TTR_STALE_AUTHORITY",
    );
    const ctx = f.context();
    f.setAccount(ctx.accountId);
    await expect(f.repo.read(ctx, f.relation)).rejects.toThrow();
    expect(f.counts().writes).toBe(1);
  });
});

describe("qualified bounded expiry and corruption", () => {
  it("never acknowledges an ignored SQLite write as a saved selection", async () => {
    const f = fixture();
    await f.repo.confirm(f.context(), f.relation, "walking");
    const before = f.rows();
    f.raw().exec(
      "CREATE TRIGGER ignore_confirm BEFORE UPDATE ON ttr_selections BEGIN SELECT RAISE(IGNORE); END;",
    );
    await expect(f.repo.confirm(f.context(), f.relation, "driving")).rejects.toThrow(
      "TTR_WRITE_NOT_APPLIED",
    );
    expect(f.rows()).toEqual(before);
  });
  it("processes100 explicit qualified identities in one cleanup transaction without scanning other rows", async () => {
    const f = fixture();
    const relations = Array.from({ length: 100 }, (_, i) => {
      const r = structuredClone(f.relation);
      r.input.to!.occurrenceToken =
        r.input.continuity!.toToken = `synthetic-owned-appearance-${i}`;
      f.admit(r);
      return r;
    });
    await Promise.all(relations.map((r) => f.repo.confirm(f.context(), r, "walking")));
    await f.repo.confirm(f.context(), f.relation, "transit");
    f.setClock({ instant: "2027-01-30T12:00:00Z", certain: true });
    const before = f.counts().transactions;
    expect(await f.repo.cleanupExpired(f.context(), relations)).toBe(100);
    expect(f.counts().transactions).toBe(before + 1);
    expect(f.rows()).toHaveLength(1);
    expect((await f.repo.read(f.context(), f.relation))?.mode).toBe("transit");
  });
  it("Past read hides nothing durably; cleanup authority changes roll back deletion", async () => {
    const f = fixture();
    const saved = await f.repo.confirm(f.context(), f.relation, "walking");
    const past = structuredClone(f.relation);
    past.input.period = "PAST";
    f.admit(past);
    expect(await f.repo.read(f.context(), past)).toEqual(saved);
    expect(f.counts().writes).toBe(1);
    f.setClock({ instant: "2027-01-30T12:00:00Z", certain: true });
    f.afterWrite(f.revoke);
    await expect(f.repo.cleanupExpired(f.context(), [past])).rejects.toThrow(
      "TTR_STALE_AUTHORITY",
    );
    expect(f.rows()).toHaveLength(1);
  });
  it.each(["selected_at", "partial_expiry", "bad_date", "bad_zone"] as const)(
    "corrupt stored %s blocks publication and repair",
    async (corruption) => {
      const f = fixture();
      await f.repo.confirm(f.context(), f.relation, "walking");
      f.raw().exec("PRAGMA ignore_check_constraints=ON");
      if (corruption === "selected_at")
        f.raw().exec("UPDATE ttr_selections SET selected_at='invalid'");
      if (corruption === "partial_expiry")
        f.raw().exec("UPDATE ttr_selections SET expiry_zone_id=NULL");
      if (corruption === "bad_date")
        f.raw().exec("UPDATE ttr_selections SET applicable_event_date='2027-02-30'");
      if (corruption === "bad_zone")
        f.raw().exec("UPDATE ttr_selections SET expiry_zone_id='Invalid/Zone'");
      const before = f.rows();
      await expect(f.repo.read(f.context(), f.relation)).rejects.toThrow();
      await expect(f.repo.confirm(f.context(), f.relation, "driving")).rejects.toThrow();
      expect(f.rows()).toEqual(before);
    },
  );
  it("unknown or malformed clock cannot authorize cleanup or timestamp a Confirm", async () => {
    const f = fixture();
    await f.repo.confirm(f.context(), f.relation, "walking");
    const before = f.rows();
    f.setClock({ instant: "invalid", certain: true });
    await expect(f.repo.cleanupExpired(f.context(), [f.relation])).rejects.toThrow();
    f.setClock({ instant: null, certain: false });
    await expect(f.repo.confirm(f.context(), f.relation, "driving")).rejects.toThrow();
    expect(await f.repo.cleanupExpired(f.context(), [f.relation])).toBe(0);
    expect(f.rows()).toEqual(before);
  });
  it("extends stale expiry before cleanup, then shortens without mode/time renewal", async () => {
    const f = fixture();
    const saved = await f.repo.confirm(f.context(), f.relation, "walking");
    f.setClock({ instant: "2027-01-16T12:00:00Z", certain: true });
    const extended = structuredClone(f.relation);
    extended.input.expiry!.eventDate = "2027-01-20";
    f.admit(extended);
    expect(await f.repo.cleanupExpired(f.context(), [extended])).toBe(0);
    expect(await f.repo.read(f.context(), extended)).toEqual({
      ...saved,
      expiry: extended.input.expiry,
    });
    const shortened = structuredClone(extended);
    shortened.input.expiry!.eventDate = "2027-01-14";
    f.admit(shortened);
    await f.repo.reconcileExpiry(f.context(), [shortened]);
    expect((await f.repo.read(f.context(), shortened))?.selectedAt).toBe(
      saved.selectedAt,
    );
    expect(await f.repo.cleanupExpired(f.context(), [shortened])).toBe(1);
  });
  it("uses Event IANA midnight and timezone edits, independent of device TZ", async () => {
    vi.stubEnv("TZ", "America/New_York");
    const f = fixture(),
      r = structuredClone(f.relation);
    r.input.expiry = { eventDate: "2027-01-15", zone: "Pacific/Auckland" };
    f.admit(r);
    await f.repo.confirm(f.context(), r, "walking");
    f.setClock({ instant: "2027-01-15T10:59:59Z", certain: true });
    expect(await f.repo.cleanupExpired(f.context(), [r])).toBe(0);
    const utc = structuredClone(r);
    utc.input.expiry!.zone = "UTC";
    f.admit(utc);
    f.setClock({ instant: "2027-01-15T11:00:00Z", certain: true });
    expect(await f.repo.cleanupExpired(f.context(), [utc])).toBe(0);
    f.admit(r);
    expect(await f.repo.cleanupExpired(f.context(), [r])).toBe(1);
  });
  it.each(["unknown-date", "clock", "no-clock", "unqualified", "revoked"] as const)(
    "%s cannot erase a selection or use stale stored expiry",
    async (kind) => {
      const f = fixture();
      await f.repo.confirm(f.context(), f.relation, "walking");
      const r = structuredClone(f.relation);
      f.setClock({ instant: "2027-01-30T12:00:00Z", certain: true });
      if (kind === "unknown-date") r.input.expiry = null;
      if (kind === "clock")
        f.setClock({ instant: "2027-01-30T12:00:00Z", certain: false });
      if (kind === "no-clock") f.setClock({ instant: null, certain: true });
      if (kind === "unqualified") r.input.source.complete = false;
      if (kind === "revoked") f.revoke();
      f.admit(r);
      expect(await f.repo.cleanupExpired(f.context(), [r])).toBe(0);
      expect(f.rows()).toHaveLength(1);
    },
  );
  it("bounds cleanup at100 identities, rejects duplicates, and rolls back a partially processed batch", async () => {
    const f = fixture();
    await f.repo.confirm(f.context(), f.relation, "walking");
    const before = f.rows();
    await expect(
      f.repo.cleanupExpired(f.context(), Array(101).fill(f.relation)),
    ).rejects.toThrow("TTR_BATCH_LIMIT");
    f.setClock({ instant: "2027-01-30T12:00:00Z", certain: true });
    await expect(
      f.repo.cleanupExpired(f.context(), [f.relation, f.relation]),
    ).rejects.toThrow("TTR_DUPLICATE_RELATION");
    expect(f.rows()).toEqual(before);
  });
  it("fences queued cleanup on Account A→B→A and access revocation", async () => {
    const f = fixture();
    await f.repo.confirm(f.context(), f.relation, "walking");
    const before = f.rows(),
      ctx = f.context();
    f.setClock({ instant: "2027-01-30T12:00:00Z", certain: true });
    const entered = deferred(),
      release = deferred();
    const hold = withAccountApplyGate(async () => {
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    const clean = f.repo.cleanupExpired(ctx, [f.relation]).catch((e) => e as Error);
    f.setAccount("90000000-0000-4000-8000-000000000001");
    f.setAccount(ctx.accountId);
    release.resolve();
    await hold;
    expect(await clean).toBeInstanceOf(Error);
    expect(f.rows()).toEqual(before);
  });
  it.each([
    { eventDate: "2027-02-30", zone: "UTC" },
    { eventDate: "2027-01-15", zone: "" },
    { eventDate: "2027-01-15", zone: "+13:00" },
    { eventDate: "2027-01-15", zone: "Invalid/Zone" },
  ])(
    "rejects invalid expiry %s with no Confirm or maintenance mutation",
    async (value) => {
      const f = fixture();
      await f.repo.confirm(f.context(), f.relation, "walking");
      const before = f.rows();
      const r = structuredClone(f.relation);
      r.input.expiry = value;
      f.admit(r);
      await expect(f.repo.confirm(f.context(), r, "transit")).rejects.toThrow();
      await expect(f.repo.reconcileExpiry(f.context(), [r])).rejects.toThrow();
      await expect(f.repo.cleanupExpired(f.context(), [r])).rejects.toThrow();
      expect(f.rows()).toEqual(before);
    },
  );
  it("strictly validates canonical discriminator/UUID/key bounds, not DayRow/date/Provider identities", () => {
    const f = fixture(),
      q = qualifyTtr(f.relation.input);
    if (q.status !== "QUALIFIED") throw new Error("fixture");
    const id = q.identity;
    for (const change of [
      { accountId: "not-uuid" },
      { fromEventId: id.toEventId },
      { occurrenceDiscriminator: "[not-json" },
      { occurrenceDiscriminator: '["event","EVENT","2027-01-15"]' },
      {
        occurrenceDiscriminator: JSON.stringify([
          "ttr-query/1",
          "coordinates",
          "walking",
          "ETA",
          null,
          null,
          null,
        ]),
      },
      {
        occurrenceDiscriminator: JSON.stringify([
          "person",
          "entry",
          "UNKNOWN_ROLE",
          "exit",
          "END",
        ]),
      },
      {
        occurrenceDiscriminator:
          JSON.stringify(["person", "entry", "START", "exit", "END"]) + " ",
      },
      { occurrenceDiscriminator: "x".repeat(8193) },
      {
        occurrenceDiscriminator: JSON.stringify([
          "person",
          "x".repeat(257),
          "START",
          "exit",
          "END",
        ]),
      },
    ])
      expect(() => validateTtrSelectionIdentity({ ...id, ...change })).toThrow();
    const token = "a" + "\u0000".repeat(254) + "a";
    const worst = {
      ...id,
      occurrenceDiscriminator: JSON.stringify([
        token,
        token,
        "BASE_RETURN",
        token,
        "BASE_FROM",
      ]),
    };
    expect(validateTtrSelectionIdentity(worst)).toEqual(worst);
    expect(new TextEncoder().encode(ttrIdentityKey(worst)).length).toBeLessThan(8192);
  });
  it("corrupt row/unsupported mode never repairs or transfers a choice", async () => {
    const f = fixture();
    await f.repo.confirm(f.context(), f.relation, "walking");
    await expect(
      f.repo.confirm(f.context(), f.relation, "cycling" as never),
    ).rejects.toThrow();
    f.raw().exec(
      "PRAGMA ignore_check_constraints=ON; UPDATE ttr_selections SET confirmed_mode='cycling'",
    );
    const before = f.rows();
    await expect(f.repo.read(f.context(), f.relation)).rejects.toThrow();
    await expect(f.repo.confirm(f.context(), f.relation, "walking")).rejects.toThrow();
    await expect(f.repo.cleanupExpired(f.context(), [f.relation])).rejects.toThrow();
    expect(f.rows()).toEqual(before);
  });
  it("rejects forged tokens/IDs even if shape-valid, and snapshots request data before await", async () => {
    const f = fixture(),
      forged = structuredClone(f.relation);
    forged.input.to!.occurrenceToken = forged.input.continuity!.toToken = "2027-01-15";
    await expect(f.repo.confirm(f.context(), forged, "walking")).rejects.toThrow(
      "TTR_STALE_AUTHORITY",
    );
    const queued = structuredClone(f.relation),
      entered = deferred(),
      release = deferred();
    const hold = withAccountApplyGate(async () => {
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    const write = f.repo.confirm(f.context(), queued, "walking");
    queued.input.scope.accountId = "90000000-0000-4000-8000-000000000001";
    release.resolve();
    await hold;
    expect((await write).mode).toBe("walking");
    expect(f.rows()[0].account_id).toBe(f.context().accountId);
  });
});
