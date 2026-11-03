import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createGuestLocalWorkspaceOpener } from "./guestLocalWorkspace";
import * as guestWorkspace from "./guestLocalWorkspace";
import { readTripPreparation } from "../repositories/tripPreparationRepository";
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

it("reuses normal Preparation for a Guest empty Trip and a real local P1 through disk reopen without Accepted authority", async () => {
  const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(Error("NETWORK_FORBIDDEN"));
  const f = fixture();
  const workspace = await f.newOpener()();
  const trip = { ...tripInput(), startDate: "2026-11-08", endDate: "2026-11-10" };
  await workspace.trips.createTrip(trip);
  const before = f.sql().prepare("SELECT * FROM sync_operations ORDER BY id").all();
  const empty = await workspace.preparation.read(trip.tripId);
  expect(empty).toMatchObject({ canPlan: true, epoch: null, preparation: { itemCount: 0 } });
  expect(f.sql().prepare("SELECT * FROM sync_operations ORDER BY id").all()).toEqual(before);
  const draft = await workspace.plan.createDraft(trip.tripId);
  const item = await workspace.plan.save(draft, { ...draft.fields, title: "Guest local walk", startDate: trip.startDate });
  const queue = f.sql().prepare("SELECT * FROM sync_operations ORDER BY id").all();
  const read = await workspace.preparation.read(trip.tripId);
  expect(read).toMatchObject({ canPlan: true, epoch: null, sourceToken: { kind: "LOCAL_MANUAL" }, preparation: { itemCount: 1 } });
  expect(read?.preparation.recent[0].item).toMatchObject({ itemId: item.itemId, title: "Guest local walk", localState: "PENDING" });
  f.close();
  const restored = await f.newOpener()();
  vi.spyOn(guestWorkspace, "openGuestLocalWorkspace").mockResolvedValue(restored);
  const reader = await readTripPreparation();
  const current = await reader.read(trip.tripId);
  expect(current?.preparation.recent[0].item).toMatchObject({ itemId: item.itemId, title: "Guest local walk", localState: "PENDING" });
  const resolved = await reader.resolveItemFromSource(trip.tripId, item.itemId, current!.sourceToken!);
  expect(resolved?.item.itemId).toBe(item.itemId);
  expect(resolved?.epoch).toBeNull();
  expect(f.sql().prepare("SELECT * FROM sync_operations ORDER BY id").all()).toEqual(queue);
  expect(workspace.syncAllowed).toBe(false);
  expect(network).not.toHaveBeenCalled();
});

it("fences stale Guest Preparation callbacks, other Guest data and inventory freeze", async () => {
  const f = fixture();
  const workspace = await f.newOpener()();
  const trip = tripInput();
  await workspace.trips.createTrip(trip);
  const draft = await workspace.plan.createDraft(trip.tripId);
  const saved = await workspace.plan.save(draft, { ...draft.fields, title: "Guest private plan", startDate: "2026-11-08" });
  const read = await workspace.preparation.read(trip.tripId);
  const freeze = await workspace.freezeForInventory();
  await expect(workspace.preparation.read(trip.tripId)).rejects.toThrow("GUEST_INVENTORY_FROZEN");
  await freeze.release();
  expect((await workspace.preparation.read(trip.tripId))?.preparation.itemCount).toBe(1);
  state.principal = { kind: "GUEST", localId: randomUUID() };
  advanceAccountGeneration();
  await expect(workspace.preparation.resolveItemFromSource(trip.tripId, saved.itemId, read!.sourceToken!)).rejects.toThrow();
  const other = await f.newOpener()();
  expect(await other.preparation.read(trip.tripId)).toBeNull();
  state.principal = { kind: "GUEST", localId: f.guestId };
  advanceAccountGeneration();
  const back = await f.newOpener()();
  expect((await back.preparation.read(trip.tripId))?.preparation.recent[0].item.itemId).toBe(saved.itemId);
});
