import {
  assertAccountRequestContext,
  captureAccountRequestContext,
  withAccountApplyGate,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import { currencyScale } from "@/domain/ledger/currency";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import type { CoreDatabase } from "./tripCoreV2Repository";
import { requireLocalTripPersonCreator } from "./localTripPersonRepository";
import type { TripPreparationSetup } from "./tripPreparationSetupRepository";

type CurrencyRow = { title: string; code: string; scale: number; updatedAt: string; historyLocked: number };
export type GuestTripCurrency = CurrencyRow & { context: AccountRequestContext };

// Guest-only adapter over its existing local Ledger; never queues a financial mutation.
export function createGuestTripCurrencyRepository(
  database: CoreDatabase,
  owner: () => Promise<string>,
  clock = () => new Date().toISOString(),
) {
  async function readInTransaction(context: AccountRequestContext): Promise<GuestTripCurrency> {
    const creator = await requireLocalTripPersonCreator(database, context, owner);
    if (creator.acceptedAt) throw Error("GUEST_CURRENCY_UNAVAILABLE");
    const row = await database.getFirstAsync<CurrencyRow>(
      `SELECT trip.name AS title,j.settlement_currency AS code,j.settlement_scale AS scale,j.updated_at AS updatedAt,
       (EXISTS(SELECT 1 FROM expenses WHERE trip_id=trip.id) OR EXISTS(SELECT 1 FROM ledger_expenses WHERE journey_id=trip.id) OR EXISTS(SELECT 1 FROM ledger_settlements WHERE journey_id=trip.id)) AS historyLocked
       FROM local_trip_containers trip JOIN ledger_journeys j ON j.journey_id=trip.id
       WHERE trip.account_id=? AND trip.id=? AND trip.accepted_at IS NULL`,
      context.accountId, context.tripId,
    );
    await assertAccountRequestContext(context, owner);
    if (!row || currencyScale(row.code) !== row.scale) throw Error("GUEST_CURRENCY_UNAVAILABLE");
    return { ...row, context };
  }
  async function read(tripId: string) {
    coreUuid.parse(tripId);
    const context = await captureAccountRequestContext(tripId, owner);
    return withAccountApplyGate(async () => {
      let result!: GuestTripCurrency;
      await database.withTransactionAsync(async () => { result = await readInTransaction(context); });
      return result;
    });
  }
  return {
    read,
    async readSetup(tripId: string): Promise<TripPreparationSetup> {
      const value = await read(tripId);
      return {
        context: value.context,
        currency: { state: "AVAILABLE", code: value.code, scale: value.scale, permission: "OWNER", lock: value.historyLocked ? "UNKNOWN" : "NOT_OBSERVED" },
        members: { state: "UNKNOWN" }, invitations: "UNKNOWN", connections: "UNKNOWN",
      };
    },
    async save(before: GuestTripCurrency, code: string) {
      const scale = currencyScale(code);
      if (scale === null) throw Error("INVALID_CURRENCY");
      const expected = Object.freeze({ ...before });
      const context = Object.freeze({ ...expected.context });
      coreUuid.parse(context.tripId);
      return withAccountApplyGate(async () => {
        let result!: GuestTripCurrency;
        await database.withTransactionAsync(async () => {
          const current = await readInTransaction(context);
          if (current.code !== expected.code || current.scale !== expected.scale || current.updatedAt !== expected.updatedAt)
            throw Error("GUEST_CURRENCY_CONFLICT");
          const history = await database.getFirstAsync<{ blocked: number }>(
            `SELECT EXISTS(SELECT 1 FROM expenses WHERE trip_id=?) OR EXISTS(SELECT 1 FROM ledger_expenses WHERE journey_id=?)
             OR EXISTS(SELECT 1 FROM ledger_settlements WHERE journey_id=?) AS blocked`,
            context.tripId, context.tripId, context.tripId,
          );
          if (history?.blocked) throw Error("GUEST_CURRENCY_HISTORY_LOCKED");
          await database.runAsync(
            "UPDATE ledger_journeys SET settlement_currency=?,settlement_scale=?,updated_at=? WHERE journey_id=?",
            code, scale, clock(), context.tripId,
          );
          await assertAccountRequestContext(context, owner);
          result = await readInTransaction(context);
        });
        return result;
      });
    },
  };
}

export async function readGuestTripCurrencyRepository() {
  const { openGuestLocalWorkspace } = await import("../auth/guestLocalWorkspace");
  return (await openGuestLocalWorkspace()).currency;
}
