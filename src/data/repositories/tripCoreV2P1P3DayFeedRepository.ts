import type { createTripCoreV2Repository } from "./tripCoreV2Repository";
import type { ObservedCoreFlightProjection } from "./tripCoreV2DayFeedRepository";
import { projectCoreP1P3Feed } from "../../domain/trip/tripCoreV2P1P3DayFeed";

// No install/refresh/write surface; only the existing accepted read2 certificate.
export function createCoreP1P3DayFeedReader(
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
      projection: projectCoreP1P3Feed(
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
