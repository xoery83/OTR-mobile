import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { SOURCE_PDF_V2_LINUX_IMAGE } from "./sourcePdfV2LinuxWorker";

const execute = promisify(execFile);
const env = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  NODE_ENV: "production" as const,
};
const options = { env, timeout: 4000, maxBuffer: 4096 };
const imageIdentity = /^sha256:[a-f0-9]{64}$/;
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export async function universalV3DecodersPresent(imageId: string) {
  if (!imageIdentity.test(imageId)) return false;
  try {
    const { stdout } = await execute(
      "docker",
      [
        "image",
        "inspect",
        "--format",
        "{{.Id}} {{.Os}}/{{.Architecture}}",
        SOURCE_PDF_V2_LINUX_IMAGE,
        imageId,
      ],
      options,
    );
    return (
      stdout.trim() === `${SOURCE_PDF_V2_LINUX_IMAGE} linux/amd64\n${imageId} linux/amd64`
    );
  } catch {
    return false;
  }
}

export function createUniversalV3ImageValidator(imageId: string) {
  if (!imageIdentity.test(imageId)) throw Error("UNIVERSAL_V3_IMAGE_DECODER_IDENTITY");
  return async (mediaType: string, bytes: Buffer) => {
    if (
      !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mediaType) ||
      !bytes.length ||
      bytes.length > 12 * 1024 * 1024
    )
      throw Error("UNIVERSAL_V3_IMAGE_BOUND");
    const name = `otr-v3-image-${randomUUID()}`;
    let output: Buffer;
    try {
      output = await new Promise<Buffer>((resolve, reject) => {
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
            "--memory=192m",
            "--memory-swap=192m",
            "--pids-limit=32",
            "--ulimit",
            "cpu=2:2",
            "--ulimit",
            "nofile=32:32",
            "--ulimit",
            "core=0:0",
            "-i",
            imageId,
            mediaType,
          ],
          {
            env,
            timeout: 5000,
            killSignal: "SIGKILL",
            maxBuffer: 2 * 1024 * 1024,
            encoding: "buffer",
          },
          (error, stdout) =>
            error
              ? reject(Error("UNIVERSAL_V3_IMAGE_PROCESSING_FAILED"))
              : resolve(stdout),
        );
        child.stdin?.on("error", () => {});
        child.stdin?.end(bytes);
      });
    } catch (error) {
      try {
        await execute("docker", ["rm", "--force", name], options);
      } catch {
        try {
          const { stdout } = await execute(
            "docker",
            ["ps", "-a", "--filter", `name=^/${name}$`, "--format", "{{.ID}}"],
            options,
          );
          if (stdout.trim()) throw Error();
        } catch {
          throw Error("UNIVERSAL_V3_IMAGE_TERMINATION_UNKNOWN");
        }
      }
      throw error;
    }
    if (output.subarray(0, 8).equals(png))
      return { bytes: output, mediaType: "image/png" as const };
    if (output[0] === 255 && output[1] === 216 && output[2] === 255)
      return { bytes: output, mediaType: "image/jpeg" as const };
    throw Error("UNIVERSAL_V3_IMAGE_OUTPUT");
  };
}
