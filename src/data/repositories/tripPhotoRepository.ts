import type * as SQLite from "expo-sqlite";
import { parseTripPhotoCoverRef } from "@/domain/trip/tripCoverAssets";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import { createUuid } from "@/domain/localId";
import {
  retainTripPhoto,
  resolveRetainedTripPhoto,
  probeRetainedTripPhotoIdentity,
  isRetainedTripPhotoLocation,
  discardRetainedTripPhoto,
  type RetainedTripPhoto,
  type RetainTripPhotoResult,
} from "../files/tripPhotoFileStore";
import {
  captureAccountScope,
  assertAccountRequestContext,
  assertAccountRequestGeneration,
  withAccountApplyGate,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import { readInitializedDatabase } from "../db/database";
import { requireActiveUserId } from "../auth/authRepository";
import { createPersonalTripCoverAccess } from "./tripPersonalCoverAccess";

type Database = Pick<
  SQLite.SQLiteDatabase,
  "getFirstAsync" | "getAllAsync" | "runAsync" | "withTransactionAsync"
>;
type PhotoFiles = {
  retainTripPhoto: typeof retainTripPhoto;
  resolveRetainedTripPhoto: typeof resolveRetainedTripPhoto;
  discardRetainedTripPhoto: typeof discardRetainedTripPhoto;
  probeRetainedTripPhotoIdentity?: typeof probeRetainedTripPhotoIdentity;
};
type Row = {
  account_id: string;
  trip_id: string;
  asset_id: string;
  mime_type: RetainedTripPhoto["mimeType"];
  size_bytes: number;
  sha256: string;
  local_uri: string;
  created_at: string;
};
export type TripPhoto = {
  tripId: string;
  assetId: string;
  mimeType: RetainedTripPhoto["mimeType"];
  sizeBytes: number;
  sha256: string;
  createdAt: string;
  localUri: string | null;
};
const files: PhotoFiles = {
  retainTripPhoto,
  resolveRetainedTripPhoto,
  probeRetainedTripPhotoIdentity: (photo) => probeRetainedTripPhotoIdentity(photo),
  discardRetainedTripPhoto,
};
function retainedPhoto(row: Row): RetainedTripPhoto {
  return {
    accountId: row.account_id,
    tripId: row.trip_id,
    assetId: row.asset_id,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    localUri: row.local_uri,
  };
}

type CoverState = { row: Row; access: unknown };
type CoverCacheLease = {
  entry?: { signature: string; identity: string; photo: TripPhoto };
};
type CoverCache = {
  accountId: string;
  generation: number;
  trips: Map<string, CoverCacheLease>;
};
// The default file store shares warm navigation results; injected stores stay isolated.
const coverCaches = new WeakMap<PhotoFiles, CoverCache>();
function coverCache(fileStore: PhotoFiles, scope: AccountRequestContext) {
  let cache = coverCaches.get(fileStore);
  if (cache?.accountId !== scope.accountId || cache.generation !== scope.generation) {
    cache = {
      accountId: scope.accountId,
      generation: scope.generation,
      trips: new Map(),
    };
    coverCaches.set(fileStore, cache);
  }
  return cache;
}
function cacheLease(cache: CoverCache, tripId: string) {
  let lease = cache.trips.get(tripId);
  if (!lease) lease = {};
  cache.trips.delete(tripId);
  cache.trips.set(tripId, lease);
  if (cache.trips.size > 64) cache.trips.delete(cache.trips.keys().next().value!);
  return lease;
}
async function readCoverState(
  database: Database,
  scope: AccountRequestContext,
  assetId: string,
  account: () => Promise<string>,
): Promise<CoverState | null> {
  const access = await createPersonalTripCoverAccess(database, account)(scope);
  if (!access) return null;
  const row = await database.getFirstAsync<Row>(
    "SELECT * FROM local_trip_photos WHERE account_id=? AND trip_id=? AND asset_id=?",
    scope.accountId,
    scope.tripId,
    assetId,
  );
  const preference = await database.getFirstAsync<{
    selected_cover_asset_id: string | null;
    selection_revision: number;
  }>(
    "SELECT selected_cover_asset_id,selection_revision FROM account_trip_cover_preferences WHERE account_id=? AND trip_id=?",
    scope.accountId,
    scope.tripId,
  );
  return row ? { row, access: [access, preference] } : null;
}
function probe(row: Row, fileStore: PhotoFiles) {
  try {
    const identity = fileStore.probeRetainedTripPhotoIdentity?.(retainedPhoto(row));
    return identity ? JSON.stringify(identity) : null;
  } catch {
    return null;
  }
}
async function readCachedCover(
  database: Database,
  account: () => Promise<string>,
  scope: AccountRequestContext,
  raw: unknown,
  fileStore: PhotoFiles,
): Promise<TripPhoto | null> {
  await assertAccountRequestContext(scope, account);
  const cache = coverCache(fileStore, scope);
  const lease = cacheLease(cache, scope.tripId);
  const assetId = parseTripPhotoCoverRef(raw);
  if (!assetId) return null;
  const state = await readCoverState(database, scope, assetId, account);
  await assertAccountRequestContext(scope, account);
  if (!state) {
    delete lease.entry;
    return null;
  }
  const signature = JSON.stringify([raw, state]);
  const cached = lease.entry;
  const latest = await readCoverState(database, scope, assetId, account);
  await assertAccountRequestContext(scope, account);
  if (
    coverCaches.get(fileStore) !== cache ||
    cache.trips.get(scope.tripId) !== lease ||
    JSON.stringify([raw, latest]) !== signature
  ) {
    delete lease.entry;
    return null;
  }
  const before = probe(state.row, fileStore);
  const photo =
    before && cached?.signature === signature && cached.identity === before
      ? { ...cached.photo }
      : decode(state.row, fileStore);
  const after = probe(state.row, fileStore);
  assertAccountRequestGeneration(scope);
  if (before && before !== after) {
    delete lease.entry;
    return null;
  }
  if (photo.localUri && before && before === after) {
    lease.entry = { signature, identity: before, photo: { ...photo } };
  } else delete lease.entry;
  return photo.localUri ? photo : null;
}

type PersonalCoverListener = { context: AccountRequestContext; callback: () => void };
const personalCoverListeners = new Set<PersonalCoverListener>();
export function subscribePersonalTripCover(
  context: AccountRequestContext,
  callback: () => void,
) {
  assertAccountRequestGeneration(context);
  const listener = { context: Object.freeze({ ...context }), callback };
  personalCoverListeners.add(listener);
  return () => {
    personalCoverListeners.delete(listener);
  };
}
/** Synchronous post-commit handoff only. Listener failure cannot undo a successful save. */
export function announcePersonalTripCoverAfterCommit(context: AccountRequestContext) {
  try {
    assertAccountRequestGeneration(context);
  } catch {
    return;
  }
  const cache = coverCaches.get(files);
  if (cache?.accountId === context.accountId && cache.generation === context.generation)
    cache.trips.delete(context.tripId);
  for (const listener of personalCoverListeners) {
    if (
      listener.context.accountId !== context.accountId ||
      listener.context.tripId !== context.tripId ||
      listener.context.generation !== context.generation
    )
      continue;
    try {
      assertAccountRequestGeneration(context);
      listener.callback();
    } catch {
      /* Preserve the committed result. */
    }
  }
}

function decode(
  row: Row,
  fileStore: Pick<PhotoFiles, "resolveRetainedTripPhoto">,
): TripPhoto {
  let uri: string | null;
  try {
    uri = fileStore.resolveRetainedTripPhoto(retainedPhoto(row));
  } catch {
    uri = null;
  }
  return {
    tripId: row.trip_id,
    assetId: row.asset_id,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    createdAt: row.created_at,
    localUri:
      uri !== null &&
      (uri === row.local_uri || isRetainedTripPhotoLocation(retainedPhoto(row), uri))
        ? uri
        : null,
  };
}

// Reuses the caller's Account gate/transaction, including metadata's atomic save.
export async function readSelectedTripCoverPhotoInScope(
  database: Database,
  account: () => Promise<string>,
  scope: AccountRequestContext,
  raw: unknown,
  fileStore: Pick<PhotoFiles, "resolveRetainedTripPhoto"> = files,
): Promise<TripPhoto | null> {
  await assertAccountRequestContext(scope, account);
  const assetId = parseTripPhotoCoverRef(raw);
  if (!assetId) return null;
  const access = await createPersonalTripCoverAccess(database, account)(scope);
  const row = access
    ? await database.getFirstAsync<Row>(
        "SELECT * FROM local_trip_photos WHERE account_id=? AND trip_id=? AND asset_id=?",
        scope.accountId,
        scope.tripId,
        assetId,
      )
    : null;
  await assertAccountRequestContext(scope, account);
  const photo = row ? decode(row, fileStore) : null;
  await assertAccountRequestContext(scope, account);
  return photo?.localUri ? photo : null;
}

// Only local Trip-owned images; neither a Day association nor a cloud upload.
export function createTripPhotoRepository(
  database: Database,
  account: () => Promise<string>,
  fileStore: PhotoFiles = files,
  uuid: () => string = createUuid,
  clock = () => new Date().toISOString(),
) {
  return {
    async readSelectedTripCoverPhoto(
      tripId: string,
      raw: unknown,
    ): Promise<TripPhoto | null> {
      coreUuid.parse(tripId);
      const scope = { ...(await captureAccountScope(account)), tripId };
      return withAccountApplyGate(async () => {
        let result: TripPhoto | null = null;
        await database.withTransactionAsync(async () => {
          result = await readCachedCover(database, account, scope, raw, fileStore);
        });
        await assertAccountRequestContext(scope, account);
        return result;
      });
    },
    /** Call only after the owning selection save committed, never on picker open/cancel. */
    async invalidateSelectedTripCoverPhotoAfterCommit(context: AccountRequestContext) {
      coreUuid.parse(context.tripId);
      await assertAccountRequestContext(context, account);
      const cache = coverCaches.get(fileStore);
      if (
        cache?.accountId === context.accountId &&
        cache.generation === context.generation
      )
        cache.trips.delete(context.tripId);
    },
    async listTripPhotos(tripId: string): Promise<TripPhoto[]> {
      coreUuid.parse(tripId);
      const scope = { ...(await captureAccountScope(account)), tripId };
      return withAccountApplyGate(async () => {
        let photos: TripPhoto[] = [];
        await database.withTransactionAsync(async () => {
          const access = await createPersonalTripCoverAccess(database, account)(scope);
          if (!access) return;
          const rows = await database.getAllAsync<Row>(
            "SELECT * FROM local_trip_photos WHERE account_id=? AND trip_id=? ORDER BY created_at DESC,asset_id",
            scope.accountId,
            tripId,
          );
          await assertAccountRequestContext(scope, account);
          photos = rows.map((row) => decode(row, fileStore));
          await assertAccountRequestContext(scope, account);
        });
        await assertAccountRequestContext(scope, account);
        return photos;
      });
    },
    async addTripPhoto(tripId: string, temporaryFileUri: string): Promise<TripPhoto> {
      coreUuid.parse(tripId);
      const assetId = coreUuid.parse(uuid());
      const scope = { ...(await captureAccountScope(account)), tripId };
      return withAccountApplyGate(async () => {
        await assertAccountRequestContext(scope, account);
        const readAccess = createPersonalTripCoverAccess(database, account);
        let accessToken: string | null = null;
        await database.withTransactionAsync(async () => {
          accessToken = (await readAccess(scope))?.token ?? null;
        });
        if (!accessToken) throw new Error("TRIP_LOCAL_RECORD_MISSING");
        let retained: RetainTripPhotoResult | null = null;
        let row: Row;
        try {
          retained = await fileStore.retainTripPhoto({
            accountId: scope.accountId,
            tripId,
            assetId,
            temporaryUri: temporaryFileUri,
          });
          await assertAccountRequestContext(scope, account);
          row = {
            account_id: scope.accountId,
            trip_id: tripId,
            asset_id: assetId,
            mime_type: retained.photo.mimeType,
            size_bytes: retained.photo.sizeBytes,
            sha256: retained.photo.sha256,
            local_uri: retained.photo.localUri,
            created_at: clock(),
          };
          await database.withTransactionAsync(async () => {
            if ((await readAccess(scope))?.token !== accessToken)
              throw new Error("TRIP_COVER_ACCESS_CHANGED");
            await database.runAsync(
              `INSERT INTO account_trip_cover_preferences(account_id,trip_id,selected_cover_asset_id,selection_revision,updated_at)
               VALUES(?,?,NULL,1,?) ON CONFLICT(account_id,trip_id) DO NOTHING`,
              scope.accountId,
              tripId,
              clock(),
            );
            await database.runAsync(
              "INSERT INTO local_trip_photos(account_id,trip_id,asset_id,mime_type,size_bytes,sha256,local_uri,created_at) VALUES(?,?,?,?,?,?,?,?)",
              row.account_id,
              row.trip_id,
              row.asset_id,
              row.mime_type,
              row.size_bytes,
              row.sha256,
              row.local_uri,
              row.created_at,
            );
            await assertAccountRequestContext(scope, account);
          });
        } catch (error) {
          if (retained?.createdNew) fileStore.discardRetainedTripPhoto(retained);
          throw error;
        }
        return decode(row, fileStore);
      });
    },
  };
}

export async function readLocalTripPhotoRepository() {
  return createTripPhotoRepository(await readInitializedDatabase(), requireActiveUserId);
}
