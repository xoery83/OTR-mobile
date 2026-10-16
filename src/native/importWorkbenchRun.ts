// Shared diagnostic orchestration. No Auth, Repository, network or business writes.
import {
  buildCaptureLocalResult,
  projectCaptureLocalFlightInterpretation,
} from "@/domain/capture/captureLocalInterpretation";
import { runCaptureFlightAssembly } from "@/domain/capture/captureFlightAssembly";
import type { createCaptureLocalExtractorCore } from "@/native/captureLocalExtractionCore";

export type DiagnosticJob = {
  runId: string;
  inputId: string;
  mediaType: string;
  sha256: string;
  byteCount: number;
  hostSourceManifest: Record<string, string>;
};
export type DiagnosticTrace = Awaited<ReturnType<typeof runImportDiagnostic>>;
export async function runImportDiagnostic(
  job: DiagnosticJob,
  bytes: Uint8Array,
  extractor: ReturnType<typeof createCaptureLocalExtractorCore>,
  hash: (bytes: Uint8Array) => Promise<string>,
  runtime: "MAC_COMPONENT" | "IOS_DIAGNOSTIC_COMPONENT",
  stage: (name: string) => void = () => undefined,
) {
  const startedAt = new Date().toISOString();
  const timings: Record<string, number> = {};
  if (bytes.length !== job.byteCount || (await hash(bytes)) !== job.sha256)
    throw new Error("INPUT_PIN_MISMATCH");
  stage("EXTRACTING");
  let start = Date.now();
  const extraction = await extractor.extract(bytes, job.mediaType);
  timings.extractionMs = Date.now() - start;
  const textSha256 = await hash(new TextEncoder().encode(extraction.text));
  stage("DETERMINISTIC");
  start = Date.now();
  const capability = await extractor.modelCapability();
  const deterministic = buildCaptureLocalResult(
    job.inputId,
    extraction,
    { sha256: job.sha256, byteCount: job.byteCount },
    textSha256,
    capability.status,
  );
  timings.deterministicAndCapabilityMs = Date.now() - start;
  const model:
    | {
        status: "NOT_RUN";
        reason: "SEMANTIC_ASSEMBLY_REPLACES_SERVICE_EXTRACTION";
        observations: never[];
      }
    | Awaited<ReturnType<typeof extractor.enrich>> = {
    status: "NOT_RUN" as const,
    reason: "SEMANTIC_ASSEMBLY_REPLACES_SERVICE_EXTRACTION" as const,
    observations: [],
  };
  stage("ASSEMBLY");
  start = Date.now();
  const assemblyDiagnostics = await runCaptureFlightAssembly(
    deterministic,
    capability,
    async (requestJSON) => {
      stage("APPLE_ASSEMBLY");
      const begin = Date.now();
      const proposal = await extractor.proposeAssembly(requestJSON);
      timings.appleAssemblyMs = Date.now() - begin;
      return proposal;
    },
  );
  timings.assemblyDeadlineInclusiveMs = Date.now() - start;
  stage("TYPED_PROJECTION");
  const result = {
    ...deterministic,
    assemblyDiagnostics,
  };
  const typed = projectCaptureLocalFlightInterpretation(result);
  return {
    schema: "OTR_IMPORT_DIAGNOSTIC_TRACE" as const,
    version: 1 as const,
    mode: "DIAGNOSTIC_ONLY" as const,
    runtime,
    job,
    // Host provenance is not evidence of the installed Native binary or loaded Metro bundle.
    executedVersion: { native: "UNVERIFIED" as const, javascript: "UNVERIFIED" as const },
    startedAt,
    finishedAt: new Date().toISOString(),
    timings,
    capability,
    extraction,
    textSha256,
    model: model as {
      status: "NOT_RUN" | "SUCCEEDED" | "UNAVAILABLE" | "FAILED";
      reason: string;
      observations: { literal: string; start: number; end: number }[];
    },
    result,
    typed,
    remote: "NOT_USED" as const,
    remoteCost: 0 as const,
    sourceAuthority: "NONE" as const,
    admission: "NOT_AVAILABLE" as const,
    coldModelResourceClaim: "UNVERIFIED" as const,
  };
}
