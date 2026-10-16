import { z } from "zod";
import type { assembleFlightDocuments, FlightAssemblyDocument } from "./flightAssembly";
import { assessFlightReadiness } from "./flightReadiness";
import type { InterpretationItem } from "../intelligence/interpretation";
import { canonicalEventJson, type Json } from "./eventIntentJson";

export const FLIGHT_ASSEMBLY_BUSINESS_CONTRACT = {
  version: "otr.flight.semantic-assembly.v1",
  basis: [
    "CP12 Intelligence Plugin Contract",
    "CP13 Flight v1",
    "Trip Reservation Schema Registry I1/I3",
    "Core/Source admission",
  ],
  rules: [
    "A Booking is a commercial relationship that can refer to multiple flight Segments. A Segment is one physical leg. A proposed Trip Item corresponds to a leg, never to an observation count.",
    "Assemble only supplied Field/Evidence IDs. Never invent a service, airport, date, time, passenger, provider or booking reference. Observations and model group IDs are not canonical identities.",
    "Departure-based Flight CREATE needs evidenced or user-confirmed service, distinct resolved airports and exact supported departure. Civil date/clock/zone and independent source instant remain separate; do not infer timezone from device or destination. Arrival is expected, conditionally validated, not universally mandatory. Booking reference is optional for a Flight interpretation.",
    "One Input can contain zero or many bookings and legs. Several Inputs can support one relationship. Same file, date, route or PNR alone never proves occurrence identity. Separate different booking references and do not silently erase conflicts or duplicate a segment.",
    "Preserve partial legs and unresolved relations. Missing service/date or ambiguous associations require Review. Keep all original field evidence, conflicting alternatives and unknowns; suggest precise Review questions.",
    "Return proposal references only, not field strings, readiness authority, Candidate commands or canonical writes. OTR validator/readiness and owning Review/Admission decide what may proceed. Invalid/unavailable model output preserves deterministic assembly.",
  ],
  output:
    "bookingGroups[{id,referenceFieldIds,segmentIds,evidenceIds,basis}], segments[{id,observationIds,fieldIds,evidenceIds,bookingGroupId,basis}], unresolved[{fieldIds,observationIds,reason,reviewQuestion}], conflicts[{fieldIds,reason}]",
} as const;

