import { z } from "zod";
import { canonicalEventJson, type Json } from "@/domain/trip/eventIntentJson";
import {
  flightReviewSchema,
  flightSupportSchema,
  flightLocatorSchema,
} from "@/domain/trip/flightImportReview";
import {
  flightTimeInputSchema,
  flightServicesSchema,
} from "@/domain/trip/flightAdmission";
const uuid = z.uuid().regex(/^[0-9a-f-]{36}$/);
const revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const time = z.iso.datetime({ precision: 6 });
const text = (n: number) =>
  z.string().refine((v) => Array.from(v).length <= n && !v.includes("\0"));
const key = text(128).regex(/^[A-Za-z0-9._:-]{1,128}$/);
const uuidSet = (minimum: number, maximum: number) =>
  z
    .array(uuid)
    .min(minimum)
    .max(maximum)
    .refine(
      (v) => new Set(v).size === v.length && v.join("\0") === [...v].sort().join("\0"),
    );
const proposedTime = flightTimeInputSchema;
const proposedEndpoint = z.strictObject({
  time: proposedTime,
  location: z.strictObject({
    authored_label: text(500).nullable(),
    authored_text: text(5000).nullable(),
    accepted_place_id: uuid.nullable(),
  }),
});
const field = <T extends z.ZodType>(value: T) =>
  z.strictObject({
    proposed_value: value,
    input_ids: uuidSet(1, 64),
    locators: z.array(flightLocatorSchema).max(64).optional(),
    confidence: z.strictObject({ value: text(64), scale: text(64) }).optional(),
    ambiguity: z.array(text(500)).max(16).optional(),
  });
export const flightProposalSchema = z
  .strictObject({
    fields: z.strictObject({
      transport_subtype: field(z.literal("FLIGHT")).optional(),
      title: field(text(200)).optional(),
      origin: field(proposedEndpoint).optional(),
      destination: field(proposedEndpoint).optional(),
      services: field(flightServicesSchema).optional(),
    }),
  })
  .refine(
    (v) => new TextEncoder().encode(canonicalEventJson(v as Json)).byteLength <= 262144,
  );
