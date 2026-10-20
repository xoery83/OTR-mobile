import type { Migration } from "../migrations";
// Rebuild only the source CHECK; the runner makes this copy/swap/guard restoration atomic.
export const captureCameraInputsMigration: Migration = {
  id: 64,
  name: "capture_camera_inputs",
  sql: `
DROP TRIGGER capture_submission_capture_retained;
DROP TRIGGER capture_submission_payload_retained;
CREATE TABLE capture_submission_inputs_camera (
account_id TEXT NOT NULL CHECK(length(account_id) BETWEEN 1 AND 128),
input_id TEXT NOT NULL CHECK(length(input_id)=36 AND input_id NOT GLOB '*[^a-f0-9-]*' AND substr(input_id,9,1)='-' AND substr(input_id,14,1)='-' AND substr(input_id,19,1)='-' AND substr(input_id,24,1)='-'),
batch_id TEXT NOT NULL CHECK(length(batch_id)=36 AND batch_id NOT GLOB '*[^a-f0-9-]*' AND substr(batch_id,9,1)='-' AND substr(batch_id,14,1)='-' AND substr(batch_id,19,1)='-' AND substr(batch_id,24,1)='-'),
item_key TEXT NOT NULL CHECK(length(item_key)=36 AND item_key NOT GLOB '*[^a-f0-9-]*' AND substr(item_key,9,1)='-' AND substr(item_key,14,1)='-' AND substr(item_key,19,1)='-' AND substr(item_key,24,1)='-'),
ordinal BLOB NOT NULL CHECK(typeof(ordinal)='integer' AND ordinal BETWEEN 0 AND 9007199254740991),
declaration_sha256 TEXT NOT NULL CHECK(length(declaration_sha256)=64 AND declaration_sha256 NOT GLOB '*[^a-f0-9]*'),
acquisition_source TEXT NOT NULL CHECK(acquisition_source IN ('files','photos','camera')),
kind TEXT NOT NULL CHECK(kind IN ('FILE','IMAGE','TEXT')) CHECK(acquisition_source!='camera' OR kind='IMAGE'),
original_filename TEXT CHECK(original_filename IS NULL OR length(original_filename)<=1024),
declared_content_type TEXT CHECK(declared_content_type IS NULL OR length(declared_content_type)<=255),
continues_from_input_id TEXT,
row_revision BLOB NOT NULL CHECK(typeof(row_revision)='integer' AND row_revision BETWEEN 1 AND 9007199254740991),
content_sha256 TEXT CHECK(content_sha256 IS NULL OR (length(content_sha256)=64 AND content_sha256 NOT GLOB '*[^a-f0-9]*')),
content_byte_count BLOB CHECK(content_byte_count IS NULL OR (typeof(content_byte_count)='integer' AND content_byte_count BETWEEN 1 AND CASE WHEN kind='TEXT' THEN 1048576 ELSE 10485760 END)),
acceptance_state TEXT NOT NULL CHECK(acceptance_state IN ('PENDING','ACCEPTED','FAILED')),
pending_reason TEXT CHECK(pending_reason IS NULL OR pending_reason IN ('READ','RECOVER_COMMIT','REACQUIRE')),
failure_code TEXT CHECK(failure_code IS NULL OR failure_code IN ('EMPTY_PAYLOAD','PAYLOAD_TOO_LARGE','READER_FAILURE','INVALID_UTF8','HASH_FAILURE','ROW_QUOTA','ACCOUNT_BYTE_QUOTA','DEVICE_BYTE_QUOTA','CONTENT_MISMATCH')),
capture_id TEXT,
accepted_payload_id TEXT,
accepted_capture_revision BLOB CHECK(accepted_capture_revision IS NULL OR (typeof(accepted_capture_revision)='integer' AND accepted_capture_revision BETWEEN 1 AND 9007199254740991)),
accepted_at TEXT,
CHECK((content_sha256 IS NULL)=(content_byte_count IS NULL)),
CHECK((acceptance_state='PENDING')=(pending_reason IS NOT NULL)),
CHECK((acceptance_state='FAILED')=(failure_code IS NOT NULL)),
CHECK((acceptance_state='ACCEPTED' AND capture_id IS NOT NULL AND accepted_payload_id IS NOT NULL AND accepted_capture_revision IS NOT NULL AND accepted_at IS NOT NULL AND content_sha256 IS NOT NULL) OR (acceptance_state!='ACCEPTED' AND capture_id IS NULL AND accepted_payload_id IS NULL AND accepted_capture_revision IS NULL AND accepted_at IS NULL)),
PRIMARY KEY(account_id,input_id),
UNIQUE(account_id,item_key),
UNIQUE(account_id,batch_id,ordinal),
FOREIGN KEY(account_id,batch_id) REFERENCES capture_submission_batches(account_id,batch_id),
FOREIGN KEY(account_id,continues_from_input_id) REFERENCES capture_submission_inputs_camera(account_id,input_id),
FOREIGN KEY(account_id,capture_id) REFERENCES local_capture_inbox(account_id,id),
FOREIGN KEY(account_id,accepted_payload_id) REFERENCES local_capture_payloads(account_id,id));
INSERT INTO capture_submission_inputs_camera (rowid,account_id,input_id,batch_id,item_key,ordinal,declaration_sha256,acquisition_source,kind,original_filename,declared_content_type,continues_from_input_id,row_revision,content_sha256,content_byte_count,acceptance_state,pending_reason,failure_code,capture_id,accepted_payload_id,accepted_capture_revision,accepted_at)
SELECT rowid,account_id,input_id,batch_id,item_key,ordinal,declaration_sha256,acquisition_source,kind,original_filename,declared_content_type,continues_from_input_id,row_revision,content_sha256,content_byte_count,acceptance_state,pending_reason,failure_code,capture_id,accepted_payload_id,accepted_capture_revision,accepted_at FROM capture_submission_inputs;
DROP TABLE capture_submission_inputs;
ALTER TABLE capture_submission_inputs_camera RENAME TO capture_submission_inputs;
CREATE UNIQUE INDEX capture_submission_capture_binding ON capture_submission_inputs(account_id,capture_id) WHERE capture_id IS NOT NULL;
CREATE INDEX capture_submission_continuity ON capture_submission_inputs(account_id,continues_from_input_id);
CREATE TRIGGER capture_submission_input_delete BEFORE DELETE ON capture_submission_inputs BEGIN SELECT RAISE(ABORT,'CAPTURE_SUBMISSION_RETAINED'); END;
CREATE TRIGGER capture_submission_roster_insert BEFORE INSERT ON capture_submission_inputs
WHEN NOT EXISTS(SELECT 1 FROM capture_submission_batches b WHERE b.account_id=NEW.account_id AND b.batch_id=NEW.batch_id AND json_extract(b.manifest_json,'$['||NEW.ordinal||'].id') IS NEW.input_id AND json_extract(b.manifest_json,'$['||NEW.ordinal||'].itemKey') IS NEW.item_key AND json_extract(b.manifest_json,'$['||NEW.ordinal||'].ordinal') IS NEW.ordinal AND json_extract(b.manifest_json,'$['||NEW.ordinal||'].acquisitionSource') IS NEW.acquisition_source AND json_extract(b.manifest_json,'$['||NEW.ordinal||'].kind') IS NEW.kind AND json_extract(b.manifest_json,'$['||NEW.ordinal||'].originalFilename') IS NEW.original_filename AND json_extract(b.manifest_json,'$['||NEW.ordinal||'].declaredContentType') IS NEW.declared_content_type AND json_extract(b.manifest_json,'$['||NEW.ordinal||'].continuesFromInputId') IS NEW.continues_from_input_id)
OR (NEW.continues_from_input_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM capture_submission_inputs p JOIN capture_submission_batches predecessor_header ON predecessor_header.account_id=p.account_id AND predecessor_header.batch_id=p.batch_id JOIN capture_submission_batches current ON current.account_id=NEW.account_id AND current.batch_id=NEW.batch_id WHERE p.account_id=NEW.account_id AND p.input_id=NEW.continues_from_input_id AND predecessor_header.rowid<current.rowid))
BEGIN SELECT RAISE(ABORT,'CAPTURE_SUBMISSION_ROSTER'); END;
CREATE TRIGGER capture_submission_roster_update BEFORE UPDATE ON capture_submission_inputs
WHEN NOT EXISTS(SELECT 1 FROM capture_submission_batches b WHERE b.account_id=NEW.account_id AND b.batch_id=NEW.batch_id AND json_extract(b.manifest_json,'$['||NEW.ordinal||'].id') IS NEW.input_id AND json_extract(b.manifest_json,'$['||NEW.ordinal||'].itemKey') IS NEW.item_key AND json_extract(b.manifest_json,'$['||NEW.ordinal||'].ordinal') IS NEW.ordinal AND json_extract(b.manifest_json,'$['||NEW.ordinal||'].acquisitionSource') IS NEW.acquisition_source AND json_extract(b.manifest_json,'$['||NEW.ordinal||'].kind') IS NEW.kind AND json_extract(b.manifest_json,'$['||NEW.ordinal||'].originalFilename') IS NEW.original_filename AND json_extract(b.manifest_json,'$['||NEW.ordinal||'].declaredContentType') IS NEW.declared_content_type AND json_extract(b.manifest_json,'$['||NEW.ordinal||'].continuesFromInputId') IS NEW.continues_from_input_id)
OR (NEW.continues_from_input_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM capture_submission_inputs p JOIN capture_submission_batches predecessor_header ON predecessor_header.account_id=p.account_id AND predecessor_header.batch_id=p.batch_id JOIN capture_submission_batches current ON current.account_id=NEW.account_id AND current.batch_id=NEW.batch_id WHERE p.account_id=NEW.account_id AND p.input_id=NEW.continues_from_input_id AND predecessor_header.rowid<current.rowid))
BEGIN SELECT RAISE(ABORT,'CAPTURE_SUBMISSION_ROSTER'); END;
CREATE TRIGGER capture_submission_initial BEFORE INSERT ON capture_submission_inputs
WHEN NEW.row_revision!=1 OR NEW.acceptance_state!='PENDING' OR NEW.pending_reason!='READ' OR NEW.content_sha256 IS NOT NULL
BEGIN SELECT RAISE(ABORT,'CAPTURE_SUBMISSION_INITIAL'); END;
CREATE TRIGGER capture_submission_input_update BEFORE UPDATE ON capture_submission_inputs
WHEN NEW.account_id IS NOT OLD.account_id OR NEW.input_id IS NOT OLD.input_id OR NEW.batch_id IS NOT OLD.batch_id OR NEW.item_key IS NOT OLD.item_key OR NEW.ordinal IS NOT OLD.ordinal OR NEW.declaration_sha256 IS NOT OLD.declaration_sha256 OR NEW.acquisition_source IS NOT OLD.acquisition_source OR NEW.kind IS NOT OLD.kind OR NEW.original_filename IS NOT OLD.original_filename OR NEW.declared_content_type IS NOT OLD.declared_content_type OR NEW.continues_from_input_id IS NOT OLD.continues_from_input_id OR NEW.row_revision!=OLD.row_revision+1 OR OLD.acceptance_state='ACCEPTED' OR (OLD.content_sha256 IS NOT NULL AND (NEW.content_sha256 IS NOT OLD.content_sha256 OR NEW.content_byte_count IS NOT OLD.content_byte_count))
BEGIN SELECT RAISE(ABORT,'CAPTURE_SUBMISSION_INPUT_IMMUTABLE'); END;
CREATE TRIGGER capture_submission_acceptance BEFORE UPDATE ON capture_submission_inputs
WHEN NEW.acceptance_state='ACCEPTED' AND NOT EXISTS(SELECT 1 FROM local_capture_inbox c JOIN local_capture_payloads p ON p.account_id=c.account_id AND p.id=c.payload_id WHERE c.account_id=NEW.account_id AND c.id=NEW.capture_id AND c.payload_id=NEW.accepted_payload_id AND c.revision=NEW.accepted_capture_revision AND c.kind=NEW.kind AND c.original_filename IS NEW.original_filename AND c.declared_content_type IS NEW.declared_content_type AND c.trip_id IS NULL AND p.sha256=NEW.content_sha256 AND p.byte_count=NEW.content_byte_count)
BEGIN SELECT RAISE(ABORT,'CAPTURE_SUBMISSION_BINDING'); END;
CREATE TRIGGER capture_submission_capture_retained BEFORE DELETE ON local_capture_inbox
WHEN EXISTS(SELECT 1 FROM capture_submission_inputs WHERE account_id=OLD.account_id AND capture_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'CAPTURE_SUBMISSION_RETAINED'); END;
CREATE TRIGGER capture_submission_payload_retained BEFORE DELETE ON local_capture_payloads
WHEN EXISTS(SELECT 1 FROM capture_submission_inputs WHERE account_id=OLD.account_id AND accepted_payload_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'CAPTURE_SUBMISSION_RETAINED'); END;
`,
};
