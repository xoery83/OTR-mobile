import { Buffer } from "node:buffer";
import { open } from "node:fs/promises";
import { constants } from "node:fs";
import { profile, profileHash, sha256 } from "./profile.mjs";
import { canonicalMessage, validateRequest, resultFor, safeCodes } from "./protocol.mjs";
import { decodePng } from "./png-decode.mjs";

let raw = "";
for await (const chunk of process.stdin) {
  raw += chunk.toString("utf8");
  if (Buffer.byteLength(raw) > 512) process.exit(2);
}
let request;
try {
  request = validateRequest(canonicalMessage(raw, 512));
} catch {
  process.exit(2);
}
let result;
try {
  if (
    request.profile_sha256 !== profileHash() ||
    process.versions.node !== profile.nodeVersion ||
    process.versions.zlib !== profile.zlibVersion ||
    process.platform !== profile.platform ||
    process.arch !== profile.arch
  )
    throw new Error("PARSER_PROFILE");
  // No path is supplied through IPC. Exactly one read-only fixed descriptor.
  const input = await open("/input", constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes;
  try {
    const stat = await input.stat();
    if (
      !stat.isFile() ||
      stat.size !== request.byte_count ||
      stat.size > profile.inputBytes
    )
      throw new Error("PARSER_INPUT_IDENTITY");
    bytes = await input.readFile();
  } finally {
    await input.close();
  }
  if (bytes.length !== request.byte_count || sha256(bytes) !== request.input_sha256)
    throw new Error("PARSER_INPUT_IDENTITY");
  result = resultFor(request, "PARSE_PASS", decodePng(bytes, request.declared_mime));
} catch (error) {
  const code =
    safeCodes.includes(error.message) && error.message !== "PARSE_PASS"
      ? error.message
      : "FORMAT_MALFORMED";
  result = resultFor(request, code);
}
process.stdout.write(JSON.stringify(result) + "\n");
