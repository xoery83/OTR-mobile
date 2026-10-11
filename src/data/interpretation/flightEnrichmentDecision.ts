import { z } from "zod";
import type { InterpretationQualityAssessment } from "./flightInterpretationQuality";

const capabilitySchema = z.strictObject({
  online: z.boolean(),
  localModel: z.enum(["AVAILABLE", "NOT_WIRED", "UNAVAILABLE"]),
  provider: z.strictObject({
    authorized: z.boolean(),
    available: z.boolean(),
    licensed: z.boolean(),
    coveredFields: z.array(z.string().min(1).max(128)).max(32),
    freshness: z.enum(["CURRENT", "STALE", "UNKNOWN"]),
    priceKnown: z.boolean(),
    costJustified: z.boolean(),
  }),
  remoteLlm: z.strictObject({ authorized: z.boolean(), available: z.boolean() }),
});
export const CLOSED_FLIGHT_ENRICHMENT: z.infer<typeof capabilitySchema> = {
  online: false,
  localModel: "NOT_WIRED",
  provider: {
    authorized: false,
    available: false,
    licensed: false,
    coveredFields: [],
    freshness: "UNKNOWN",
    priceKnown: false,
    costJustified: false,
  },
  remoteLlm: { authorized: false, available: false },
};
const requestSchema = z
  .array(
    z.enum(["published_schedule", "terminal", "live_status", "gate", "cancellation"]),
  )
  .max(5);
type Route =
  | "NONE"
  | "LOCAL_MODEL"
  | "FLIGHT_PROVIDER"
  | "REMOTE_LLM"
  | "HUMAN_REVIEW"
  | "DEFER_UNTIL_CAPABILITY";

