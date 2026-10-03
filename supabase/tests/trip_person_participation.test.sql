begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

select ok((select bool_and(participation_active and participation_revision=0) from public.journey_members), 'seed and existing ordinary Persons baseline ACTIVE/0');
select is((select data_type from information_schema.columns where table_schema='public' and table_name='journey_members' and column_name='participation_active'), 'boolean', 'server state Boolean');
select is((select is_nullable from information_schema.columns where table_schema='public' and table_name='journey_members' and column_name='participation_active'), 'NO', 'server state non-null');
select is((select data_type from information_schema.columns where table_schema='public' and table_name='journey_members' and column_name='participation_revision'), 'bigint', 'revision bigint');
select is((select is_nullable from information_schema.columns where table_schema='public' and table_name='journey_members' and column_name='participation_revision'), 'NO', 'revision non-null');
select ok((select not rolcanlogin and not rolsuper and not rolcreatedb and not rolcreaterole and not rolinherit and not rolbypassrls from pg_roles where rolname='otr_trip_person_lifecycle_writer'), 'private role has no login or broad privilege');
select ok(not pg_has_role('anon','otr_trip_person_lifecycle_writer','MEMBER') and not pg_has_role('authenticated','otr_trip_person_lifecycle_writer','MEMBER') and not pg_has_role('service_role','otr_trip_person_lifecycle_writer','MEMBER') and not pg_has_role('authenticator','otr_trip_person_lifecycle_writer','MEMBER'), 'API roles cannot assume private writer');
select ok(not has_table_privilege('otr_trip_person_lifecycle_writer','public.journey_members','UPDATE') and not has_column_privilege('otr_trip_person_lifecycle_writer','public.journey_members','participation_active','UPDATE'), 'private role has no executable Member write grant');
select ok((select not prosecdef and proconfig = array['search_path=pg_catalog'] from pg_proc where oid='public.guard_trip_person_participation()'::regprocedure), 'guard is invoker with trusted search_path');
select ok(not has_function_privilege('authenticated','public.guard_trip_person_participation()','EXECUTE') and not has_function_privilege('service_role','public.guard_trip_person_participation()','EXECUTE'), 'no public/service callable guard entry');
select is((select count(*)::integer from pg_proc where proowner=(select oid from pg_roles where rolname='otr_trip_person_lifecycle_writer')), 0, 'no function owned by private writer');
select is((select count(*)::integer from pg_proc where pronamespace='public'::regnamespace and (proname ilike '%deactivate%person%' or proname ilike '%reactivate%person%')), 0, 'no lifecycle command RPC');
select ok(to_regclass('public.trip_person_participation_receipts') is null, 'no receipt or lifecycle audit table');
select ok(exists(select 1 from pg_trigger where tgrelid='public.journey_members'::regclass and tgname='journey_members_touch_updated_at') and exists(select 1 from pg_trigger where tgrelid='public.journey_members'::regclass and tgname='journey_members_personal_payment_history_grant'), 'existing timestamp/private history triggers retained');

insert into public.ledger_settings(journey_id,settlement_currency,settlement_scale,valuation_policy)
values ('10000000-0000-4000-8000-000000000001','NZD',2,'REFERENCE_RATE') on conflict do nothing;
create temporary table lifecycle_financial_before as select
 public.ledger_settlement_source_7_1('10000000-0000-4000-8000-000000000001','2026-02-01') as settlement,
 public.ledger_personal_financial_source_3b('10000000-0000-4000-8000-000000000001','2026-02-01') as review,
 (select jsonb_agg(to_jsonb(e) order by id) from public.expenses e) as expenses,
 (select jsonb_agg(to_jsonb(p) order by id) from public.personal_settlement_payment_records p) as payments,
 (select jsonb_agg(to_jsonb(g) order by record_id,user_id,relationship) from public.personal_settlement_payment_read_grants g) as grants,
 (select revision from public.ledger_settings where journey_id='10000000-0000-4000-8000-000000000001') as currency_revision;

-- Trusted fixture setup only: no callable bypass is installed. Rollback restores everything.
alter table public.journey_members disable trigger journey_members_participation_guard;
select throws_ok($$update public.journey_members set participation_revision=-1 where id='12000000-0000-4000-8000-000000000002'$$, '23514', null, 'lower revision bound enforced independently of normalization');
select throws_ok($$update public.journey_members set participation_revision=9007199254740992 where id='12000000-0000-4000-8000-000000000002'$$, '23514', null, 'upper revision bound enforced');
update public.journey_members set participation_active=false,participation_revision=7 where id='12000000-0000-4000-8000-000000000002';
alter table public.journey_members enable trigger journey_members_participation_guard;

