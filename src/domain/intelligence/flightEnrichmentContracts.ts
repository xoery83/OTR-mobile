import { z } from "zod";
export const VERSION = "otr-flight-enrichment/1" as const;
export const FEATURE = "FLIGHT_ENRICHMENT" as const;
const id = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
export const civilDate = z.iso.date().refine((v) => {
  const d = new Date(v + "T12:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, "Invalid civil date");
export const zone = z
  .string()
  .min(3)
  .max(100)
  .refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return v.includes("/");
    } catch {
      return false;
    }
  }, "IANA timezone required");
export const flightNumber = z.string().regex(/^[A-Z0-9]{2,3}[0-9]{1,5}[A-Z]?$/);
const airport = z.string().regex(/^[A-Z]{3}$/);
const clock = z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/);
export const fields = {
  marketingCarrier: z.string().min(1).max(100),
  operatingCarrier: z.string().min(1).max(100),
  flightNumber,
  departureAirport: airport,
  arrivalAirport: airport,
  departureLocalDate: civilDate,
  departureLocalTime: clock,
  arrivalLocalDate: civilDate,
  arrivalLocalTime: clock,
  departureTimezone: zone,
  arrivalTimezone: zone,
};
export type Field = keyof typeof fields;
export const fieldNames = Object.keys(fields) as [Field, ...Field[]];
const fieldName = z.enum(fieldNames);
export const draftSchema = z.strictObject({
  id,
  revision: z.number().int().nonnegative().safe(),
});
export const requestSchema = z.strictObject({
  version: z.literal(VERSION),
  requestId: id,
  idempotencyKey: id,
  mode: z.enum(["CREATE", "EDIT"]),
  draft: draftSchema,
  flightNumber,
  departureLocalDate: civilDate,
  knownFields: z.strictObject(fields).partial().default({}),
  context: z.strictObject({ location: z.string().max(120) }).optional(),
});
export type FlightEnrichmentRequest = z.infer<typeof requestSchema>;
const publicUrl = z
  .url()
  .max(2048)
  .refine((v) => {
    const u = new URL(v);
    return ["https:", "http:"].includes(u.protocol) && !u.username && !u.password;
  });
export const evidenceSchema = z.strictObject({
  id,
  url: publicUrl,
  observedAt: z.iso.datetime(),
  text: z.string().max(131072),
});
export type Evidence = z.infer<typeof evidenceSchema>;
export const rawFieldSchema = z.object({
  value: z.string().max(100),
  evidenceId: id,
  quote: z.string().min(1).max(2000),
  applicableFrom: civilDate.nullable().optional(),
  applicableTo: civilDate.nullable().optional(),
  dateEvidenceQuote: z.string().max(2000).nullable().optional(),
});
export const candidateSchema = z.object({
  departureAirport: airport,
  arrivalAirport: airport,
  departureLocalDate: civilDate.optional(),
  operatingFlightNumber: flightNumber.optional(),
});
export const proposalSchema = z.object({
  status: z.enum(["FOUND", "PARTIAL", "NOT_FOUND", "AMBIGUOUS", "UNRESOLVED"]),
  fields: z.partialRecord(fieldName, rawFieldSchema),
  candidates: z.array(candidateSchema).max(8).default([]),
});
export type Proposal = z.infer<typeof proposalSchema>;
export type RawResult = { proposal: Proposal; evidence: Evidence[] };
const sourceSchema = z.strictObject({
  url: publicUrl,
  evidenceId: id,
  quote: z.string().min(1).max(2000),
  observedAt: z.iso.datetime(),
});
export const suggestionSchema = z.strictObject({
  field: fieldName,
  value: z.string().min(1).max(100),
  existingValue: z.string().max(100).nullable(),
  eligibility: z.enum(["ADOPT", "UNCHANGED", "KEEP_OR_REPLACE"]),
  source: sourceSchema,
  applicableDate: z.strictObject({
    from: civilDate.nullable(),
    to: civilDate.nullable(),
    requested: civilDate,
  }),
  referenceOnly: z.boolean(),
  reason: z
    .enum([
      "DATE_NEEDS_CHECK",
      "MULTIPLE_LEGS",
      "IDENTITY_CONFLICT",
      "EXISTING_VALUE_CONFLICT",
    ])
    .nullable(),
});
export type Suggestion = z.infer<typeof suggestionSchema>;
export const statuses = [
  "SUCCESS",
  "PARTIAL",
  "REFERENCE_ONLY",
  "AMBIGUOUS",
  "NOT_FOUND",
  "UNAVAILABLE",
  "STALE",
] as const;
export type Status = (typeof statuses)[number];
export const nanos = z.string().regex(/^(?:0|[1-9][0-9]{0,59})$/);
const count = z.number().int().nonnegative().safe().nullable();
export const observationSchema = z
  .strictObject({
    providerId: id,
    modelId: id.nullable(),
    providerRequestId: id.nullable(),
    input_tokens: count,
    output_tokens: count,
    cached_input_tokens: count,
    total_tokens: count,
    usage_quality: z.enum(["ACTUAL_REPORTED", "ESTIMATED", "UNKNOWN"]),
    cost_nanos: nanos.nullable(),
    cost_quality: z.enum(["ACTUAL", "ESTIMATED", "UNKNOWN"]),
    billing_status: z.enum(["RECONCILED", "UNRECONCILED", "NOT_BILLED", "UNKNOWN"]),
    execution: z.enum(["COMPLETED", "MAY_HAVE_STARTED", "NOT_STARTED"]),
  })
  .superRefine((v, c) => {
    if (
      v.cached_input_tokens !== null &&
      v.input_tokens !== null &&
      v.cached_input_tokens > v.input_tokens
    )
      c.addIssue({ code: "custom", message: "Cache tokens exceed input" });
    if (
      v.input_tokens !== null &&
      v.output_tokens !== null &&
      v.total_tokens !== null &&
      v.input_tokens + v.output_tokens !== v.total_tokens
    )
      c.addIssue({ code: "custom", message: "Inconsistent token total" });
  });
