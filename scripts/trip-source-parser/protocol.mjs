import { Buffer } from "node:buffer";
import { profile, profileHash } from "./profile.mjs";

export const safeCodes = Object.freeze([
  "PARSE_PASS",
  "FORMAT_MISMATCH",
  "FORMAT_AMBIGUOUS",
  "FORMAT_MALFORMED",
  "FORMAT_UNSUPPORTED",
  "FORMAT_RESOURCE_LIMIT",
  "PARSER_INPUT_IDENTITY",
  "PARSER_PROFILE",
  "PARSER_PROTOCOL",
]);
const requestKeys = [
  "protocol_version",
  "profile_version",
  "profile_sha256",
  "input_token",
  "input_sha256",
  "byte_count",
  "declared_mime",
];
const resultKeys = [
  "protocol_version",
  "profile_version",
  "profile_sha256",
  "input_token",
  "input_sha256",
  "byte_count",
  "actual_mime",
  "format",
  "facts",
  "status",
];
const factKeys = [
  "width",
  "height",
  "pixels",
  "frames",
  "channels",
  "bit_depth",
  "interlace",
  "decoded_byte_count",
];
const hex = (s, n) =>
  typeof s === "string" && new RegExp("^[0-9a-f]{" + n + "}$").test(s);
const fail = () => {
  throw new Error("PARSER_PROTOCOL");
};
function exactKeys(value, keys) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).join(",") !== keys.join(",")
  )
    fail();
}
export function canonicalMessage(raw, ceiling) {
  if (typeof raw !== "string" || Buffer.byteLength(raw) > ceiling) fail();
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    fail();
  }
  // One canonical result; duplicates, whitespace, second result and extra output reject.
  if (JSON.stringify(value) + "\n" !== raw) fail();
  return value;
}
export function requestFor(token, hash, count, mime = profile.mime) {
  return {
    protocol_version: 1,
    profile_version: 1,
    profile_sha256: profileHash(),
    input_token: token,
    input_sha256: hash,
    byte_count: count,
    declared_mime: mime,
  };
}
export function validateRequest(value) {
  exactKeys(value, requestKeys);
  if (
    value.protocol_version !== 1 ||
    value.profile_version !== 1 ||
    !hex(value.profile_sha256, 64) ||
    !hex(value.input_token, 32) ||
    !hex(value.input_sha256, 64) ||
    !Number.isSafeInteger(value.byte_count) ||
    value.byte_count <= 0 ||
    value.byte_count > profile.inputBytes ||
    typeof value.declared_mime !== "string" ||
    value.declared_mime.length > 128
  )
    fail();
  return value;
}
export function resultFor(request, status, facts = null) {
  return {
    protocol_version: 1,
    profile_version: 1,
    profile_sha256: profileHash(),
    input_token: request.input_token,
    input_sha256: request.input_sha256,
    byte_count: request.byte_count,
    actual_mime: status === "PARSE_PASS" ? profile.mime : null,
    format: status === "PARSE_PASS" ? "PNG" : null,
    facts,
    status,
  };
}
export function validateResult(raw, request) {
  const value = canonicalMessage(raw, profile.outputBytes);
  exactKeys(value, resultKeys);
  for (const key of requestKeys.slice(0, 6)) if (value[key] !== request[key]) fail();
  if (value.profile_sha256 !== profileHash() || !safeCodes.includes(value.status)) fail();
  if (value.status !== "PARSE_PASS") {
    if (value.actual_mime !== null || value.format !== null || value.facts !== null)
      fail();
    return value;
  }
  if (
    request.declared_mime !== profile.mime ||
    value.actual_mime !== profile.mime ||
    value.format !== "PNG"
  )
    fail();
  const f = value.facts;
  exactKeys(f, factKeys);
  if (
    !Object.values(f).every(Number.isSafeInteger) ||
    f.width < 1 ||
    f.width > profile.axis ||
    f.height < 1 ||
    f.height > profile.axis ||
    f.pixels !== f.width * f.height ||
    f.pixels > profile.pixels ||
    f.frames !== 1 ||
    ![3, 4].includes(f.channels) ||
    f.bit_depth !== 8 ||
    f.interlace !== 0 ||
    f.decoded_byte_count !== f.pixels * 4 ||
    f.decoded_byte_count > profile.decodedBytes
  )
    fail();
  return value;
}
