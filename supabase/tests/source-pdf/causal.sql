begin;
do $$declare r text;f record;begin
 if exists(select 1 from trip_source_pdf_upload_config where causal_enabled) then raise exception 'CAUSAL_NOT_CLOSED';end if;
 foreach r in array array['anon','authenticated','service_role','otr_trip_core_v2_gateway','otr_trip_source_execution_gateway'] loop
  for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname like 'trip_source_pdf_causal_%' loop
   if has_function_privilege(r,f.oid,'EXECUTE') then raise exception 'CAUSAL_PUBLIC_EXECUTION % %',r,f.oid::regprocedure;end if;
  end loop;
 end loop;
 foreach r in array array['trip_source_pdf_causal_committed(uuid,boolean)','trip_source_pdf_causal_execution(uuid,uuid,bigint,text,jsonb)','trip_source_pdf_causal_reserve(uuid,uuid,uuid,uuid,text,uuid,uuid,jsonb)'] loop
  if has_function_privilege('otr_trip_source_command_gateway',r,'EXECUTE') then raise exception 'CAUSAL_RAW_HELPER';end if;
 end loop;
 if exists(select 1 from pg_roles where rolname in ('otr_trip_source_writer','otr_trip_source_command_gateway','otr_trip_source_execution_writer','otr_trip_source_execution_gateway') and (rolcanlogin or rolbypassrls or rolsuper)) then raise exception 'CAUSAL_ROLE_ACTIVATED';end if;
 if pg_has_role('otr_trip_source_command_gateway','otr_trip_source_execution_writer','MEMBER') or pg_has_role('otr_trip_source_command_gateway','otr_trip_source_writer','MEMBER') then raise exception 'CAUSAL_ROLE_BRIDGE';end if;
end$$;
rollback;
