begin;
do $$declare r text; f record;begin
 if exists(select 1 from trip_source_pdf_upload_config where beta_enabled) then raise exception 'PDF_BETA_NOT_CLOSED';end if;
 foreach r in array array['anon','authenticated','service_role','otr_trip_core_v2_gateway','otr_trip_source_execution_gateway'] loop
  for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname like 'trip_source_pdf_beta_%' loop
   if has_function_privilege(r,f.oid,'EXECUTE') then raise exception 'PDF_BETA_PUBLIC_EXECUTION % %',r,f.oid::regprocedure;end if;
  end loop;
 end loop;
 if has_function_privilege('otr_trip_source_command_gateway','public.trip_source_pdf_beta_execution(uuid,uuid,bigint,text,jsonb)','EXECUTE') or has_function_privilege('otr_trip_source_command_gateway','public.trip_source_pdf_beta_reserve(uuid,uuid,uuid,uuid,text,uuid,uuid,jsonb)','EXECUTE') or has_function_privilege('otr_trip_source_command_gateway','public.trip_source_pdf_beta_custody(trip_source_operations)','EXECUTE') then raise exception 'PDF_BETA_RAW_HELPER';end if;
 if exists(select 1 from pg_roles where rolname in ('otr_trip_source_writer','otr_trip_source_command_gateway','otr_trip_source_execution_writer','otr_trip_source_execution_gateway') and (rolcanlogin or rolbypassrls or rolsuper)) then raise exception 'PDF_BETA_ROLE_ACTIVATED';end if;
end$$;
rollback;