export type ProviderObservation = z.infer<typeof observationSchema>;
export const usageSummarySchema = z.strictObject({
  receiptId: id.nullable(),
  providerId: id,
  modelId: id.nullable(),
  searchCalls: z.number().int().min(0).max(1),
  llmCalls: z.number().int().min(0).max(1),
  input_tokens: count,
  output_tokens: count,
  cached_input_tokens: count,
  total_tokens: count,
  knownCostNanos: nanos,
  providerCostNanos: nanos.nullable(),
  costQuality: z.enum(["ACTUAL", "ESTIMATED", "UNKNOWN", "NO_PROVIDER_CALL"]),
  billingStatus: z.enum(["RECONCILED", "UNRECONCILED", "NOT_BILLED", "UNKNOWN"]),
  currency: z.literal("USD"),
  entitlement: z.enum(["POLICY_UNFROZEN", "ALLOWED", "DENIED"]),
  cacheHit: z.boolean(),
  metering: z.enum(["RECORDED", "PENDING"]),
  stepReceiptIds: z.array(id).max(2),
});
export type UsageSummary = z.infer<typeof usageSummarySchema>;
export const responseSchema = z.strictObject({
  version: z.literal(VERSION),
  requestId: id,
  idempotencyKey: id,
  mode: z.enum(["CREATE", "EDIT"]),
  draft: draftSchema,
  query: z.strictObject({ flightNumber, departureLocalDate: civilDate }),
  status: z.enum(statuses),
  advisory: z.literal(true),
  requiresUserConfirmation: z.literal(true),
  manualEntryAllowed: z.literal(true),
  suggestions: z.array(suggestionSchema).max(11),
  references: z.array(suggestionSchema).max(11),
  unresolved: z.array(fieldName).max(11),
  candidates: z.array(candidateSchema).max(8),
  observedAt: z.iso.datetime(),
  cache: z.strictObject({
    state: z.enum(["HIT", "MISS", "ERROR", "AMBIGUOUS"]),
    freshUntil: z.iso.datetime().nullable(),
    writes: z.enum(["CLOSED_LICENSE_UNCONFIRMED", "NOT_ELIGIBLE", "WRITTEN", "ERROR"]),
  }),
  usage: usageSummarySchema,
  failureReason: z
    .enum([
      "TIMEOUT",
      "CANCELED",
      "PROVIDER_UNAVAILABLE",
      "MALFORMED_OUTPUT",
      "RESPONSE_BOUND",
      "INPUT_BOUND",
      "BUDGET_REJECTED",
      "POLICY_CLOSED",
      "ENTITLEMENT_DENIED",
      "METERING_UNAVAILABLE",
      "AUTH_CHANGED",
      "UNKNOWN",
    ])
    .nullable(),
});
export type FlightEnrichmentResponse = z.infer<typeof responseSchema>;
export function canApplySuggestions(
  response: FlightEnrichmentResponse,
  current: Pick<
    FlightEnrichmentRequest,
    "requestId" | "draft" | "flightNumber" | "departureLocalDate" | "mode"
  >,
): boolean {
  return (
    response.version === VERSION &&
    response.requestId === current.requestId &&
    response.mode === current.mode &&
    response.draft.id === current.draft.id &&
    response.draft.revision === current.draft.revision &&
    response.query.flightNumber === current.flightNumber &&
    response.query.departureLocalDate === current.departureLocalDate &&
    ["SUCCESS", "PARTIAL"].includes(response.status)
  );
}
