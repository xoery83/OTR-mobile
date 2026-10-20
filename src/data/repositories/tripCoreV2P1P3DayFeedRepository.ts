import {
  readCoreDisplaySnapshot,
  coreDayProjectionContext,
  type CoreDisplayReader,
} from "./coreDayProjectionContext";
import type { ObservedCoreFlightProjection } from "./tripCoreV2DayFeedRepository";
import { projectCoreP1P3Feed } from "../../domain/trip/tripCoreV2P1P3DayFeed";

// No install/refresh/write surface; only the existing accepted read2 certificate.
export function createCoreP1P3DayFeedReader(repository: CoreDisplayReader) {
  return async (tripId: string): Promise<ObservedCoreFlightProjection | null> => {
    const context = await repository.captureContext(tripId);
    const snapshot = await readCoreDisplaySnapshot(repository, context);
    if (!snapshot) return null;
    return {
      sourceStatus: "CURRENTLY_MATCHES_SOURCE",
      projection: projectCoreP1P3Feed(
        snapshot.graph,
        snapshot.actor,
        coreDayProjectionContext(snapshot, context.generation),
        snapshot.participatingPersonIds,
      ),
    };
  };
}
