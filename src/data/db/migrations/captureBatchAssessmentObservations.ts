import type { Migration } from "../migrations";
export const captureBatchAssessmentObservationsMigration: Migration = {
  id: 52,
  name: "capture_batch_assessment_observations",
  sql: `
CREATE TABLE capture_batch_assessment_observations (
  account_id TEXT NOT NULL CHECK(typeof(account_id)='text' AND length(account_id) BETWEEN 1 AND 128),
  batch_id TEXT NOT NULL CHECK(typeof(batch_id)='text'),
  job_id TEXT NOT NULL CHECK(typeof(job_id)='text'),
  format_version BLOB NOT NULL CHECK(typeof(format_version)='integer' AND format_version=1),
  assessment_revision BLOB NOT NULL CHECK(typeof(assessment_revision)='integer' AND assessment_revision BETWEEN 1 AND 9007199254740991),
  c2_manifest_sha256 TEXT NOT NULL CHECK(typeof(c2_manifest_sha256)='text' AND length(c2_manifest_sha256)=64 AND c2_manifest_sha256 NOT GLOB '*[^a-f0-9]*'),
  c4_manifest_sha256 TEXT NOT NULL CHECK(typeof(c4_manifest_sha256)='text' AND length(c4_manifest_sha256)=64 AND c4_manifest_sha256 NOT GLOB '*[^a-f0-9]*'),
  snapshot_sha256 TEXT NOT NULL CHECK(typeof(snapshot_sha256)='text' AND length(snapshot_sha256)=64 AND snapshot_sha256 NOT GLOB '*[^a-f0-9]*'),
  body_sha256 TEXT NOT NULL CHECK(typeof(body_sha256)='text' AND length(body_sha256)=64 AND body_sha256 NOT GLOB '*[^a-f0-9]*'),
  parent_body_sha256 TEXT CHECK(parent_body_sha256 IS NULL OR (typeof(parent_body_sha256)='text' AND length(parent_body_sha256)=64 AND parent_body_sha256 NOT GLOB '*[^a-f0-9]*')),
  body_json TEXT NOT NULL CHECK(typeof(body_json)='text' AND json_valid(body_json) AND json_type(body_json)='object' AND length(CAST(body_json AS BLOB)) BETWEEN 1 AND 2097152),
  CHECK(batch_id<>job_id),
  CHECK((assessment_revision=1 AND parent_body_sha256 IS NULL) OR (assessment_revision>1 AND parent_body_sha256 IS NOT NULL)),
  PRIMARY KEY(account_id,batch_id,assessment_revision),
  FOREIGN KEY(account_id,batch_id) REFERENCES capture_submission_batches(account_id,batch_id)
);
CREATE TRIGGER capture_assessment_no_update
BEFORE UPDATE ON capture_batch_assessment_observations
BEGIN SELECT RAISE(ABORT,'C4_OBSERVATION_IMMUTABLE'); END;
CREATE TRIGGER capture_assessment_no_delete
BEFORE DELETE ON capture_batch_assessment_observations
BEGIN SELECT RAISE(ABORT,'C4_OBSERVATION_RETAINED'); END;
CREATE TRIGGER capture_assessment_parent
BEFORE INSERT ON capture_batch_assessment_observations
WHEN NOT EXISTS (
  SELECT 1 FROM capture_submission_batches b
  WHERE b.account_id=NEW.account_id AND b.batch_id=NEW.batch_id
    AND b.job_id=NEW.job_id AND b.manifest_version=1
    AND b.manifest_sha256=NEW.c2_manifest_sha256
    AND b.request_sha256 IS json_extract(NEW.body_json,'$.c2RequestSha256')
)
BEGIN SELECT RAISE(ABORT,'C4_OBSERVATION_C2_BINDING'); END;
CREATE TRIGGER capture_assessment_contiguous
BEFORE INSERT ON capture_batch_assessment_observations
WHEN NEW.assessment_revision IS NOT (
  SELECT COALESCE(MAX(assessment_revision),0)+1
  FROM capture_batch_assessment_observations
  WHERE account_id=NEW.account_id AND batch_id=NEW.batch_id
) OR NEW.parent_body_sha256 IS NOT (
  SELECT body_sha256 FROM capture_batch_assessment_observations
  WHERE account_id=NEW.account_id AND batch_id=NEW.batch_id
  ORDER BY assessment_revision DESC LIMIT 1
)
BEGIN SELECT RAISE(ABORT,'C4_OBSERVATION_REVISION'); END;
`,
};
