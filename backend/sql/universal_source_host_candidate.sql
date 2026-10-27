-- CANDIDATE ONLY. Not in the automatic migration chain; no DEV authorization.
-- Reuses Source Run/Input identity. Batch remains the caller's original C3 ID.
-- No Candidate, Review, Plan, Admission or Canonical write is introduced.
begin;
-- Preserve the existing administrator edge and reject unexpected CREATE authority.
create temporary table universal_owner_edge on commit drop as select admin_option,inherit_option,set_option from pg_auth_members where roleid='otr_trip_source_writer'::regrole and member='postgres'::regrole and grantor='postgres'::regrole;
do $$begin if has_schema_privilege('otr_trip_source_writer','public','CREATE') then raise exception 'UNIVERSAL_OWNER_CREATE_PREIMAGE';end if;end$$;
grant otr_trip_source_writer to postgres with inherit true,set true;
grant create on schema public to otr_trip_source_writer;
alter table public.trip_source_runs
  add column capture_batch_id uuid,
  add column capture_submission_sha256 text,
  add column interpretation_task_id uuid,
  add constraint universal_run_binding check (
    capture_batch_id is null and capture_submission_sha256 is null and interpretation_task_id is null or
    capture_batch_id is not null and interpretation_task_id is not null and capture_submission_sha256 is not null and
    capture_submission_sha256 ~ '^[a-f0-9]{64}$' and extractor_key='otr-universal-interpretation-v1');
create unique index universal_source_batch on public.trip_source_runs(actor_account_id,trip_id,capture_batch_id)
where capture_batch_id is not null;
create unique index universal_source_task on public.trip_source_runs(actor_account_id,interpretation_task_id)
where interpretation_task_id is not null;

-- A deployment capability, not a Batch or Task registry. No public setter exists.
-- Empty by default; a reviewed DEV operator can provision one exact, expiring QA scope.
create table public.trip_source_universal_scope (
 singleton boolean primary key default true check(singleton),
 actor_id uuid not null, trip_id uuid not null, batch_id uuid not null,
 task_id uuid not null, run_id uuid not null, submission_sha256 text not null check(submission_sha256 ~ '^[a-f0-9]{64}$'),
 input_sha256 text not null check(input_sha256 ~ '^[a-f0-9]{64}$'),
 starts_at timestamptz not null, expires_at timestamptz not null,
 check(isfinite(starts_at) and isfinite(expires_at) and expires_at>starts_at and expires_at<=starts_at+interval '900 seconds')
);
alter table public.trip_source_universal_scope enable row level security;
alter table public.trip_source_universal_scope force row level security;
revoke all on public.trip_source_universal_scope from public,anon,authenticated,service_role,authenticator;
grant select on public.trip_source_universal_scope to otr_trip_source_writer;
create policy universal_scope_reader on public.trip_source_universal_scope for select to otr_trip_source_writer using(true);

-- The existing invoker admission lock cannot read Trip rows from the Source
-- writer's accepted ACL. Use an exact definer lock, never grant table UPDATE.
-- Preserve the V1 physical projection after adding internal Universal binding columns.
-- Accept only the existing baseline or approved dedicated-reader root, changing one Run expression.
do $catalog_projection$
declare original text;definition text;before_fragment text := 'public.trip_import_observation(to_jsonb(r)) order by id),''[]'') into rows from (select r.* from public.trip_source_runs';after_fragment text := 'public.trip_import_observation(to_jsonb(r)-array[''capture_batch_id'',''capture_submission_sha256'',''interpretation_task_id'']) order by id),''[]'') into rows from (select r.* from public.trip_source_runs';
begin
 select prosrc,pg_get_functiondef(oid) into original,definition from pg_proc where oid='public.trip_source_read_import_catalogs(uuid,uuid)'::regprocedure;
 if md5(original) not in ('b38aeaefad96d6cdc0be2acc67f023c3','6dd198b593f24571d494f3cd27dc7bc3') or position(before_fragment in original)=0 then raise exception 'UNIVERSAL_CATALOG_PREIMAGE';end if;
 execute replace(definition,original,replace(original,before_fragment,after_fragment));
end $catalog_projection$;

create function public.trip_source_lock_universal_actor(actor uuid,trip uuid,writing boolean)
returns boolean language plpgsql volatile security definer set search_path=pg_catalog as $$
begin
 if session_user<>'otr_trip_source_command_gateway' then raise exception 'SOURCE_ACCESS_DENIED';end if;
 perform 1 from public.trips where id=trip for share;
 perform 1 from public.trip_members where trip_id=trip and user_id=actor order by id for share;
 perform 1 from public.journey_members where trip_id=trip and user_id=actor order by id for share;
 -- Same owning admission predicate; no EXECUTE grant to the broad postgres role.
 return exists(select 1 from public.trips where id=trip and created_by=actor)
   or exists(select 1 from public.trip_members where trip_id=trip and user_id=actor)
   or exists(select 1 from public.journey_members where trip_id=trip and user_id=actor and status='linked' and (not writing or role in ('owner','group_member')));
