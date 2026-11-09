import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { expect, it } from "vitest";
import {
  createUniversalV3ImageValidator,
  universalV3DecodersPresent,
} from "./universalV3Image";

const image = process.env.OTR_V3_REAL_IMAGE_DECODER;

it.skipIf(!image)(
  "normalizes four real static formats in the pinned Linux sandbox",
  async () => {
    expect(image).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(await universalV3DecodersPresent(image!)).toBe(true);
    const node = (code: string, input?: Buffer) =>
      execFileSync(
        "docker",
        [
          "run",
          "--rm",
          "--pull=never",
          "--platform=linux/amd64",
          "--network=none",
          "--read-only",
          "--user=65534:65534",
          "--cap-drop=ALL",
          "--security-opt=no-new-privileges",
          "-i",
          "--entrypoint",
          "node",
          image!,
          "--input-type=module",
          "-e",
          code,
        ],
        { input, timeout: 10000, maxBuffer: 128 * 1024 },
      ).toString("utf8");
    const fixtures: Record<string, string> = JSON.parse(
      node(`
      import sharp from "sharp";
      const flat = () => sharp({ create: { width: 12, height: 8, channels: 3, background: "#224466" } });
      const alpha = () => sharp({ create: { width: 12, height: 8, channels: 4, background: { r: 10, g: 20, b: 30, alpha: .5 } } });
      const frames = Buffer.from([255,0,0,255, 0,255,0,255, 0,0,255,255, 255,255,0,255]);
      const animated = () => sharp(frames, { raw: { width: 2, height: 2, channels: 4, pageHeight: 1 } });
      const values = {
        png: await alpha().png().toBuffer(),
        jpeg: await flat().withMetadata({orientation:6}).jpeg().toBuffer(),
        webp: await flat().webp().toBuffer(),
        gif: await flat().gif().toBuffer(),
        animatedGif: await animated().gif({ delay: [100, 200] }).toBuffer(),
        animatedWebp: await animated().webp({ delay: [100, 200] }).toBuffer(),
      };
      console.log(JSON.stringify(Object.fromEntries(Object.entries(values).map(([key, bytes]) => [key, bytes.toString("base64")]))));
    `),
    );
    const decode = createUniversalV3ImageValidator(image!);
    const outcomes: {
      input: string;
      output: string;
      bytes: number;
      elapsedMs: number;
    }[] = [];
    const inspect = (bytes: Buffer) =>
      JSON.parse(
        node(
          `
      import sharp from "sharp";
      const input = [];
      for await (const chunk of process.stdin) input.push(chunk);
      const m = await sharp(Buffer.concat(input)).metadata();
      console.log(JSON.stringify({format:m.format,width:m.width,height:m.height,alpha:m.hasAlpha,
        metadata:Boolean(m.exif || m.icc || m.xmp || m.iptc || m.orientation)}));
    `,
          bytes,
        ),
      );
    for (const type of ["png", "jpeg", "webp", "gif"]) {
      const start = performance.now();
      const output = await decode(`image/${type}`, Buffer.from(fixtures[type], "base64"));
      outcomes.push({
        input: type,
        output: output.mediaType,
        bytes: output.bytes.length,
        elapsedMs: Math.round(performance.now() - start),
      });
      expect(inspect(output.bytes)).toEqual({
        format: output.mediaType.slice(6),
        width: type === "jpeg" ? 8 : 12,
        height: type === "jpeg" ? 12 : 8,
        alpha: type === "png",
        metadata: false,
      });
    }
    expect(outcomes.map(({ output }) => output)).toEqual([
      "image/png",
      "image/jpeg",
      "image/jpeg",
      "image/png",
    ]);
    const png = Buffer.from(fixtures.png, "base64");
    await expect(decode("image/jpeg", png)).rejects.toThrow(
      "UNIVERSAL_V3_IMAGE_PROCESSING_FAILED",
    );
    await expect(decode("image/png", png.subarray(0, 20))).rejects.toThrow(
      "UNIVERSAL_V3_IMAGE_PROCESSING_FAILED",
    );
    await expect(
      decode("image/gif", Buffer.from(fixtures.animatedGif, "base64")),
    ).rejects.toThrow("UNIVERSAL_V3_IMAGE_PROCESSING_FAILED");
    await expect(
      decode("image/webp", Buffer.from(fixtures.animatedWebp, "base64")),
    ).rejects.toThrow("UNIVERSAL_V3_IMAGE_PROCESSING_FAILED");
    await expect(decode("image/heic", png)).rejects.toThrow("UNIVERSAL_V3_IMAGE_BOUND");
    console.log(JSON.stringify({ image, outcomes }));
  },
  30_000,
);
