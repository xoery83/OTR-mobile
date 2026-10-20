import {
  readCoreDisplaySnapshot,
  coreDayProjectionContext,
  type CoreDisplayReader,
} from "./coreDayProjectionContext";
import type { ObservedCoreFlightProjection } from "./tripCoreV2DayFeedRepository";
import { projectCoreP5Feed } from "../../domain/trip/tripCoreV2P5DayFeed";

// Reuse the owning accepted snapshot and account/actor certificate gate.
export function createCoreP5DayFeedReader(repository: CoreDisplayReader) {
  return async (tripId: string): Promise<ObservedCoreFlightProjection | null> => {
    const context = await repository.captureContext(tripId);
    const snapshot = await readCoreDisplaySnapshot(repository, context);
    if (!snapshot) return null;
    return {
      sourceStatus: "CURRENTLY_MATCHES_SOURCE",
      projection: projectCoreP5Feed(
        snapshot.graph,
        snapshot.actor,
        coreDayProjectionContext(snapshot, context.generation),
        snapshot.participatingPersonIds,
      ),
    };
  };
}
