import type { FlightCandidateSet } from "./flightInterpretation";
import {
  flightClosureInputSetSchema,
  type FlightClosureCandidate,
  type FlightClosureInputSet,
} from "@/domain/trip/flightImportClosure";
import { canonicalEventJson, type Json } from "@/domain/trip/eventIntentJson";

// Reviewed choices are separate from immutable interpretation. No lineage edge,
// continuity approval, airport identity or resolution eligibility is inferred here.
export type FlightClosureChoices = Pick<
  FlightClosureCandidate,
  "output_purpose" | "continuity" | "lineage" | "resolution_plans"
> & {
  deferred_identity?: Record<string, "UNKNOWN" | "AMBIGUOUS" | "EXPLICIT">;
};
export function projectFlightClosure(
  set: FlightCandidateSet,
  choices: Record<string, FlightClosureChoices>,
): FlightClosureInputSet {
  const locators = (fragmentIds: string[]) =>
    [...new Set(fragmentIds)].map((id) => {
      const fragment = set.fragments.find((f) => f.id === id);
      if (!fragment) throw new Error("EVIDENCE_INVALID");
      return fragment.locator;
    });
  const candidates = set.candidates.map((candidate): FlightClosureCandidate => {
    const choice = choices[candidate.id];
    if (!choice) throw new Error("MISSING_REVIEW_CHOICES");
    const predecessors = new Set(candidate.predecessor_candidate_ids);
    if (choice.lineage.some((l) => !predecessors.has(l.ancestor_candidate_id)))
      throw new Error("INVALID_LINEAGE");
    const available = new Set(
      Object.values(candidate.occurrence).flatMap((o) =>
        o.observations.flatMap((v) => v.fragment_ids),
      ),
    );
    const evidence = locators([...available]);
    if (
      choice.continuity?.evidence.some(
        (l) =>
          !evidence.some(
            (e) => canonicalEventJson(e as Json) === canonicalEventJson(l as Json),
          ),
      )
    )
      throw new Error("EVIDENCE_INVALID");
    // Every original anchor remains in interpretation. A representative anchor
    // expresses occurrence continuity only; conflicting clocks stay contradictions.
    const anchor = candidate.anchors.find((a) => a.qualified);
    const clocks = new Set(candidate.anchors.map((a) => a.departureClock));
    const unresolved = candidate.entity_resolution.some(
      (r) => r.outcome === "POSSIBLE_DUPLICATE" || r.outcome === "UNRESOLVED_MATCH",
    );
    const ambiguity = candidate.ambiguity
      // Temporal admission belongs to closure, not identity ambiguity. The exact
      // unadmitted composite and raw uncertainties remain in interpretation.
      .filter((path) => !path.endsWith("TEMPORAL_RESOLUTION_PENDING"))
      .map((path) => ({
        field: path,
        alternatives: candidate.occurrence[path]?.observations.map(
          (o) => o.normalized,
        ) ?? [null],
      }));
    return {
      id: candidate.id,
      run_id: candidate.run_id,
      proposal_sha256: candidate.proposal_sha256,
      input_sha256: set.input_sha256,
      fields: Object.fromEntries(
        Object.entries(candidate.proposal.fields).map(([key, field]) => {
          if (!field.locators?.length) throw new Error("EVIDENCE_INVALID");
          return [
            key,
            {
              proposed_value: field.proposed_value,
              input_ids: field.input_ids,
              locators: field.locators,
            },
          ];
        }),
      ),
      output_purpose: choice.output_purpose,
      anchor: anchor
        ? {
            ...anchor,
            eventId: candidate.id,
            departureClock: clocks.size === 1 ? anchor.departureClock : null,
          }
        : null,
      continuity: choice.continuity,
      contradictions: candidate.contradictions.map((c) => ({
        field: c.path,
        values: c.alternatives,
        evidence: locators(candidate.evidence_support[c.path]),
      })),
      ambiguity,
      entity_resolution: unresolved || !anchor ? "UNRESOLVED" : "RESOLVED",
      deferred_dimensions: candidate.deferred_dimensions.map((d) => ({
        dimension: d.dimension,
        raw_value: null,
        locator: d.locator,
        identity:
          choice.deferred_identity?.[`${d.locator.input_id}:${d.locator.start}`] ??
          "UNKNOWN",
        reason: d.reason,
      })),
      resolution_plans: choice.resolution_plans,
      lineage: choice.lineage,
      deadlines: (() => {
        const endpoint = candidate.proposal.fields.origin?.proposed_value;
        const instant =
          endpoint?.time.quality === "EXACT" ? endpoint.time.source_instant : null;
        const date = candidate.occurrence["origin.local_date"];
        const origin = instant
          ? candidate.occurrence["origin.source_instant"]
          : date?.knowledge === "PRESENT"
            ? date
            : null;
        if (!origin) return [];
        return [
          {
            kind: "DEPARTURE" as const,
            instant: instant ?? null,
            calendar_date: date?.knowledge === "PRESENT" ? (date.value as string) : null,
            evidence: locators(origin.observations.flatMap((o) => o.fragment_ids))[0],
          },
        ];
      })(),
    };
  });
  return flightClosureInputSetSchema.parse({
    id: set.candidate_set_id,
    version: set.version,
    account_id: set.account_id,
    trip_id: set.trip_id,
    coverage: set.status === "SUCCEEDED" ? "COMPLETE" : "PARTIAL",
    inputs: set.publication_request.inputs,
    candidates,
    interpretation: set as unknown as Json,
  });
}
