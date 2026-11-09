import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { join } from "node:path";
import {
  extractUniversalV3Pdf,
  normalizeUniversalV3Image,
  universalV3DecodersPresent,
} from "../../backend/src/universalV3Decoders";

const root = "/opt/otr/import-v3";
const sharp = createRequire(root + "/probe.mjs")("sharp");
assert.equal(await universalV3DecodersPresent(), true);
const isolated = await mkdtemp("/tmp/otr-v3-acceptance-");
const canary = join(isolated, "parent-only");
const endpoint = join(isolated, "parent.sock");
const server = createServer();
try {
  await writeFile(canary, "synthetic backend-only", { mode: 0o600 });
  await new Promise<void>((resolve) => server.listen(endpoint, resolve));
  const verify = `
    import assert from "node:assert/strict";
    import fs from "node:fs";
    import net from "node:net";
    const [file, socket, parent] = process.argv.slice(1);
    assert.equal(process.env.OTR_SYNTHETIC_CANARY, undefined);
    assert.throws(() => fs.readFileSync(file), { code: "EACCES" });
    assert.throws(() => fs.readFileSync("/app/server-capture.mjs"), { code: "EACCES" });
    assert.throws(() => fs.writeFileSync(file, "changed"), { code: "EACCES" });
    assert.throws(() => process.kill(Number(parent), 0), { code: "EPERM" });
    for (const target of [{ path: socket }, { port: 8787, host: "127.0.0.1" }])
      await new Promise((resolve, reject) => {
        const probe = net.connect(target);
        probe.once("connect", () => reject(Error("UNEXPECTED_SOCKET_ACCESS")));
        probe.once("error", (error) => {
          assert.equal(error.code, "EPERM");
          resolve();
        });
      });
    process.stdout.write("ISOLATION_PASS");
  `;
  const result = spawnSync(
    root + "/sandbox",
    [
      "",
      String(process.pid),
      "--",
      "--input-type=module",
      "-e",
      verify,
      canary,
      endpoint,
      String(process.pid),
    ],
    {
      env: { NODE_ENV: "production", OTR_SYNTHETIC_CANARY: "synthetic" },
      encoding: "utf8",
      timeout: 4000,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "ISOLATION_PASS");
} finally {
  server.close();
  await rm(isolated, { recursive: true, force: true });
}

const flat = () =>
  sharp({ create: { width: 12, height: 8, channels: 3, background: "#224466" } });
const alpha = () =>
  sharp({
    create: {
      width: 12,
      height: 8,
      channels: 4,
      background: { r: 10, g: 20, b: 30, alpha: 0.5 },
    },
  });
const formats: [string, Buffer][] = [
  ["image/png", await alpha().png().toBuffer()],
  ["image/jpeg", await flat().withMetadata({ orientation: 6 }).jpeg().toBuffer()],
  ["image/webp", await flat().webp().toBuffer()],
  ["image/gif", await flat().gif().toBuffer()],
];
const images = [];
for (const [mime, bytes] of formats) {
  const start = performance.now();
  const result = await normalizeUniversalV3Image(mime, bytes);
  const elapsedMs = Math.round(performance.now() - start);
  const metadata = await sharp(result.bytes).metadata();
  assert.equal(metadata.format, result.mediaType.slice(6));
  assert.equal(metadata.width, mime === "image/jpeg" ? 8 : 12);
  assert.equal(metadata.height, mime === "image/jpeg" ? 12 : 8);
  assert.equal(metadata.hasAlpha, mime === "image/png");
  assert.equal(Boolean(metadata.exif || metadata.icc || metadata.orientation), false);
  images.push({ input: mime, output: result.mediaType, elapsedMs });
}
await assert.rejects(normalizeUniversalV3Image("image/jpeg", formats[0][1]));
await assert.rejects(
  normalizeUniversalV3Image("image/png", formats[0][1].subarray(0, 20)),
);
const frames = Buffer.from([
  255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255,
]);
const animated = () =>
  sharp(frames, { raw: { width: 2, height: 2, channels: 4, pageHeight: 1 } });
await assert.rejects(
  normalizeUniversalV3Image(
    "image/gif",
    await animated()
      .gif({ delay: [100, 200] })
      .toBuffer(),
  ),
);
await assert.rejects(
  normalizeUniversalV3Image(
    "image/webp",
    await animated()
      .webp({ delay: [100, 200] })
      .toBuffer(),
  ),
);

const pdf = Buffer.from(process.env.OTR_V3_SYNTHETIC_PDF ?? "", "base64");
const start = performance.now();
const parsed = await extractUniversalV3Pdf(pdf);
const elapsedMs = Math.round(performance.now() - start);
assert.equal(parsed.pages.length, 2);
assert.equal(
  parsed.textSha256,
  "3b123e3e614785e19e6fa993b32a81aff7e2cbbb578e4baaa3fb5156fbaaf413",
);
assert.equal(
  (await readdir("/tmp")).some((entry) => entry.startsWith("otr-import-v3-pdf-")),
  false,
);
console.log(
  JSON.stringify({
    isolation: "PASS",
    images,
    pdf: { pages: parsed.pages.length, elapsedMs, textSha256: parsed.textSha256 },
  }),
);
