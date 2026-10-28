import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { createTripCoreV2Repository } from "../repositories/tripCoreV2Repository";
import { createTripRepository } from "../repositories/tripRepository";
import { tripCoreSha256Hex } from "../repositories/tripCoreSha256";
import { runMigrations } from "../db/migrationRunner";
import { serializeDatabaseTransactions } from "../db/databaseConnection";
import { createGuestLocalWorkspaceOpener } from "./guestLocalWorkspace";
import { advanceAccountGeneration } from "./accountGeneration";
import type { LaunchIdentity } from "./guestPrincipalRepository";
import type { CoreDatabase } from "../repositories/tripCoreV2Repository";
import type { MigrationDatabase } from "../db/migrationRunner";

const accountOpener = vi.hoisted(() =>
  vi.fn(() => {
    throw Error("ACCOUNT_DATABASE_FORBIDDEN");
  }),
);
vi.mock("../db/database", () => ({
  openDatabase: accountOpener,
  readInitializedDatabase: accountOpener,
}));
vi.mock("./authRepository", () => ({
  requireActiveUserId: accountOpener,
  requireCommittedGuestPrincipal: accountOpener,
}));
vi.mock("../files/tripPhotoFileStore", () => ({
  retainTripPhoto: accountOpener,
  resolveRetainedTripPhoto: accountOpener,
  probeRetainedTripPhotoIdentity: accountOpener,
  discardRetainedTripPhoto: accountOpener,
}));
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((clean) => clean());
  vi.restoreAllMocks();
  expect(accountOpener).not.toHaveBeenCalled();
});
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "otr-guest-vault-"));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  const opened: { name: string; sql: DatabaseSync }[] = [];
  cleanups.push(() => opened.splice(0).forEach(({ sql }) => sql.close()));
  let principal: LaunchIdentity | null = { kind: "GUEST", localId: randomUUID() };
  const guestId = principal.localId;
  let afterRead: (() => void) | undefined;
  let afterTripInsert: (() => void) | undefined;
  const connect = async (name: string): Promise<CoreDatabase & MigrationDatabase> => {
    const sql = new DatabaseSync(join(directory, name));
    opened.push({ name, sql });
    sql.exec("PRAGMA foreign_keys=ON");
    return {
      async execAsync(q) {
        sql.exec(q);
      },
      async getFirstAsync<T>(q: string, ...params: unknown[]) {
        const result = sql.prepare(q).get(...(params as never[])) ?? null;
        const callback = afterRead;
        afterRead = undefined;
        callback?.();
        return result as T | null;
      },
      async getAllAsync<T>(q: string, ...params: unknown[]) {
        return sql.prepare(q).all(...(params as never[])) as T[];
      },
      async runAsync(q: string, ...params: unknown[]) {
        const result = sql.prepare(q).run(...(params as never[]));
        if (q.startsWith("INSERT INTO local_trip_containers")) {
          const callback = afterTripInsert;
          afterTripInsert = undefined;
          callback?.();
        }
        return result as never;
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
  const open = vi.fn(async (name: string) => {
    expect(name).toMatch(/^otr-guest-[0-9a-f-]+\.db$/);
    return connect(name);
  });
  const newOpener = () =>
    createGuestLocalWorkspaceOpener({ readPrincipal: async () => principal, open });
  return {
    guestId,
    opened,
    open,
    newOpener,
    connect,
    setPrincipal(next: LaunchIdentity | null) {
      principal = next;
    },
    afterTripInsert(callback: () => void) {
      afterTripInsert = callback;
    },
    afterRead(callback: () => void) {
      afterRead = callback;
    },
    close() {
      opened.splice(0).forEach(({ sql }) => sql.close());
    },
  };
}
const tripInput = () => ({
  tripId: randomUUID(),
  operationId: randomUUID(),
  name: "Guest local trip",
  creatorDisplayName: "旅人",
  destination: null,
  startDate: "2026-10-29",
  endDate: "2026-10-30",
});

it("persists Trip edit and P1 through a real file close/reopen with no Accepted authority or network", async () => {
  const network = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
    throw Error("NETWORK_FORBIDDEN");
  });
  const f = fixture();
  const workspace = await f.newOpener()();
  const input = tripInput();
  await workspace.trips.createTrip(input);
  await workspace.trips.createTrip(input);
  expect(await workspace.trips.listTrips()).toHaveLength(1);
  const before = {
    name: input.name,
    destination: null,
    startDate: input.startDate,
    endDate: input.endDate,
  };
  await workspace.trips.updateMetadata({
    operationId: randomUUID(),
    tripId: input.tripId,
    before,
    after: { ...before, name: "Edited Guest trip" },
  });
  const draft = await workspace.plan.createDraft(input.tripId);
  const saved = await workspace.plan.save(draft, {
    ...draft.fields,
    title: "Guest walk",
    startDate: input.startDate,
  });
  expect(saved.localStatus).toBe("PENDING");
  const day = await workspace.days.trip(input.tripId);
  expect(day.observed).toBeNull();
  expect(day.localManual?.items[0]).toMatchObject({
    itemId: saved.itemId,
    title: "Guest walk",
    localState: "PENDING",
  });
  expect(day.localManual?.rows(input.startDate)[0]).toMatchObject({
    itemRef: saved.itemId,
    localState: "PENDING",
  });
  const sql = f.opened[0].sql;
  expect(sql.prepare("SELECT accepted_at FROM local_trip_containers").get()).toEqual({
    accepted_at: null,
  });
  expect(
    sql.prepare("SELECT count(*) AS n FROM trip_core_read_certificates").get(),
  ).toEqual({ n: 0 });
  expect(
    sql
      .prepare("SELECT count(*) AS n FROM sync_operations WHERE status='COMPLETED'")
      .get(),
  ).toEqual({ n: 0 });
  expect(
    sql.prepare("SELECT display_name,status FROM ledger_members").get(),
  ).toMatchObject({ display_name: "旅人", status: "local" });
  f.close();
  advanceAccountGeneration();
  const cold = await f.newOpener()();
  expect((await cold.trips.listTrips())[0].name).toBe("Edited Guest trip");
  expect((await cold.plan.read(input.tripId, saved.itemId)).fields.title).toBe(
    "Guest walk",
  );
  expect((await cold.days.trip(input.tripId)).localManual?.items).toHaveLength(1);
  expect(cold).toMatchObject({ kind: "GUEST_LOCAL", syncAllowed: false });
  expect("resumeCreateTrips" in cold.trips).toBe(false);
  expect(network).not.toHaveBeenCalled();
});

