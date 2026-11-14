import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifySourcePdfV2LinuxBytes } from "./sourcePdfV2LinuxVerifier";

const root = "/opt/otr/import-v3";
const maxOutputBytes = 2 * 1024 * 1024;
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function decode(
  script: "decode.mjs" | "decode-pdf.mjs" | "probe.mjs",
  input: Uint8Array,
  deadlineMs: number,
  args: string[] = [],
  scratch = "",
) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(
      root + "/sandbox",
      [scratch, String(process.pid), "--", root + "/" + script, ...args],
      {
        cwd: root,
        env: { NODE_ENV: "production" },
        detached: true,
        stdio: ["pipe", "pipe", "ignore"],
      },
    );
    const chunks: Buffer[] = [];
    let length = 0;
    let stopped = false;
    const stopGroup = () => {
      if (child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
      }
    };
    const stop = () => {
      if (stopped) return;
      stopped = true;
      try {
        stopGroup();
      } catch {
        reject(Error("UNIVERSAL_V3_DECODER_TERMINATION_UNKNOWN"));
      }
    };
    const timer = setTimeout(stop, deadlineMs);
    child.stdin.on("error", () => {});
    child.stdout.on("data", (chunk: Buffer) => {
      length += chunk.length;
      if (length > maxOutputBytes) stop();
      else chunks.push(chunk);
    });
    child.once("error", () => {
      clearTimeout(timer);
      reject(Error("UNIVERSAL_V3_DECODER_UNAVAILABLE"));
    });
    child.once("close", (status) => {
      clearTimeout(timer);
      try {
        stopGroup();
      } catch {
        reject(Error("UNIVERSAL_V3_DECODER_TERMINATION_UNKNOWN"));
        return;
      }
      if (status !== 0 || stopped) reject(Error("UNIVERSAL_V3_DECODER_REJECTED"));
      else resolve(Buffer.concat(chunks, length));
    });
    child.stdin.end(input);
  });
}

export async function universalV3DecodersPresent() {
  try {
    return (
      (await decode("probe.mjs", Buffer.alloc(0), 4000)).toString() ===
      "OTR_IMPORT_V3_READY"
    );
  } catch {
    return false;
  }
}

export async function normalizeUniversalV3Image(mediaType: string, bytes: Buffer) {
  if (
    !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mediaType) ||
    !bytes.length ||
    bytes.length > 12 * 1024 * 1024
  )
    throw Error("UNIVERSAL_V3_IMAGE_BOUND");
  const output = await decode("decode.mjs", bytes, 5000, [mediaType]);
  if (output.subarray(0, 8).equals(png))
    return { bytes: output, mediaType: "image/png" as const };
  if (output[0] === 255 && output[1] === 216 && output[2] === 255)
    return { bytes: output, mediaType: "image/jpeg" as const };
  throw Error("UNIVERSAL_V3_IMAGE_OUTPUT");
}

export function extractUniversalV3Pdf(bytes: Uint8Array) {
  return verifySourcePdfV2LinuxBytes(bytes, async (input) => {
    const scratch = await mkdtemp(join(tmpdir(), "otr-import-v3-pdf-"));
    try {
      return JSON.parse(
        (await decode("decode-pdf.mjs", input, 20_000, [scratch], scratch)).toString(),
      );
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });
}