set local role service_role;
insert into public.journey_members(id,trip_id,display_name)
values('89000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','New legacy Person');
select ok((select participation_active and participation_revision=0 from public.journey_members where id='89000000-0000-4000-8000-000000000001'), 'ordinary insert defaults true/0');
insert into public.journey_members(id,trip_id,display_name,participation_active,participation_revision)
values('89000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Spoofed new Person',false,999);
select ok((select participation_active and participation_revision=0 from public.journey_members where id='89000000-0000-4000-8000-000000000002'), 'explicit inserted lifecycle payload normalized true/0');
update public.journey_members set participation_active=true where id='12000000-0000-4000-8000-000000000002';
select ok((select not participation_active and participation_revision=7 from public.journey_members where id='12000000-0000-4000-8000-000000000002'), 'service direct state update cannot reactivate');
update public.journey_members set participation_revision=999 where id='12000000-0000-4000-8000-000000000002';
select is((select participation_revision from public.journey_members where id='12000000-0000-4000-8000-000000000002'), 7::bigint, 'service cannot increase revision');
update public.journey_members set participation_revision=0,participation_active=true where id='12000000-0000-4000-8000-000000000002';
select ok((select not participation_active and participation_revision=7 from public.journey_members where id='12000000-0000-4000-8000-000000000002'), 'service cannot decrease revision or overwrite both');
select set_config('otr.trip_person_lifecycle_writer','true',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"otr_trip_person_lifecycle_writer"}',true);
update public.journey_members set participation_active=true,participation_revision=8 where id='12000000-0000-4000-8000-000000000002';
select ok((select not participation_active and participation_revision=7 from public.journey_members where id='12000000-0000-4000-8000-000000000002'), 'spoofed GUC/JWT role cannot bypass execution identity');
insert into public.journey_members(id,trip_id,display_name,role,status)
values('12000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Synthetic Member','group_member','linked')
on conflict(id) do update set participation_active=excluded.participation_active,participation_revision=excluded.participation_revision;
select ok((select not participation_active and participation_revision=7 from public.journey_members where id='12000000-0000-4000-8000-000000000002'), 'old full-row conflict defaults preserve false/7');
insert into public.journey_members(id,trip_id,display_name,participation_active,participation_revision)
values('12000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Synthetic Member',true,0)
on conflict(id) do update set participation_active=excluded.participation_active,participation_revision=excluded.participation_revision;
select ok((select not participation_active and participation_revision=7 from public.journey_members where id='12000000-0000-4000-8000-000000000002'), 'explicit stale conflict pair also preserved');
delete from public.journey_members where id in ('89000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000002');
reset role;
select is(public.ledger_settlement_source_7_1('10000000-0000-4000-8000-000000000001','2026-02-01'), (select settlement from lifecycle_financial_before), 'lifecycle write attempts leave Settlement source/digest unchanged');
select is(public.ledger_personal_financial_source_3b('10000000-0000-4000-8000-000000000001','2026-02-01'), (select review from lifecycle_financial_before), 'Review financial fingerprint unchanged');
select is((select jsonb_agg(to_jsonb(e) order by id) from public.expenses e), (select expenses from lifecycle_financial_before), 'Expense revisions/values unchanged');
select is((select jsonb_agg(to_jsonb(p) order by id) from public.personal_settlement_payment_records p), (select payments from lifecycle_financial_before), 'Personal Payment identity unchanged');
select is((select jsonb_agg(to_jsonb(g) order by record_id,user_id,relationship) from public.personal_settlement_payment_read_grants g), (select grants from lifecycle_financial_before), 'no private link-history grants from lifecycle writes');
select is((select revision from public.ledger_settings where journey_id='10000000-0000-4000-8000-000000000001'), (select currency_revision from lifecycle_financial_before), 'currency revision unchanged');

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$set local role otr_trip_person_lifecycle_writer$$,'42501',null,'authenticated cannot assume writer');
update public.journey_members set notes='Changed note',status='unlinked',role='guest',participation_active=true,participation_revision=8 where id='12000000-0000-4000-8000-000000000002';
select ok((select notes='Changed note' and status='unlinked' and role='guest' and not participation_active and participation_revision=7 from public.journey_members where id='12000000-0000-4000-8000-000000000002'), 'authenticated old notes/status/role update works while lifecycle preserved');
update public.journey_members set status='linked',role='group_member' where id='12000000-0000-4000-8000-000000000002';
select ok((select not participation_active and participation_revision=7 from public.journey_members where id='12000000-0000-4000-8000-000000000002'), 'ordinary link update preserves pair');
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated","email":"member@otr.invalid"}',true);
set local role authenticated;
select lives_ok($$select public.update_own_journey_member_notes('12000000-0000-4000-8000-000000000002','Own note')$$,'existing SECURITY DEFINER notes RPC succeeds');
select lives_ok($$select public.claim_journey_member('12000000-0000-4000-8000-000000000002')$$,'explicit claim preserves existing linked identity');
select ok((select notes='Own note' and not participation_active and participation_revision=7 from public.journey_members where id='12000000-0000-4000-8000-000000000002'), 'notes RPC and explicit claim preserve false/7');
reset role;

