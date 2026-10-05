import { z } from "zod";
import {
  flightEndpointSchema,
  flightServicesSchema,
  flightTimeInputSchema,
  flightServiceSchema,
  flightCommandLeaves,
  validateFlightCommand,
  type FlightValues,
} from "./flightAdmission";
import { canonicalEventJson, parseEventJson, type Json } from "./eventIntentJson";

const uuid = z.uuid().regex(/^[0-9a-f-]{36}$/);
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const key = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const families = [
  "transport_subtype",
  "title",
  "origin",
  "destination",
  "services",
] as const;
const unsupported = [
  "passengers",
  "bookings",
  "tickets",
  "seats",
  "baggage",
  "fare",
  "cabin",
] as const;
const field = z
  .string()
  .regex(
    /^(?:transport_subtype|title|origin|destination|services|ROOT\.title|(?:ORIGIN|DESTINATION)\.(?:local_date|local_time|zone_id|supplied_offset_seconds|source_instant|authored_label|authored_text|accepted_place_id)|SERVICE\.[A-Za-z0-9._:-]{1,32}\.(?:operator_namespace|operator_issuer|operator_value|operator_literal|service_number|service_literal|attribution|codeshare_operating_key))$/,
  );
const sortedUnique = <T extends z.ZodType<string>>(schema: T, minimum = 0) =>
  z
    .array(schema)
    .min(minimum)
    .max(64)
    .refine(
      (v) => new Set(v).size === v.length && v.join("\0") === [...v].sort().join("\0"),
    );
export const flightInputSchema = z.strictObject({
  id: uuid,
  source_id: uuid,
  material_revision: revision,
  representation_id: uuid,
  payload_sha256: hash,
  byte_count: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  observed_source_row_revision: revision,
  historical_selection: z.boolean(),
});
export const flightLocatorSchema = z
  .strictObject({
    input_id: uuid,
    kind: z.enum(["WHOLE", "TEXT_SPAN", "PAGE", "REGION"]),
    page: z.number().int().min(1).max(1_000_000).nullable(),
    start: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
    end: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
    region: z
      .strictObject({
        x: z.number().int().nonnegative(),
        y: z.number().int().nonnegative(),
        width: revision,
        height: revision,
        coordinate_width: revision,
        coordinate_height: revision,
      })
      .nullable(),
    excerpt: z.string().max(2000).optional(),
  })
  .superRefine((v, c) => {
    const fail = () => c.addIssue({ code: "custom", message: "INVALID_LOCATOR" });
    if (v.kind === "WHOLE" && [v.page, v.start, v.end, v.region].some((x) => x !== null))
      fail();
    if (
      v.kind === "TEXT_SPAN" &&
      (v.start === null ||
        v.end === null ||
        v.end < v.start ||
        v.page !== null ||
        v.region !== null)
    )
      fail();
    if (
      v.kind === "PAGE" &&
      (v.page === null || v.start !== null || v.end !== null || v.region !== null)
    )
      fail();
    if (
      v.kind === "REGION" &&
      (v.start !== null ||
        v.end !== null ||
        v.region === null ||
        v.region.x + v.region.width > v.region.coordinate_width ||
        v.region.y + v.region.height > v.region.coordinate_height)
    )
      fail();
  });
