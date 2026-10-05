import { z } from "zod";
import { canonicalEventJson, parseEventJson, type Json } from "./eventIntentJson";

export const FLIGHT_MATCH_POLICY = "import-flight-match-v1" as const;
const uuid = z.uuid().regex(/^[0-9a-f-]{36}$/);
const bounded = (n: number) =>
  z.string().refine((v) => Array.from(v).length <= n && !v.includes("\0"));
const required = (n: number) => bounded(n).refine((v) => v.trim().length > 0);
const key = z.string().regex(/^[A-Za-z0-9._:-]{1,32}$/);
export const flightServiceSchema = z
  .strictObject({
    service_key: key,
    transport_subtype: z.literal("FLIGHT"),
    attribution: z.enum(["MARKETING", "OPERATING", "UNSPECIFIED"]),
    operator_namespace: z.enum(["IATA_AIRLINE", "ICAO_AIRLINE", "AUTHORITY", "NAME"]),
    operator_issuer: required(128),
    operator_value: required(128),
    operator_literal: required(255),
    service_number: required(64),
    service_literal: required(255),
    codeshare_operating_key: key.nullable(),
  })
  .superRefine((s, c) => {
    if (
      s.operator_namespace === "IATA_AIRLINE" &&
      (s.operator_issuer !== "IATA" || !/^[A-Z0-9]{2}$/.test(s.operator_value))
    )
      c.addIssue({ code: "custom", message: "UNRESOLVED_IDENTITY" });
    if (
      s.operator_namespace === "ICAO_AIRLINE" &&
      (s.operator_issuer !== "ICAO" || !/^[A-Z]{3}$/.test(s.operator_value))
    )
      c.addIssue({ code: "custom", message: "UNRESOLVED_IDENTITY" });
    if (
      ["NAME", "AUTHORITY"].includes(s.operator_namespace) &&
      (s.operator_value !== s.operator_value.normalize("NFC").trim() ||
        s.operator_issuer !== s.operator_issuer.normalize("NFC").trim())
    )
      c.addIssue({ code: "custom", message: "UNRESOLVED_IDENTITY" });
  });
export const flightServicesSchema = z
  .array(flightServiceSchema)
  .min(1)
  .max(4)
  .superRefine((services, c) => {
    const keys = services.map((s) => s.service_key);
    const fail = () =>
      c.addIssue({ code: "custom", message: "INVALID_SERVICE_AGGREGATE" });
    if (
      new Set(keys).size !== keys.length ||
      keys.join("\0") !== [...keys].sort().join("\0")
    )
      fail();
    if (
      services.filter((s) => s.attribution === "OPERATING").length > 1 ||
      services.filter((s) => s.attribution === "MARKETING").length > 3 ||
      (services.some((s) => s.attribution === "UNSPECIFIED") && services.length !== 1)
    )
      fail();
    if (
      new Set(
        services.map((s) =>
          canonicalEventJson([
            s.attribution,
            s.operator_namespace,
            s.operator_issuer,
            s.operator_value,
            s.service_number,
          ]),
        ),
      ).size !== services.length
    )
      fail();
    for (const s of services)
      if (
        s.codeshare_operating_key !== null &&
        (s.attribution !== "MARKETING" ||
          s.codeshare_operating_key === s.service_key ||
          !services.some(
            (o) =>
              o.service_key === s.codeshare_operating_key &&
              o.attribution === "OPERATING",
          ))
      )
        fail();
  });
function validDate(v: string): boolean {
  const [year, month, day] = v.split("-").map(Number);
  const days = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return (
    year >= 1 &&
    year <= 9999 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= days[month - 1]
  );
}
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(validDate);
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/);
const instant = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?Z$/)
  .refine((v) => validDate(v.slice(0, 10)));
