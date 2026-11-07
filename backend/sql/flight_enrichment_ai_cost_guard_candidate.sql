-- DEV protected source candidate. The existing Search charges and resource pins stay in use.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';

CREATE FUNCTION pg_temp.otr_enrichment_cost_edit(target regprocedure, needle text, replacement text)
RETURNS void LANGUAGE plpgsql AS $edit$
DECLARE body text; definition text;
BEGIN
  SELECT prosrc, pg_get_functiondef(oid) INTO STRICT body, definition
    FROM pg_proc WHERE oid=target;
  IF (length(body)-length(replace(body,needle,''))) <> length(needle) THEN
    RAISE EXCEPTION 'ENRICHMENT_COST_GUARD_PREIMAGE_DRIFT: %', target;
  END IF;
  EXECUTE replace(definition, body, replace(body,needle,replacement));
END
$edit$;

DO $patch$
DECLARE
  live_scope regprocedure := 'public.cp_enrichment_live_scope(uuid,uuid,uuid)';
  runtime_scope regprocedure := 'public.flight_enrichment_runtime_scope(jsonb,jsonb)';
  reserve_step regprocedure := 'public.flight_enrichment_reserve_step(jsonb,jsonb)';
  mark_dispatch regprocedure := 'public.flight_enrichment_mark_dispatch(jsonb,jsonb)';
  step_receipt regprocedure := 'public.flight_enrichment_step_receipt(jsonb,jsonb)';
  off text := $predicate$(session_user='otr_external_integration_call_gateway' AND coalesce(current_setting('otr.ai_cost_guard',true)='off',false))$predicate$;
