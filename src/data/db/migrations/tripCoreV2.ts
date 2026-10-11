import type { Migration } from "../migrations";

export const tripCoreV2Migration: Migration = {
  id: 54,
  name: "trip_core_v2_foundation",
  sql: `
CREATE TABLE trip_core_itinerary_events (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "semantic_revision" INTEGER NOT NULL,
  "owner_account_id" TEXT NOT NULL,
  "visibility" TEXT NOT NULL,
  "hidden_at" TEXT,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "field_state" TEXT NOT NULL,
  "business_contract_version" INTEGER NOT NULL,
  "experience_family" TEXT NOT NULL,
  "temporal_contract_version" INTEGER NOT NULL,
  "temporal_shape" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "event_type" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "order_index" INTEGER,
  "trip_day_id" TEXT,
  "participation_mode" TEXT NOT NULL,
  "participant_scope" TEXT NOT NULL,
  "self_person_id" TEXT,
  "activity_category" TEXT,
  "reservation_id" TEXT,
  "timing_label" TEXT,
  "start_local_date" TEXT,
  "start_local_time" TEXT,
  "start_clock_precision" INTEGER,
  "start_quality" TEXT,
  "start_basis" TEXT,
  "start_zone_id" TEXT,
  "start_supplied_offset_seconds" INTEGER,
  "start_source_instant" TEXT,
  "start_source_instant_precision" INTEGER,
  "start_civil_resolution" TEXT,
  "start_resolution_offset_seconds" INTEGER,
  "start_interpretation_key" TEXT,
  "start_interpretation_input_sha256" TEXT,
  "start_provenance_refs" TEXT,
  "planned_start" TEXT,
  "end_local_date" TEXT,
  "end_local_time" TEXT,
  "end_clock_precision" INTEGER,
  "end_quality" TEXT,
  "end_basis" TEXT,
  "end_zone_id" TEXT,
  "end_supplied_offset_seconds" INTEGER,
  "end_source_instant" TEXT,
  "end_source_instant_precision" INTEGER,
  "end_civil_resolution" TEXT,
  "end_resolution_offset_seconds" INTEGER,
  "end_interpretation_key" TEXT,
  "end_interpretation_input_sha256" TEXT,
  "end_provenance_refs" TEXT,
  "planned_end" TEXT,
  "authored_label" TEXT,
  "authored_text" TEXT,
  "authored_address" TEXT,
  "accepted_address" TEXT,
  "accepted_latitude" INTEGER,
  "accepted_longitude" INTEGER,
  "accepted_place_id" TEXT,
  "spatial_provenance_refs" TEXT,
  "location_input_revision" INTEGER,
  "authored_address_line1" TEXT,
  "authored_address_line2" TEXT,
  "authored_address_locality" TEXT,
  "authored_address_region" TEXT,
  "authored_address_postal_code" TEXT,
  "authored_address_country" TEXT,
  "accepted_address_line1" TEXT,
  "accepted_address_line2" TEXT,
  "accepted_address_locality" TEXT,
  "accepted_address_region" TEXT,
  "accepted_address_postal_code" TEXT,
  "accepted_address_country" TEXT,
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "id")
);
CREATE INDEX trip_core_itinerary_events_scope ON trip_core_itinerary_events(cache_account_id,"trip_id");

CREATE TABLE trip_core_itinerary_transport_endpoints (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "local_date" TEXT,
  "local_time" TEXT,
  "clock_precision" INTEGER,
  "quality" TEXT,
  "basis" TEXT,
  "zone_id" TEXT,
  "supplied_offset_seconds" INTEGER,
  "source_instant" TEXT,
  "source_instant_precision" INTEGER,
  "civil_resolution" TEXT,
  "resolution_offset_seconds" INTEGER,
  "interpretation_key" TEXT,
  "interpretation_input_sha256" TEXT,
  "provenance_refs" TEXT,
  "instant" TEXT,
  "authored_label" TEXT,
  "authored_text" TEXT,
  "authored_address" TEXT,
  "accepted_address" TEXT,
  "accepted_latitude" INTEGER,
  "accepted_longitude" INTEGER,
  "accepted_place_id" TEXT,
  "spatial_provenance_refs" TEXT,
  "location_input_revision" INTEGER,
  "authored_address_line1" TEXT,
  "authored_address_line2" TEXT,
  "authored_address_locality" TEXT,
  "authored_address_region" TEXT,
  "authored_address_postal_code" TEXT,
  "authored_address_country" TEXT,
  "accepted_address_line1" TEXT,
  "accepted_address_line2" TEXT,
  "accepted_address_locality" TEXT,
  "accepted_address_region" TEXT,
  "accepted_address_postal_code" TEXT,
  "accepted_address_country" TEXT,
  FOREIGN KEY(cache_account_id,"trip_id","event_id") REFERENCES trip_core_itinerary_events(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "event_id", "role")
);
CREATE INDEX trip_core_itinerary_transport_endpoints_scope ON trip_core_itinerary_transport_endpoints(cache_account_id,"trip_id");

CREATE TABLE trip_core_trip_endpoint_details (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "airport_code" TEXT,
  "terminal" TEXT,
  "platform" TEXT,
  "pier" TEXT,
  "event_id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  FOREIGN KEY(cache_account_id,"trip_id","event_id") REFERENCES trip_core_itinerary_events(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "event_id", "role")
);
CREATE INDEX trip_core_trip_endpoint_details_scope ON trip_core_trip_endpoint_details(cache_account_id,"trip_id");

CREATE TABLE trip_core_trip_flight_intents (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "flight_number_literal" TEXT NOT NULL,
  "qualification" TEXT NOT NULL,
  FOREIGN KEY(cache_account_id,"trip_id","event_id") REFERENCES trip_core_itinerary_events(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "event_id")
);
CREATE INDEX trip_core_trip_flight_intents_scope ON trip_core_trip_flight_intents(cache_account_id,"trip_id");

CREATE TABLE trip_core_itinerary_transport_services (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "service_key" TEXT NOT NULL,
  "transport_subtype" TEXT NOT NULL,
  "attribution" TEXT NOT NULL,
  "operator_namespace" TEXT NOT NULL,
  "operator_issuer" TEXT NOT NULL,
  "operator_value" TEXT NOT NULL,
  "operator_literal" TEXT NOT NULL,
  "service_number" TEXT NOT NULL,
  "service_literal" TEXT NOT NULL,
  "codeshare_operating_key" TEXT,
  FOREIGN KEY(cache_account_id,"trip_id","event_id") REFERENCES trip_core_itinerary_events(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "event_id", "service_key")
);
CREATE INDEX trip_core_itinerary_transport_services_scope ON trip_core_itinerary_transport_services(cache_account_id,"trip_id");

CREATE TABLE trip_core_trip_stay_details (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "property_name" TEXT,
  "permitted_checkin_from" TEXT,
  "permitted_checkin_until" TEXT,
  "permitted_checkout_by" TEXT,
  FOREIGN KEY(cache_account_id,"trip_id","event_id") REFERENCES trip_core_itinerary_events(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "event_id")
);
CREATE INDEX trip_core_trip_stay_details_scope ON trip_core_trip_stay_details(cache_account_id,"trip_id");

CREATE TABLE trip_core_trip_stay_rooms (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "room_id" TEXT NOT NULL,
  "category" TEXT,
  "quantity" INTEGER,
  "capacity" INTEGER,
  FOREIGN KEY(cache_account_id,"trip_id","event_id") REFERENCES trip_core_itinerary_events(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "event_id", "room_id")
);
CREATE INDEX trip_core_trip_stay_rooms_scope ON trip_core_trip_stay_rooms(cache_account_id,"trip_id");

CREATE TABLE trip_core_trip_rental_details (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "supplier" TEXT,
  "reserved_category" TEXT,
  "or_similar" INTEGER,
  "actual_vehicle_model" TEXT,
  "verified_plate" TEXT,
  FOREIGN KEY(cache_account_id,"trip_id","event_id") REFERENCES trip_core_itinerary_events(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "event_id")
);
CREATE INDEX trip_core_trip_rental_details_scope ON trip_core_trip_rental_details(cache_account_id,"trip_id");

CREATE TABLE trip_core_trip_activity_details (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "session_label" TEXT,
  "admission_note" TEXT,
  FOREIGN KEY(cache_account_id,"trip_id","event_id") REFERENCES trip_core_itinerary_events(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "event_id")
);
CREATE INDEX trip_core_trip_activity_details_scope ON trip_core_trip_activity_details(cache_account_id,"trip_id");

CREATE TABLE trip_core_trip_rental_places (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "authored_label" TEXT,
  "authored_text" TEXT,
  "authored_address" TEXT,
  "accepted_address" TEXT,
  "accepted_latitude" INTEGER,
  "accepted_longitude" INTEGER,
  "accepted_place_id" TEXT,
  "spatial_provenance_refs" TEXT,
  "location_input_revision" INTEGER,
  "authored_address_line1" TEXT,
  "authored_address_line2" TEXT,
  "authored_address_locality" TEXT,
  "authored_address_region" TEXT,
  "authored_address_postal_code" TEXT,
  "authored_address_country" TEXT,
  "accepted_address_line1" TEXT,
  "accepted_address_line2" TEXT,
  "accepted_address_locality" TEXT,
  "accepted_address_region" TEXT,
  "accepted_address_postal_code" TEXT,
  "accepted_address_country" TEXT,
  FOREIGN KEY(cache_account_id,"trip_id","event_id") REFERENCES trip_core_itinerary_events(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "event_id", "role")
);
CREATE INDEX trip_core_trip_rental_places_scope ON trip_core_trip_rental_places(cache_account_id,"trip_id");

CREATE TABLE trip_core_trip_activity_entry_places (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "authored_label" TEXT,
  "authored_text" TEXT,
  "authored_address" TEXT,
  "accepted_address" TEXT,
  "accepted_latitude" INTEGER,
  "accepted_longitude" INTEGER,
  "accepted_place_id" TEXT,
  "spatial_provenance_refs" TEXT,
  "location_input_revision" INTEGER,
  "authored_address_line1" TEXT,
  "authored_address_line2" TEXT,
  "authored_address_locality" TEXT,
  "authored_address_region" TEXT,
  "authored_address_postal_code" TEXT,
  "authored_address_country" TEXT,
  "accepted_address_line1" TEXT,
  "accepted_address_line2" TEXT,
  "accepted_address_locality" TEXT,
  "accepted_address_region" TEXT,
  "accepted_address_postal_code" TEXT,
  "accepted_address_country" TEXT,
  FOREIGN KEY(cache_account_id,"trip_id","event_id") REFERENCES trip_core_itinerary_events(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "event_id", "role")
);
CREATE INDEX trip_core_trip_activity_entry_places_scope ON trip_core_trip_activity_entry_places(cache_account_id,"trip_id");

CREATE TABLE trip_core_trip_transport_operational_facts (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "authored_label" TEXT,
  "authored_text" TEXT,
  "authored_address" TEXT,
  "accepted_address" TEXT,
  "accepted_latitude" INTEGER,
  "accepted_longitude" INTEGER,
  "accepted_place_id" TEXT,
  "spatial_provenance_refs" TEXT,
  "location_input_revision" INTEGER,
  "authored_address_line1" TEXT,
  "authored_address_line2" TEXT,
  "authored_address_locality" TEXT,
  "authored_address_region" TEXT,
  "authored_address_postal_code" TEXT,
  "authored_address_country" TEXT,
  "accepted_address_line1" TEXT,
  "accepted_address_line2" TEXT,
  "accepted_address_locality" TEXT,
  "accepted_address_region" TEXT,
  "accepted_address_postal_code" TEXT,
  "accepted_address_country" TEXT,
  "local_date" TEXT,
  "local_time" TEXT,
  "clock_precision" INTEGER,
  "quality" TEXT,
  "basis" TEXT,
  "zone_id" TEXT,
  "supplied_offset_seconds" INTEGER,
  "source_instant" TEXT,
  "source_instant_precision" INTEGER,
  "civil_resolution" TEXT,
  "resolution_offset_seconds" INTEGER,
  "interpretation_key" TEXT,
  "interpretation_input_sha256" TEXT,
  "provenance_refs" TEXT,
  "instant" TEXT,
  FOREIGN KEY(cache_account_id,"trip_id","event_id") REFERENCES trip_core_itinerary_events(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "event_id", "role")
);
CREATE INDEX trip_core_trip_transport_operational_facts_scope ON trip_core_trip_transport_operational_facts(cache_account_id,"trip_id");

CREATE TABLE trip_core_itinerary_reservations (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "owner_account_id" TEXT NOT NULL,
  "visibility" TEXT NOT NULL,
  "hidden_at" TEXT,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "field_state" TEXT NOT NULL,
  "business_contract_version" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "provider" TEXT,
  "confirmation_code" TEXT,
  "contact" TEXT,
  "booking_url" TEXT,
  "commercial_status" TEXT NOT NULL,
  "replaces_booking_id" TEXT,
  "supplier_observation" TEXT,
  "price_minor" INTEGER,
  "price_currency" TEXT,
  "price_scale" INTEGER,
  "due_minor" INTEGER,
  "due_currency" TEXT,
  "due_scale" INTEGER,
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "id")
);
CREATE INDEX trip_core_itinerary_reservations_scope ON trip_core_itinerary_reservations(cache_account_id,"trip_id");

CREATE TABLE trip_core_trip_booking_observations (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "holder_label" TEXT,
  "observed_start" TEXT,
  "observed_end" TEXT,
  "source_summary" TEXT,
  "trip_id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "observation_id" TEXT NOT NULL,
  "evidence_ref" TEXT,
  FOREIGN KEY(cache_account_id,"trip_id","booking_id") REFERENCES trip_core_itinerary_reservations(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "observation_id")
);
CREATE INDEX trip_core_trip_booking_observations_scope ON trip_core_trip_booking_observations(cache_account_id,"trip_id");

CREATE TABLE trip_core_trip_entitlements (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "owner_account_id" TEXT NOT NULL,
  "visibility" TEXT NOT NULL,
  "hidden_at" TEXT,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "field_state" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "issuer" TEXT,
  "reference" TEXT,
  "quantity" INTEGER,
  "holder_label" TEXT,
  "status" TEXT NOT NULL,
  "access_class" TEXT NOT NULL,
  "provider_url" TEXT,
  "valid_from_date" TEXT,
  "valid_until_date" TEXT,
  "valid_from_instant" TEXT,
  "valid_until_instant" TEXT,
  "validity_zone_id" TEXT,
  "validity_precision" TEXT,
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "id")
);
CREATE INDEX trip_core_trip_entitlements_scope ON trip_core_trip_entitlements(cache_account_id,"trip_id");

CREATE TABLE trip_core_trip_operational_documents (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "owner_account_id" TEXT NOT NULL,
  "visibility" TEXT NOT NULL,
  "hidden_at" TEXT,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "field_state" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "media_type" TEXT NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "custody" TEXT NOT NULL,
  "source_representation_id" TEXT,
  "storage_object_key" TEXT,
  "content_version" INTEGER NOT NULL,
  "ticket_face_index" INTEGER,
  "qr_region" TEXT,
  "custody_receipt_id" TEXT NOT NULL,
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "id")
);
CREATE INDEX trip_core_trip_operational_documents_scope ON trip_core_trip_operational_documents(cache_account_id,"trip_id");

CREATE TABLE trip_core_trip_instruction_entries (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "owner_account_id" TEXT NOT NULL,
  "visibility" TEXT NOT NULL,
  "hidden_at" TEXT,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "field_state" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "section" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "sensitivity" TEXT NOT NULL,
  "supersedes_id" TEXT,
  "source_representation_id" TEXT,
  FOREIGN KEY(cache_account_id,"trip_id","event_id") REFERENCES trip_core_itinerary_events(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(cache_account_id,trip_id,supersedes_id) REFERENCES trip_core_trip_instruction_entries(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "id")
);
CREATE INDEX trip_core_trip_instruction_entries_scope ON trip_core_trip_instruction_entries(cache_account_id,"trip_id");

CREATE TABLE trip_core_trip_booking_item_links (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "item_id" TEXT NOT NULL,
  "active" INTEGER NOT NULL,
  "linked_by" TEXT NOT NULL,
  "linked_at" TEXT NOT NULL,
  FOREIGN KEY(cache_account_id,"trip_id","booking_id") REFERENCES trip_core_itinerary_reservations(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(cache_account_id,"trip_id","item_id") REFERENCES trip_core_itinerary_events(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "booking_id", "item_id")
);
CREATE INDEX trip_core_trip_booking_item_links_scope ON trip_core_trip_booking_item_links(cache_account_id,"trip_id");

CREATE TABLE trip_core_trip_entitlement_item_links (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "entitlement_id" TEXT NOT NULL,
  "item_id" TEXT NOT NULL,
  "active" INTEGER NOT NULL,
  "linked_by" TEXT NOT NULL,
  "linked_at" TEXT NOT NULL,
  "coach" TEXT,
  "seat" TEXT,
  "section" TEXT,
  "cabin" TEXT,
  "fare_class" TEXT,
  "baggage_allowance" TEXT,
  FOREIGN KEY(cache_account_id,"trip_id","entitlement_id") REFERENCES trip_core_trip_entitlements(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(cache_account_id,"trip_id","item_id") REFERENCES trip_core_itinerary_events(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "entitlement_id", "item_id")
);
CREATE INDEX trip_core_trip_entitlement_item_links_scope ON trip_core_trip_entitlement_item_links(cache_account_id,"trip_id");

CREATE TABLE trip_core_trip_booking_entitlement_links (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "entitlement_id" TEXT NOT NULL,
  "active" INTEGER NOT NULL,
  "linked_by" TEXT NOT NULL,
  "linked_at" TEXT NOT NULL,
  FOREIGN KEY(cache_account_id,"trip_id","booking_id") REFERENCES trip_core_itinerary_reservations(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(cache_account_id,"trip_id","entitlement_id") REFERENCES trip_core_trip_entitlements(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "booking_id", "entitlement_id")
);
CREATE INDEX trip_core_trip_booking_entitlement_links_scope ON trip_core_trip_booking_entitlement_links(cache_account_id,"trip_id");

CREATE TABLE trip_core_trip_booking_document_links (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "active" INTEGER NOT NULL,
  "linked_by" TEXT NOT NULL,
  "linked_at" TEXT NOT NULL,
  FOREIGN KEY(cache_account_id,"trip_id","booking_id") REFERENCES trip_core_itinerary_reservations(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(cache_account_id,"trip_id","document_id") REFERENCES trip_core_trip_operational_documents(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "booking_id", "document_id")
);
CREATE INDEX trip_core_trip_booking_document_links_scope ON trip_core_trip_booking_document_links(cache_account_id,"trip_id");

CREATE TABLE trip_core_trip_entitlement_document_links (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "entitlement_id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "active" INTEGER NOT NULL,
  "linked_by" TEXT NOT NULL,
  "linked_at" TEXT NOT NULL,
  FOREIGN KEY(cache_account_id,"trip_id","entitlement_id") REFERENCES trip_core_trip_entitlements(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(cache_account_id,"trip_id","document_id") REFERENCES trip_core_trip_operational_documents(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "entitlement_id", "document_id")
);
CREATE INDEX trip_core_trip_entitlement_document_links_scope ON trip_core_trip_entitlement_document_links(cache_account_id,"trip_id");

CREATE TABLE trip_core_trip_item_document_links (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "item_id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "active" INTEGER NOT NULL,
  "linked_by" TEXT NOT NULL,
  "linked_at" TEXT NOT NULL,
  FOREIGN KEY(cache_account_id,"trip_id","item_id") REFERENCES trip_core_itinerary_events(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(cache_account_id,"trip_id","document_id") REFERENCES trip_core_trip_operational_documents(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "item_id", "document_id")
);
CREATE INDEX trip_core_trip_item_document_links_scope ON trip_core_trip_item_document_links(cache_account_id,"trip_id");

CREATE TABLE trip_core_trip_item_participants (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "item_id" TEXT NOT NULL,
  "person_id" TEXT NOT NULL,
  "active" INTEGER NOT NULL,
  FOREIGN KEY(cache_account_id,"trip_id","item_id") REFERENCES trip_core_itinerary_events(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "item_id", "person_id")
);
CREATE INDEX trip_core_trip_item_participants_scope ON trip_core_trip_item_participants(cache_account_id,"trip_id");

CREATE TABLE trip_core_trip_entitlement_holders (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "entitlement_id" TEXT NOT NULL,
  "person_id" TEXT NOT NULL,
  "active" INTEGER NOT NULL,
  FOREIGN KEY(cache_account_id,"trip_id","entitlement_id") REFERENCES trip_core_trip_entitlements(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "entitlement_id", "person_id")
);
CREATE INDEX trip_core_trip_entitlement_holders_scope ON trip_core_trip_entitlement_holders(cache_account_id,"trip_id");

CREATE TABLE trip_core_trip_item_visibility_people (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "item_id" TEXT NOT NULL,
  "person_id" TEXT NOT NULL,
  FOREIGN KEY(cache_account_id,"trip_id","item_id") REFERENCES trip_core_itinerary_events(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "item_id", "person_id")
);
CREATE INDEX trip_core_trip_item_visibility_people_scope ON trip_core_trip_item_visibility_people(cache_account_id,"trip_id");

CREATE TABLE trip_core_trip_booking_visibility_people (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "person_id" TEXT NOT NULL,
  FOREIGN KEY(cache_account_id,"trip_id","booking_id") REFERENCES trip_core_itinerary_reservations(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "booking_id", "person_id")
);
CREATE INDEX trip_core_trip_booking_visibility_people_scope ON trip_core_trip_booking_visibility_people(cache_account_id,"trip_id");

CREATE TABLE trip_core_trip_entitlement_visibility_people (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "entitlement_id" TEXT NOT NULL,
  "person_id" TEXT NOT NULL,
  FOREIGN KEY(cache_account_id,"trip_id","entitlement_id") REFERENCES trip_core_trip_entitlements(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "entitlement_id", "person_id")
);
CREATE INDEX trip_core_trip_entitlement_visibility_people_scope ON trip_core_trip_entitlement_visibility_people(cache_account_id,"trip_id");

CREATE TABLE trip_core_trip_document_visibility_people (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "person_id" TEXT NOT NULL,
  FOREIGN KEY(cache_account_id,"trip_id","document_id") REFERENCES trip_core_trip_operational_documents(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "document_id", "person_id")
);
CREATE INDEX trip_core_trip_document_visibility_people_scope ON trip_core_trip_document_visibility_people(cache_account_id,"trip_id");

CREATE TABLE trip_core_trip_instruction_visibility_people (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "instruction_id" TEXT NOT NULL,
  "person_id" TEXT NOT NULL,
  FOREIGN KEY(cache_account_id,"trip_id","instruction_id") REFERENCES trip_core_trip_instruction_entries(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "instruction_id", "person_id")
);
CREATE INDEX trip_core_trip_instruction_visibility_people_scope ON trip_core_trip_instruction_visibility_people(cache_account_id,"trip_id");

CREATE TABLE trip_core_expense_links (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "expense_id" TEXT NOT NULL,
  "journey_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "target_id" TEXT NOT NULL,
  "metadata" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" TEXT NOT NULL,
  PRIMARY KEY(cache_account_id, "journey_id", mirror_key),
  UNIQUE(cache_account_id, "journey_id", "id")
);
CREATE INDEX trip_core_expense_links_scope ON trip_core_expense_links(cache_account_id,"journey_id");

CREATE TABLE trip_core_scopes (
 account_id TEXT NOT NULL, trip_id TEXT NOT NULL,
 refresh_generation INTEGER NOT NULL CHECK(refresh_generation BETWEEN 1 AND 9007199254740991),
 access_revision INTEGER NOT NULL CHECK(access_revision BETWEEN 1 AND 9007199254740991),
 revoked INTEGER NOT NULL CHECK(revoked IN (0,1)),
 PRIMARY KEY(account_id,trip_id)
);
CREATE TABLE trip_core_read_certificates (
 account_id TEXT NOT NULL, trip_id TEXT NOT NULL,
 epoch TEXT NOT NULL, revision TEXT NOT NULL,
 access_revision INTEGER NOT NULL, applied_generation INTEGER NOT NULL,
 actor_person_binding_hash TEXT NOT NULL, roster_hash TEXT NOT NULL, manifest_sha256 TEXT NOT NULL,
 business_version INTEGER NOT NULL CHECK(business_version=2),
 read_version INTEGER NOT NULL CHECK(read_version=2),
 temporal_version INTEGER NOT NULL CHECK(temporal_version=1),
 complete INTEGER NOT NULL CHECK(complete=1),
 PRIMARY KEY(account_id,trip_id),
 FOREIGN KEY(account_id,trip_id) REFERENCES trip_core_scopes(account_id,trip_id)
);
CREATE TABLE trip_core_person_bindings (
 account_id TEXT NOT NULL,trip_id TEXT NOT NULL,person_id TEXT NOT NULL,
 linked_account_id TEXT,active INTEGER NOT NULL CHECK(active IN (0,1)),
 PRIMARY KEY(account_id,trip_id,person_id),
 FOREIGN KEY(account_id,trip_id) REFERENCES trip_core_scopes(account_id,trip_id)
);
CREATE TABLE trip_core_pending_intents (
 account_id TEXT NOT NULL, trip_id TEXT NOT NULL, operation_id TEXT NOT NULL,
 intent_version INTEGER NOT NULL CHECK(intent_version=2),
 canonical_intent_text TEXT NOT NULL CHECK(json_valid(canonical_intent_text)),
 intent_sha256 TEXT NOT NULL, base_vector TEXT NOT NULL CHECK(json_valid(base_vector)),
 queue_operation_id TEXT NOT NULL, reconciled_revision INTEGER,
 state TEXT NOT NULL CHECK(state IN ('PENDING','IN_FLIGHT','APPLIED','CONFLICT','REVIEW','BLOCKED')),
 created_at TEXT NOT NULL,
 PRIMARY KEY(account_id,trip_id,operation_id), UNIQUE(account_id,operation_id)
);
CREATE TRIGGER trip_core_intent_binding_immutable BEFORE UPDATE OF intent_sha256,canonical_intent_text,base_vector,queue_operation_id,account_id,trip_id,operation_id ON trip_core_pending_intents
BEGIN SELECT RAISE(ABORT,'CORE_INTENT_IMMUTABLE'); END;
CREATE TABLE trip_core_trip_core_command_receipts (
 account_id TEXT NOT NULL, trip_id TEXT NOT NULL, operation_id TEXT NOT NULL,
 intent_sha256 TEXT NOT NULL, receipt_sha256 TEXT NOT NULL,
 body_json TEXT NOT NULL CHECK(json_valid(body_json)),
 receipt_version INTEGER NOT NULL CHECK(receipt_version=2),
 PRIMARY KEY(account_id,trip_id,operation_id), UNIQUE(account_id,operation_id)
);
CREATE TRIGGER trip_core_receipt_immutable BEFORE UPDATE ON trip_core_trip_core_command_receipts
BEGIN SELECT RAISE(ABORT,'CORE_RECEIPT_IMMUTABLE'); END;


CREATE TABLE trip_core_day_rows (
 account_id TEXT NOT NULL,trip_id TEXT NOT NULL,item_id TEXT NOT NULL,
 projection_role TEXT NOT NULL,local_date TEXT NOT NULL,family TEXT NOT NULL,
 source_item_revision INTEGER NOT NULL,projection_version INTEGER NOT NULL CHECK(projection_version=2),
 certificate_generation INTEGER NOT NULL,presentation_json TEXT NOT NULL CHECK(json_valid(presentation_json)),
 PRIMARY KEY(account_id,trip_id,item_id,projection_role,local_date)
);
CREATE TABLE trip_core_device_document_state (
 account_id TEXT NOT NULL,document_id TEXT NOT NULL,content_version INTEGER NOT NULL,sha256 TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('ABSENT','DOWNLOADING','VERIFIED','INACCESSIBLE','EVICTED')),
 verified_at TEXT,private_local_locator TEXT,
 PRIMARY KEY(account_id,document_id,content_version,sha256),
 CHECK(state<>'VERIFIED' OR verified_at IS NOT NULL AND private_local_locator IS NOT NULL)
);
CREATE TABLE trip_core_capture_v2_slots (
 account_id TEXT NOT NULL,output_slot_id TEXT NOT NULL,trip_id TEXT NOT NULL,
 proposal_version INTEGER NOT NULL CHECK(proposal_version=2),intent_version INTEGER NOT NULL CHECK(intent_version=2),
 adapter_key TEXT NOT NULL,target_kind TEXT NOT NULL,target_vector TEXT NOT NULL CHECK(json_valid(target_vector)),
 operation_id TEXT NOT NULL,dependency_ids TEXT NOT NULL CHECK(json_valid(dependency_ids)),
 domain_receipt TEXT CHECK(domain_receipt IS NULL OR json_valid(domain_receipt)),state TEXT NOT NULL,source_lineage_id TEXT NOT NULL,
 PRIMARY KEY(account_id,output_slot_id),UNIQUE(account_id,operation_id)
);
`,
};
