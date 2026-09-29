begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
set local role service_role;
insert into public.journey_members(id,trip_id,user_id,display_name,role,status,linked_at)
values ('12000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','Member','group_member','linked',now())
on conflict (trip_id,user_id) do update set status='linked';
insert into public.ledger_settings(journey_id,settlement_currency,settlement_scale,valuation_policy)
values('10000000-0000-4000-8000-000000000001','NZD',2,'REFERENCE_RATE') on conflict(journey_id) do nothing;
create temp table v2_state(base jsonb, current_response jsonb, resolution jsonb, result jsonb);
insert into v2_state(base,current_response) values(null,'{
 "entity":{"id":"89000000-0000-4000-8000-000000000001","journeyId":"10000000-0000-4000-8000-000000000001","creatorMemberId":"12000000-0000-4000-8000-000000000002","payerMemberId":"12000000-0000-4000-8000-000000000002","title":"Expense consistency isolated fixture","description":null,"category":"food","occurredAt":"2026-07-12T00:00:00Z","economicDate":"2026-07-12","original":{"minor":10000,"currency":"EUR","scale":2},"businessStatus":"RATE_REQUIRED","settlementParticipation":"INCLUDED","revision":1,"deletedAt":null,"createdAt":"2026-07-12T00:00:00Z","updatedAt":"2026-07-12T00:00:00Z","participants":[{"memberId":"12000000-0000-4000-8000-000000000002","displayNameSnapshot":"Member","householdIdSnapshot":null}],"splits":[{"memberId":"12000000-0000-4000-8000-000000000002","method":"EQUAL_PERSON","originalMinor":10000,"settlementMinor":null,"weightUnits":null,"percentageUnits":null,"roundingAdjustmentMinor":0}],"valuation":null,"paymentRecords":[],"auditEvents":[{"id":"89000000-0000-4000-8000-000000000002","expenseId":"89000000-0000-4000-8000-000000000001","actorUserId":"00000000-0000-4000-8000-000000000002","actorMemberId":null,"eventType":"CREATED","reason":null,"changedGroups":["FINANCIAL_CORE"],"revision":1,"createdAt":"2026-07-12T00:00:00Z"}]},"serverId":"89000000-0000-4000-8000-000000000001","revision":1,"updatedAt":"2026-07-12T00:00:00Z","idempotentReplay":false
}'::jsonb);
create function pg_temp.envelope(key text,intent jsonb,observed bigint) returns jsonb language sql as $$
 select jsonb_build_object('commandId',key,'intentVersion',2,'intentSequence',1,'predecessorOperationId',null,'observedServerRevision',observed,'observedBase',null,'patchOrIntent',intent,'causalBaseReceipt',null,'boundExecutionRevision',observed,'idempotencyKey',key);
$$;
create function pg_temp.call(key text,intent jsonb,observed bigint,prepared bigint,base jsonb,eligibility text,response jsonb,resolution jsonb default null) returns jsonb language sql as $$
 select public.ledger_execute_expense_v2('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001',
   pg_temp.envelope(case when resolution is null then key else resolution ->> 'commandId' end,intent,observed) || jsonb_build_object('idempotencyKey',key),
   'Isolated Phase 5 gate',prepared,base,eligibility,response,null,resolution);
$$;
create function pg_temp.next_response(intent jsonb) returns jsonb language plpgsql as $$
declare entity jsonb; rev bigint; status text;
begin
 select current_response -> 'entity' into entity from v2_state;
 rev := (entity ->> 'revision')::bigint + 1;
 status := case intent ->> 'type' when 'DELETE' then 'DELETED' when 'RESTORE' then intent ->> 'businessStatus' else entity ->> 'businessStatus' end;
 entity := entity || jsonb_build_object('revision',rev,'businessStatus',status,'deletedAt',case when status='DELETED' then now() end,'updatedAt',now());
 if intent ->> 'type'='UPDATE' then entity := entity || coalesce(intent #> '{patch,descriptive}','{}'::jsonb); end if;
 entity := jsonb_set(entity,'{auditEvents}',(entity -> 'auditEvents') || jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'expenseId',entity ->> 'id','actorUserId','00000000-0000-4000-8000-000000000002','actorMemberId',null,'eventType',case intent ->> 'type' when 'DELETE' then 'DELETED' when 'RESTORE' then 'RESTORED' else 'EDITED' end,'reason','Isolated Phase 5 gate','changedGroups',jsonb_build_array(case when intent ->> 'type'='UPDATE' then 'DESCRIPTIVE' else 'LIFECYCLE' end),'revision',rev,'createdAt',now())));
 return jsonb_build_object('entity',entity,'serverId',entity ->> 'id','revision',rev,'updatedAt',entity -> 'updatedAt','idempotentReplay',false);
