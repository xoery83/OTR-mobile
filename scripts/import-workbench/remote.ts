import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { z } from "zod";
import { mapDeepSeekFlightUsage } from "../../backend/src/deepSeekFlight";
import { projectCaptureLocalFlightInterpretation } from "../../src/domain/capture/captureLocalInterpretation";
import {
  buildFlightAssemblyRequest,
  flightAssemblyProposalSchema,
  validateFlightAssemblyProposal,
} from "../../src/domain/trip/flightSemanticAssembly";
import type { DiagnosticTrace } from "../../src/native/importWorkbenchRun";
import { PrivateStore, idSchema } from "./store";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const remoteReceiptSchema = z.strictObject({
  version: z.literal(1),
  id: idSchema,
  inputId: idSchema,
  baselineRunId: idSchema,
  originalSha256: digest,
  requestSha256: digest,
  provider: z.literal("DeepSeek"),
  model: z.literal("deepseek-flash"),
  mode: z.enum(["TEXT", "VISION"]),
  recordedAt: z.iso.datetime(),
  http: z.number().int().min(100).max(599),
  latencyMs: z.number().nonnegative().finite(),
  output: z.string().max(131072),
  finishReason: z.string().max(80),
  usage: z.unknown(),
  textInputUpperBound: z.number().int().positive().max(1000000),
  outputLimit: z.number().int().positive().max(8192),
  reviewNotes: z.string().max(2000),
  requestContract: z.strictObject({
    version: z.string().max(80),
    basis: z.array(z.string().max(200)).max(20),
    rules: z.array(z.string().max(2000)).max(30),
    output: z.string().max(2000),
  }),
  recordedValidation: z.strictObject({
    status: z.enum(["ACCEPTED", "REJECTED"]),
    reasonCodes: z.array(z.string().max(100)).max(30),
  }),
});
export function remoteReceiptView(store: PrivateStore, raw: unknown) {
  const receipt = remoteReceiptSchema.parse(raw),
    input = store.input(receipt.inputId);
  if (input.sha256 !== receipt.originalSha256) throw new Error("REMOTE_INPUT_MISMATCH");
  store.bytes(input);
  const baseline = store.read(`run-${receipt.baselineRunId}.json`) as {
    inputId: string;
    trace: DiagnosticTrace;
  };
  const result = baseline.trace?.result;
  if (
    baseline.inputId !== input.id ||
    result?.inputId !== input.id ||
    result.originalSha256 !== input.sha256 ||
    result.originalByteCount !== input.byteCount
  )
    throw new Error("REMOTE_BASELINE_MISMATCH");
  const typed = projectCaptureLocalFlightInterpretation(result);
  if (!typed.assembly) throw new Error("REMOTE_ASSEMBLY_MISSING");
  const request = buildFlightAssemblyRequest(
    [
      {
        inputId: input.id,
        text: result.text,
        originalSha256: input.sha256,
        originalByteCount: input.byteCount,
        parsed: {
          items: typed.assembly.contentBlocks.map((b) => b.observation),
          fragments: typed.fragments,
        },
      },
    ],
    typed.assembly,
  );
  const originalRequest = { ...request, partA: receipt.requestContract };
  if (
    createHash("sha256").update(JSON.stringify(originalRequest)).digest("hex") !==
    receipt.requestSha256
  )
    throw new Error("REMOTE_REQUEST_MISMATCH");
  let proposal: unknown = null,
    jsonValid = false;
  try {
    proposal = JSON.parse(receipt.output);
    jsonValid = true;
  } catch {
    /* Recorded invalid output remains invalid. */
  }
  const schemaValid = flightAssemblyProposalSchema.safeParse(proposal).success;
  const validation = validateFlightAssemblyProposal(request, proposal);
  const usage = mapDeepSeekFlightUsage(receipt.usage);
  const cost =
    usage.input_tokens === null || usage.output_tokens === null
      ? null
      : {
          status: "ESTIMATED_NOT_INVOICE",
          currency: "USD",
          priceDate: "2026-10-17",
          source: "https://api-docs.deepseek.com/quick_start/pricing/",
          // Peak cache-miss rate bounds cost without guessing cache billing or time band.
          peakUpper: (usage.input_tokens * 0.3 + usage.output_tokens * 1.2) / 1000000,
        };
  const shape = flightAssemblyProposalSchema.safeParse(proposal);
  const signature = (ids: string[]) => [...ids].sort().join("|");
  const existing = new Set(
    request.partB.deterministicSegments.map((s) => signature(s.observationIds)),
  );
  const relationshipChanges = shape.success
    ? shape.data.segments
        .filter((s) => !existing.has(signature(s.observationIds)))
        .map((s) => s.id)
    : [];
  return {
    ...receipt,
    contribution: {
      newFieldValues: 0,
      relationshipChanges,
      effectiveIncrement: "NOT_AUTO_CONFIRMED",
    },
    usage,
    jsonValid,
    schemaValid,
    proposal,
    validation,
    cost,
    request: originalRequest,
    revalidatedContractVersion: request.partA.version,
    deterministic: request.partB.deterministicSegments,
    provenance: "RECORDED_REMOTE_DIAGNOSTIC_NOT_CURRENT_LOCAL_RUN",
    sourceAuthority: "NONE",
    admission: "NOT_RUN",
    canonicalWrites: false,
    tokenEstimate: {
      textInputUpperBound: receipt.textInputUpperBound,
      imageInput: receipt.mode === "VISION" ? "NOT_ESTIMATED" : "NOT_APPLICABLE",
      outputLimit: receipt.outputLimit,
      kind: "UTF8_BYTE_UPPER_BOUND_NOT_TOKENIZER",
    },
  };
}
export function readRemoteDiagnostics(store: PrivateStore, inputId: string) {
  const records: ReturnType<typeof remoteReceiptView>[] = [];
  let rejectedRecords = 0;
  const files = readdirSync(store.root).filter((v) =>
    /^remote-[a-f0-9-]+\.json$/.test(v),
  );
  if (files.length > 64) return { records, rejectedRecords: files.length };
  for (const file of files) {
    try {
      const raw = remoteReceiptSchema.parse(store.read(file));
      if (raw.inputId === inputId) records.push(remoteReceiptView(store, raw));
    } catch {
      rejectedRecords++;
    }
  }
  return {
    records: records.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
    rejectedRecords,
  };
}
