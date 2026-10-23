-- Candidate only; requires the fixed Universal original Source profile migration.
-- This scoped result wrapper returns no scope/pin enumeration and creates no Source.
begin;
create temporary table original_result_owner_edge on commit drop as select admin_option,inherit_option,set_option from pg_auth_members where roleid='otr_trip_source_writer'::regrole and member='postgres'::regrole and grantor='postgres'::regrole;
do $$begin
 if has_schema_privilege('otr_trip_source_writer','public','CREATE') or not exists(select 1 from pg_proc where oid='public.trip_source_universal_original_pin()'::regprocedure and proowner='otr_trip_source_writer'::regrole and not prosecdef) then raise exception 'UNIVERSAL_ORIGINAL_RESULT_PREIMAGE';end if;
end$$;
grant otr_trip_source_writer to postgres with inherit true,set true;
grant create on schema public to otr_trip_source_writer;
create function public.trip_source_lookup_universal_original(actor uuid,raw text) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare j jsonb;p jsonb;profile text;prior text;result jsonb;
begin
 if session_user<>'otr_trip_source_command_gateway' or raw is null or octet_length(raw)>2097152 then raise exception 'SOURCE_ACCESS_DENIED';end if;
 j:=public.trip_event_canonical_json(raw::json)::jsonb;
 profile:=case when j->'payload'->'source_input'->>'source_kind'='FILE' and j->'payload'->'original'->>'material_kind'='TEXT' then 'OTR_UTF8_TEXT_FILE_V1' when j->'payload'->'source_input'->>'source_kind'='TEXT' then 'OTR_SUBMITTED_TEXT_V1' else null end;
 if profile is null then raise exception 'UNIVERSAL_SOURCE_PROFILE_DENIED';end if;
 j:=case when profile='OTR_UTF8_TEXT_FILE_V1' then public.trip_source_utf8_file_codec(raw) else public.trip_source_command_codec(raw) end;
 if j->>'command'<>'ACQUIRE_SOURCE' or (j->>'actor_account_id')::uuid<>actor or not public.trip_source_admission(actor,(j->>'trip_id')::uuid,true) then raise exception 'SOURCE_ACCESS_DENIED';end if;
 p:=jsonb_build_object('profile',profile,'actorId',actor,'tripId',j->>'trip_id','sourceId',j->>'source_id','operationId',j->>'operation_id','operationKey',j->>'operation_key','operationSha256',j->>'operation_sha256','representationId',j->'payload'->'original'->>'id');
 prior:=current_setting('otr.universal.source_pin',true);perform set_config('otr.universal.source_pin',p::text,true);
 if public.trip_source_universal_original_pin() is null then raise exception 'UNIVERSAL_SOURCE_SCOPE_CLOSED';end if;
 perform public.trip_source_assert_gate();
 result:=public.trip_source_operation_lookup(actor,(j->>'trip_id')::uuid,(j->>'source_id')::uuid,(j->>'operation_id')::uuid,j->>'operation_key',j->>'operation_sha256');
 if public.trip_source_universal_original_pin() is null then raise exception 'UNIVERSAL_SOURCE_SCOPE_CLOSED';end if;
 perform set_config('otr.universal.source_pin',coalesce(prior,''),true);return result;
 exception when others then perform set_config('otr.universal.source_pin',coalesce(prior,''),true);raise;
end$$;
alter function public.trip_source_lookup_universal_original(uuid,text) owner to otr_trip_source_writer;
revoke all on function public.trip_source_lookup_universal_original(uuid,text) from public,anon,authenticated,service_role,authenticator;
grant execute on function public.trip_source_lookup_universal_original(uuid,text) to otr_trip_source_command_gateway;
revoke create on schema public from otr_trip_source_writer;
do $$declare edge record;begin select * into strict edge from original_result_owner_edge;execute format('grant otr_trip_source_writer to postgres with admin %s,inherit %s,set %s',case when edge.admin_option then 'true' else 'false' end,case when edge.inherit_option then 'true' else 'false' end,case when edge.set_option then 'true' else 'false' end);end$$;
commit;
