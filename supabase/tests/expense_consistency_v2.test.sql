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
 "entity":{"id":"89000000-0000-4000-8000-000000000001","journeyId":"10000000-0000-4000-8000-000000000001","creatorMemberId":"12000000-0000-4000-8000-000000000002","payerMemberId":"12000000-0000-4000-8000-000000000002","title":"Expense consistency isolated fixture","description":null,"category":"food","occurredAt":"2026-07-12T00:00:00Z","economicDate":"2026-07-12","original":{"minor":10000,"currency":"EUR","scale":2},"businessStatus":"RATE_REQUIRED","settlementParticipation":"EXCLUDED","revision":1,"deletedAt":null,"createdAt":"2026-07-12T00:00:00Z","updatedAt":"2026-07-12T00:00:00Z","participants":[{"memberId":"12000000-0000-4000-8000-000000000002","displayNameSnapshot":"Member","householdIdSnapshot":null}],"splits":[{"memberId":"12000000-0000-4000-8000-000000000002","method":"EQUAL_PERSON","originalMinor":10000,"settlementMinor":null,"weightUnits":null,"percentageUnits":null,"roundingAdjustmentMinor":0}],"valuation":null,"paymentRecords":[],"auditEvents":[{"id":"89000000-0000-4000-8000-000000000002","expenseId":"89000000-0000-4000-8000-000000000001","actorUserId":"00000000-0000-4000-8000-000000000002","actorMemberId":null,"eventType":"CREATED","reason":null,"changedGroups":["FINANCIAL_CORE"],"revision":1,"createdAt":"2026-07-12T00:00:00Z"}]},"serverId":"89000000-0000-4000-8000-000000000001","revision":1,"updatedAt":"2026-07-12T00:00:00Z","idempotentReplay":false
}'::jsonb);
create function pg_temp.envelope(key text,intent jsonb,observed bigint) returns jsonb language sql as $$
 select jsonb_build_object('commandId',key,'intentVersion',2,'intentSequence',1,'predecessorOperationId',null,'observedServerRevision',observed,'observedBase',null,'patchOrIntent',intent,'causalBaseReceipt',null,'boundExecutionRevision',observed,'idempotencyKey',key);
$$;
create function pg_temp.call(key text,intent jsonb,observed bigint,prepared bigint,base jsonb,eligibility text,response jsonb,resolution jsonb default null) returns jsonb language sql as $$
 select public.ledger_execute_expense_v2('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001',
   pg_temp.envelope(case when resolution is null then key else resolution ->> 'commandId' end,intent,observed) || jsonb_build_object('idempotencyKey',key),
   'Isolated Phase 3 gate',prepared,base,eligibility,response,null,resolution);
