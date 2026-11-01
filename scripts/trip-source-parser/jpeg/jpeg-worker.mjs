import { open } from "node:fs/promises";
import { constants } from "node:fs";
import { pathToFileURL } from "node:url";
import { profile, profileHash, sha256 } from "./profile.mjs";
import {
  canonicalMessage,
  validateRequest,
  resultFor,
  safeCodes,
} from "./protocol.mjs";
import { decodeJpeg } from "./jpeg-decode.mjs";

// Same fixed-descriptor read lifecycle as PNG. openInput is a local test seam, never IPC.
export async function readInput(request, openInput = open) {
  const input = await openInput(
    "/input",
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  let bytes;
  try {
    const stat = await input.stat();
    if (
      !stat.isFile() ||
      stat.size !== request.byte_count ||
      stat.size > profile.inputBytes
    )
      throw Error("PARSER_INPUT_IDENTITY");
    bytes = await input.readFile();
  } finally {
    await input.close();
  }
  if (
    bytes.length !== request.byte_count ||
    sha256(bytes) !== request.input_sha256
  )
    throw Error("PARSER_INPUT_IDENTITY");
  return bytes;
}
export async function executeRequest(request, openInput = open) {
  try {
    if (request.profile_sha256 !== profileHash()) throw Error("PARSER_PROFILE");
    return resultFor(
      request,
      "PARSE_PASS",
      decodeJpeg(await readInput(request, openInput), request.declared_mime),
    );
  } catch (error) {
    const code =
      safeCodes.includes(error?.message) && error.message !== "PARSE_PASS"
        ? error.message
        : "FORMAT_MALFORMED";
    return resultFor(request, code);
  }
}
export async function main() {
  let raw = "";
  for await (const chunk of process.stdin) {
    raw += chunk.toString("utf8");
    if (Buffer.byteLength(raw) > 512) {
      process.exitCode = 2;
      return;
    }
  }
  let request;
  try {
    request = validateRequest(canonicalMessage(raw, 512));
  } catch {
    process.exitCode = 2;
    return;
  }
  // Candidate target only; no environment/IPC switch may bypass runtime identity.
  const runtimeMatches =
    process.versions.node === profile.nodeVersion &&
    process.versions.zlib === profile.zlibVersion &&
    process.platform === profile.platform &&
    process.arch === profile.arch;
  const result = runtimeMatches
    ? await executeRequest(request)
    : resultFor(request, "PARSER_PROFILE");
  process.stdout.write(JSON.stringify(result) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
