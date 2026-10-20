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


select ok(public.ledger_legacy_expense_noop_v2((select base from v2_state),jsonb_set((select base from v2_state),'{occurredAt}','"2026-07-12"')),'equivalent timestamp does not invent descriptive intent');
select ok(not public.ledger_legacy_expense_noop_v2(null,(select base from v2_state)),'missing historical evidence rejected');
select ok(not public.ledger_legacy_expense_noop_v2((select base from v2_state),jsonb_set((select base from v2_state),'{original,minor}','10001')),'real financial intent rejected');
select ok(not public.ledger_legacy_expense_noop_v2((select base from v2_state),jsonb_set((select base from v2_state),'{title}','"New title"')),'real descriptive intent rejected');
select ok(not public.ledger_legacy_expense_noop_v2((select current_response -> 'entity' from v2_state),(select base from v2_state)),'valuation removal cannot be inferred as equivalent');
select public.ledger_record_conflict_4c('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001','UPDATE_EXPENSE','legacy-noop','legacy-hash',jsonb_build_object('error',jsonb_build_object('code','REVISION_CONFLICT','expenseId','89000000-0000-4000-8000-000000000001','baseRevision',1,'currentRevision',2,'submitted',jsonb_set((select base from v2_state),'{occurredAt}','"2026-07-12"'),'current',(select current_response -> 'entity' from v2_state))));
update v2_state set resolution=jsonb_build_object('contractVersion',2,'commandId','legacy-noop','intentType','UPDATE','submittedIntent','{"type":"UPDATE","patch":{}}'::jsonb,'observedBaseRevision',1,'currentServerRevision',2,'expectedChainDigest',public.ledger_expense_chain_v2('10000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001')->'chainDigest','coveredConflictIds',jsonb_build_array((select id from public.ledger_idempotency_keys where idempotency_key='legacy-noop')),'choice','ACCEPT_EQUIVALENT','reason','Equivalent historical save');
create temp table counts_before as select (select count(*) from public.expense_audit_events) audits,(select count(*) from public.settlement_valuation_snapshots) valuations;
update v2_state set result=pg_temp.call('legacy-close','{"type":"UPDATE","patch":{}}',1,2,base,'EQUIVALENT',current_response,resolution);
select is((select result #>> '{canonical,valuation,policy}' from v2_state),'REFERENCE_RATE','equivalent closure preserves newer reference valuation');
select is((select result #>> '{resolutionReceipt,disposition}' from v2_state),'APPLIED','correlated equivalent operation receipt');
select is((select revision from public.expenses where id='89000000-0000-4000-8000-000000000001'),2::bigint,'no redundant mutation revision');
select is((select count(*) from public.settlement_valuation_snapshots),(select valuations from counts_before),'no duplicate valuation');
select is((select count(*) from public.expense_audit_events),(select audits+1 from counts_before),'one auditable equivalent closure');
select is((select jsonb_array_length(result->'openConflictIds') from v2_state),0,'covered legacy conflict authoritatively closed');
select is(pg_temp.call('legacy-close','{"type":"UPDATE","patch":{}}',1,2,(select base from v2_state),'EQUIVALENT',(select current_response from v2_state),(select resolution from v2_state)),(select result from v2_state),'response-loss replay exact result');
select is((select count(*) from public.expense_audit_events),(select audits+1 from counts_before),'replay does not duplicate audit');
select * from finish();
rollback;
