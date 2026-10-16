import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { createInterface } from "node:readline";
import { join, resolve } from "node:path";
import { buildSync } from "esbuild";
import { createCaptureLocalExtractorCore } from "../../src/native/captureLocalExtractionCore";
import {
  runImportDiagnostic,
  type DiagnosticJob,
} from "../../src/native/importWorkbenchRun";

export const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
// Resolve only the actual local runtime import closure, not the entire repository.
// External package versions/integrity are pinned by the existing dependency lock.
export function sourceVersion(
  read: (path: string) => Uint8Array = (p) => readFileSync(p),
) {
  const graph = buildSync({
    entryPoints: [
      "src/native/captureLocalExtraction.ts",
      "src/native/importWorkbenchRun.ts",
      "src/native/importWorkbenchDevCaller.ts",
    ],
    bundle: true,
    write: false,
    metafile: true,
    packages: "external",
    platform: "node",
    outdir: "unused-workbench-manifest",
    alias: { "@": resolve("src") },
    logLevel: "silent",
  });
  const files = [
    ...new Set([
      ...Object.keys(graph.metafile!.inputs),
      "modules/receipt-ocr/ios/FlightPdfExtractor.swift",
      "scripts/import-workbench/Runner.swift",
      "scripts/import-workbench/mac.ts",
      "package.json",
      "package-lock.json",
    ]),
  ].sort();
  return Object.fromEntries(
    files.map((path) => [path, createHash("sha256").update(read(path)).digest("hex")]),
  );
}
export function compileNative(root: string) {
  const binary = join(root, "native-runner");
  const pin = createHash("sha256").update(JSON.stringify(sourceVersion())).digest("hex");
  try {
    if (readFileSync(join(root, "native-build-pin"), "utf8") === pin) return binary;
  } catch {
    /* first build */
  }
  execFileSync(
    "xcrun",
    [
      "--sdk",
      "macosx",
      "swiftc",
      "-parse-as-library",
      "modules/receipt-ocr/ios/FlightPdfExtractor.swift",
      "scripts/import-workbench/Runner.swift",
      "-o",
      binary,
    ],
    { timeout: 120_000, stdio: "pipe" },
  );
  chmodSync(binary, 0o700);
  writeFileSync(join(root, "native-build-pin"), pin, { mode: 0o600 });
  return binary;
}
export async function runMac(
  job: DiagnosticJob,
  bytes: Uint8Array,
  binary: string,
  stage: (s: string) => void,
) {
  const child = spawn(binary, [], { stdio: ["pipe", "pipe", "ignore"] });
  const lines = createInterface({ input: child.stdout });
  let pending:
    | {
        resolve: (v: unknown) => void;
        reject: (e: Error) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    | undefined;
  function fail() {
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error("NATIVE_COMPONENT_FAILED"));
      pending = undefined;
    }
  }
  child.on("error", fail);
  child.on("exit", fail);
  lines.on("line", (line) => {
    if (!pending) return;
    const current = pending;
    pending = undefined;
    clearTimeout(current.timer);
    try {
      if (line.length > 2_000_000) throw new Error();
      current.resolve(JSON.parse(line));
    } catch {
      current.reject(new Error("NATIVE_RESPONSE_INVALID"));
    }
  });
  const request = (operation: string, payload = {}) =>
    new Promise<unknown>((resolve, reject) => {
      if (pending) return reject(new Error("NATIVE_BUSY"));
      const timer = setTimeout(() => {
        pending = undefined;
        reject(new Error("NATIVE_COMPONENT_TIMEOUT"));
        child.kill();
      }, 60_000);
      pending = { resolve, reject, timer };
      child.stdin.write(JSON.stringify({ operation, ...payload }) + "\n");
    });
  let assemblyRequestId: string | undefined;
  const extractor = createCaptureLocalExtractorCore({
    hash,
    getBridge: () => ({
      extractCaptureLocal: (v, mediaType) =>
        request("extract", { bytes: Buffer.from(v).toString("base64"), mediaType }),
      captureLocalModelCapability: () => request("capability"),
      enrichCaptureFlightLocal: (text) => request("enrich", { text }),
      proposeCaptureFlightAssemblyLocal: (requestJSON, requestId, deadlineMs) => {
        assemblyRequestId = requestId;
        return request("assembly", { requestJSON, requestId, deadlineMs }).finally(() => {
          if (assemblyRequestId === requestId) assemblyRequestId = undefined;
        });
      },
      cancelCaptureFlightAssemblyLocal: async (requestId) => {
        if (assemblyRequestId !== requestId) return;
        fail();
        child.kill();
      },
    }),
  });
  try {
    return await runImportDiagnostic(job, bytes, extractor, hash, "MAC_COMPONENT", stage);
  } finally {
    fail();
    lines.close();
    child.kill();
  }
}
