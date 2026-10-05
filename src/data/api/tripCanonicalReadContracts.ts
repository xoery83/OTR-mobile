import { z } from "zod";

const revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const precision = z.number().int().min(-1).max(6).nullable();
const text = z.string().nullable();
const uuid = z.uuid().nullable();
// Keep PostgreSQL microseconds and offsets verbatim; never pass facts through Date.
const instant = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/);
const refs = z.record(z.string(), z.string().max(512)).nullable();
const boundaryFields = {
  local_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  local_time: z
    .string()
    .regex(/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?$/)
    .nullable(),
  clock_precision: precision,
  quality: z.enum(["UNKNOWN", "EXACT", "ESTIMATED"]).nullable(),
  basis: z.enum(["DERIVED_CIVIL", "SOURCE_INSTANT"]).nullable(),
  zone_id: text,
  supplied_offset_seconds: z.number().int().min(-64800).max(64800).nullable(),
  source_instant: instant.nullable(),
  source_instant_precision: precision,
  civil_resolution: z
    .enum(["PENDING", "UNIQUE", "GAP", "FOLD", "FOLD_RESOLVED"])
    .nullable(),
  resolution_offset_seconds: z.number().int().min(-64800).max(64800).nullable(),
  interpretation_key: text,
  interpretation_input_sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  provenance_refs: refs,
};
const spatialFields = {
  authored_label: text,
  authored_text: text,
  authored_address: text,
  accepted_address: text,
  accepted_latitude: z.number().min(-90).max(90).nullable(),
  accepted_longitude: z.number().min(-180).max(180).nullable(),
  accepted_place_id: uuid,
  spatial_provenance_refs: refs,
  location_input_revision: revision.nullable(),
  authored_address_line1: text,
  authored_address_line2: text,
  authored_address_locality: text,
  authored_address_region: text,
  authored_address_postal_code: text,
  authored_address_country: text,
  accepted_address_line1: text,
  accepted_address_line2: text,
  accepted_address_locality: text,
  accepted_address_region: text,
  accepted_address_postal_code: text,
  accepted_address_country: text,
};
// Generated field expansion follows B-T3A; values retain their original names.
function prefixed<P extends string>(prefix: P) {
  return Object.fromEntries(
    Object.entries(boundaryFields).map(([key, value]) => [`${prefix}_${key}`, value]),
  ) as {
    [K in keyof typeof boundaryFields as `${P}_${K}`]: (typeof boundaryFields)[K];
  };
}
export const canonicalEndpointSchema = z.strictObject({
  event_id: z.uuid(),
  role: z.enum(["ORIGIN", "DESTINATION"]),
  instant: instant.nullable(),
  ...boundaryFields,
  ...spatialFields,
});
export const canonicalEventFactsSchema = z
  .strictObject({
    id: z.uuid(),
    trip_id: z.uuid(),
    temporal_contract_version: z.literal(1),
    temporal_shape: z.enum([
      "POINT",
      "CALENDAR",
      "ALL_DAY",
      "SPAN",
      "STAY",
      "TRANSPORT",
      "WINDOW",
    ]),
    semantic_revision: revision,
    title: z.string(),
    description: text,
    event_type: z.enum([
      "flight",
      "hotel",
      "car",
      "activity",
      "shopping",
      "meal",
      "transport",
      "note",
      "other",
    ]),
    status: z.enum(["planned", "skipped", "completed", "cancelled"]),
    order_index: z.number().int().nullable(),
    trip_day_id: uuid,
    reservation_id: uuid,
    participant_scope: z.enum(["UNASSIGNED", "ASSIGNED", "WHOLE_GROUP"]),
    timing_label: text,
    timing_provenance_ref: text,
    planned_start: instant.nullable(),
    planned_end: instant.nullable(),
    is_estimated_time: z.boolean(),
    legacy_planned_start: instant.nullable(),
    legacy_planned_end: instant.nullable(),
    legacy_is_estimated_time: z.boolean().nullable(),
    legacy_snapshot_at: instant.nullable(),
    ...prefixed("start"),
    ...prefixed("end"),
    ...spatialFields,
    itinerary_transport_endpoints: z.array(canonicalEndpointSchema).max(2),
  })
  .superRefine((event, context) => {
    const endpoints = event.itinerary_transport_endpoints;
    if (
      event.temporal_shape === "TRANSPORT"
        ? endpoints.length !== 2 || new Set(endpoints.map((end) => end.role)).size !== 2
        : endpoints.length !== 0
    )
      context.addIssue({ code: "custom", message: "Invalid endpoint set." });
    if (endpoints.some((end) => end.event_id !== event.id))
      context.addIssue({ code: "custom", message: "Endpoint scope mismatch." });
  });
