import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createGuestLocalWorkspaceOpener } from "./guestLocalWorkspace";
import * as guestWorkspace from "./guestLocalWorkspace";
import { readTripPreparationSetupRepository } from "../repositories/tripPreparationSetupRepository";
import { advanceAccountGeneration } from "./accountGeneration";
import type { LaunchIdentity } from "./guestPrincipalRepository";
import type { CoreDatabase } from "../repositories/tripCoreV2Repository";
import type { MigrationDatabase } from "../db/migrationRunner";

const state = vi.hoisted(() => ({
  principal: null as LaunchIdentity | null,
  account: vi.fn(() => {
    throw Error("ACCOUNT_DATABASE_FORBIDDEN");
  }),
}));
vi.mock("../db/database", () => ({ readInitializedDatabase: state.account }));
vi.mock("./authRepository", () => ({
  requireActiveUserId: state.account,
  readCommittedLocalPrincipal: vi.fn(async () => state.principal),
  requireCommittedGuestPrincipal: vi.fn(async () => state.principal),
}));
vi.mock("../files/tripPhotoFileStore", () => ({
  retainTripPhoto: state.account,
  resolveRetainedTripPhoto: state.account,
  probeRetainedTripPhotoIdentity: state.account,
  discardRetainedTripPhoto: state.account,
}));
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((clean) => clean());
  expect(state.account).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "otr-guest-cover-"));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  const opened: DatabaseSync[] = [];
  const close = () => opened.splice(0).forEach((sql) => sql.close());
  cleanups.push(close);
  const guestId = randomUUID();
  state.principal = { kind: "GUEST", localId: guestId };
  const connect = async (name: string): Promise<CoreDatabase & MigrationDatabase> => {
    const sql = new DatabaseSync(join(directory, name));
    opened.push(sql);
    sql.exec("PRAGMA foreign_keys=ON");
    return {
      async execAsync(query) {
        sql.exec(query);
      },
      async getFirstAsync<T>(query: string, ...args: unknown[]) {
        return (sql.prepare(query).get(...(args as never[])) ?? null) as T | null;
      },
      async getAllAsync<T>(query: string, ...args: unknown[]) {
        return sql.prepare(query).all(...(args as never[])) as T[];
      },
      async runAsync(query: string, ...args: unknown[]) {
        return sql.prepare(query).run(...(args as never[])) as never;
      },
      async withTransactionAsync(work) {
        sql.exec("BEGIN");
        try {
          await work();
          sql.exec("COMMIT");
        } catch (error) {
          sql.exec("ROLLBACK");
          throw error;
        }
      },
    };
  };
  const newOpener = () =>
    createGuestLocalWorkspaceOpener({
      readPrincipal: async () => state.principal,
      open: connect,
      recoveryFiles: () => ({
        async listAttempts() {
          return [];
        },
        async read() {
          return null;
        },
        async create() {
          throw Error("RECOVERY_WRITE_FORBIDDEN");
        },
      }),
    });
  return { guestId, newOpener, close, sql: () => opened[0] };
}
const tripInput = () => ({
  tripId: randomUUID(),
  operationId: randomUUID(),
  name: "Guest cover trip",
  creatorDisplayName: "旅人",
  destination: null,
  startDate: null,
  endDate: null,
});

it("keeps Guest currency code/scale local and durable after process-style database reopen", async () => {
  const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(Error("NETWORK_FORBIDDEN"));
  const f = fixture();
  const workspace = await f.newOpener()();
  const trip = tripInput();
  await workspace.trips.createTrip(trip);
  const queue = f.sql().prepare("SELECT * FROM sync_operations ORDER BY id").all();
  const before = await workspace.currency.read(trip.tripId);
  expect(before).toMatchObject({ code: "NZD", scale: 2 });
  const saved = await workspace.currency.save(before, "JPY");
  expect(saved).toMatchObject({ code: "JPY", scale: 0 });
  expect(await workspace.currency.readSetup(trip.tripId)).toMatchObject({
    currency: { state: "AVAILABLE", code: "JPY", scale: 0, permission: "OWNER" },
    members: { state: "UNKNOWN" }, invitations: "UNKNOWN", connections: "UNKNOWN",
  });
  expect(f.sql().prepare("SELECT * FROM sync_operations ORDER BY id").all()).toEqual(queue);
  f.close();
  const restored = await f.newOpener()();
  expect(await restored.currency.read(trip.tripId)).toMatchObject({ code: "JPY", scale: 0 });
  vi.spyOn(guestWorkspace, "openGuestLocalWorkspace").mockResolvedValue(restored);
  expect((await (await readTripPreparationSetupRepository()).read(trip.tripId)).currency).toMatchObject({ code: "JPY", scale: 0 });
  const lease = await restored.freezeForInventory();
  const source = JSON.parse((await lease.readTripP1Source()).canonicalText);
  expect(source.trips[0].ledgerInitialization).toMatchObject({ settlementCurrency: "JPY", settlementScale: 0 });
  expect(source.cloudAuthority).toBe(false);
  await lease.release();
  expect(workspace.syncAllowed).toBe(false);
  expect(network).not.toHaveBeenCalled();
});

