import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
// Local-only candidate; no image, execution registry or Source authority exists.
export const profile = Object.freeze({
  name: "JPEG_BASELINE_YCBCR8_ORIENTATION1_V1",
  protocolVersion: 1,
  profileVersion: 1,
  nodeVersion: "24.22.1",
  zlibVersion: "1.3.2.1-motley-285e94b",
  platform: "linux",
  arch: "x64",
  decoder: "jpeg-js",
  decoderVersion: "0.4.4",
  decoderSha256:
    "269f988267bc71efe58baf97e8b2da064b5bbbbb8b0eab11e2149049935e1160",
  decoderModuleSha256:
    "a3f175fd6f62d142aad94d3bd90f3a30be4e076baf9b6a6fa31c8e84d9d4aa9f",
  decoderIntegrity:
    "sha512-WZzeDOEtTOBK4Mdsar0IqEU5sMr3vSV2RqkAIzUEV2BHnUfKGyswWFPFwK5EeDo93K3FohSHbLAjj0s1Wzd+dg==",
  mime: "image/jpeg",
  inputBytes: 1048576,
  axis: 2048,
  pixels: 1048576,
  metadataBytes: 4096,
  markers: 128,
  decodedBytes: 4194304,
  decoderMemoryMiB: 32,
  memoryMiB: 128,
  cpuSeconds: 1,
  wallMs: 5000,
  pids: 16,
  fd: 32,
  tmpMiB: 16,
  fileMiB: 8,
  outputBytes: 4096,
});

// Content identity only: not an enrolled execution fingerprint or Source receipt.
export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export function profileHash() {
  return sha256(
    JSON.stringify({
      profile,
      files: [
        "profile.mjs",
        "protocol.mjs",
        "jpeg-decode.mjs",
        "jpeg-worker.mjs",
        "vendor/jpeg-js-0.4.4.tgz",
        "../protocol.mjs",
        "../profile.mjs",
      ].map((name) => [
        name,
        sha256(readFileSync(new URL(name, import.meta.url))),
      ]),
    }),
  );
}
