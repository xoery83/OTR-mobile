-- Only explicit recovery of a server-proven legacy no-op; aggregate writes stay strict CAS.
create function public.ledger_legacy_expense_noop_v2(historical jsonb, submitted jsonb)
returns boolean language plpgsql immutable set search_path=public as $$
declare fields text[] := array['title','description','category','economicDate','payerMemberId','original','settlementParticipation','participants','splits','businessStatus','valuation'];
  baseline jsonb; candidate jsonb;
begin
  if historical is null or submitted is null or historical ->> 'businessStatus' <> 'RATE_REQUIRED'
    or historical -> 'valuation' <> 'null'::jsonb then return false; end if;
  select jsonb_object_agg(k,historical -> k),jsonb_object_agg(k,submitted -> k)
    into baseline,candidate from unnest(fields) k;
  return baseline = candidate and
    (historical ->> 'occurredAt')::timestamptz = (submitted ->> 'occurredAt')::timestamptz;
exception when others then return false;
end;
$$;
revoke all on function public.ledger_legacy_expense_noop_v2(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ledger_legacy_expense_noop_v2(jsonb,jsonb) to service_role;

-- Retain every existing permission/frozen/revision/chain/replay guard and transaction.
do $$
declare definition text; anchor text := $a$when r ->> 'commandType'='UPDATE_EXPENSE' and resolution_value ->> 'choice'='KEEP_SERVER' then '{"type":"UPDATE","patch":{}}'::jsonb end$a$;
  replacement text := $a$when r ->> 'commandType'='UPDATE_EXPENSE' and resolution_value ->> 'choice'='KEEP_SERVER' then '{"type":"UPDATE","patch":{}}'::jsonb
            when r ->> 'commandType'='UPDATE_EXPENSE' and resolution_value ->> 'choice'='ACCEPT_EQUIVALENT'
              and public.ledger_legacy_expense_noop_v2(historical_base_value,r #> '{body,error,submitted}')
              then '{"type":"UPDATE","patch":{}}'::jsonb end$a$;
begin
  select pg_get_functiondef('public.ledger_execute_expense_v2(uuid,uuid,uuid,jsonb,text,bigint,jsonb,text,jsonb,jsonb,jsonb)'::regprocedure) into definition;
  if position(anchor in definition)=0 then raise exception 'Unexpected parent RPC: legacy admission anchor missing'; end if;
  execute replace(definition,anchor,replacement);
end;
$$;
notify pgrst, 'reload schema';
