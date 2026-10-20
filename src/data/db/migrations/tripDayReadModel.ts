// Reserved SQLite 47. Integration owns registration in migrations.ts.
export const daySpatialColumns = [
  "authored_label",
  "authored_text",
  "authored_address",
  "accepted_address",
  "accepted_latitude",
  "accepted_longitude",
  "accepted_place_id",
  "spatial_provenance_refs",
  "location_input_revision",
  "authored_address_line1",
  "authored_address_line2",
  "authored_address_locality",
  "authored_address_region",
  "authored_address_postal_code",
  "authored_address_country",
  "accepted_address_line1",
  "accepted_address_line2",
  "accepted_address_locality",
  "accepted_address_region",
  "accepted_address_postal_code",
  "accepted_address_country",
] as const;
export const dayTemporalColumns = [
  "instant",
  "local_date",
  "local_time",
  "clock_precision",
  "quality",
  "basis",
  "zone_id",
  "supplied_offset_seconds",
  "source_instant",
  "source_instant_precision",
  "civil_resolution",
  "resolution_offset_seconds",
  "interpretation_key",
  "interpretation_input_sha256",
  "provenance_refs",
] as const;
export const dayEventColumns = [
  "semantic_revision",
  "title",
  "event_type",
  "status",
  "order_index",
  "trip_day_id",
  "temporal_shape",
  "participant_scope",
  "timing_label",
  "timing_provenance_ref",
  "is_estimated_time",
  ...daySpatialColumns,
] as const;
const columns = (names: readonly string[]) =>
  names
    .map(
      (name) =>
        `${name} ${
          name.endsWith("latitude") || name.endsWith("longitude")
            ? "REAL"
            : [
                  "semantic_revision",
                  "order_index",
                  "is_estimated_time",
                  "location_input_revision",
                  "clock_precision",
                  "source_instant_precision",
                  "supplied_offset_seconds",
                  "resolution_offset_seconds",
                ].includes(name)
              ? "INTEGER"
              : "TEXT"
        }`,
    )
    .join(",\n");
export const tripDayReadModelMigration = {
  id: 47,
  name: "trip_day_read_model",
  sql: `
    CREATE TABLE trip_day_projections (
      account_id TEXT NOT NULL, trip_id TEXT NOT NULL,
      projection_version INTEGER NOT NULL CHECK (projection_version=1),
      projection_generation BLOB NOT NULL CHECK (typeof(projection_generation)='integer' AND projection_generation BETWEEN 1 AND 9007199254740991),
      source_epoch_id TEXT NOT NULL,
      source_revision TEXT NOT NULL CHECK (length(source_revision) BETWEEN 1 AND 16 AND source_revision NOT GLOB '*[^0-9]*' AND substr(source_revision,1,1) BETWEEN '1' AND '9' AND (length(source_revision)<16 OR source_revision<='9007199254740991')),
      source_fingerprint TEXT NOT NULL CHECK (length(source_fingerprint)=64 AND source_fingerprint NOT GLOB '*[^0-9a-f]*'),
      source_applied_generation BLOB NOT NULL CHECK (typeof(source_applied_generation)='integer' AND source_applied_generation BETWEEN 1 AND 9007199254740991),
      event_count INTEGER NOT NULL CHECK (event_count BETWEEN 0 AND 10000),
      PRIMARY KEY (account_id,trip_id)
    );
    CREATE TABLE trip_day_events (
      account_id TEXT NOT NULL, trip_id TEXT NOT NULL, event_id TEXT NOT NULL,
      ${columns(dayEventColumns)},
      PRIMARY KEY (account_id,trip_id,event_id),
      FOREIGN KEY (account_id,trip_id) REFERENCES trip_day_projections(account_id,trip_id) ON DELETE CASCADE,
      CHECK (semantic_revision BETWEEN 1 AND 9007199254740991),
      CHECK (participant_scope='UNASSIGNED'),
      CHECK (is_estimated_time IN (0,1))
    );
    CREATE TABLE trip_day_boundaries (
      account_id TEXT NOT NULL, trip_id TEXT NOT NULL, event_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('START','END','ORIGIN','DESTINATION')),
      ${columns([...dayTemporalColumns, ...daySpatialColumns])},
      PRIMARY KEY (account_id,trip_id,event_id,role),
      FOREIGN KEY (account_id,trip_id,event_id) REFERENCES trip_day_events(account_id,trip_id,event_id) ON DELETE CASCADE
    );
  `,
};
