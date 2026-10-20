import fixture from "./cpLlm02bStage1.json";
import type { Json } from "@/domain/trip/eventIntentJson";
import {
  validateFlightPromptOutput,
  type FlightPromptEvidencePortV1,
} from "../flightPromptPackage";

// Frozen output of published Stage 1; never recompute quality or enrichment here.
export function stage1FixturePort(): FlightPromptEvidencePortV1 {
  const e = fixture.evidence;
  return {
    version: "cp-llm-02b-stage1-evidence-port-v1",
    basis: structuredClone(e.quality.basis) as Json,
    reviewRevision: 1,
    candidates: e.interpreted.map((c) => ({
      id: c.candidateId,
      targetFields: ["service", "destination.local_time"],
      protectedFields: [],
      targetRelationships: ["BOOKING", "TICKET", "CODESHARE", "REBOOKING"],
    })),
    evidence: e.interpreted.flatMap((c, ci) =>
      c.fields.flatMap((f, fi) =>
        f.observations.flatMap((o, oi) =>
          o.evidence.map((support, si) => ({
            id: `e${ci}-${fi}-${oi}-${si}`,
            sourceId: support.pin.source_id,
            candidateIds: [c.candidateId],
            path: f.path,
            raw: support.raw ?? "",
            documentObserved: structuredClone(support) as Json,
            deterministicDerived: { path: f.path, value: f.value } as Json,
          })),
        ),
      ),
    ),
    humanConfirmed: [],
  };
}

export type SyntheticModelTaskResultV1 = {
  fixture_version: "cp-llm-02b-model-task-result-fixture-v1";
  outcome: "STRUCTURED_OUTPUT" | "BUDGET_EXHAUSTED" | "EXECUTION_UNKNOWN";
  output: unknown;
};

// Deliberately no execution, routing, fallback, meter or production facade.
export function consumeSyntheticModelTaskResult(
  result: SyntheticModelTaskResultV1,
  prepared: FlightPromptEvidencePortV1,
  current: FlightPromptEvidencePortV1,
) {
  if (result.fixture_version !== "cp-llm-02b-model-task-result-fixture-v1")
    throw new Error("FIXTURE_VERSION_MISMATCH");
  if (result.outcome !== "STRUCTURED_OUTPUT")
    return {
      disposition: "DEFERRED",
      reason: result.outcome,
      calls: 0,
      quality: structuredClone(fixture.evidence.quality),
      enrichment: structuredClone(fixture.evidence.enrichment),
    };
  return {
    disposition: "ADVISORY_ONLY",
    proposal: validateFlightPromptOutput(result.output, prepared, current),
    quality: structuredClone(fixture.evidence.quality),
    enrichment: structuredClone(fixture.evidence.enrichment),
    calls: 0,
  };
}
