-- READ ONLY, after independently authorized external LOGIN provisioning.
-- Run by approved DBA on the explicitly selected database, never by Mobile.
-- No ALTER ROLE, password, grant, gate transition or provisioning fallback here.
begin read only;
set local search_path=pg_catalog;
-- Independent reviewed root/code pin before invoking the checker itself.
do $audit$ declare inventory_root text:='1f6bd2cb0fe9b6a9ddbd611d78e3c8fe33de63a6676032f6d412e228b936199a'; checker_pin text:='c5079be7b4bc04db361519c173f581e3161f8d6dccb534fbf0c982454459ca5d'; anchor_pin text:='f8fdf9394720027db4885f0127277de2a49ba046f00025e0765326746e7d25ad'; begin

  -- Full anchor definition: no payload/root/hash exclusion in the anchor itself.
  if not exists(select 1 from pg_proc pin join pg_namespace ns on ns.oid=pin.pronamespace join pg_language lang on lang.oid=pin.prolang
   where pin.oid=to_regprocedure('public.trip_person_activation_reviewed_root()')
    and ns.nspname='public' and pin.proname='trip_person_activation_reviewed_root'
    and pin.proowner='postgres'::regrole and not pin.prosecdef and pin.provolatile='i'
    and not pin.proisstrict and not pin.proleakproof and pin.prokind='f' and lang.lanname='sql'
    and pin.proconfig=array['search_path=pg_catalog']::text[]
    and encode(extensions.digest(pg_get_functiondef(pin.oid),'sha256'),'hex')=anchor_pin
    and (select count(*) from aclexplode(pin.proacl))=2
    and not exists(select 1 from aclexplode(pin.proacl) permission where permission.grantee not in ('postgres'::regrole,'otr_trip_person_receipt_reader'::regrole)
      or permission.grantor<>'postgres'::regrole or permission.privilege_type<>'EXECUTE' or permission.is_grantable)
    and not exists(select 1 from pg_roles principal where not principal.rolsuper and principal.rolname not in ('postgres','otr_trip_person_receipt_reader')
      and (has_function_privilege(principal.oid,pin.oid,'EXECUTE') or pg_has_role(principal.oid,'postgres'::regrole,'MEMBER') or pg_has_role(principal.oid,'otr_trip_person_receipt_reader'::regrole,'MEMBER')))
    and not exists(select 1 from pg_proc alias where alias.proname='trip_person_activation_reviewed_root' and alias.oid<>pin.oid)) then
   raise exception 'UNSAFE_PARTICIPATION_ACTIVATION_ANCHOR';
  end if;
  if public.trip_person_activation_reviewed_root() is distinct from inventory_root then
   raise exception 'UNSAFE_PARTICIPATION_ACTIVATION_ANCHOR_ROOT';
  end if;

  if not exists(select 1 from pg_proc p join pg_language l on l.oid=p.prolang
   where p.oid=to_regprocedure('public.trip_person_activation_security_check(boolean,boolean)')
    and p.proowner='postgres'::regrole and p.prosecdef and p.provolatile='s' and not p.proisstrict and not p.proleakproof
    and p.proconfig=array['search_path=pg_catalog']::text[] and l.lanname='plpgsql'
    and encode(extensions.digest(regexp_replace(regexp_replace(pg_get_functiondef(p.oid), E'\\$inventory\\$.*?\\$inventory\\$', '$inventory$PINNED$inventory$', 's'), E'(/\\*activation-(root|checker|anchor)\\*/)''[0-9a-f]{64}''', E'\\1''PINNED''', 'g'),'sha256'),'hex')=checker_pin
    and encode(extensions.digest(substring(p.prosrc from E'\\$inventory\\$(.*?)\\$inventory\\$')::jsonb::text,'sha256'),'hex')=inventory_root) then
   raise exception 'UNSAFE_PARTICIPATION_ACTIVATION_CHECKER';
  end if;
end $audit$;
select public.trip_person_activation_security_check(true,true) as role_profile_verified;
do $$ begin
 if has_database_privilege('otr_trip_person_command_gateway',current_database(),'CREATE')
  or has_database_privilege('otr_trip_person_command_gateway',current_database(),'TEMP')
  or not has_database_privilege('otr_trip_person_command_gateway',current_database(),'CONNECT') then
  raise exception 'PARTICIPATION_GATEWAY_DATABASE_PRIVILEGE_BLOCKED';
 end if;
end $$;
-- A false database boundary is BLOCKED, not permission to revoke PUBLIC ambient
-- rights on a shared DB opportunistically. Resolve through separate DBA review.
select rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolbypassrls,rolreplication,rolconfig
 from pg_roles where rolname='otr_trip_person_command_gateway';
commit;