// Recommendation only. No call, credential, job transition or Core authorization.
export function decideFlightEnrichment(
  quality: InterpretationQualityAssessment,
  supplied = CLOSED_FLIGHT_ENRICHMENT,
  requestedFacts: z.input<typeof requestSchema> = [],
) {
  const capability = capabilitySchema.parse(supplied);
  const requested = requestSchema.parse(requestedFacts);
  const candidates = quality.fieldSupport;
  const gaps = [...new Set(candidates.flatMap((c) => c.gaps.map((g) => g.path)))];
  const targets = [...new Set([...gaps, ...requested])];
  const conflicts = quality.consistency.materialConflicts;
  const complex =
    quality.consistency.unresolvedMatchCount > 0 ||
    candidates.some((c) => c.matchingUncertainty.length > 0);
  const unavailableRead = quality.extractionCoverage.some(
    (i) =>
      !i.textRead ||
      i.issues.includes("CAPABILITY_UNAVAILABLE") ||
      i.issues.includes("PARTIAL_READ"),
  );
  const providerAssignments = candidates
    .filter((c) => c.providerLookupEligible && !c.historicalEvidence)
    .map((c) => ({
      candidateId: c.candidateId,
      targetFields: [...new Set([...c.gaps.map((g) => g.path), ...requested])].filter(
        (f) => capability.provider.coveredFields.includes(f),
      ),
    }))
    .filter((c) => c.targetFields.length > 0);
  const providerTargets = [
    ...new Set(providerAssignments.flatMap((c) => c.targetFields)),
  ];
  const providerReady =
    capability.online &&
    capability.provider.authorized &&
    capability.provider.available &&
    capability.provider.licensed &&
    capability.provider.freshness === "CURRENT" &&
    capability.provider.priceKnown &&
    capability.provider.costJustified &&
    providerAssignments.length > 0;
  const result = (
    route: Route,
    reason: string,
    targetFields = targets,
    candidateIds = candidates.map((c) => c.candidateId),
    fallback: Route[] = [],
  ) => ({
    version: 1 as const,
    route,
    reason,
    targetFields,
    candidateIds,
    basis: structuredClone(quality.basis),
    executionAuthorized: false as const,
    requiredEvidence:
      route === "FLIGHT_PROVIDER"
        ? [
            "EXACT_SERVICE_AND_DATE",
            "LICENSED_FIELD_COVERAGE",
            "FRESH_RESPONSE_WITH_SOURCE",
            "PRICE_EVALUATION",
            "NOT_PASSENGER_BOOKING_PROOF",
          ]
        : route === "LOCAL_MODEL" || route === "REMOTE_LLM"
          ? [
              "ORIGINAL_EVIDENCE_PINS",
              "FIELD_TO_SOURCE_MAPPING",
              "NO_UNSOURCED_CONFIRMATION",
            ]
          : route === "HUMAN_REVIEW"
            ? ["COMPETING_EVIDENCE", "INDEPENDENT_VERIFICATION_IF_AVAILABLE"]
            : ["CURRENT_EVIDENCE_AND_REVISION_RECHECK"],
    estimatedCost: {
      tier:
        route === "NONE"
          ? "ZERO_CALLS"
          : route === "LOCAL_MODEL"
            ? "DEVICE_ASSUMPTION"
            : "UNKNOWN",
      monetaryMinor: null,
    },
    estimatedLatencyTier:
      route === "NONE"
        ? "NONE"
        : route === "LOCAL_MODEL"
          ? "LOCAL_UNMEASURED"
          : "UNKNOWN",
    fallback,
    providerAssignments: route === "FLIGHT_PROVIDER" ? providerAssignments : [],
    unaddressedTargets:
      route === "FLIGHT_PROVIDER"
        ? candidates
            .map((c) => ({
              candidateId: c.candidateId,
              targetFields: [
                ...new Set([...c.gaps.map((g) => g.path), ...requested]),
              ].filter(
                (f) =>
                  !providerAssignments.some(
                    (a) => a.candidateId === c.candidateId && a.targetFields.includes(f),
                  ),
              ),
            }))
            .filter((c) => c.targetFields.length > 0)
        : [],
    recheckRequired: true as const,
  });
  if (
    providerReady &&
    (requested.length ||
      !complex ||
      conflicts.some((c) => providerTargets.includes(c.path)))
  )
    return result(
      "FLIGHT_PROVIDER",
      "FRESH_COVERED_FACT_LOOKUP",
      providerTargets,
      providerAssignments.map((c) => c.candidateId),
      conflicts.length ? ["HUMAN_REVIEW"] : ["DEFER_UNTIL_CAPABILITY"],
    );
  if (conflicts.length)
    return result(
      "HUMAN_REVIEW",
      "UNRESOLVED_MATERIAL_CONFLICT",
      [...new Set(conflicts.map((c) => c.path))],
      [...new Set(conflicts.map((c) => c.candidateId))],
    );
  if (unavailableRead)
    return result("DEFER_UNTIL_CAPABILITY", "EXTRACTION_CAPABILITY_OR_READ_GAP");
  // Live facts require fresh licensed retrieval; language models cannot replace it.
  if (requested.length)
    return result("DEFER_UNTIL_CAPABILITY", "FRESH_PROVIDER_NOT_READY", requested);
  if (quality.extractionCoverage.some((i) => i.originalCompleteness === "INCOMPLETE"))
    return result("DEFER_UNTIL_CAPABILITY", "SOURCE_INCOMPLETE_EVIDENCE_REQUIRED");
  if (!candidates.length)
    return result("DEFER_UNTIL_CAPABILITY", "NO_SUPPORTED_FLIGHT_CANDIDATE");
  if (!targets.length && !complex)
    return result("NONE", "SUPPORTED_CRITICAL_FACTS_NO_ENRICHMENT_NEEDED", [], [], []);
  const associationTargets = complex
    ? [...new Set([...targets, "segment_association"])]
    : targets;
  if (capability.localModel === "AVAILABLE")
    return result(
      "LOCAL_MODEL",
      "OPTIONAL_EVIDENCE_ASSOCIATION",
      associationTargets,
      candidates.map((c) => c.candidateId),
      ["DEFER_UNTIL_CAPABILITY"],
    );
  if (
    capability.online &&
    capability.remoteLlm.authorized &&
    capability.remoteLlm.available
  )
    return result(
      "REMOTE_LLM",
      "AUTHORIZED_EVIDENCE_ASSOCIATION_FALLBACK",
      associationTargets,
      candidates.map((c) => c.candidateId),
      ["DEFER_UNTIL_CAPABILITY"],
    );
  return result(
    "DEFER_UNTIL_CAPABILITY",
    "OPTIONAL_ENRICHMENT_NOT_AVAILABLE",
    associationTargets,
  );
}
export type EnrichmentDecision = ReturnType<typeof decideFlightEnrichment>;
