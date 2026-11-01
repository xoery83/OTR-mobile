import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { decodeJpeg } from "./jpeg-decode.mjs";
import { profile } from "./profile.mjs";
const decode = createRequire(import.meta.url)("./decoder/package/lib/decoder.js");
const bytes = readFileSync(
  new URL("./fixtures/baseline-32x16.jpg", import.meta.url),
);
function segment(marker, data) {
  const header = Buffer.alloc(4);
  header.writeUInt16BE(marker);
  header.writeUInt16BE(data.length + 2, 2);
  return Buffer.concat([header, data]);
}
function exif(orientation = 1) {
  const data = Buffer.from(
    "45786966000049492a0008000000010012010300010000000100000000000000",
    "hex",
  );
  data.writeUInt16LE(orientation, 24);
  return data;
}
const appendExif = (data) =>
  Buffer.concat([
    bytes.subarray(0, 2),
    segment(0xffe1, data),
    bytes.subarray(2),
  ]);
function sofOffset(input) {
  const n = input.indexOf(Buffer.from([255, 192]));
  assert(n > 0);
  return n + 4;
}
test("real baseline JPEG fully decodes to bounded RGBA pixels", () => {
  assert.deepEqual(decodeJpeg(bytes, "image/jpeg"), {
    width: 32,
    height: 16,
    pixels: 512,
    frames: 1,
    channels: 3,
    bit_depth: 8,
    orientation: 1,
    decoded_byte_count: 2048,
  });
});
test("canonical orientation1 decodes, non-identity/unknown directions reject", () => {
  assert.equal(decodeJpeg(appendExif(exif()), "image/jpeg").orientation, 1);
  for (const o of [0, 2, 3, 4, 5, 6, 7, 8, 9])
    assert.throws(
      () => decodeJpeg(appendExif(exif(o)), "image/jpeg"),
      /FORMAT_UNSUPPORTED/,
    );
  const unknown = exif();
  unknown.write("ZZ", 6);
  assert.throws(
    () => decodeJpeg(appendExif(unknown), "image/jpeg"),
    /FORMAT_UNSUPPORTED/,
  );
});
test("big-endian canonical orientation1 is explicit, not inferred", () => {
  const data = Buffer.from(
    "4578696600004d4d002a00000008000101120003000000010001000000000000",
    "hex",
  );
  assert.equal(decodeJpeg(appendExif(data), "image/jpeg").orientation, 1);
});
test("malformed/truncated/trailing/second image never passes", () => {
  for (const input of [
    Buffer.alloc(0),
    bytes.subarray(0, 20),
    bytes.subarray(0, -2),
    Buffer.concat([bytes, Buffer.from([0])]),
    Buffer.concat([bytes, bytes]),
  ])
    assert.throws(() => decodeJpeg(input, "image/jpeg"), /FORMAT_/);
});
test("valid-looking baseline metadata without quantization cannot replace actual decoding", () => {
  const start = bytes.indexOf(Buffer.from([255, 219]));
  assert(start > 0);
  const end = start + 2 + bytes.readUInt16BE(start + 2);
  const noDqt = Buffer.concat([bytes.subarray(0, start), bytes.subarray(end)]);
  // Encoder emits one segment containing both quantization tables.
  assert.throws(() => decodeJpeg(noDqt, "image/jpeg"), /FORMAT_MALFORMED/);
});
test("baseline-only 8bit three-component guard rejects unqualified modes", () => {
  for (const [relative, value] of [
    [0, 12],
    [5, 4],
  ]) {
    const changed = Buffer.from(bytes);
    changed[sofOffset(changed) + relative] = value;
    assert.throws(
      () => decodeJpeg(changed, "image/jpeg"),
      /FORMAT_UNSUPPORTED/,
    );
  }
  const progressive = Buffer.from(bytes);
  progressive[sofOffset(progressive) - 3] = 194;
  assert.throws(
    () => decodeJpeg(progressive, "image/jpeg"),
    /FORMAT_UNSUPPORTED/,
  );
});
test("byte/axis/pixel/metadata ceilings reject before pixel allocation", () => {
  assert.throws(
    () => decodeJpeg(Buffer.alloc(profile.inputBytes + 1), "image/jpeg"),
    /FORMAT_RESOURCE_LIMIT/,
  );
  for (const [width, height] of [
    [2049, 1],
    [2048, 2048],
  ]) {
    const changed = Buffer.from(bytes),
      offset = sofOffset(changed);
    changed.writeUInt16BE(height, offset + 1);
    changed.writeUInt16BE(width, offset + 3);
    assert.throws(
      () => decodeJpeg(changed, "image/jpeg"),
      /FORMAT_RESOURCE_LIMIT/,
    );
  }
  assert.throws(
    () =>
      decodeJpeg(
        appendExif(Buffer.alloc(profile.metadataBytes + 1)),
        "image/jpeg",
      ),
    /FORMAT_RESOURCE_LIMIT/,
  );
});
test("mature decoder enforces explicit memory ceiling", () => {
  assert.throws(
    () =>
      decode(bytes, {
        useTArray: true,
        tolerantDecoding: false,
        maxResolutionInMP: 1,
        maxMemoryUsageInMB: 0.00001,
      }),
    /maxMemoryUsageInMB/,
  );
});
test("MIME is exact and arbitrary metadata/colour transforms stay unqualified", () => {
  assert.throws(() => decodeJpeg(bytes, "image/png"), /FORMAT_MISMATCH/);
  const adobe = Buffer.concat([
    bytes.subarray(0, 2),
    segment(0xffee, Buffer.from("Adobe")),
    bytes.subarray(2),
  ]);
  assert.throws(() => decodeJpeg(adobe, "image/jpeg"), /FORMAT_UNSUPPORTED/);
});