type Assembly = ReturnType<typeof assembleFlightDocuments>;
export function buildFlightAssemblyRequest(
  documents: FlightAssemblyDocument[],
  assembly: Assembly,
) {
  const fields: {
    id: string;
    observationId: string | null;
    path: string;
    raw: string;
    value: Json;
    evidenceIds: string[];
    uncertainty: string[];
    issuer?: string | null;
  }[] = [];
  const evidence: {
    id: string;
    inputId: string;
    start: number;
    end: number;
    raw: string;
  }[] = [];
  const sourceIds: Record<string, string> = {};
  const observationAliases = new Map(
    assembly.contentBlocks.map((b, i) => [b.id, `o${i}`]),
  );
  const evidenceAliases = new Map<string, string>();
  const addEvidence = (
    sourceId: string,
    inputId: string,
    start: number,
    end: number,
    raw: string,
  ) => {
    if (evidenceAliases.has(sourceId)) return evidenceAliases.get(sourceId)!;
    const id = `e${evidence.length}`;
    evidenceAliases.set(sourceId, id);
    sourceIds[id] = sourceId;
    evidence.push({ id, inputId, start, end, raw });
    return id;
  };
  for (const [docIndex, doc] of documents.entries()) {
    const inputId = `i${docIndex}`;
    sourceIds[inputId] = doc.inputId;
    const bytes = new TextEncoder().encode(doc.text);
    for (const f of doc.parsed.fragments) {
      const l = f.locator;
      if (l.start === null || l.end === null)
        throw new Error("ASSEMBLY_EVIDENCE_INVALID");
      addEvidence(
        f.id,
        inputId,
        l.start,
        l.end,
        new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(l.start, l.end)),
      );
    }
    for (const item of doc.parsed.items)
      for (const [index, f] of item.fields.entries()) {
        const id = `f${fields.length}`;
        sourceIds[id] = `field:${item.token}:${index}`;
        fields.push({
          id,
          observationId: observationAliases.get(item.token)!,
          path: f.path,
          raw: f.raw,
          value: f.normalized,
          evidenceIds: f.fragment_ids.map((id) => evidenceAliases.get(id)!),
          uncertainty: f.uncertainty,
        });
      }
  }
  for (const group of assembly.bookingGroups)
    for (const ref of group.evidence) {
      const docIndex = documents.findIndex((d) => d.inputId === ref.inputId),
        doc = documents[docIndex];
      const raw = new TextDecoder().decode(
        new TextEncoder().encode(doc.text).slice(ref.start, ref.end),
      );
      const eid = addEvidence(
        `booking-reference:${ref.inputId}:${ref.start}`,
        `i${docIndex}`,
        ref.start,
        ref.end,
        raw,
      );
      const id = `f${fields.length}`;
      sourceIds[id] = `field:booking-reference:${ref.inputId}:${ref.start}`;
      fields.push({
        id,
        observationId: null,
        path: "booking.reference",
        raw,
        value: ref.literal,
        evidenceIds: [eid],
        issuer: ref.issuer,
        uncertainty: [],
      });
    }
  const observations = assembly.contentBlocks.map((b) => {
    const id = observationAliases.get(b.id)!;
    sourceIds[id] = b.id;
    return {
      id,
      inputId: `i${documents.findIndex((d) => d.inputId === b.inputId)}`,
      type: b.type,
      start: b.start,
      end: b.end,
      structure: b.observation.fields.some((f) => f.path === "origin.place_label")
        ? "FLIGHT_TABLE_OR_ROUTE"
        : "SERVICE_HEADER",
    };
  });
  return {
    partA: FLIGHT_ASSEMBLY_BUSINESS_CONTRACT,
    partB: {
      observations,
      fields,
      evidence,
      deterministicSegments: assembly.segments.map((s) => ({
        id: s.id,
        observationIds: s.observationTokens.map((id) => observationAliases.get(id)!),
        readiness: s.readiness.decision,
        missing: s.readiness.missingFields,
      })),
      deterministicBookingGroups: assembly.bookingGroups.map((g) => ({
        id: g.id,
        reference: g.reference,
        issuer: g.issuer,
        segmentIds: g.segmentIds,
      })),
      relationships: assembly.links.map((l) => ({
        ...l,
        from: observationAliases.get(l.from) ?? l.from,
        to: observationAliases.get(l.to) ?? l.to,
      })),
    },
    sourceIds,
  };
}
export type FlightAssemblyRequest = ReturnType<typeof buildFlightAssemblyRequest>;
const id = z.string().min(1).max(256),
  ids = z.array(id).max(256);
