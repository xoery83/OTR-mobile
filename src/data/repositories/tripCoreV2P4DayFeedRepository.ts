import {
  readCoreDisplaySnapshot,
  coreDayProjectionContext,
  type CoreDisplayReader,
} from "./coreDayProjectionContext";
import type { ObservedCoreFlightProjection } from "./tripCoreV2DayFeedRepository";
import { projectCoreP4Feed } from "../../domain/trip/tripCoreV2P4DayFeed";

// Additive accepted read only; no synthetic authority or separate sync lifecycle.
export function createCoreP4DayFeedReader(repository: CoreDisplayReader) {
  return async (tripId: string): Promise<ObservedCoreFlightProjection | null> => {
    const context = await repository.captureContext(tripId);
    const snapshot = await readCoreDisplaySnapshot(repository, context);
    if (!snapshot) return null;
    return {
      sourceStatus: "CURRENTLY_MATCHES_SOURCE",
      projection: projectCoreP4Feed(
        snapshot.graph,
        snapshot.actor,
        coreDayProjectionContext(snapshot, context.generation),
        snapshot.participatingPersonIds,
      ),
    };
  };
}
