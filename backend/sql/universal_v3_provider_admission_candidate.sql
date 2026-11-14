-- Source candidate against the checked-in sustained Universal / AI cost guard
-- contracts. Each replaced fragment must be present exactly once. A live
-- installation additionally needs the fixed full function preimages.
begin;
set local search_path=pg_catalog;
set local lock_timeout='5s';
create temporary table universal_v3_meter_edge on commit drop as
 select admin_option,inherit_option,set_option from pg_auth_members
 where roleid='otr_external_integration_meter_writer'::regrole and member='postgres'::regrole and grantor='postgres'::regrole;
do $$begin
 if has_schema_privilege('otr_external_integration_meter_writer','public','CREATE')
 then raise exception 'UNIVERSAL_V3_METER_CREATE_PREIMAGE';end if;
end $$;
grant otr_external_integration_meter_writer to postgres with inherit true,set true;
grant create on schema public to otr_external_integration_meter_writer;

create function public.universal_import_select_v3(actor uuid,trip uuid,integration text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare selected jsonb;
begin
 if session_user<>'otr_external_integration_call_gateway'
 then raise exception 'UNIVERSAL_PROVIDER_CLOSED';end if;
 selected:=public.universal_import_select_continuous(actor,trip,integration);
 if not exists(
  select 1 from public.intelligence_provider_configs c
   cross join lateral jsonb_array_elements(c.schema_contracts) profile
   where c.provider_config_id=(selected->>'providerConfigId')::uuid
    and 'IMAGE'=any(c.modalities)
    and profile=jsonb_build_object('id','universal-import','version',3,'dialect','otr')
 ) then raise exception 'UNIVERSAL_V3_PROVIDER_PROFILE_CLOSED';end if;
 return selected;
end $$;
alter function public.universal_import_select_v3(uuid,uuid,text) owner to otr_external_integration_meter_writer;
revoke all on function public.universal_import_select_v3(uuid,uuid,text) from public,anon,authenticated,service_role,authenticator;
grant execute on function public.universal_import_select_v3(uuid,uuid,text) to otr_external_integration_call_gateway;


create function pg_temp.otr_v3_edit(target regprocedure, needle text, replacement text)
returns void language plpgsql as $edit$
declare body text; definition text;
begin
 select prosrc,pg_get_functiondef(oid) into strict body,definition from pg_proc where oid=target;
 if length(body)-length(replace(body,needle,''))<>length(needle)
 then raise exception 'UNIVERSAL_V3_PREIMAGE_DRIFT: %',target;end if;
 execute replace(definition,body,replace(body,needle,replacement));
end
$edit$;

do $v3$
declare
 scope_fn regprocedure := 'public.universal_import_continuous_scope(public.external_integration_calls,jsonb,text,boolean)';
 bind_fn regprocedure := 'public.universal_import_validate_binding(jsonb,public.external_integration_calls,boolean)';
 price_fn regprocedure := 'public.universal_import_read_admitted_price(uuid,uuid,uuid,uuid)';
begin
 perform pg_temp.otr_v3_edit(scope_fn,'started timestamptz;BEGIN',
  $new$started timestamptz; local_first boolean:=coalesce(b->'profile'=public.universal_import_v3_profile(),false);BEGIN$new$);
 perform pg_temp.otr_v3_edit(scope_fn,
  'NOT public.universal_import_source_current(r.account_id,r.trip_id,r.import_id,r.task_id,r.input_sha256)',
  $new$(case when local_first then not coalesce(public.trip_sustained_universal_allowed(r.account_id,r.trip_id),false)
    else not public.universal_import_source_current(r.account_id,r.trip_id,r.import_id,r.task_id,r.input_sha256) end)$new$);
 perform pg_temp.otr_v3_edit(scope_fn,
  'selected:=public.universal_import_select_continuous(r.account_id,r.trip_id,r.integration_id);',
  $new$selected:=case when local_first then public.universal_import_select_v3(r.account_id,r.trip_id,r.integration_id)
   else public.universal_import_select_continuous(r.account_id,r.trip_id,r.integration_id) end;$new$);
 perform pg_temp.otr_v3_edit(scope_fn,
  'b->''profile'' IS DISTINCT FROM public.universal_import_expected_profile()',
  $new$(not local_first and b->'profile' IS DISTINCT FROM public.universal_import_expected_profile())
 OR (local_first and (r.import_id is null or r.input_sha256 is null or r.input_sha256 !~ '^[a-f0-9]{64}$'
   or r.request_sha256 is null or r.request_sha256 !~ '^[a-f0-9]{64}$'
   or (provider_request_sha is not null and provider_request_sha is distinct from r.request_sha256)))$new$);
 perform pg_temp.otr_v3_edit(scope_fn,
  'r.schema_sha256 IS DISTINCT FROM s.pins->>''output_schema_sha256''',
  $new$r.schema_sha256 IS DISTINCT FROM
   (case when local_first then public.universal_import_v3_profile()->>'output_schema_sha256'
         else s.pins->>'output_schema_sha256' end)$new$);
 perform pg_temp.otr_v3_edit(scope_fn,
  'started:=public.universal_import_source_started(r.account_id,r.trip_id,r.import_id,r.task_id,r.input_sha256);',
  $new$if local_first then
   -- Current authenticated issuer submits a deadline pinned to persisted local intake.
   -- It cannot extend the already-authorized provider scope/grant or request lifetime.
   started:=(p->>'deadline')::timestamptz-((s.pins->>'task_lifetime_ms')::bigint*interval '1 millisecond');
   if started is null or not isfinite(started) or started>clock_timestamp()
   then raise exception 'UNIVERSAL_TASK_DEADLINE';end if;
  else
   started:=public.universal_import_source_started(r.account_id,r.trip_id,r.import_id,r.task_id,r.input_sha256);
  end if;$new$);

 perform pg_temp.otr_v3_edit(bind_fn,
  'b->''profile''=public.universal_import_expected_profile()',
  $new$(b->'profile'=public.universal_import_expected_profile() or b->'profile'=public.universal_import_v3_profile())$new$);
 perform pg_temp.otr_v3_edit(bind_fn,
  'q->''consumer_version''=''1''::jsonb',
  $new$q->'consumer_version'=(b->'profile'->'consumer_version')$new$);
 perform pg_temp.otr_v3_edit(bind_fn,
  '''id'',''UNIVERSAL_IMPORT_V1'',''version'',1,''dialect'',''OTR_TYPED_V1''',
  $new$'id',b->'profile'->>'execution_scope','version',1,'dialect','OTR_TYPED_V1'$new$);
 perform pg_temp.otr_v3_edit(bind_fn,
  'if public.trip_sustained_universal_allowed(r.account_id,r.trip_id) then s:=',
  $new$if b->'profile'=public.universal_import_v3_profile() and
    not coalesce(public.trip_sustained_universal_allowed(r.account_id,r.trip_id),false)
   then raise exception 'UNIVERSAL_PROVIDER_SCOPE_CLOSED';end if;
 if public.trip_sustained_universal_allowed(r.account_id,r.trip_id) then s:=$new$);
 perform pg_temp.otr_v3_edit(bind_fn,
  '''id'',''universal-import'',''version'',1,''dialect'',''otr''',
  $new$'id','universal-import','version',(b->'profile'->>'consumer_version')::integer,'dialect','otr'$new$);
 perform pg_temp.otr_v3_edit(
  'public.cp_llm_validate_binding(jsonb,public.external_integration_calls,jsonb,boolean)',
  'b->''profile''->>''execution_scope''=''UNIVERSAL_IMPORT_V1''',
  $new$(b->'profile'->>'execution_scope'='UNIVERSAL_IMPORT_V1' or b->'profile'=public.universal_import_v3_profile())$new$);
 perform pg_temp.otr_v3_edit('public.cp_llm_guard_model_task_admissions()',
  'new.profile_snapshot->>''execution_scope''=''UNIVERSAL_IMPORT_V1''',
  $new$(new.profile_snapshot->>'execution_scope'='UNIVERSAL_IMPORT_V1' or new.profile_snapshot=public.universal_import_v3_profile())$new$);
 perform pg_temp.otr_v3_edit(price_fn,
  'a.profile_snapshot IS DISTINCT FROM public.universal_import_expected_profile()',
  $new$(a.profile_snapshot IS DISTINCT FROM public.universal_import_expected_profile() and
        a.profile_snapshot IS DISTINCT FROM public.universal_import_v3_profile())$new$);
 perform pg_temp.otr_v3_edit(price_fn,
  'NOT public.universal_import_source_current(actor,r.trip_id,r.import_id,task,r.input_sha256)',
  $new$(case when a.profile_snapshot=public.universal_import_v3_profile() then
    not coalesce(public.trip_sustained_universal_allowed(actor,r.trip_id),false)
    else not public.universal_import_source_current(actor,r.trip_id,r.import_id,task,r.input_sha256) end)$new$);
end
$v3$;
drop function pg_temp.otr_v3_edit(regprocedure,text,text);
revoke create on schema public from otr_external_integration_meter_writer;
do $$declare edge record;begin
 select * into edge from pg_temp.universal_v3_meter_edge;
 if found then
  execute format('grant otr_external_integration_meter_writer to postgres with admin %s,inherit %s,set %s',
   case when edge.admin_option then 'true' else 'false' end,
   case when edge.inherit_option then 'true' else 'false' end,
   case when edge.set_option then 'true' else 'false' end);
 else revoke otr_external_integration_meter_writer from postgres;end if;
end $$;

commit;
