import { loadDevTripMetadataV2Runtime } from "./tripMetadataRuntime";
import { loadDevCaptureCustody } from "./captureCustodyRuntime";
import { loadDevTripCreateRuntime } from "./tripCreateRuntime";
import { startDevBackend } from "./serverStartup";
import { loadDevUniversalRuntime } from "./universalFiniteRuntime";

// Opt-in image command only. The ordinary server.ts remains CLOSED and unchanged.
async function main() {
  let universal: Awaited<ReturnType<typeof loadDevUniversalRuntime>>;
  try {
    universal = await loadDevUniversalRuntime(process.env);
  } catch {
    console.info("UNIVERSAL_RUNTIME_CLOSED");
  }
  let runtime: Awaited<ReturnType<typeof loadDevCaptureCustody>>;
  try {
    runtime = await loadDevCaptureCustody(process.env);
  } catch {
    // An unavailable finite capability must not prevent the closed Backend starting.
    console.info("CAPTURE_RUNTIME_CLOSED");
  }
  let trip: Awaited<ReturnType<typeof loadDevTripCreateRuntime>>;
  let metadata: Awaited<ReturnType<typeof loadDevTripMetadataV2Runtime>>;
  let server: ReturnType<typeof startDevBackend>;
  try {
    try {
      trip = await loadDevTripCreateRuntime(process.env);
    } catch {
      console.info("TRIP_CREATE_RUNTIME_CLOSED");
    }
    try {
      metadata =
        trip && "tripMetadataV2Port" in trip
          ? trip
          : await loadDevTripMetadataV2Runtime(process.env);
    } catch {
      console.info("TRIP_METADATA_RUNTIME_CLOSED");
    }
    server = startDevBackend({
      tripMetadataV2Port: metadata?.tripMetadataV2Port,
      ...(trip && "coreConnection" in trip
        ? { coreConnection: trip.coreConnection }
        : {}),
      tripCreatePort: trip?.tripCreatePort,
      captureMaterialCustody: runtime?.captureMaterialCustody,
      universalImportPort: universal?.universalImportPort,
      publicationCatalogConnection: universal?.catalogConnection,
    });
  } catch (error) {
    await universal?.close();
    if (metadata !== trip) await metadata?.close();
    await trip?.close();
    await runtime?.close();
    throw error;
  }
  server.once("close", () => {
    void universal?.close();
    if (metadata !== trip) void metadata?.close();
    void trip?.close();
    void runtime?.close();
  });
  process.once("SIGTERM", () => server.close());
  process.once("SIGINT", () => server.close());
}
void main().catch(() => {
  console.error("CAPTURE_RUNTIME_UNAVAILABLE");
  process.exitCode = 1;
});
