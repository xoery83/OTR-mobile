import type { Migration } from "../migrations";
import { capturePhotoDecisionCurrentOriginalSql } from "./capturePhotoImportDecisions";

const oldKindGuard = "i.kind='IMAGE' AND c.kind='IMAGE'";
if (capturePhotoDecisionCurrentOriginalSql.split(oldKindGuard).length !== 2)
  throw Error("PHOTO_DECISION_KIND_GUARD_PREIMAGE_CHANGED");
const currentOriginal = capturePhotoDecisionCurrentOriginalSql.replace(
  oldKindGuard,
  "i.kind=c.kind AND (i.kind='IMAGE' OR (i.kind='FILE' AND i.declared_content_type='image/png'))",
);
// Unique migration Writer assigns the next ID; no stored rows or old SQL change.
export const captureFilePngPhotoDecisionsDefinition: Omit<Migration, "id"> = {
  name: "capture_file_png_photo_decisions",
  sql: `
DROP TRIGGER capture_photo_decision_scope_insert;
DROP TRIGGER capture_photo_decision_scope_update;
CREATE TRIGGER capture_photo_decision_scope_insert BEFORE INSERT ON capture_photo_import_decisions
 WHEN NOT EXISTS(${currentOriginal}) BEGIN SELECT RAISE(ABORT,'PHOTO_DECISION_ORIGINAL_CHANGED'); END;
CREATE TRIGGER capture_photo_decision_scope_update BEFORE UPDATE ON capture_photo_import_decisions
 WHEN NOT EXISTS(${currentOriginal}) BEGIN SELECT RAISE(ABORT,'PHOTO_DECISION_ORIGINAL_CHANGED'); END;
`,
};
