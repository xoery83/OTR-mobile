import { z } from "zod";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../../src/data/auth/accountRequestContext";
import { universalResultSchema } from "../../src/data/api/universalImportContracts";
import { universalP2SourceReviewSchema } from "../../src/domain/trip/universalP2SourceReview";
import { normalizeFlightObservation } from "../../src/domain/trip/referenceFlightExtractor";
import type { ImportHash } from "../../src/domain/trip/flightImportReview";

const selectionSchema = z.strictObject({
  token: z.string().min(1).max(128),
  resultSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceReview: universalP2SourceReviewSchema,
});
// Explicit literal review only; owning Flight publication and Admission remain mandatory.
export async function reviewUniversalP2Selection(
  input: {
    context: AccountRequestContext;
    result: unknown;
    resultSha256: string;
    selection: unknown;
    material: {
      inputId: string;
      sourceId: string;
      sourceRevision: number;
      representationId: string;
      sha256: string;
      bytes: Uint8Array;
    };
  },
  deps: { hash: ImportHash; getAccountId(): Promise<string> },
) {
  await assertAccountRequestContext(input.context, deps.getAccountId);
  const result = universalResultSchema.parse(input.result),
    selection = selectionSchema.parse(input.selection),
    review = selection.sourceReview,
    material = input.material;
  if (
    result.actorId !== input.context.accountId ||
    result.accountId !== input.context.accountId ||
    result.tripId !== input.context.tripId ||
    result.providerOutcome !== "SETTLED" ||
    result.status !== "CANDIDATES_READY" ||
    selection.resultSha256 !== input.resultSha256 ||
    review.sourceRevision !== material.sourceRevision ||
    (await deps.hash(material.bytes)) !== material.sha256
  )
    throw Error("UNIVERSAL_SELECTION_UNAVAILABLE");
  const candidates = result.candidates.filter((c) => c.token === selection.token);
  if (
    candidates.length !== 1 ||
    candidates[0].kind !== "P2" ||
    candidates[0].subtype !== "FLIGHT" ||
    candidates[0].bookingTokens.length ||
    candidates[0].ticketTokens.length ||
    result.unresolved.length ||
    result.advisoryStatus === "INVALID"
  )
    throw Error("OWNING_REVIEW_REQUIRED");
  const candidate = candidates[0];
  const bindings = result.sourceBindings.filter(
    (b) =>
      b.sourceId === material.sourceId &&
      b.inputId === material.inputId &&
      b.representationId === material.representationId &&
      b.revision === material.sourceRevision &&
      b.originalSha256 === material.sha256 &&
      b.submittedSha256 === material.sha256 &&
      b.status === "READY",
  );
  if (bindings.length !== 1) throw Error("OWNING_MATERIAL_QUALIFICATION_REQUIRED");
  const fields = (paths: string[], raw: string) => {
    const selected = candidate.fields.filter((f) => paths.includes(f.path));
    if (!selected.length || selected.some((f) => f.raw !== raw || f.uncertainty))
      throw Error("SOURCE_REVIEW_MISMATCH");
    for (const f of selected) {
      if (
        !("start" in f) ||
        f.sourceId !== bindings[0].alias ||
        f.start < 0 ||
        f.end <= f.start ||
        f.end > material.bytes.length ||
        new TextDecoder("utf-8", { fatal: true }).decode(
          material.bytes.subarray(f.start, f.end),
        ) !== f.raw
      )
        throw Error("IMPORT_EVIDENCE_INVALID");
    }
    return selected;
  };
  normalizeFlightObservation("service", review.flightNumberLiteral);
  const evidence = [
    ...fields(
      ["service", "flight_number", "marketing_flight"],
      review.flightNumberLiteral,
    ),
    ...fields(["origin.local_date"], review.departureDate),
  ];
  await assertAccountRequestContext(input.context, deps.getAccountId);
  return {
    taskId: result.taskId,
    batchId: result.batchId,
    token: candidate.token,
    sourceId: material.sourceId,
    sourceRevision: material.sourceRevision,
    resultSha256: input.resultSha256,
    sourceReview: review,
    flightNumberLiteral: review.flightNumberLiteral,
    departureDate: review.departureDate,
    evidence,
    sourceObservations: candidate.fields.filter((f) => !evidence.includes(f)),
    grantsAdmission: false as const,
    requiresOwningFlightProof: true as const,
  };
}
