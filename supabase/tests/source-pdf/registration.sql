begin;
do $$declare r text;f text;begin
 if exists(select 1 from public.trip_source_command_gate where enabled) or exists(select 1 from public.trip_source_pdf_gate where enabled) then raise exception 'SOURCE_PDF_NOT_CLOSED';end if;
 if exists(select 1 from pg_roles where rolname in ('otr_trip_source_writer','otr_trip_source_command_gateway') and rolcanlogin) then raise exception 'SOURCE_PDF_LOGIN';end if;
 foreach r in array array['anon','authenticated','service_role','otr_trip_core_v2_gateway'] loop
  foreach f in array array['public.trip_source_pdf_original_begin(uuid,text,uuid)','public.trip_source_pdf_original_finish(uuid,text,uuid,text,bigint)','public.trip_source_pdf_registration_commit(jsonb,text,text)'] loop
   if has_function_privilege(r,f,'EXECUTE') then raise exception 'SOURCE_PDF_PUBLIC_EXECUTION';end if;
  end loop;
 end loop;
 if has_table_privilege('otr_trip_source_command_gateway','public.trip_source_representations','INSERT,UPDATE') or has_table_privilege('otr_trip_source_command_gateway','public.trip_source_operations','INSERT,UPDATE') or has_table_privilege('otr_trip_source_command_gateway','public.trip_source_pdf_registrations','INSERT,UPDATE') then raise exception 'SOURCE_PDF_DIRECT_DML';end if;
 begin truncate public.trip_source_pdf_registrations;raise exception 'SOURCE_PDF_MUTABLE';exception when raise_exception then if sqlerrm<>'PDF_SEAL_IMMUTABLE' then raise;end if;end;
end$$;
rollback;
