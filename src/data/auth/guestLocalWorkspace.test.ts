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

const completeExternalInventory = (
  workspace: Awaited<ReturnType<ReturnType<typeof createGuestLocalWorkspaceOpener>>>,
) => ({
  sourceGuestLocalId: workspace.scope.localId,
  generation: workspace.scope.generation,
  files: { status: "COMPLETE" as const, entries: [] },
  liveDrafts: { status: "COMPLETE" as const, entries: [] },
});

it("censuses the real Trip/P1 closure including automatic Ledger and cover rows, without treating missing collectors as empty", async () => {
  const f = fixture();
  const workspace = await f.newOpener()();
  const trip = tripInput();
  await workspace.trips.createTrip(trip);
  const draft = await workspace.plan.createDraft(trip.tripId);
  await workspace.plan.save(draft, {
    ...draft.fields,
    title: "Inventory P1",
    startDate: trip.startDate,
  });
  const partial = await workspace.readCensus();
  expect(partial.readyForServerPreflight).toBe(false);
  expect(partial.inventorySha256).toBeNull();
  expect(partial.totals.files).toBeNull();
  expect(partial.blockers).toContain("FILE_AND_LIVE_DRAFT_COLLECTORS_REQUIRED");
  const complete = await workspace.readCensus(completeExternalInventory(workspace));
  expect(complete.readyForServerPreflight).toBe(true);
  expect(complete.inventorySha256).toMatch(/^[a-f0-9]{64}$/);
  expect(complete.totals).toEqual({
    trips: 1,
    people: 1,
    p1Items: 1,
    files: 0,
    fileBytes: 0,
    liveDrafts: 0,
  });
  expect(
    complete.tables.find((table) => table.name === "account_trip_cover_preferences")
      ?.rows,
  ).toBe(1);
  expect(
    complete.tables.find((table) => table.name === "ledger_actor_context")?.rows,
  ).toBe(1);
  expect(
    (await workspace.readCensus(completeExternalInventory(workspace))).inventorySha256,
  ).toBe(complete.inventorySha256);
});

it("preserves unknown nonempty data as an explicit whole-dataset blocker", async () => {
  const f = fixture();
  const workspace = await f.newOpener()();
  f.opened[0].sql.exec(
    "CREATE TABLE unregistered_guest_data(value TEXT); INSERT INTO unregistered_guest_data VALUES('retain original');",
  );
  const census = await workspace.readCensus(completeExternalInventory(workspace));
  expect(census.readyForServerPreflight).toBe(false);
  expect(census.inventorySha256).toBeNull();
  expect(census.blockers).toContain("UNSUPPORTED_TABLE:unregistered_guest_data");
  expect(census.tables.find((table) => table.name === "unregistered_guest_data")).toEqual(
    { name: "unregistered_guest_data", rows: 1, sha256: null },
  );
  expect(
    f.opened[0].sql.prepare("SELECT value FROM unregistered_guest_data").get(),
  ).toEqual({ value: "retain original" });
});

it("refuses a foreign owner row rather than relabeling it as Guest data", async () => {
  const f = fixture();
  const workspace = await f.newOpener()();
  f.opened[0].sql
    .prepare(
      "INSERT INTO local_trip_containers(account_id,id,create_operation_id,name,created_at,updated_at) VALUES(?,?,?,'Foreign private Trip','2026-10-29','2026-10-29')",
    )
    .run(randomUUID(), randomUUID(), randomUUID());
  await expect(
    workspace.readCensus(completeExternalInventory(workspace)),
  ).rejects.toThrow("GUEST_CENSUS_FOREIGN_OWNER");
});

it("requires live draft and file attestations from the exact Guest scope and preserves concrete external counts", async () => {
  const f = fixture();
  const workspace = await f.newOpener()();
  const external = completeExternalInventory(workspace);
  await expect(
    workspace.readCensus({ ...external, sourceGuestLocalId: randomUUID() }),
  ).rejects.toThrow("GUEST_CENSUS_EXTERNAL_SCOPE");
  await expect(
    workspace.readCensus({ ...external, generation: external.generation + 1 }),
  ).rejects.toThrow("GUEST_CENSUS_EXTERNAL_SCOPE");
  const file = { id: randomUUID(), sha256: "a".repeat(64), bytes: 125 };
  const draft = { id: randomUUID(), sha256: "b".repeat(64), bytes: 32 };
  const census = await workspace.readCensus({
    ...external,
    files: { status: "COMPLETE", entries: [file] },
    liveDrafts: { status: "COMPLETE", entries: [draft] },
  });
  expect(census.totals).toMatchObject({ files: 1, fileBytes: 125, liveDrafts: 1 });
  await expect(
    workspace.readCensus({
      ...external,
      files: { status: "COMPLETE", entries: [file, file] },
    }),
  ).rejects.toThrow("GUEST_CENSUS_DUPLICATE_EXTERNAL_ID");
});

