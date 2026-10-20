import { z } from "zod";
import {
  flightEndpointSchema,
  flightServicesSchema,
  flightCommandLeaves,
  matchFlightV1,
  type FlightValues,
  type FlightMatchScope,
} from "./flightAdmission";
import {
  flightInputSchema,
  flightLocatorSchema,
  flightReviewSchema,
} from "./flightImportReview";
import { canonicalEventJson, type Json } from "./eventIntentJson";
import { instantMicroseconds } from "./dayReadModel";

export const occurrenceFields = ["title", "origin", "destination", "services"] as const;
export type OccurrenceField = (typeof occurrenceFields)[number];
const uuid = z.uuid();
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const anchorSchema = z.strictObject({
  eventId: uuid,
  semanticRevision: z.number().int().positive().safe(),
  namespace: z.enum(["IATA_AIRLINE", "ICAO_AIRLINE"]),
  issuer: z.string().min(1).max(128),
  operator: z.string().min(1).max(128),
  serviceNumber: z.string().min(1).max(64),
  originDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  originAirportId: z.string().min(1).max(128),
  destinationAirportId: z.string().min(1).max(128),
  departureClock: z.string().max(32).nullable(),
  qualified: z.boolean(),
  operatingOccurrence: z.string().min(1).max(128).optional(),
  contradictory: z.boolean().optional(),
  supplierOccurrence: z
    .strictObject({
      namespace: z.string().min(1).max(128),
      issuer: z.string().min(1).max(128),
      value: z.string().min(1).max(128),
      scopeId: z.string().min(1).max(128),
      verified: z.boolean(),
    })
    .optional(),
});
const key = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const evidence = z.strictObject({
  input_ids: z.array(uuid).min(1).max(64),
  locators: z.array(flightLocatorSchema).max(64),
  proposed_value: z.json(),
});
// A supplies immutable proposals, not parser implementation or canonical authority.
export const flightClosureCandidateSchema = z.strictObject({
  id: uuid,
  run_id: uuid,
  proposal_sha256: hash,
  input_sha256: hash,
  output_purpose: key,
  fields: z.partialRecord(z.enum(["transport_subtype", ...occurrenceFields]), evidence),
  anchor: anchorSchema.nullable(),
  continuity: z
    .strictObject({
      targetId: uuid,
      semanticRevision: z.number().int().positive().safe(),
      reason: z.enum(["RETIME", "NUMBER_SUPERSESSION"]),
      reviewed: z.literal(true),
      evidence: z.array(flightLocatorSchema).min(1).max(64),
    })
    .nullable(),
  contradictions: z
    .array(
      z.strictObject({
        field: key,
        values: z.array(z.json()).min(2).max(64),
        evidence: z.array(flightLocatorSchema).min(1).max(64),
      }),
    )
    .max(64),
  ambiguity: z
    .array(z.strictObject({ field: key, alternatives: z.array(z.json()).min(1).max(64) }))
    .max(64),
  entity_resolution: z.enum(["RESOLVED", "UNRESOLVED", "AMBIGUOUS"]),
  deferred_dimensions: z
    .array(
      z.strictObject({
        dimension: z.enum([
          "passengers",
          "bookings",
          "tickets",
          "seats",
          "baggage",
          "fare",
          "cabin",
          "financial",
        ]),
        raw_value: z.json(),
        locator: flightLocatorSchema,
        identity: z.enum(["UNKNOWN", "AMBIGUOUS", "EXPLICIT", "NOT_APPLICABLE"]),
        reason: z.string().min(1).max(500),
      }),
    )
    .max(64),
  resolution_plans: z
    .array(
      z.strictObject({
        field: z.enum(occurrenceFields),
        wait: z.enum(["NETWORK", "ENRICHMENT"]),
        eligible: z.boolean(),
        exhausted: z.boolean(),
      }),
    )
    .max(4),
  lineage: z
    .array(
      z.strictObject({
        ancestor_candidate_id: uuid,
        ancestor_slot_key: key,
        relation: z.enum(["CONTINUE", "MERGE_CONTINUE", "DISTINCT_OUTPUT"]),
        review_reason: z.string().min(1).max(500),
      }),
    )
    .max(64),
  deadlines: z
    .array(
      z.strictObject({
        kind: z.enum(["DEPARTURE", "BOARDING", "CHECK_IN"]),
        instant: z
          .string()
          .refine((v) => {
            try {
              instantMicroseconds(v);
              return true;
            } catch {
              return false;
            }
          })
          .nullable(),
        calendar_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable(),
        evidence: flightLocatorSchema,
      }),
    )
    .max(16),
});
export const flightClosureInputSetSchema = z
  .strictObject({
    id: uuid,
    version: z.number().int().positive().safe(),
    account_id: uuid,
    trip_id: uuid,
    coverage: z.enum(["COMPLETE", "PARTIAL"]),
    // Lossless upstream observations; never used as canonical execution authority.
    interpretation: z.json().optional(),
    inputs: z.array(flightInputSchema).max(64),
    candidates: z.array(flightClosureCandidateSchema).max(64),
  })
  .superRefine((s, c) => {
    if (
      new Set(s.candidates.map((x) => x.id)).size !== s.candidates.length ||
      new Set(s.inputs.map((x) => x.id)).size !== s.inputs.length
    )
      c.addIssue({ code: "custom", message: "DUPLICATE_IMPORT_IDENTITY" });
    const ids = new Set(s.inputs.map((x) => x.id));
    for (const candidate of s.candidates) {
      const locators = [
        ...Object.values(candidate.fields).flatMap((f) => f.locators),
        ...candidate.contradictions.flatMap((x) => x.evidence),
        ...candidate.deferred_dimensions.map((x) => x.locator),
        ...candidate.deadlines.map((x) => x.evidence),
        ...(candidate.continuity?.evidence ?? []),
      ];
      if (
        Object.values(candidate.fields).some(
          (f) =>
            new Set(f.input_ids).size !== f.input_ids.length ||
            f.input_ids.some((id) => !ids.has(id)) ||
            f.locators.some((l) => !f.input_ids.includes(l.input_id)),
        ) ||
        locators.some((l) => !ids.has(l.input_id))
      )
        c.addIssue({ code: "custom", message: "INVALID_INPUT_BINDING" });
    }
  });