-- New Trip permits real invite/auto-claim paths without an existing legacy membership.
insert into public.trips(id,name,created_by) values('89000000-0000-4000-8000-000000000010','Lifecycle invite test','00000000-0000-4000-8000-000000000001');
insert into public.journey_members(id,trip_id,display_name,status,invite_email)
values('89000000-0000-4000-8000-000000000011','89000000-0000-4000-8000-000000000010','Invited Member','invite_pending','member@otr.invalid'),
('89000000-0000-4000-8000-000000000012','89000000-0000-4000-8000-000000000010','Email Claim','invite_pending','guest@otr.invalid');
alter table public.journey_members disable trigger journey_members_participation_guard;
update public.journey_members set participation_active=false,participation_revision=7 where id in('89000000-0000-4000-8000-000000000011','89000000-0000-4000-8000-000000000012');
alter table public.journey_members enable trigger journey_members_participation_guard;
insert into public.journey_invites(trip_id,token,role,invited_email,created_by)
values('89000000-0000-4000-8000-000000000010','i2a-invite','member','member@otr.invalid','00000000-0000-4000-8000-000000000001');
set local role authenticated;
select is((select invite_status from public.accept_journey_invite('i2a-invite')),'joined','invite acceptance reaches placeholder update');
select ok((select user_id='00000000-0000-4000-8000-000000000002'::uuid and status='linked' and not participation_active and participation_revision=7 from public.journey_members where id='89000000-0000-4000-8000-000000000011'), 'real invite links same ID without reactivation');
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated","email":"guest@otr.invalid"}',true);
set local role authenticated;
select lives_ok($$select public.claim_email_invited_journeys()$$,'email claim succeeds');
select ok((select user_id='00000000-0000-4000-8000-000000000003'::uuid and status='linked' and not participation_active and participation_revision=7 from public.journey_members where id='89000000-0000-4000-8000-000000000012'), 'email claim preserves false/7');
reset role;
insert into public.trips(id,name,created_by) values('89000000-0000-4000-8000-000000000020','Explicit claim test','00000000-0000-4000-8000-000000000001');
insert into public.trip_members(trip_id,user_id,role) values('89000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000002','member');
insert into public.journey_members(id,trip_id,display_name) values('89000000-0000-4000-8000-000000000021','89000000-0000-4000-8000-000000000020','Unlinked explicit claim');
alter table public.journey_members disable trigger journey_members_participation_guard;
update public.journey_members set participation_active=false,participation_revision=7 where id='89000000-0000-4000-8000-000000000021';
alter table public.journey_members enable trigger journey_members_participation_guard;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated","email":"member@otr.invalid"}',true);
set local role authenticated;
select is((select claim_status from public.claim_journey_member('89000000-0000-4000-8000-000000000021')),'claimed','explicit claim reaches real unlinked placeholder');
select ok((select user_id='00000000-0000-4000-8000-000000000002'::uuid and status='linked' and not participation_active and participation_revision=7 from public.journey_members where id='89000000-0000-4000-8000-000000000021'), 'real explicit claim keeps ID and false/7');
reset role;
insert into public.journey_invites(trip_id,token,role,created_by) values('89000000-0000-4000-8000-000000000020','i2a-new-invite','member','00000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated","email":"guest@otr.invalid"}',true);
set local role authenticated;
select is((select invite_status from public.accept_journey_invite('i2a-new-invite')),'joined','invite acceptance inserts a genuinely new Person');
select ok((select participation_active and participation_revision=0 and status='linked' from public.journey_members where trip_id='89000000-0000-4000-8000-000000000020' and user_id='00000000-0000-4000-8000-000000000003'), 'invite new Person defaults true/0');
reset role;
set local role service_role;
select throws_ok($$set local role otr_trip_person_lifecycle_writer$$,'42501',null,'service cannot assume writer');
select throws_ok($$update public.journey_members set status='inactive' where id='12000000-0000-4000-8000-000000000002'$$,'23514',null,'status enum not widened');
select throws_ok($$update public.journey_members set role='inactive' where id='12000000-0000-4000-8000-000000000002'$$,'23514',null,'role enum not widened');
reset role;
select * from finish();
rollback;