const precision = z.number().int().min(-1).max(6).nullable();
export const flightTimeInputSchema = z
  .strictObject({
    local_date: date.nullable(),
    local_time: clock.nullable(),
    clock_precision: precision,
    quality: z.enum(["UNKNOWN", "EXACT", "ESTIMATED"]),
    basis: z.enum(["SOURCE_INSTANT", "DERIVED_CIVIL"]),
    zone_id: required(128).nullable(),
    supplied_offset_seconds: z.number().int().min(-64800).max(64800).nullable(),
    source_instant: instant.nullable(),
    source_instant_precision: precision,
    fold_choice: z.null(),
  })
  .superRefine((t, c) => {
    const fail = () => c.addIssue({ code: "custom", message: "UNRESOLVED_TEMPORAL" });
    if (
      (t.local_time === null) !== (t.clock_precision === null) ||
      (t.source_instant === null) !== (t.source_instant_precision === null)
    )
      fail();
    if (
      t.local_time !== null &&
      t.local_time.length !==
        (t.clock_precision === -1
          ? 5
          : t.clock_precision === 0
            ? 8
            : 9 + (t.clock_precision ?? 0))
    )
      fail();
    if (
      t.source_instant !== null &&
      (t.source_instant.length !==
        (t.source_instant_precision! <= 0 ? 20 : 21 + t.source_instant_precision!) ||
        (t.source_instant_precision === -1 && t.source_instant.slice(17, 19) !== "00"))
    )
      fail();
  });
export const flightTimeSchema = flightTimeInputSchema.superRefine((t, c) => {
  const fail = () => c.addIssue({ code: "custom", message: "UNRESOLVED_TEMPORAL" });
  // Option A accepts no complete civil tuple requiring interpretation proof.
  if (t.local_date !== null && t.local_time !== null && t.zone_id !== null) fail();
  if (
    t.quality === "UNKNOWN"
      ? t.basis !== "DERIVED_CIVIL" || t.local_time !== null || t.source_instant !== null
      : t.quality !== "EXACT" || t.basis !== "SOURCE_INSTANT" || t.source_instant === null
  )
    fail();
});
const location = z
  .strictObject({
    authored_label: bounded(500).nullable(),
    authored_text: bounded(5000).nullable(),
    accepted_place_id: uuid.nullable(),
  })
  .refine(
    (l) => l.accepted_place_id !== null || (l.authored_label?.trim().length ?? 0) > 0,
  );
export const flightEndpointSchema = z.strictObject({ time: flightTimeSchema, location });
const ref = z
  .string()
  .max(512)
  .regex(
    /^track-c\/field-evidence\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._:-]{1,128}$/,
  );
