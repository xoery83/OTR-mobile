begin;
do $$declare r text; f record;begin
 if exists(select 1 from public.trip_source_pdf_upload_config where enabled) then raise exception 'PDF_UPLOAD_NOT_CLOSED';end if;
 foreach r in array array['anon','authenticated','service_role','otr_trip_core_v2_gateway','otr_trip_source_execution_gateway'] loop
  for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname like 'trip_source_pdf_upload_%' loop
   if has_function_privilege(r,f.oid,'EXECUTE') then raise exception 'PDF_UPLOAD_PUBLIC_EXECUTION % %',r,f.oid::regprocedure;end if;
  end loop;
 end loop;
 if has_function_privilege('otr_trip_source_command_gateway','public.trip_source_pdf_upload_execution(uuid,uuid,bigint,text,jsonb)','EXECUTE') or has_function_privilege('otr_trip_source_command_gateway','public.trip_source_pdf_upload_reserve(uuid,uuid,uuid,uuid,text,uuid,uuid,jsonb)','EXECUTE') then raise exception 'PDF_UPLOAD_RAW_HELPER';end if;
 if exists(select 1 from pg_roles where rolname in ('otr_trip_source_writer','otr_trip_source_command_gateway','otr_trip_source_execution_writer','otr_trip_source_execution_gateway') and (rolcanlogin or rolbypassrls or rolsuper)) then raise exception 'PDF_UPLOAD_ROLE_ACTIVATED';end if;
 if pg_has_role('otr_trip_source_command_gateway','otr_trip_source_execution_writer','MEMBER') or pg_has_role('otr_trip_source_command_gateway','otr_trip_source_writer','MEMBER') or pg_has_role('otr_trip_source_command_gateway','otr_trip_source_execution_gateway','MEMBER') then raise exception 'PDF_UPLOAD_ROLE_BRIDGE';end if;
 foreach r in array array['anon','authenticated','service_role','otr_trip_source_command_gateway','otr_trip_source_execution_gateway'] loop
  if has_table_privilege(r,'public.trip_source_pdf_upload_config','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') or has_table_privilege(r,'public.trip_source_execution_attempts','INSERT,UPDATE,DELETE,TRUNCATE') or has_table_privilege(r,'public.trip_source_staged_resources','INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'PDF_UPLOAD_DIRECT_DML';end if;
 end loop;
end$$;
rollback;
