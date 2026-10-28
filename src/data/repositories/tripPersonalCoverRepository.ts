import { coreUuid } from "@/domain/trip/tripCoreV2";
import {
  isTripCoverAssetId,
  parseTripPhotoCoverRef,
  type TripCoverChoice,
} from "@/domain/trip/tripCoverAssets";
import {
  assertAccountRequestContext,
  captureAccountRequestContext,
  withAccountApplyGate,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import { requireActiveUserId } from "../auth/authRepository";
import { readInitializedDatabase } from "../db/database";
import {
  createPersonalTripCoverAccess,
  type PersonalTripCoverAccess,
} from "./tripPersonalCoverAccess";
import {
  announcePersonalTripCoverAfterCommit,
  subscribePersonalTripCover,
  readSelectedTripCoverPhotoInScope,
} from "./tripPhotoRepository";
import type { CoreDatabase } from "./tripCoreV2Repository";

export type PersonalTripCover = Readonly<{
  context: AccountRequestContext;
  canChoose: true;
  raw: string | null;
  selectionRevision: number;
  accessToken: string;
}>;
export type PersonalTripCoverSave = Readonly<{
  beforeRaw: string | null;
  expectedAccessToken: string;
  expectedRevision: number;
  after: TripCoverChoice | null;
}>;
type Row = { selected_cover_asset_id: string | null; selection_revision: number };

export function createTripPersonalCoverRepository(
  database: CoreDatabase,
  account: () => Promise<string>,
  clock = () => new Date().toISOString(),
) {
  const readAccess = createPersonalTripCoverAccess(database, account);
  const readRow = (ctx: AccountRequestContext) =>
    database.getFirstAsync<Row>(
      "SELECT selected_cover_asset_id,selection_revision FROM account_trip_cover_preferences WHERE account_id=? AND trip_id=?",
      ctx.accountId,
      ctx.tripId,
    );
  async function requireAccess(ctx: AccountRequestContext) {
    const access = await readAccess(ctx);
    if (!access) throw new Error("TRIP_COVER_ACCESS_UNAVAILABLE");
    return access;
  }
  function view(
    ctx: AccountRequestContext,
    row: Row | null,
    access: PersonalTripCoverAccess,
  ): PersonalTripCover {
    return {
      context: ctx,
      canChoose: true,
      raw: row?.selected_cover_asset_id ?? null,
      selectionRevision: row?.selection_revision ?? 0,
      accessToken: access.token,
    };
  }
  return {
    captureContext(tripId: string) {
      coreUuid.parse(tripId);
      return captureAccountRequestContext(tripId, account);
    },
    async read(tripId: string): Promise<PersonalTripCover | null> {
      coreUuid.parse(tripId);
      const ctx = await captureAccountRequestContext(tripId, account);
      return withAccountApplyGate(async () => {
        let result: PersonalTripCover | null = null;
        await database.withTransactionAsync(async () => {
          const access = await readAccess(ctx);
          const row = access ? await readRow(ctx) : null;
          await assertAccountRequestContext(ctx, account);
          if (access) result = view(ctx, row, access);
        });
        await assertAccountRequestContext(ctx, account);
        return result;
      });
    },
    async save(
      ctx: AccountRequestContext,
      input: PersonalTripCoverSave,
    ): Promise<PersonalTripCover> {
      ctx = Object.freeze({ ...ctx });
      coreUuid.parse(ctx.tripId);
      // Freeze the attempt before validation/await; callers retry this same tuple after unknown results.
      const request = Object.freeze({ ...input });
      if (
        typeof request.expectedAccessToken !== "string" ||
        !Number.isSafeInteger(request.expectedRevision) ||
        request.expectedRevision < 0 ||
        request.expectedRevision >= Number.MAX_SAFE_INTEGER ||
        (request.beforeRaw !== null &&
          (typeof request.beforeRaw !== "string" ||
            !/^[a-z0-9_-]{1,64}$/.test(request.beforeRaw))) ||
        (request.after !== null &&
          !isTripCoverAssetId(request.after) &&
          !parseTripPhotoCoverRef(request.after))
      )
        throw new Error("TRIP_COVER_INVALID");
      let changed = false;
      return withAccountApplyGate(
        async () => {
          let result!: PersonalTripCover;
          await database.withTransactionAsync(async () => {
            const access = await requireAccess(ctx);
            if (access.token !== request.expectedAccessToken)
              throw new Error("TRIP_COVER_ACCESS_CHANGED");
            const row = await readRow(ctx);
            if (
              row?.selection_revision === request.expectedRevision + 1 &&
              row.selected_cover_asset_id === request.after
            ) {
              result = view(ctx, row, access);
              return;
            }
            if (
              (row?.selection_revision ?? 0) !== request.expectedRevision ||
              (row?.selected_cover_asset_id ?? null) !== request.beforeRaw
            )
              throw new Error("TRIP_COVER_LOCAL_CONFLICT");
            if (
              parseTripPhotoCoverRef(request.after) &&
              !(await readSelectedTripCoverPhotoInScope(
                database,
                account,
                ctx,
                request.after,
              ))
            )
              throw new Error("TRIP_COVER_PHOTO_UNAVAILABLE");
            const now = clock();
            await database.runAsync(
              `INSERT INTO account_trip_cover_preferences(account_id,trip_id,selected_cover_asset_id,selection_revision,updated_at)
             VALUES(?,?,?,?,?) ON CONFLICT(account_id,trip_id) DO UPDATE SET
             selected_cover_asset_id=excluded.selected_cover_asset_id,selection_revision=excluded.selection_revision,updated_at=excluded.updated_at`,
              ctx.accountId,
              ctx.tripId,
              request.after,
              request.expectedRevision + 1,
              now,
            );
            // Compatibility trigger observes the same raw, so it cannot increment twice.
            await database.runAsync(
              "UPDATE local_trip_containers SET selected_cover_asset_id=? WHERE account_id=? AND id=?",
              request.after,
              ctx.accountId,
              ctx.tripId,
            );
            const currentAccess = await requireAccess(ctx);
            if (currentAccess.token !== access.token)
              throw new Error("TRIP_COVER_ACCESS_CHANGED");
            result = view(ctx, await readRow(ctx), access);
            await assertAccountRequestContext(ctx, account);
            changed = true;
          });
          await assertAccountRequestContext(ctx, account);
          return result;
        },
        () => {
          if (changed) announcePersonalTripCoverAfterCommit(ctx);
        },
      );
    },
    subscribe: subscribePersonalTripCover,
  };
}

export async function readLocalTripPersonalCoverRepository() {
  return createTripPersonalCoverRepository(
    await readInitializedDatabase(),
    requireActiveUserId,
  );
}