const valueSchema = z.union([
  z.literal("FLIGHT"),
  z.string().max(5000),
  flightEndpointSchema,
  flightServicesSchema,
  z.null(),
  z.number().int().safe(),
  z.strictObject({
    value: z.union([z.string(), z.null()]),
    precision: z.number().int().min(-1).max(6).nullable(),
  }),
]);
function validReviewValue(field: string, value: unknown): boolean {
  if (field === "transport_subtype") return value === "FLIGHT";
  if (field === "title" || field === "ROOT.title")
    return typeof value === "string" && value.trim().length > 0 && value.length <= 200;
  if (field === "origin" || field === "destination")
    return flightEndpointSchema.safeParse(value).success;
  if (field === "services") return flightServicesSchema.safeParse(value).success;
  const leaf = field.split(".").at(-1)!;
  if (field.startsWith("SERVICE.")) {
    const schema =
      flightServiceSchema.shape[leaf as keyof typeof flightServiceSchema.shape];
    return schema !== undefined && schema.safeParse(value).success;
  }
  if (leaf === "local_date")
    return flightTimeInputSchema.shape.local_date.safeParse(value).success;
  if (leaf === "local_time" || leaf === "source_instant") {
    const pair = z
      .strictObject({
        value: z.string().nullable(),
        precision: z.number().int().min(-1).max(6).nullable(),
      })
      .safeParse(value);
    if (!pair.success) return false;
    const time = {
      local_date: null,
      local_time: null,
      clock_precision: null,
      quality: "UNKNOWN",
      basis: "DERIVED_CIVIL",
      zone_id: null,
      supplied_offset_seconds: null,
      source_instant: null,
      source_instant_precision: null,
      fold_choice: null,
    };
    return flightTimeInputSchema.safeParse({
      ...time,
      [leaf]: pair.data.value,
      [leaf === "local_time" ? "clock_precision" : "source_instant_precision"]:
        pair.data.precision,
    }).success;
  }
  if (field.endsWith(".supplied_offset_seconds"))
    return (
      value === null ||
      (typeof value === "number" &&
        Number.isSafeInteger(value) &&
        Math.abs(value) <= 64800)
    );
  if (field.endsWith(".accepted_place_id"))
    return value === null || uuid.safeParse(value).success;
  return (
    value === null ||
    (typeof value === "string" &&
      value.length <=
        (field.endsWith(".authored_text")
          ? 5000
          : field.endsWith(".authored_label")
            ? 500
            : 255))
  );
}
export const flightReviewSchema = z
  .strictObject({
    schema_key: z.literal("flight-v1"),
    schema_version: z.literal(1),
    normalization_version: z.literal(1),
    match_policy: z.literal("import-flight-match-v1"),
    selected_fields: sortedUnique(field),
    edits: z.record(field, valueSchema),
    association_intents: z
      .array(z.strictObject({ input_id: uuid, purpose: z.literal("CONFIRMED_SUPPORT") }))
      .max(64),
    deferred_dimensions: z
      .array(
        z
          .strictObject({
            dimension: z.enum([...families, ...unsupported]),
            candidate_field_key: key.nullable(),
            input_id: uuid.nullable(),
            locator: flightLocatorSchema.nullable(),
            reason: z.enum([
              "UNSUPPORTED_DIMENSION",
              "UNRESOLVED_TEMPORAL",
              "UNRESOLVED_IDENTITY",
            ]),
          })
          .superRefine((v, c) => {
            if (
              v.candidate_field_key !== null
                ? v.input_id !== null || v.locator !== null
                : v.input_id === null ||
                  v.locator === null ||
                  v.locator.input_id !== v.input_id
            )
              c.addIssue({ code: "custom", message: "INVALID_DEFERRED_REFERENCE" });
            if (
              unsupported.includes(v.dimension as (typeof unsupported)[number]) &&
              v.locator?.excerpt !== undefined
            )
              c.addIssue({ code: "custom", message: "UNSUPPORTED_DIMENSION_VALUE" });
          }),
      )
      .max(64),
  })
  .superRefine((v, c) => {
    if (
      Object.keys(v.edits).some(
        (k) => !v.selected_fields.includes(k) || !validReviewValue(k, v.edits[k]),
      )
    )
      c.addIssue({ code: "custom", message: "UNSELECTED_EDIT" });
  });
