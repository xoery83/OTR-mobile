import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import { inflateSync } from "node:zlib";
import { profile } from "./profile.mjs";

// This module is loaded ONLY in the separate sandbox, never by semantic authority.
const require = createRequire(import.meta.url);
const { PNG } = require("./decoder/lib/png.js");
const crc32 = require("./decoder/lib/crc.js").crc32;
if (require("./decoder/package.json").version !== profile.decoderVersion)
  throw new Error("PARSER_PROFILE");
const fail = (code) => {
  throw new Error(code);
};
export function decodePng(input, declaredMime) {
  if (declaredMime !== profile.mime) fail("FORMAT_MISMATCH");
  if (!input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    fail("FORMAT_MISMATCH");
  let offset = 8,
    chunks = 0,
    width,
    height,
    channels,
    idatSize = 0,
    ended = false;
  const idat = [];
  while (offset < input.length) {
    if (++chunks > profile.chunks) fail("FORMAT_RESOURCE_LIMIT");
    if (input.length - offset < 12) fail("FORMAT_MALFORMED");
    const size = input.readUInt32BE(offset),
      type = input.toString("latin1", offset + 4, offset + 8);
    if (size > profile.chunkBytes) fail("FORMAT_RESOURCE_LIMIT");
    if (size > input.length - offset - 12) fail("FORMAT_MALFORMED");
    const data = input.subarray(offset + 8, offset + 8 + size);
    if (
      crc32(input.subarray(offset + 4, offset + 8 + size)) >>> 0 !==
      input.readUInt32BE(offset + 8 + size)
    )
      fail("FORMAT_MALFORMED");
    if (chunks === 1) {
      if (type !== "IHDR" || size !== 13) fail("FORMAT_MALFORMED");
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (!width || !height) fail("FORMAT_MALFORMED");
      if (
        width > profile.axis ||
        height > profile.axis ||
        width * height > profile.pixels
      )
        fail("FORMAT_RESOURCE_LIMIT");
      if (
        data[8] !== 8 ||
        !profile.colorTypes.includes(data[9]) ||
        data[10] !== 0 ||
        data[11] !== 0 ||
        data[12] !== 0
      )
        fail("FORMAT_UNSUPPORTED");
      channels = data[9] === 2 ? 3 : 4;
    } else if (type === "IDAT") {
      if (!size) fail("FORMAT_MALFORMED");
      idatSize += size;
      if (idatSize > profile.idatBytes) fail("FORMAT_RESOURCE_LIMIT");
      idat.push(data);
    } else if (type === "IEND") {
      if (size || !idat.length) fail("FORMAT_MALFORMED");
      ended = true;
      offset += size + 12;
      if (offset !== input.length) fail("FORMAT_AMBIGUOUS");
      break;
    } else {
      // Strict subset, not a claim all PNG metadata or APNG is malformed.
      fail(type === "IHDR" ? "FORMAT_MALFORMED" : "FORMAT_UNSUPPORTED");
    }
    offset += size + 12;
  }
  if (!ended) fail("FORMAT_MALFORMED");
  const row = width * channels + 1,
    expected = row * height;
  if (expected > profile.inflatedBytes) fail("FORMAT_RESOURCE_LIMIT");
  const compressed = Buffer.concat(idat, idatSize);
  let inflated;
  try {
    inflated = inflateSync(compressed, { maxOutputLength: expected, info: true });
  } catch (error) {
    fail(
      error.code === "ERR_BUFFER_TOO_LARGE"
        ? "FORMAT_RESOURCE_LIMIT"
        : "FORMAT_MALFORMED",
    );
  }
  if (inflated.engine.bytesWritten !== compressed.length) fail("FORMAT_AMBIGUOUS");
  if (inflated.buffer.length !== expected) fail("FORMAT_MALFORMED");
  for (let y = 0; y < height; y++)
    if (inflated.buffer[y * row] > 4) fail("FORMAT_MALFORMED");
  // pngjs fully reverses each filter and maps every RGB/RGBA sample to pixels.
  let decoded;
  try {
    decoded = PNG.sync.read(input, { checkCRC: true });
  } catch {
    fail("FORMAT_MALFORMED");
  }
  if (
    decoded.width !== width ||
    decoded.height !== height ||
    decoded.depth !== 8 ||
    decoded.interlace ||
    decoded.data.length !== width * height * 4
  )
    fail("FORMAT_MALFORMED");
  return {
    width,
    height,
    pixels: width * height,
    frames: 1,
    channels,
    bit_depth: 8,
    interlace: 0,
    decoded_byte_count: decoded.data.length,
  };
}