end$$;
revoke all on function public.trip_source_lock_universal_actor(uuid,uuid,boolean) from public,anon,authenticated,service_role,authenticator;
grant execute on function public.trip_source_lock_universal_actor(uuid,uuid,boolean) to otr_trip_source_writer;
create function public.trip_source_lock_universal_materials(actor uuid,trip uuid,sources uuid[])
returns void language plpgsql volatile security definer set search_path=pg_catalog as $$
begin
 if session_user<>'otr_trip_source_command_gateway' or sources is null or cardinality(sources) not between 1 and 64 or
   (select count(distinct x) from unnest(sources) x)<>cardinality(sources) then raise exception 'SOURCE_ACCESS_DENIED';end if;
 perform 1 from public.trip_sources where id=any(sources) and trip_id=trip and acquired_by=actor order by id for share;
 if (select count(*) from public.trip_sources where id=any(sources) and trip_id=trip and acquired_by=actor)<>cardinality(sources) then raise exception 'INPUT_STALE';end if;
end$$;
revoke all on function public.trip_source_lock_universal_materials(uuid,uuid,uuid[]) from public,anon,authenticated,service_role,authenticator;
grant execute on function public.trip_source_lock_universal_materials(uuid,uuid,uuid[]) to otr_trip_source_writer;

create function public.trip_source_begin_universal_inputs(actor uuid,trip uuid,raw text)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare q jsonb; r public.trip_source_runs; previous public.trip_source_runs; p public.trip_source_inputs;
  v jsonb; source_ids uuid[]; scope_hash text; generation bigint;
begin
 if current_user<>'otr_trip_source_writer' or session_user<>'otr_trip_source_command_gateway' or
   current_setting('transaction_isolation')<>'read committed' then raise exception 'SOURCE_ACCESS_DENIED';end if;
 if raw is null or octet_length(raw)>131072 then raise exception 'INVALID_UNIVERSAL_INPUT';end if;
 q:=public.trip_event_canonical_json(raw::json)::jsonb;
 if not public.trip_event_keys(q,array['runId','batchId','taskId','submissionSha256','inputs']) or
   jsonb_typeof(q->'inputs')<>'array' or jsonb_array_length(q->'inputs') not between 1 and 64 then raise exception 'INVALID_UNIVERSAL_INPUT';end if;
 perform public.trip_import_scope_lock(actor,trip);
 if not public.trip_source_lock_universal_actor(actor,trip,true) then raise exception 'SOURCE_ACCESS_DENIED';end if;
 if not exists(select 1 from public.trip_source_universal_scope s where singleton and s.actor_id=actor and s.trip_id=trip
   and s.batch_id=(q->>'batchId')::uuid and s.task_id=(q->>'taskId')::uuid and s.run_id=(q->>'runId')::uuid
   and s.submission_sha256=q->>'submissionSha256' and s.input_sha256=public.trip_import_run_input_hash(q->'inputs') and clock_timestamp()>=s.starts_at and clock_timestamp()<s.expires_at)
   then raise exception 'UNIVERSAL_SOURCE_SCOPE_CLOSED';end if;
 select * into previous from public.trip_source_runs where actor_account_id=actor and trip_id=trip and capture_batch_id=(q->>'batchId')::uuid;
 if found then
   if previous.id<>(q->>'runId')::uuid or previous.interpretation_task_id<>(q->>'taskId')::uuid or
     previous.capture_submission_sha256<>q->>'submissionSha256' or
     (select jsonb_agg(to_jsonb(i)-'run_id'-'confirmation_id' order by i.id) from public.trip_source_inputs i where i.run_id=previous.id)
       is distinct from (select jsonb_agg(inp.item order by inp.item->>'id' collate "C") from jsonb_array_elements(q->'inputs') as inp(item))
     then raise exception 'OPERATION_KEY_REUSED';end if;
   return to_jsonb(previous);
 end if;
 source_ids:=array(select distinct (i->>'source_id')::uuid from jsonb_array_elements(q->'inputs') i order by 1);
 if not public.trip_source_uuid_array_valid(source_ids,1,64) then raise exception 'INVALID_UNIVERSAL_INPUT';end if;
 perform public.trip_source_lock_universal_materials(actor,trip,source_ids);
 scope_hash:=public.trip_source_hash('otr-source-run-scope-v1',jsonb_build_array(1,trip,actor,to_jsonb(source_ids)));
 select coalesce(max(x.generation),0)+1 into generation from public.trip_source_runs x where x.trip_id=trip and x.actor_account_id=actor and x.scope_sha256=scope_hash;
 insert into public.trip_source_runs(id,row_revision,trip_id,actor_account_id,operation_key,scope_source_ids,scope_sha256,generation,input_sha256,extractor_key,extractor_version,extractor_options_sha256,created_at,capture_batch_id,capture_submission_sha256,interpretation_task_id)
 values((q->>'runId')::uuid,1,trip,actor,'universal:'||(q->>'batchId'),source_ids,scope_hash,generation,public.trip_import_run_input_hash(q->'inputs'),'otr-universal-interpretation-v1','1',q->>'submissionSha256',clock_timestamp(),(q->>'batchId')::uuid,q->>'submissionSha256',(q->>'taskId')::uuid) returning * into r;
 for v in select value from jsonb_array_elements(q->'inputs') loop
   if not public.trip_event_keys(v,array['id','source_id','material_revision','representation_id','payload_sha256','byte_count','observed_source_row_revision','historical_selection']) then raise exception 'INVALID_UNIVERSAL_INPUT';end if;
   p:=jsonb_populate_record(null::public.trip_source_inputs,v||jsonb_build_object('run_id',r.id,'confirmation_id',null));
   if p.historical_selection or not public.trip_import_input_valid(p,actor,trip,true) then raise exception 'INPUT_STALE';end if;
   insert into public.trip_source_inputs select p.*;
 end loop;
 if not exists(select 1 from public.trip_source_universal_scope s where singleton and s.actor_id=actor and s.trip_id=trip and s.batch_id=(q->>'batchId')::uuid and s.task_id=(q->>'taskId')::uuid and s.run_id=r.id and s.submission_sha256=q->>'submissionSha256' and s.input_sha256=public.trip_import_run_input_hash(q->'inputs') and clock_timestamp()>=s.starts_at and clock_timestamp()<s.expires_at) then raise exception 'UNIVERSAL_SOURCE_SCOPE_CLOSED';end if;
 return to_jsonb(r);
