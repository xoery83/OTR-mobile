-- Candidate only: exact deployed PDF Run-only guard compatibility.
-- No new table, durable role/ACL, Candidate, Review or Admission path.
begin;
create temporary table universal_run_guard_owner_edge on commit drop as
 select admin_option,inherit_option,set_option from pg_auth_members where roleid='otr_trip_source_writer'::regrole and member='postgres'::regrole and grantor='postgres'::regrole;
do $preflight$begin
 if current_user<>'postgres' or session_user<>'postgres' or has_schema_privilege('otr_trip_source_writer','public','CREATE') then raise exception 'UNIVERSAL_RUN_GUARD_OPERATOR';end if;
end $preflight$;
grant otr_trip_source_writer to postgres with inherit true,set true;
grant create on schema public to otr_trip_source_writer;
do $patch$
declare original text; definition text; updated text; before_meta jsonb; after_meta jsonb;
 addition text:=$universal$ /* UNIVERSAL_RUN_ONLY_BEGIN */
 if tab in ('trip_source_runs','trip_source_inputs','trip_source_candidates') then
  declare ur public.trip_source_runs; ui public.trip_source_inputs; us public.trip_source_universal_scope;
   expected uuid[]; bound jsonb; ss public.trip_sources; rr public.trip_source_representations; mr public.trip_source_revisions; count_pins integer;
  begin
   if tab='trip_source_runs' then ur:=jsonb_populate_record(null::public.trip_source_runs,n);
   else select * into ur from public.trip_source_runs where id=(n->>'run_id')::uuid;end if;
   if ur.extractor_key='otr-universal-interpretation-v1' or ur.capture_batch_id is not null or ur.interpretation_task_id is not null
    or exists(select 1 from public.trip_source_universal_scope where run_id=ur.id) then
    if current_user<>'otr_trip_source_writer' or session_user<>'otr_trip_source_command_gateway'
     or op<>'INSERT' or tab not in ('trip_source_runs','trip_source_inputs') then raise exception 'UNIVERSAL_RUN_WRITE_DENIED';end if;
    select * into us from public.trip_source_universal_scope where singleton and actor_id=ur.actor_account_id and trip_id=ur.trip_id
     and batch_id=ur.capture_batch_id and task_id=ur.interpretation_task_id and run_id=ur.id
     and submission_sha256=ur.capture_submission_sha256 and input_sha256=ur.input_sha256
     and clock_timestamp()>=starts_at and clock_timestamp()<expires_at;
    if not found then raise exception 'UNIVERSAL_RUN_WRITE_DENIED';end if;
    select array_agg((p->>'sourceId')::uuid order by (p->>'sourceId')::uuid),count(*) into expected,count_pins
     from jsonb_array_elements(us.source_command_pins) p;
    if count_pins not between 1 and 64 or cardinality(expected)<>(select count(distinct x) from unnest(expected) x)
     or ur.scope_source_ids is distinct from expected or ur.row_revision is distinct from 1 or ur.state is distinct from 'PENDING' or ur.retention_state is distinct from 'RETAINED'
     or ur.superseded_by is not null or ur.completed_at is not null or ur.error_code is not null
     or ur.extractor_key is distinct from 'otr-universal-interpretation-v1' or ur.extractor_version is distinct from '1'
     or ur.operation_key is distinct from 'universal:'||us.batch_id::text
     or ur.extractor_options_sha256 is distinct from us.submission_sha256
     or ur.scope_sha256 is distinct from public.trip_source_hash('otr-source-run-scope-v1',jsonb_build_array(1,ur.trip_id,ur.actor_account_id,to_jsonb(expected)))
     or ur.created_at is null or ur.created_at<us.starts_at or ur.created_at>clock_timestamp() then raise exception 'UNIVERSAL_RUN_WRITE_DENIED';end if;
    for bound in select value from jsonb_array_elements(us.source_command_pins) loop
     if public.trip_event_keys(bound,array['profile','actorId','tripId','sourceId','representationId','operationId','operationKey','operationSha256']) is not true or bound->>'actorId' is distinct from us.actor_id::text or bound->>'tripId' is distinct from us.trip_id::text
      or bound->>'profile' is null or bound->>'profile' not in ('OTR_UTF8_TEXT_FILE_V1','OTR_SUBMITTED_TEXT_V1') then raise exception 'UNIVERSAL_RUN_WRITE_DENIED';end if;
     select * into ss from public.trip_sources where id=(bound->>'sourceId')::uuid and trip_id=us.trip_id and acquired_by=us.actor_id;
     select * into rr from public.trip_source_representations where id=(bound->>'representationId')::uuid and source_id=ss.id;
     select * into mr from public.trip_source_revisions where source_id=ss.id and material_revision=1;
     if ss.id is null or rr.id is null or mr.source_id is null or ss.lifecycle<>'ACTIVE' or ss.retention_state<>'RETAINED'
      or ss.current_material_revision<>1 or ss.row_revision<>1 or rr.retention_state<>'RETAINED' or mr.retention_state<>'RETAINED'
      or rr.role<>'ORIGINAL' or rr.introduced_revision<>1 or not rr.id=any(mr.original_representation_ids)
      or rr.material_kind<>'TEXT' or rr.encoding<>'UTF-8' or rr.remote_state<>'NOT_APPLICABLE'
      or rr.payload_sha256 is null or rr.byte_count<1 or rr.byte_count is distinct from octet_length(rr.text_content)
      or cardinality(rr.parent_ids)<>0
      or bound->>'profile'='OTR_UTF8_TEXT_FILE_V1' and (ss.source_kind<>'FILE' or ss.acquisition_channel<>'FILES')
      or bound->>'profile'='OTR_SUBMITTED_TEXT_V1' and (ss.source_kind<>'TEXT' or ss.acquisition_channel<>'PASTE') then raise exception 'UNIVERSAL_RUN_WRITE_DENIED';end if;
    end loop;
    if tab='trip_source_runs' then
     if to_jsonb(ur) is distinct from n then raise exception 'UNIVERSAL_RUN_WRITE_DENIED';end if;
    else
     ui:=jsonb_populate_record(null::public.trip_source_inputs,n);
     if to_jsonb(ui) is distinct from n or ui.run_id is distinct from us.run_id or ui.confirmation_id is not null
      or ui.material_revision is distinct from 1 or ui.observed_source_row_revision is distinct from 1 or ui.historical_selection is distinct from false
      or not exists(select 1 from jsonb_array_elements(us.source_command_pins) p where p->>'sourceId'=ui.source_id::text and p->>'representationId'=ui.representation_id::text)
      or not public.trip_import_input_valid(ui,us.actor_id,us.trip_id,true) then raise exception 'UNIVERSAL_RUN_WRITE_DENIED';end if;
    end if;
    if clock_timestamp()<us.starts_at or clock_timestamp()>=us.expires_at then raise exception 'UNIVERSAL_RUN_WRITE_DENIED';end if;
    return;
   end if;
  end;
 end if;
 /* UNIVERSAL_RUN_ONLY_END */
