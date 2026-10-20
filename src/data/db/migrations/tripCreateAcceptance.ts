import type { Migration } from "../migrations";

export const tripCreateAcceptanceMigration: Migration = {
  id: 59,
  name: "trip_create_acceptance",
  sql: `
ALTER TABLE local_trip_containers ADD COLUMN owner_person_id TEXT;
ALTER TABLE local_trip_containers ADD COLUMN accepted_at TEXT;
`,
};