it("rejects Account, signed-out, unchosen and malformed Guest before opening any vault", async () => {
  const f = fixture();
  const open = f.newOpener();
  for (const principal of [
    null,
    { kind: "SIGNED_OUT" as const },
    { kind: "ACCOUNT" as const, accountId: f.guestId },
    { kind: "GUEST" as const, localId: "../otr-mobile" },
  ]) {
    f.setPrincipal(principal);
    await expect(open()).rejects.toThrow();
  }
  expect(f.open).not.toHaveBeenCalled();
});

it("invalidates old handles on same-UUID Account, Guest replacement and failed transition generation", async () => {
  const f = fixture();
  const open = f.newOpener();
  const first = await open();
  const trip = tripInput();
  await first.trips.createTrip(trip);
  f.setPrincipal({ kind: "ACCOUNT", accountId: f.guestId });
  await expect(first.trips.listTrips()).rejects.toThrow("GUEST_LOCAL_SCOPE_CHANGED");
  f.setPrincipal({ kind: "GUEST", localId: f.guestId });
  advanceAccountGeneration();
  await expect(first.trips.createTrip(tripInput())).rejects.toThrow();
  const recovered = await open();
  expect(await recovered.trips.listTrips()).toHaveLength(1);
  expect(f.open).toHaveBeenCalledTimes(1);
  const otherId = randomUUID();
  f.setPrincipal({ kind: "GUEST", localId: otherId });
  await expect(recovered.days.trip(trip.tripId)).rejects.toThrow();
  const other = await open();
  expect(await other.trips.listTrips()).toEqual([]);
  expect(await other.trips.getTrip(trip.tripId)).toBeNull();
  expect(f.opened[0].name).not.toBe(f.opened[1].name);
});

it("discards stale async reads across kind changes and retains the original local data", async () => {
  const f = fixture();
  const open = f.newOpener();
  const workspace = await open();
  const trip = tripInput();
  await workspace.trips.createTrip(trip);
  f.afterRead(() => f.setPrincipal({ kind: "ACCOUNT", accountId: f.guestId }));
  await expect(workspace.trips.getTrip(trip.tripId)).rejects.toThrow(
    "GUEST_LOCAL_SCOPE_CHANGED",
  );
  f.setPrincipal({ kind: "GUEST", localId: f.guestId });
  advanceAccountGeneration();
  expect(await (await open()).trips.listTrips()).toHaveLength(1);
});

