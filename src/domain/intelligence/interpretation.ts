import { z } from "zod";
import { flightInputSchema, flightLocatorSchema } from "../trip/flightImportReview";

const uuid = z.uuid().regex(/^[0-9a-f-]{36}$/);
const digest = z.string().regex(/^[0-9a-f]{64}$/);
export const interpretationDescriptorSchema = z.strictObject({
  plugin_id: z.string().min(1).max(128),
  boundary_version: z.literal("otr-intelligence-v1"),
  adapter_version: z.string().min(1).max(128),
  model_version: z.string().min(1).max(128),
  configuration_sha256: digest,
  execution_location: z.enum(["DETERMINISTIC_LOCAL", "LOCAL_MODEL", "REMOTE_MODEL"]),
  capabilities: z
    .array(
      z.enum(["STRUCTURED_EXTRACTION", "BATCH_N_TO_M_EXTRACTION", "EVIDENCE_MAPPING"]),
    )
    .min(1)
    .max(3),
  modalities: z.array(z.literal("TEXT")).length(1),
  replay: z.enum(["SUPPORTED", "UNSUPPORTED", "UNKNOWN"]),
  network_required: z.boolean(),
  limits: z.strictObject({
    inputs: z.literal(64),
    items: z.literal(64),
    fields: z.literal(64),
    payload_bytes: z.literal(4194304),
  }),
  timeout: z.literal("CALLER_FENCED"),
  cancellation: z.literal("UNSUPPORTED"),
  privacy_requirement: z.literal("LOCAL_ONLY"),
});
export const interpretationBindingSchema = z.strictObject({
  request_id: uuid,
  idempotency_key: uuid,
  schema_dialect: z.literal("OTR_TYPED_V1"),
  consumer_id: z.literal("otr-import-v1"),
  contract_version: z.literal("otr-intelligence-v1"),
  account_id: uuid,
  trip_id: uuid,
  run_id: uuid,
  generation: z.number().int().positive().safe(),
  input_sha256: digest,
  schema_id: z.literal("otr.import.flight"),
  schema_version: z.literal(1),
  schema_sha256: digest,
  descriptor: interpretationDescriptorSchema,
  observed_at: z.iso.datetime(),
  observation_clock: z.literal("CALLER_OBSERVED"),
  deadline: z.iso.datetime(),
  privacy: z.literal("LOCAL_ONLY"),
  limits: z.strictObject({
    inputs: z.literal(64),
    items: z.literal(64),
    fields: z.literal(64),
    payload_bytes: z.literal(4194304),
  }),
});
export const interpretationMaterialSchema = z.strictObject({
  pin: flightInputSchema,
  media_type: z.literal("text/plain"),
  form: z.enum(["TEXT", "EMAIL_TEXT", "OCR_TEXT", "TABLE_TEXT"]),
  text: z
    .string()
    .max(262144)
    .refine((v) => !v.includes("\0") && new TextEncoder().encode(v).length <= 262144),
});
export const interpretationRequestSchema = z.strictObject({
  binding: interpretationBindingSchema,
  materials: z.array(interpretationMaterialSchema).min(1).max(64),
});
const fragment = z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
  source_id: uuid,
  representation_id: uuid,
  material_revision: z.number().int().positive().safe(),
  locator: flightLocatorSchema,
});
export const interpretationResponseSchema = z.strictObject({
  binding: interpretationBindingSchema,
  status: z.enum(["SUCCEEDED", "PARTIAL", "FAILED", "CANCELED"]),
  response_sha256: digest,
  items: z
    .array(
      z.strictObject({
        token: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
        schema_id: z.literal("otr.import.flight"),
        fields: z
          .array(
            z.strictObject({
              path: z.string().min(1).max(128),
              raw: z.string().max(5000),
              normalized: z.json(),
              fragment_ids: z.array(z.string().min(1).max(128)).min(1).max(64),
              uncertainty: z.array(z.string().min(1).max(500)).max(16),
            }),
          )
          .min(1)
          .max(64),
        deferred: z
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
              ]),
              fragment_id: z.string().min(1).max(128),
              reason: z.literal("UNSUPPORTED_DIMENSION"),
            }),
          )
          .max(64),
      }),
    )
    .max(64),
  fragments: z.array(fragment).max(8192),
  coverage: z
    .array(
      z.strictObject({
        input_id: uuid,
        status: z.enum(["PROCESSED", "FAILED", "DEFERRED"]),
        item_tokens: z.array(z.string().min(1).max(128)).max(64),
        ignored: z.array(flightLocatorSchema).max(64),
        code: z
          .enum(["UNSUPPORTED_INPUT", "LIMIT_EXCEEDED", "INPUT_INVALID", "CANCELED"])
          .nullable(),
      }),
    )
    .min(1)
    .max(64),
  unprocessed_input_ids: z.array(uuid).max(64),
  failures: z
    .array(
      z.strictObject({
        category: z.enum(["INPUT_INVALID", "LIMIT_EXCEEDED"]),
        code: z.enum(["INPUT_INVALID", "LIMIT_EXCEEDED"]),
        phase: z.literal("EXTRACTION"),
        retryability: z.literal("PERMANENT"),
        execution_certainty: z.literal("TERMINAL"),
        input_ids: z.array(uuid).min(1).max(64),
        request_id: uuid,
      }),
    )
    .max(64),
});
export type InterpretationRequest = z.infer<typeof interpretationRequestSchema>;
export type InterpretationResponse = z.infer<typeof interpretationResponseSchema>;
export type InterpretationItem = InterpretationResponse["items"][number];
export type InterpretationFragment = InterpretationResponse["fragments"][number];
// An adapter supplies observations only; installation/publication belongs to Import.
export type InterpretationPlugin = (
  request: InterpretationRequest,
) => Promise<InterpretationResponse>;
