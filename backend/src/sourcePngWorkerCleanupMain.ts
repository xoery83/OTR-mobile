import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseCoreJson } from "../../src/domain/trip/tripCoreV2Json";
import { sourcePngStorageBindingSchema } from "./sourcePngStorageProducer";
import {
  inventorySourcePngAttempts,
  terminateSourcePngAttempt,
} from "./sourcePngOwnedSandbox";

const directory = "/run/otr/universal-png-worker";
const marker = directory + "/active-worker";
const limit = 16384;
type Files = Pick<typeof import("node:fs/promises"), "lstat" | "open" | "realpath">;
type Runtime = Pick<NodeJS.Process, "platform" | "getuid">;
export type SourcePngCleanupResult = {
  status: "TERMINATED" | "EMPTY_VERIFIED" | "UNVERIFIED" | "UNKNOWN";
  terminated: boolean;
};

// Negative only: no DB, terminal receipt, marker deletion or unbound Docker sweep.
export async function cleanupSourcePngWorkerHost(
  runtime: Runtime = process,
  files: Files = { lstat, open, realpath },
  terminate = terminateSourcePngAttempt,
  inventory = inventorySourcePngAttempts,
): Promise<SourcePngCleanupResult> {
  const unknown = { status: "UNKNOWN", terminated: false } as const;
  if (runtime.platform !== "linux" || runtime.getuid?.() !== 0) return unknown;
  const empty = async (
    status: "TERMINATED" | "EMPTY_VERIFIED",
  ): Promise<SourcePngCleanupResult> =>
    (await inventory()).length === 0
      ? { status, terminated: true }
      : { status: "UNVERIFIED", terminated: false };
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const parent = await files.lstat(directory);
    if (
      !parent.isDirectory() ||
      parent.isSymbolicLink() ||
      parent.uid !== 0 ||
      parent.gid !== 999 ||
      (parent.mode & 0o777) !== 0o750 ||
      (await files.realpath(directory)) !== directory
    )
      return unknown;
    try {
      file = await files.open(
        marker,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return await empty("EMPTY_VERIFIED");
      throw error;
    }
    const before = await file.stat();
    if (
      !before.isFile() ||
      before.uid !== 0 ||
      before.nlink !== 1 ||
      (before.mode & 0o777) !== 0o600 ||
      before.size < 1 ||
      before.size > limit
    )
      return unknown;
    const bytes = Buffer.alloc(limit + 1);
    let count = 0;
    while (count < bytes.length) {
      const read = await file.read(bytes, count, bytes.length - count, count);
      if (!read.bytesRead) break;
      count += read.bytesRead;
    }
    if (count !== before.size || count > limit) return unknown;
    const after = await file.stat(),
      path = await files.lstat(marker);
    for (const key of [
      "dev",
      "ino",
      "uid",
      "mode",
      "nlink",
      "size",
      "mtimeMs",
      "ctimeMs",
    ] as const)
      if (after[key] !== before[key] || path[key] !== before[key]) return unknown;
    if (!path.isFile() || path.isSymbolicLink()) return unknown;
    const binding = sourcePngStorageBindingSchema.parse(
      parseCoreJson(bytes.subarray(0, count).toString("utf8"), limit),
    );
    const result = await terminate(binding);
    return result.terminated === true ? await empty("TERMINATED") : unknown;
  } catch {
    return unknown;
  } finally {
    await file?.close().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await cleanupSourcePngWorkerHost();
  process.stdout.write(JSON.stringify(result) + "\n");
  process.exitCode = result.terminated ? 0 : 1;
}
