-- PROPOSAL ONLY. No Migration registration or execution authorized by this file.
-- Recheck registry before reserving proposed ID71 (current registered maximum70).
CREATE TABLE local_trip_destinations (
 account_id TEXT NOT NULL,
 trip_id TEXT NOT NULL,
 destination_id TEXT NOT NULL CHECK (
  length(destination_id)=36 AND substr(destination_id,9,1)='-' AND
  substr(destination_id,14,1)='-' AND substr(destination_id,19,1)='-' AND
  substr(destination_id,24,1)='-' AND length(replace(destination_id,'-',''))=32 AND
  replace(destination_id,'-','') NOT GLOB '*[^0-9a-fA-F]*'),
 ordinal INTEGER NOT NULL CHECK(typeof(ordinal)='integer' AND ordinal BETWEEN 0 AND 19),
 source_kind TEXT NOT NULL CHECK(source_kind IN ('MANUAL','APPLE_PLACE_ID')),
 display_label TEXT NOT NULL CHECK(length(trim(display_label)) BETWEEN 1 AND 256 AND length(CAST(display_label AS BLOB))<=1024),
 manual_claim TEXT CHECK(manual_claim IS NULL OR (length(trim(manual_claim)) BETWEEN 1 AND 256 AND length(CAST(manual_claim AS BLOB))<=1024)),
 provider TEXT CHECK(provider IS NULL OR provider='apple'),
 provider_place_id TEXT CHECK(provider_place_id IS NULL OR (length(trim(provider_place_id)) BETWEEN 1 AND 1024 AND length(CAST(provider_place_id AS BLOB))<=4096)),
 created_at TEXT NOT NULL CHECK(length(created_at) BETWEEN 20 AND 32),
 updated_at TEXT NOT NULL CHECK(length(updated_at) BETWEEN 20 AND 32),
 PRIMARY KEY(account_id,trip_id,destination_id),
 UNIQUE(account_id,trip_id,ordinal),
 FOREIGN KEY(account_id,trip_id) REFERENCES local_trip_containers(account_id,id) ON DELETE CASCADE,
 CHECK((source_kind='MANUAL' AND manual_claim IS NOT NULL AND provider IS NULL AND provider_place_id IS NULL) OR
       (source_kind='APPLE_PLACE_ID' AND manual_claim IS NULL AND provider IS 'apple' AND provider_place_id IS NOT NULL))
);
CREATE UNIQUE INDEX local_trip_destinations_provider_identity
 ON local_trip_destinations(account_id,trip_id,provider,provider_place_id)
 WHERE source_kind='APPLE_PLACE_ID';
CREATE UNIQUE INDEX local_trip_destinations_manual_claim
 ON local_trip_destinations(account_id,trip_id,manual_claim)
 WHERE source_kind='MANUAL';
-- No provider response title/address/secondary/coordinate/raw JSON is persisted.
-- manual_claim is Writer-computed NFKC, trimmed/collapsed whitespace, lowercase
-- of the explicitly authored Manual label. Parser must verify exact recomputation.
-- Manual and Apple are distinct source/claim namespaces; no cross-source auto-merge.