export type FlightClosureCandidate = z.infer<typeof flightClosureCandidateSchema>;
export type FlightClosureInputSet = z.infer<typeof flightClosureInputSetSchema>;
export type ClosureState =
  | "READY"
  | "NEEDS_REVIEW"
  | "INCOMPLETE"
  | "CONFLICT"
  | "WAITING_FOR_NETWORK"
  | "WAITING_FOR_ENRICHMENT"
  | "UNSUPPORTED";
export type FlightActionOutcome =
  | "NEW_ITEM"
  | "DUPLICATE_EVIDENCE"
  | "COMPLETE_EXISTING"
  | "AUGMENT_EXISTING"
  | "UPDATE_EXISTING"
  | "CONFLICT"
  | "UNRESOLVED_MATCH";
export type FlightBaseline = {
  eventId: string;
  semanticRevision: number;
  values: FlightValues;
  retainedProofs: Record<string, string>;
};
export type FlightClaim = {
  candidateId: string;
  slotKey: string;
  slotId: string;
  outcome: "UNKNOWN" | "SUCCESS" | "NO_COMMIT";
  targetId: string | null;
  resultRevision: number | null;
  related?: boolean;
};
export type ClosureContext = {
  scope: FlightMatchScope;
  baselines: FlightBaseline[];
  claims: FlightClaim[];
  lineageComplete: boolean;
  attention: {
    version: "import-attention-v1";
    horizonHours: number;
    now: string;
    clockOrigin: "DEVICE" | "SUPPLIED";
  };
};
export type FlightClosurePlan = {
  candidate: FlightClosureCandidate;
  closure: ClosureState;
  outcome: FlightActionOutcome;
  target: FlightBaseline | null;
  known: OccurrenceField[];
  missing: OccurrenceField[];
  reasons: string[];
  changes: {
    field: OccurrenceField;
    kind: "COMPLETE_EXISTING" | "UPDATE_EXISTING";
    old: Json;
    proposed: Json;
  }[];
  occurrence: "CREATE" | "UPDATE" | "NONE";
  selected_components: OccurrenceField[];
  deferred_actions: {
    dimension: string;
    reason: string;
    locator?: z.infer<typeof flightLocatorSchema>;
  }[];
  attention: {
    policy: ClosureContext["attention"];
    severity: "NONE" | "DEFERRED" | "ACTION_REQUIRED" | "URGENT";
    deadlines: FlightClosureCandidate["deadlines"];
    reasons: string[];
  };
};
const bytes = (v: unknown) => canonicalEventJson(v as Json);
const unknown = (v: Json | undefined) =>
  v === undefined ||
  v === null ||
  (typeof v === "object" && !Array.isArray(v) && v.value === null);
