import { chown, chmod, lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { createSourcePdfV2WorkerServer } from "./sourcePdfV2WorkerTransport";
import {
  createSourcePdfV2WorkerLease,
  runSourcePdfV2LinuxWorker,
} from "./sourcePdfV2LinuxWorker";

// Trusted host composition only. Never accepts paths or a worker from HTTP input.
export async function startSourcePdfWorkerHost(
  input: {
    directory: string;
    ownerUid: number;
    socketGid: number;
  },
  run = runSourcePdfV2LinuxWorker,
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
    throw Error("PDF_WORKER_HOST_DIRECTORY_INVALID");
  const info = await lstat(directory);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    info.uid !== ownerUid ||
    info.gid !== socketGid ||
    (info.mode & 0o777) !== 0o750 ||
    (await realpath(directory)) !== directory
  )
    throw Error("PDF_WORKER_HOST_DIRECTORY_INVALID");
  const socket = join(directory, "worker.sock"),
    marker = join(directory, "active-worker");
  if (Buffer.byteLength(socket) > 100 || dirname(socket) !== directory)
    throw Error("PDF_V2_WORKER_SOCKET_INVALID");
  try {
    await lstat(socket);
    throw Error("PDF_WORKER_SOCKET_ALREADY_EXISTS");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const server = createSourcePdfV2WorkerServer(createSourcePdfV2WorkerLease(marker, run));
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
      throw Error("PDF_WORKER_SOCKET_MODE_INVALID");
    return server;
  } catch (error) {
    server.close();
    throw error;
  }
}
