import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { open, unlink } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { promisify } from "node:util";
import { profile } from "../../scripts/source-pdf-v2-linux/profile.mjs";

export const SOURCE_PDF_V2_LINUX_IMAGE =
  "sha256:d27ddd7b09410b0a3b220b2768c0f6b2b25c32da528a42041bc50ea19eefc1b7";
const execute = promisify(execFile);
const environment = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  NODE_ENV: "production" as const,
};

// Server/operator composition only; no user-selected image, executable, path or URL.
export async function runSourcePdfV2LinuxWorker(bytes: Uint8Array): Promise<unknown> {
  if (!bytes.length || bytes.length > profile.maxOriginalBytes)
    throw new Error("PDF_V2_INPUT_LIMIT");
  const name = "otr-source-pdf-v2-" + randomUUID();
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const child = execFile(
        "docker",
        [
          "run",
          "--rm",
          "--name",
          name,
          "--platform",
          profile.platform,
          "--pull=never",
          "--network=none",
          "--read-only",
          "--user=65534:65534",
          "--cap-drop=ALL",
          "--security-opt=no-new-privileges",
          `--memory=${profile.memoryMiB}m`,
          `--memory-swap=${profile.memoryMiB}m`,
          "--cpus=1",
          "--pids-limit=16",
          "--ulimit",
          `cpu=${profile.cpuSeconds}:${profile.cpuSeconds}`,
          "--ulimit",
          "nofile=32:32",
          "--ulimit",
          "fsize=16777216:16777216",
          "--ulimit",
          "core=0:0",
          "--tmpfs",
          `/tmp:rw,noexec,nosuid,nodev,size=${profile.tmpMiB}m,mode=1777`,
          "-i",
          SOURCE_PDF_V2_LINUX_IMAGE,
        ],
        {
          env: environment,
          timeout: profile.wallMs,
          killSignal: "SIGKILL",
          maxBuffer: profile.outputBytes,
          encoding: "utf8",
        },
        (error, stdout) => {
          if (error) return reject(new Error("PDF_V2_WORKER_FAILED"));
          try {
            const lines = stdout.trim().split("\n");
            if (lines.length !== 1) throw new Error();
            resolve(JSON.parse(lines[0]));
          } catch {
            reject(new Error("PDF_V2_WORKER_OUTPUT_INVALID"));
          }
        },
      );
      child.stdin?.on("error", () => {
        /* close owns outcome */
      });
      child.stdin?.end(
        JSON.stringify({ bytes: Buffer.from(bytes).toString("base64") }) + "\n",
      );
    });
  } finally {
    // Killing the Docker client alone does not prove its worker terminated.
    try {
      await execute("docker", ["rm", "--force", name], {
        env: environment,
        timeout: 5000,
        maxBuffer: 4096,
      });
    } catch {
      try {
        const status = await execute(
          "docker",
          ["ps", "-a", "--filter", `name=^/${name}$`, "--format", "{{.ID}}"],
          { env: environment, timeout: 5000, maxBuffer: 4096 },
        );
        if (status.stdout.trim()) throw new Error();
      } catch {
        throw new Error("PDF_V2_WORKER_TERMINATION_UNKNOWN");
      }
    }
  }
}

// Host composition owns a private persistent path; never clear an orphan marker automatically.
export function createSourcePdfV2WorkerLease(
  lockPath: string,
  run = runSourcePdfV2LinuxWorker,
) {
  if (!isAbsolute(lockPath) || lockPath.includes("\0"))
    throw Error("PDF_V2_WORKER_LOCK_INVALID");
  return async (bytes: Uint8Array): Promise<unknown> => {
    try {
      const marker = await open(lockPath, "wx", 0o600);
      await marker.close();
    } catch {
      throw Error("PDF_V2_WORKER_UNAVAILABLE");
    }
    let terminated = false;
    try {
      const value = await run(bytes);
      terminated = true;
      return value;
    } catch (error) {
      terminated =
        error instanceof Error &&
        [
          "PDF_V2_INPUT_LIMIT",
          "PDF_V2_WORKER_FAILED",
          "PDF_V2_WORKER_OUTPUT_INVALID",
        ].includes(error.message);
      throw error;
    } finally {
      if (terminated) await unlink(lockPath);
    }
  };
}
