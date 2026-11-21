import type { Migration } from "../migrations";

// Persist the approved optional identity descriptor; retained identity bytes are copied unchanged.
export const tripCoreTransportIdentityMigration: Migration = {
  id: 81,
  name: "trip_core_transport_identity",
  sql: `
CREATE TABLE trip_core_itinerary_transport_services_next (
  cache_account_id TEXT NOT NULL,
  mirror_key TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "service_key" TEXT NOT NULL,
  "transport_subtype" TEXT NOT NULL,
  "attribution" TEXT NOT NULL,
  "operator_namespace" TEXT,
  "operator_issuer" TEXT,
  "operator_value" TEXT,
  "operator_literal" TEXT,
  "service_number" TEXT,
  "service_literal" TEXT,
  "codeshare_operating_key" TEXT,
  "identity_state" TEXT CHECK(identity_state IS NULL OR (json_valid(identity_state) AND json_type(identity_state)='object')),
  FOREIGN KEY(cache_account_id,"trip_id","event_id") REFERENCES trip_core_itinerary_events(cache_account_id,trip_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id, "trip_id", mirror_key),
  UNIQUE(cache_account_id, "trip_id", "event_id", "service_key")
);
INSERT INTO trip_core_itinerary_transport_services_next (cache_account_id,mirror_key,event_id,trip_id,service_key,transport_subtype,attribution,operator_namespace,operator_issuer,operator_value,operator_literal,service_number,service_literal,codeshare_operating_key)
  SELECT cache_account_id,mirror_key,event_id,trip_id,service_key,transport_subtype,attribution,operator_namespace,operator_issuer,operator_value,operator_literal,service_number,service_literal,codeshare_operating_key FROM trip_core_itinerary_transport_services;
DROP TABLE trip_core_itinerary_transport_services;
ALTER TABLE trip_core_itinerary_transport_services_next RENAME TO trip_core_itinerary_transport_services;
CREATE INDEX trip_core_itinerary_transport_services_scope ON trip_core_itinerary_transport_services(cache_account_id,"trip_id");
  `,
};
