import type { createTripCoreV2Repository } from "./tripCoreV2Repository";
import type { AccountRequestContext } from "../auth/accountRequestContext";
import type { CoreFlightDayProjection } from "../../domain/trip/tripCoreV2DayFeed";

type Repository = ReturnType<typeof createTripCoreV2Repository>;
export type CoreDisplayReader = Pick<Repository, "captureContext" | "acceptedSnapshot"> &
  Partial<Pick<Repository, "combinedSnapshot">>;

export async function readCoreDisplaySnapshot(
  repository: CoreDisplayReader,
  context: AccountRequestContext,
) {
  return repository.combinedSnapshot
    ? repository.combinedSnapshot(context)
    : repository.acceptedSnapshot(context);
}

export function coreDayProjectionContext(
  snapshot: NonNullable<Awaited<ReturnType<typeof readCoreDisplaySnapshot>>>,
  generation: number,
): CoreFlightDayProjection["source"] & { generation: number } {
  const certificate = snapshot.certificate;
  const localRevision = "localRevision" in snapshot ? snapshot.localRevision : 0;
  const rosterHash =
    certificate?.roster_hash ??
    ("participatingRosterHash" in snapshot ? snapshot.participatingRosterHash : null);
  if (!rosterHash) throw new Error("CORE_LOCAL_ROSTER_REQUIRED");
  const localTargetIds =
    "perTargetAuthority" in snapshot
      ? Object.keys(snapshot.perTargetAuthority)
          .filter((key) => key.startsWith("ITEM:"))
          .map((key) => key.slice(5))
      : [];
  return {
    epoch: certificate?.epoch ?? null,
    revision: certificate?.revision ?? null,
    accessRevision: certificate?.access_revision ?? null,
    actorPersonBindingHash: certificate?.actor_person_binding_hash ?? null,
    manifestSha256: certificate?.manifest_sha256 ?? null,
    participatingRosterHash: rosterHash,
    generation,
    serverGeneration: certificate?.applied_generation ?? null,
    authority: localRevision
      ? certificate
        ? "MIXED"
        : "LOCAL_COMMITTED"
      : "SERVER_ACCEPTED",
    ...(localRevision ? { localRevision, localTargetIds } : {}),
  };
}
