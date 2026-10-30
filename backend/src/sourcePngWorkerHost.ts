import { chmod, chown, lstat, open, realpath, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { createSourcePngWorkerServer } from "./sourcePngWorkerTransport";
import { createSourcePngOwnedSandbox } from "./sourcePngOwnedSandbox";

// Private Host composition only; no DB, Storage credentials or request-selected paths.
export async function startSourcePngWorkerHost(
  input: {
    directory: string;
    ownerUid: number;
    socketGid: number;
  },
  run = createSourcePngOwnedSandbox,
) {
  const { directory, ownerUid, socketGid } = input;
  if (
    !isAbsolute(directory) ||
    directory.includes("\0") ||
    !Number.isSafeInteger(ownerUid) ||
    ownerUid < 0 ||
    !Number.isSafeInteger(socketGid) ||
    socketGid < 0
  )
    throw Error("PNG_WORKER_HOST_DIRECTORY_INVALID");
  const info = await lstat(directory);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    info.uid !== ownerUid ||
    info.gid !== socketGid ||
    (info.mode & 0o777) !== 0o750 ||
    (await realpath(directory)) !== directory
  )
    throw Error("PNG_WORKER_HOST_DIRECTORY_INVALID");
  const stage = join(directory, "decoder-stage"),
    st = await lstat(stage);
  if (
    !st.isDirectory() ||
    st.isSymbolicLink() ||
    st.uid !== ownerUid ||
    (st.mode & 0o777) !== 0o700 ||
    (await realpath(stage)) !== stage
  )
    throw Error("PNG_STAGE_INVALID");
  const socket = join(directory, "worker.sock"),
    marker = join(directory, "active-worker");
  if (Buffer.byteLength(socket) > 100) throw Error("PNG_WORKER_SOCKET_INVALID");
  try {
    await lstat(socket);
    throw Error("PNG_WORKER_SOCKET_ALREADY_EXISTS");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const server = createSourcePngWorkerServer(
    stage,
    (dir, owner) => async (binding, bytes) => {
      const file = await open(marker, "wx", 0o600);
      try {
        await file.writeFile(JSON.stringify(binding));
        await file.sync();
      } finally {
        await file.close();
      }
      const parent = await open(directory, "r");
      try {
        await parent.sync();
      } finally {
        await parent.close();
      }
      // Only a fully observed/acknowledged return clears the durable lease. Crashes remain quarantined.
      const result = await run(dir, owner)(binding, bytes);
      await unlink(marker);
      return result;
    },
  );
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socket, resolve);
    });
    await chown(socket, ownerUid, socketGid);
    await chmod(socket, 0o660);
    const current = await lstat(socket);
    if (
      !current.isSocket() ||
      current.uid !== ownerUid ||
      current.gid !== socketGid ||
      (current.mode & 0o777) !== 0o660
    )
      throw Error("PNG_WORKER_SOCKET_MODE_INVALID");
    return server;
  } catch (error) {
    server.close();
    throw error;
  }
}