const proof = z.union([
  z.strictObject({ kind: z.literal("TRACK_C"), ref }),
  z.strictObject({ kind: z.literal("RETAINED"), ref: required(512) }),
]);
const proofs = z.record(z.string().max(128), proof);
export const createFlightPayloadSchema = z.strictObject({
  shape: z.literal("TRANSPORT"),
  eventType: z.literal("TRANSPORT"),
  subtype: z.literal("FLIGHT"),
  participantScope: z.literal("UNASSIGNED"),
  core: z.strictObject({ title: required(200) }),
  origin: flightEndpointSchema,
  destination: flightEndpointSchema,
  services: flightServicesSchema,
  proofs,
});
export const updateFlightPayloadSchema = z.strictObject({
  changes: z
    .strictObject({
      title: required(200).optional(),
      origin: flightEndpointSchema.optional(),
      destination: flightEndpointSchema.optional(),
      services: flightServicesSchema.optional(),
    })
    .refine((v) => Object.keys(v).length > 0),
  proofs,
});
export type FlightService = z.infer<typeof flightServiceSchema>;
export type FlightEndpoint = z.infer<typeof flightEndpointSchema>;
export type FlightValues = {
  title?: string;
  origin?: FlightEndpoint;
  destination?: FlightEndpoint;
  services?: FlightService[];
};
// Addresses are derived from the finite typed grammar, never arbitrary patch paths.
export function flightCommandLeaves(
  values: FlightValues,
  includeNull = false,
): Record<string, Json> {
  const leaves: Record<string, Json> = {};
  if (values.title !== undefined) leaves["ROOT.title"] = values.title;
  for (const role of ["origin", "destination"] as const) {
    const end = values[role];
    if (!end) continue;
    for (const k of [
      "local_date",
      "local_time",
      "zone_id",
      "supplied_offset_seconds",
      "source_instant",
    ] as const) {
      const v = end.time[k];
      if (v !== null || includeNull)
        leaves[`${role.toUpperCase()}.${k}`] =
          k === "local_time" || k === "source_instant"
            ? {
                value: v,
                precision:
                  k === "local_time"
                    ? end.time.clock_precision
                    : end.time.source_instant_precision,
              }
            : v;
    }
    for (const k of ["authored_label", "authored_text", "accepted_place_id"] as const)
      if (end.location[k] !== null || includeNull)
        leaves[`${role.toUpperCase()}.${k}`] = end.location[k];
  }
  for (const s of values.services ?? [])
    for (const k of [
      "operator_namespace",
      "operator_issuer",
      "operator_value",
      "operator_literal",
      "service_number",
      "service_literal",
      "attribution",
      "codeshare_operating_key",
    ] as const)
      if (s[k] !== null || includeNull) leaves[`SERVICE.${s.service_key}.${k}`] = s[k];
  return leaves;
}
export function validateFlightCommand(
  command: "CREATE_TRANSPORT" | "UPDATE_TRANSPORT",
  payload: unknown,
) {
  const parsed =
    command === "CREATE_TRANSPORT"
      ? createFlightPayloadSchema.parse(payload)
      : updateFlightPayloadSchema.parse(payload);
  const values: FlightValues =
    "changes" in parsed
      ? parsed.changes
      : {
          title: parsed.core.title,
          origin: parsed.origin,
          destination: parsed.destination,
          services: parsed.services,
        };
  if (
    values.origin &&
    (values.origin.time.local_date === null ||
      values.origin.time.quality !== "EXACT" ||
      values.origin.time.source_instant === null)
  )
    throw new Error("UNRESOLVED_TEMPORAL");
  const requiredLeaves = flightCommandLeaves(values);
  const available = flightCommandLeaves(values, command === "UPDATE_TRANSPORT");
  const proofKeys = Object.keys(parsed.proofs);
  if (
    proofKeys.length > 64 ||
    Object.keys(requiredLeaves).some((k) => !Object.hasOwn(parsed.proofs, k)) ||
    proofKeys.some((k) => !Object.hasOwn(available, k))
  )
    throw new Error("INVALID_PROVENANCE");
  const leaves = Object.fromEntries(proofKeys.map((k) => [k, available[k]]));
  return { payload: parsed, values, leaves };
}