export const flightAssemblyProposalSchema = z.strictObject({
  bookingGroups: z
    .array(
      z.strictObject({
        id,
        referenceFieldIds: ids,
        segmentIds: ids,
        evidenceIds: ids,
        basis: z.string().max(500),
      }),
    )
    .max(64),
  segments: z
    .array(
      z.strictObject({
        id,
        observationIds: ids,
        fieldIds: ids,
        evidenceIds: ids,
        bookingGroupId: z.string().max(256),
        basis: z.string().max(500),
      }),
    )
    .max(64),
  unresolved: z
    .array(
      z.strictObject({
        fieldIds: ids,
        observationIds: ids,
        reason: z.string().max(500),
        reviewQuestion: z.string().max(500),
      }),
    )
    .max(64),
  conflicts: z
    .array(z.strictObject({ fieldIds: ids, reason: z.string().max(500) }))
    .max(64),
});
export function validateFlightAssemblyProposal(
  request: FlightAssemblyRequest,
  raw: unknown,
) {
  const rejected = (...reasonCodes: string[]) => ({
    status: "REJECTED" as const,
    reasonCodes,
    proposal: null,
    segments: [],
    grantsAdmission: false as const,
  });
  const parsed = flightAssemblyProposalSchema.safeParse(raw);
  if (!parsed.success) return rejected("ASSEMBLY_PROPOSAL_SCHEMA_INVALID");
  const p = parsed.data,
    b = request.partB;
  const fields = new Map(b.fields.map((f) => [f.id, f])),
    evidence = new Map(b.evidence.map((e) => [e.id, e]));
  const observationIds = new Set(b.observations.map((o) => o.id));
  const allIds = [...p.bookingGroups.map((g) => g.id), ...p.segments.map((s) => s.id)];
  if (new Set(allIds).size !== allIds.length) return rejected("DUPLICATE_GROUP_ID");
  const fieldRefs = [
    ...p.bookingGroups.flatMap((g) => g.referenceFieldIds),
    ...p.segments.flatMap((s) => s.fieldIds),
    ...p.unresolved.flatMap((u) => u.fieldIds),
    ...p.conflicts.flatMap((c) => c.fieldIds),
  ];
  if (fieldRefs.some((id) => !fields.has(id))) return rejected("UNKNOWN_FIELD_ID");
  if (
    [...p.bookingGroups, ...p.segments]
      .flatMap((g) => g.evidenceIds)
      .some((id) => !evidence.has(id))
  )
    return rejected("UNKNOWN_EVIDENCE_ID");
  if (
    [...p.segments, ...p.unresolved]
      .flatMap((s) => s.observationIds)
      .some((id) => !observationIds.has(id))
  )
    return rejected("UNKNOWN_OBSERVATION_ID");
  const covered = new Set(p.unresolved.flatMap((u) => u.fieldIds)),
    used = new Set<string>();
  const normalizedKey = (value: unknown) => canonicalEventJson(value as Json);
  const output = [];
  const usedObservations = new Set<string>();
  for (const segment of p.segments) {
    if (
      !segment.fieldIds.length ||
      new Set(segment.fieldIds).size !== segment.fieldIds.length
    )
      return rejected("EMPTY_OR_DUPLICATE_SEGMENT_FIELDS");
    const selected = segment.fieldIds.map((id) => fields.get(id)!);
    const related = b.deterministicSegments.filter((d) =>
      d.observationIds.some((id) => segment.observationIds.includes(id)),
    );
    const scopes = b.deterministicBookingGroups.filter((g) =>
      g.segmentIds.some((id) => related.some((d) => d.id === id)),
    );
    if (scopes.length > 1) return rejected("CROSS_BOOKING_MERGE");

    if (
      segment.observationIds.some((id) => usedObservations.has(id)) ||
      new Set(segment.observationIds).size !== segment.observationIds.length
    )
      return rejected("OBSERVATION_SPLIT_OR_DUPLICATED");
    if (
      segment.observationIds.some((id) => !selected.some((f) => f.observationId === id))
    )
      return rejected("EMPTY_OBSERVATION_RELATIONSHIP");
    segment.observationIds.forEach((id) => usedObservations.add(id));
    if (selected.some((f) => used.has(f.id)))
      return rejected("DUPLICATE_SEGMENT_PROPOSAL");
    if (selected.some((f) => f.path === "booking.reference"))
      return rejected("BOOKING_FIELD_IN_OCCURRENCE_SCOPE");
    if (
      selected.some(
        (f) =>
          !f.observationId ||
          !segment.observationIds.includes(f.observationId) ||
          f.evidenceIds.some((id) => !segment.evidenceIds.includes(id)),
      )
    )
      return rejected("FIELD_EVIDENCE_GROUP_MISMATCH");
    segment.fieldIds.forEach((id) => {
      used.add(id);
      covered.add(id);
    });
    const typed: InterpretationItem["fields"] = selected.map((f) => ({
      path: f.path,
      raw: f.raw,
      normalized: f.value,
      fragment_ids: f.evidenceIds,
      uncertainty: f.uncertainty,
    }));
    const readiness = assessFlightReadiness({ fields: typed, associationPending: true });
    for (const path of readiness.conflictingFields) {
      const alternatives = selected.filter((f) => f.path === path);
      if (!p.conflicts.some((c) => alternatives.every((f) => c.fieldIds.includes(f.id))))
        return rejected("UNREPORTED_FIELD_CONFLICT");
    }
    output.push({ id: segment.id, fieldIds: segment.fieldIds, readiness });
  }
  if (
    b.fields.filter((f) => f.path !== "booking.reference").some((f) => !covered.has(f.id))
  )
    return rejected("OBSERVATIONS_SILENTLY_OMITTED");
  for (const group of p.bookingGroups) {
    const refs = group.referenceFieldIds.map((id) => fields.get(id)!);
    if (
      !refs.length ||
      refs.some((f) => f.path !== "booking.reference") ||
      new Set(refs.map((f) => normalizedKey([f.value, f.issuer]))).size !== 1
    )
      return rejected("CROSS_BOOKING_MERGE");
    if (refs.some((f) => f.evidenceIds.some((id) => !group.evidenceIds.includes(id))))
      return rejected("BOOKING_EVIDENCE_MISMATCH");
    const groupObservations = p.segments
      .filter((s) => group.segmentIds.includes(s.id))
      .flatMap((s) => s.observationIds);
    const groupOriginals = b.deterministicSegments.filter((d) =>
      d.observationIds.some((id) => groupObservations.includes(id)),
    );
    const groupScopes = b.deterministicBookingGroups.filter((g) =>
      g.segmentIds.some((id) => groupOriginals.some((d) => d.id === id)),
    );
    if (groupScopes.length > 1) return rejected("CROSS_BOOKING_MERGE");
    if (refs.some((f) => !f.issuer)) {
      const namespaces = new Set([
        ...refs.flatMap((f) => f.evidenceIds.map((id) => evidence.get(id)!.inputId)),
        ...b.observations
          .filter((o) => groupObservations.includes(o.id))
          .map((o) => o.inputId),
      ]);
      if (namespaces.size > 1) return rejected("CROSS_BOOKING_MERGE");
    }

    for (const segmentId of group.segmentIds) {
      const s = p.segments.find((s) => s.id === segmentId);
      if (!s || s.bookingGroupId !== group.id) return rejected("GROUP_SEGMENT_MISMATCH");
      const original = b.deterministicSegments.filter((d) =>
        d.observationIds.some((id) => s.observationIds.includes(id)),
      );
      const known = b.deterministicBookingGroups.filter((g) =>
        g.segmentIds.some((id) => original.some((s) => s.id === id)),
      );
      if (
        known.some(
          (g) =>
            g.reference !== refs[0].value ||
            (g.issuer && refs[0].issuer && g.issuer !== refs[0].issuer),
        )
      )
        return rejected("CROSS_BOOKING_MERGE");
    }
  }
  if (
    p.segments.some(
      (s) =>
        s.bookingGroupId &&
        !p.bookingGroups.some(
          (g) => g.id === s.bookingGroupId && g.segmentIds.includes(s.id),
        ),
    )
  )
    return rejected("GROUP_SEGMENT_MISMATCH");
  return {
    status: "ACCEPTED" as const,
    reasonCodes: ["PROPOSAL_REFERENCES_VALID_REVIEW_REQUIRED"],
    proposal: p,
    segments: output,
    grantsAdmission: false as const,
  };
}

