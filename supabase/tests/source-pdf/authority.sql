-- Fresh disposable clone only; migration must be inert for every deployed principal.
begin;
do $$declare role_name text;begin
 if exists(select 1 from public.trip_source_pdf_gate where enabled) or exists(select 1 from public.trip_source_pdf_seals) then raise exception 'PDF_NOT_CLOSED';end if;
 if exists(select 1 from pg_roles where rolname in ('otr_trip_source_command_gateway','otr_trip_core_v2_writer') and rolcanlogin) then raise exception 'UNEXPECTED_LOGIN';end if;
 foreach role_name in array array['anon','authenticated','service_role','otr_trip_core_v2_gateway','otr_trip_core_v2_writer'] loop
  if has_function_privilege(role_name,'public.trip_source_pdf_commit(jsonb,text)','EXECUTE') or has_function_privilege(role_name,'public.trip_source_pdf_context(uuid,uuid,jsonb)','EXECUTE') then raise exception 'PDF_PUBLIC_AUTHORITY';end if;
 end loop;
 if has_table_privilege('otr_trip_source_command_gateway','public.trip_source_pdf_seals','INSERT') then raise exception 'PDF_DIRECT_DML';end if;
 begin update public.trip_source_pdf_gate set enabled=true;raise exception 'PDF_GATE_OPEN';exception when check_violation then null;end;
 begin truncate public.trip_source_pdf_seals;raise exception 'PDF_NOT_IMMUTABLE';exception when raise_exception then if sqlerrm<>'PDF_SEAL_IMMUTABLE' then raise;end if;end;
end$$;
rollback;
