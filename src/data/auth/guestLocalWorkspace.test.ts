import { createGuestHandoffInventory } from "./guestHandoffInventory";
import { createGuestTripDraftInventory } from "./guestTripDraftInventory";
import { createGuestP1DraftInventory } from "./guestP1DraftInventory";
import {
  createGuestAdoptionRecovery,
  type GuestRecoveryFiles,
} from "./guestAdoptionRecovery";
import { hasGuestPublicationHold } from "./guestPublicationHold";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
import { randomUUID } from "node:crypto";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
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
import { advanceAccountGeneration, getAccountGeneration } from "./accountGeneration";
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
  function recoveryFiles(localId: string): GuestRecoveryFiles {
    const recoveryRoot = join(directory, "auth-recovery", localId);
    return {
      async listAttempts() {
        return existsSync(recoveryRoot) ? readdirSync(recoveryRoot) : [];
      },
      async read(id, checkpoint) {
        const file = join(recoveryRoot, id, checkpoint + ".json");
        return existsSync(file) ? readFileSync(file, "utf8") : null;
      },
      async create(id, checkpoint, text) {
        const folder = join(recoveryRoot, id);
        mkdirSync(folder, { recursive: true });
        writeFileSync(join(folder, checkpoint + ".json"), text, { flag: "wx" });
      },
    };
  }
  const files = recoveryFiles(guestId);
  const newOpener = () =>
    createGuestLocalWorkspaceOpener({
      readPrincipal: async () => principal,
      open,
      recoveryFiles,
    });
  return {
    guestId,
    files,
    databasePath: join(directory, `otr-guest-${guestId}.db`),
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

// Synthetic disk fixtures validate only this reader, never Native Guest file production/adoption.
async function captureFixture(
  f: ReturnType<typeof fixture>,
  options: {
    owner?: string;
    tripId?: string | null;
    captureId?: string;
    payloadId?: string;
    bytes?: Uint8Array;
    sha256?: string;
    orphan?: boolean;
  } = {},
) {
  const owner = options.owner ?? f.guestId,
    captureId = options.captureId ?? randomUUID(),
    payloadId = options.payloadId ?? randomUUID();
  const bytes = options.bytes ?? new TextEncoder().encode("Guest original 旅程");
  const sha256 = options.sha256 ?? (await tripCoreSha256Hex(bytes));
  const sql = f.opened[0].sql;
  if (
    !sql
      .prepare("SELECT 1 FROM local_capture_payloads WHERE account_id=? AND id=?")
      .get(owner, payloadId)
  )
    sql
      .prepare(
        "INSERT INTO local_capture_payloads(account_id,id,byte_count,sha256,bytes) VALUES(?,?,CAST(? AS INTEGER),?,?)",
      )
      .run(owner, payloadId, bytes.byteLength, sha256, bytes);
  const tripId = options.tripId ?? null;
  if (!options.orphan)
    sql
      .prepare(
        "INSERT INTO local_capture_inbox(account_id,id,payload_id,kind,original_filename,declared_content_type,created_at,trip_id,state,revision) VALUES(?,?,?,'TEXT',NULL,'text/plain','2026-10-29T00:00:00.000Z',?,?,1)",
      )
      .run(owner, captureId, payloadId, tripId, tripId === null ? "INBOX" : "ASSIGNED");
  return { captureId, payloadId, bytes, sha256 };
}

it("reports an empty Capture family without claiming all Guest files or disk directories are empty", async () => {
  const f = fixture(),
    workspace = await f.newOpener()();
  const result = await workspace.readCaptureInventory();
  expect(result).toMatchObject({
    coverage: "CAPTURE_ONLY",
    status: "CAPTURE_COMPLETE",
    totalPayloads: 0,
    verifiedBytes: 0,
    entries: [],
  });
  expect((await workspace.readCensus()).readyForServerPreflight).toBe(false);
});

it("verifies Guest originals through the owning load seam and retains revisions/metadata hashes without exposing raw bytes", async () => {
  const f = fixture(),
    workspace = await f.newOpener()(),
    trip = tripInput();
  await workspace.trips.createTrip(trip);
  const first = await captureFixture(f, {
    tripId: trip.tripId,
    payloadId: "opaque/payload:id",
    captureId: "opaque-capture",
  });
  await captureFixture(f, { payloadId: first.payloadId });
  const before = f.opened[0].sql
    .prepare("SELECT count(*) AS n FROM sync_operations")
    .get();
  const result = await workspace.readCaptureInventory();
  expect(result.status).toBe("CAPTURE_COMPLETE");
  expect(result.entries).toHaveLength(1);
  expect(result.verifiedBytes).toBe(first.bytes.byteLength);
  expect(result.entries[0]).toMatchObject({
    id: first.payloadId,
    sha256: first.sha256,
    bytes: first.bytes.byteLength,
  });
  expect(result.entries[0].references).toHaveLength(2);
  expect(
    result.entries[0].references.find(
      (reference) => reference.captureId === first.captureId,
    ),
  ).toMatchObject({
    captureId: first.captureId,
    tripId: trip.tripId,
    revision: 1,
    kind: "TEXT",
  });
  expect(JSON.stringify(result)).not.toContain("Guest original");
  expect((await workspace.readCaptureInventory()).inventorySha256).toBe(
    result.inventorySha256,
  );
  expect(
    f.opened[0].sql.prepare("SELECT count(*) AS n FROM sync_operations").get(),
  ).toEqual(before);
  const full = await workspace.readCensus(completeExternalInventory(workspace));
  expect(full.blockers).toContain("UNSUPPORTED_TABLE:local_capture_payloads");
  expect(full.readyForServerPreflight).toBe(false);
});

it("blocks orphan Guest payloads and retains their exact bytes without adopting a partial file selection", async () => {
  const f = fixture(),
    workspace = await f.newOpener()();
  const original = await captureFixture(f, { orphan: true });
  const result = await workspace.readCaptureInventory();
  expect(result).toMatchObject({
    status: "BLOCKED",
    orphanPayloads: 1,
    totalPayloads: 1,
    inventorySha256: null,
    blockers: ["ORPHAN_CAPTURE_PAYLOAD"],
  });
  expect(
    f.opened[0].sql.prepare("SELECT bytes FROM local_capture_payloads").get()?.bytes,
  ).toEqual(original.bytes);
});

it.each(["foreign owner", "foreign trip", "wrong hash", "invalid UTF8"] as const)(
  "rejects %s before qualifying the Capture family",
  async (variant) => {
    const f = fixture(),
      workspace = await f.newOpener()();
    await captureFixture(f, {
      ...(variant === "foreign owner" ? { owner: randomUUID() } : {}),
      ...(variant === "foreign trip" ? { tripId: randomUUID() } : {}),
      ...(variant === "wrong hash" ? { sha256: "b".repeat(64) } : {}),
      ...(variant === "invalid UTF8" ? { bytes: new Uint8Array([255]) } : {}),
    });
    await expect(workspace.readCaptureInventory()).rejects.toThrow();
  },
);

it("rejects a stale Guest reader when the same UUID is now an Account, without returning file metadata", async () => {
  const f = fixture(),
    workspace = await f.newOpener()();
  await captureFixture(f);
  f.afterRead(() => {
    f.setPrincipal({ kind: "ACCOUNT", accountId: f.guestId });
    advanceAccountGeneration();
  });
  await expect(workspace.readCaptureInventory()).rejects.toThrow();
  f.setPrincipal({ kind: "GUEST", localId: f.guestId });
  const rebound = await f.newOpener()();
  expect((await rebound.readCaptureInventory()).entries).toHaveLength(1);
});

it("freezes real Guest Trip/P1 writes while its owning inventory stays readable; release resumes the same draft", async () => {
  const f = fixture(),
    workspace = await f.newOpener()();
  const input = tripInput();
  await workspace.trips.createTrip(input);
  const draft = await workspace.plan.createDraft(input.tripId);
  const lease = await workspace.freezeForInventory();
  const before = (await lease.readCensus()).tables;
  await expect(workspace.trips.createTrip(tripInput())).rejects.toThrow(
    "GUEST_INVENTORY_FROZEN",
  );
  await expect(workspace.trips.selectBuiltInCover(input.tripId, null)).rejects.toThrow(
    "GUEST_INVENTORY_FROZEN",
  );
  await expect(
    workspace.plan.save(draft, {
      ...draft.fields,
      title: "Held draft",
      startDate: input.startDate,
    }),
  ).rejects.toThrow("GUEST_INVENTORY_FROZEN");
  expect((await lease.readCensus()).tables).toEqual(before);
  expect((await lease.readCaptureInventory()).coverage).toBe("CAPTURE_ONLY");
  await expect(workspace.freezeForInventory()).rejects.toThrow(
    "GUEST_INVENTORY_FREEZE_ACTIVE",
  );
  expect(await lease.release()).toBe(true);
  expect(await lease.release()).toBe(false);
  const saved = await workspace.plan.save(draft, {
    ...draft.fields,
    title: "Held draft",
    startDate: input.startDate,
  });
  expect(saved.localStatus).toBe("PENDING");
  await expect(lease.readCensus()).rejects.toThrow("GUEST_INVENTORY_FREEZE_RELEASED");
});
it("shares the write fence across two workspace openers of the same Guest", async () => {
  const f = fixture(),
    a = await f.newOpener()(),
    b = await f.newOpener()();
  const first = await a.freezeForInventory();
  await expect(b.trips.createTrip(tripInput())).rejects.toThrow("GUEST_INVENTORY_FROZEN");
  await expect(b.freezeForInventory()).rejects.toThrow("GUEST_INVENTORY_FREEZE_ACTIVE");
  await first.release();
  const second = await b.freezeForInventory();
  expect(await first.release()).toBe(false);
  await expect(a.trips.createTrip(tripInput())).rejects.toThrow("GUEST_INVENTORY_FROZEN");
  await second.release();
  await a.trips.createTrip(tripInput());
});
it("waits for the currently committing Guest write before taking its inventory freeze", async () => {
  const f = fixture(),
    workspace = await f.newOpener()();
  let pending!: ReturnType<typeof workspace.freezeForInventory>;
  f.afterTripInsert(() => {
    pending = workspace.freezeForInventory();
  });
  await workspace.trips.createTrip(tripInput());
  const lease = await pending;
  expect((await lease.readCensus()).totals.trips).toBe(1);
  await lease.release();
});
it("rejects a stale freeze after the principal changes without opening an Account vault", async () => {
  const f = fixture(),
    workspace = await f.newOpener()(),
    lease = await workspace.freezeForInventory();
  f.setPrincipal({ kind: "ACCOUNT", accountId: randomUUID() });
  await expect(lease.readCensus()).rejects.toThrow("GUEST_LOCAL_SCOPE_CHANGED");
  await expect(lease.release()).rejects.toThrow("GUEST_LOCAL_SCOPE_CHANGED");
});

it("recovers an obsolete prepublication freeze only through a new current Guest scope", async () => {
  const f = fixture(),
    original = await f.newOpener()(),
    old = await original.freezeForInventory();
  advanceAccountGeneration();
  const current = await f.newOpener()(),
    lease = await current.freezeForInventory();
  await expect(old.release()).rejects.toThrow("Account changed");
  await expect(current.trips.createTrip(tripInput())).rejects.toThrow(
    "GUEST_INVENTORY_FROZEN",
  );
  await lease.release();
  await current.trips.createTrip(tripInput());
});

async function preparedPublication(
  f: ReturnType<typeof fixture>,
  workspace: Awaited<ReturnType<ReturnType<typeof f.newOpener>>>,
  schemaId:
    | "otr.auth.guest-adoption-recovery/1"
    | "otr.auth.guest-adoption-recovery/2" = "otr.auth.guest-adoption-recovery/1",
) {
  const recovery = createGuestAdoptionRecovery({
    scope: workspace.scope,
    files: f.files,
    assertGuest: async () => undefined,
  });
  const preparation = {
    schemaId,
    sourceKind: "GUEST" as const,
    sourceGuestLocalId: f.guestId,
    adoptionId: randomUUID(),
    targetAccountId: randomUUID(),
    checkpoint: "PREPARED" as const,
    inventorySha256: "a".repeat(64),
    tripIds: [],
    drafts: [],
  };
  const prepared = await recovery.prepare(preparation);
  return { recovery, preparation, prepared: prepared! };
}
it.each([
  "otr.auth.guest-adoption-recovery/1",
  "otr.auth.guest-adoption-recovery/2",
] as const)(
  "restores a publication hold from %s disk checkpoint without process memory",
  async (schemaId) => {
    const f = fixture(),
      original = await f.newOpener()();
    await original.trips.createTrip(tripInput());
    const { preparation, prepared } = await preparedPublication(f, original, schemaId);
    expect(hasGuestPublicationHold(f.guestId)).toBe(false);
    // Component recovery fixture only: no server request, Provider identity or Adoption PASS.
    await f.files.create(
      preparation.adoptionId,
      "publish-requested",
      canonicalCoreJson({
        schemaId: preparation.schemaId,
        sourceKind: "GUEST",
        sourceGuestLocalId: f.guestId,
        adoptionId: preparation.adoptionId,
        targetAccountId: preparation.targetAccountId,
        checkpoint: "PUBLISH_REQUESTED",
        preparationSha256: prepared.preparationSha256,
      } as Json),
    );
    f.close();
    advanceAccountGeneration();
    const opensBefore = f.open.mock.calls.length;
    await expect(f.newOpener()()).rejects.toThrow("GUEST_PUBLICATION_STATUS_REQUIRED");
    expect(f.open).toHaveBeenCalledTimes(opensBefore);
    const readonly = new DatabaseSync(f.databasePath, { readOnly: true });
    try {
      expect(
        readonly.prepare("SELECT count(*) AS n FROM local_trip_containers").get(),
      ).toEqual({ n: 1 });
    } finally {
      readonly.close();
    }
  },
);
it("immediately fences existing Guest repository references and refuses inventory release after publication request", async () => {
  const f = fixture(),
    workspace = await f.newOpener()(),
    lease = await workspace.freezeForInventory();
  const { recovery, preparation, prepared } = await preparedPublication(f, workspace);
  await recovery.requestPublication(
    preparation.adoptionId,
    preparation.targetAccountId,
    prepared.preparationSha256,
  );
  await expect(lease.release()).rejects.toThrow("GUEST_PUBLICATION_STATUS_REQUIRED");
  await expect(workspace.trips.createTrip(tripInput())).rejects.toThrow(
    "GUEST_PUBLICATION_STATUS_REQUIRED",
  );
  await expect(
    recovery.cancelBeforePublication(preparation.adoptionId, preparation.targetAccountId),
  ).rejects.toThrow("GUEST_ADOPTION_AUTHORITATIVE_STATUS_REQUIRED");
  expect((await lease.readCensus()).totals.trips).toBe(0);
});
it("keeps recovery corruption fail-closed for both new and already-open Guest handles", async () => {
  const f = fixture(),
    workspace = await f.newOpener()();
  await f.files.create(randomUUID(), "prepared", "{}");
  await expect(f.newOpener()()).rejects.toThrow();
  await expect(workspace.trips.createTrip(tripInput())).rejects.toThrow(
    "GUEST_PUBLICATION_STATUS_REQUIRED",
  );
});
it("does not treat a cancelled prepublication attempt as a publication request", async () => {
  const f = fixture(),
    workspace = await f.newOpener()();
  const { recovery, preparation } = await preparedPublication(f, workspace);
  await recovery.cancelBeforePublication(
    preparation.adoptionId,
    preparation.targetAccountId,
  );
  const restored = await f.newOpener()();
  expect(await restored.inspectPublicationRequests()).toEqual([]);
  await restored.trips.createTrip(tripInput());
});

it("serializes opening and migration checks before a queued publication checkpoint", async () => {
  const f = fixture(),
    original = await f.newOpener()();
  const { recovery, preparation, prepared } = await preparedPublication(f, original);
  let entered!: () => void, release!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const events: string[] = [];
  f.open.mockImplementationOnce(async (name) => {
    events.push("OPEN_ENTER");
    entered();
    await waiting;
    events.push("OPEN_FINISHED");
    return f.connect(name);
  });
  f.afterRead(() => {
    events.push("MIGRATIONS_CHECKED");
  });
  const create = f.files.create;
  f.files.create = async (id, checkpoint, text) => {
    if (checkpoint === "publish-requested") events.push("PUBLISH_REQUESTED");
    await create(id, checkpoint, text);
  };
  const opening = f.newOpener()();
  await ready;
  const publishing = recovery.requestPublication(
    preparation.adoptionId,
    preparation.targetAccountId,
    prepared.preparationSha256,
  );
  expect(hasGuestPublicationHold(f.guestId)).toBe(false);
  release();
  const opened = await opening;
  await publishing;
  expect(events).toEqual([
    "OPEN_ENTER",
    "OPEN_FINISHED",
    "MIGRATIONS_CHECKED",
    "PUBLISH_REQUESTED",
  ]);
  await expect(opened.trips.createTrip(tripInput())).rejects.toThrow(
    "GUEST_PUBLICATION_STATUS_REQUIRED",
  );
});

it("does not apply one Guest's recovery hold or files to another Guest scope", async () => {
  const f = fixture(),
    a = await f.newOpener()();
  const { recovery, preparation, prepared } = await preparedPublication(f, a);
  await recovery.requestPublication(
    preparation.adoptionId,
    preparation.targetAccountId,
    prepared.preparationSha256,
  );
  f.setPrincipal({ kind: "GUEST", localId: randomUUID() });
  advanceAccountGeneration();
  const b = await f.newOpener()();
  expect(await b.inspectPublicationRequests()).toEqual([]);
  await b.trips.createTrip(tripInput());
  expect(await b.trips.listTrips()).toHaveLength(1);
});

it.each(["local_trip_containers", "account_trip_cover_preferences"])(
  "blocks retained/unknown cover refs in %s without rewriting the original",
  async (table) => {
    const f = fixture(),
      workspace = await f.newOpener()(),
      trip = tripInput();
    await workspace.trips.createTrip(trip);
    const sql = f.opened[0].sql;
    for (const cover of [`photo-${randomUUID()}`, "unknown-retained-cover"]) {
      sql.prepare(`UPDATE ${table} SET selected_cover_asset_id=?`).run(cover);
      if (table === "local_trip_containers")
        sql
          .prepare(
            "UPDATE account_trip_cover_preferences SET selected_cover_asset_id=NULL",
          )
          .run();
      const census = await workspace.readCensus(completeExternalInventory(workspace));
      expect(census.readyForServerPreflight).toBe(false);
      expect(census.blockers).toContain("UNSUPPORTED_GUEST_COVER_REFERENCE");
      expect(
        sql.prepare(`SELECT selected_cover_asset_id AS cover FROM ${table}`).get(),
      ).toEqual({ cover });
    }
  },
);
it("permits registered static owner-photo assets without treating their names as retained device photos", async () => {
  const f = fixture(),
    workspace = await f.newOpener()(),
    trip = tripInput();
  await workspace.trips.createTrip(trip);
  await workspace.trips.selectBuiltInCover(trip.tripId, "owner-photo-a348f66b8ca5");
  expect(
    (await workspace.readCensus(completeExternalInventory(workspace)))
      .readyForServerPreflight,
  ).toBe(true);
});
it("checks cover references inside the owning deferred operation even when both Trip cover columns are null", async () => {
  const f = fixture(),
    workspace = await f.newOpener()(),
    trip = { ...tripInput(), syncFormatVersion: 2 as const, destinations: [] };
  await workspace.trips.createTrip(trip);
  const base = await workspace.trips.readDeferredMetadataEditBase(trip.tripId);
  const action = {
    localActionVersion: 1 as const,
    actionId: randomUUID(),
    operationId: randomUUID(),
    tripId: trip.tripId,
    before: base.metadata,
    after: { ...base.metadata, name: "Guest edited" },
  };
  await workspace.trips.deferMetadataUpdate(action);
  const sql = f.opened[0].sql;
  const original = sql
    .prepare("SELECT payload_json AS payload FROM sync_operations WHERE id=?")
    .get(action.actionId) as { payload: string };
  for (const cover of [`photo-${randomUUID()}`, "unknown-retained-cover"]) {
    const payload = JSON.stringify({
      ...JSON.parse(original.payload),
      cover: { before: null, after: cover },
    });
    sql
      .prepare("UPDATE sync_operations SET payload_json=? WHERE id=?")
      .run(payload, action.actionId);
    const census = await workspace.readCensus(completeExternalInventory(workspace));
    expect(census.readyForServerPreflight).toBe(false);
    expect(census.blockers).toContain("UNSUPPORTED_GUEST_COVER_REFERENCE");
    expect(
      sql
        .prepare("SELECT payload_json AS payload FROM sync_operations WHERE id=?")
        .get(action.actionId),
    ).toEqual({ payload });
  }
});

it("derives a scoped registered-files-zero qualification from real frozen readers, not supplied COMPLETE metadata", async () => {
  const f = fixture(),
    workspace = await f.newOpener()(),
    trip = tripInput();
  await workspace.trips.createTrip(trip);
  const draft = await workspace.plan.createDraft(trip.tripId);
  await workspace.plan.save(draft, {
    ...draft.fields,
    title: "Qualified Guest P1",
    startDate: trip.startDate,
  });
  expect("readRegisteredFileQualification" in workspace).toBe(false);
  const lease = await workspace.freezeForInventory();
  const proof = await lease.readRegisteredFileQualification();
  expect(proof).toMatchObject({
    schemaId: "otr.auth.guest-registered-file-qualification/1",
    scope: workspace.scope,
    capabilityVersion: "otr.auth.guest-trip-p1-no-file-producers/1",
    coverage: "CURRENT_GUEST_TRIP_P1_REGISTERED_FILES",
    registeredFileCount: 0,
    entries: [],
    physicalDiskEmptyClaim: false,
    accountDirectoriesInspected: false,
  });
  expect(proof.sourceTablesSha256).toMatch(/^[a-f0-9]{64}$/);
  await lease.release();
  await expect(lease.readRegisteredFileQualification()).rejects.toThrow(
    "GUEST_INVENTORY_FREEZE_RELEASED",
  );
});
it.each(["unknown family", "Capture", "photo cover"])(
  "keeps registered-file qualification closed for %s even if a caller supplies empty metadata",
  async (reason) => {
    const f = fixture(),
      workspace = await f.newOpener()(),
      trip = tripInput();
    await workspace.trips.createTrip(trip);
    if (reason === "unknown family")
      f.opened[0].sql.exec(
        "CREATE TABLE unknown_file_refs(id TEXT); INSERT INTO unknown_file_refs VALUES('retained-unknown-reference')",
      );
    if (reason === "Capture") await captureFixture(f);
    if (reason === "photo cover")
      f.opened[0].sql
        .prepare("UPDATE account_trip_cover_preferences SET selected_cover_asset_id=?")
        .run(`photo-${randomUUID()}`);
    const lease = await workspace.freezeForInventory();
    await expect(
      (lease.readRegisteredFileQualification as any)(
        completeExternalInventory(workspace),
      ),
    ).rejects.toThrow("GUEST_REGISTERED_FILES_QUALIFICATION_REQUIRED");
    await lease.release();
    expect(await workspace.trips.listTrips()).toHaveLength(1);
  },
);
it("rejects registered-file qualification after a same-UUID switch to Account kind", async () => {
  const f = fixture(),
    workspace = await f.newOpener()();
  const lease = await workspace.freezeForInventory();
  f.setPrincipal({ kind: "ACCOUNT", accountId: f.guestId });
  await expect(lease.readRegisteredFileQualification()).rejects.toThrow(
    "GUEST_LOCAL_SCOPE_CHANGED",
  );
  f.setPrincipal({ kind: "GUEST", localId: f.guestId });
  await lease.release();
});

async function handoffFixture() {
  const f = fixture(),
    workspace = await f.newOpener()();
  const trip = { ...tripInput(), syncFormatVersion: 2 as const, destinations: [] };
  await workspace.trips.createTrip(trip);
  const base = await workspace.trips.readDeferredMetadataEditBase(trip.tripId);
  const action = {
    localActionVersion: 1 as const,
    actionId: randomUUID(),
    operationId: randomUUID(),
    tripId: trip.tripId,
    before: base.metadata,
    after: { ...base.metadata, name: "Guest deferred metadata" },
  };
  await workspace.trips.deferMetadataUpdate(action);
  const plan = await workspace.plan.createDraft(trip.tripId);
  const saved = await workspace.plan.save(plan, {
    ...plan.fields,
    title: "Guest committed P1",
    startDate: trip.startDate,
  });
  const draft = await workspace.plan.read(trip.tripId, saved.itemId);
  const assertScope = async (scope: typeof workspace.scope) => {
    if (
      scope.localId !== workspace.scope.localId ||
      scope.generation !== workspace.scope.generation ||
      scope.generation !== getAccountGeneration()
    )
      throw Error("OLD_UI_SCOPE");
  };
  const trips = createGuestTripDraftInventory(assertScope),
    p1 = createGuestP1DraftInventory(assertScope);
  const tripResume = vi.fn(),
    p1Resume = vi.fn();
  const tripSnapshot = {
    schemaId: "otr.auth.guest-trip-draft/1" as const,
    draftId: randomUUID(),
    tripId: trip.tripId,
    mode: "EDIT" as const,
    value: {
      fields: {
        before: {
          name: action.after.name,
          destination: null,
          startDate: trip.startDate,
          endDate: trip.endDate,
        },
        beforeCover: null as string | null,
        draftCover: null as string | null,
        coverChanged: false,
        initialDestinations: [],
        destinationItems: [],
        destinationsBefore: [],
        name: "  Unsubmitted Trip edit  ",
        destination: "",
        start: trip.startDate,
        end: trip.endDate,
      },
      context: {
        tripId: trip.tripId,
        syncFormatVersion: 2 as const,
        metadataBase: null,
        deferredMetadataBase: action.after,
        deferredActionId: randomUUID(),
      },
    },
  };
  trips.register({
    freeze: () => ({
      snapshot: structuredClone(tripSnapshot),
      isCurrent: () => true,
      resume: tripResume,
    }),
  });
  p1.register({
    freeze: () => ({
      snapshot: {
        schemaId: "otr.auth.guest-p1-draft/1",
        tripId: trip.tripId,
        itemId: draft.itemId,
        mode: "EDIT",
        fields: { ...draft.fields, title: "  Unsubmitted P1 edit  " },
        initialFields: draft.fields,
        firstAttempt: null,
        placeSelection: null,
      },
      isCurrent: () => true,
      resume: p1Resume,
    }),
  });
  const deps = { openWorkspace: async () => workspace, tripDrafts: trips, p1Drafts: p1 };
  return { f, workspace, trip, trips, p1, tripResume, p1Resume, tripSnapshot, deps };
}
it("combines actual Guest Trip/P1/deferred SQL with both UI snapshots and a calculated file qualification under one held source", async () => {
  const f = await handoffFixture();
  const inventory = await createGuestHandoffInventory(f.deps)();
  expect(inventory.cloudAuthority).toBe(false);
  expect(inventory.census.readyForServerPreflight).toBe(true);
  expect(inventory.census.tripIds).toEqual([f.trip.tripId]);
  expect(inventory.census.totals).toMatchObject({
    trips: 1,
    people: 1,
    p1Items: 1,
    files: 0,
    fileBytes: 0,
    liveDrafts: 2,
  });
  expect(inventory.drafts).toHaveLength(2);
  expect(
    inventory.drafts.map((entry) => JSON.parse(entry.canonicalText).schemaId).sort(),
  ).toEqual(["otr.auth.guest-p1-draft/1", "otr.auth.guest-trip-draft/1"]);
  expect(Object.isFrozen(inventory.census.totals)).toBe(true);
  expect(Object.isFrozen(inventory.drafts[0])).toBe(true);
  await expect(f.workspace.trips.listTrips()).rejects.toThrow("GUEST_INVENTORY_FROZEN");
  await inventory.assertCurrent();
  await Promise.all([
    inventory.resumeGuestBeforePublication(),
    inventory.resumeGuestBeforePublication(),
  ]);
  expect(f.tripResume).toHaveBeenCalledOnce();
  expect(f.p1Resume).toHaveBeenCalledOnce();
  await expect(inventory.assertCurrent()).rejects.toThrow(
    "GUEST_HANDOFF_INVENTORY_RELEASED",
  );
  expect(await f.workspace.trips.listTrips()).toHaveLength(1);
  expect(
    f.f.opened[0].sql.prepare("SELECT count(*) AS n FROM sync_operations").get(),
  ).toEqual({ n: 3 });
});
it.each(["live photo ref", "unconfirmed picker", "unknown persisted family"])(
  "resumes the same source and every frozen editor after unsupported %s",
  async (reason) => {
    const f = await handoffFixture();
    if (reason === "live photo ref")
      f.tripSnapshot.value.fields.beforeCover = `photo-${randomUUID()}`;
    if (reason === "unconfirmed picker")
      f.p1.register({
        freeze() {
          throw Error("UNCONFIRMED_PICKER");
        },
      });
    if (reason === "unknown persisted family")
      f.f.opened[0].sql.exec(
        "CREATE TABLE unsupported_guest_file(value TEXT); INSERT INTO unsupported_guest_file VALUES('retain original')",
      );
    await expect(createGuestHandoffInventory(f.deps)()).rejects.toThrow();
    expect(f.tripResume).toHaveBeenCalledOnce();
    expect(f.p1Resume).toHaveBeenCalledOnce();
    expect(await f.workspace.trips.listTrips()).toHaveLength(1);
  },
);
it("requires authoritative status and retains all source/UI locks after a publish-request marker", async () => {
  const f = await handoffFixture(),
    inventory = await createGuestHandoffInventory(f.deps)();
  const recovery = createGuestAdoptionRecovery({
    scope: inventory.scope,
    files: f.f.files,
    assertGuest: async () => undefined,
  });
  const input = {
    schemaId: "otr.auth.guest-adoption-recovery/2" as const,
    sourceKind: "GUEST" as const,
    sourceGuestLocalId: inventory.scope.localId,
    adoptionId: randomUUID(),
    targetAccountId: randomUUID(),
    checkpoint: "PREPARED" as const,
    inventorySha256: inventory.census.inventorySha256!,
    tripIds: [...inventory.census.tripIds],
    drafts: [...inventory.drafts],
  };
  const prepared = await recovery.prepare(input);
  await recovery.requestPublication(
    input.adoptionId,
    input.targetAccountId,
    prepared!.preparationSha256,
  );
  await expect(inventory.assertCurrent()).rejects.toThrow(
    "GUEST_HANDOFF_STATUS_REQUIRED",
  );
  await expect(inventory.resumeGuestBeforePublication()).rejects.toThrow(
    "GUEST_HANDOFF_STATUS_REQUIRED",
  );
  expect(f.tripResume).not.toHaveBeenCalled();
  expect(f.p1Resume).not.toHaveBeenCalled();
  await expect(f.workspace.trips.listTrips()).rejects.toThrow(
    "GUEST_PUBLICATION_STATUS_REQUIRED",
  );
});
it("rejects a source row changed between qualification and final census and releases the invalid inventory", async () => {
  const f = await handoffFixture();
  const openWorkspace = async () => ({
    ...f.workspace,
    freezeForInventory: async () => {
      const lease = await f.workspace.freezeForInventory();
      return {
        ...lease,
        readRegisteredFileQualification: async () => {
          const proof = await lease.readRegisteredFileQualification();
          f.f.opened[0].sql
            .prepare("UPDATE local_trip_containers SET name='retained concurrent change'")
            .run();
          return proof;
        },
      };
    },
  });
  await expect(
    createGuestHandoffInventory({ ...f.deps, openWorkspace })(),
  ).rejects.toThrow("GUEST_HANDOFF_DATASET_CHANGED_OR_UNSUPPORTED");
  expect(f.tripResume).toHaveBeenCalledOnce();
  expect(f.p1Resume).toHaveBeenCalledOnce();
  expect((await f.workspace.trips.getTrip(f.trip.tripId))!.name).toBe(
    "retained concurrent change",
  );
});

it("retires superseded editor leases after an Account transition without unlocking another Guest scope", async () => {
  const f = await handoffFixture(),
    inventory = await createGuestHandoffInventory(f.deps)();
  f.f.setPrincipal({ kind: "ACCOUNT", accountId: randomUUID() });
  advanceAccountGeneration();
  await expect(inventory.resumeGuestBeforePublication()).rejects.toThrow(
    "GUEST_HANDOFF_INVENTORY_RECOVERY_REQUIRED",
  );
  expect(f.tripResume).toHaveBeenCalledOnce();
  expect(f.p1Resume).toHaveBeenCalledOnce();
  await expect(inventory.assertCurrent()).rejects.toThrow(
    "GUEST_HANDOFF_INVENTORY_RELEASED",
  );
  f.f.setPrincipal({ kind: "GUEST", localId: f.f.guestId });
  const recovered = await f.f.newOpener()();
  expect((await recovered.trips.listTrips())[0].id).toBe(f.trip.tripId);
});

it("serializes a queued publication marker after UI resume under the source release gate", async () => {
  const f = await handoffFixture(),
    events: string[] = [];
  let finishResume!: () => void;
  const waiting = new Promise<void>((resolve) => {
    finishResume = resolve;
  });
  const inventory = await createGuestHandoffInventory({
    ...f.deps,
    tripDrafts: {
      freeze: async (scope) => {
        const lease = await f.trips.freeze(scope);
        return {
          ...lease,
          resume: async () => {
            events.push("UI_RESUME_BEGIN");
            await waiting;
            await lease.resume();
            events.push("UI_RESUMED");
          },
        };
      },
    },
  })();
  const create = f.f.files.create.bind(f.f.files);
  f.f.files.create = async (...args) => {
    if (args[1] === "publish-requested") events.push("PUBLISH_MARKER");
    return create(...args);
  };
  const recovery = createGuestAdoptionRecovery({
    scope: inventory.scope,
    files: f.f.files,
    assertGuest: async () => undefined,
  });
  const input = {
    schemaId: "otr.auth.guest-adoption-recovery/2" as const,
    sourceKind: "GUEST" as const,
    sourceGuestLocalId: inventory.scope.localId,
    adoptionId: randomUUID(),
    targetAccountId: randomUUID(),
    checkpoint: "PREPARED" as const,
    inventorySha256: inventory.census.inventorySha256!,
    tripIds: [...inventory.census.tripIds],
    drafts: [...inventory.drafts],
  };
  const prepared = await recovery.prepare(input);
  const resuming = inventory.resumeGuestBeforePublication();
  await vi.waitFor(() => expect(events).toContain("UI_RESUME_BEGIN"));
  const publishing = recovery.requestPublication(
    input.adoptionId,
    input.targetAccountId,
    prepared!.preparationSha256,
  );
  for (let i = 0; i < 12; i++) await Promise.resolve();
  expect(events).not.toContain("PUBLISH_MARKER");
  finishResume();
  await Promise.all([resuming, publishing]);
  expect(events.indexOf("UI_RESUMED")).toBeLessThan(events.indexOf("PUBLISH_MARKER"));
  await expect(inventory.assertCurrent()).rejects.toThrow(
    "GUEST_HANDOFF_INVENTORY_RELEASED",
  );
  await expect(f.workspace.trips.listTrips()).rejects.toThrow(
    "GUEST_PUBLICATION_STATUS_REQUIRED",
  );
  // Ordering fixture only: no network publisher; cancelled inventory cannot grant publication.
});
