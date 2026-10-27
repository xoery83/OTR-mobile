import { z } from "zod";
import { ordinaryNodeSchema, ordinaryGapSchema } from "./tripCoreOrdinaryOrder";
import { canonicalCoreJson, parseCoreJson, type Json } from "./tripCoreV2Json";
import { coreBoundarySchema } from "./tripCoreV2Temporal";
import { validateCalendarDate } from "./dayReadModel";
export const CORE_V2 = 2 as const;
export const coreUuid = z.uuid().regex(/^[0-9a-f-]{36}$/);
export const coreRevision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const coreHash = z.string().regex(/^[0-9a-f]{64}$/);
export const coreText = (n: number) =>
  z
    .string()
    .refine(
      (v) =>
        Array.from(v).length <= n &&
        !v.includes("\0") &&
        !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
          v,
        ),
    );
const date = z.string().refine((v) => {
  try {
    return validateCalendarDate(v) === v;
  } catch {
    return false;
  }
});
const instant = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/);
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/);
export const coreHttps = coreText(2048).refine((v) => {
  try {
    const u = new URL(v);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.hash &&
      ![...u.searchParams.keys()].some((k) =>
        /token|secret|password|credential|key/i.test(k),
      )
    );
  } catch {
    return false;
  }
});
const proofMap = z
  .record(coreText(128), coreText(512))
  .refine((v) => Object.keys(v).length <= 256);
const fieldState = z.strictObject({
  state: z.enum(["KNOWN", "UNKNOWN", "CLEARED"]),
  origin: z.enum(["MANUAL", "SOURCE", "PROVIDER", "DERIVED"]),
  protected: z.boolean(),
  changed_revision: coreRevision,
  evidence_ref: coreText(512).nullable(),
});
export const coreFieldState = z
  .record(coreText(128), fieldState)
  .refine(
    (v) =>
      Object.keys(v).length <= 256 &&
      Object.keys(v).every(isCoreFieldAddress) &&
      new TextEncoder().encode(canonicalCoreJson(v as Json)).length <= 32768,
  );
