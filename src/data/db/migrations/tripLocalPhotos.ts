import type { Migration } from "../migrations";

export const tripLocalPhotosMigration: Migration = {
  id: 62,
  name: "trip_local_photos",
  sql: `
CREATE TABLE local_trip_photos (
 account_id TEXT NOT NULL, trip_id TEXT NOT NULL, asset_id TEXT NOT NULL,
 mime_type TEXT NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/heic','image/heif')),
 size_bytes INTEGER NOT NULL CHECK(size_bytes > 0 AND size_bytes <= 52428800),
 sha256 TEXT NOT NULL CHECK(length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
 local_uri TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(account_id,trip_id,asset_id),
 FOREIGN KEY(account_id,trip_id) REFERENCES local_trip_containers(account_id,id) ON DELETE CASCADE
);
CREATE INDEX local_trip_photos_account_trip_created
 ON local_trip_photos(account_id,trip_id,created_at DESC,asset_id);
`,
};
