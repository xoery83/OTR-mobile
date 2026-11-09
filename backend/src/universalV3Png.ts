import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { PNG_DEV_X64_EXECUTION_PROFILE_SHA256 } from "../../src/domain/trip/sourcePngPreparation";
import {
  SOURCE_PNG_SANDBOX_IMAGE,
  verifySourcePngSandboxObservation,
} from "./sourcePngStorageProducer";
import { SOURCE_PDF_V2_LINUX_IMAGE } from "./sourcePdfV2LinuxWorker";

const execute = promisify(execFile);
const env = { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "production" as const };

export async function universalV3DecodersPresent() {
  try {
    await execute(
      "docker",
      [
        "image",
        "inspect",
        "--format",
        "{{.Id}}",
        SOURCE_PDF_V2_LINUX_IMAGE,
        SOURCE_PNG_SANDBOX_IMAGE,
      ],
      { env, timeout: 4000, maxBuffer: 4096 },
    );
    return true;
  } catch {
    return false;
  }
}

export function createUniversalV3ImageValidator(directory: string) {
  if (directory.includes(",") || directory.includes("\0"))
    throw Error("UNIVERSAL_V3_IMAGE_DIRECTORY");
  return async (mediaType: string, bytes: Buffer) => {
    // Reuse the existing bounded stateless decoder. This path owns no Source,
    // storage POST, broker, journal handshake or cross-analysis marker.
    if (mediaType !== "image/png" || !bytes.length || bytes.length > 1048576)
      throw Error("UNIVERSAL_V3_IMAGE_DECODER_UNAVAILABLE");
    const token = randomBytes(16).toString("hex");
    const name = "otr-v3-image-" + token;
    const stage = await mkdtemp(join(directory, "v3-decoder-"));
    const input = join(stage, "input");
    try {
      await writeFile(input, bytes, { flag: "wx", mode: 0o600 });
      await chmod(input, 0o444);
      const output = await new Promise<string>((resolve, reject) => {
        const child = execFile(
          "docker",
          [
            "run",
            "--rm",
            "--name",
            name,
            "--platform=linux/amd64",
            "--pull=never",
            "--network=none",
            "--read-only",
            "--user=65534:65534",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges",
            "--cpus=1",
            "--memory=128m",
            "--memory-swap=128m",
            "--pids-limit=16",
            "--ulimit",
            "cpu=1:1",
            "--ulimit",
            "nofile=32:32",
            "--ulimit",
            "core=0:0",
            "--mount",
            "type=bind,src=" + input + ",dst=/input,readonly",
            "-i",
            SOURCE_PNG_SANDBOX_IMAGE,
          ],
          { env, timeout: 5000, killSignal: "SIGKILL", maxBuffer: 4096 },
          (error, stdout) =>
            error
              ? reject(Error("UNIVERSAL_V3_IMAGE_PROCESSING_FAILED"))
              : resolve(stdout),
        );
        child.stdin?.on("error", () => {});
        child.stdin?.end(
          JSON.stringify({
            protocol_version: 1,
            profile_version: 1,
            profile_sha256: PNG_DEV_X64_EXECUTION_PROFILE_SHA256,
            input_token: token,
            input_sha256: createHash("sha256").update(bytes).digest("hex"),
            byte_count: bytes.length,
            declared_mime: "image/png",
          }) + "\n",
        );
      });
      const result = JSON.parse(output);
      if (result.input_token !== token) throw Error("UNIVERSAL_V3_IMAGE_IDENTITY");
      verifySourcePngSandboxObservation(bytes, {
        imageId: SOURCE_PNG_SANDBOX_IMAGE,
        terminated: true,
        result,
      });
    } finally {
      await execute("docker", ["rm", "-f", name], {
        env,
        timeout: 4000,
        maxBuffer: 4096,
      }).catch(() => {});
      await rm(stage, { recursive: true, force: true });
    }
  };
}
