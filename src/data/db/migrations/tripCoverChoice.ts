import type { Migration } from "../migrations";

export const tripCoverChoiceMigration: Migration = {
  id: 60,
  name: "trip_cover_choice",
  sql: `
ALTER TABLE local_trip_containers ADD COLUMN selected_cover_asset_id TEXT
 CHECK (selected_cover_asset_id IS NULL OR
  (length(selected_cover_asset_id) BETWEEN 1 AND 64 AND
   selected_cover_asset_id NOT GLOB '*[^a-z0-9_-]*'));
`,
};
