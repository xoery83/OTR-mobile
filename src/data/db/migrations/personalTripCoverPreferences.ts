import type { Migration } from "../migrations";

export const personalTripCoverPreferencesMigration: Migration = {
  id: 70,
  name: "personal_trip_cover_preferences",
  sql: `
CREATE TABLE account_trip_cover_preferences (
 account_id TEXT NOT NULL,
 trip_id TEXT NOT NULL,
 selected_cover_asset_id TEXT CHECK (
  selected_cover_asset_id IS NULL OR
  (length(selected_cover_asset_id) BETWEEN 1 AND 64 AND
   selected_cover_asset_id NOT GLOB '*[^a-z0-9_-]*')),
 selection_revision INTEGER NOT NULL DEFAULT 1 CHECK (
  typeof(selection_revision)='integer' AND
  selection_revision BETWEEN 1 AND 9007199254740991),
 updated_at TEXT NOT NULL,
 PRIMARY KEY(account_id,trip_id)
);
INSERT INTO account_trip_cover_preferences
 (account_id,trip_id,selected_cover_asset_id,selection_revision,updated_at)
 SELECT account_id,id,selected_cover_asset_id,1,created_at
 FROM local_trip_containers;
-- Preserve historical photo rows even if an earlier FK-disabled client left an
-- orphan. A preference root stores no membership or read authority.
INSERT OR IGNORE INTO account_trip_cover_preferences
 (account_id,trip_id,selected_cover_asset_id,selection_revision,updated_at)
 SELECT account_id,trip_id,NULL,1,MIN(created_at)
 FROM local_trip_photos GROUP BY account_id,trip_id;

CREATE TABLE local_trip_photos_cover_parent_next (
 account_id TEXT NOT NULL, trip_id TEXT NOT NULL, asset_id TEXT NOT NULL,
 mime_type TEXT NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/heic','image/heif')),
 size_bytes INTEGER NOT NULL CHECK(size_bytes > 0 AND size_bytes <= 52428800),
 sha256 TEXT NOT NULL CHECK(length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
 local_uri TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(account_id,trip_id,asset_id),
 FOREIGN KEY(account_id,trip_id) REFERENCES account_trip_cover_preferences(account_id,trip_id) ON DELETE CASCADE
);
INSERT INTO local_trip_photos_cover_parent_next
 (account_id,trip_id,asset_id,mime_type,size_bytes,sha256,local_uri,created_at)
 SELECT account_id,trip_id,asset_id,mime_type,size_bytes,sha256,local_uri,created_at
 FROM local_trip_photos;
CREATE TEMP TABLE personal_cover70_copy_guard (
 ok INTEGER NOT NULL CHECK(ok=1)
);
INSERT INTO personal_cover70_copy_guard(ok)
 SELECT CASE WHEN
  (SELECT COUNT(*) FROM local_trip_photos) =
  (SELECT COUNT(*) FROM local_trip_photos_cover_parent_next)
  AND NOT EXISTS(SELECT account_id,trip_id,asset_id,mime_type,size_bytes,sha256,local_uri,created_at FROM local_trip_photos
                 EXCEPT SELECT account_id,trip_id,asset_id,mime_type,size_bytes,sha256,local_uri,created_at FROM local_trip_photos_cover_parent_next)
  AND NOT EXISTS(SELECT account_id,trip_id,asset_id,mime_type,size_bytes,sha256,local_uri,created_at FROM local_trip_photos_cover_parent_next
                 EXCEPT SELECT account_id,trip_id,asset_id,mime_type,size_bytes,sha256,local_uri,created_at FROM local_trip_photos)
  AND NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check('local_trip_photos_cover_parent_next'))
 THEN 1 ELSE 0 END;
DROP TABLE local_trip_photos;
ALTER TABLE local_trip_photos_cover_parent_next RENAME TO local_trip_photos;
CREATE INDEX local_trip_photos_account_trip_created
 ON local_trip_photos(account_id,trip_id,created_at DESC,asset_id);

-- One-way compatibility only. Older clients continue writing their legacy
-- column; a root-first modern CAS followed by the same raw does not increment
-- twice. No reverse trigger and no recursive write loop.
CREATE TRIGGER local_trip_cover_preference_init
AFTER INSERT ON local_trip_containers
BEGIN
 INSERT INTO account_trip_cover_preferences
  (account_id,trip_id,selected_cover_asset_id,selection_revision,updated_at)
 VALUES(NEW.account_id,NEW.id,NEW.selected_cover_asset_id,1,NEW.updated_at)
 ON CONFLICT(account_id,trip_id) DO NOTHING;
 -- Recreated local container must display the retained private root, not default NULL.
 UPDATE local_trip_containers SET selected_cover_asset_id=(
  SELECT selected_cover_asset_id FROM account_trip_cover_preferences
  WHERE account_id=NEW.account_id AND trip_id=NEW.id)
 WHERE account_id=NEW.account_id AND id=NEW.id AND selected_cover_asset_id IS NOT (
  SELECT selected_cover_asset_id FROM account_trip_cover_preferences
  WHERE account_id=NEW.account_id AND trip_id=NEW.id);
END;
CREATE TRIGGER local_trip_cover_preference_legacy_update
AFTER UPDATE OF selected_cover_asset_id ON local_trip_containers
WHEN NEW.selected_cover_asset_id IS NOT OLD.selected_cover_asset_id
BEGIN
 INSERT INTO account_trip_cover_preferences
  (account_id,trip_id,selected_cover_asset_id,selection_revision,updated_at)
 VALUES(NEW.account_id,NEW.id,NEW.selected_cover_asset_id,1,NEW.updated_at)
 ON CONFLICT(account_id,trip_id) DO UPDATE SET
  selected_cover_asset_id=excluded.selected_cover_asset_id,
  selection_revision=account_trip_cover_preferences.selection_revision+1,
  updated_at=excluded.updated_at
 WHERE account_trip_cover_preferences.selected_cover_asset_id IS NOT excluded.selected_cover_asset_id;
END;

INSERT INTO personal_cover70_copy_guard(ok)
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check('local_trip_photos'))
 THEN 1 ELSE 0 END;
DROP TABLE personal_cover70_copy_guard;
`,
};
