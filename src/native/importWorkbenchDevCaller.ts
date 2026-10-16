import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { digest, CryptoDigestAlgorithm } from "expo-crypto";
import { z } from "zod";
import { createCaptureLocalExtractor } from "./captureLocalExtraction";
import { runImportDiagnostic } from "./importWorkbenchRun";

const origin = "http://127.0.0.1:49184";
const gateSchema = z.strictObject({
  device: z.literal("418CF8AE-ED96-4E76-8D22-533EB6C08032"),
  container: z.string().uuid(),
  token: z.string().regex(/^[a-f0-9]{64}$/),
  origin: z.literal(origin),
  expiresAt: z.number().int(),
  version: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
});
const jobSchema = z.strictObject({
  runId: z.string().uuid(),
  inputId: z.string().uuid(),
  mediaType: z.enum(["application/pdf", "image/jpeg", "image/png", "text/plain"]),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteCount: z.number().int().min(1).max(10485760),
  version: z.record(z.string(), z.string()),
});
let running = false;
// No automatic activation. Both DEV opt-in and a short-lived exact-Simulator private gate are required.
export function startImportWorkbenchDevCaller() {
  if (
    !__DEV__ ||
    process.env.EXPO_PUBLIC_OTR_IMPORT_WORKBENCH !== "1" ||
    Platform.OS !== "ios" ||
    String(Platform.Version) !== "26.5" ||
    running
  )
    return () => undefined;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  running = true;
  const hash = async (bytes: Uint8Array) =>
    Array.from(
      new Uint8Array(await digest(CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes))),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
  async function poll() {
    try {
      const file = new File(Paths.cache, "import-workbench/gate.json");
      if (!file.exists || file.size > 8192) return;
      const gate = gateSchema.parse(JSON.parse(await file.text()));
      if (
        stopped ||
        Date.now() > gate.expiresAt ||
        gate.expiresAt > Date.now() + 3_600_000 ||
        !Paths.document.uri.includes(`/Application/${gate.container}/Documents`)
      )
        return;
      const request = async (path: string, value?: unknown) => {
        const response = await fetch(origin + path, {
          method: value ? "POST" : "GET",
          headers: {
            "X-OTR-Diagnostic": gate.token,
            ...(value ? { "Content-Type": "application/json" } : {}),
          },
          ...(value ? { body: JSON.stringify(value) } : {}),
        });
        if (!response.ok) throw new Error("DIAGNOSTIC_TRANSPORT_FAILED");
        return response.json();
      };
      const response = await request("/native/job");
      if (!response || stopped) return;
      const job = jobSchema.parse(response.job);
      try {
        if (
          JSON.stringify(job.version) !== JSON.stringify(gate.version) ||
          typeof response.bytesBase64 !== "string" ||
          response.bytesBase64.length > 13981016
        )
          throw new Error("DIAGNOSTIC_PIN_INVALID");
        const bytes = Uint8Array.from(atob(response.bytesBase64), (c) => c.charCodeAt(0));
        const trace = await runImportDiagnostic(
          job,
          bytes,
          createCaptureLocalExtractor(),
          hash,
          "IOS_DIAGNOSTIC_COMPONENT",
          (stage) => {
            void request("/native/stage", { runId: job.runId, stage }).catch(
              () => undefined,
            );
          },
        );
        await request("/native/trace", trace);
      } catch {
        await request("/native/failure", {
          runId: job.runId,
          code: "IOS_DIAGNOSTIC_FAILED",
        });
      }
    } catch {
      /* Fixed no-log failure. Never expose original text, path, Auth or raw native errors. */
    } finally {
      if (!stopped)
        timer = setTimeout(() => {
          void poll();
        }, 1000);
    }
  }
  void poll();
  return () => {
    stopped = true;
    clearTimeout(timer);
    running = false;
  };
}
