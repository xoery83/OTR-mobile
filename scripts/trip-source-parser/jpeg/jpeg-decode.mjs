import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { profile } from "./profile.mjs";
const require = createRequire(import.meta.url);
const archive = readFileSync(
  new URL("./vendor/jpeg-js-0.4.4.tgz", import.meta.url),
);
if (
  createHash("sha256").update(archive).digest("hex") !== profile.decoderSha256
)
  throw Error("PARSER_PROFILE");
const decoderPath = new URL(
  "./decoder/package/lib/decoder.js",
  import.meta.url,
);
if (
  createHash("sha256").update(readFileSync(decoderPath)).digest("hex") !==
  profile.decoderModuleSha256
)
  throw Error("PARSER_PROFILE");
const decode = require("./decoder/package/lib/decoder.js");
if (
  require("./decoder/package/package.json").version !== profile.decoderVersion
)
  throw Error("PARSER_PROFILE");
const fail = (code) => {
  throw Error(code);
};
// Eligibility guard only. The mature decoder must still decode the complete scan.
function baselineFacts(input) {
  if (input[0] !== 255 || input[1] !== 216) fail("FORMAT_MISMATCH");
  let offset = 2,
    markers = 0,
    metadata = 0,
    frame = null,
    jfif = false,
    exif = false;
  while (offset < input.length) {
    if (++markers > profile.markers) fail("FORMAT_RESOURCE_LIMIT");
    if (input[offset++] !== 255) fail("FORMAT_MALFORMED");
    const marker = input[offset++];
    if (
      marker === 0 ||
      marker === 255 ||
      marker === 216 ||
      marker === 217 ||
      offset + 2 > input.length
    )
      fail("FORMAT_MALFORMED");
    const length = input.readUInt16BE(offset);
    if (length < 2 || offset + length > input.length) fail("FORMAT_MALFORMED");
    const data = input.subarray(offset + 2, offset + length);
    offset += length;
    if (marker >= 224 && marker <= 239) {
      metadata += data.length;
      if (metadata > profile.metadataBytes) fail("FORMAT_RESOURCE_LIMIT");
      if (marker === 224) {
        if (
          jfif ||
          data.length !== 14 ||
          data.toString("latin1", 0, 5) !== "JFIF\0" ||
          data[12] ||
          data[13]
        )
          fail("FORMAT_UNSUPPORTED");
        jfif = true;
      } else if (marker === 225) {
        // First slice accepts only a single canonical TIFF orientation entry.
        if (
          exif ||
          data.length !== 32 ||
          data.toString("latin1", 0, 6) !== "Exif\0\0"
        )
          fail("FORMAT_UNSUPPORTED");
        exif = true;
        const little = data.toString("latin1", 6, 8) === "II";
        if (!little && data.toString("latin1", 6, 8) !== "MM")
          fail("FORMAT_UNSUPPORTED");
        const u16 = (n) =>
          little ? data.readUInt16LE(n) : data.readUInt16BE(n);
        const u32 = (n) =>
          little ? data.readUInt32LE(n) : data.readUInt32BE(n);
        if (
          u16(8) !== 42 ||
          u32(10) !== 8 ||
          u16(14) !== 1 ||
          u16(16) !== 274 ||
          u16(18) !== 3 ||
          u32(20) !== 1 ||
          u16(24) !== 1 ||
          u16(26) !== 0 ||
          u32(28) !== 0
        )
          fail("FORMAT_UNSUPPORTED");
      } else fail("FORMAT_UNSUPPORTED");
    } else if (marker === 192) {
      if (
        frame ||
        data.length !== 15 ||
        data[0] !== 8 ||
        data[5] !== 3 ||
        [0, 1, 2].some(
          (i) =>
            data[6 + i * 3] !== i + 1 ||
            ![17, 18, 33, 34].includes(data[7 + i * 3]),
        )
      )
        fail("FORMAT_UNSUPPORTED");
      const height = data.readUInt16BE(1),
        width = data.readUInt16BE(3);
      if (!width || !height) fail("FORMAT_MALFORMED");
      if (
        width > profile.axis ||
        height > profile.axis ||
        width * height > profile.pixels
      )
        fail("FORMAT_RESOURCE_LIMIT");
      frame = { width, height };
    } else if (marker === 218) {
      if (
        !jfif ||
        !frame ||
        data.length !== 10 ||
        data[0] !== 3 ||
        [0, 1, 2].some((i) => data[1 + i * 2] !== i + 1) ||
        data[7] !== 0 ||
        data[8] !== 63 ||
        data[9] !== 0
      )
        fail("FORMAT_UNSUPPORTED");
      // One scan, stuffed bytes/restarts, exact terminal EOI; no trailing second image.
      while (offset < input.length) {
        if (input[offset++] !== 255) continue;
        const code = input[offset++];
        if (code === 0 || (code >= 208 && code <= 215)) continue;
        if (code === 217 && offset === input.length) return frame;
        fail("FORMAT_MALFORMED");
      }
      fail("FORMAT_MALFORMED");
    } else if (![196, 219, 221].includes(marker)) fail("FORMAT_UNSUPPORTED");
  }
  fail("FORMAT_MALFORMED");
}
export function decodeJpeg(input, mime) {
  if (mime !== profile.mime) fail("FORMAT_MISMATCH");
  if (!Buffer.isBuffer(input) || input.length > profile.inputBytes)
    fail("FORMAT_RESOURCE_LIMIT");
  const frame = baselineFacts(input);
  let decoded;
  try {
    decoded = decode(input, {
      useTArray: true,
      formatAsRGBA: true,
      tolerantDecoding: false,
      maxResolutionInMP: profile.pixels / 1000000,
      maxMemoryUsageInMB: profile.decoderMemoryMiB,
    });
  } catch {
    fail("FORMAT_MALFORMED");
  }
  if (
    decoded.width !== frame.width ||
    decoded.height !== frame.height ||
    decoded.data.length !== frame.width * frame.height * 4 ||
    decoded.data.length > profile.decodedBytes
  )
    fail("FORMAT_MALFORMED");
  return {
    width: frame.width,
    height: frame.height,
    pixels: frame.width * frame.height,
    frames: 1,
    channels: 3,
    bit_depth: 8,
    orientation: 1,
    decoded_byte_count: decoded.data.length,
  };
}
