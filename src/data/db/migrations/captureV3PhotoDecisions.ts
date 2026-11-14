import type { Migration } from "../migrations";
import { capturePhotoDecisionCurrentOriginalSql } from "./capturePhotoImportDecisions";

const legacyKind = "i.kind='IMAGE' AND c.kind='IMAGE'";
if (capturePhotoDecisionCurrentOriginalSql.split(legacyKind).length !== 2)
  throw Error("PHOTO_DECISION_KIND_GUARD_PREIMAGE_CHANGED");
const currentOriginal = capturePhotoDecisionCurrentOriginalSql.replace(
  legacyKind,
  "i.kind=c.kind AND i.kind IN ('IMAGE','FILE') AND i.declared_content_type IN ('image/png','image/jpeg','image/webp','image/gif')",
);

export const captureV3PhotoDecisionsMigration: Migration = {
  id: 78,
  name: "capture_v3_photo_decisions",
  sql: `
DROP TRIGGER capture_photo_decision_scope_insert;
DROP TRIGGER capture_photo_decision_scope_update;
CREATE TRIGGER capture_photo_decision_scope_insert BEFORE INSERT ON capture_photo_import_decisions
 WHEN NOT EXISTS(${currentOriginal}) BEGIN SELECT RAISE(ABORT,'PHOTO_DECISION_ORIGINAL_CHANGED'); END;
CREATE TRIGGER capture_photo_decision_scope_update BEFORE UPDATE ON capture_photo_import_decisions
 WHEN NOT EXISTS(${currentOriginal}) BEGIN SELECT RAISE(ABORT,'PHOTO_DECISION_ORIGINAL_CHANGED'); END;
  `,
};