$$;
create function pg_temp.next_response(intent jsonb) returns jsonb language plpgsql as $$
declare entity jsonb; rev bigint; status text;
begin
 select current_response -> 'entity' into entity from v2_state;
 rev := (entity ->> 'revision')::bigint + 1;
 status := case intent ->> 'type' when 'DELETE' then 'DELETED' when 'RESTORE' then intent ->> 'businessStatus' else entity ->> 'businessStatus' end;
 entity := entity || jsonb_build_object('revision',rev,'businessStatus',status,'deletedAt',case when status='DELETED' then now() end,'updatedAt',now());
 if intent ->> 'type'='UPDATE' then entity := entity || coalesce(intent #> '{patch,descriptive}','{}'::jsonb); end if;
 entity := jsonb_set(entity,'{auditEvents}',(entity -> 'auditEvents') || jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'expenseId',entity ->> 'id','actorUserId','00000000-0000-4000-8000-000000000002','actorMemberId',null,'eventType',case intent ->> 'type' when 'DELETE' then 'DELETED' when 'RESTORE' then 'RESTORED' else 'EDITED' end,'reason','Isolated Phase 3 gate','changedGroups',jsonb_build_array(case when intent ->> 'type'='UPDATE' then 'DESCRIPTIVE' else 'LIFECYCLE' end),'revision',rev,'createdAt',now())));
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
savepoint participation_probe;
select lives_ok($$select pg_temp.call('participation-only','{"type":"UPDATE","patch":{"financial":{"settlementParticipation":"INCLUDED"}}}',2,2,null,'DIRECT',jsonb_set(pg_temp.next_response('{"type":"UPDATE","patch":{}}'),'{entity,settlementParticipation}','"INCLUDED"'))$$,'EXCLUDED to INCLUDED typed update succeeds');
select is((select settlement_participation from public.expenses where id='89000000-0000-4000-8000-000000000001'),'INCLUDED','participation changes');
select is((select id::text from public.settlement_valuation_snapshots where expense_id='89000000-0000-4000-8000-000000000001' and is_active),'89000000-0000-4000-8000-000000000005','participation preserves accepted valuation identity');
rollback to savepoint participation_probe;
select throws_ok($$select pg_temp.call('forged-base','{"type":"UPDATE","patch":{"descriptive":{"title":"Title"}}}',1,2,jsonb_set((select base from v2_state),'{original,minor}','999'),'DESCRIPTIVE_REBASE',pg_temp.next_response('{"type":"UPDATE","patch":{"descriptive":{"title":"Title"}}}'))$$,'P0001','UNVERIFIED_OBSERVED_BASE','SQL rejects fabricated historical base');
select lives_ok($$select pg_temp.call('no-history','{"type":"UPDATE","patch":{"descriptive":{"title":"Title"}}}',99,2,null,'DESCRIPTIVE_REBASE',(select current_response from v2_state))$$,'missing historical evidence records conflict instead of merge');
select is((select response_status from public.ledger_idempotency_keys where idempotency_key='no-history'),409,'unverified base remains server OPEN');
update v2_state set result=pg_temp.call('description-v2','{"type":"UPDATE","patch":{"descriptive":{"title":"New title"}}}',1,2,base,'DESCRIPTIVE_REBASE',pg_temp.next_response('{"type":"UPDATE","patch":{"descriptive":{"title":"New title"}}}'));
select is((select title from public.expenses where id='89000000-0000-4000-8000-000000000001'),'New title','compatible descriptive patch rebases');
select is((select id::text from public.settlement_valuation_snapshots where expense_id='89000000-0000-4000-8000-000000000001' and is_active),'89000000-0000-4000-8000-000000000005','preserves exact newer valuation identity');
select is((select settlement_amount_minor from public.expense_splits where expense_id='89000000-0000-4000-8000-000000000001'),19608::bigint,'preserves server-derived split');
select ok((select metadata ? 'baseDigest' and metadata ? 'currentDigest' and metadata ? 'resultDigest' from public.expense_audit_events where id=(select (result #>> '{entity,auditEvents,-1,id}')::uuid from v2_state)),'three-way audit has base/current/result digests');
update v2_state set current_response=result;

-- 3 same-Expense conflicts, cover 2. DELETE is never reconstructed from an editable aggregate.
do $$begin perform pg_temp.call('valuation-conflict','{"type":"APPLY_VALUATION","valuation":{"policy":"REFERENCE_RATE"}}',1,3,null,'CONFLICT',(select current_response from v2_state)); end;$$;
do $$begin perform pg_temp.call('delete-conflict','{"type":"DELETE"}',1,3,null,'CONFLICT',(select current_response from v2_state)); end;$$;
select is((select response_body #>> '{error,submittedIntent,type}' from public.ledger_idempotency_keys where idempotency_key='delete-conflict'),'DELETE','DELETE conflict persists true intent');
update v2_state set resolution=jsonb_build_object('contractVersion',2,'commandId','delete-conflict','intentType','DELETE','submittedIntent',jsonb_build_object('type','DELETE'),'observedBaseRevision',1,'currentServerRevision',3,
'coveredConflictIds',(select jsonb_agg(id) from public.ledger_idempotency_keys where idempotency_key in ('valuation-conflict','delete-conflict')),
'expectedChainDigest',public.ledger_expense_chain_v2('10000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001') ->> 'chainDigest','choice','CONFIRM_DELETE','reason','Isolated Phase 3 gate');
select throws_ok($$select pg_temp.call('drift','{"type":"DELETE"}',1,3,null,'DIRECT',pg_temp.next_response('{"type":"DELETE"}'),jsonb_set((select resolution from v2_state),'{expectedChainDigest}',to_jsonb(repeat('a',64))))$$,'P0001','CONFLICT_CHAIN_DRIFT','chain drift rejects without effects');
select throws_ok($$select pg_temp.call('revision-drift','{"type":"DELETE"}',1,2,null,'DIRECT',pg_temp.next_response('{"type":"DELETE"}'),(select resolution from v2_state))$$,'P0001','REVISION_CONFLICT','prepared revision drift rejects');
select throws_ok($$select pg_temp.call('scope','{"type":"DELETE"}',1,3,null,'DIRECT',pg_temp.next_response('{"type":"DELETE"}'),jsonb_set((select resolution from v2_state),'{coveredConflictIds}','["89000000-0000-4000-8000-000000000099"]'))$$,'P0001','INVALID_COVERED_CONFLICTS','out-of-scope covered ID rejects');
select throws_ok($$select pg_temp.call('fake-lifecycle','{"type":"RESTORE","businessStatus":"ACCEPTED"}',1,3,null,'DIRECT',pg_temp.next_response('{"type":"RESTORE","businessStatus":"ACCEPTED"}'),jsonb_set(jsonb_set(jsonb_set((select resolution from v2_state),'{submittedIntent}','{"type":"RESTORE","businessStatus":"ACCEPTED"}'),'{intentType}','"RESTORE"'),'{choice}','"CONFIRM_RESTORE"'))$$,'P0001','INVALID_RESOLUTION_INTENT','resolution cannot turn original DELETE into RESTORE');

-- Force failure after mutation/compatibility closure to prove all effects roll back.
create function pg_temp.fail_closure() returns trigger language plpgsql as $$begin raise exception 'GATE_FAILURE'; end;$$;
create trigger v2_gate_failure before insert on public.expense_conflict_resolutions for each row execute function pg_temp.fail_closure();
select throws_ok($$select pg_temp.call('rollback','{"type":"DELETE"}',1,3,null,'DIRECT',pg_temp.next_response('{"type":"DELETE"}'),(select resolution from v2_state))$$,'P0001','GATE_FAILURE','post-mutation closure failure aborts whole transaction');
select is((select revision from public.expenses where id='89000000-0000-4000-8000-000000000001'),3::bigint,'failed resolution did not mutate revision');
select is((select count(*) from public.expense_conflict_outcomes_v2),0::bigint,'failed resolution did not close any conflict');
select is((select count(*) from public.ledger_idempotency_keys where idempotency_key='rollback'),0::bigint,'failed resolution has no partial receipt');
reset role;
drop trigger v2_gate_failure on public.expense_conflict_resolutions;
set local role service_role;
update v2_state set result=pg_temp.call('resolve-delete','{"type":"DELETE"}',1,3,null,'DIRECT',pg_temp.next_response('{"type":"DELETE"}'),resolution);
select is((select result #>> '{resolutionReceipt,commandType}' from v2_state),'DELETE','DELETE resolution receipt stays DELETE');
select is((select result #>> '{canonical,businessStatus}' from v2_state),'DELETED','canonical round trip is tombstone');
select is((select business_status from public.expenses where id='89000000-0000-4000-8000-000000000001'),'DELETED','DB mutation is true DELETE');
select is((select count(*) from public.expense_conflict_outcomes_v2 where lifecycle='RESOLVED'),1::bigint,'primary covered conflict resolved');
select is((select count(*) from public.expense_conflict_outcomes_v2 where lifecycle='SUPERSEDED'),1::bigint,'earlier covered valuation superseded');
select is((select jsonb_array_length(result -> 'openConflictIds') from v2_state),1,'uncovered no-history conflict stays OPEN');
select is((select count(*) from public.expense_conflict_resolutions),2::bigint,'existing reporting/Settlement guard compatibility projection matches covered closure');
select is((select operation_receipt ->> 'idempotencyKey' from public.expense_conflict_outcomes_v2 o join public.ledger_idempotency_keys k on k.id=o.conflict_id where k.idempotency_key='delete-conflict'),'delete-conflict','covered DELETE receipt correlates to its original immutable request key');
select is((select public.ledger_expense_causal_base_v2('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001',
 pg_temp.envelope('next-restore','{"type":"RESTORE","businessStatus":"ACCEPTED"}',1)||jsonb_build_object('intentSequence',2,'predecessorOperationId','delete-conflict','boundExecutionRevision',4,'causalBaseReceipt',o.operation_receipt)) ->> 'revision'
 from public.expense_conflict_outcomes_v2 o join public.ledger_idempotency_keys k on k.id=o.conflict_id where k.idempotency_key='delete-conflict'),'4','resolution-backed original DELETE receipt is valid causal proof for RESTORE');
select throws_ok($$select public.ledger_expense_causal_base_v2('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001',
 pg_temp.envelope('blocked-child','{"type":"DELETE"}',1)||jsonb_build_object('intentSequence',2,'predecessorOperationId','valuation-conflict','boundExecutionRevision',4,'causalBaseReceipt',o.operation_receipt))
 from public.expense_conflict_outcomes_v2 o join public.ledger_idempotency_keys k on k.id=o.conflict_id where k.idempotency_key='valuation-conflict'$$,'P0001','INVALID_CAUSAL_RECEIPT','superseded valuation receipt cannot become APPLIED causal proof');
select is((select public.ledger_replay_expense_v2('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001',pg_temp.envelope('delete-conflict','{"type":"DELETE"}',1)||'{"idempotencyKey":"resolve-delete"}', 'Isolated Phase 3 gate',resolution)=result from v2_state),true,'lost resolution response replays byte-equivalent original receipt');
select is((select pg_temp.call('resolve-delete','{"type":"DELETE"}',1,3,null,'DIRECT',pg_temp.next_response('{"type":"DELETE"}'),resolution)=result from v2_state),true,'transaction replay bypasses changed revision/chain');
select is((select revision from public.expenses where id='89000000-0000-4000-8000-000000000001'),4::bigint,'replay does not repeat mutation');
select is((select count(*) from public.expense_audit_events where expense_id='89000000-0000-4000-8000-000000000001' and event_type='CONFLICT_RESOLVED'),1::bigint,'replay does not repeat closure audit');
select throws_ok($$select pg_temp.call('resolve-delete','{"type":"DELETE"}',1,3,null,'DIRECT',pg_temp.next_response('{"type":"DELETE"}'),jsonb_set((select resolution from v2_state),'{reason}','"Different reason"'))$$,'P0001','IDEMPOTENCY_CONFLICT','same resolution key different payload rejects');
select throws_ok($$select public.ledger_resolve_expense_conflict_4c('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001',(select id from public.ledger_idempotency_keys where idempotency_key='delete-conflict'),4,'KEEP_MINE','{}','Reason','legacy-delete','hash','{}')$$,'P0001','TYPED_RESOLUTION_REQUIRED','legacy resolver cannot reinterpret typed DELETE');
update v2_state set current_response=jsonb_build_object('entity',result -> 'canonical','serverId',result #>> '{canonical,id}','revision',4,'updatedAt',result #>> '{canonical,updatedAt}','idempotentReplay',false);
select throws_ok($$select pg_temp.call('update-tombstone','{"type":"UPDATE","patch":{"descriptive":{"title":"Revive"}}}',4,4,null,'DIRECT',pg_temp.next_response('{"type":"UPDATE","patch":{"descriptive":{"title":"Revive"}}}'))$$,'P0001','EXPENSE_DELETED','UPDATE cannot revive tombstone');
select throws_ok($$select public.ledger_mutate_expense_4b('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001','UPDATE_EXPENSE',4,'Reason','hash','legacy-revive',pg_temp.next_response('{"type":"UPDATE","patch":{"descriptive":{"title":"Revive"}}}'))$$,'P0001','EXPENSE_DELETED','legacy fresh-CAS UPDATE cannot revive a tombstone');
update v2_state set result=pg_temp.call('restore-v2','{"type":"RESTORE","businessStatus":"ACCEPTED"}',4,4,null,'DIRECT',pg_temp.next_response('{"type":"RESTORE","businessStatus":"ACCEPTED"}'));
select is((select result #>> '{receipt,commandType}' from v2_state),'RESTORE','RESTORE remains independent receipt');
select is((select business_status from public.expenses where id='89000000-0000-4000-8000-000000000001'),'ACCEPTED','RESTORE explicitly revives tombstone');
select throws_ok($$select public.ledger_expense_causal_base_v2('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001',pg_temp.envelope('forged-parent','{"type":"DELETE"}',1)||jsonb_build_object('intentSequence',2,'predecessorOperationId','restore-v2','boundExecutionRevision',5,'causalBaseReceipt',jsonb_set((select result -> 'receipt' from v2_state),'{disposition}','"KEPT_SERVER"')))$$,'P0001','INVALID_CAUSAL_RECEIPT','non-APPLIED causal proof cannot advance CAS');
select is((select public.ledger_expense_causal_base_v2('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001',pg_temp.envelope('child','{"type":"DELETE"}',1)||jsonb_build_object('intentSequence',2,'predecessorOperationId','restore-v2','boundExecutionRevision',5,'causalBaseReceipt',result -> 'receipt')) ->> 'revision' from v2_state),'5','verified APPLIED parent supplies execution base');
select throws_ok($$select public.ledger_mutate_expense_4b('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001','UPDATE_EXPENSE',1,'Reason','hash','legacy-stale',pg_temp.next_response('{"type":"UPDATE","patch":{"descriptive":{"title":"Guess"}}}'))$$,'P0001','REVISION_CONFLICT','legacy full aggregate remains strict CAS');
-- APPLY_VALUATION conflict resolves through the existing financial evidence RPC.
update v2_state set current_response=result;
do $$begin perform pg_temp.call('valuation-final','{"type":"APPLY_VALUATION","valuation":{"localValuationId":"local-val","localRateSnapshotId":"local-rate","policy":"REFERENCE_RATE","economicDate":"2026-07-12","settingsRevision":1,"rateQuoteId":"89000000-0000-4000-8000-000000000003","paymentRecordId":null,"manualRate":null,"reason":"Reference acceptance","previewSettlement":{"minor":19608,"currency":"NZD","scale":2}}}',1,5,null,'CONFLICT',(select current_response from v2_state));end;$$;
update v2_state set resolution=jsonb_build_object('contractVersion',2,'commandId','valuation-final','intentType','APPLY_VALUATION',
  'submittedIntent',(select response_body #> '{error,submittedIntent}' from public.ledger_idempotency_keys where idempotency_key='valuation-final'),
  'observedBaseRevision',1,'currentServerRevision',5,'coveredConflictIds',(select jsonb_agg(id) from public.ledger_idempotency_keys where idempotency_key='valuation-final'),
  'expectedChainDigest',public.ledger_expense_chain_v2('10000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001') ->> 'chainDigest',
  'choice','APPLY_VALUATION','reason','Isolated Phase 3 gate');
update v2_state set result=public.ledger_execute_expense_v2('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001',
  pg_temp.envelope('valuation-final',resolution -> 'submittedIntent',1) || '{"idempotencyKey":"resolve-valuation"}',
  'Isolated Phase 3 gate',5,null,'DIRECT',
  jsonb_set(jsonb_set(jsonb_set(pg_temp.next_response('{"type":"UPDATE","patch":{}}'),'{entity,valuation,id}','"89000000-0000-4000-8000-000000000011"'),'{entity,valuation,rateSnapshotId}','"89000000-0000-4000-8000-000000000012"'),'{entity,valuation,supersedesValuationId}','"89000000-0000-4000-8000-000000000005"'),
  '{"id":"89000000-0000-4000-8000-000000000012","decimalRate":"1.9608","effectiveDate":"2026-07-10","observedAt":"2026-09-29T00:00:00Z","provider":"ECB","providerReference":"https://api.frankfurter.dev/v2/providers/ecb/rate/EUR/NZD?date=2026-07-12","stalenessState":"FRESH"}',resolution);
select is((select result #>> '{resolutionReceipt,commandType}' from v2_state),'APPLY_VALUATION','valuation closure remains APPLY_VALUATION');
select is((select revision from public.expenses where id='89000000-0000-4000-8000-000000000001'),6::bigint,'valuation closure commits one revision');
select is((select count(*) from public.settlement_valuation_snapshots where expense_id='89000000-0000-4000-8000-000000000001' and is_active),1::bigint,'valuation closure keeps exactly one active snapshot');
update v2_state set current_response=jsonb_build_object('entity',result -> 'canonical','revision',6,'serverId',result #>> '{canonical,id}','updatedAt',result #>> '{canonical,updatedAt}','idempotentReplay',false);
-- Explicit KEEP_SERVER closes the remaining original UPDATE without mutation.
update v2_state set resolution=jsonb_build_object('contractVersion',2,'commandId','no-history','intentType','UPDATE',
  'submittedIntent',(select response_body #> '{error,submittedIntent}' from public.ledger_idempotency_keys where idempotency_key='no-history'),
  'observedBaseRevision',99,'currentServerRevision',6,'coveredConflictIds',(select jsonb_agg(id) from public.ledger_idempotency_keys where idempotency_key='no-history'),
  'expectedChainDigest',public.ledger_expense_chain_v2('10000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001') ->> 'chainDigest',
  'choice','KEEP_SERVER','reason','Isolated Phase 3 gate');
update v2_state set result=pg_temp.call('keep-server',resolution -> 'submittedIntent',99,6,null,'CONFLICT',current_response,resolution);
select is((select result #>> '{resolutionReceipt,disposition}' from v2_state),'KEPT_SERVER','explicit KEEP_SERVER returns its own disposition');
select is((select revision from public.expenses where id='89000000-0000-4000-8000-000000000001'),6::bigint,'KEEP_SERVER does not fabricate a revision');
select is((select jsonb_array_length(result -> 'openConflictIds') from v2_state),0,'only explicitly covered final conflict closes');
update v2_state set current_response=jsonb_build_object('entity',result -> 'canonical','revision',6,'serverId',result #>> '{canonical,id}','updatedAt',result #>> '{canonical,updatedAt}','idempotentReplay',false);
do $$begin perform pg_temp.call('equivalent-conflict','{"type":"UPDATE","patch":{}}',1,6,null,'CONFLICT',(select current_response from v2_state));end;$$;
update v2_state set resolution=jsonb_build_object('contractVersion',2,'commandId','equivalent-conflict','intentType','UPDATE','submittedIntent','{"type":"UPDATE","patch":{}}'::jsonb,
  'observedBaseRevision',1,'currentServerRevision',6,'coveredConflictIds',(select jsonb_agg(id) from public.ledger_idempotency_keys where idempotency_key='equivalent-conflict'),
  'expectedChainDigest',public.ledger_expense_chain_v2('10000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001') ->> 'chainDigest',
  'choice','ACCEPT_EQUIVALENT','reason','Isolated Phase 3 gate');
update v2_state set result=pg_temp.call('accept-equivalent',resolution -> 'submittedIntent',1,6,base,'EQUIVALENT',current_response,resolution);
select is((select result #>> '{resolutionReceipt,disposition}' from v2_state),'APPLIED','equivalent intent has an APPLIED receipt');
select is((select revision from public.expenses where id='89000000-0000-4000-8000-000000000001'),6::bigint,'equivalent closure keeps the same canonical revision');
select throws_ok($$update public.ledger_idempotency_keys set payload_hash='tamper' where idempotency_key='resolve-delete'$$,'23514','Completed Expense v2 receipt is append-only','successful v2 receipt cannot be rewritten');
select throws_ok($$update public.expense_conflict_outcomes_v2 set lifecycle='RESOLVED'$$,'42501',null,'service cannot rewrite immutable outcomes');
select is((select jsonb_array_length(public.ledger_list_expense_chain_metadata_v2('10000000-0000-4000-8000-000000000001') #> '{0,conflictIds}')),5,'bootstrap/pull metadata retains the complete five-conflict chain');
select is((select jsonb_array_length(public.ledger_list_expense_chain_metadata_v2('10000000-0000-4000-8000-000000000001') #> '{0,openConflictIds}')),0,'bootstrap/pull metadata reflects server closure');
select is(public.ledger_expense_causal_base_v2('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001',
 pg_temp.envelope('legacy-child','{"type":"DELETE"}',1)||jsonb_build_object('intentSequence',2,'predecessorOperationId','legacy-parent','boundExecutionRevision',2,
 'causalBaseReceipt',jsonb_build_object('operationId','legacy-parent','commandId','legacy-parent','idempotencyKey','auto-reference','expenseId','89000000-0000-4000-8000-000000000001',
 'commandType','APPLY_VALUATION','intentSequence',1,'disposition','APPLIED','canonicalRevision',2))) ->> 'revision','2','known successful legacy mutation proves causal base without guessing a patch');
-- Freeze canonical input, then all v2 choices including KEEP_SERVER must reject.
insert into public.settlements(id,journey_id,settlement_currency,settlement_scale,status,through_timestamp,input_digest,algorithm_version)
values('89000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001','NZD',2,'FINALIZED',now(),'v2-gate','stage4b-guard-fixture');
insert into public.settlement_inputs(settlement_id,journey_id,expense_id,expense_revision,valuation_snapshot_id)
values('89000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001',6,'89000000-0000-4000-8000-000000000011');
select throws_ok($$select pg_temp.call('frozen-delete','{"type":"DELETE"}',6,6,null,'DIRECT',pg_temp.next_response('{"type":"DELETE"}'))$$,'P0001','FINALIZED_SETTLEMENT_PROTECTED','frozen input rejects typed DELETE');
select throws_ok($$select pg_temp.call('frozen-keep','{"type":"DELETE"}',1,6,null,'DIRECT',pg_temp.next_response('{"type":"DELETE"}'),jsonb_set(jsonb_set((select resolution from v2_state),'{choice}','"KEEP_SERVER"'),'{currentServerRevision}','6'))$$,'P0001','FINALIZED_SETTLEMENT_PROTECTED','frozen input rejects KEEP_SERVER closure too');
select throws_ok($$select public.ledger_execute_expense_v2('00000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001',pg_temp.envelope('no-permission','{"type":"DELETE"}',6),null,6,null,'DIRECT',pg_temp.next_response('{"type":"DELETE"}'))$$,'P0001','TRIP_WRITE_FORBIDDEN','membership/creator guard rejects unauthorized actor');
select ok(not has_function_privilege('authenticated','public.ledger_execute_expense_v2(uuid,uuid,uuid,jsonb,text,bigint,jsonb,text,jsonb,jsonb,jsonb)','execute'),'client cannot call service-only RPC directly');
select * from finish();
rollback;