export const flightSupportSchema = z.record(
  field,
  z
    .strictObject({
      origin: z.enum(["ACCEPTED_EXTRACTED", "EDITED_EXTRACTED", "USER_ENTERED"]),
      candidate_id: uuid.nullable(),
      candidate_field_key: z.enum(families).nullable(),
      input_ids: sortedUnique(uuid),
      accepted_value_ref: z.string().max(512),
      edited_value: valueSchema.nullable(),
      locators: z.array(flightLocatorSchema).max(64).optional(),
    })
    .superRefine((v, c) => {
      if (
        v.origin === "USER_ENTERED"
          ? v.candidate_id !== null ||
            v.candidate_field_key !== null ||
            v.input_ids.length !== 0 ||
            v.edited_value !== null
          : v.candidate_id === null ||
            v.candidate_field_key === null ||
            v.input_ids.length === 0 ||
            (v.origin === "ACCEPTED_EXTRACTED" && v.edited_value !== null)
      )
        c.addIssue({ code: "custom", message: "INVALID_SUPPORT_ORIGIN" });
      if (v.locators?.some((l) => !v.input_ids.includes(l.input_id)))
        c.addIssue({ code: "custom", message: "INVALID_SUPPORT_LOCATOR" });
    }),
);
export const flightSlotIntentSchema = z
  .strictObject({
    slot_id: uuid,
    slot_key: key,
    disposition: z.enum(["CREATE", "UPDATE", "REJECT", "DEFER"]),
    reviewed_run_id: uuid.nullable(),
    candidate_id: uuid.nullable(),
    intended_target_kind: z.literal("ITINERARY_EVENT").nullable(),
    intended_target_id: uuid.nullable(),
    base_revision: revision.nullable(),
    adapter_key: z.literal("itinerary-event-v1").nullable(),
    adapter_version: z.literal(1).nullable(),
    domain_operation_key: z
      .uuidv4()
      .regex(/^[0-9a-f-]{36}$/)
      .nullable(),
    domain_intent_sha256: hash.nullable(),
    reviewed_payload: flightReviewSchema.nullable(),
    support_version: z.literal(1),
    support_payload: flightSupportSchema,
  })
  .superRefine((s, c) => {
    const executable = s.disposition === "CREATE" || s.disposition === "UPDATE";
    if (
      executable
        ? [
            s.reviewed_run_id,
            s.candidate_id,
            s.intended_target_kind,
            s.intended_target_id,
            s.adapter_key,
            s.adapter_version,
            s.domain_operation_key,
            s.domain_intent_sha256,
            s.reviewed_payload,
          ].some((x) => x === null) ||
          (s.disposition === "CREATE" && s.base_revision !== null) ||
          (s.disposition === "UPDATE" && s.base_revision === null)
        : [
            s.intended_target_kind,
            s.intended_target_id,
            s.base_revision,
            s.adapter_key,
            s.adapter_version,
            s.domain_operation_key,
            s.domain_intent_sha256,
          ].some((x) => x !== null)
    )
      c.addIssue({ code: "custom", message: "INVALID_SLOT_BINDING" });
    if (
      executable &&
      s.reviewed_payload &&
      (s.reviewed_payload.selected_fields.some(
        (k) => !Object.hasOwn(s.support_payload, k),
      ) ||
        Object.keys(s.support_payload).some(
          (k) => !s.reviewed_payload!.selected_fields.includes(k),
        ))
    )
      c.addIssue({ code: "custom", message: "INCOMPLETE_SELECTED_SUPPORT" });
  });
export const flightConfirmationIntentSchema = z
  .strictObject({
    id: uuid,
    confirmation_key: key,
    intent_version: z.literal(1),
    inputs: z.array(flightInputSchema).max(64),
    slots: z.array(flightSlotIntentSchema).min(1).max(64),
    lineage_dispositions: z
      .array(
        z.strictObject({
          slot_id: uuid,
          ancestor_candidate_id: uuid,
          ancestor_slot_key: key,
          relation: z.enum(["CONTINUE", "MERGE_CONTINUE", "DISTINCT_OUTPUT"]),
          review_reason: z.string().min(1).max(500),
        }),
      )
      .max(64),
    dependencies: z
      .array(
        z.strictObject({
          slot_id: uuid,
          predecessor_slot_id: uuid,
          dependency_kind: z.literal("RECEIPT_SUCCESS"),
          expected_receipt_sha256: hash,
          expected_target_id: uuid,
          expected_result_revision: revision,
        }),
      )
      .max(64),
  })
  .superRefine((v, c) => {
    if (
      new Set(v.inputs.map((i) => i.id)).size !== v.inputs.length ||
      new Set(v.slots.map((i) => i.slot_id)).size !== v.slots.length ||
      new Set(v.slots.map((i) => i.slot_key)).size !== v.slots.length
    )
      c.addIssue({ code: "custom", message: "DUPLICATE_IMPORT_IDENTITY" });
    const inputs = new Set(v.inputs.map((i) => i.id));
    for (const s of v.slots) {
      if (
        Object.values(s.support_payload).some((p) =>
          p.input_ids.some((i) => !inputs.has(i)),
        ) ||
        s.reviewed_payload?.association_intents.some((a) => !inputs.has(a.input_id))
      )
        c.addIssue({ code: "custom", message: "INVALID_INPUT_BINDING" });
    }
  });
