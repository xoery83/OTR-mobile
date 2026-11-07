-- DEV candidate. Run as the existing function owner through the protected installer.
-- Each edit requires the expected source fragment exactly once. Any drift rolls back.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';

CREATE FUNCTION pg_temp.otr_cost_guard_edit(target regprocedure, needle text, replacement text)
RETURNS void LANGUAGE plpgsql AS $edit$
DECLARE body text; definition text;
BEGIN
  SELECT prosrc, pg_get_functiondef(oid) INTO STRICT body, definition
    FROM pg_proc WHERE oid=target;
  IF (length(body)-length(replace(body,needle,''))) <> length(needle) THEN
    RAISE EXCEPTION 'AI_COST_GUARD_PREIMAGE_DRIFT: %', target;
  END IF;
  EXECUTE replace(definition, body, replace(body,needle,replacement));
END
$edit$;

DO $patch$
DECLARE
  select_scope regprocedure := 'public.universal_import_select_continuous(uuid,uuid,text)';
  check_scope regprocedure := 'public.universal_import_check_continuous_scope(public.flight_activation_scopes)';
  continuous_scope regprocedure := 'public.universal_import_continuous_scope(public.external_integration_calls,jsonb,text,boolean)';
  finite_scope regprocedure := 'public.universal_import_read_scope(uuid,uuid,uuid,uuid)';
  binding regprocedure := 'public.universal_import_validate_binding(jsonb,public.external_integration_calls,boolean)';
  reserve_call regprocedure := 'public.universal_activation_reserve_call(jsonb,jsonb)';
  admitted_price regprocedure := 'public.universal_import_read_admitted_price(uuid,uuid,uuid,uuid)';
  -- Only the existing call gateway can request this transaction-local DEV mode.
  off text := $predicate$(session_user='otr_external_integration_call_gateway' AND coalesce(current_setting('otr.ai_cost_guard', true)='off',false))$predicate$;
  priced text;
