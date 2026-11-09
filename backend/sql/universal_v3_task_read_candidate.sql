-- CANDIDATE ONLY. The existing call gateway can read a bound V3 receipt.
-- This does not admit, mark, settle or enable a V3 dispatch.
begin;
create temporary table universal_v3_reader_edge on commit drop as
 select admin_option,inherit_option,set_option from pg_auth_members
 where roleid='otr_external_integration_reader'::regrole and member='postgres'::regrole and grantor='postgres'::regrole;
do $$begin
 if has_schema_privilege('otr_external_integration_reader','public','CREATE')
 then raise exception 'UNIVERSAL_V3_READER_CREATE_PREIMAGE';end if;
end $$;
grant otr_external_integration_reader to postgres with inherit true,set true;
grant create on schema public to otr_external_integration_reader;
create function public.universal_import_v3_profile() returns jsonb
language sql immutable set search_path=pg_catalog as $$
 select '{"version":1,"consumer_id":"import","consumer_version":3,"boundary_version":"otr.import.local-first/1","capability":"EXTRACT","modalities":"TEXT,IMAGE","execution_scope":"UNIVERSAL_IMPORT_LOCAL_FIRST_V3","prompt_sha256":"82b4c295bad0520c4cf6a868f26feb7a6198f27702030025eaca57bf3652e0cc","output_schema_sha256":"f3b61c6f7c580bebf31b753a37f7272d5a2c337e8be5977c01dacb4f92090c60","max_images":5,"max_text_bytes":32768,"max_output_tokens":4096}'::jsonb
$$;
revoke all on function public.universal_import_v3_profile() from public,anon,authenticated,service_role,authenticator;
grant execute on function public.universal_import_v3_profile() to otr_external_integration_reader,otr_external_integration_meter_writer;

create function public.model_task_read_universal_v3_receipt(actor uuid,task uuid,attempt uuid,call uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
 c public.external_integration_calls;
 a public.model_task_admissions;
 completion public.external_integration_usage_events;
 profile constant jsonb := public.universal_import_v3_profile();
begin
 if session_user<>'otr_external_integration_call_gateway' or current_user<>'otr_external_integration_reader'
 then raise exception 'MODEL_TASK_READ_FORBIDDEN';end if;
 select * into c from public.external_integration_calls
  where call_id=call and account_id=actor and user_id=actor and task_id=task and attempt_id=attempt;
 if not found or c.environment is distinct from 'DEV' or c.task_class is distinct from 'UNIVERSAL_IMPORT_V1'
    or c.call_kind is distinct from 'OUTBOUND_MODEL' or c.shadow or c.attempt_sequence<>1
    or c.schema_sha256 is distinct from profile->>'output_schema_sha256'
    or not coalesce(public.cp14_trip_access(actor,c.trip_id),false) then return null;end if;
 select * into a from public.model_task_admissions
  where call_id=c.call_id and account_id=c.account_id and integration_id=c.integration_id and task_id=c.task_id;
 if not found or a.profile_snapshot is distinct from profile
    or a.profile_sha256 is distinct from public.cp14_hash(profile)
    or a.request_sha256 is distinct from public.cp14_hash(a.request_snapshot)
    or a.request_snapshot->>'task_id' is distinct from task::text
    or a.request_snapshot->>'consumer_id' is distinct from 'import'
    or a.request_snapshot->'consumer_version' is distinct from '3'::jsonb
    or a.request_snapshot->'schema' is distinct from
       jsonb_build_object('id',profile->>'execution_scope','version',1,'dialect','OTR_TYPED_V1','sha256',c.schema_sha256)
 then return null;end if;
 select * into completion from public.external_integration_usage_events e
  where e.call_id=c.call_id and e.observation_kind='COMPLETION'
  order by e.received_at desc,e.observation_id desc limit 1;
 return jsonb_build_object('call',to_jsonb(c),'admission',to_jsonb(a),
  'hasStart',exists(select 1 from public.external_integration_usage_events e where e.call_id=c.call_id and e.observation_kind='START'),
  'completion',case when completion.call_id is null then null else to_jsonb(completion) end);
end $$;
alter function public.model_task_read_universal_v3_receipt(uuid,uuid,uuid,uuid) owner to otr_external_integration_reader;
revoke all on function public.model_task_read_universal_v3_receipt(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role,authenticator;
grant execute on function public.model_task_read_universal_v3_receipt(uuid,uuid,uuid,uuid) to otr_external_integration_call_gateway;
revoke create on schema public from otr_external_integration_reader;
do $$declare edge record;begin
 select * into edge from pg_temp.universal_v3_reader_edge;
 if found then
  execute format('grant otr_external_integration_reader to postgres with admin %s,inherit %s,set %s',
   case when edge.admin_option then 'true' else 'false' end,
   case when edge.inherit_option then 'true' else 'false' end,
   case when edge.set_option then 'true' else 'false' end);
 else revoke otr_external_integration_reader from postgres;end if;
end $$;
commit;
