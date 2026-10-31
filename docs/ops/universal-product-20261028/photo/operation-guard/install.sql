-- Exact default-CLOSED candidate. Owner approval and fresh DEV CAS required.
BEGIN;
SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='20s';
SELECT actor_account_id FROM public.trip_sustained_dev_policy WHERE actor_account_id='f4b059c5-8241-4ffb-aa15-37fa25474543' FOR UPDATE;
SELECT id FROM public.trip_sources WHERE id='2bf0294a-47df-4176-999f-0e352e34543c' FOR SHARE;
SELECT id FROM public.trip_source_representations WHERE id='27b93994-98f3-4f76-8d15-93a52a0aeb21' FOR SHARE;
DO $pre$ BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres' THEN RAISE EXCEPTION 'PHOTO_OPERATION_INSTALLER_IDENTITY';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=58756 AND oid='public.trip_source_operation_guard()'::regprocedure AND md5(pg_get_functiondef(oid))='87554d61b34d9ffee61d07bea8a23c43' AND proowner='postgres'::regrole AND proacl::text='{postgres=X/postgres,otr_trip_source_writer=X/postgres}' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog']) THEN RAISE EXCEPTION 'PHOTO_OPERATION_FUNCTION_DRIFT';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE actor_account_id='f4b059c5-8241-4ffb-aa15-37fa25474543' AND NOT universal_png_import_enabled AND universal_png_import_expires_at IS NULL) THEN RAISE EXCEPTION 'PHOTO_OPERATION_NOT_CLOSED';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.trip_sources WHERE id='2bf0294a-47df-4176-999f-0e352e34543c' AND trip_id='825f79b2-4a9d-4535-a62e-43000ca50c4a' AND acquired_by='f4b059c5-8241-4ffb-aa15-37fa25474543' AND row_revision=1 AND current_material_revision=1 AND lifecycle='ACTIVE' AND retention_state='RETAINED') OR NOT EXISTS(SELECT 1 FROM public.trip_source_representations WHERE id='27b93994-98f3-4f76-8d15-93a52a0aeb21' AND source_id='2bf0294a-47df-4176-999f-0e352e34543c' AND row_revision=1 AND role='ORIGINAL' AND material_kind='BINARY' AND mime_type='image/png' AND payload_sha256='078de830361d65bb3890b43fb30646aa6e6ebfa7088a0f2dc4c7bd7b343fa515' AND byte_count=42630 AND remote_state='PENDING' AND retention_state='RETAINED') OR NOT EXISTS(SELECT 1 FROM public.trip_source_operations WHERE id='37d5cd82-f6bf-433c-8031-47fc00f509c0' AND source_id='2bf0294a-47df-4176-999f-0e352e34543c' AND actor_account_id='f4b059c5-8241-4ffb-aa15-37fa25474543' AND trip_id='825f79b2-4a9d-4535-a62e-43000ca50c4a' AND command='ACQUIRE_SOURCE' AND phase='FINAL' AND outcome='APPLIED') THEN RAISE EXCEPTION 'PHOTO_OPERATION_RETAINED_SOURCE_DRIFT';END IF;
 IF EXISTS(SELECT 1 FROM public.trip_source_operations WHERE source_id='2bf0294a-47df-4176-999f-0e352e34543c' AND id<>'37d5cd82-f6bf-433c-8031-47fc00f509c0') THEN RAISE EXCEPTION 'PHOTO_OPERATION_ACCEPTED_NO_REVERSE';END IF;
 IF md5(pg_get_functiondef('public.trip_source_png_operation(uuid,text,text,jsonb,jsonb)'::regprocedure)) IS DISTINCT FROM '5d40339e0af17a04886678c6340edba9' THEN RAISE EXCEPTION 'PHOTO_OPERATION_DEPENDENCY_DRIFT';END IF;
 IF md5(pg_get_functiondef('public.trip_source_png_enter(uuid,text,text)'::regprocedure)) IS DISTINCT FROM '00adef87c9580e5f11b63477b3cecc5a' THEN RAISE EXCEPTION 'PHOTO_OPERATION_DEPENDENCY_DRIFT';END IF;
 IF md5(pg_get_functiondef('public.trip_source_png_scope()'::regprocedure)) IS DISTINCT FROM 'fb3adf995affc8049930618fe30df30e' THEN RAISE EXCEPTION 'PHOTO_OPERATION_DEPENDENCY_DRIFT';END IF;
 IF md5(pg_get_functiondef('public.trip_source_universal_original_pin()'::regprocedure)) IS DISTINCT FROM '184156c3861e9f50697b88d6774f124d' THEN RAISE EXCEPTION 'PHOTO_OPERATION_PIN_DRIFT';END IF;
