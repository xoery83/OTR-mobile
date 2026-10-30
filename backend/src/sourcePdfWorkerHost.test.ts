import {
  chmod,
  chown,
  lstat,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { startSourcePdfWorkerHost } from "./sourcePdfWorkerHost";
import { createSourcePdfV2WorkerClient } from "./sourcePdfV2WorkerTransport";
const dirs: string[] = [],
  servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0))
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  for (const dir of dirs.splice(0)) await rm(dir, { force: true, recursive: true });
});
async function fixture() {
  const dir = await realpath(await mkdtemp("/private/tmp/otr-pdf-host-"));
  dirs.push(dir);
  await chown(dir, process.getuid!(), process.getgid!());
  await chmod(dir, 0o750);
  return { directory: dir, ownerUid: process.getuid!(), socketGid: process.getgid!() };
}
it("starts only the private socket with exact filesystem access and drains on close", async () => {
  const input = await fixture(),
    run = vi.fn(async () => ({ synthetic: true }));
  const server = await startSourcePdfWorkerHost(input, run);
  servers.push(server);
  const socket = join(input.directory, "worker.sock");
  expect((await lstat(socket)).mode & 0o777).toBe(0o660);
  expect(
    await createSourcePdfV2WorkerClient(socket)(new Uint8Array([37, 80, 68, 70])),
  ).toEqual({ synthetic: true });
  expect(run).toHaveBeenCalledOnce();
  await expect(lstat(join(input.directory, "active-worker"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});
it("never removes an existing socket path, file or retained quarantine", async () => {
  const input = await fixture(),
    path = join(input.directory, "worker.sock");
  await writeFile(path, "retained operator file");
  await expect(startSourcePdfWorkerHost(input)).rejects.toThrow(
    "PDF_WORKER_SOCKET_ALREADY_EXISTS",
  );
  expect(await readFile(path, "utf8")).toBe("retained operator file");
});
it("restart with an UNKNOWN lease marker cannot launch another worker", async () => {
  const input = await fixture(),
    run = vi.fn();
  const marker = join(input.directory, "active-worker");
  await writeFile(marker, "retained UNKNOWN");
  const server = await startSourcePdfWorkerHost(input, run);
  servers.push(server);
  await expect(
    createSourcePdfV2WorkerClient(join(input.directory, "worker.sock"))(
      new Uint8Array([37, 80, 68, 70]),
    ),
  ).rejects.toThrow();
  expect(run).not.toHaveBeenCalled();
  expect(await readFile(marker, "utf8")).toBe("retained UNKNOWN");
});
it("rejects foreign ownership, broad directory access and symlink roots before listening", async () => {
  const input = await fixture();
  await expect(
    startSourcePdfWorkerHost({ ...input, ownerUid: input.ownerUid + 1 }),
  ).rejects.toThrow("DIRECTORY_INVALID");
  await chmod(input.directory, 0o777);
  await expect(startSourcePdfWorkerHost(input)).rejects.toThrow("DIRECTORY_INVALID");
  await chmod(input.directory, 0o750);
  const link = input.directory + "-link";
  dirs.push(link);
  await symlink(input.directory, link);
  await expect(startSourcePdfWorkerHost({ ...input, directory: link })).rejects.toThrow(
    "DIRECTORY_INVALID",
  );
});
