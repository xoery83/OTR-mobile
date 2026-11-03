import { pathToFileURL } from "node:url";
import { startSourcePngWorkerHost } from "./sourcePngWorkerHost";

type HostProcess = Pick<NodeJS.Process, "platform" | "arch" | "getuid" | "once" | "exit">;

// Dedicated Host entry only. No env files, PG, Storage or Backend startup are loaded.
export async function runSourcePngWorkerHostMain(
  runtime: HostProcess = process,
  start = startSourcePngWorkerHost,
) {
  if (runtime.platform !== "linux" || runtime.arch !== "x64" || runtime.getuid?.() !== 0)
    throw Error("PNG_WORKER_HOST_IDENTITY_REQUIRED");
  const server = await start({
    directory: "/run/otr/universal-png-worker",
    ownerUid: 0,
    socketGid: 999,
  });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    // Stop accepting immediately; a stuck connection cannot keep this Host alive.
    // Never delete active-worker: interrupted physical execution remains quarantined.
    const deadline = setTimeout(() => runtime.exit(1), 5000);
    deadline.unref();
    try {
      server.close((error) => {
        clearTimeout(deadline);
        runtime.exit(error ? 1 : 0);
      });
    } catch {
      clearTimeout(deadline);
      runtime.exit(1);
    }
  };
  runtime.once("SIGTERM", stop);
  runtime.once("SIGINT", stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await runSourcePngWorkerHostMain();
