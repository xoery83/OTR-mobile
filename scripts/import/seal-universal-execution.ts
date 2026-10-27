import { constants } from "node:fs";
import { open, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { buildUniversalExecutionProposal } from "../../backend/src/universalExecutionProposal";
const args = process.argv.slice(2);
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
async function read(path: string, max = 262144) {
  const f = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const s = await f.stat();
    if (!s.isFile() || s.size > max) throw Error("BOUNDED_INPUT_REQUIRED");
    return await f.readFile();
  } finally {
    await f.close();
  }
}
try {
  if (args.length !== 7 || args[0] !== "--seal-proposed")
    throw Error("EXPLICIT_PROPOSAL_REQUIRED");
  const [, receiptPath, receiptSha, idsPath, factsPath, originalPaths, outPath] = args;
  const receiptBytes = await read(receiptPath);
  if (sha(receiptBytes) !== receiptSha) throw Error("ACTUAL_PIN_RECEIPT_HASH_CHANGED");
  const paths = z
    .record(z.uuid(), z.string().min(1))
    .parse(JSON.parse((await read(originalPaths)).toString("utf8")));
  const originals = new Map(
    await Promise.all(
      Object.entries(paths).map(async ([id, path]) => [id, await read(path)] as const),
    ),
  );
  const result = await buildUniversalExecutionProposal(
    JSON.parse(receiptBytes.toString("utf8")),
    JSON.parse((await read(idsPath)).toString("utf8")),
    JSON.parse((await read(factsPath)).toString("utf8")),
    originals,
  );
  const path = resolve(outPath),
    parent = await stat(dirname(path));
  if (parent.uid !== process.getuid!() || (parent.mode & 0o777) !== 0o700)
    throw Error("PRIVATE_OUTPUT_DIRECTORY_REQUIRED");
  const bytes = Buffer.from(JSON.stringify(result, null, 2) + "\n");
  const out = await open(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await out.writeFile(bytes);
    await out.sync();
  } finally {
    await out.close();
  }
  console.log(
    JSON.stringify({
      status: "PROPOSED_NOT_SOURCE_TASK_OR_PROVIDER_PASS",
      path,
      sha256: sha(bytes),
    }),
  );
} catch (error) {
  const safe = new Set([
    "EXPLICIT_PROPOSAL_REQUIRED",
    "ACTUAL_PIN_RECEIPT_HASH_CHANGED",
    "FINITE_INNER_WINDOW_REQUIRED",
    "PROPOSED_IDENTITY_REUSED",
    "ACTUAL_SOURCE_INPUT_BINDING_CHANGED",
    "SOURCE_PROFILE_CHANGED",
    "EXACT_THREE_ORIGINALS_REQUIRED",
    "ORIGINAL_PREFLIGHT_NOT_READY",
    "PRIVATE_OUTPUT_DIRECTORY_REQUIRED",
  ]);
  console.error(
    error instanceof Error && safe.has(error.message)
      ? error.message
      : "UNIVERSAL_EXECUTION_PROPOSAL_REFUSED",
  );
  process.exitCode = 2;
}