end;
$$;
update v2_state set result=pg_temp.call('create-v2',jsonb_build_object('type','CREATE','expense',current_response -> 'entity'),0,0,null,'DIRECT',current_response);
select is((select result #>> '{receipt,commandType}' from v2_state),'CREATE','CREATE returns correlated typed receipt');
update v2_state set current_response=result,base=result -> 'entity';
select is((select count(*) from public.expense_revision_evidence where expense_id='89000000-0000-4000-8000-000000000001'),2::bigint,'both inner and outer immutable CREATE success evidence captured');
select throws_ok($$update public.expense_revision_evidence set canonical='{}' where expense_id='89000000-0000-4000-8000-000000000001'$$,'42501',null,'service cannot mutate historical evidence');

-- Actual guarded automatic reference valuation, not a fabricated UPDATE.
insert into public.ledger_rate_quotes(id,journey_id,quote_currency,base_currency,decimal_rate,effective_date,economic_date,reference_date,policy_version,observed_at,expires_at,provider,provider_reference,source_reference)
values('89000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','EUR','NZD',1.9608,'2026-07-10','2026-07-12','2026-07-10','ECB_DAILY_V1',now(),now()+interval '30 days','ECB','https://api.frankfurter.dev/v2/providers/ecb/rate/EUR/NZD?date=2026-07-12','https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html');
update v2_state set current_response=jsonb_set(jsonb_set(jsonb_set(pg_temp.next_response('{"type":"UPDATE","patch":{}}'),'{entity,businessStatus}','"ACCEPTED"'),'{entity,splits,0,settlementMinor}','19608'),'{entity,valuation}',
'{"id":"89000000-0000-4000-8000-000000000005","policy":"REFERENCE_RATE","original":{"minor":10000,"currency":"EUR","scale":2},"settlement":{"minor":19608,"currency":"NZD","scale":2},"rateSnapshotId":"89000000-0000-4000-8000-000000000004","paymentRecordId":null,"reason":"Automatic reference","decimalRate":"1.9608","referenceEvidence":{"automatic":true}}');
select lives_ok($$select public.ledger_apply_valuation_c('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001','auto-reference','auto-reference-hash',
'{"baseRevision":1,"settingsRevision":1,"policy":"REFERENCE_RATE","economicDate":"2026-07-12","rateQuoteId":"89000000-0000-4000-8000-000000000003","reason":"Automatic reference","previewSettlement":{"minor":19608,"currency":"NZD","scale":2}}',
'{"id":"89000000-0000-4000-8000-000000000004","decimalRate":"1.9608","effectiveDate":"2026-07-10","observedAt":"2026-09-29T00:00:00Z","provider":"ECB","providerReference":"https://api.frankfurter.dev/v2/providers/ecb/rate/EUR/NZD?date=2026-07-12","stalenessState":"FRESH"}',(select current_response from v2_state),true)$$,'guarded automatic reference advances server to revision 2');

create temp table rate_intent(value jsonb, prepared jsonb, result jsonb);
insert into rate_intent(value) select jsonb_build_object('type','APPLY_VALUATION','valuation',jsonb_build_object(
 'localValuationId','accepted-rate','localRateSnapshotId','accepted-snapshot','policy','MANUAL_AGREED','manualRate','1.9608','reason','Accept displayed value',
 'previewSettlement',current_response #> '{entity,valuation,settlement}',
 'rateAcceptance',jsonb_build_object('revision',1,'serverRevision',1,'original',base -> 'original','economicDate',base -> 'economicDate','settlement',current_response #> '{entity,valuation,settlement}','decimalRate','1.9608','referenceDate','2026-07-10'))) from v2_state;
select ok(public.ledger_rate_acceptance_rebase_v2((select base from v2_state),(select current_response -> 'entity' from v2_state),(select value from rate_intent)),'compatible automatic reference and shown agreement match');
select ok(not public.ledger_rate_acceptance_rebase_v2((select base from v2_state),jsonb_set((select current_response -> 'entity' from v2_state),'{original,minor}','10001'),(select value from rate_intent)),'financial drift cannot rebase');
select ok(not public.ledger_rate_acceptance_rebase_v2((select base from v2_state),(select current_response -> 'entity' from v2_state),jsonb_set((select value from rate_intent),'{valuation,manualRate}','"1.96081"')),'different rate invalid even with identical rounded money');
select ok(not public.ledger_rate_acceptance_rebase_v2((select base from v2_state),jsonb_set((select current_response -> 'entity' from v2_state),'{valuation,policy}','"MANUAL_AGREED"'),(select value from rate_intent)),'existing agreed value is not an automatic reference');
select ok(not public.ledger_rate_acceptance_rebase_v2((select base from v2_state),jsonb_set((select current_response -> 'entity' from v2_state),'{valuation,referenceEvidence,automatic}','false'),(select value from rate_intent)),'explicit reference choice cannot be silently replaced');
update rate_intent set prepared=pg_temp.next_response('{"type":"UPDATE","patch":{}}');
update rate_intent set prepared=jsonb_set(prepared,'{entity,valuation}',
 (prepared #> '{entity,valuation}') || '{"id":"89000000-0000-4000-8000-000000000008","policy":"MANUAL_AGREED","rateSnapshotId":"89000000-0000-4000-8000-000000000007","reason":"Accept displayed value","supersedesValuationId":"89000000-0000-4000-8000-000000000005"}'::jsonb);
create function pg_temp.rate_call(key text,intent jsonb,base_value jsonb,eligibility text,prepared_value jsonb) returns jsonb language sql as $$
 select public.ledger_execute_expense_v2('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001',
 pg_temp.envelope(key,intent,1),'Accept displayed value',2,base_value,eligibility,prepared_value || jsonb_build_object('_verifiedCurrent',(select current_response -> 'entity' from v2_state)),
 '{"id":"89000000-0000-4000-8000-000000000007","decimalRate":"1.9608","effectiveDate":"2026-07-10","observedAt":"2026-09-29T00:00:00Z","provider":"MANUAL","stalenessState":"FRESH"}',null);
$$;
select is((pg_temp.rate_call('no-history-rate',(select value from rate_intent),null,'VALUATION_REBASE',(select prepared from rate_intent)) #>> '{error,code}'),'REVISION_CONFLICT','missing history remains OPEN');
select is((pg_temp.rate_call('changed-date-rate',jsonb_set((select value from rate_intent),'{valuation,rateAcceptance,economicDate}','"2026-07-11"'),(select base from v2_state),'VALUATION_REBASE',(select prepared from rate_intent)) #>> '{error,code}'),'REVISION_CONFLICT','changed displayed date remains OPEN');
select throws_ok($$select pg_temp.rate_call('forged-history-rate',(select value from rate_intent),jsonb_set((select base from v2_state),'{original,minor}','999'),'VALUATION_REBASE',(select prepared from rate_intent))$$,'P0001','UNVERIFIED_OBSERVED_BASE','forged server history rejected');
update rate_intent set result=pg_temp.rate_call('rate-rebase',value,(select base from v2_state),'VALUATION_REBASE',prepared);
select is((select result #>> '{entity,valuation,policy}' from rate_intent),'MANUAL_AGREED','explicit agreed value replaces compatible automatic reference');
select is((select result #>> '{receipt,commandType}' from rate_intent),'APPLY_VALUATION','valuation receipt correlated to typed command');
select is((select revision from public.expenses where id='89000000-0000-4000-8000-000000000001'),3::bigint,'one explicit valuation revision');
create temp table rate_counts as select (select count(*) from public.expense_audit_events) audits,(select count(*) from public.settlement_valuation_snapshots) valuations;
select is(pg_temp.rate_call('rate-rebase',(select value from rate_intent),(select base from v2_state),'VALUATION_REBASE',(select prepared from rate_intent)),(select result from rate_intent),'response-loss replay returns exact original result before drift checks');
select is((select count(*) from public.expense_audit_events),(select audits from rate_counts),'replay adds no audit');
select is((select count(*) from public.settlement_valuation_snapshots),(select valuations from rate_counts),'replay adds no valuation');
select is((select revision from public.expenses where id='89000000-0000-4000-8000-000000000001'),3::bigint,'replay adds no revision');
select * from finish();
rollback;