it("rejects stale input, invalid code, frozen inventory and another Guest without partial writes", async () => {
  const f = fixture();
  const workspace = await f.newOpener()();
  const trip = tripInput();
  await workspace.trips.createTrip(trip);
  const before = await workspace.currency.read(trip.tripId);
  await expect(workspace.currency.save(before, "XXX")).rejects.toThrow("INVALID_CURRENCY");
  await workspace.currency.save(before, "USD");
  await expect(workspace.currency.save(before, "EUR")).rejects.toThrow("GUEST_CURRENCY_CONFLICT");
  const frozen = await workspace.freezeForInventory();
  await expect(workspace.currency.read(trip.tripId)).rejects.toThrow("GUEST_INVENTORY_FROZEN");
  await frozen.release();
  const current = await workspace.currency.read(trip.tripId);
  state.principal = { kind: "GUEST", localId: randomUUID() };
  advanceAccountGeneration();
  await expect(workspace.currency.save(current, "EUR")).rejects.toThrow();
  const other = await f.newOpener()();
  await expect(other.currency.read(trip.tripId)).rejects.toThrow("TRIP_PERSON_LOCAL_CREATOR_REQUIRED");
  state.principal = { kind: "GUEST", localId: f.guestId };
  advanceAccountGeneration();
  expect(await (await f.newOpener()()).currency.read(trip.tripId)).toMatchObject({ code: "USD", scale: 2 });
});

it.each(["legacy", "ledger", "settlement"])("refuses %s financial history and preserves settings/queue", async (kind) => {
  const f = fixture();
  const workspace = await f.newOpener()();
  const trip = tripInput();
  await workspace.trips.createTrip(trip);
  const before = await workspace.currency.read(trip.tripId);
  if (kind === "legacy") {
    f.sql().prepare("INSERT INTO expenses(id,trip_id,title,amount_minor,currency_code,created_at,updated_at,sync_status) VALUES(?,?,?,1,'NZD','x','x','PENDING')")
      .run(randomUUID(),trip.tripId,"Legacy expense");
  } else if (kind === "ledger") {
    // A deleted or accepted expense still has financial history and cannot be silently revalued.
    const columns = f.sql().prepare("PRAGMA table_info(ledger_expenses)").all() as {name:string; notnull:number; dflt_value:unknown; type:string}[];
    const values: Record<string,unknown> = { id: randomUUID(), journey_id: trip.tripId };
    for (const column of columns) if (column.notnull && column.dflt_value === null && !(column.name in values)) values[column.name] = column.type === "INTEGER" ? 1 : "x";
    f.sql().prepare(`INSERT INTO ledger_expenses(${Object.keys(values).join(",")}) VALUES(${Object.keys(values).map(()=>"?").join(",")})`).run(...Object.values(values) as never[]);
  } else {
    f.sql().prepare("INSERT INTO ledger_settlements(id,journey_id,status,through_timestamp,settlement_currency,settlement_scale,settings_revision,algorithm_version,input_digest,revision,finalized_by,finalized_at) VALUES(?,?,'FINALIZED','x','NZD',2,1,'x','x',1,'x','x')")
      .run(randomUUID(),trip.tripId);
  }
  const queue = f.sql().prepare("SELECT * FROM sync_operations ORDER BY id").all();
  await expect(workspace.currency.save(before, "JPY")).rejects.toThrow("GUEST_CURRENCY_HISTORY_LOCKED");
  expect(await workspace.currency.read(trip.tripId)).toMatchObject({ code: before.code, scale: before.scale });
  expect((await workspace.currency.readSetup(trip.tripId)).currency).toMatchObject({ lock: "UNKNOWN" });
  expect(f.sql().prepare("SELECT * FROM sync_operations ORDER BY id").all()).toEqual(queue);
});
