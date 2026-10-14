import type { Migration } from "../migrations";
export const updatesInboxMigration: Migration = {
  id: 63,
  name: "updates_inbox_capture_failures",
  sql: `
CREATE TABLE updates_capture_intake (
 account_id TEXT NOT NULL,
 notification_id TEXT NOT NULL,
 job_id TEXT NOT NULL,
 batch_id TEXT NOT NULL,
 material_version INTEGER NOT NULL CHECK(typeof(material_version)='integer' AND material_version>0),
 created_at TEXT NOT NULL,
 failure_facts_json TEXT NOT NULL CHECK(json_valid(failure_facts_json) AND json_type(failure_facts_json)='array'),
 read_material_version INTEGER NOT NULL DEFAULT 0 CHECK(typeof(read_material_version)='integer' AND read_material_version>=0 AND read_material_version<=material_version),
 PRIMARY KEY(account_id,notification_id),
 UNIQUE(account_id,batch_id),
 FOREIGN KEY(account_id,job_id) REFERENCES capture_submission_batches(account_id,job_id),
 FOREIGN KEY(account_id,batch_id) REFERENCES capture_submission_batches(account_id,batch_id),
 CHECK(notification_id='capture-intake:'||job_id)
);
CREATE INDEX updates_capture_listing ON updates_capture_intake(account_id,created_at DESC,notification_id DESC);
CREATE TRIGGER updates_capture_identity BEFORE UPDATE ON updates_capture_intake
WHEN NEW.account_id IS NOT OLD.account_id OR NEW.notification_id IS NOT OLD.notification_id
 OR NEW.job_id IS NOT OLD.job_id OR NEW.batch_id IS NOT OLD.batch_id OR NEW.created_at IS NOT OLD.created_at
 OR NEW.material_version<OLD.material_version OR NEW.read_material_version<OLD.read_material_version
BEGIN SELECT RAISE(ABORT,'UPDATES_IMMUTABLE_IDENTITY'); END;
`,
};
