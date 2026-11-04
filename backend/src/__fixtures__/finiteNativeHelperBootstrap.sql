-- Deliberately synthetic helper boundary fixture, not a Source/proof integration fixture.
CREATE ROLE otr_trip_source_writer NOLOGIN;
CREATE ROLE otr_trip_source_command_gateway LOGIN NOINHERIT PASSWORD 'local-source-synthetic-only';
GRANT otr_trip_source_writer TO postgres WITH SET TRUE;
GRANT otr_trip_source_writer TO otr_trip_source_command_gateway WITH SET TRUE;
GRANT CREATE ON SCHEMA public TO otr_trip_source_writer;
SET ROLE otr_trip_source_writer;
CREATE TABLE public.trip_source_universal_scope(singleton boolean PRIMARY KEY CHECK(singleton),actor_id uuid,trip_id uuid,batch_id uuid,task_id uuid,run_id uuid,submission_sha256 text,input_sha256 text,starts_at timestamptz,expires_at timestamptz);
CREATE TABLE public.trip_source_runs(id uuid PRIMARY KEY,actor_account_id uuid,trip_id uuid,capture_batch_id uuid,interpretation_task_id uuid,capture_submission_sha256 text,extractor_key text,state text,retention_state text,superseded_by uuid,scope_source_ids uuid[],input_sha256 text,extractor_version text,operation_key text,extractor_options_sha256 text);
CREATE TABLE public.trip_source_inputs(id uuid,source_id uuid,material_revision bigint,representation_id uuid,payload_sha256 text,byte_count bigint,observed_source_row_revision bigint,historical_selection boolean,run_id uuid,confirmation_id uuid);
CREATE TABLE public.trip_source_representations(id uuid,source_id uuid,role text,transform_key text,mime_type text);
CREATE TABLE public.qa_proofs(id uuid PRIMARY KEY,actor uuid,trip uuid,facts jsonb,valid boolean);
CREATE FUNCTION public.trip_event_keys(q jsonb,keys text[]) RETURNS boolean LANGUAGE sql AS $$SELECT ARRAY(SELECT jsonb_object_keys(q) ORDER BY 1)=ARRAY(SELECT unnest(keys) ORDER BY 1)$$;
-- Hash/proof test doubles explicitly isolate the new guards from production proof internals.
CREATE FUNCTION public.trip_import_run_input_hash(pins jsonb) RETURNS text LANGUAGE sql AS $$SELECT encode(sha256(convert_to(pins::text,'UTF8')),'hex')$$;
CREATE FUNCTION public.trip_source_universal_pdf_material(actor uuid,trip uuid,pin public.trip_source_inputs,normalize_original boolean,writing boolean) RETURNS jsonb LANGUAGE sql AS $$SELECT q.facts FROM public.qa_proofs q WHERE q.id=($3).representation_id AND q.actor=$1 AND q.trip=$2 AND valid$$;
CREATE FUNCTION public.trip_source_png_original_facts(actor uuid,trip uuid,source uuid,rep uuid,revision bigint) RETURNS jsonb LANGUAGE sql AS $$SELECT q.facts FROM public.qa_proofs q WHERE q.id=$4 AND q.actor=$1 AND q.trip=$2 AND valid$$;

CREATE TABLE public.qa_acl(allowed boolean);INSERT INTO public.qa_acl VALUES(true);
CREATE FUNCTION public.trip_source_lock_universal_actor(actor uuid,trip uuid,writing boolean) RETURNS boolean LANGUAGE sql AS $$SELECT allowed FROM public.qa_acl$$;
CREATE FUNCTION public.trip_import_input_valid(pin public.trip_source_inputs,actor uuid,trip uuid,live boolean) RETURNS boolean LANGUAGE sql AS $$SELECT ($1).historical_selection IS FALSE AND EXISTS(SELECT 1 FROM public.trip_source_representations r WHERE r.id=($1).representation_id AND r.source_id=($1).source_id)$$;
