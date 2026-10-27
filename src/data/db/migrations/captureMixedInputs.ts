import type { Migration } from "../migrations";
import { captureBatchAssessmentObservationsMigration } from "./captureBatchAssessmentObservations";
import { captureSubmissionsMigration } from "./captureSubmissions";
import { captureProcessingMigration } from "./captureProcessing";
import { captureLocalInterpretationMigration } from "./captureLocalInterpretation";
import { localCoreAuthorityMigration } from "./localCoreAuthority";
import { captureCameraInputsMigration } from "./captureCameraInputs";

const header = captureSubmissionsMigration.sql.split(
  "CREATE TABLE capture_submission_inputs",
)[0];
const headerTable = header.slice(0, header.indexOf("CREATE INDEX"));
const headerGuards = header.slice(header.indexOf("CREATE INDEX"));
const assessmentGuard = captureBatchAssessmentObservationsMigration.sql.match(
  /CREATE TRIGGER capture_assessment_parent[\s\S]*?END;/,
)![0];
const trigger = (sql: string, name: string) => {
  const start = sql.indexOf("CREATE TRIGGER " + name);
  return sql.slice(start, sql.indexOf("\nEND;", start) + 6);
};
const processingGuard = trigger(
  captureProcessingMigration.sql,
  "capture_processing_queue_insert",
);
const localGuard = trigger(
  captureLocalInterpretationMigration.sql,
  "capture_local_queue_insert",
);
const reviewMaterialGuard = localCoreAuthorityMigration.sql
  .split("\n")
  .find((line) => line.startsWith("CREATE TRIGGER local_core_review_material_scope "))!;
const mixedInputs = captureCameraInputsMigration.sql
  .replaceAll("capture_submission_inputs_camera", "capture_submission_inputs_mixed")
  .replace(
    "acquisition_source IN ('files','photos','camera')",
    "acquisition_source IN ('files','photos','camera','magic_input','clipboard')",
  )
  .replace(
    "CHECK(acquisition_source!='camera' OR kind='IMAGE')",
    "CHECK(acquisition_source NOT IN ('camera','clipboard') OR kind='IMAGE') CHECK(acquisition_source!='magic_input' OR kind='TEXT')",
  )
  .replaceAll(
    "OR (NEW.continues_from_input_id IS NOT NULL",
    "OR (NEW.acquisition_source IN ('magic_input','clipboard') AND NOT EXISTS(SELECT 1 FROM capture_submission_batches b WHERE b.account_id=NEW.account_id AND b.batch_id=NEW.batch_id AND b.format_version=2 AND b.manifest_version=2))\nOR (NEW.continues_from_input_id IS NOT NULL",
  );

// Copy/swap preserves every old immutable header/input byte, ordinal and lineage.
// migrationRunner disables/restores FK only around this reviewed atomic rebuild.
export const captureMixedInputsMigration: Migration = {
  id: 73,
  name: "capture_mixed_inputs_v2",
  sql: `
DROP TRIGGER capture_assessment_parent;
DROP TRIGGER capture_processing_queue_insert;
DROP TRIGGER capture_local_queue_insert;
DROP TRIGGER local_core_review_material_scope;
DROP TRIGGER capture_submission_roster_insert;
DROP TRIGGER capture_submission_roster_update;
${headerTable.replaceAll("capture_submission_batches", "capture_submission_batches_mixed").replaceAll("BETWEEN 1 AND 1", "BETWEEN 1 AND 2").replace("CHECK(batch_id!=job_id)", "CHECK(batch_id!=job_id), CHECK(format_version=manifest_version)")}
INSERT INTO capture_submission_batches_mixed (rowid,account_id,batch_id,job_id,submission_key,context_id,format_version,manifest_version,request_sha256,manifest_sha256,created_at,context_json,manifest_json) SELECT rowid,account_id,batch_id,job_id,submission_key,context_id,format_version,manifest_version,request_sha256,manifest_sha256,created_at,context_json,manifest_json FROM capture_submission_batches;
DROP TABLE capture_submission_batches;
ALTER TABLE capture_submission_batches_mixed RENAME TO capture_submission_batches;
${headerGuards}
${assessmentGuard}
${mixedInputs}
${processingGuard}
${localGuard}
${reviewMaterialGuard}
`,
};
