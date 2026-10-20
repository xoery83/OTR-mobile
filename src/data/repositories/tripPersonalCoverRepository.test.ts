import { randomUUID, createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { migrations } from "../db/migrations";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { serializeDatabaseTransactions } from "../db/databaseConnection";
import { buildCoreActorCollection } from "../../../backend/src/tripCoreV2Collection";
import { emptyCoreGraph, type CoreActor } from "@/domain/trip/tripCoreV2Mutation";
import { tripPhotoCoverRef } from "@/domain/trip/tripCoverAssets";
import type { RetainedTripPhoto } from "../files/tripPhotoFileStore";
import * as files from "../files/tripPhotoFileStore";
import { createTripCoreV2Repository, type CoreDatabase } from "./tripCoreV2Repository";
import { createTripRepository } from "./tripRepository";
import { createTripPersonalCoverRepository } from "./tripPersonalCoverRepository";
import { createTripPhotoRepository } from "./tripPhotoRepository";
import { createTripDiscoveryRepository } from "./tripDiscoveryRepository";

const retained = vi.hoisted(() => new Map<string, RetainedTripPhoto>());
vi.mock("../auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("../db/database", () => ({ readInitializedDatabase: vi.fn() }));
vi.mock("../files/tripPhotoFileStore", () => ({
  retainTripPhoto: vi.fn(
    async (input: { accountId: string; tripId: string; assetId: string }) => {
      const photo: RetainedTripPhoto = {
        accountId: input.accountId,
        tripId: input.tripId,
        assetId: input.assetId,
        mimeType: "image/jpeg",
        sizeBytes: 12,
        sha256: "a".repeat(64),
        localUri: `file:///retained/${input.accountId}/${input.tripId}/${input.assetId}.jpg`,
      };
      retained.set(photo.localUri, photo);
      return { photo, createdNew: true };
    },
  ),
  resolveRetainedTripPhoto: vi.fn((photo: RetainedTripPhoto) =>
    JSON.stringify(retained.get(photo.localUri)) === JSON.stringify(photo)
      ? photo.localUri
      : null,
  ),
  probeRetainedTripPhotoIdentity: vi.fn((photo: RetainedTripPhoto) =>
    retained.has(photo.localUri)
      ? {
          uri: photo.localUri,
          sizeBytes: photo.sizeBytes,
          modificationTime: 100,
          creationTime: 50,
        }
      : null,
  ),
  discardRetainedTripPhoto: vi.fn(({ photo }: { photo: RetainedTripPhoto }) =>
    retained.delete(photo.localUri),
  ),
}));
const stamp = "2026-10-20T01:00:00Z";
const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "otr-personal-cover-")),
    path = join(directory, "db.sqlite");
  let sql = new DatabaseSync(path);
  sql.exec("PRAGMA foreign_keys=ON");
  for (const migration of migrations) sql.exec(migration.sql);
  const owner = randomUUID();
  let active: string = owner,
    failLegacy = false,
    failAfterCommit = false;
  let throwGraphRead = false;
  let onAuthorityRead: (() => void) | null = null;
  const queries: string[] = [];
  const account = async () => active;
  const database: CoreDatabase = serializeDatabaseTransactions({
    async getFirstAsync<T>(query: string, ...args: unknown[]) {
      const row = (sql.prepare(query).get(...(args as never[])) ?? null) as T | null;
      if (
        onAuthorityRead &&
        (query.startsWith("SELECT epoch,revision") ||
          query.includes("op.payload_json FROM local_trip_containers trip"))
      ) {
        const action = onAuthorityRead;
        onAuthorityRead = null;
        action();
      }
      return row;
    },
    async getAllAsync<T>(query: string, ...args: unknown[]) {
      queries.push(query);
      if (throwGraphRead && query.includes("trip_core_"))
        throw new Error("UNRELATED_BROKEN_READ_COLLECTION");
      return sql.prepare(query).all(...(args as never[])) as T[];
    },
    async runAsync(query: string, ...args: unknown[]) {
      if (
        failLegacy &&
        query.startsWith("UPDATE local_trip_containers SET selected_cover_asset_id")
      ) {
        failLegacy = false;
        throw new Error("LEGACY_WRITE_FAILED");
      }
      return sql.prepare(query).run(...(args as never[])) as never;
    },
    async withTransactionAsync(work: () => Promise<void>) {
      sql.exec("BEGIN");
      try {
        await work();
        sql.exec("COMMIT");
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
      if (failAfterCommit) {
        failAfterCommit = false;
        throw new Error("LOST_RESULT_AFTER_COMMIT");
      }
    },
  });
  const core = () => createTripCoreV2Repository(database, account, hash, () => stamp);
  const trips = () =>
    createTripRepository(
      database,
      account,
      core(),
      () => stamp,
      async () => "Owner",
    );
  const preferences = () =>
    createTripPersonalCoverRepository(database, account, () => stamp);
  const photos = () =>
    createTripPhotoRepository(database, account, files, randomUUID, () => stamp);
  return {
    get sql() {
      return sql;
    },
    database,
    queries,
    account,
    owner,
    core,
    trips,
    preferences,
    photos,
    async local() {
      return trips().createTrip({
        tripId: randomUUID(),
        operationId: randomUUID(),
        name: "Local trip",
        destination: null,
        startDate: null,
        endDate: null,
      });
    },
    async remote(observer = false, tripId: string = randomUUID()) {
      const actor: CoreActor = {
        accountId: owner,
        tripId,
        active: true,
        canManageShared: false,
        personId: observer ? null : randomUUID(),
        personIds: [],
      };
      actor.personIds = actor.personId ? [actor.personId] : [];
      const collection = await buildCoreActorCollection(
        emptyCoreGraph(),
        actor,
        { epoch: randomUUID(), revision: 1, accessRevision: 1, generatedAt: stamp },
        actor.personId
          ? [
              {
                person_id: actor.personId,
                account_id: owner,
                active: true,
                participating: true,
                revision: 1,
              },
            ]
          : [],
        hash,
      );
      const ctx = await core().captureContext(actor.tripId);
      await core().install(
        await core().beginRefresh(ctx, 1),
        collection.manifest,
        collection.pages,
      );
      return actor.tripId;
    },
    switchTo(id: string) {
      active = id;
      advanceAccountGeneration();
    },
    failLegacy() {
      failLegacy = true;
    },
    failGraphRead() {
      throwGraphRead = true;
    },
    failAfterCommit() {
      failAfterCommit = true;
    },
    onAuthorityRead(action: () => void) {
      onAuthorityRead = action;
    },
    reopen() {
      sql.close();
      sql = new DatabaseSync(path);
      sql.exec("PRAGMA foreign_keys=ON");
    },
    close() {
      sql.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
function request(
  view: NonNullable<
    Awaited<ReturnType<ReturnType<typeof createTripPersonalCoverRepository>["read"]>>
  >,
  after: "city" | null = "city",
) {
  return {
    beforeRaw: view.raw,
    expectedAccessToken: view.accessToken,
    expectedRevision: view.selectionRevision,
    after,
  };
}

it("saves personal cover for a genuine local creator, cold reads, retries, and preserves metadata-only unknown raw", async () => {
  const f = fixture();
  try {
    const trip = await f.local(),
      before = (await f.preferences().read(trip.id))!;
    expect(before).toMatchObject({ raw: null, selectionRevision: 1, canChoose: true });
    const callback = vi.fn(),
      unsubscribe = f.preferences().subscribe(before.context, callback);
    const saved = await f.preferences().save(before.context, request(before));
    expect(saved).toMatchObject({ raw: "city", selectionRevision: 2 });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(await f.preferences().save(before.context, request(before))).toMatchObject({
      raw: "city",
      selectionRevision: 2,
    });
    expect(callback).toHaveBeenCalledTimes(1);
    expect((await f.trips().getTrip(trip.id))?.selectedCoverAssetIdRaw).toBe("city");
    f.reopen();
    expect(await f.preferences().read(trip.id)).toMatchObject({
      raw: "city",
      selectionRevision: 2,
    });
    f.sql
      .prepare(
        "UPDATE local_trip_containers SET selected_cover_asset_id='future-cover-v9'",
      )
      .run();
    const unknown = (await f.preferences().read(trip.id))!;
    expect(unknown.raw).toBe("future-cover-v9");
    const metadata = {
      name: trip.name,
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
    };
    await f.trips().updateMetadata({
      operationId: randomUUID(),
      tripId: trip.id,
      before: metadata,
      after: { ...metadata, name: "Renamed" },
    });
    expect(await f.preferences().read(trip.id)).toMatchObject({
      raw: "future-cover-v9",
      selectionRevision: unknown.selectionRevision,
    });
    const queueCount = f.sql.prepare("SELECT count(*) AS n FROM sync_operations").get();
    const selected = await f.preferences().save(unknown.context, request(unknown, null));
    expect(selected.raw).toBeNull();
    expect(f.sql.prepare("SELECT count(*) AS n FROM sync_operations").get()).toEqual(
      queueCount,
    );
    unsubscribe();
  } finally {
    f.close();
  }
});

it("lawful remote member and owning read-only observer can add/select/read photos without fake local containers", async () => {
  for (const observer of [false, true]) {
    const f = fixture();
    try {
      const tripId = await f.remote(observer),
        before = (await f.preferences().read(tripId))!;
      expect(before).toMatchObject({ raw: null, selectionRevision: 0, canChoose: true });
      expect(await f.trips().canUpdateMetadata(tripId)).toBe(false);
      const syncCount = f.sql.prepare("SELECT count(*) AS n FROM sync_operations").get();
      const photo = await f.photos().addTripPhoto(tripId, "file:///picker/image.jpg");
      expect(photo.localUri).toBeTruthy();
      expect(await f.photos().listTripPhotos(tripId)).toHaveLength(1);
      const afterAdd = (await f.preferences().read(tripId))!;
      expect(afterAdd).toMatchObject({ raw: null, selectionRevision: 1 });
      // Cancel after add retains a library photo but does not select it.
      expect((await f.preferences().read(tripId))?.raw).toBeNull();
      const ref = tripPhotoCoverRef(photo.assetId);
      const selected = await f
        .preferences()
        .save(afterAdd.context, { ...request(afterAdd), after: ref });
      expect(selected).toMatchObject({ raw: ref, selectionRevision: 2 });
      expect(await f.photos().readSelectedTripCoverPhoto(tripId, ref)).toMatchObject({
        assetId: photo.assetId,
      });
      f.reopen();
      expect(await f.preferences().read(tripId)).toMatchObject({
        raw: ref,
        selectionRevision: 2,
      });
      expect(await f.photos().readSelectedTripCoverPhoto(tripId, ref)).toMatchObject({
        assetId: photo.assetId,
      });
      expect(
        f.sql.prepare("SELECT count(*) AS n FROM local_trip_containers").get(),
      ).toEqual({ n: 0 });
      expect(f.sql.prepare("SELECT count(*) AS n FROM sync_operations").get()).toEqual(
        syncCount,
      );
      expect(f.sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      f.close();
    }
  }
});

it("a photo selection is fully verified, scoped, rechoose invalidates warm data, and bad files never mutate choice", async () => {
  const f = fixture();
  try {
    const trip = await f.local(),
      other = await f.local();
    const photo = await f.photos().addTripPhoto(trip.id, "file:///picker/image.jpg"),
      ref = tripPhotoCoverRef(photo.assetId);
    let view = (await f.preferences().read(trip.id))!;
    view = await f.preferences().save(view.context, { ...request(view), after: ref });
    vi.mocked(files.resolveRetainedTripPhoto).mockClear();
    await f.photos().readSelectedTripCoverPhoto(trip.id, ref);
    await f.photos().readSelectedTripCoverPhoto(trip.id, ref);
    expect(files.resolveRetainedTripPhoto).toHaveBeenCalledTimes(1);
    view = await f.preferences().save(view.context, { ...request(view), after: ref });
    expect(files.resolveRetainedTripPhoto).toHaveBeenCalledTimes(2); // full selection verification
    await f.photos().readSelectedTripCoverPhoto(trip.id, ref);
    expect(files.resolveRetainedTripPhoto).toHaveBeenCalledTimes(3); // invalidated warm result
    const otherView = (await f.preferences().read(other.id))!;
    await expect(
      f.preferences().save(otherView.context, { ...request(otherView), after: ref }),
    ).rejects.toThrow("PHOTO_UNAVAILABLE");
    retained.delete(photo.localUri!);
    await expect(
      f.preferences().save(view.context, { ...request(view), after: ref }),
    ).rejects.toThrow("PHOTO_UNAVAILABLE");
    expect(await f.preferences().read(trip.id)).toMatchObject({
      raw: ref,
      selectionRevision: view.selectionRevision,
    });
  } finally {
    f.close();
  }
});

it("denies discovery-only/scope-only/missing/revoked access and cannot resurrect retained private rows after delete", async () => {
  const f = fixture();
  try {
    const absent = randomUUID();
    f.sql.prepare("INSERT INTO trip_core_scopes VALUES(?,?,1,1,0)").run(f.owner, absent);
    const discovery = createTripDiscoveryRepository(f.database, f.account, () => stamp);
    const { captureAccountScope } = await import("../auth/accountRequestContext");
    await discovery.replaceSnapshot(await captureAccountScope(f.account), [
      {
        id: absent,
        name: "Remote cache",
        destination: null,
        startDate: null,
        endDate: null,
        createdAt: stamp,
      },
    ]);
    expect(await f.preferences().read(absent)).toBeNull();
    await expect(f.photos().addTripPhoto(absent, "file:///picker/x.jpg")).rejects.toThrow(
      "TRIP_LOCAL_RECORD_MISSING",
    );
    const trip = await f.local(),
      view = (await f.preferences().read(trip.id))!;
    const photo = await f.photos().addTripPhoto(trip.id, "file:///picker/x.jpg");
    f.sql.prepare("INSERT INTO trip_core_scopes VALUES(?,?,1,1,1)").run(f.owner, trip.id);
    expect(await f.preferences().read(trip.id)).toBeNull();
    await expect(f.preferences().save(view.context, request(view))).rejects.toThrow(
      "ACCESS_UNAVAILABLE",
    );
    expect(await f.photos().listTripPhotos(trip.id)).toEqual([]);
    expect(
      await f
        .photos()
        .readSelectedTripCoverPhoto(trip.id, tripPhotoCoverRef(photo.assetId)),
    ).toBeNull();
    // Delete only the local provenance; private preference/photos remain stored but unreadable.
    f.sql
      .prepare("DELETE FROM local_trip_ledger_bindings WHERE account_id=? AND trip_id=?")
      .run(f.owner, trip.id);
    f.sql
      .prepare("DELETE FROM local_trip_containers WHERE account_id=? AND id=?")
      .run(f.owner, trip.id);
    expect(f.sql.prepare("SELECT count(*) AS n FROM local_trip_photos").get()).toEqual({
      n: 1,
    });
    expect(
      f.sql.prepare("SELECT count(*) AS n FROM account_trip_cover_preferences").get(),
    ).toEqual({ n: 1 });
    expect(await f.preferences().read(trip.id)).toBeNull();
  } finally {
    f.close();
  }
});

it("failed legacy write rolls root back; lost result recovers by exact CAS tuple without duplicate revision", async () => {
  const f = fixture();
  try {
    const trip = await f.local(),
      view = (await f.preferences().read(trip.id))!;
    const callback = vi.fn(),
      unsubscribe = f.preferences().subscribe(view.context, callback);
    f.failLegacy();
    await expect(f.preferences().save(view.context, request(view))).rejects.toThrow(
      "LEGACY_WRITE_FAILED",
    );
    expect(await f.preferences().read(trip.id)).toMatchObject({
      raw: null,
      selectionRevision: 1,
    });
    expect(callback).not.toHaveBeenCalled();
    f.failAfterCommit();
    await expect(f.preferences().save(view.context, request(view))).rejects.toThrow(
      "LOST_RESULT_AFTER_COMMIT",
    );
    f.reopen();
    expect(await f.preferences().save(view.context, request(view))).toMatchObject({
      raw: "city",
      selectionRevision: 2,
    });
    await expect(
      f.preferences().save(view.context, { ...request(view), after: null }),
    ).rejects.toThrow("LOCAL_CONFLICT");
    unsubscribe();
  } finally {
    f.close();
  }
});

it("Account ABA while reading and while retaining refuses late results/writes and cleans only a new unassociated file", async () => {
  const f = fixture();
  try {
    const trip = await f.local(),
      view = (await f.preferences().read(trip.id))!;
    f.onAuthorityRead(() => {
      f.switchTo(randomUUID());
      f.switchTo(f.owner);
    });
    await expect(f.preferences().read(trip.id)).rejects.toThrow("Account changed");
    await expect(f.preferences().save(view.context, request(view))).rejects.toThrow(
      "Account changed",
    );
    const defaultRetain = vi.mocked(files.retainTripPhoto).getMockImplementation()!;
    vi.mocked(files.retainTripPhoto).mockImplementationOnce(async (input) => {
      const result = await defaultRetain(input);
      f.switchTo(randomUUID());
      f.switchTo(f.owner);
      return result;
    });
    await expect(
      f.photos().addTripPhoto(trip.id, "file:///picker/x.jpg"),
    ).rejects.toThrow("Account changed");
    expect(f.sql.prepare("SELECT count(*) AS n FROM local_trip_photos").get()).toEqual({
      n: 0,
    });
    f.switchTo(randomUUID());
    expect(await f.preferences().read(trip.id)).toBeNull();
  } finally {
    f.close();
  }
});

it("MyTrips overlays only same-account listed IDs in bounded batches without loading each Core graph", async () => {
  const f = fixture();
  try {
    const trip = await f.remote(),
      discovery = createTripDiscoveryRepository(f.database, f.account, () => stamp);
    const { captureAccountScope } = await import("../auth/accountRequestContext");
    await discovery.replaceSnapshot(await captureAccountScope(f.account), [
      {
        id: trip,
        name: "Remote",
        destination: null,
        startDate: null,
        endDate: null,
        createdAt: stamp,
      },
    ]);
    const before = (await f.preferences().read(trip))!;
    await f.preferences().save(before.context, request(before));
    f.sql
      .prepare("INSERT INTO account_trip_cover_preferences VALUES(?,?,?,1,?)")
      .run(f.owner, randomUUID(), "coastal", stamp);
    f.sql
      .prepare("INSERT INTO account_trip_cover_preferences VALUES(?,?,?,1,?)")
      .run(randomUUID(), trip, "coastal", stamp);
    f.queries.length = 0;
    const result = await createTripDiscoveryRepository(
      f.database,
      f.account,
    ).readMerged();
    expect(result.trips).toMatchObject([
      { id: trip, selectedCoverAssetIdRaw: "city", personalCoverRevision: 1 },
    ]);
    expect(result.trips).toHaveLength(1);
    expect(
      f.queries.filter((query) => query.includes("account_trip_cover_preferences")),
    ).toHaveLength(1);
    expect(f.queries.some((query) => query.includes("trip_core_"))).toBe(false);
  } finally {
    f.close();
  }
});

it("legacy atomic Editor cover commits use the same subscription and metadata-only/replay/callback errors do not fake failure", async () => {
  const f = fixture();
  try {
    const trip = await f.local(),
      view = (await f.preferences().read(trip.id))!;
    const callback = vi.fn();
    const offThrow = f.preferences().subscribe(view.context, () => {
      throw new Error("UI_LISTENER_FAILED");
    });
    const off = f.preferences().subscribe(view.context, callback);
    const metadata = {
      name: trip.name,
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
    };
    const action = {
      operationId: randomUUID(),
      tripId: trip.id,
      before: metadata,
      after: metadata,
    };
    await expect(
      f.trips().updateMetadata(action, { before: null, after: "city" }),
    ).resolves.toBeUndefined();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(await f.preferences().read(trip.id)).toMatchObject({
      raw: "city",
      selectionRevision: 2,
    });
    expect((await f.trips().listTrips())[0]).toMatchObject({
      selectedCoverAssetIdRaw: "city",
    });
    await f.trips().updateMetadata(action, { before: null, after: "city" });
    expect(callback).toHaveBeenCalledTimes(1);
    await f.trips().updateMetadata({
      ...action,
      operationId: randomUUID(),
      after: { ...metadata, name: "New name" },
    });
    expect(callback).toHaveBeenCalledTimes(1);
    const current = (await f.preferences().read(trip.id))!;
    await expect(
      f.preferences().save(current.context, request(current, null)),
    ).resolves.toMatchObject({ raw: null });
    expect(callback).toHaveBeenCalledTimes(2);
    off();
    offThrow();
  } finally {
    f.close();
  }
});

it("a private preference/photo root and discovery are never read authority", async () => {
  const f = fixture();
  try {
    const trip = randomUUID(),
      asset = randomUUID();
    f.sql
      .prepare("INSERT INTO account_trip_cover_preferences VALUES(?,?,?,1,?)")
      .run(f.owner, trip, tripPhotoCoverRef(asset), stamp);
    f.sql
      .prepare(
        "INSERT INTO local_trip_photos VALUES(?,?,?,'image/jpeg',12,?,'file:///owned/image.jpg',?)",
      )
      .run(f.owner, trip, asset, "a".repeat(64), stamp);
    expect(await f.preferences().read(trip)).toBeNull();
    expect(await f.photos().listTripPhotos(trip)).toEqual([]);
    expect(
      await f.photos().readSelectedTripCoverPhoto(trip, tripPhotoCoverRef(asset)),
    ).toBeNull();
    const ctx = await f.preferences().captureContext(trip);
    await expect(
      f.preferences().save(ctx, {
        beforeRaw: tripPhotoCoverRef(asset),
        expectedAccessToken: "no-authority",
        expectedRevision: 1,
        after: "city",
      }),
    ).rejects.toThrow("ACCESS_UNAVAILABLE");
    expect(
      f.sql
        .prepare("SELECT selected_cover_asset_id FROM account_trip_cover_preferences")
        .get(),
    ).toEqual({ selected_cover_asset_id: tripPhotoCoverRef(asset) });
  } finally {
    f.close();
  }
});

it("schema rejects incomplete certificate; access mismatch cannot downgrade to a private-root permission", async () => {
  const f = fixture();
  try {
    const trip = await f.remote(),
      view = (await f.preferences().read(trip))!;
    await f.preferences().save(view.context, request(view));
    expect(() =>
      f.sql
        .prepare(
          "UPDATE trip_core_read_certificates SET complete=0 WHERE account_id=? AND trip_id=?",
        )
        .run(f.owner, trip),
    ).toThrow("CHECK");
    f.sql
      .prepare(
        "UPDATE trip_core_scopes SET access_revision=2 WHERE account_id=? AND trip_id=?",
      )
      .run(f.owner, trip);
    expect(await f.preferences().read(trip)).toBeNull();
    await expect(f.photos().addTripPhoto(trip, "file:///picker/x.jpg")).rejects.toThrow(
      "TRIP_LOCAL_RECORD_MISSING",
    );
    expect(f.sql.prepare("SELECT count(*) AS n FROM local_trip_photos").get()).toEqual({
      n: 0,
    });
  } finally {
    f.close();
  }
});

it("rejects an old access version even if the same Account and accepted Trip remain lawful", async () => {
  const f = fixture();
  try {
    const trip = await f.remote(),
      view = (await f.preferences().read(trip))!;
    f.sql
      .prepare(
        "UPDATE trip_core_scopes SET refresh_generation=refresh_generation+1 WHERE account_id=? AND trip_id=?",
      )
      .run(f.owner, trip);
    await expect(f.preferences().save(view.context, request(view))).rejects.toThrow(
      "ACCESS_CHANGED",
    );
    const fresh = (await f.preferences().read(trip))!;
    expect(fresh.accessToken).not.toBe(view.accessToken);
    expect(await f.preferences().save(fresh.context, request(fresh))).toMatchObject({
      raw: "city",
      selectionRevision: 1,
    });
  } finally {
    f.close();
  }
});

it("strict local creator private cover is independent of an unrelated broken Core read collection, but never of revocation", async () => {
  const f = fixture();
  try {
    const trip = await f.local();
    await f.remote(false, trip.id);
    f.failGraphRead();
    f.queries.length = 0;
    const view = (await f.preferences().read(trip.id))!;
    expect(view.canChoose).toBe(true);
    const photo = await f.photos().addTripPhoto(trip.id, "file:///picker/x.jpg");
    await f
      .preferences()
      .save(view.context, { ...request(view), after: tripPhotoCoverRef(photo.assetId) });
    expect(
      await f
        .photos()
        .readSelectedTripCoverPhoto(trip.id, tripPhotoCoverRef(photo.assetId)),
    ).not.toBeNull();
    expect(f.queries.some((query) => query.includes("trip_core_"))).toBe(false);
    f.sql
      .prepare("UPDATE trip_core_scopes SET revoked=1 WHERE account_id=? AND trip_id=?")
      .run(f.owner, trip.id);
    expect(await f.preferences().read(trip.id)).toBeNull();
    expect(await f.photos().listTripPhotos(trip.id)).toEqual([]);
  } finally {
    f.close();
  }
});
