// Same bounded IPC framing as PNG; this adapter cannot issue Source proof.
import {
  canonicalMessage,
  validateRequest as validateBaseRequest,
  safeCodes,
} from "../protocol.mjs";
import { profile, profileHash } from "./profile.mjs";
export { canonicalMessage, safeCodes };
const fail = () => {
  throw Error("PARSER_PROTOCOL");
};
export function requestFor(token, hash, count) {
  return {
    protocol_version: 1,
    profile_version: 1,
    profile_sha256: profileHash(),
    input_token: token,
    input_sha256: hash,
    byte_count: count,
    declared_mime: profile.mime,
  };
}
export function validateRequest(value) {
  validateBaseRequest(value);
  if (value.byte_count > profile.inputBytes) fail();
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
    format: status === "PARSE_PASS" ? "JPEG" : null,
    facts,
    status,
  };
}
export function validateResult(raw, request) {
  const value = canonicalMessage(raw, profile.outputBytes);
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).join() !==
      Object.keys(resultFor(request, "PARSER_PROFILE")).join() ||
    [
      "protocol_version",
      "profile_version",
      "profile_sha256",
      "input_token",
      "input_sha256",
      "byte_count",
    ].some((key) => value[key] !== request[key]) ||
    value.profile_sha256 !== profileHash() ||
    !safeCodes.includes(value.status)
  )
    fail();
  if (value.status !== "PARSE_PASS") {
    if (
      value.actual_mime !== null ||
      value.format !== null ||
      value.facts !== null
    )
      fail();
    return value;
  }
  const f = value.facts;
  if (
    request.declared_mime !== profile.mime ||
    value.actual_mime !== profile.mime ||
    value.format !== "JPEG" ||
    !f ||
    Object.keys(f).join() !==
      "width,height,pixels,frames,channels,bit_depth,orientation,decoded_byte_count" ||
    !Object.values(f).every(Number.isSafeInteger) ||
    f.width <= 0 ||
    f.width > profile.axis ||
    f.height <= 0 ||
    f.height > profile.axis ||
    f.pixels !== f.width * f.height ||
    f.pixels > profile.pixels ||
    f.frames !== 1 ||
    f.channels !== 3 ||
    f.bit_depth !== 8 ||
    f.orientation !== 1 ||
    f.decoded_byte_count !== f.pixels * 4 ||
    f.decoded_byte_count > profile.decodedBytes
  )
    fail();
  return value;
}