export type FlightOccurrenceAnchor = {
  eventId: string;
  semanticRevision: number;
  namespace: "IATA_AIRLINE" | "ICAO_AIRLINE";
  issuer: string;
  operator: string;
  serviceNumber: string;
  originDate: string;
  originAirportId: string;
  destinationAirportId: string;
  departureClock: string | null;
  qualified: boolean;
  operatingOccurrence?: string;
  contradictory?: boolean;
  supplierOccurrence?: {
    namespace: string;
    issuer: string;
    value: string;
    scopeId: string;
    verified: boolean;
  };
};
export type FlightMatchScope = {
  complete: boolean;
  current: boolean;
  proposalsComplete: boolean;
  lineageComplete: boolean;
  servicesAtEventBaselines: boolean;
  occurrences: FlightOccurrenceAnchor[];
};
export function matchFlightV1(
  candidate: FlightOccurrenceAnchor,
  scope: FlightMatchScope,
  continuity?: {
    targetId: string;
    semanticRevision: number;
    reason: "RETIME" | "NUMBER_SUPERSESSION";
    reviewed: true;
  },
): {
  assessment: "SAME_ITEM" | "NEW_ITEM" | "UNRESOLVED_MATCH";
  targetId?: string;
  reason: string;
} {
  const unresolved = (reason: string) => ({
    assessment: "UNRESOLVED_MATCH" as const,
    reason,
  });
  if (!candidate.qualified || candidate.contradictory || !validDate(candidate.originDate))
    return unresolved("UNQUALIFIED_OR_CONTRADICTORY");
  if (
    !scope.complete ||
    !scope.current ||
    !scope.proposalsComplete ||
    !scope.lineageComplete ||
    !scope.servicesAtEventBaselines
  )
    return unresolved("INCOMPLETE_SCOPE");
  if (scope.occurrences.length > 64) return unresolved("LIMIT");
  const routeDate = (o: FlightOccurrenceAnchor) =>
    o.originDate === candidate.originDate &&
    o.originAirportId === candidate.originAirportId &&
    o.destinationAirportId === candidate.destinationAirportId;
  const service = (o: FlightOccurrenceAnchor) =>
    (o.namespace === candidate.namespace &&
      o.issuer === candidate.issuer &&
      o.operator === candidate.operator &&
      o.serviceNumber === candidate.serviceNumber) ||
    (candidate.operatingOccurrence !== undefined &&
      o.operatingOccurrence === candidate.operatingOccurrence);
  const supplier = (o: FlightOccurrenceAnchor) => {
    const a = candidate.supplierOccurrence,
      b = o.supplierOccurrence;
    return (
      a?.verified === true &&
      b?.verified === true &&
      [a.namespace, a.issuer, a.value, a.scopeId].every(
        (v) => v.length > 0 && v.length <= 128,
      ) &&
      a.namespace === b.namespace &&
      a.issuer === b.issuer &&
      a.value === b.value &&
      a.scopeId === b.scopeId
    );
  };
  const reviewed = (
    o: FlightOccurrenceAnchor,
    reason: "RETIME" | "NUMBER_SUPERSESSION",
  ) =>
    continuity?.reviewed === true &&
    continuity.reason === reason &&
    continuity.targetId === o.eventId &&
    continuity.semanticRevision === o.semanticRevision;
  if (scope.occurrences.some((o) => supplier(o) && !routeDate(o)))
    return unresolved("SUPPLIER_TUPLE_CONTRADICTION");
  const matches = scope.occurrences.filter(
    (o) =>
      routeDate(o) && (service(o) || supplier(o) || reviewed(o, "NUMBER_SUPERSESSION")),
  );
  if (matches.some((o) => !o.qualified || o.contradictory))
    return unresolved("CONTRADICTORY_EVIDENCE");
  if (matches.length > 1) return unresolved("MULTIPLE_OCCURRENCES");
  if (matches.length === 1) {
    const target = matches[0];
    if (
      candidate.departureClock !== null &&
      target.departureClock !== null &&
      candidate.departureClock !== target.departureClock &&
      !reviewed(target, "RETIME")
    )
      return unresolved("CONTINUITY_REVIEW_REQUIRED");
    return {
      assessment: "SAME_ITEM",
      targetId: target.eventId,
      reason: "UNIQUE_QUALIFIED_TUPLE",
    };
  }
  if (scope.occurrences.some((o) => routeDate(o) && !service(o)))
    return unresolved("CODESHARE_OR_SUPERSESSION_UNRESOLVED");
  return { assessment: "NEW_ITEM", reason: "DISTINCT_SCOPED_OCCURRENCE" };
}

const flightEnvelopeSchema = z
  .strictObject({
    contractVersion: z.literal(1),
    intentVersion: z.literal(1),
    commandVersion: z.literal(1),
    command: z.enum(["CREATE_TRANSPORT", "UPDATE_TRANSPORT"]),
    operationKey: z.uuidv4().regex(/^[0-9a-f-]{36}$/),
    actorAccountId: uuid,
    tripId: uuid,
    eventId: uuid,
    baseSemanticRevision: z.number().int().positive().safe().nullable(),
    payload: z.unknown(),
  })
  .superRefine((v, c) => {
    if ((v.command === "CREATE_TRANSPORT") !== (v.baseSemanticRevision === null))
      c.addIssue({ code: "custom", message: "INVALID_COMMAND_BASE" });
  });
export function parseFlightCommandEnvelope(raw: string) {
  const envelope = flightEnvelopeSchema.parse(parseEventJson(raw));
  validateFlightCommand(envelope.command, envelope.payload);
  return envelope;
}
