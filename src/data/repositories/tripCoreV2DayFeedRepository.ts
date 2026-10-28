import {
  readCoreDisplaySnapshot,
  coreDayProjectionContext,
  type CoreDisplayReader,
} from "./coreDayProjectionContext";
import {
  projectCoreFlightFeed,
  type CoreFlightDayProjection,
} from "../../domain/trip/tripCoreV2DayFeed";
import type { ObservedDayProjection } from "./tripDayReadRepository";

export type ObservedCoreFlightProjection = {
  sourceStatus: ObservedDayProjection["sourceStatus"];
  projection: CoreFlightDayProjection;
};
export function createCoreFlightDayFeedReader(repository: CoreDisplayReader) {
  return async (tripId: string): Promise<ObservedCoreFlightProjection | null> => {
    const context = await repository.captureContext(tripId);
    const snapshot = await readCoreDisplaySnapshot(repository, context);
    if (!snapshot) return null;
    return {
      sourceStatus: "CURRENTLY_MATCHES_SOURCE",
      projection: projectCoreFlightFeed(
        snapshot.graph,
        snapshot.actor,
        coreDayProjectionContext(snapshot, context.generation),
        snapshot.participatingPersonIds,
      ),
    };
  };
}