export const canonicalEventReadSchema = z.discriminatedUnion("disposition", [
  z.strictObject({
    readVersion: z.literal(1),
    disposition: z.literal("READ_ONLY"),
    legacyCompatible: z.literal(false),
    event: canonicalEventFactsSchema,
  }),
  z.strictObject({
    readVersion: z.literal(1),
    disposition: z.literal("WITHHELD"),
    reason: z.enum(["UNSUPPORTED_CLIENT", "UNSUPPORTED_CONTRACT", "LEGACY_EVENT"]),
  }),
]);
export const canonicalCapabilitiesSchema = z.strictObject({
  contractVersion: z.literal(1),
  canonicalEventReadVersion: z.literal(1).nullable(),
  eventCommandsVersion: z.literal(1).nullable(),
  enabledCommands: z.array(z.never()),
  enabledShapes: z.array(z.never()),
  enabledScopes: z.array(z.never()),
  readableShapes: z.array(canonicalEventFactsSchema.shape.temporal_shape),
  maximumPrecision: z.literal(6).nullable(),
  resolverAvailable: z.literal(false),
  trackCEvidenceAvailable: z.literal(false),
  activationState: z.literal("DISABLED"),
  databaseGate: z.enum(["CLOSED", "UNKNOWN"]),
  gatewayAvailable: z.boolean(),
});
const commands = z.enum([
  "CREATE_EVENT",
  "UPDATE_CORE_TEXT",
  "UPDATE_TIME",
  "UPDATE_LOCATION",
  "UPDATE_GROUPING",
  "UPDATE_STATUS",
  "CREATE_TRANSPORT",
  "UPDATE_TRANSPORT",
]);
// Status-only correlation is explicitly not a hash of the filtered response.
export const eventOperationReceiptSchema = z.strictObject({
  projection: z.literal("STATUS_ONLY"),
  trip_id: z.uuid(),
  actor_account_id: z.uuid(),
  operation_key: z.uuid(),
  receipt_version: z.literal(1),
  command_version: z.literal(1),
  intent_version: z.literal(1),
  command: commands,
  intent_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  receipt_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  target_event_id: z.uuid(),
  base_semantic_revision: revision.nullable(),
  outcome: z.enum(["APPLIED", "NO_CHANGE", "CONFLICT", "REJECTED"]),
  result_event_id: uuid,
  committed_semantic_revision: revision.nullable(),
  observed_semantic_revision: revision.nullable(),
  error_code: text,
  submitted_http_status: z.union([
    z.literal(200),
    z.literal(201),
    z.literal(403),
    z.literal(409),
    z.literal(422),
  ]),
  committed_at: instant,
});
export type CanonicalEventRead = z.infer<typeof canonicalEventReadSchema>;
export type CanonicalCapabilities = z.infer<typeof canonicalCapabilitiesSchema>;
export type EventOperationReceipt = z.infer<typeof eventOperationReceiptSchema>;
export const canonicalEventColumns =
  Object.keys(canonicalEventFactsSchema.shape)
    .filter((key) => key !== "itinerary_transport_endpoints")
    .join(",") +
  `,itinerary_transport_endpoints(${Object.keys(canonicalEndpointSchema.shape).join(",")})`;
