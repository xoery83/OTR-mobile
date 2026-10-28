import type { LocalManualRead } from "./tripLocalManualReadRepository";
import { readTripDayFeed, type createTripDayFeedReader } from "./tripDayFeedRepository";
import {
  readTripJourneySnapshot,
  type createTripJourneySnapshotReader,
} from "./tripJourneySnapshotRepository";
import { selectTodaysJourney, type TodayClock } from "@/domain/trip/todaysJourney";
import { assertAccountRequestContext } from "../auth/accountRequestContext";
import { requireActiveUserId } from "../auth/authRepository";

type DayReader = ReturnType<typeof createTripDayFeedReader>;
type ItemReader = Pick<ReturnType<typeof createTripJourneySnapshotReader>, "resolveItem">;
export function createTripTodaysJourneyReader(
  days: Pick<DayReader, "trip">,
  items: ItemReader,
  account: () => Promise<string>,
) {
  async function read(tripId: string, clock: TodayClock) {
    const result = await days.trip(tripId);
    await assertAccountRequestContext(result.scope, account);
    if (
      result.localManualStatus === "UNAVAILABLE" ||
      !result.observed ||
      result.observed.sourceStatus !== "CURRENTLY_MATCHES_SOURCE" ||
      result.observed.projection.version !== 2
    )
      return null;
    const projection = result.observed.projection;
    // Core certificate generation and Auth session generation are separate counters.
    if (projection.tripId !== tripId || projection.accountId !== result.scope.accountId)
      throw new Error("TODAY_SCOPE");
    const today = selectTodaysJourney(projection, clock);
    return today
      ? { scope: { ...result.scope, tripId }, source: projection.source, today }
      : null;
  }
  return {
    read,
    // Explicitly separate provenance; consumers must never pass this fingerprint as an epoch.
    async readLocal(tripId: string, clock: TodayClock) {
      const result = await days.trip(tripId);
      await assertAccountRequestContext(result.scope, account);
      const local = result.localManual;
      const today = local?.today(clock);
      return local && today ? { scope: local.scope, source: local.source, today } : null;
    },
    async resolveLocalItem(
      tripId: string,
      itemId: string,
      expected: Pick<LocalManualRead, "scope" | "source">,
    ) {
      await assertAccountRequestContext(expected.scope, account);
      if (expected.scope.tripId !== tripId) return null;
      const result = await days.trip(tripId);
      await assertAccountRequestContext(result.scope, account);
      const local = result.localManual;
      if (
        !local ||
        local.source.fingerprint !== expected.source.fingerprint ||
        local.scope.generation !== expected.scope.generation
      )
        return null;
      const pending = local.items.find((item) => item.itemId === itemId);
      if (pending) return { scope: local.scope, source: local.source, item: pending };
      if (
        result.observed?.projection.version !== 2 ||
        result.observed.sourceStatus !== "CURRENTLY_MATCHES_SOURCE"
      )
        return null;
      const item = await items.resolveItem(
        tripId,
        itemId,
        result.observed.projection.source.epoch,
      );
      await assertAccountRequestContext(result.scope, account);
      return item ? { scope: local.scope, source: local.source, item: item.item } : null;
    },
    async resolveItem(
      tripId: string,
      itemId: string,
      expected: NonNullable<Awaited<ReturnType<typeof read>>>,
      clock: TodayClock,
    ) {
      const current = await read(tripId, clock);
      if (
        expected.scope.tripId !== tripId ||
        !current ||
        current.scope.accountId !== expected.scope.accountId ||
        current.scope.generation !== expected.scope.generation ||
        JSON.stringify(current.source) !== JSON.stringify(expected.source) ||
        current.today.date !== expected.today.date ||
        current.today.zone !== expected.today.zone
      )
        return null;
      const ids = [current.today.primary, ...current.today.later, current.today.tonight];
      if (!ids.some((row) => row?.itemRef === itemId)) return null;
      const item = await items.resolveItem(tripId, itemId, current.source.epoch);
      await assertAccountRequestContext(current.scope, account);
      return item;
    },
  };
}
export async function readTripTodaysJourney() {
  return createTripTodaysJourneyReader(
    await readTripDayFeed(),
    await readTripJourneySnapshot(),
    requireActiveUserId,
  );
}