export type FlightSemanticAssemblyDiagnostic = {
  contractVersion: typeof FLIGHT_ASSEMBLY_BUSINESS_CONTRACT.version;
  request: FlightAssemblyRequest;
  deterministic: Assembly;
  execution: {
    status: "SUCCEEDED" | "UNAVAILABLE" | "FAILED" | "NOT_RUN";
    reason: string;
    proposal?: unknown;
  };
  validation: ReturnType<typeof validateFlightAssemblyProposal> | null;
  finalBasis: "DETERMINISTIC" | "VALIDATED_ADVISORY_PROPOSAL";
  canonicalWrites: false;
};

// Lossless column tables keep the same evidence within the on-device context window.
export function flightAssemblyModelPrompt(request: FlightAssemblyRequest) {
  const b = request.partB;
  return JSON.stringify({
    partA: request.partA,
    partB: {
      observations: b.observations,
      idAllowlist: {
        fields: b.fields.map((f) => f.id),
        evidence: b.evidence.map((e) => e.id),
        observations: b.observations.map((o) => o.id),
      },
      fieldColumns: [
        "id",
        "observationId",
        "path",
        "raw",
        "value",
        "evidenceIds",
        "uncertainty",
        "issuer",
      ],
      fields: b.fields.map((f) => [
        f.id,
        f.observationId,
        f.path,
        f.raw,
        f.value,
        f.evidenceIds,
        f.uncertainty,
        f.issuer ?? null,
      ]),
      evidenceColumns: ["id", "inputId", "start", "end", "raw"],
      evidence: b.evidence.map((e) => [e.id, e.inputId, e.start, e.end, e.raw]),
      deterministicSegments: b.deterministicSegments,
      deterministicBookingGroups: b.deterministicBookingGroups,
      relationships: b.relationships,
    },
  });
}
