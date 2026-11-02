-- Root unique SQL Writer: exact DEV target selection must be verified outside SQL.
BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SELECT current_database() AS database,current_user AS role;
SELECT n.nspname,c.relname,c.relkind,c.relrowsecurity,pg_get_userbyid(c.relowner) AS owner,c.relacl
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('trip_directed_invite_targets','trip_member_claim_receipts','journey_invites','journey_members','trip_core_read_state');
SELECT p.oid::regprocedure::text AS function,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) AS owner,p.proacl,
 md5(pg_get_functiondef(p.oid)) AS definition_fingerprint
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
 AND p.proname IN ('trip_member_claim_transaction','trip_member_claim_receipt_immutable','trip_directed_invite_legacy_guard','accept_journey_invite','trip_core_lock_actor_scope','trip_core_invalidate_actor_read');
SELECT t.tgname,t.tgrelid::regclass::text AS relation,pg_get_triggerdef(t.oid) AS definition
 FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN ('public.journey_invites'::regclass,'public.journey_members'::regclass);
SELECT rolname,rolcanlogin,rolsuper,rolbypassrls,rolinherit FROM pg_roles
 WHERE rolname IN ('postgres','anon','authenticated','service_role','otr_trip_core_v2_gateway');
SELECT pg_get_userbyid(defaclrole) AS role,defaclnamespace::regnamespace::text AS namespace,defaclobjtype,defaclacl FROM pg_default_acl
 WHERE defaclrole='postgres'::regrole AND defaclnamespace IN (0,'public'::regnamespace) AND defaclobjtype IN ('r','f');
-- Exact previously accepted Synthetic QA cases only; no session/password/token fields.
SELECT id,email,created_at,email_confirmed_at,is_anonymous,deleted_at,banned_until FROM auth.users
 WHERE id IN ('26876e6e-a919-457d-bc00-78d76ba08043'::uuid,'1f3d7935-1bdc-4952-8d7f-0f72077368c1'::uuid);
SELECT id,created_by FROM public.trips WHERE id='fb2f0820-e429-404a-b4dd-7adcad814e45'::uuid;
SELECT id,trip_id,user_id,role,status,linked_at FROM public.journey_members
 WHERE trip_id='fb2f0820-e429-404a-b4dd-7adcad814e45'::uuid
 AND (id='bcd1d48e-a9f7-445a-911b-0452ff8dc55a'::uuid OR user_id IN ('26876e6e-a919-457d-bc00-78d76ba08043'::uuid,'1f3d7935-1bdc-4952-8d7f-0f72077368c1'::uuid));
ROLLBACK;
