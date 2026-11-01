import type { Migration } from "../migrations";
import { capturePhotoCurrentOriginal } from "./capturePhotoImportDecisions";

// Keep migration75 unchanged; only the local Photo decision's FILE/PNG compatibility changes.
const currentOriginal = capturePhotoCurrentOriginal.replace(
  "AND i.acceptance_state='ACCEPTED' AND i.kind='IMAGE' AND c.kind='IMAGE'",
  "AND i.acceptance_state='ACCEPTED' AND c.kind=i.kind AND (i.kind='IMAGE' OR (i.kind='FILE' AND i.declared_content_type='image/png'))",
);
export const capturePhotoPngFilesMigration: Migration = {
  id: 76,
  name: "capture_photo_png_files",
  sql: `
DROP TRIGGER capture_photo_decision_scope_insert;
DROP TRIGGER capture_photo_decision_scope_update;
CREATE TRIGGER capture_photo_decision_scope_insert BEFORE INSERT ON capture_photo_import_decisions
 WHEN NOT EXISTS(${currentOriginal}) BEGIN SELECT RAISE(ABORT,'PHOTO_DECISION_ORIGINAL_CHANGED'); END;
CREATE TRIGGER capture_photo_decision_scope_update BEFORE UPDATE ON capture_photo_import_decisions
 WHEN NOT EXISTS(${currentOriginal}) BEGIN SELECT RAISE(ABORT,'PHOTO_DECISION_ORIGINAL_CHANGED'); END;
`,
};
