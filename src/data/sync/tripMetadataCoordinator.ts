// The existing owning Backend must install its durable update port before dispatch.
export function createNativeTripMetadataSyncRunner(
  portEnabled: () => boolean = () => false,
) {
  return async () => {
    if (!portEnabled()) return { status: "closed" as const, processedCount: 0 };
    const [
      { requireActiveUserId },
      { readInitializedDatabase },
      { readLocalTripRepository },
      { createSyncOperationRepository },
      { createTripMetadataSyncCoordinator, createTripMetadataSyncWorker },
      { createTripMetadataTransport },
    ] = await Promise.all([
      import("@/data/auth/authRepository"),
      import("@/data/db/database"),
      import("@/data/repositories/tripRepository"),
      import("./syncOperationRepository"),
      import("./tripMetadataSyncWorker"),
      import("./tripMetadataTransport"),
    ]);
    if (!portEnabled()) return { status: "closed" as const, processedCount: 0 };
    const repository = await readLocalTripRepository();
    return createTripMetadataSyncCoordinator(
      createSyncOperationRepository(await readInitializedDatabase(), requireActiveUserId),
      createTripMetadataSyncWorker(
        repository,
        createTripMetadataTransport(requireActiveUserId),
        requireActiveUserId,
      ),
      repository,
      portEnabled,
    ).run("AUTHENTICATED_ONLINE");
  };
}
export async function isTripMetadataSyncEnabled() {
  if (process.env.EXPO_PUBLIC_OTR_TRIP_METADATA_UPDATE !== "1") return false;
  const { getSyncTransportMode } = await import("./transportSelection");
  return getSyncTransportMode() === "dev";
}
export async function runNativeTripMetadataSync() {
  const enabled = await isTripMetadataSyncEnabled();
  return createNativeTripMetadataSyncRunner(() => enabled)();
}
