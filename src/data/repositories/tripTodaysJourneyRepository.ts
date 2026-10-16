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
      !result.observed ||
      result.observed.sourceStatus !== "CURRENTLY_MATCHES_SOURCE" ||
      result.observed.projection.version !== 2
    )
      return null;
    const projection = result.observed.projection;
    if (
      projection.tripId !== tripId ||
      projection.accountId !== result.scope.accountId ||
      projection.generation !== result.scope.generation
    )
      throw new Error("TODAY_SCOPE");
    const today = selectTodaysJourney(projection, clock);
    return today
      ? { scope: { ...result.scope, tripId }, source: projection.source, today }
      : null;
  }
  return {
    read,
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