END $pre$;
CREATE TEMP TABLE photo_operation_graph ON COMMIT DROP AS SELECT * FROM pg_auth_members;
CREATE TEMP TABLE photo_operation_schema ON COMMIT DROP AS SELECT nspacl FROM pg_namespace WHERE nspname='public';
CREATE TEMP TABLE photo_operation_function ON COMMIT DROP AS SELECT oid,proowner,proacl,prosecdef,proconfig FROM pg_proc WHERE oid='public.trip_source_operation_guard()'::regprocedure;
CREATE OR REPLACE FUNCTION public.trip_source_operation_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$ declare mutable text[]:=array['phase','attempt_generation','attempt_id','worker_identity','admitted_at','io_finished_at','outcome','error_code','completed_at','result_source_row_revision','result_material_revision','result_representation_row_revision','result_remote_state','result_retention_state','result_action_id','result_verified_at','result_sha256'];
begin
 if current_user<>'otr_trip_source_writer' or session_user<>'otr_trip_source_command_gateway' or tg_op in ('DELETE','TRUNCATE') then
  raise exception 'TRIP_SOURCE_COMMANDS_DISABLED' using errcode='42501'; end if;
 if public.trip_source_universal_original_pin()->>'access'='READ_RECEIPT' then raise exception 'PDF_RECEIPT_READ_ONLY';end if;
 perform public.trip_source_assert_gate();
 if tg_level='STATEMENT' then return null; end if;
 
 if public.trip_source_universal_original_pin() is null then
 declare png_context jsonb:=public.trip_source_png_scope(); png_request jsonb; begin
  if png_context is null then perform public.trip_source_pdf_upload_v4_operation(new);
  else
   png_request:=png_context->'request';
   if png_context->>'access' is distinct from 'WRITE'
    or new.id::text is distinct from png_context->>'operation'
    or new.actor_account_id::text is distinct from png_context->>'actor'
    or new.trip_id::text is distinct from png_context->>'trip'
    or new.source_id::text is distinct from png_context->>'source'
    or new.representation_id::text is distinct from png_context->>'representation'
    or new.material_revision is distinct from (png_context->>'material')::bigint
    or new.operation_key is distinct from png_context->>'key'
    or new.operation_sha256 is distinct from png_context->>'digest'
    or new.command is distinct from png_context->>'command'
    or new.contract_version is distinct from 1::smallint
    or new.parent_operation_id is distinct from (png_request->'payload'->>'parent_operation_id')::uuid
    or new.expected_source_row_revision is distinct from (png_request->'payload'->>'expected_source_row_revision')::bigint
    or new.expected_representation_row_revision is distinct from (png_request->'payload'->>'expected_representation_row_revision')::bigint
    or new.expected_source_lifecycle is distinct from png_request->'payload'->'expected_source_state'->>'lifecycle'
    or new.expected_source_retention_state is distinct from png_request->'payload'->'expected_source_state'->>'retention_state'
    or new.expected_representation_remote_state is distinct from png_request->'payload'->'expected_representation_state'->>'remote_state'
    or new.expected_representation_retention_state is distinct from png_request->'payload'->'expected_representation_state'->>'retention_state'
   then raise exception 'PNG_OPERATION_SCOPE_MISMATCH';end if;
  end if;
 end;
 elsif tg_op<>'INSERT' or new.command<>'ACQUIRE_SOURCE' or new.id::text<>public.trip_source_universal_original_pin()->>'operationId' or new.actor_account_id::text<>public.trip_source_universal_original_pin()->>'actorId' or new.trip_id::text<>public.trip_source_universal_original_pin()->>'tripId' or new.source_id::text<>public.trip_source_universal_original_pin()->>'sourceId' or new.operation_key<>public.trip_source_universal_original_pin()->>'operationKey' or new.operation_sha256<>public.trip_source_universal_original_pin()->>'operationSha256' then raise exception 'UNIVERSAL_SOURCE_COMMAND_DENIED';end if;

 if tg_op='INSERT' then
  if new.phase not in ('ADMITTED','FINAL') or new.attempt_generation<>1 or new.attempt_id is not null or new.io_finished_at is not null then
   raise exception 'SOURCE_ATTEMPT_CONFLICT'; end if;
 elsif tg_op='UPDATE' then
  if old.phase='FINAL' or (to_jsonb(old)-mutable) is distinct from (to_jsonb(new)-mutable) then
   raise exception 'SOURCE_OPERATION_IMMUTABLE' using errcode='42501'; end if;
  if not (old.phase='ADMITTED' and new.phase in ('IO_ACTIVE','FINAL')
   or old.phase='IO_ACTIVE' and new.phase in ('IO_UNKNOWN','IO_QUIESCENT')
   or old.phase='IO_UNKNOWN' and new.phase='IO_QUIESCENT'
   or old.phase='IO_QUIESCENT' and new.phase in ('IO_ACTIVE','FINAL')
   or old.phase in ('IO_ACTIVE','IO_UNKNOWN') and new.phase='FINAL' and new.outcome='APPLIED' and new.result_remote_state='PENDING' and new.result_verified_at is null and new.result_action_id is null and (public.trip_source_pdf_beta_custody(old) or public.trip_source_pdf_reconciliation_custody_v1(old))) then raise exception 'SOURCE_PHASE_CONFLICT'; end if;
  if new.phase='IO_ACTIVE' then
   if new.attempt_generation<>old.attempt_generation+(case when old.phase='ADMITTED' then 0 else 1 end)
    or new.attempt_id is null or new.attempt_id is not distinct from old.attempt_id or new.worker_identity is distinct from session_user
    or new.admitted_at is null or new.io_finished_at is not null then raise exception 'SOURCE_ATTEMPT_CONFLICT'; end if;
  elsif new.attempt_generation<>old.attempt_generation or new.attempt_id is distinct from old.attempt_id
   or new.worker_identity is distinct from old.worker_identity or new.admitted_at is distinct from old.admitted_at then
   raise exception 'SOURCE_ATTEMPT_CONFLICT'; end if;
  if new.phase='FINAL' and new.io_finished_at is distinct from old.io_finished_at then raise exception 'SOURCE_ATTEMPT_CONFLICT'; end if;
 end if;
 if new.phase='FINAL' then
  if new.result_sha256 is distinct from public.trip_source_hash('otr-source-result-v1',public.trip_source_result_tuple(new)) then raise exception 'SOURCE_RESULT_INTEGRITY'; end if;
  if new.outcome<>'REJECTED' and (not exists(select 1 from public.trip_sources where id=new.source_id and trip_id=new.trip_id and acquired_by=new.actor_account_id)
   or not exists(select 1 from public.trip_source_representations r join public.trip_source_revisions v on v.source_id=r.source_id and v.material_revision=new.result_material_revision
    where r.id=new.representation_id and r.source_id=new.source_id and r.id=any(v.original_representation_ids))
   or new.result_action_id is not null and not exists(select 1 from public.trip_source_actions where id=new.result_action_id and source_id=new.source_id and actor_account_id=new.actor_account_id and operation_key=new.operation_key and operation_sha256=new.operation_sha256)) then raise exception 'SOURCE_RESULT_INTEGRITY'; end if;
 end if;
 return new;
