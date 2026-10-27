import {
  readCoreDisplaySnapshot,
  coreDayProjectionContext,
  type CoreDisplayReader,
} from "./coreDayProjectionContext";
import type { ObservedCoreFlightProjection } from "./tripCoreV2DayFeedRepository";
import { projectCoreP6Feed } from "../../domain/trip/tripCoreV2P6DayFeed";

// Use the owning accepted snapshot and its account/actor/certificate gate.
export function createCoreP6DayFeedReader(repository: CoreDisplayReader) {
  return async (tripId: string): Promise<ObservedCoreFlightProjection | null> => {
    const context = await repository.captureContext(tripId);
    const snapshot = await readCoreDisplaySnapshot(repository, context);
    if (!snapshot) return null;
    return {
      sourceStatus: "CURRENTLY_MATCHES_SOURCE",
      projection: projectCoreP6Feed(
        snapshot.graph,
        snapshot.actor,
        coreDayProjectionContext(snapshot, context.generation),
        snapshot.participatingPersonIds,
      ),
    };
  };
}