export type FlightConfirmationIntent = z.infer<typeof flightConfirmationIntentSchema>;
export type ImportHash = (bytes: Uint8Array) => Promise<string>;
export async function importDigest(prefix: string, value: Json, sha256: ImportHash) {
  return hash.parse(
    await sha256(new TextEncoder().encode(prefix + "\n" + canonicalEventJson(value))),
  );
}
export function parseFlightConfirmation(raw: string) {
  return flightConfirmationIntentSchema.parse(parseEventJson(raw, 4_194_304));
}

// Resolve every immutable selection before looking at the submitted command.
// Composite endpoint/service selections use the same finite leaf grammar as B.
export function resolveReviewedFlightSelection(
  slot: FlightConfirmationIntent["slots"][number],
  fields: Record<string, { proposed_value: Json }>,
) {
  const review = slot.reviewed_payload;
  if (!review) throw new Error("INVALID_PROVENANCE");
  const leaves: Record<string, Json> = {},
    required = new Set<string>();
  const components: Record<string, Json> = {};
  for (const field of review.selected_fields) {
    const support = slot.support_payload[field];
    if (!support) throw new Error("INVALID_PROVENANCE");
    const container = support.candidate_field_key;
    const source =
      support.origin === "USER_ENTERED"
        ? review.edits[field]
        : support.origin === "ACCEPTED_EXTRACTED"
          ? fields[container!]?.proposed_value
          : review.edits[container!];
    if (source === undefined) throw new Error("INVALID_PROVENANCE");
    let value: Json;
    if (support.origin === "USER_ENTERED" || field === container) value = source as Json;
    else
      value = flightCommandLeaves({ [container!]: source } as FlightValues, true)[field];
    if (value === undefined || !validReviewValue(field, value))
      throw new Error("INVALID_PROVENANCE");
    if (field === "transport_subtype") {
      if (value !== "FLIGHT") throw new Error("INVALID_PROVENANCE");
      continue;
    }
    const composite = ["title", "origin", "destination", "services"].includes(field);
    const expanded = composite
      ? flightCommandLeaves({ [field]: value } as FlightValues, true)
      : { [field]: value };
    if (composite) components[field] = value;
    for (const [leaf, v] of Object.entries(expanded)) {
      if (Object.hasOwn(leaves, leaf)) throw new Error("INVALID_PROVENANCE");
      leaves[leaf] = v;
      if (
        !composite ||
        (v !== null && !(typeof v === "object" && !Array.isArray(v) && v.value === null))
      )
        required.add(leaf);
    }
  }
  return { leaves, required, components };
}
export function validateReviewedFlightCommand(
  slot: FlightConfirmationIntent["slots"][number],
  fields: Record<string, { proposed_value: Json }>,
  command: "CREATE_TRANSPORT" | "UPDATE_TRANSPORT",
  payload: unknown,
) {
  const expected = resolveReviewedFlightSelection(slot, fields);
  const actual = validateFlightCommand(command, payload);
  const equal = (a: unknown, b: unknown) =>
    a !== undefined &&
    b !== undefined &&
    canonicalEventJson(a as Json) === canonicalEventJson(b as Json);
  if (
    Object.entries(expected.components).some(
      ([k, v]) => !equal(v, actual.values[k as keyof FlightValues]),
    ) ||
    [...expected.required].some((k) => !Object.hasOwn(actual.leaves, k)) ||
    Object.entries(actual.leaves).some(([k, v]) => !equal(v, expected.leaves[k])) ||
    Object.keys(flightCommandLeaves(actual.values)).some(
      (k) => !Object.hasOwn(expected.leaves, k),
    )
  )
    throw new Error("INVALID_PROVENANCE");
  // A changed TRACK_C fact must use this selection's slot. B subsequently verifies
  // unchanged RETAINED refs against the actual current canonical target.
  for (const [k, p] of Object.entries(actual.payload.proofs))
    if (p.kind === "TRACK_C" && p.ref !== `track-c/field-evidence/${slot.slot_id}/${k}`)
      throw new Error("INVALID_PROVENANCE");
  return actual;
}