end $function$
;

DO $post$ BEGIN
 IF (SELECT jsonb_agg(to_jsonb(m) ORDER BY roleid,member,grantor) FROM pg_auth_members m) IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(m) ORDER BY roleid,member,grantor) FROM photo_operation_graph m) OR (SELECT nspacl FROM pg_namespace WHERE nspname='public') IS DISTINCT FROM (SELECT nspacl FROM photo_operation_schema) THEN RAISE EXCEPTION 'PHOTO_OPERATION_PRIVILEGE_DRIFT';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN photo_operation_function f ON p.oid=f.oid AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl AND p.prosecdef=f.prosecdef AND p.proconfig IS NOT DISTINCT FROM f.proconfig WHERE md5(pg_get_functiondef('public.trip_source_operation_guard()'::regprocedure))='1eeccf273aa0fbcd5e89bc96361d1ebf') THEN RAISE EXCEPTION 'PHOTO_OPERATION_POSTIMAGE_DRIFT';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE actor_account_id='f4b059c5-8241-4ffb-aa15-37fa25474543' AND NOT universal_png_import_enabled AND universal_png_import_expires_at IS NULL) THEN RAISE EXCEPTION 'PHOTO_OPERATION_NOT_CLOSED';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.trip_sources WHERE id='2bf0294a-47df-4176-999f-0e352e34543c' AND trip_id='825f79b2-4a9d-4535-a62e-43000ca50c4a' AND acquired_by='f4b059c5-8241-4ffb-aa15-37fa25474543' AND row_revision=1 AND current_material_revision=1 AND lifecycle='ACTIVE' AND retention_state='RETAINED') OR NOT EXISTS(SELECT 1 FROM public.trip_source_representations WHERE id='27b93994-98f3-4f76-8d15-93a52a0aeb21' AND source_id='2bf0294a-47df-4176-999f-0e352e34543c' AND row_revision=1 AND role='ORIGINAL' AND material_kind='BINARY' AND mime_type='image/png' AND payload_sha256='078de830361d65bb3890b43fb30646aa6e6ebfa7088a0f2dc4c7bd7b343fa515' AND byte_count=42630 AND remote_state='PENDING' AND retention_state='RETAINED') OR NOT EXISTS(SELECT 1 FROM public.trip_source_operations WHERE id='37d5cd82-f6bf-433c-8031-47fc00f509c0' AND source_id='2bf0294a-47df-4176-999f-0e352e34543c' AND actor_account_id='f4b059c5-8241-4ffb-aa15-37fa25474543' AND trip_id='825f79b2-4a9d-4535-a62e-43000ca50c4a' AND command='ACQUIRE_SOURCE' AND phase='FINAL' AND outcome='APPLIED') THEN RAISE EXCEPTION 'PHOTO_OPERATION_RETAINED_SOURCE_DRIFT';END IF;
 IF EXISTS(SELECT 1 FROM public.trip_source_operations WHERE source_id='2bf0294a-47df-4176-999f-0e352e34543c' AND id<>'37d5cd82-f6bf-433c-8031-47fc00f509c0') THEN RAISE EXCEPTION 'PHOTO_OPERATION_ACCEPTED_NO_REVERSE';END IF;
 IF md5(pg_get_functiondef('public.trip_source_png_operation(uuid,text,text,jsonb,jsonb)'::regprocedure)) IS DISTINCT FROM '5d40339e0af17a04886678c6340edba9' THEN RAISE EXCEPTION 'PHOTO_OPERATION_DEPENDENCY_DRIFT';END IF;
 IF md5(pg_get_functiondef('public.trip_source_png_enter(uuid,text,text)'::regprocedure)) IS DISTINCT FROM '00adef87c9580e5f11b63477b3cecc5a' THEN RAISE EXCEPTION 'PHOTO_OPERATION_DEPENDENCY_DRIFT';END IF;
 IF md5(pg_get_functiondef('public.trip_source_png_scope()'::regprocedure)) IS DISTINCT FROM 'fb3adf995affc8049930618fe30df30e' THEN RAISE EXCEPTION 'PHOTO_OPERATION_DEPENDENCY_DRIFT';END IF;
 IF md5(pg_get_functiondef('public.trip_source_universal_original_pin()'::regprocedure)) IS DISTINCT FROM '184156c3861e9f50697b88d6774f124d' THEN RAISE EXCEPTION 'PHOTO_OPERATION_PIN_DRIFT';END IF;
END $post$;
DROP TABLE photo_operation_graph,photo_operation_schema,photo_operation_function;
COMMIT;
