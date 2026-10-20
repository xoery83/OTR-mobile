import { z } from "zod";
import { canonicalEventJson, type Json } from "@/domain/trip/eventIntentJson";
import { FLIGHT_OBSERVATION_PATHS } from "@/domain/trip/referenceFlightExtractor";
import type { FlightCandidateSet } from "./flightInterpretation";

const critical = [
  "service",
  "origin.airport",
  "destination.airport",
  "origin.local_date",
  "origin.local_time",
  "destination.local_date",
  "destination.local_time",
  "origin.zone_id",
  "destination.zone_id",
];
const optionsSchema = z
  .strictObject({
    inputIssues: z
      .array(
        z.strictObject({
          inputId: z.uuid(),
          cause: z.enum(["SOURCE_INCOMPLETE", "CAPABILITY_UNAVAILABLE", "PARTIAL_READ"]),
        }),
      )
      .max(64)
      .default([]),
  })
  .default({ inputIssues: [] });

// Advisory private view of validated interpretation, never a Core admission decision.
export function assessFlightInterpretationQuality(
  set: FlightCandidateSet,
  supplied?: z.input<typeof optionsSchema>,
) {
  const options = optionsSchema.parse(supplied);
  const pins = set.publication_request.inputs;
  if (options.inputIssues.some((i) => !pins.some((p) => p.id === i.inputId)))
    throw new Error("QUALITY_INPUT_MISMATCH");
  const execution = set.interpretation_binding.descriptor.execution_location;
  const candidates = set.candidates.map((candidate) => {
    const fields = [
      ...new Set([...FLIGHT_OBSERVATION_PATHS, ...Object.keys(candidate.occurrence)]),
    ].map((path) => {
      const field = candidate.occurrence[path];
      const provenance = (field?.observations ?? []).flatMap((o) =>
        o.fragment_ids.map((id) => {
          const fragment = set.fragments.find((f) => f.id === id);
          const pin = pins.find((p) => p.id === fragment?.locator.input_id);
          if (
            !fragment ||
            !pin ||
            fragment.source_id !== pin.source_id ||
            fragment.representation_id !== pin.representation_id ||
            fragment.material_revision !== pin.material_revision
          )
            throw new Error("QUALITY_EVIDENCE_INVALID");
          return {
            observationId: o.observation_id,
            pin: structuredClone(pin),
            locator: structuredClone(fragment.locator),
          };
        }),
      );
      const supported =
        field?.knowledge === "PRESENT" &&
        field.value !== null &&
        provenance.length > 0 &&
        field.observations.every((o) => o.fragment_ids.length > 0);
      const conflict = candidate.contradictions.filter((c) => c.path === path);
      return {
        path,
        critical:
          critical.includes(path) ||
          (field !== undefined &&
            (path.endsWith(".place_label") || path === "operating_service")),
        value: supported ? structuredClone(field.value) : null,
        knowledge:
          conflict.length || field?.knowledge === "AMBIGUOUS"
            ? "AMBIGUOUS"
            : supported
              ? "PRESENT"
              : "UNKNOWN",
        evidenceKinds: provenance.length
          ? [
              "DOCUMENT_EXTRACTED",
              execution === "LOCAL_MODEL"
                ? "LOCAL_MODEL_INFERRED"
                : execution === "REMOTE_MODEL"
                  ? "REMOTE_MODEL_INFERRED"
                  : "DETERMINISTIC_DERIVED",
            ]
          : [],
        status: !supported
          ? "UNKNOWN"
          : execution === "DETERMINISTIC_LOCAL"
            ? "OBSERVED"
            : "INFERRED",
        validation: conflict.length
          ? "CONFLICT"
          : supported
            ? "SUPPORTED"
            : "UNSUPPORTED",
        provenance,
        conflicts: structuredClone(conflict),
        uncertainty: [
          ...new Set((field?.observations ?? []).flatMap((o) => o.uncertainty)),
        ],
        // Exact document support is not independent verification of a passenger booking.
        automaticallyConfirmed: false as const,
      };
    });
    const gaps = fields
      .filter((f) => f.critical && f.validation !== "SUPPORTED")
      .map((f) => ({
        path: f.path,
        reason:
          f.validation === "CONFLICT"
            ? "MATERIAL_CONFLICT"
            : f.uncertainty.length
              ? "INVALID_OR_UNRESOLVED_SOURCE_VALUE"
              : "MISSING_SUPPORTED_EVIDENCE",
      }));
    return {
      candidateId: candidate.id,
      fields,
      proposedFields: Object.entries(candidate.proposal.fields).map(
        ([path, proposed]) => ({
          path,
          value: structuredClone(proposed.proposed_value),
          evidenceKind: "DETERMINISTIC_DERIVED" as const,
          provenance: (proposed.locators ?? []).map((locator) => {
            const pin = pins.find((p) => p.id === locator.input_id);
            if (!pin) throw new Error("QUALITY_EVIDENCE_INVALID");
            return { pin: structuredClone(pin), locator: structuredClone(locator) };
          }),
          automaticallyConfirmed: false as const,
        }),
      ),
      gaps,
      providerLookupEligible: ["service", "origin.local_date"].every((p) =>
        fields.some(
          (f) => f.path === p && f.validation === "SUPPORTED" && f.status === "OBSERVED",
        ),
      ),
      independentVerification: "NOT_ESTABLISHED" as const,
      historicalEvidence: candidate.input_ids.some(
        (id) => pins.find((p) => p.id === id)?.historical_selection,
      ),
      ambiguity: [...candidate.ambiguity],
      matchingUncertainty: candidate.entity_resolution.filter(
        (r) => r.outcome === "POSSIBLE_DUPLICATE" || r.outcome === "UNRESOLVED_MATCH",
      ),
    };
  });
  const inputs = set.coverage.map((coverage) => ({
    inputId: coverage.input_id,
    textRead: coverage.status === "PROCESSED",
    originalCompleteness: options.inputIssues.some(
      (i) => i.inputId === coverage.input_id && i.cause === "SOURCE_INCOMPLETE",
    )
      ? "INCOMPLETE"
      : "UNKNOWN",
    issues: options.inputIssues
      .filter((i) => i.inputId === coverage.input_id)
      .map((i) => i.cause),
    processingStatus: coverage.status,
    code: coverage.code,
    unmatchedSpanCount: coverage.ignored.length,
  }));
  const orderedByInput = pins.map((pin) => ({
    inputId: pin.id,
    candidateIds: set.candidates
      .filter((c) => c.input_ids.includes(pin.id))
      .map((c) => ({
        id: c.id,
        firstSpan: Math.min(
          ...Object.entries(c.occurrence)
            .filter(([path]) => path !== "transport_subtype")
            .flatMap(([, f]) =>
              f.observations.flatMap((o) =>
                o.fragment_ids.flatMap((id) => {
                  const fragment = set.fragments.find((f) => f.id === id);
                  return fragment?.locator.input_id === pin.id &&
                    fragment.locator.start !== null
                    ? [fragment.locator.start]
                    : [];
                }),
              ),
            ),
        ),
      }))
      .sort((a, b) => a.firstSpan - b.firstSpan || a.id.localeCompare(b.id))
      .map((c) => c.id),
  }));
  return {
    version: 1 as const,
    basis: {
      accountId: set.account_id,
      tripId: set.trip_id,
      runGeneration: set.run_generation,
      manifestVersion: set.manifest_version,
      runId: set.run_id,
      candidateSetId: set.candidate_set_id,
      responseSha256: set.interpretation_response_sha256,
      inputs: structuredClone(pins),
    },
    extractionCoverage: inputs,
    fieldSupport: candidates,
    structuralCoverage: {
      candidateCount: candidates.length,
      orderedByInput,
      orderSemantics: "SOURCE_MENTION_ORDER_NOT_VERIFIED_SEGMENT_ASSOCIATION" as const,
      deferredRelationshipCount: set.candidates.reduce(
        (n, c) => n + c.deferred_dimensions.length,
        0,
      ),
      relationshipCompleteness: "UNKNOWN" as const,
      unmatchedSpanCount: inputs.reduce((n, i) => n + i.unmatchedSpanCount, 0),
    },
    consistency: {
      materialConflicts: candidates.flatMap((c) =>
        c.gaps
          .filter((g) => g.reason === "MATERIAL_CONFLICT")
          .map((g) => ({ candidateId: c.candidateId, path: g.path })),
      ),
      unresolvedMatchCount: set.resolutions.filter(
        (r) => r.outcome === "POSSIBLE_DUPLICATE" || r.outcome === "UNRESOLVED_MATCH",
      ).length,
      revisionContinuity:
        set.predecessors.length ||
        set.candidates.some(
          (c) => c.deferred_dimensions.length || c.occurrence.change_notice,
        )
          ? "REQUIRES_SEPARATE_EVIDENCE_REVIEW"
          : "NOT_ESTABLISHED",
    },
    authorityFreshness: {
      bookingVerification: "NOT_ESTABLISHED",
      liveFacts: "NOT_VERIFIED",
      sourceFreshness: "UNKNOWN",
    },
    admissionReadiness: {
      diagnosticOnly: true,
      grantsAuthority: false,
      coreAssessmentRequired: true,
      supportedCriticalFieldsComplete:
        candidates.length > 0 && candidates.every((c) => c.gaps.length === 0),
      unknownSiblingFence: "UNCHANGED",
    },
  };
}
export type InterpretationQualityAssessment = ReturnType<
  typeof assessFlightInterpretationQuality
>;

// Future executors must compare the whole evidence basis, not just a candidate ID.
export function flightQualityBasisMatches(
  quality: InterpretationQualityAssessment,
  set: FlightCandidateSet,
) {
  return (
    canonicalEventJson(quality.basis as unknown as Json) ===
    canonicalEventJson({
      accountId: set.account_id,
      tripId: set.trip_id,
      runGeneration: set.run_generation,
      manifestVersion: set.manifest_version,
      runId: set.run_id,
      candidateSetId: set.candidate_set_id,
      responseSha256: set.interpretation_response_sha256,
      inputs: set.publication_request.inputs,
    } as unknown as Json)
  );
}
