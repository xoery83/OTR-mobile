// Shared diagnostic orchestration. No Auth, Repository, network or business writes.
import {
  attachCaptureLocalModelEvidence,
  buildCaptureLocalResult,
  needsCaptureLocalEnrichment,
  projectCaptureLocalFlightInterpretation,
} from "@/domain/capture/captureLocalInterpretation";
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
  let model: Awaited<ReturnType<typeof extractor.enrich>> = {
    status: "UNAVAILABLE",
    reason: capability.reason,
    observations: [],
  };
  if (capability.status === "AVAILABLE" && needsCaptureLocalEnrichment(deterministic)) {
    stage("APPLE_MODEL");
    start = Date.now();
    model = await extractor.enrich(deterministic.text);
    timings.modelDeadlineInclusiveMs = Date.now() - start;
  }
  stage("TYPED_PROJECTION");
  const result = attachCaptureLocalModelEvidence(deterministic, model);
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
    model,
    result,
    typed,
    remote: "NOT_USED" as const,
    remoteCost: 0 as const,
    sourceAuthority: "NONE" as const,
    admission: "NOT_AVAILABLE" as const,
    coldModelResourceClaim: "UNVERIFIED" as const,
  };
}
