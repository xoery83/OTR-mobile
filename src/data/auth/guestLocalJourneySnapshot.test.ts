import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createGuestLocalWorkspaceOpener } from "./guestLocalWorkspace";
import * as guestWorkspace from "./guestLocalWorkspace";
import { readTripJourneySnapshot } from "../repositories/tripJourneySnapshotRepository";
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

it("reuses Guest local combined Snapshot through the default reader and cold reopen without an Accepted certificate", async () => {
  const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(Error("NETWORK_FORBIDDEN"));
  const f = fixture();
  const workspace = await f.newOpener()();
  const trip = { ...tripInput(), startDate: "2026-10-20", endDate: "2026-10-22" };
  await workspace.trips.createTrip(trip);
  const empty = await workspace.journeySnapshot.read(trip.tripId);
  expect(empty).toMatchObject({ epoch: null, snapshot: { itemCount: 0 }, localSource: { source: { kind: "LOCAL_MANUAL_COMMITTED" } } });
  const draft = await workspace.plan.createDraft(trip.tripId);
  const item = await workspace.plan.save(draft, { ...draft.fields, title: "Past Guest walk", startDate: trip.startDate });
  const queue = f.sql().prepare("SELECT * FROM sync_operations ORDER BY id").all();
  const snapshot = await workspace.journeySnapshot.read(trip.tripId);
  expect(snapshot).toMatchObject({ epoch: null, scope: { accountId: f.guestId, tripId: trip.tripId }, localSource: { source: { kind: "LOCAL_MANUAL_COMMITTED" } }, snapshot: { activities: 1 } });
  expect(snapshot?.snapshot.tags.some((tag) => tag.itemId === item.itemId)).toBe(true);
  expect(snapshot?.candidateDays).toContain(trip.startDate);
  const resolved = await workspace.journeySnapshot.resolveItem(trip.tripId, item.itemId, null);
  expect(resolved?.item).toMatchObject({ itemId: item.itemId, title: "Past Guest walk", localState: "PENDING" });
  expect(resolved?.certificate).toBeNull();
  expect(resolved?.localSource?.source).toEqual(snapshot?.localSource?.source);
  expect(await workspace.journeySnapshot.resolveItem(trip.tripId, item.itemId, randomUUID())).toBeNull();
  f.close();
  const restored = await f.newOpener()();
  vi.spyOn(guestWorkspace, "openGuestLocalWorkspace").mockResolvedValue(restored);
  expect((await (await readTripJourneySnapshot()).read(trip.tripId))?.snapshot.tags.some((tag) => tag.itemId === item.itemId)).toBe(true);
  expect(f.sql().prepare("SELECT * FROM sync_operations ORDER BY id").all()).toEqual(queue);
  expect(network).not.toHaveBeenCalled();
});

it("blocks stale Guest Snapshot reads after switching identity and during inventory freeze", async () => {
  const f = fixture();
  const workspace = await f.newOpener()();
  const trip = tripInput();
  await workspace.trips.createTrip(trip);
  const draft = await workspace.plan.createDraft(trip.tripId);
  const item = await workspace.plan.save(draft, { ...draft.fields, title: "Private Guest memory", startDate: "2026-10-20" });
  const freeze = await workspace.freezeForInventory();
  await expect(workspace.journeySnapshot.read(trip.tripId)).rejects.toThrow("GUEST_INVENTORY_FROZEN");
  await freeze.release();
  state.principal = { kind: "GUEST", localId: randomUUID() };
  advanceAccountGeneration();
  await expect(workspace.journeySnapshot.resolveItem(trip.tripId, item.itemId, null)).rejects.toThrow();
  const other = await f.newOpener()();
  expect(await other.journeySnapshot.read(trip.tripId)).toBeNull();
});
