CREATE OR REPLACE FUNCTION public.trip_source_run_only_row(tab text, op text, n jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$declare q jsonb;r public.trip_source_runs;pin public.trip_source_inputs;
begin
 q:=public.trip_source_pdf_upload_v4_scope();
 if tab='trip_source_runs' then
  if op not in ('INSERT','UPDATE') or n->>'actor_account_id' is distinct from q->>'actor_account_id' or n->>'trip_id' is distinct from q->>'trip_id' or n->'scope_source_ids' is distinct from jsonb_build_array(q->'source_id') or n->>'retention_state'<>'RETAINED' or n->>'state' not in ('PENDING','RUNNING','READY') or n->'superseded_by' is distinct from 'null'::jsonb then raise exception 'SOURCE_RUN_SCOPE_DENIED';end if;
 elsif tab='trip_source_inputs' then
  pin:=jsonb_populate_record(null::public.trip_source_inputs,n);
  if op<>'INSERT' or not public.trip_source_run_only_material((q->>'actor_account_id')::uuid,(q->>'trip_id')::uuid,pin) then raise exception 'SOURCE_RUN_SCOPE_DENIED';end if;
  select * into r from public.trip_source_runs where id=pin.run_id;
 else
  if tab<>'trip_source_candidates' or op<>'INSERT' then raise exception 'SOURCE_RUN_SCOPE_DENIED';end if;
  select * into r from public.trip_source_runs where id=(n->>'run_id')::uuid;
 end if;
 if tab<>'trip_source_runs' and (r.id is null or r.actor_account_id is distinct from (q->>'actor_account_id')::uuid or r.trip_id is distinct from (q->>'trip_id')::uuid or r.scope_source_ids is distinct from array[(q->>'source_id')::uuid] or r.state not in ('PENDING','RUNNING') or r.retention_state<>'RETAINED') then raise exception 'SOURCE_RUN_SCOPE_DENIED';end if;
end$function$
