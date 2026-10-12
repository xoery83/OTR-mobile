import type { createTripCoreV2Repository } from "./tripCoreV2Repository";
import {
  projectCoreFlightFeed,
  type CoreFlightDayProjection,
} from "../../domain/trip/tripCoreV2DayFeed";
import type { ObservedDayProjection } from "./tripDayReadRepository";

export type ObservedCoreFlightProjection = {
  sourceStatus: ObservedDayProjection["sourceStatus"];
  projection: CoreFlightDayProjection;
};
export function createCoreFlightDayFeedReader(
  repository: Pick<
    ReturnType<typeof createTripCoreV2Repository>,
    "captureContext" | "acceptedSnapshot"
  >,
) {
  return async (tripId: string): Promise<ObservedCoreFlightProjection | null> => {
    const snapshot = await repository.acceptedSnapshot(
      await repository.captureContext(tripId),
    );
    if (!snapshot) return null;
    const c = snapshot.certificate;
    return {
      sourceStatus: "CURRENTLY_MATCHES_SOURCE",
      projection: projectCoreFlightFeed(
        snapshot.graph,
        snapshot.actor,
        {
          epoch: c.epoch,
          revision: c.revision,
          accessRevision: c.access_revision,
          generation: c.applied_generation,
          actorPersonBindingHash: c.actor_person_binding_hash,
          participatingRosterHash: c.roster_hash,
          manifestSha256: c.manifest_sha256,
        },
        snapshot.participatingPersonIds,
      ),
    };
  };
}