function values(candidate: FlightClosureCandidate): FlightValues {
  return Object.fromEntries(
    occurrenceFields
      .filter((k) => candidate.fields[k])
      .map((k) => [k, candidate.fields[k]!.proposed_value]),
  );
}
function admitted(field: OccurrenceField, value: unknown) {
  if (field === "title")
    return typeof value === "string" && value.trim().length > 0 && value.length <= 200;
  if (field === "services") return flightServicesSchema.safeParse(value).success;
  const parsed = flightEndpointSchema.safeParse(value);
  if (!parsed.success) return false;
  return (
    field !== "origin" ||
    (parsed.data.time.local_date !== null &&
      parsed.data.time.quality === "EXACT" &&
      parsed.data.time.source_instant !== null)
  );
}
function attention(
  candidate: FlightClosureCandidate,
  closure: ClosureState,
  policy: ClosureContext["attention"],
) {
  if (
    !Number.isFinite(policy.horizonHours) ||
    policy.horizonHours < 0 ||
    policy.horizonHours > 8760
  )
    throw new Error("INVALID_ATTENTION_POLICY");
  const now = instantMicroseconds(policy.now),
    end = now + BigInt(Math.round(policy.horizonHours * 3600000000));
  const unresolved = closure !== "READY";
  const urgent =
    unresolved &&
    candidate.deadlines.some(
      (d) =>
        d.instant !== null &&
        instantMicroseconds(d.instant) >= now &&
        instantMicroseconds(d.instant) <= end,
    );
  const uncertain =
    unresolved &&
    candidate.deadlines.some(
      (d) =>
        d.instant === null &&
        d.calendar_date !== null &&
        d.calendar_date >= policy.now.slice(0, 10),
    );
  return {
    policy,
    deadlines: candidate.deadlines,
    severity: urgent
      ? ("URGENT" as const)
      : uncertain
        ? ("ACTION_REQUIRED" as const)
        : closure.startsWith("WAITING")
          ? ("DEFERRED" as const)
          : unresolved
            ? ("ACTION_REQUIRED" as const)
            : ("NONE" as const),
    reasons: urgent
      ? ["EVIDENCED_DEADLINE_WITHIN_HORIZON"]
      : uncertain
        ? ["DEADLINE_BOUNDS_UNKNOWN"]
        : [],
  };
}
export function assessFlightCandidate(
  raw: FlightClosureCandidate,
  context: ClosureContext,
): FlightClosurePlan {
  const candidate = flightClosureCandidateSchema.parse(raw),
    proposed = values(candidate);
  const known = occurrenceFields.filter((k) => candidate.fields[k]);
  const reasons: string[] = [],
    missing: OccurrenceField[] = [],
    changes: FlightClosurePlan["changes"] = [];
  const deferred_actions: FlightClosurePlan["deferred_actions"] =
    candidate.deferred_dimensions.map((d) => ({
      dimension: d.dimension,
      reason: "DEFERRED_UNSUPPORTED_DIMENSION",
      locator: d.locator,
    }));
  let target: FlightBaseline | null = null,
    outcome: FlightActionOutcome = "UNRESOLVED_MATCH";
  let closure: ClosureState = "READY",
    occurrence: FlightClosurePlan["occurrence"] = "NONE";
  const relevant = context.claims.filter((p) => {
    const mapping = candidate.lineage.find(
      (l) =>
        l.ancestor_candidate_id === p.candidateId && l.ancestor_slot_key === p.slotKey,
    );
    return !(
      p.related !== false &&
      mapping?.relation === "DISTINCT_OUTPUT" &&
      candidate.output_purpose !== p.slotKey
    );
  });
  const success = relevant.filter((p) => p.outcome === "SUCCESS");
  if (!context.lineageComplete || relevant.some((p) => p.outcome === "UNKNOWN")) {
    reasons.push("PREDECESSOR_OUTCOME_UNKNOWN");
    closure = "NEEDS_REVIEW";
  } else if (new Set(success.map((p) => p.targetId)).size > 1) {
    outcome = "CONFLICT";
    closure = "CONFLICT";
    reasons.push("INCOMPATIBLE_MERGE_TARGETS");
  } else if (success.length) {
    target = context.baselines.find((b) => b.eventId === success[0].targetId) ?? null;
    if (!target || target.semanticRevision < success[0].resultRevision!) {
      closure = "NEEDS_REVIEW";
      reasons.push("KNOWN_PREDECESSOR_TARGET_UNAVAILABLE");
    } else outcome = "DUPLICATE_EVIDENCE";
  } else if (candidate.anchor) {
    const match = matchFlightV1(
      candidate.anchor,
      context.scope,
      candidate.continuity ?? undefined,
    );
    outcome = match.assessment === "SAME_ITEM" ? "DUPLICATE_EVIDENCE" : match.assessment;
    if (match.targetId)
      target = context.baselines.find((b) => b.eventId === match.targetId) ?? null;
    if (match.assessment === "UNRESOLVED_MATCH") {
      reasons.push(match.reason);
      closure =
        match.reason === "CONTINUITY_REVIEW_REQUIRED" ? "CONFLICT" : "NEEDS_REVIEW";
      if (closure === "CONFLICT") outcome = "CONFLICT";
    } else if (
      match.targetId &&
      (!target ||
        context.scope.occurrences.find((o) => o.eventId === match.targetId)
          ?.semanticRevision !== target.semanticRevision)
    ) {
      closure = "CONFLICT";
      outcome = "CONFLICT";
      reasons.push("STALE_BASE_REVISION");
    }
  } else {
    closure = "NEEDS_REVIEW";
    reasons.push("UNRESOLVED_MATCH");
  }

  if (target) {
    for (const field of known) {
      if (!admitted(field, proposed[field])) continue;
      if (bytes(proposed[field]) === bytes(target.values[field] ?? null)) continue;
      const next = flightCommandLeaves({ [field]: proposed[field] }, true),
        old = flightCommandLeaves({ [field]: target.values[field] }, true);
      // An incomplete observation cannot erase an accepted value without explicit review.
      const removes = Object.entries(old).some(
        ([k, v]) => !unknown(v) && unknown(next[k]),
      );
      const overwrites =
        removes ||
        Object.entries(next).some(
          ([k, v]) => !unknown(old[k]) && bytes(v) !== bytes(old[k]),
        );
      const kind = overwrites ? "UPDATE_EXISTING" : "COMPLETE_EXISTING";
      changes.push({
        field,
        kind,
        old: (target.values[field] ?? null) as Json,
        proposed: proposed[field] as Json,
      });
      if (
        overwrites &&
        (!candidate.continuity ||
          candidate.continuity.targetId !== target.eventId ||
          candidate.continuity.semanticRevision !== target.semanticRevision)
      ) {
        outcome = "CONFLICT";
        closure = "CONFLICT";
        reasons.push(`SUPERSESSION_REVIEW_REQUIRED:${field}`);
      }
    }
    if (closure === "READY")
      outcome = changes.some((c) => c.kind === "UPDATE_EXISTING")
        ? "UPDATE_EXISTING"
        : changes.length
          ? "COMPLETE_EXISTING"
          : deferred_actions.length
            ? "AUGMENT_EXISTING"
            : "DUPLICATE_EVIDENCE";
  }
  const selected =
    outcome === "NEW_ITEM" ? [...occurrenceFields] : changes.map((c) => c.field);
  const critical = target
    ? [...new Set([...selected, ...known.filter((k) => !admitted(k, proposed[k]))])]
    : [...occurrenceFields];
  for (const field of critical) {
    if (!admitted(field, proposed[field])) {
      missing.push(field);
      reasons.push(`MISSING_OR_UNADMITTED:${field}`);
    }
  }
  const effective = { ...target?.values, ...proposed };
  if (
    effective.origin &&
    effective.destination &&
    admitted("origin", effective.origin) &&
    admitted("destination", effective.destination)
  ) {
    const a = effective.origin.time.source_instant,
      b = effective.destination.time.source_instant;
    if (a && b && instantMicroseconds(b) < instantMicroseconds(a)) {
      outcome = "CONFLICT";
      closure = "CONFLICT";
      reasons.push("ARRIVAL_BEFORE_DEPARTURE");
    }
  }
  const unsupportedField = (field: string) =>
    /^(passengers|bookings|tickets|seats|baggage|fare|cabin|financial)(?:[.:]|$)/.test(
      field,
    );
  const occurrenceContradictions = candidate.contradictions.filter(
    (c) => !unsupportedField(c.field),
  );
  const occurrenceAmbiguity = candidate.ambiguity.filter(
    (c) => !unsupportedField(c.field),
  );
  if (candidate.contradictions.some((c) => unsupportedField(c.field)))
    reasons.push("DEFERRED_DIMENSION_CONTRADICTION");
  if (occurrenceContradictions.length) {
    closure = "CONFLICT";
    outcome = "CONFLICT";
    reasons.push("CONTRADICTORY_EVIDENCE");
  } else if (
    occurrenceAmbiguity.length ||
    candidate.entity_resolution !== "RESOLVED" ||
    candidate.deferred_dimensions.some((d) => d.identity === "AMBIGUOUS")
  ) {
    if (closure !== "CONFLICT") closure = "NEEDS_REVIEW";
    if (candidate.entity_resolution !== "RESOLVED" && !target && outcome !== "CONFLICT")
      outcome = "UNRESOLVED_MATCH";
    reasons.push("UNRESOLVED_IDENTITY_OR_AMBIGUITY");
  }
  if (
    missing.length &&
    closure !== "CONFLICT" &&
    !occurrenceAmbiguity.length &&
    !occurrenceContradictions.length &&
    candidate.entity_resolution === "RESOLVED" &&
    !candidate.deferred_dimensions.some((d) => d.identity === "AMBIGUOUS")
  ) {
    const plans = missing.map((field) =>
      candidate.resolution_plans.find(
        (p) => p.field === field && p.eligible && !p.exhausted,
      ),
    );
    closure = plans.some((p) => !p)
      ? "INCOMPLETE"
      : plans.some((p) => p?.wait === "NETWORK")
        ? "WAITING_FOR_NETWORK"
        : "WAITING_FOR_ENRICHMENT";
  }
  if (outcome === "DUPLICATE_EVIDENCE")
    deferred_actions.push({ dimension: "evidence", reason: "LINK_ONLY_CLOSED" });
  if (outcome === "AUGMENT_EXISTING" && closure === "READY") closure = "UNSUPPORTED";
  if (closure === "READY" && (outcome === "NEW_ITEM" || changes.length))
    occurrence = outcome === "NEW_ITEM" ? "CREATE" : "UPDATE";
  return {
    candidate,
    closure,
    outcome,
    target,
    known,
    missing,
    reasons,
    changes,
    occurrence,
    selected_components: selected,
    deferred_actions,
    attention: attention(candidate, closure, context.attention),
  };
}
export function assessFlightCandidateSet(
  raw: FlightClosureInputSet,
  contexts: Record<string, ClosureContext>,
) {
  if (new TextEncoder().encode(bytes(raw)).length > 4194304)
    throw new Error("IMPORT_RESOURCE_LIMIT");
  const set = flightClosureInputSetSchema.parse(raw);
  const plans = set.candidates.map((c) => {
    const context = contexts[c.id];
    if (!context) throw new Error("MISSING_CANDIDATE_CONTEXT");
    if (set.interpretation) {
      const source = set.interpretation as unknown as {
        matching_scope: FlightMatchScope;
        candidates: { id: string; entity_resolution: { outcome: string }[] }[];
      };
      const {
        complete,
        current,
        proposalsComplete,
        lineageComplete,
        servicesAtEventBaselines,
        occurrences,
      } = source.matching_scope;
      const pinned = {
        complete,
        current,
        proposalsComplete,
        lineageComplete,
        servicesAtEventBaselines,
        occurrences,
      };
      const { scope } = context;
      if (
        bytes(pinned) !==
        bytes({
          complete: scope.complete,
          current: scope.current,
          proposalsComplete: scope.proposalsComplete,
          lineageComplete: scope.lineageComplete,
          servicesAtEventBaselines: scope.servicesAtEventBaselines,
          occurrences: scope.occurrences,
        })
      )
        throw new Error("MATCH_SCOPE_CHANGED");
      const original = source.candidates.find((x) => x.id === c.id);
      if (
        !original ||
        (c.entity_resolution === "RESOLVED" &&
          original.entity_resolution.some((r) =>
            ["POSSIBLE_DUPLICATE", "UNRESOLVED_MATCH"].includes(r.outcome),
          ))
      )
        throw new Error("MATCH_RESOLUTION_CHANGED");
    }
    try {
      return assessFlightCandidate(c, context);
    } catch {
      return {
        candidate: c,
        closure: "UNSUPPORTED",
        outcome: "UNRESOLVED_MATCH",
        target: null,
        known: [],
        missing: [],
        reasons: ["INVALID_TYPED_OBSERVATION"],
        changes: [],
        occurrence: "NONE",
        selected_components: [],
        deferred_actions: c.deferred_dimensions.map((d) => ({
          dimension: d.dimension,
          reason: "DEFERRED_UNSUPPORTED_DIMENSION",
          locator: d.locator,
        })),
        attention: attention(c, "UNSUPPORTED", context.attention),
      } satisfies FlightClosurePlan;
    }
  });
  const count = (s: ClosureState) => plans.filter((p) => p.closure === s).length;
  return {
    set,
    plans,
    progress: {
      candidate_count: plans.length,
      ready_count: count("READY"),
      review_count: count("NEEDS_REVIEW"),
      conflict_count: count("CONFLICT"),
      incomplete_count: count("INCOMPLETE"),
      waiting_network_count: count("WAITING_FOR_NETWORK"),
      waiting_enrichment_count: count("WAITING_FOR_ENRICHMENT"),
      deferred_dimension_count: plans.reduce((n, p) => n + p.deferred_actions.length, 0),
    },
  };
}
// Only source references enter the existing durable CP13A review grammar.
// Raw passenger/PNR/financial values remain at their immutable evidence origin.
export function flightDeferredReview(
  candidate: FlightClosureCandidate,
): z.infer<typeof flightReviewSchema>["deferred_dimensions"] {
  const unsupported = candidate.deferred_dimensions.map((d) => ({
    dimension: d.dimension === "financial" ? "fare" : d.dimension,
    candidate_field_key: null,
    input_id: d.locator.input_id,
    locator: Object.fromEntries(
      Object.entries(d.locator).filter(([k]) => k !== "excerpt"),
    ) as z.infer<typeof flightLocatorSchema>,
    reason:
      d.identity === "AMBIGUOUS"
        ? ("UNRESOLVED_IDENTITY" as const)
        : ("UNSUPPORTED_DIMENSION" as const),
  }));
  const waiting: z.infer<typeof flightReviewSchema>["deferred_dimensions"] = [];
  for (const plan of candidate.resolution_plans.filter(
    (p) => p.eligible && !p.exhausted,
  )) {
    const field = candidate.fields[plan.field];
    const locator = Object.values(candidate.fields).flatMap((f) => f.locators)[0];
    if (field)
      waiting.push({
        dimension: plan.field,
        candidate_field_key: plan.field,
        input_id: null,
        locator: null,
        reason: "UNRESOLVED_TEMPORAL",
      });
    else if (locator)
      waiting.push({
        dimension: plan.field,
        candidate_field_key: null,
        input_id: locator.input_id,
        locator,
        reason: "UNRESOLVED_TEMPORAL",
      });
    else throw new Error("DEFERRED_EVIDENCE_REFERENCE_REQUIRED");
  }
  return [...unsupported, ...waiting];
}
