import { loadDevCaptureCustody } from "./captureCustodyRuntime";
import { startDevBackend } from "./serverStartup";

// Opt-in image command only. The ordinary server.ts remains CLOSED and unchanged.
async function main() {
  const runtime = await loadDevCaptureCustody(process.env);
  let server: ReturnType<typeof startDevBackend>;
  try {
    server = startDevBackend({
      captureMaterialCustody: runtime?.captureMaterialCustody,
    });
  } catch (error) {
    await runtime?.close();
    throw error;
  }
  server.once("close", () => {
    void runtime?.close();
  });
  process.once("SIGTERM", () => server.close());
  process.once("SIGINT", () => server.close());
}
void main().catch(() => {
  console.error("CAPTURE_RUNTIME_UNAVAILABLE");
  process.exitCode = 1;
});
