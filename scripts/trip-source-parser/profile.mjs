import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const profile = Object.freeze({
  protocolVersion: 1,
  profileVersion: 1,
  name: "PNG_STATIC_RGB8_RGBA8_V1",
  mime: "image/png",
  decoder: "pngjs",
  decoderVersion: "7.0.0",
  decoderSha256: "c4b71873d48a692dd5eeb1dcb62185c7aafe40f2180c7cc7f30ec71e89a080be",
  decoderIntegrity:
    "sha512-LKWqWJRhstyYo9pGvgor/ivk2w94eSjE3RGVuzLGlr3NmD8bf7RcYGze1mNdEHRP6TRP6rMuDHk5t44hnTRyow==",
  baseImage: "sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553",
  nodeVersion: "24.21.0",
  zlibVersion: "1.3.2.1-motley-8002e91",
  platform: "linux",
  arch: "arm64",
  inputBytes: 52428800,
  axis: 2048,
  pixels: 1048576,
  chunkBytes: 1048576,
  chunks: 128,
  idatBytes: 8388608,
  inflatedBytes: 4196352,
  decodedBytes: 4194304,
  metadataBytes: 0,
  frames: 1,
  bitDepth: 8,
  colorTypes: [2, 6],
  interlace: 0,
  chunkPolicy: "IHDR_IDAT_IEND_ONLY_NO_TRAILING_OR_EXTRA_ZLIB_STREAM",
  memoryMiB: 128,
  cpuSeconds: 1,
  wallMs: 5000,
  pids: 16,
  fd: 32,
  tmpMiB: 16,
  fileMiB: 8,
  outputBytes: 4096,
});
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const files = [
  "profile.mjs",
  "protocol.mjs",
  "png-decode.mjs",
  "png-worker.mjs",
  "Dockerfile",
  "vendor/pngjs-7.0.0.tgz",
];
export function profileManifest() {
  const hashes = files.map((name) => [
    name,
    sha256(readFileSync(new URL(name, import.meta.url))),
  ]);
  if (hashes.at(-1)[1] !== profile.decoderSha256) throw new Error("PARSER_PROFILE");
  return { profile, files: hashes };
}
export const profileHash = () => sha256(JSON.stringify(profileManifest()));