BEGIN
  PERFORM pg_temp.otr_enrichment_cost_edit(live_scope,
    '((price.price_schedule_id=s.price_schedule_id',
    '((NOT '||off||' AND price.price_schedule_id=s.price_schedule_id');
  PERFORM pg_temp.otr_enrichment_cost_edit(live_scope,
    '>clock_timestamp()))<>2',
    '>clock_timestamp()))<>(CASE WHEN '||off||' THEN 1 ELSE 2 END)');

  PERFORM pg_temp.otr_enrichment_cost_edit(runtime_scope,
    'into units from public.external_integration_price_schedule_units where price_schedule_id=s.price_schedule_id;',
    'into units from public.external_integration_price_schedule_units where NOT '||off||' AND price_schedule_id=s.price_schedule_id;');

  PERFORM pg_temp.otr_enrichment_cost_edit(reserve_step,
    'policy jsonb;q jsonb;binding jsonb;parent_search public.external_integration_calls;',
    'policy jsonb;q jsonb;binding jsonb;parent_search public.external_integration_calls;'||
    ' unpriced boolean := kind=''EXTRACTION'' AND '||off||';');
  PERFORM pg_temp.otr_enrichment_cost_edit(reserve_step,
    $old$  price_id:=s.price_schedule_id;
  select greatest(max(price_per_quantity*1000000000/unit_quantity) filter(where measurement_unit='input_tokens'),max(price_per_quantity*1000000000/unit_quantity) filter(where measurement_unit='cached_input_tokens')),
  max(price_per_quantity*1000000000/unit_quantity) filter(where measurement_unit='output_tokens') into input_rate,output_rate
  from public.external_integration_price_schedule_units where price_schedule_id=price_id;
  if input_rate is null or output_rate is null then raise exception 'ENRICHMENT_PRICE_DIMENSION';end if;
  worst:=ceil(24000*input_rate+1200*output_rate);$old$,
    $new$  IF unpriced THEN price_id:=NULL; worst:=0;
  ELSE
  price_id:=s.price_schedule_id;
  select greatest(max(price_per_quantity*1000000000/unit_quantity) filter(where measurement_unit='input_tokens'),max(price_per_quantity*1000000000/unit_quantity) filter(where measurement_unit='cached_input_tokens')),
  max(price_per_quantity*1000000000/unit_quantity) filter(where measurement_unit='output_tokens') into input_rate,output_rate
  from public.external_integration_price_schedule_units where price_schedule_id=price_id;
  if input_rate is null or output_rate is null then raise exception 'ENRICHMENT_PRICE_DIMENSION';end if;
  worst:=ceil(24000*input_rate+1200*output_rate);
  END IF;$new$);
  PERFORM pg_temp.otr_enrichment_cost_edit(reserve_step,
    $old$remaining:=10000000-coalesce((select sum(h.worst_cost_nanos) from public.flight_call_resource_holds h join public.external_integration_calls c using(call_id)
 where c.account_id=j.account_id and c.integration_id=s.integration_id and c.task_id=j.logical_request_id),0);$old$,
    $new$IF unpriced THEN remaining:=10000000;
 ELSE
 remaining:=10000000-coalesce((select sum(h.worst_cost_nanos) from public.flight_call_resource_holds h join public.external_integration_calls c using(call_id)
 where c.account_id=j.account_id and c.integration_id=s.integration_id and c.task_id=j.logical_request_id),0);
 END IF;$new$);
  PERFORM pg_temp.otr_enrichment_cost_edit(reserve_step,
    $old$if worst>remaining or worst>s.call_cost_nanos
 or worst+coalesce((select sum(worst_cost_nanos) from public.flight_call_resource_holds where account_id=j.account_id and admission_day=day),0)>s.account_day_cost_nanos
 or worst+coalesce((select sum(worst_cost_nanos) from public.flight_call_resource_holds where admission_day=day),0)>s.dev_day_cost_nanos
 then raise exception 'ENRICHMENT_BUDGET';end if;$old$,
    $new$if NOT unpriced AND (worst>remaining or worst>s.call_cost_nanos
 or worst+coalesce((select sum(worst_cost_nanos) from public.flight_call_resource_holds where account_id=j.account_id and admission_day=day),0)>s.account_day_cost_nanos
 or worst+coalesce((select sum(worst_cost_nanos) from public.flight_call_resource_holds where admission_day=day),0)>s.dev_day_cost_nanos)
 then raise exception 'ENRICHMENT_BUDGET';end if;$new$);
  -- Keep the nonfinancial concurrency/count reservation and its exact scope/grant
  -- pins. Its existing non-null FK records the scope's historical price identity.
  -- OFF never reads that price or reserves money against it.
  PERFORM pg_temp.otr_enrichment_cost_edit(reserve_step,
    $old$worst,'USD',price_id,s.pins$old$,
    $new$worst,'USD',CASE WHEN unpriced THEN s.price_schedule_id ELSE price_id END,s.pins$new$);

  PERFORM pg_temp.otr_enrichment_cost_edit(mark_dispatch,
    'r public.external_integration_calls;h public.flight_call_resource_holds;m public.model_task_admissions;',
    'r public.external_integration_calls;h public.flight_call_resource_holds;m public.model_task_admissions; unpriced boolean;');
  PERFORM pg_temp.otr_enrichment_cost_edit(mark_dispatch,
    'if h.call_id is null or h.scope_id',
    'unpriced:=r.capability=''EXTRACT'' AND r.price_schedule_id IS NULL AND '||off||';'||
    ' if h.call_id is null or h.scope_id');
  PERFORM pg_temp.otr_enrichment_cost_edit(mark_dispatch,
    'or h.worst_cost_nanos>s.call_cost_nanos or h.price_schedule_id is distinct from r.price_schedule_id',
    'or (CASE WHEN unpriced THEN h.worst_cost_nanos<>0 OR h.price_schedule_id IS DISTINCT FROM s.price_schedule_id'||
    ' ELSE h.worst_cost_nanos>s.call_cost_nanos OR h.price_schedule_id IS DISTINCT FROM r.price_schedule_id END)');
  PERFORM pg_temp.otr_enrichment_cost_edit(mark_dispatch,
    'or r.price_schedule_id is distinct from s.price_schedule_id or m.currency is distinct from ''USD'' or h.worst_cost_nanos>m.max_cost_nanos',
    'or m.currency is distinct from ''USD'' OR (NOT unpriced AND'||
    ' (r.price_schedule_id IS DISTINCT FROM s.price_schedule_id OR h.worst_cost_nanos>m.max_cost_nanos))');

  -- Settlement reads the originally accepted mode from the call even after an env change.
  PERFORM pg_temp.otr_enrichment_cost_edit(step_receipt,
    'or h.price_schedule_id is distinct from r.price_schedule_id',
    'or (CASE WHEN r.capability=''EXTRACT'' AND r.price_schedule_id IS NULL THEN h.worst_cost_nanos<>0'||
    ' ELSE h.price_schedule_id IS DISTINCT FROM r.price_schedule_id END)');
END
$patch$;

DROP FUNCTION pg_temp.otr_enrichment_cost_edit(regprocedure,text,text);
COMMIT;