$universal$;
begin
 select prosrc,pg_get_functiondef(oid),jsonb_build_array(proowner,proacl,prosecdef,proconfig) into original,definition,before_meta
 from pg_proc where oid='public.trip_source_run_only_row(text,text,jsonb)'::regprocedure
 and proowner='otr_trip_source_writer'::regrole and not prosecdef and proconfig=array['search_path=pg_catalog']::text[]
 and proacl::text='{otr_trip_source_writer=X/otr_trip_source_writer}';
 if md5(original) is distinct from '116a2da66b315366c59dc56649ed4686'
 or (select md5(prosrc) from pg_proc where oid='public.trip_import_catalog_write_guard()'::regprocedure) is distinct from 'f8d041b3f82024d9d3f5472cb0ffe363'
 or position(E'begin\n q:=public.trip_source_pdf_upload_v4_scope();' in original)=0 then raise exception 'UNIVERSAL_RUN_GUARD_PREIMAGE';end if;
 updated:=replace(original,E'begin\n q:=public.trip_source_pdf_upload_v4_scope();',E'begin\n'||addition||E' q:=public.trip_source_pdf_upload_v4_scope();');
 execute replace(definition,original,updated);
 select jsonb_build_array(proowner,proacl,prosecdef,proconfig) into after_meta from pg_proc where oid='public.trip_source_run_only_row(text,text,jsonb)'::regprocedure;
 if before_meta is distinct from after_meta or md5(replace(updated,addition,'')) is distinct from md5(original)
 then raise exception 'UNIVERSAL_RUN_GUARD_PRESERVATION';end if;
end $patch$;
revoke create on schema public from otr_trip_source_writer;
do $restore$declare edge record;begin
 select * into edge from universal_run_guard_owner_edge;
 if found then execute format('grant otr_trip_source_writer to postgres with admin %s,inherit %s,set %s',case when edge.admin_option then 'true' else 'false' end,case when edge.inherit_option then 'true' else 'false' end,case when edge.set_option then 'true' else 'false' end);
 else revoke otr_trip_source_writer from postgres;end if;
end $restore$;
commit;