const region = z
  .strictObject({
    page: z.number().int().nonnegative(),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .refine((v) => v.x + v.width <= 1 && v.y + v.height <= 1);
const existingType = z.enum([
  "flight",
  "hotel",
  "car",
  "activity",
  "shopping",
  "meal",
  "transport",
  "note",
  "other",
]);
export const itinerary_eventsSchema = z.strictObject({
  id: coreUuid,
  trip_id: coreUuid,
  semantic_revision: coreRevision,
  owner_account_id: coreUuid,
  visibility: z.enum(["PRIVATE", "GROUP", "SELECTED_PERSONS"]),
  hidden_at: instant.nullable(),
  created_at: instant,
  updated_at: instant,
  field_state: coreFieldState,
  business_contract_version: z.literal(2),
  experience_family: z.enum(["P1", "P2", "P3", "P4", "P5", "P6"]),
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
  title: coreText(200).refine((s) => s.trim().length > 0),
  description: coreText(5000).nullable(),
  event_type: existingType,
  status: z.enum(["planned", "skipped", "completed", "cancelled"]),
  order_index: z.number().int().min(-2147483648).max(2147483647).nullable(),
  trip_day_id: coreUuid.nullable(),
  participation_mode: z.enum(["WHOLE_GROUP", "SELECTED_MEMBERS", "SELF"]),
  participant_scope: z.enum(["UNASSIGNED", "ASSIGNED", "WHOLE_GROUP"]),
  self_person_id: coreUuid.nullable(),
  activity_category: z
    .enum(["POI", "DINING", "SHOPPING", "HIKE", "APPOINTMENT", "GENERAL"])
    .nullable(),
  reservation_id: coreUuid.nullable(),
  timing_label: coreText(500).nullable(),
  start_local_date: date.nullable(),
  start_local_time: clock.nullable(),
  start_clock_precision: z.number().int().min(-1).max(6).nullable(),
  start_quality: z.enum(["UNKNOWN", "EXACT", "ESTIMATED"]).nullable(),
  start_basis: z.enum(["DERIVED_CIVIL", "SOURCE_INSTANT"]).nullable(),
  start_zone_id: coreText(128).nullable(),
  start_supplied_offset_seconds: z.number().int().min(-64800).max(64800).nullable(),
  start_source_instant: instant.nullable(),
  start_source_instant_precision: z.number().int().min(-1).max(6).nullable(),
  start_civil_resolution: z
    .enum(["PENDING", "UNIQUE", "GAP", "FOLD", "FOLD_RESOLVED"])
    .nullable(),
  start_resolution_offset_seconds: z.number().int().min(-64800).max(64800).nullable(),
  start_interpretation_key: coreText(256).nullable(),
  start_interpretation_input_sha256: coreHash.nullable(),
  start_provenance_refs: proofMap.nullable(),
  planned_start: instant.nullable(),
  end_local_date: date.nullable(),
  end_local_time: clock.nullable(),
  end_clock_precision: z.number().int().min(-1).max(6).nullable(),
  end_quality: z.enum(["UNKNOWN", "EXACT", "ESTIMATED"]).nullable(),
  end_basis: z.enum(["DERIVED_CIVIL", "SOURCE_INSTANT"]).nullable(),
  end_zone_id: coreText(128).nullable(),
  end_supplied_offset_seconds: z.number().int().min(-64800).max(64800).nullable(),
  end_source_instant: instant.nullable(),
  end_source_instant_precision: z.number().int().min(-1).max(6).nullable(),
  end_civil_resolution: z
    .enum(["PENDING", "UNIQUE", "GAP", "FOLD", "FOLD_RESOLVED"])
    .nullable(),
  end_resolution_offset_seconds: z.number().int().min(-64800).max(64800).nullable(),
  end_interpretation_key: coreText(256).nullable(),
  end_interpretation_input_sha256: coreHash.nullable(),
  end_provenance_refs: proofMap.nullable(),
  planned_end: instant.nullable(),
  authored_label: coreText(500).nullable(),
  authored_text: coreText(5000).nullable(),
  authored_address: coreText(2000).nullable(),
  accepted_address: coreText(2000).nullable(),
  accepted_latitude: z.number().finite().min(-90).max(90).nullable(),
  accepted_longitude: z.number().finite().min(-180).max(180).nullable(),
  accepted_place_id: coreUuid.nullable(),
  spatial_provenance_refs: proofMap.nullable(),
  location_input_revision: coreRevision.nullable(),
  authored_address_line1: coreText(500).nullable(),
  authored_address_line2: coreText(500).nullable(),
  authored_address_locality: coreText(200).nullable(),
  authored_address_region: coreText(200).nullable(),
  authored_address_postal_code: coreText(64).nullable(),
  authored_address_country: coreText(128).nullable(),
  accepted_address_line1: coreText(500).nullable(),
  accepted_address_line2: coreText(500).nullable(),
  accepted_address_locality: coreText(200).nullable(),
  accepted_address_region: coreText(200).nullable(),
  accepted_address_postal_code: coreText(64).nullable(),
  accepted_address_country: coreText(128).nullable(),
});
export const itinerary_transport_endpointsSchema = z.strictObject({
  event_id: coreUuid,
  trip_id: coreUuid,
  role: z.enum(["ORIGIN", "DESTINATION"]),
  local_date: date.nullable(),
  local_time: clock.nullable(),
  clock_precision: z.number().int().min(-1).max(6).nullable(),
  quality: z.enum(["UNKNOWN", "EXACT", "ESTIMATED"]).nullable(),
  basis: z.enum(["DERIVED_CIVIL", "SOURCE_INSTANT"]).nullable(),
  zone_id: coreText(128).nullable(),
  supplied_offset_seconds: z.number().int().min(-64800).max(64800).nullable(),
  source_instant: instant.nullable(),
  source_instant_precision: z.number().int().min(-1).max(6).nullable(),
  civil_resolution: z
    .enum(["PENDING", "UNIQUE", "GAP", "FOLD", "FOLD_RESOLVED"])
    .nullable(),
  resolution_offset_seconds: z.number().int().min(-64800).max(64800).nullable(),
  interpretation_key: coreText(256).nullable(),
  interpretation_input_sha256: coreHash.nullable(),
  provenance_refs: proofMap.nullable(),
  instant: instant.nullable(),
  authored_label: coreText(500).nullable(),
  authored_text: coreText(5000).nullable(),
  authored_address: coreText(2000).nullable(),
  accepted_address: coreText(2000).nullable(),
  accepted_latitude: z.number().finite().min(-90).max(90).nullable(),
  accepted_longitude: z.number().finite().min(-180).max(180).nullable(),
  accepted_place_id: coreUuid.nullable(),
  spatial_provenance_refs: proofMap.nullable(),
  location_input_revision: coreRevision.nullable(),
  authored_address_line1: coreText(500).nullable(),
  authored_address_line2: coreText(500).nullable(),
  authored_address_locality: coreText(200).nullable(),
  authored_address_region: coreText(200).nullable(),
  authored_address_postal_code: coreText(64).nullable(),
  authored_address_country: coreText(128).nullable(),
  accepted_address_line1: coreText(500).nullable(),
  accepted_address_line2: coreText(500).nullable(),
  accepted_address_locality: coreText(200).nullable(),
  accepted_address_region: coreText(200).nullable(),
  accepted_address_postal_code: coreText(64).nullable(),
  accepted_address_country: coreText(128).nullable(),
});
export const trip_endpoint_detailsSchema = z.strictObject({
  airport_code: coreText(8).nullable(),
  terminal: coreText(128).nullable(),
  platform: coreText(128).nullable(),
  pier: coreText(128).nullable(),
  event_id: coreUuid,
  trip_id: coreUuid,
  role: z.enum(["ORIGIN", "DESTINATION"]),
});
export const trip_flight_intentsSchema = z.strictObject({
  event_id: coreUuid,
  trip_id: coreUuid,
  flight_number_literal: coreText(255),
  qualification: z.enum(["SPARSE", "QUALIFIED"]),
});
// Local journal graph only; accepted collections keep trip_flight_intentsSchema strict.
export const localFlightIntentSchema = z.union([
  trip_flight_intentsSchema,
  z.strictObject({
    event_id: coreUuid,
    trip_id: coreUuid,
    flight_number_literal: coreText(255)
      .refine((v) => !!v.trim())
      .nullable(),
    qualification: z.literal("BOOKING_EVIDENCED_ROUTE_TIME"),
    qualification_basis: z.literal("BOOKING_EVIDENCED_ROUTE_TIME_LOCAL/1"),
  }),
]);
export const itinerary_transport_servicesSchema = z.strictObject({
  event_id: coreUuid,
  trip_id: coreUuid,
  service_key: z.string().regex(/^[A-Za-z0-9._:-]{1,32}$/),
  transport_subtype: z.enum([
    "FLIGHT",
    "TRAIN",
    "BUS",
    "FERRY",
    "WATER_TAXI",
    "SHUTTLE",
    "TRANSFER",
  ]),
  attribution: z.enum(["MARKETING", "OPERATING", "UNSPECIFIED"]),
  operator_namespace: z.enum(["IATA_AIRLINE", "ICAO_AIRLINE", "AUTHORITY", "NAME"]),
  operator_issuer: coreText(128),
  operator_value: coreText(128),
  operator_literal: coreText(255),
  service_number: coreText(64),
  service_literal: coreText(255),
  codeshare_operating_key: z
    .string()
    .regex(/^[A-Za-z0-9._:-]{1,32}$/)
    .nullable(),
});
export const trip_stay_detailsSchema = z.strictObject({
  event_id: coreUuid,
  trip_id: coreUuid,
  property_name: coreText(500).nullable(),
  permitted_checkin_from: clock.nullable(),
  permitted_checkin_until: clock.nullable(),
  permitted_checkout_by: clock.nullable(),
});
export const trip_stay_roomsSchema = z.strictObject({
  event_id: coreUuid,
  trip_id: coreUuid,
  room_id: coreUuid,
  category: coreText(500).nullable(),
  quantity: z.number().int().min(1).max(2147483647).nullable(),
  capacity: z.number().int().min(1).max(2147483647).nullable(),
});
export const trip_rental_detailsSchema = z.strictObject({
  event_id: coreUuid,
  trip_id: coreUuid,
  supplier: coreText(500).nullable(),
  reserved_category: coreText(500).nullable(),
  or_similar: z.boolean().nullable(),
  actual_vehicle_model: coreText(500).nullable(),
  verified_plate: coreText(64).nullable(),
});
export const trip_activity_detailsSchema = z.strictObject({
  event_id: coreUuid,
  trip_id: coreUuid,
  session_label: coreText(500).nullable(),
  admission_note: coreText(2000).nullable(),
});
export const trip_rental_placesSchema = z.strictObject({
  event_id: coreUuid,
  trip_id: coreUuid,
  role: z.enum(["PICKUP", "RETURN"]),
  authored_label: coreText(500).nullable(),
  authored_text: coreText(5000).nullable(),
  authored_address: coreText(2000).nullable(),
  accepted_address: coreText(2000).nullable(),
  accepted_latitude: z.number().finite().min(-90).max(90).nullable(),
  accepted_longitude: z.number().finite().min(-180).max(180).nullable(),
  accepted_place_id: coreUuid.nullable(),
  spatial_provenance_refs: proofMap.nullable(),
  location_input_revision: coreRevision.nullable(),
  authored_address_line1: coreText(500).nullable(),
  authored_address_line2: coreText(500).nullable(),
  authored_address_locality: coreText(200).nullable(),
  authored_address_region: coreText(200).nullable(),
  authored_address_postal_code: coreText(64).nullable(),
  authored_address_country: coreText(128).nullable(),
  accepted_address_line1: coreText(500).nullable(),
  accepted_address_line2: coreText(500).nullable(),
  accepted_address_locality: coreText(200).nullable(),
  accepted_address_region: coreText(200).nullable(),
  accepted_address_postal_code: coreText(64).nullable(),
  accepted_address_country: coreText(128).nullable(),
});
export const trip_activity_entry_placesSchema = z.strictObject({
  event_id: coreUuid,
  trip_id: coreUuid,
  role: z.literal("ENTRY"),
  authored_label: coreText(500).nullable(),
  authored_text: coreText(5000).nullable(),
  authored_address: coreText(2000).nullable(),
  accepted_address: coreText(2000).nullable(),
  accepted_latitude: z.number().finite().min(-90).max(90).nullable(),
  accepted_longitude: z.number().finite().min(-180).max(180).nullable(),
  accepted_place_id: coreUuid.nullable(),
  spatial_provenance_refs: proofMap.nullable(),
  location_input_revision: coreRevision.nullable(),
  authored_address_line1: coreText(500).nullable(),
  authored_address_line2: coreText(500).nullable(),
  authored_address_locality: coreText(200).nullable(),
  authored_address_region: coreText(200).nullable(),
  authored_address_postal_code: coreText(64).nullable(),
  authored_address_country: coreText(128).nullable(),
  accepted_address_line1: coreText(500).nullable(),
  accepted_address_line2: coreText(500).nullable(),
  accepted_address_locality: coreText(200).nullable(),
  accepted_address_region: coreText(200).nullable(),
  accepted_address_postal_code: coreText(64).nullable(),
  accepted_address_country: coreText(128).nullable(),
});
export const trip_transport_operational_factsSchema = z.strictObject({
  event_id: coreUuid,
  trip_id: coreUuid,
  role: z.enum(["MEETING", "CHECKIN", "BOARDING_CUTOFF"]),
  authored_label: coreText(500).nullable(),
  authored_text: coreText(5000).nullable(),
  authored_address: coreText(2000).nullable(),
  accepted_address: coreText(2000).nullable(),
  accepted_latitude: z.number().finite().min(-90).max(90).nullable(),
  accepted_longitude: z.number().finite().min(-180).max(180).nullable(),
  accepted_place_id: coreUuid.nullable(),
  spatial_provenance_refs: proofMap.nullable(),
  location_input_revision: coreRevision.nullable(),
  authored_address_line1: coreText(500).nullable(),
  authored_address_line2: coreText(500).nullable(),
  authored_address_locality: coreText(200).nullable(),
  authored_address_region: coreText(200).nullable(),
  authored_address_postal_code: coreText(64).nullable(),
  authored_address_country: coreText(128).nullable(),
  accepted_address_line1: coreText(500).nullable(),
  accepted_address_line2: coreText(500).nullable(),
  accepted_address_locality: coreText(200).nullable(),
  accepted_address_region: coreText(200).nullable(),
  accepted_address_postal_code: coreText(64).nullable(),
  accepted_address_country: coreText(128).nullable(),
  local_date: date.nullable(),
  local_time: clock.nullable(),
  clock_precision: z.number().int().min(-1).max(6).nullable(),
  quality: z.enum(["UNKNOWN", "EXACT", "ESTIMATED"]).nullable(),
  basis: z.enum(["DERIVED_CIVIL", "SOURCE_INSTANT"]).nullable(),
  zone_id: coreText(128).nullable(),
  supplied_offset_seconds: z.number().int().min(-64800).max(64800).nullable(),
  source_instant: instant.nullable(),
  source_instant_precision: z.number().int().min(-1).max(6).nullable(),
  civil_resolution: z
    .enum(["PENDING", "UNIQUE", "GAP", "FOLD", "FOLD_RESOLVED"])
    .nullable(),
  resolution_offset_seconds: z.number().int().min(-64800).max(64800).nullable(),
  interpretation_key: coreText(256).nullable(),
  interpretation_input_sha256: coreHash.nullable(),
  provenance_refs: proofMap.nullable(),
  instant: instant.nullable(),
});
export const itinerary_reservationsSchema = z.strictObject({
  id: coreUuid,
  trip_id: coreUuid,
  revision: coreRevision,
  owner_account_id: coreUuid,
  visibility: z.enum(["PRIVATE", "GROUP", "SELECTED_PERSONS"]),
  hidden_at: instant.nullable(),
  created_at: instant,
  updated_at: instant,
  field_state: coreFieldState,
  business_contract_version: z.literal(2),
  title: coreText(200).refine((s) => s.trim().length > 0),
  provider: coreText(500).nullable(),
  confirmation_code: coreText(255).nullable(),
  contact: coreText(1000).nullable(),
  booking_url: coreHttps.nullable(),
  commercial_status: z.enum(["ACTIVE", "CANCELLED", "REPLACED"]),
  replaces_booking_id: coreUuid.nullable(),
  supplier_observation: coreText(2000).nullable(),
  price_minor: z
    .number()
    .int()
    .min(-Number.MAX_SAFE_INTEGER)
    .max(Number.MAX_SAFE_INTEGER)
    .nullable(),
  price_currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  price_scale: z.number().int().min(0).max(6).nullable(),
  due_minor: z
    .number()
    .int()
    .min(-Number.MAX_SAFE_INTEGER)
    .max(Number.MAX_SAFE_INTEGER)
    .nullable(),
  due_currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  due_scale: z.number().int().min(0).max(6).nullable(),
});
export const trip_booking_observationsSchema = z.strictObject({
  holder_label: coreText(500).nullable(),
  observed_start: coreText(500).nullable(),
  observed_end: coreText(500).nullable(),
  source_summary: coreText(5000).nullable(),
  trip_id: coreUuid,
  booking_id: coreUuid,
  observation_id: coreUuid,
  evidence_ref: coreText(512).nullable(),
});
export const trip_entitlementsSchema = z.strictObject({
  id: coreUuid,
  trip_id: coreUuid,
  revision: coreRevision,
  owner_account_id: coreUuid,
  visibility: z.enum(["PRIVATE", "GROUP", "SELECTED_PERSONS"]),
  hidden_at: instant.nullable(),
  created_at: instant,
  updated_at: instant,
  field_state: coreFieldState,
  kind: z.enum(["TICKET", "PASS", "BOARDING_PASS", "RESERVATION_RIGHT"]),
  title: coreText(200).refine((s) => s.trim().length > 0),
  issuer: coreText(500).nullable(),
  reference: coreText(255).nullable(),
  quantity: z.number().int().min(1).max(2147483647).nullable(),
  holder_label: coreText(500).nullable(),
  status: z.enum(["ACTIVE", "CANCELLED", "EXPIRED"]),
  access_class: z.enum([
    "STATIC_ORIGINAL",
    "CONFIRMATION_ONLY",
    "APPLE_WALLET",
    "EXTERNAL_DYNAMIC",
    "UNKNOWN",
  ]),
  provider_url: coreHttps.nullable(),
  valid_from_date: date.nullable(),
  valid_until_date: date.nullable(),
  valid_from_instant: instant.nullable(),
  valid_until_instant: instant.nullable(),
  validity_zone_id: coreText(128).nullable(),
  validity_precision: z.enum(["DATE", "INSTANT"]).nullable(),
});
export const trip_operational_documentsSchema = z.strictObject({
  id: coreUuid,
  trip_id: coreUuid,
  revision: coreRevision,
  owner_account_id: coreUuid,
  visibility: z.enum(["PRIVATE", "GROUP", "SELECTED_PERSONS"]),
  hidden_at: instant.nullable(),
  created_at: instant,
  updated_at: instant,
  field_state: coreFieldState,
  title: coreText(200).refine((s) => s.trim().length > 0),
  media_type: z.enum([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/heic",
    "image/heif",
    "image/webp",
    "text/plain",
    "application/vnd.apple.pkpass",
  ]),
  byte_size: z.number().int().min(0).max(2147483647),
  sha256: coreHash,
  custody: z.enum(["PRIVATE_SOURCE_REFERENCE", "AUTHORIZED_COPY"]),
  source_representation_id: coreUuid.nullable(),
  storage_object_key: coreText(1024).nullable(),
  content_version: z.number().int().min(1).max(2147483647),
  ticket_face_index: z.number().int().min(0).max(2147483647).nullable(),
  qr_region: region.nullable(),
  custody_receipt_id: coreUuid,
});
export const trip_instruction_entriesSchema = z.strictObject({
  id: coreUuid,
  trip_id: coreUuid,
  revision: coreRevision,
  owner_account_id: coreUuid,
  visibility: z.enum(["PRIVATE", "GROUP", "SELECTED_PERSONS"]),
  hidden_at: instant.nullable(),
  created_at: instant,
  updated_at: instant,
  field_state: coreFieldState,
  event_id: coreUuid,
  section: z.enum([
    "ARRIVAL",
    "DURING",
    "DEPARTURE",
    "PICKUP",
    "RETURN",
    "TRANSPORT",
    "ENTRY",
  ]),
  body: coreText(5000),
  sensitivity: z.enum(["NORMAL", "SENSITIVE"]),
  supersedes_id: coreUuid.nullable(),
  source_representation_id: coreUuid.nullable(),
});
export const trip_booking_item_linksSchema = z.strictObject({
  trip_id: coreUuid,
  booking_id: coreUuid,
  item_id: coreUuid,
  active: z.boolean(),
  linked_by: coreUuid,
  linked_at: instant,
});
export const trip_entitlement_item_linksSchema = z.strictObject({
  trip_id: coreUuid,
  entitlement_id: coreUuid,
  item_id: coreUuid,
  active: z.boolean(),
  linked_by: coreUuid,
  linked_at: instant,
  coach: coreText(128).nullable(),
  seat: coreText(128).nullable(),
  section: coreText(128).nullable(),
  cabin: coreText(128).nullable(),
  fare_class: coreText(128).nullable(),
  baggage_allowance: coreText(500).nullable(),
});
export const trip_booking_entitlement_linksSchema = z.strictObject({
  trip_id: coreUuid,
  booking_id: coreUuid,
  entitlement_id: coreUuid,
  active: z.boolean(),
  linked_by: coreUuid,
  linked_at: instant,
});
export const trip_booking_document_linksSchema = z.strictObject({
  trip_id: coreUuid,
  booking_id: coreUuid,
  document_id: coreUuid,
  active: z.boolean(),
  linked_by: coreUuid,
  linked_at: instant,
});
export const trip_entitlement_document_linksSchema = z.strictObject({
  trip_id: coreUuid,
  entitlement_id: coreUuid,
  document_id: coreUuid,
  active: z.boolean(),
  linked_by: coreUuid,
  linked_at: instant,
});
export const trip_item_document_linksSchema = z.strictObject({
  trip_id: coreUuid,
  item_id: coreUuid,
  document_id: coreUuid,
  active: z.boolean(),
  linked_by: coreUuid,
  linked_at: instant,
});
export const trip_item_participantsSchema = z.strictObject({
  trip_id: coreUuid,
  item_id: coreUuid,
  person_id: coreUuid,
  active: z.boolean(),
});
export const trip_entitlement_holdersSchema = z.strictObject({
  trip_id: coreUuid,
  entitlement_id: coreUuid,
  person_id: coreUuid,
  active: z.boolean(),
});
export const trip_item_visibility_peopleSchema = z.strictObject({
  trip_id: coreUuid,
  item_id: coreUuid,
  person_id: coreUuid,
});
export const trip_booking_visibility_peopleSchema = z.strictObject({
  trip_id: coreUuid,
  booking_id: coreUuid,
  person_id: coreUuid,
});
export const trip_entitlement_visibility_peopleSchema = z.strictObject({
  trip_id: coreUuid,
  entitlement_id: coreUuid,
  person_id: coreUuid,
});
export const trip_document_visibility_peopleSchema = z.strictObject({
  trip_id: coreUuid,
  document_id: coreUuid,
  person_id: coreUuid,
});
export const trip_instruction_visibility_peopleSchema = z.strictObject({
  trip_id: coreUuid,
  instruction_id: coreUuid,
  person_id: coreUuid,
});
export const expense_linksSchema = z.strictObject({
  id: coreUuid,
  expense_id: coreUuid,
  journey_id: coreUuid,
  type: z.enum(["ITINERARY_EVENT", "ITINERARY_RESERVATION", "DOCUMENT", "RECEIPT"]),
  target_id: coreUuid,
  metadata: z.strictObject({}),
  created_by: coreUuid,
  created_at: instant,
});
export const trip_person_ordinary_ordersSchema = z.strictObject({
  id: coreUuid,
  trip_id: coreUuid,
  revision: coreRevision,
  owner_account_id: coreUuid,
  visibility: z.literal("PRIVATE"),
  hidden_at: z.null(),
  created_at: instant,
  updated_at: instant,
  field_state: coreFieldState,
  person_id: coreUuid,
  branch_id: coreUuid,
  nodes: z.array(ordinaryNodeSchema).max(30),
  gaps: z.array(ordinaryGapSchema).max(29),
});
export const coreTableSchemas = {
  trip_person_ordinary_orders: trip_person_ordinary_ordersSchema,
  itinerary_events: itinerary_eventsSchema,
  itinerary_transport_endpoints: itinerary_transport_endpointsSchema,
  trip_endpoint_details: trip_endpoint_detailsSchema,
  trip_flight_intents: trip_flight_intentsSchema,
  itinerary_transport_services: itinerary_transport_servicesSchema,
  trip_stay_details: trip_stay_detailsSchema,
  trip_stay_rooms: trip_stay_roomsSchema,
  trip_rental_details: trip_rental_detailsSchema,
  trip_activity_details: trip_activity_detailsSchema,
  trip_rental_places: trip_rental_placesSchema,
  trip_activity_entry_places: trip_activity_entry_placesSchema,
  trip_transport_operational_facts: trip_transport_operational_factsSchema,
  itinerary_reservations: itinerary_reservationsSchema,
  trip_booking_observations: trip_booking_observationsSchema,
  trip_entitlements: trip_entitlementsSchema,
  trip_operational_documents: trip_operational_documentsSchema,
  trip_instruction_entries: trip_instruction_entriesSchema,
  trip_booking_item_links: trip_booking_item_linksSchema,
  trip_entitlement_item_links: trip_entitlement_item_linksSchema,
  trip_booking_entitlement_links: trip_booking_entitlement_linksSchema,
  trip_booking_document_links: trip_booking_document_linksSchema,
  trip_entitlement_document_links: trip_entitlement_document_linksSchema,
  trip_item_document_links: trip_item_document_linksSchema,
  trip_item_participants: trip_item_participantsSchema,
  trip_entitlement_holders: trip_entitlement_holdersSchema,
  trip_item_visibility_people: trip_item_visibility_peopleSchema,
  trip_booking_visibility_people: trip_booking_visibility_peopleSchema,
  trip_entitlement_visibility_people: trip_entitlement_visibility_peopleSchema,
  trip_document_visibility_people: trip_document_visibility_peopleSchema,
  trip_instruction_visibility_people: trip_instruction_visibility_peopleSchema,
  expense_links: expense_linksSchema,
} as const;
export const coreKindTables = {
  ORDER: "trip_person_ordinary_orders",
  ITEM: "itinerary_events",
  BOOKING: "itinerary_reservations",
  ENTITLEMENT: "trip_entitlements",
  DOCUMENT: "trip_operational_documents",
  INSTRUCTION: "trip_instruction_entries",
} as const;
export type CoreKind = keyof typeof coreKindTables;
export type CoreItem = z.infer<typeof itinerary_eventsSchema>;
export type CoreBooking = z.infer<typeof itinerary_reservationsSchema>;
export type CoreEntitlement = z.infer<typeof trip_entitlementsSchema>;
export type CoreDocument = z.infer<typeof trip_operational_documentsSchema>;
export type CoreInstruction = z.infer<typeof trip_instruction_entriesSchema>;
export type CoreTable = keyof typeof coreTableSchemas;
export const corePlaceSchema = itinerary_eventsSchema.pick({
  authored_label: true,
  authored_text: true,
  authored_address: true,
  accepted_address: true,
  accepted_latitude: true,
  accepted_longitude: true,
  accepted_place_id: true,
  spatial_provenance_refs: true,
  location_input_revision: true,
  authored_address_line1: true,
  authored_address_line2: true,
  authored_address_locality: true,
  authored_address_region: true,
  authored_address_postal_code: true,
  authored_address_country: true,
  accepted_address_line1: true,
  accepted_address_line2: true,
  accepted_address_locality: true,
  accepted_address_region: true,
  accepted_address_postal_code: true,
  accepted_address_country: true,
});
export const coreParticipationSchema = z
  .strictObject({
    mode: z.enum(["WHOLE_GROUP", "SELECTED_MEMBERS", "SELF"]),
    people: z.array(coreUuid).max(256),
    selfPersonId: coreUuid.nullable(),
  })
  .superRefine((p, c) => {
    if (
      new Set(p.people).size !== p.people.length ||
      (p.mode === "SELECTED_MEMBERS"
        ? p.people.length === 0 || p.selfPersonId !== null
        : p.people.length !== 0) ||
      (p.mode !== "SELF" && p.selfPersonId !== null)
    )
      c.addIssue({ code: "custom", message: "INVALID_PARTICIPATION" });
  });
export const coreAclSchema = z
  .strictObject({
    visibility: z.enum(["PRIVATE", "GROUP", "SELECTED_PERSONS"]),
    people: z.array(coreUuid).max(256),
  })
  .refine(
    (a) =>
      new Set(a.people).size === a.people.length &&
      (a.visibility === "SELECTED_PERSONS" ? a.people.length > 0 : a.people.length === 0),
  );
export const coreScheduleSchema = z.strictObject({
  start: coreBoundarySchema,
  end: coreBoundarySchema.optional(),
});
export function parseCoreWire(text: string): unknown {
  if (new TextEncoder().encode(text).length > 32768) throw new Error("INVALID_WIRE");
  return parseCoreJson(text);
}
export function coreDefaults(role: "organizer" | "member") {
  return {
    participation: {
      mode: role === "organizer" ? "WHOLE_GROUP" : "SELF",
      people: [],
      selfPersonId: null,
    },
    acl: { visibility: role === "organizer" ? "GROUP" : "PRIVATE", people: [] },
  } as const;
}

export function isCoreFieldAddress(address: string): boolean {
  const [table, ...parts] = address.split(".");
  const schema = coreTableSchemas[table as CoreTable];
  if (!schema || parts.length < 1) return false;
  const field = parts.at(-1)!;
  if (
    [
      "id",
      "trip_id",
      "event_id",
      "owner_account_id",
      "field_state",
      "revision",
      "semantic_revision",
      "created_at",
      "updated_at",
    ].includes(field)
  )
    return false;
  if (parts.length > 1) {
    const role = parts.slice(0, -1).join(".");
    if (table === "itinerary_transport_services") {
      if (!/^[A-Za-z0-9._:-]{1,32}$/.test(role)) return false;
    } else if (table === "trip_stay_rooms") {
      if (!coreUuid.safeParse(role).success) return false;
    } else if (
      !(
        table === "itinerary_transport_endpoints" || table === "trip_endpoint_details"
          ? ["ORIGIN", "DESTINATION"]
          : table === "trip_rental_places"
            ? ["PICKUP", "RETURN"]
            : table === "trip_activity_entry_places"
              ? ["ENTRY"]
              : table === "trip_transport_operational_facts"
                ? ["MEETING", "CHECKIN", "BOARDING_CUTOFF"]
                : []
      ).includes(role)
    )
      return false;
  }
  return Object.hasOwn(schema.shape, field);
}
