import { loadDevTripMetadataV2Runtime } from "./tripMetadataRuntime";
import { loadDevCaptureCustody } from "./captureCustodyRuntime";
import { loadDevTripCreateRuntime } from "./tripCreateRuntime";
import { startDevBackend } from "./serverStartup";

// Opt-in image command only. The ordinary server.ts remains CLOSED and unchanged.
async function main() {
  const runtime = await loadDevCaptureCustody(process.env);
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
      metadata = await loadDevTripMetadataV2Runtime(process.env);
    } catch {
      console.info("TRIP_METADATA_RUNTIME_CLOSED");
    }
    server = startDevBackend({
      tripMetadataV2Port: metadata?.tripMetadataV2Port,
      tripCreatePort: trip?.tripCreatePort,
      captureMaterialCustody: runtime?.captureMaterialCustody,
    });
  } catch (error) {
    await metadata?.close();
    await trip?.close();
    await runtime?.close();
    throw error;
  }
  server.once("close", () => {
    void metadata?.close();
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