// Exact physical server columns. Scope and cross-row authority are repository guards.
export const tripImportCatalogSchemas = {
  trip_sources: z.strictObject({
    id: uuid,
    trip_id: uuid,
    acquired_by: uuid,
    acquisition_key: key,
    acquisition_sha256: hash.nullable(),
    source_kind: z.enum(["FILE", "IMAGE", "TEXT", "URL", "EMAIL"]),
    acquisition_channel: z.enum([
      "COPY",
      "FILE",
      "FILES",
      "IMAGE",
      "CAMERA",
      "PHOTOS",
      "FILES",
      "TEXT",
      "PASTE",
      "URL",
      "URL_CAPTURE",
      "EMAIL",
      "EMAIL_INPUT",
    ]),
    captured_at: time.nullable(),
    capture_time_basis: z.enum(["OBSERVED", "SUPPLIED", "UNKNOWN"]),
    created_at: time,
    access_mode: z.literal("OWNER_PRIVATE"),
    lifecycle: z.enum(["ACTIVE", "DELETED"]),
    current_material_revision: revision,
    row_revision: revision,
    retention_state: z.enum(["RETAINED", "IDENTITY_ONLY"]),
    deleted_at: time.nullable(),
    deleted_by: uuid.nullable(),
  }),
  trip_source_revisions: z.strictObject({
    source_id: uuid,
    material_revision: revision,
    previous_revision: revision.nullable(),
    created_at: time,
    created_by: uuid,
    operation_key: key,
    capture_sha256: hash.nullable(),
    original_representation_ids: uuidSet(1, 64),
    completeness: z.enum(["AS_SUPPLIED", "PARTIAL_CAPTURE"]),
    reason: z.enum([
      "ACQUISITION",
      "REPLACEMENT",
      "REFRESH",
      "ADD_PART",
      "SAVED_TEXT_EDIT",
      "AUTHORIZED_COPY",
    ]),
    origin_source_id: uuid.nullable(),
    origin_material_revision: revision.nullable(),
    retention_state: z.enum(["RETAINED", "IDENTITY_ONLY"]),
  }),
  trip_source_representations: z.strictObject({
    id: uuid,
    row_revision: revision,
    source_id: uuid,
    introduced_revision: revision,
    role: z.enum(["ORIGINAL", "DERIVED"]),
    material_kind: z.enum(["BINARY", "TEXT", "LOCATOR"]),
    original_filename: text(255).nullable(),
    part_key: text(128).nullable(),
    mime_type: text(256).nullable(),
    encoding: text(256).nullable(),
    payload_sha256: hash.nullable(),
    byte_count: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
    text_content: text(262144)
      .refine((v) => new TextEncoder().encode(v).byteLength <= 262144)
      .nullable(),
    locator_uri: text(4096).nullable(),
    parent_ids: uuidSet(0, 16),
    transform_key: text(128).nullable(),
    transform_version: text(128).nullable(),
    transform_options_sha256: hash.nullable(),
    regenerability: z.enum(["NOT_APPLICABLE", "POSSIBLE", "IMPOSSIBLE"]),
    created_at: time,
    storage_provider: text(256).nullable(),
    storage_bucket: text(256).nullable(),
    object_key: text(256).nullable(),
    remote_state: z.enum(["PENDING", "VERIFIED", "LOST", "PURGED", "NOT_APPLICABLE"]),
    verified_at: time.nullable(),
    retention_state: z.enum([
      "RETAINED",
      "PURGE_PENDING",
      "PAYLOAD_PURGED",
      "IDENTITY_ONLY",
    ]),
  }),
  trip_source_runs: z.strictObject({
    id: uuid,
    row_revision: revision,
    trip_id: uuid,
    actor_account_id: uuid,
    operation_key: key,
    scope_source_ids: uuidSet(1, 64),
    scope_sha256: hash,
    generation: revision,
    input_sha256: hash,
    extractor_key: text(128),
    extractor_version: text(128),
    extractor_options_sha256: hash,
    state: z.enum(["READY", "FAILED"]),
    superseded_by: uuid.nullable(),
    created_at: time,
    completed_at: time.nullable(),
    error_code: z
      .enum(["SOURCE_FAILURE", "UNSUPPORTED_INPUT", "EXTRACTOR_FAILURE", "CANCELED"])
      .nullable(),
    retention_state: z.enum(["RETAINED", "IDENTITY_ONLY"]),
  }),
  trip_source_inputs: z.strictObject({
    id: uuid,
    run_id: uuid.nullable(),
    confirmation_id: uuid.nullable(),
    source_id: uuid,
    material_revision: revision,
    representation_id: uuid,
    payload_sha256: hash.nullable(),
    byte_count: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
    observed_source_row_revision: revision,
    historical_selection: z.boolean(),
  }),
  trip_source_candidates: z.strictObject({
    id: uuid,
    run_id: uuid,
    candidate_key: key,
    candidate_kind: z.enum([
      "TRANSPORT",
      "STAY",
      "ACTIVITY",
      "NOTE",
      "OPTIONAL_POI",
      "UNCLASSIFIED",
    ]),
    proposal_version: z.literal(1),
    proposal_sha256: hash,
    proposal: flightProposalSchema.nullable(),
    created_at: time,
    retention_state: z.enum(["RETAINED", "IDENTITY_ONLY"]),
  }),
  trip_source_confirmations: z.strictObject({
    id: uuid,
    trip_id: uuid,
    actor_account_id: uuid,
    confirmation_key: key,
    intent_version: z.literal(1),
    intent_sha256: hash,
    created_at: time,
    state: z.enum(["PREPARED", "PROCESSING", "PARTIAL", "COMPLETE", "STOPPED"]),
    row_revision: revision,
    retention_state: z.enum(["RETAINED", "IDENTITY_ONLY"]),
  }),
  trip_source_output_slots: z.strictObject({
    confirmation_id: uuid,
    slot_id: uuid,
    slot_key: key,
    disposition: z.enum(["CREATE", "UPDATE", "LINK_ONLY", "REJECT", "DEFER"]),
    reviewed_run_id: uuid.nullable(),
    candidate_id: uuid.nullable(),
    intended_target_kind: z.enum(["ITINERARY_EVENT", "ITINERARY_RESERVATION"]).nullable(),
    intended_target_id: uuid.nullable(),
    base_revision: revision.nullable(),
    adapter_key: z
      .enum(["itinerary-event-v1", "itinerary-reservation-evidence-v1"])
      .nullable(),
    adapter_version: z.literal(1).nullable(),
    domain_operation_key: key.nullable(),
    domain_intent_sha256: hash.nullable(),
    reviewed_payload: flightReviewSchema.nullable(),
    support_version: z.literal(1),
    support_payload: flightSupportSchema.nullable(),
    state: z.enum([
      "PREPARED",
      "OUTCOME_UNKNOWN",
      "DOMAIN_SUCCEEDED",
      "EVIDENCE_PENDING",
      "FINALIZED",
      "REJECTED",
      "DEFERRED",
      "CONFLICTED",
      "FAILED",
      "CANCELED",
    ]),
    dispatched_at: time.nullable(),
    receipt_ref: text(512).nullable(),
    result_target_kind: z.enum(["ITINERARY_EVENT", "ITINERARY_RESERVATION"]).nullable(),
    result_target_id: uuid.nullable(),
    result_revision: revision.nullable(),
    receipt_sha256: hash.nullable(),
    finalization_state: z.enum(["NONE", "PENDING", "COMPLETE", "BLOCKED"]),
    failure_code: z
      .enum([
        "INPUT_STALE",
        "FORBIDDEN",
        "DOMAIN_CONFLICT",
        "DOMAIN_REJECTED",
        "RECEIPT_UNAVAILABLE",
        "EVIDENCE_FINALIZE_FAILED",
        "OUTCOME_UNKNOWN",
      ])
      .nullable(),
    retention_state: z.enum(["RETAINED", "IDENTITY_ONLY"]),
    create_claim_active: z.boolean(),
    no_commit_basis: z
      .enum(["UNDISPATCHED_REVOKED", "VERIFIED_TERMINAL_RECEIPT"])
      .nullable(),
    no_commit_receipt_ref: text(512).nullable(),
    no_commit_receipt_sha256: hash.nullable(),
    no_commit_at: time.nullable(),
  }),
  trip_source_associations: z.strictObject({
    id: uuid,
    source_id: uuid,
    target_kind: z.enum(["ITINERARY_EVENT", "ITINERARY_RESERVATION"]),
    target_id: uuid,
    purpose: z.enum(["ATTACHED_EVIDENCE", "CONFIRMED_SUPPORT"]),
    state: z.enum(["ACTIVE", "INACTIVE"]),
    row_revision: revision,
    created_by: uuid,
    created_at: time,
    confirmation_id: uuid.nullable(),
    preview_input_id: uuid.nullable(),
    preview_source_revision: revision.nullable(),
    preview_representation_id: uuid.nullable(),
    inactive_reason: z.enum(["UNLINK", "SOURCE_DELETE", "TARGET_DELETE"]).nullable(),
    inactive_at: time.nullable(),
    inactive_by: uuid.nullable(),
  }),
  trip_source_run_predecessors: z.strictObject({
    child_run_id: uuid,
    parent_run_id: uuid,
    relation: z.enum(["REPROCESS", "CONSOLIDATE"]),
  }),
  trip_source_candidate_lineage: z.strictObject({
    child_candidate_id: uuid,
    parent_candidate_id: uuid,
    relation: z.enum(["REPROCESS", "CONSOLIDATE"]),
  }),
  trip_source_slot_lineage_dispositions: z.strictObject({
    slot_id: uuid,
    ancestor_candidate_id: uuid,
    ancestor_slot_key: key,
    relation: z.enum(["CONTINUE", "MERGE_CONTINUE", "DISTINCT_OUTPUT"]),
    review_reason: text(500),
    reviewed_by: uuid,
    reviewed_at: time,
  }),
  trip_source_slot_dependencies: z.strictObject({
    slot_id: uuid,
    predecessor_slot_id: uuid,
    dependency_kind: z.literal("RECEIPT_SUCCESS"),
    expected_receipt_sha256: hash,
    expected_target_id: uuid,
    expected_result_revision: revision,
  }),
} as const;
export type TripImportCatalogName = keyof typeof tripImportCatalogSchemas;
export const tripImportSnapshotSchema = z.strictObject({
  version: z.literal(1),
  trip_id: uuid,
  actor_account_id: uuid,
  ...Object.fromEntries(
    Object.entries(tripImportCatalogSchemas).map(([name, schema]) => [
      name,
      z.array(schema).max(64),
    ]),
  ),
});