it("keeps the data digest stable across a new runtime generation but changes it for actual Guest edits", async () => {
  const f = fixture();
  const open = f.newOpener();
  const workspace = await open();
  const trip = { ...tripInput(), syncFormatVersion: 2 as const, destinations: [] };
  await workspace.trips.createTrip(trip);
  const original = await workspace.readCensus(completeExternalInventory(workspace));
  advanceAccountGeneration();
  await expect(
    workspace.readCensus(completeExternalInventory(workspace)),
  ).rejects.toThrow();
  const rebound = await open();
  expect(
    (await rebound.readCensus(completeExternalInventory(rebound))).inventorySha256,
  ).toBe(original.inventorySha256);
  const base = await rebound.trips.readDeferredMetadataEditBase(trip.tripId);
  await rebound.trips.deferMetadataUpdate({
    localActionVersion: 1,
    actionId: randomUUID(),
    operationId: randomUUID(),
    tripId: trip.tripId,
    before: base.metadata,
    after: { ...base.metadata, name: "Changed before preflight" },
  });
  expect(
    (await rebound.readCensus(completeExternalInventory(rebound))).inventorySha256,
  ).not.toBe(original.inventorySha256);
});

it.each(["operation", "entity"] as const)(
  "blocks an unsupported queue %s without silently dropping it",
  async (variant) => {
    const f = fixture();
    const workspace = await f.newOpener()();
    await workspace.trips.createTrip(tripInput());
    const sql = f.opened[0].sql;
    const row = sql.prepare("SELECT * FROM sync_operations").get()!;
    const columns = Object.keys(row);
    const next = {
      ...row,
      id: randomUUID(),
      idempotency_key: randomUUID(),
      ...(variant === "operation"
        ? { operation_type: "UNREGISTERED_MUTATION" }
        : { entity_type: "FUTURE_ENTITY" }),
    };
    sql
      .prepare(
        `INSERT INTO sync_operations(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
      )
      .run(...(columns.map((key) => next[key as keyof typeof next]) as never[]));
    const census = await workspace.readCensus(completeExternalInventory(workspace));
    expect(census.blockers).toContain("UNSUPPORTED_OPERATION");
    expect(census.inventorySha256).toBeNull();
    expect(census.tables.find((table) => table.name === "sync_operations")?.rows).toBe(2);
  },
);

it("rejects a same-Guest preference that points outside its owned Trip set", async () => {
  const f = fixture();
  const workspace = await f.newOpener()();
  f.opened[0].sql
    .prepare(
      "INSERT INTO account_trip_cover_preferences(account_id,trip_id,updated_at) VALUES(?,?,'2026-10-29')",
    )
    .run(f.guestId, randomUUID());
  await expect(
    workspace.readCensus(completeExternalInventory(workspace)),
  ).rejects.toThrow("GUEST_CENSUS_FOREIGN_TRIP");
});

it.each(["foreign trip", "non-P1 create", "unregistered P1 command"] as const)(
  "does not qualify a %s Core intent for whole-dataset preflight",
  async (variant) => {
    const f = fixture();
    const workspace = await f.newOpener()();
    const trip = tripInput();
    await workspace.trips.createTrip(trip);
    const draft = await workspace.plan.createDraft(trip.tripId);
    await workspace.plan.save(draft, {
      ...draft.fields,
      title: "Original",
      startDate: trip.startDate,
    });
    const sql = f.opened[0].sql;
    const row = sql.prepare("SELECT * FROM trip_core_pending_intents").get()!;
    const intent = JSON.parse(row.canonical_intent_text as string);
    if (variant === "foreign trip") intent.tripId = randomUUID();
    else if (variant === "non-P1 create") intent.payload.family = "P6";
    else {
      intent.command = "SET_ITEM_STATUS";
      intent.payload = { status: "completed" };
    }
    // Retain the real schema's immutable UPDATE guard; insert a separate malformed fixture.
    intent.operationId = randomUUID();
    const columns = Object.keys(row);
    const next = {
      ...row,
      operation_id: intent.operationId,
      queue_operation_id: intent.operationId,
      canonical_intent_text: JSON.stringify(intent),
    };
    sql
      .prepare(
        `INSERT INTO trip_core_pending_intents(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
      )
      .run(...(columns.map((key) => next[key as keyof typeof next]) as never[]));
    const read = workspace.readCensus(completeExternalInventory(workspace));
    if (variant === "foreign trip")
      await expect(read).rejects.toThrow("GUEST_CENSUS_INTENT_SCOPE");
    else {
      const census = await read;
      expect(census.readyForServerPreflight).toBe(false);
      expect(census.inventorySha256).toBeNull();
      expect(census.blockers).toContain(
        variant === "non-P1 create"
          ? "UNSUPPORTED_CORE_FAMILY"
          : "UNSUPPORTED_CORE_INTENT",
      );
    }
  },
);
