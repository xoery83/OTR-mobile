-- CANDIDATE ONLY. Read projection on existing Model Task / CP14 custody.
-- This does NOT register or admit the Universal profile and cannot reserve a call.
begin;
-- Preserve the existing administrator edge and reject unexpected CREATE authority.
create temporary table universal_owner_edge on commit drop as select admin_option,inherit_option,set_option from pg_auth_members where roleid='otr_external_integration_reader'::regrole and member='postgres'::regrole and grantor='postgres'::regrole;
do $$begin if has_schema_privilege('otr_external_integration_reader','public','CREATE') then raise exception 'UNIVERSAL_OWNER_CREATE_PREIMAGE';end if;end$$;
grant otr_external_integration_reader to postgres with inherit true,set true;
grant create on schema public to otr_external_integration_reader;
grant select on public.model_task_admissions to otr_external_integration_reader;
create policy universal_task_receipt_read on public.model_task_admissions for select to otr_external_integration_reader using(true);
create function public.model_task_read_universal_receipt(actor uuid,task uuid,attempt uuid,call uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare c public.external_integration_calls; a public.model_task_admissions; completion public.external_integration_usage_events;
begin
 if session_user<>'otr_external_integration_call_gateway' or current_user<>'otr_external_integration_reader' then raise exception 'MODEL_TASK_READ_FORBIDDEN';end if;
 select * into c from public.external_integration_calls where call_id=call and account_id=actor and task_id=task and attempt_id=attempt;
 if not found or not public.cp14_trip_access(actor,c.trip_id) then return null;end if;
 select * into a from public.model_task_admissions where call_id=c.call_id and account_id=actor and task_id=task;
 if not found or c.environment<>'DEV' or c.task_class<>'UNIVERSAL_IMPORT_V1' or c.shadow or c.attempt_sequence<>1 then return null;end if;
 if a.profile_snapshot is distinct from '{"version":1,"consumer_id":"import","consumer_version":1,"boundary_version":"otr.backend.universal-interpretation/1","capability":"EXTRACT","modalities":"TEXT,IMAGE","execution_scope":"UNIVERSAL_IMPORT_V1","prompt_version":"real-llm-01-compact/5","prompt_sha256":"3076fa42c0d55dc7f97e025aa4792bb316c4b95fa9f78196a8526235fbfa7649","output_schema_version":"otr-universal-advisory/1","output_schema_sha256":"59bb20c3dc2e00338e3e1e2e9bfd470d41d0da9ea54802695f32ec220adc740f","privacy_profile":"REMOTE_ALLOWED_SOURCE_EVIDENCE_V1","max_images":1,"max_text_bytes":32768,"max_output_tokens":4096}'::jsonb
   or a.profile_sha256<>public.cp14_hash(a.profile_snapshot) then return null;end if;
 select * into completion from public.external_integration_usage_events e where e.call_id=c.call_id and e.observation_kind='COMPLETION' order by e.received_at desc,e.observation_id desc limit 1;
 return jsonb_build_object('call',to_jsonb(c),'admission',to_jsonb(a),'hasStart',exists(select 1 from public.external_integration_usage_events e where e.call_id=c.call_id and e.observation_kind='START'),'completion',case when completion.call_id is null then null else to_jsonb(completion) end);
end$$;
alter function public.model_task_read_universal_receipt(uuid,uuid,uuid,uuid) owner to otr_external_integration_reader;
revoke all on function public.model_task_read_universal_receipt(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role,authenticator;
grant execute on function public.model_task_read_universal_receipt(uuid,uuid,uuid,uuid) to otr_external_integration_call_gateway;
revoke create on schema public from otr_external_integration_reader;
do $restore_owner$ declare old record;begin
 select * into old from pg_temp.universal_owner_edge;
 if found then execute format('grant otr_external_integration_reader to postgres with admin %s,inherit %s,set %s',case when old.admin_option then 'true' else 'false' end,case when old.inherit_option then 'true' else 'false' end,case when old.set_option then 'true' else 'false' end);
 else revoke otr_external_integration_reader from postgres;end if;
end $restore_owner$;
commit;
