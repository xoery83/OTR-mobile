import type * as SQLite from "expo-sqlite";
import { parseTripPhotoCoverRef } from "@/domain/trip/tripCoverAssets";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import { createUuid } from "@/domain/localId";
import {
  retainTripPhoto,
  resolveRetainedTripPhoto,
  discardRetainedTripPhoto,
  type RetainedTripPhoto,
  type RetainTripPhotoResult,
} from "../files/tripPhotoFileStore";
import {
  captureAccountScope,
  assertAccountRequestContext,
  withAccountApplyGate,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import { readInitializedDatabase } from "../db/database";
import { requireActiveUserId } from "../auth/authRepository";

type Database = Pick<
  SQLite.SQLiteDatabase,
  "getFirstAsync" | "getAllAsync" | "runAsync" | "withTransactionAsync"
>;
type PhotoFiles = {
  retainTripPhoto: typeof retainTripPhoto;
  resolveRetainedTripPhoto: typeof resolveRetainedTripPhoto;
  discardRetainedTripPhoto: typeof discardRetainedTripPhoto;
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
  discardRetainedTripPhoto,
};
function decode(
  row: Row,
  fileStore: Pick<PhotoFiles, "resolveRetainedTripPhoto">,
): TripPhoto {
  let uri: string | null;
  try {
    uri = fileStore.resolveRetainedTripPhoto({
      accountId: row.account_id,
      tripId: row.trip_id,
      assetId: row.asset_id,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      sha256: row.sha256,
      localUri: row.local_uri,
    });
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
    localUri: uri === row.local_uri ? uri : null,
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
  const trip = await database.getFirstAsync<{ id: string }>(
    `SELECT id FROM local_trip_containers WHERE account_id=? AND id=?
     AND NOT EXISTS(SELECT 1 FROM trip_core_scopes WHERE account_id=? AND trip_id=? AND revoked<>0)`,
    scope.accountId,
    scope.tripId,
    scope.accountId,
    scope.tripId,
  );
  const row = trip
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
          result = await readSelectedTripCoverPhotoInScope(
            database,
            account,
            scope,
            raw,
            fileStore,
          );
        });
        await assertAccountRequestContext(scope, account);
        return result;
      });
    },
    async listTripPhotos(tripId: string): Promise<TripPhoto[]> {
      coreUuid.parse(tripId);
      const scope = await captureAccountScope(account);
      const rows = await database.getAllAsync<Row>(
        "SELECT * FROM local_trip_photos WHERE account_id=? AND trip_id=? ORDER BY created_at DESC,asset_id",
        scope.accountId,
        tripId,
      );
      await assertAccountRequestContext(scope, account);
      return rows.map((row) => decode(row, fileStore));
    },
    async addTripPhoto(tripId: string, temporaryFileUri: string): Promise<TripPhoto> {
      coreUuid.parse(tripId);
      const assetId = coreUuid.parse(uuid());
      const scope = await captureAccountScope(account);
      return withAccountApplyGate(async () => {
        await assertAccountRequestContext(scope, account);
        const trip = await database.getFirstAsync<{ id: string }>(
          "SELECT id FROM local_trip_containers WHERE account_id=? AND id=?",
          scope.accountId,
          tripId,
        );
        if (!trip) throw new Error("TRIP_LOCAL_RECORD_MISSING");
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
