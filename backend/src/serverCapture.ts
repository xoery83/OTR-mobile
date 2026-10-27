import { loadDevTripMetadataV2Runtime } from "./tripMetadataRuntime";
import { loadDevCaptureCustody } from "./captureCustodyRuntime";
import { loadDevTripCreateRuntime } from "./tripCreateRuntime";
import { startDevBackend } from "./serverStartup";
import { loadDevUniversalRuntime } from "./universalFiniteRuntime";
import { loadDevUniversalOriginalSourceRuntime } from "./universalOriginalSourceRuntime";
import { loadSettledUniversalReadRuntime } from "./universalSettledRecoveryOperator";
import { settledReadSettings } from "./universalSettledReadBootstrap";

// Opt-in image command only. The ordinary server.ts remains CLOSED and unchanged.
async function main() {
  let settled:
    Awaited<ReturnType<typeof loadSettledUniversalReadRuntime>> | undefined;
  try {
    const selection = settledReadSettings(process.env);
    if (selection)
      settled = await loadSettledUniversalReadRuntime(
        { ...selection, startupKind: "HOST" },
        process.env,
      );
  } catch {
    console.info("UNIVERSAL_SETTLED_READ_CLOSED");
    // An explicitly selected recovery must not fall through to a fresh Catalog
    // connection after a denied/burned startup claim.
    if (process.env.OTR_DEV_UNIVERSAL_SETTLED_RECOVERY !== undefined)
      throw Error("UNIVERSAL_SETTLED_READ_STARTUP_CLOSED");
  }
  let universal: Awaited<ReturnType<typeof loadDevUniversalRuntime>>;
  try {
    if (process.env.OTR_DEV_UNIVERSAL_SETTLED_RECOVERY === undefined)
      universal = await loadDevUniversalRuntime(process.env);
  } catch {
    console.info("UNIVERSAL_RUNTIME_CLOSED");
  }
  let originals: Awaited<
    ReturnType<typeof loadDevUniversalOriginalSourceRuntime>
  >;
  try {
    if (process.env.OTR_DEV_UNIVERSAL_SETTLED_RECOVERY === undefined)
      originals = await loadDevUniversalOriginalSourceRuntime(
        process.env,
        universal?.catalogConnection,
      );
  } catch {
    console.info("UNIVERSAL_SOURCE_RUNTIME_CLOSED");
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
      ...(trip && "tripPersonCloudCreatePort" in trip
        ? { tripPersonCloudCreatePort: trip.tripPersonCloudCreatePort }
        : {}),
      captureMaterialCustody: runtime?.captureMaterialCustody,
      universalImportPort:
        settled?.universalImportPort ?? universal?.universalImportPort,
      universalOriginalSourcePort: originals?.universalOriginalSourcePort,
      publicationCatalogConnection:
        settled?.catalogConnection ??
        universal?.catalogConnection ??
        originals?.catalogConnection,
    });
  } catch (error) {
    await settled?.close();
    await originals?.close();
    await universal?.close();
    if (metadata !== trip) await metadata?.close();
    await trip?.close();
    await runtime?.close();
    throw error;
  }
  server.once("close", () => {
    void settled?.close();
    void originals?.close();
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
