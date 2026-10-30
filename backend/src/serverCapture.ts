import { loadDevUniversalContinuousRuntime } from "./universalContinuousRuntime";
import { universalBatchPreparedSchema } from "../../src/data/api/universalImportContracts";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
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
  let settled: Awaited<ReturnType<typeof loadSettledUniversalReadRuntime>> | undefined;
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
  const continuousSelected = process.env.OTR_DEV_UNIVERSAL_CONTINUOUS_HOST !== undefined;
  let continuous: Awaited<ReturnType<typeof loadDevUniversalContinuousRuntime>>;
  try {
    if (
      process.env.OTR_DEV_UNIVERSAL_SETTLED_RECOVERY === undefined &&
      continuousSelected
    )
      continuous = await loadDevUniversalContinuousRuntime(process.env);
  } catch {
    console.info("UNIVERSAL_CONTINUOUS_RUNTIME_CLOSED");
  }
  let universal: Awaited<ReturnType<typeof loadDevUniversalRuntime>>;
  try {
    if (
      process.env.OTR_DEV_UNIVERSAL_SETTLED_RECOVERY === undefined &&
      !continuousSelected
    )
      universal = await loadDevUniversalRuntime(process.env);
  } catch {
    console.info("UNIVERSAL_RUNTIME_CLOSED");
  }
  let originals: Awaited<ReturnType<typeof loadDevUniversalOriginalSourceRuntime>>;
  try {
    if (
      process.env.OTR_DEV_UNIVERSAL_SETTLED_RECOVERY === undefined &&
      !continuousSelected
    )
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
      // Source Review composition is opt-in; SQL capability and Actor checks still own admission.
      trip =
        continuous && process.env.OTR_DEV_UNIVERSAL_P1_SOURCE_REVIEW === "enabled"
          ? await loadDevTripCreateRuntime(process.env, continuous.readPublished)
          : await loadDevTripCreateRuntime(process.env);
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
      ...(continuous
        ? {
            sourcePdfV4PreparationForRequest: continuous.sourcePdfV4PreparationForRequest,
            sourcePdfV2ForRequest: continuous.sourcePdfV2ForRequest,
            universalRuntimeForRequest: async (request, actor) => {
              const scoped = (trip: string) =>
                continuous!.forRequest(request, actor, coreUuid.parse(trip));
              return {
                universalOriginalSourcePort: {
                  async acquire(a, t, input) {
                    return (await scoped(t)).universalOriginalSourcePort.acquire(
                      a,
                      t,
                      input,
                    );
                  },
                  async lookup(a, t, input) {
                    return (await scoped(t)).universalOriginalSourcePort.lookup(
                      a,
                      t,
                      input,
                    );
                  },
                },
                universalImportPort: {
                  async readContext(a, b, t) {
                    return (await scoped(t)).universalImportPort.readContext(a, b, t);
                  },
                  async read(a, b, task) {
                    const trip = coreUuid.parse(
                      new URL(request.url).searchParams.get("tripId"),
                    );
                    return (await scoped(trip)).universalImportPort.read(a, b, task);
                  },
                  async execute(a, b, input) {
                    return (await scoped(input.tripId)).universalImportPort.execute();
                  },
                },
                async prepare(trip, input) {
                  const ports = await scoped(trip),
                    result = universalBatchPreparedSchema.parse(
                      await ports.prepare(trip, input),
                    );
                  if (
                    result.context.actorId !== actor ||
                    result.context.accountId !== actor ||
                    result.context.tripId !== trip
                  )
                    throw Error("UNIVERSAL_CONTEXT_MISMATCH");
                  // Detach only targeted existing Queue work. HTTP returns 202 before Provider I/O.
                  setImmediate(() => {
                    void ports
                      .drainTargeted(result.context.batchId, result.context.taskId)
                      .catch(() => console.info("UNIVERSAL_TARGETED_WAKE_FAILED"));
                  });
                  return result;
                },
              };
            },
          }
        : {}),
      tripMetadataV2Port: metadata?.tripMetadataV2Port,
      ...(trip && "coreConnection" in trip
        ? { coreConnection: trip.coreConnection }
        : {}),
      tripCreatePort: trip?.tripCreatePort,
      ...(trip && "tripPersonCloudCreatePort" in trip
        ? { tripPersonCloudCreatePort: trip.tripPersonCloudCreatePort }
        : {}),
      captureMaterialCustody: runtime?.captureMaterialCustody,
      universalImportPort: settled?.universalImportPort ?? universal?.universalImportPort,
      universalOriginalSourcePort: originals?.universalOriginalSourcePort,
      publicationCatalogConnection:
        settled?.catalogConnection ??
        continuous?.catalogConnection ??
        universal?.catalogConnection ??
        originals?.catalogConnection,
    });
  } catch (error) {
    await settled?.close();
    await continuous?.close();
    await originals?.close();
    await universal?.close();
    if (metadata !== trip) await metadata?.close();
    await trip?.close();
    await runtime?.close();
    throw error;
  }
  server.once("close", () => {
    void settled?.close();
    void continuous?.close();
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