it("keeps an existing Account vault unchanged even when its Account UUID equals Guest UUID", async () => {
  const f = fixture();
  const database = await f.connect("otr-mobile.db");
  await runMigrations(database);
  serializeDatabaseTransactions(database);
  const account = async () => f.guestId;
  const core = createTripCoreV2Repository(database, account, tripCoreSha256Hex);
  const accountTrips = createTripRepository(database, account, core);
  const privateTrip = tripInput();
  await accountTrips.createTrip({ ...privateTrip, name: "Account private" });
  const workspace = await f.newOpener()();
  expect(await workspace.trips.listTrips()).toEqual([]);
  expect(await workspace.trips.getTrip(privateTrip.tripId)).toBeNull();
  const guestTrip = tripInput();
  await workspace.trips.createTrip(guestTrip);
  expect(await accountTrips.getTrip(guestTrip.tripId)).toBeNull();
  expect((await accountTrips.listTrips()).map((trip) => trip.name)).toEqual([
    "Account private",
  ]);
});

it("allows local P1 without requiring an Account profile or creator display name", async () => {
  const f = fixture();
  const workspace = await f.newOpener()();
  const { creatorDisplayName: _omitted, ...trip } = tripInput();
  await workspace.trips.createTrip(trip);
  const draft = await workspace.plan.createDraft(trip.tripId);
  await workspace.plan.save(draft, {
    ...draft.fields,
    title: "Anonymous local plan",
    startDate: trip.startDate,
  });
  expect((await workspace.days.trip(trip.tripId)).localManual?.items[0].title).toBe(
    "Anonymous local plan",
  );
});

it("rolls back a partial Trip transaction when its Guest scope changes and permits clean retry", async () => {
  const f = fixture();
  const open = f.newOpener();
  const workspace = await open();
  const trip = tripInput();
  f.afterTripInsert(() => {
    f.setPrincipal({ kind: "ACCOUNT", accountId: f.guestId });
    advanceAccountGeneration();
  });
  await expect(workspace.trips.createTrip(trip)).rejects.toThrow();
  const sql = f.opened[0].sql;
  expect(sql.prepare("SELECT count(*) AS n FROM local_trip_containers").get()).toEqual({
    n: 0,
  });
  expect(sql.prepare("SELECT count(*) AS n FROM sync_operations").get()).toEqual({
    n: 0,
  });
  expect(sql.prepare("SELECT count(*) AS n FROM ledger_members").get()).toEqual({ n: 0 });
  f.setPrincipal({ kind: "GUEST", localId: f.guestId });
  const recovered = await open();
  await recovered.trips.createTrip(trip);
  expect(await recovered.trips.listTrips()).toHaveLength(1);
});

it("uses the existing structured Trip deferred edit without manufacturing a cloud metadata revision", async () => {
  const f = fixture();
  const workspace = await f.newOpener()();
  const trip = { ...tripInput(), syncFormatVersion: 2 as const, destinations: [] };
  await workspace.trips.createTrip(trip);
  const base = await workspace.trips.readDeferredMetadataEditBase(trip.tripId);
  const action = {
    localActionVersion: 1 as const,
    actionId: randomUUID(),
    operationId: randomUUID(),
    tripId: trip.tripId,
    before: base.metadata,
    after: { ...base.metadata, name: "Edited structured Guest trip" },
  };
  await workspace.trips.deferMetadataUpdate(action);
  await workspace.trips.deferMetadataUpdate(action);
  expect((await workspace.trips.getTrip(trip.tripId))?.name).toBe(action.after.name);
  const sql = f.opened[0].sql;
  expect(
    sql.prepare("SELECT count(*) AS n FROM local_trip_metadata_confirmations").get(),
  ).toEqual({ n: 0 });
  expect(
    sql
      .prepare(
        "SELECT count(*) AS n FROM sync_operations WHERE operation_type='TRIP_METADATA_DEFERRED'",
      )
      .get(),
  ).toEqual({ n: 1 });
  expect(() =>
    workspace.trips.deferMetadataUpdate({
      ...action,
      cover: { before: null, after: null },
    }),
  ).toThrow("GUEST_PHOTO_STORAGE_NOT_AVAILABLE");
});
