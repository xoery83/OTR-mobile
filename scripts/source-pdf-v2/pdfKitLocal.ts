import { execFile } from "node:child_process";
import { isAbsolute } from "node:path";
import { PDF_V2_LOCAL_PROFILE } from "../../backend/src/sourcePdfV2Local";

// Local component only. No Source writer imports this operator-selected executable.
export function localPdfKitDecoder(binary: string) {
  if (!isAbsolute(binary)) throw new Error("PDF_V2_RUNNER_INVALID");
  return (bytes: Uint8Array) =>
    new Promise<unknown>((resolve, reject) => {
      const child = execFile(
        binary,
        [],
        {
          timeout: PDF_V2_LOCAL_PROFILE.wallTimeoutMs,
          killSignal: "SIGKILL",
          maxBuffer: PDF_V2_LOCAL_PROFILE.maxProcessOutputBytes,
          encoding: "utf8",
          env: { PATH: "/usr/bin:/bin", LANG: "C", NODE_ENV: "production" },
        },
        (error, stdout) => {
          // execFile callback follows close; timeout/output errors never yield success.
          if (error) return reject(new Error("PDF_V2_COMPONENT_FAILED"));
          try {
            const lines = stdout.trim().split("\n");
            if (lines.length !== 1) throw new Error();
            resolve(JSON.parse(lines[0]));
          } catch {
            reject(new Error("PDF_V2_COMPONENT_INVALID"));
          }
        },
      );
      child.stdin?.on("error", () => {
        /* close callback owns outcome */
      });
      child.stdin?.end(
        JSON.stringify({
          operation: "extract",
          mediaType: "application/pdf",
          bytes: Buffer.from(bytes).toString("base64"),
        }) + "\n",
      );
    });
}