BEGIN
  SELECT substring(prosrc FROM $regex$(OR NOT EXISTS\(SELECT 1 FROM public\.external_integration_price_schedules price[^\n]+)$regex$)
    INTO priced FROM pg_proc WHERE oid=select_scope;
  IF priced IS NULL THEN RAISE EXCEPTION 'AI_COST_GUARD_SELECT_PRICE_PREIMAGE'; END IF;
  PERFORM pg_temp.otr_cost_guard_edit(select_scope, priced, 'OR (NOT '||off||' AND '||substr(priced,4)||')');

  PERFORM pg_temp.otr_cost_guard_edit(check_scope,
    'OR NOT s.monetary_approved', 'OR (NOT '||off||' AND NOT s.monetary_approved)');

  PERFORM pg_temp.otr_cost_guard_edit(continuous_scope,
    'r.price_schedule_id IS DISTINCT FROM s.price_schedule_id',
    'r.price_schedule_id IS DISTINCT FROM (CASE WHEN '||off||' THEN NULL ELSE s.price_schedule_id END)');
  PERFORM pg_temp.otr_cost_guard_edit(continuous_scope,
    ' INTO price FROM public.external_integration_price_schedule_units WHERE price_schedule_id=s.price_schedule_id;',
    ' INTO price FROM public.external_integration_price_schedule_units WHERE NOT '||off||' AND price_schedule_id=s.price_schedule_id;');
  PERFORM pg_temp.otr_cost_guard_edit(continuous_scope,
    $old$'price_schedule_id',s.price_schedule_id,'request_sha256'$old$,
    $new$'price_schedule_id',r.price_schedule_id,'request_sha256'$new$);
  PERFORM pg_temp.otr_cost_guard_edit(select_scope,
    $old$'priceScheduleId',s.price_schedule_id$old$,
    $new$'priceScheduleId',CASE WHEN $new$||off||$new$ THEN NULL ELSE s.price_schedule_id END$new$);

  PERFORM pg_temp.otr_cost_guard_edit(finite_scope,
    $old$return to_jsonb(s)||jsonb_build_object('priceUnits',$old$,
    'IF '||off||$new$ THEN
      return to_jsonb(s)||jsonb_build_object('price_schedule_id',NULL,'priceUnits',NULL);
    END IF;
    return to_jsonb(s)||jsonb_build_object('priceUnits',$new$);

  PERFORM pg_temp.otr_cost_guard_edit(binding,
    's.price_schedule_id=r.price_schedule_id',
    'r.price_schedule_id IS NOT DISTINCT FROM (CASE WHEN r.environment=''DEV'' AND '||off||' THEN NULL ELSE s.price_schedule_id END)');
  PERFORM pg_temp.otr_cost_guard_edit(binding,
    ' if exists(select 1 from public.external_integration_price_schedule_units u',
    ' if r.environment=''DEV'' AND '||off||' then '||
    'if (p->>''deadline'')::timestamptz>s.expires_at then raise exception ''UNIVERSAL_PROVIDER_SCOPE_EXPIRED'';end if;return;end if;'||
    ' if exists(select 1 from public.external_integration_price_schedule_units u');

  -- Reuse the existing non-monetary reserve/START path. Keep sustained resource
  -- limits by counting existing call rows instead of creating monetary holds.
  PERFORM pg_temp.otr_cost_guard_edit(reserve_call,
    ' perform public.cp14_call_admission(r);',
    ' perform public.cp14_call_admission(r);'||
    ' IF r.environment=''DEV'' AND '||off||' AND public.trip_sustained_universal_allowed(r.account_id,r.trip_id) THEN '||
    $count$
      IF EXISTS (
        SELECT 1
        FROM public.flight_activation_scopes sc
        CROSS JOIN LATERAL (
          SELECT
            count(*) FILTER (WHERE c.account_id=r.account_id
              AND (c.dispatch_state<>'TERMINAL' OR c.execution_certainty='UNKNOWN')
              AND (a.deadline IS NULL OR a.deadline+interval '60 seconds'>clock_timestamp())) AS concurrent_account,
            count(*) FILTER (WHERE c.account_id=r.account_id AND c.admitted_at>=date_trunc('day',clock_timestamp(),'UTC')) AS account_daily,
            count(*) FILTER (WHERE c.admitted_at>=date_trunc('day',clock_timestamp(),'UTC')) AS dev_daily,
            count(*) FILTER (WHERE c.provider_id='DeepSeek' AND c.admitted_at>=date_trunc('day',clock_timestamp(),'UTC')) AS provider_daily
          FROM public.external_integration_calls c
          LEFT JOIN public.model_task_admissions a ON a.call_id=c.call_id
          WHERE c.environment='DEV' AND (
            (c.task_class='UNIVERSAL_IMPORT_V1' AND c.price_schedule_id IS NULL)
            OR EXISTS (SELECT 1 FROM public.flight_call_resource_holds h WHERE h.call_id=c.call_id))
        ) used
        WHERE sc.integration_id=r.integration_id
          AND sc.revision=(SELECT max(latest.revision) FROM public.flight_activation_scopes latest WHERE latest.integration_id=r.integration_id)
          AND (used.concurrent_account>=sc.concurrent_account OR used.account_daily>=sc.account_daily
            OR used.dev_daily>=sc.dev_daily OR used.provider_daily>=sc.provider_daily)
      ) THEN RAISE EXCEPTION 'CP15_RESOURCE_LIMIT'; END IF;
    END IF;
    $count$);

  PERFORM pg_temp.otr_cost_guard_edit(admitted_price,
    ' RETURN units;',
    ' RETURN CASE WHEN r.environment=''DEV'' AND r.price_schedule_id IS NULL THEN ''[]''::jsonb ELSE units END;');
END
$patch$;

DROP FUNCTION pg_temp.otr_cost_guard_edit(regprocedure,text,text);
COMMIT;
