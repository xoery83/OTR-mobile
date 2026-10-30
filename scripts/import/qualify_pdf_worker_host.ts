// Real fixed-image decoder through the private host launcher; no DB or Provider.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmod,
  chown,
  lstat,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import type { Server } from "node:http";
import { startSourcePdfWorkerHost } from "../../backend/src/sourcePdfWorkerHost";
import { createSourcePdfV2WorkerClient } from "../../backend/src/sourcePdfV2WorkerTransport";
import {
  verifySourcePdfV2LinuxBytes,
  SOURCE_PDF_V2_LINUX_PROFILE_SHA,
} from "../../backend/src/sourcePdfV2LinuxVerifier";
const output = process.argv[2];
if (!output) throw Error("OUTPUT_PATH_REQUIRED");
const original = new Uint8Array(
  await readFile("output/pdf/universal-p6-activity-qa.pdf"),
);
assert.equal(
  createHash("sha256").update(original).digest("hex"),
  "f58061aa535c7a5585c4c953890c5d387cf20656cca7129e36861beb82ee1758",
);
const directory = await realpath(await mkdtemp("/private/tmp/otr-pdf-host-real-"));
let server: Server | undefined;
const close = (value: Server) =>
  new Promise<void>((resolve, reject) =>
    value.close((error) => (error ? reject(error) : resolve())),
  );
try {
  await chown(directory, process.getuid!(), process.getgid!());
  await chmod(directory, 0o750);
  server = await startSourcePdfWorkerHost({
    directory,
    ownerUid: process.getuid!(),
    socketGid: process.getgid!(),
  });
  const socket = join(directory, "worker.sock");
  assert.equal((await lstat(socket)).mode & 0o777, 0o660);
  const result = await verifySourcePdfV2LinuxBytes(
    original,
    createSourcePdfV2WorkerClient(socket),
  );
  assert.equal(result.pages.length, 1);
  assert.ok(result.text.includes("Harbour PDF QA Workshop"));
  assert.ok(result.text.includes("November 2, 2026"));
  await assert.rejects(lstat(join(directory, "active-worker")), { code: "ENOENT" });
  await close(server);
  server = undefined;
  await assert.rejects(lstat(socket), { code: "ENOENT" });
  const receipt = {
    status: "LOCAL_REAL_HOST_LAUNCHER_DECODER_PASS_NOT_DEV",
    profileSha256: SOURCE_PDF_V2_LINUX_PROFILE_SHA,
    originalSha256: result.originalSha256,
    originalByteCount: result.originalByteCount,
    textSha256: result.textSha256,
    textByteCount: result.textByteCount,
    pages: result.pages.length,
    socketMode: "0660",
    markerReleased: true,
    closeRemovedSocket: true,
    devInstalled: false,
    sourceQualified: false,
    providerCalls: 0,
  };
  await writeFile(output, JSON.stringify(receipt, null, 2) + "\n");
  process.stdout.write(JSON.stringify(receipt) + "\n");
} finally {
  if (server) await close(server);
  await rm(directory, { recursive: true, force: true });
}