end$$;

create function public.trip_source_read_universal_inputs(actor uuid,trip uuid,batch uuid,task uuid,run uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare r public.trip_source_runs; p public.trip_source_inputs; rep public.trip_source_representations; result jsonb:='[]';
begin
 if current_user<>'otr_trip_source_writer' or session_user<>'otr_trip_source_command_gateway' then raise exception 'SOURCE_ACCESS_DENIED';end if;
 perform public.trip_import_scope_lock(actor,trip);
 if not public.trip_source_lock_universal_actor(actor,trip,false) then raise exception 'SOURCE_ACCESS_DENIED';end if;
 select * into r from public.trip_source_runs where id=run and actor_account_id=actor and trip_id=trip and capture_batch_id=batch and interpretation_task_id=task and retention_state='RETAINED' and superseded_by is null;
 if not found or r.state='FAILED' then raise exception 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';end if;
 perform public.trip_source_lock_universal_materials(actor,trip,r.scope_source_ids);
 for p in select * from public.trip_source_inputs where run_id=r.id order by id loop
   if p.historical_selection or not public.trip_import_input_valid(p,actor,trip,true) then raise exception 'INPUT_STALE';end if;
   select * into rep from public.trip_source_representations where id=p.representation_id and source_id=p.source_id;
   if rep.material_kind='TEXT' and rep.encoding='UTF-8' then
     if rep.byte_count<>octet_length(rep.text_content) then raise exception 'INVALID_UNIVERSAL_MATERIAL';end if;
   elsif rep.material_kind<>'BINARY' or rep.mime_type not in ('image/jpeg','image/png') or rep.remote_state<>'VERIFIED' then raise exception 'UNIVERSAL_MATERIAL_UNSUPPORTED';end if;
   result:=result||jsonb_build_array(jsonb_build_object('inputId',p.id,'sourceId',p.source_id,'representationId',p.representation_id,'revision',p.material_revision,'sha256',p.payload_sha256,'byteCount',p.byte_count,'mime',case when rep.material_kind='TEXT' then 'text/plain' else rep.mime_type end,'text',case when rep.material_kind='TEXT' then rep.text_content else null end));
 end loop;
 if jsonb_array_length(result) not between 1 and 64 then raise exception 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';end if;
 return jsonb_build_object('accountId',actor,'tripId',trip,'batchId',batch,'taskId',task,'runId',run,'submissionSha256',r.capture_submission_sha256,'representations',result);
end$$;
alter function public.trip_source_begin_universal_inputs(uuid,uuid,text) owner to otr_trip_source_writer;
alter function public.trip_source_read_universal_inputs(uuid,uuid,uuid,uuid,uuid) owner to otr_trip_source_writer;
revoke all on function public.trip_source_begin_universal_inputs(uuid,uuid,text), public.trip_source_read_universal_inputs(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role,authenticator;
grant execute on function public.trip_source_begin_universal_inputs(uuid,uuid,text), public.trip_source_read_universal_inputs(uuid,uuid,uuid,uuid,uuid) to otr_trip_source_command_gateway;
revoke create on schema public from otr_trip_source_writer;
do $restore_owner$ declare old record;begin
 select * into old from pg_temp.universal_owner_edge;
 if found then execute format('grant otr_trip_source_writer to postgres with admin %s,inherit %s,set %s',case when old.admin_option then 'true' else 'false' end,case when old.inherit_option then 'true' else 'false' end,case when old.set_option then 'true' else 'false' end);
 else revoke otr_trip_source_writer from postgres;end if;
end $restore_owner$;
commit;
