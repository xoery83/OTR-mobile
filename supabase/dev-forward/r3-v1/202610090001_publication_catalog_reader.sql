-- otr-r3-dev-v1-catalog-reader-1: dormant only; separate Hosted approval required.
-- PASSWORD NULL/NOLOGIN. No credential or runtime provisioning belongs here.
begin;
set local search_path=pg_catalog;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $precondition$ begin
 if session_user <> 'postgres' or current_user <> 'postgres' then
  raise exception 'R3_CATALOG_READER_ADMIN_REQUIRED'; end if;
 if not exists(select 1 from otr_dev_migrations.lineage where version='otr-r3-dev-v1'
  and source_commit='a817e8e881e2fa2e094696b13bc4df2eca7e2db2'
  and baseline_sha256='f065259a9cda07cc3c43008be06a975b42ce8534be16d35b7d83987852e01f52'
  and scope='CLOSED_ONLY_BETA; SERVER73_OPEN_DEFERRED') then
  raise exception 'R3_CATALOG_READER_LINEAGE_MISMATCH'; end if;
 if exists(select 1 from pg_roles where rolname='otr_trip_publication_catalog_reader') then raise exception 'R3_CATALOG_READER_ROLE_EXISTS'; end if;
 -- F1: schema defaults add to global defaults; no schema REVOKE can mask a grant.
 if exists(select 1 from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
  cross join lateral aclexplode(d.defaclacl) a
  where d.defaclobjtype in ('r','S')
   and (d.defaclnamespace=0 or n.nspname !~ '^pg_' and n.nspname<>'information_schema')
   and (a.grantee=0 or a.grantee=(select oid from pg_roles where rolname='otr_trip_publication_catalog_reader'))) then
  raise exception 'R3_CATALOG_READER_UNSAFE_DEFAULT_ACL';end if;
 if encode(extensions.digest((jsonb_build_object(
 'relations',(select jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',(select jsonb_agg(jsonb_build_array(case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable) order by x.grantee::regrole::text,x.privilege_type,x.grantor::regrole::text) from aclexplode(coalesce(c.relacl,acldefault((case when c.relkind='S' then 'S' else 'r' end)::"char",c.relowner))) x),'rls',c.relrowsecurity,'force',c.relforcerowsecurity,
   'columns',(select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,(select jsonb_agg(jsonb_build_array(case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable) order by x.grantee::regrole::text,x.privilege_type) from aclexplode(a.attacl) x),pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
   'constraints',(select jsonb_agg(jsonb_build_array(k.conname,pg_get_constraintdef(k.oid,true),k.convalidated) order by k.conname) from pg_constraint k where k.conrelid=c.oid),
   'indexes',(select jsonb_agg(jsonb_build_array(ic.relname,pg_get_indexdef(ix.indexrelid),ix.indisvalid,ix.indisready) order by ic.relname) from pg_index ix join pg_class ic on ic.oid=ix.indexrelid where ix.indrelid=c.oid),
   'sequence',(select jsonb_build_array(format_type(s.seqtypid,null),s.seqstart::text,s.seqincrement::text,s.seqmax::text,s.seqmin::text,s.seqcache::text,s.seqcycle) from pg_sequence s where s.seqrelid=c.oid),
   'triggers',(select jsonb_agg(jsonb_build_array(t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true)) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal)) order by c.relname)
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S') and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')),
 'functions',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),'acl',(select jsonb_agg(jsonb_build_array(case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable) order by x.grantee::regrole::text,x.privilege_type,x.grantor::regrole::text) from aclexplode(coalesce(p.proacl,acldefault(('f')::"char",p.proowner))) x),'body_sha256',encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex')) order by p.oid::regprocedure::text)
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind in ('f','p') and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')),
 'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p where schemaname='public' or schemaname='storage' and policyname in ('Journey members can read memory shot previews','Journey members can update memory shot previews','Journey members can upload memory shot previews','Trip members can read trip media','Trip members can upload trip media','trip_source_material_client_deny','trip_source_bucket_client_deny')),
 'types',(select jsonb_agg(jsonb_build_array(t.typname,t.typtype,(select jsonb_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid=t.oid)) order by t.typname) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and (t.typtype in ('e','d') or t.typtype='c' and exists(select 1 from pg_class tc where tc.oid=t.typrelid and tc.relkind='c'))),
 'roles',(select jsonb_agg(jsonb_build_object('name',r.rolname,'login',r.rolcanlogin,'super',r.rolsuper,'createdb',r.rolcreatedb,'createrole',r.rolcreaterole,'inherit',r.rolinherit,'bypass',r.rolbypassrls,'replication',r.rolreplication,
   'memberships',(select jsonb_agg(jsonb_build_array(pg_get_userbyid(m.roleid),pg_get_userbyid(m.member),m.admin_option,m.inherit_option,m.set_option) order by m.roleid::regrole::text,m.member::regrole::text) from (select roleid,member,bool_or(admin_option) as admin_option,bool_or(inherit_option) as inherit_option,bool_or(set_option) as set_option from pg_auth_members group by roleid,member) m where m.member=r.oid or m.roleid=r.oid),
   'settings',(select jsonb_agg(s.setconfig order by s.setdatabase) from pg_db_role_setting s where s.setrole=r.oid),
   'schemas',(select jsonb_agg(jsonb_build_array(n.nspname,has_schema_privilege(r.oid,n.oid,'USAGE'),has_schema_privilege(r.oid,n.oid,'CREATE')) order by n.nspname) from pg_namespace n where n.nspname !~ '^pg_(toast|temp)' and n.nspname not in ('pg_catalog','information_schema') and (has_schema_privilege(r.oid,n.oid,'USAGE') or has_schema_privilege(r.oid,n.oid,'CREATE')))) order by r.rolname) from pg_roles r where r.rolname like 'otr_%')
))::text,'sha256'),'hex') <> 'c9adf99f4818b32d6aca81d22d3a17bc7ccd935652b59f95016fa19cb9982906' then
  raise exception 'R3_CATALOG_READER_CATALOG_DRIFT'; end if;
end $precondition$;

create role otr_trip_publication_catalog_reader nologin password null nosuperuser
 nocreatedb nocreaterole noinherit noreplication nobypassrls connection limit 1;
-- CREATE ROLE supplies the administrator-only membership; no runtime memberships.
alter role otr_trip_publication_catalog_reader set search_path=pg_catalog;
alter role otr_trip_publication_catalog_reader set default_transaction_read_only=on;
alter role otr_trip_publication_catalog_reader set statement_timeout='5000ms';
alter role otr_trip_publication_catalog_reader set lock_timeout='1000ms';
alter role otr_trip_publication_catalog_reader set idle_in_transaction_session_timeout='5000ms';
grant connect on database postgres to otr_trip_publication_catalog_reader;
grant usage on schema public to otr_trip_publication_catalog_reader;
-- Preserve the exact administrator edge as well as effective memberships.
do $replace_root$ declare had_self_edge boolean;begin
 select exists(select 1 from pg_auth_members where roleid='otr_trip_source_writer'::regrole
  and member='postgres'::regrole and grantor='postgres'::regrole) into had_self_edge;
 execute 'grant otr_trip_source_writer to postgres with inherit true, set false';
 execute $ddl$CREATE OR REPLACE FUNCTION public.trip_source_read_import_catalogs(actor uuid, trip uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$declare result jsonb; name text; rows jsonb;
begin
 if current_user<>'otr_trip_source_writer' or session_user not in ('otr_trip_source_command_gateway','otr_trip_publication_catalog_reader') or not public.trip_source_admission(actor,trip,false) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 result:=jsonb_build_object('version',1,'trip_id',trip,'actor_account_id',actor);
 select coalesce(jsonb_agg(public.trip_import_observation(to_jsonb(s)) order by id),'[]') into rows from (select s.* from public.trip_sources s where trip_id=trip and acquired_by=actor limit 65) s;
 result:=result||jsonb_build_object('trip_sources',rows);
 select coalesce(jsonb_agg(public.trip_import_observation(to_jsonb(r)) order by source_id,material_revision),'[]') into rows from (select r.* from public.trip_source_revisions r where exists(select 1 from public.trip_sources s where s.id=r.source_id and s.trip_id=trip and s.acquired_by=actor) limit 65) r;
 result:=result||jsonb_build_object('trip_source_revisions',rows);
 select coalesce(jsonb_agg(public.trip_import_observation(to_jsonb(r)) order by id),'[]') into rows from (select r.* from public.trip_source_representations r where exists(select 1 from public.trip_sources s where s.id=r.source_id and s.trip_id=trip and s.acquired_by=actor) limit 65) r;
 result:=result||jsonb_build_object('trip_source_representations',rows);
 select coalesce(jsonb_agg(public.trip_import_observation(to_jsonb(r)) order by id),'[]') into rows from (select r.* from public.trip_source_runs r where trip_id=trip and actor_account_id=actor limit 65) r;
 result:=result||jsonb_build_object('trip_source_runs',rows);
 select coalesce(jsonb_agg(public.trip_import_observation(to_jsonb(c)) order by id),'[]') into rows from (select c.* from public.trip_source_confirmations c where trip_id=trip and actor_account_id=actor limit 65) c;
 result:=result||jsonb_build_object('trip_source_confirmations',rows);
 select coalesce(jsonb_agg(to_jsonb(i) order by id),'[]') into rows from (select i.* from public.trip_source_inputs i where exists(select 1 from public.trip_source_runs r where r.id=i.run_id and r.trip_id=trip and r.actor_account_id=actor) or exists(select 1 from public.trip_source_confirmations c where c.id=i.confirmation_id and c.trip_id=trip and c.actor_account_id=actor) limit 65) i;
 result:=result||jsonb_build_object('trip_source_inputs',rows);
 select coalesce(jsonb_agg(public.trip_import_observation(to_jsonb(c)) order by id),'[]') into rows from (select c.* from public.trip_source_candidates c where exists(select 1 from public.trip_source_runs r where r.id=c.run_id and r.trip_id=trip and r.actor_account_id=actor) limit 65) c;
 result:=result||jsonb_build_object('trip_source_candidates',rows);
 select coalesce(jsonb_agg(public.trip_import_observation(to_jsonb(s)) order by slot_id),'[]') into rows from (select s.* from public.trip_source_output_slots s where exists(select 1 from public.trip_source_confirmations c where c.id=s.confirmation_id and c.trip_id=trip and c.actor_account_id=actor) limit 65) s;
 result:=result||jsonb_build_object('trip_source_output_slots',rows);
 select coalesce(jsonb_agg(public.trip_import_observation(to_jsonb(a)) order by id),'[]') into rows from (select a.* from public.trip_source_associations a where exists(select 1 from public.trip_sources s where s.id=a.source_id and s.trip_id=trip and s.acquired_by=actor) limit 65) a;
 result:=result||jsonb_build_object('trip_source_associations',rows);
 select coalesce(jsonb_agg(to_jsonb(p) order by child_run_id,parent_run_id),'[]') into rows from (select p.* from public.trip_source_run_predecessors p where exists(select 1 from public.trip_source_runs r where r.id=p.child_run_id and r.trip_id=trip and r.actor_account_id=actor) limit 65) p;
 result:=result||jsonb_build_object('trip_source_run_predecessors',rows);
 select coalesce(jsonb_agg(to_jsonb(p) order by child_candidate_id,parent_candidate_id),'[]') into rows from (select p.* from public.trip_source_candidate_lineage p where exists(select 1 from public.trip_source_candidates c join public.trip_source_runs r on r.id=c.run_id where c.id=p.child_candidate_id and r.trip_id=trip and r.actor_account_id=actor) limit 65) p;
 result:=result||jsonb_build_object('trip_source_candidate_lineage',rows);
 select coalesce(jsonb_agg(public.trip_import_observation(to_jsonb(p)) order by slot_id,ancestor_candidate_id,ancestor_slot_key),'[]') into rows from (select p.* from public.trip_source_slot_lineage_dispositions p where exists(select 1 from public.trip_source_output_slots s join public.trip_source_confirmations c on c.id=s.confirmation_id where s.slot_id=p.slot_id and c.trip_id=trip and c.actor_account_id=actor) limit 65) p;
 result:=result||jsonb_build_object('trip_source_slot_lineage_dispositions',rows);
 select coalesce(jsonb_agg(to_jsonb(p) order by slot_id,predecessor_slot_id),'[]') into rows from (select p.* from public.trip_source_slot_dependencies p where exists(select 1 from public.trip_source_output_slots s join public.trip_source_confirmations c on c.id=s.confirmation_id where s.slot_id=p.slot_id and c.trip_id=trip and c.actor_account_id=actor) limit 65) p;
 result:=result||jsonb_build_object('trip_source_slot_dependencies',rows);
 for name,rows in select key,value from jsonb_each(result) where jsonb_typeof(value)='array' loop
  if jsonb_array_length(rows)>64 then raise exception 'IMPORT_READ_RESOURCE_LIMIT';end if;
 end loop;
 if octet_length(public.trip_event_canonical_json(result::json))>4194304 then raise exception 'IMPORT_READ_RESOURCE_LIMIT';end if;
 return result;
end $function$;$ddl$;
 execute 'grant execute on function public.trip_source_read_import_catalogs(uuid,uuid) to otr_trip_publication_catalog_reader;';
 if had_self_edge then
  execute 'grant otr_trip_source_writer to postgres with inherit false, set false';
 else
  execute 'revoke otr_trip_source_writer from postgres granted by postgres';
 end if;
end $replace_root$;
do $postcondition$ begin
 -- F1: schema defaults add to global defaults; no schema REVOKE can mask a grant.
 if exists(select 1 from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
  cross join lateral aclexplode(d.defaclacl) a
  where d.defaclobjtype in ('r','S')
   and (d.defaclnamespace=0 or n.nspname !~ '^pg_' and n.nspname<>'information_schema')
   and (a.grantee=0 or a.grantee=(select oid from pg_roles where rolname='otr_trip_publication_catalog_reader'))) then
  raise exception 'R3_CATALOG_READER_UNSAFE_DEFAULT_ACL';end if;
 if not exists(select 1 from pg_roles where rolname='otr_trip_publication_catalog_reader'
  and not (rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or rolinherit or rolreplication or rolbypassrls)
  and rolconnlimit=1) then raise exception 'R3_CATALOG_READER_ROLE_DRIFT';end if;
 if exists(select 1 from pg_auth_members where member='otr_trip_publication_catalog_reader'::regrole
  or roleid='otr_trip_publication_catalog_reader'::regrole and
  (member<>'postgres'::regrole or not admin_option or inherit_option or set_option)) then
  raise exception 'R3_CATALOG_READER_MEMBERSHIP_DRIFT';end if;
 if exists(select 1 from pg_shdepend where refclassid='pg_authid'::regclass
  and refobjid='otr_trip_publication_catalog_reader'::regrole and deptype='o')
  or has_database_privilege('otr_trip_publication_catalog_reader',current_database(),'CREATE')
  or exists(select 1 from pg_namespace where nspname !~ '^pg_' and nspname<>'information_schema'
  and has_schema_privilege('otr_trip_publication_catalog_reader',oid,'CREATE')) then
  raise exception 'R3_CATALOG_READER_OBJECT_AUTHORITY';end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname !~ '^pg_' and n.nspname<>'information_schema' and c.relkind in ('r','p','v','m','f','S')
  and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')
  and case when c.relkind='S' then has_sequence_privilege('otr_trip_publication_catalog_reader',c.oid,'USAGE,SELECT,UPDATE') else
   has_table_privilege('otr_trip_publication_catalog_reader',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   or has_any_column_privilege('otr_trip_publication_catalog_reader',c.oid,'SELECT,INSERT,UPDATE,REFERENCES') end) then
  raise exception 'R3_CATALOG_READER_RELATION_AUTHORITY';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname !~ '^pg_' and n.nspname<>'information_schema' and p.prokind in ('f','p')
  and p.oid<>'public.trip_source_read_import_catalogs(uuid,uuid)'::regprocedure
  and has_schema_privilege('otr_trip_publication_catalog_reader',n.oid,'USAGE')
  and has_function_privilege('otr_trip_publication_catalog_reader',p.oid,'EXECUTE')
  and (p.prosecdef or not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   where a.grantee=0 and a.privilege_type='EXECUTE'))) then
  raise exception 'R3_CATALOG_READER_ROUTINE_AUTHORITY';end if;
 if exists(select 1 from public.trip_source_command_gate where enabled)
  or exists(select 1 from public.trip_event_command_gate where enabled)
  or exists(select 1 from public.trip_person_command_gate where enabled)
  or exists(select 1 from public.trip_import_admission_gate where flight_admission_enabled or capture_admission_enabled)
  or exists(select 1 from public.external_integration_environment_state where not kill_switch or runtime_enabled) then
  raise exception 'R3_CATALOG_READER_CLOSED_REQUIRED';end if;
 if encode(extensions.digest((jsonb_build_object(
 'future_default_acls',(select coalesce(jsonb_agg(jsonb_build_array(pg_get_userbyid(d.defaclrole),
  case when d.defaclnamespace=0 then '*' else n.nspname end,d.defaclobjtype,
  case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
  pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable)
  order by d.defaclrole::regrole::text,coalesce(n.nspname,''),d.defaclobjtype,
   a.grantee::regrole::text,a.privilege_type,a.grantor::regrole::text),'[]'::jsonb)
 from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
 cross join lateral aclexplode(d.defaclacl) a
 where d.defaclobjtype in ('r','S')
  and (d.defaclnamespace=0 or n.nspname !~ '^pg_' and n.nspname<>'information_schema')
  and (a.grantee=0 or a.grantee=(select oid from pg_roles where rolname='otr_trip_publication_catalog_reader'))),
 'relations',(select jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',(select jsonb_agg(jsonb_build_array(case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable) order by x.grantee::regrole::text,x.privilege_type,x.grantor::regrole::text) from aclexplode(coalesce(c.relacl,acldefault((case when c.relkind='S' then 'S' else 'r' end)::"char",c.relowner))) x),'rls',c.relrowsecurity,'force',c.relforcerowsecurity,
   'columns',(select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,(select jsonb_agg(jsonb_build_array(case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable) order by x.grantee::regrole::text,x.privilege_type) from aclexplode(a.attacl) x),pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
   'constraints',(select jsonb_agg(jsonb_build_array(k.conname,pg_get_constraintdef(k.oid,true),k.convalidated) order by k.conname) from pg_constraint k where k.conrelid=c.oid),
   'indexes',(select jsonb_agg(jsonb_build_array(ic.relname,pg_get_indexdef(ix.indexrelid),ix.indisvalid,ix.indisready) order by ic.relname) from pg_index ix join pg_class ic on ic.oid=ix.indexrelid where ix.indrelid=c.oid),
   'sequence',(select jsonb_build_array(format_type(s.seqtypid,null),s.seqstart::text,s.seqincrement::text,s.seqmax::text,s.seqmin::text,s.seqcache::text,s.seqcycle) from pg_sequence s where s.seqrelid=c.oid),
   'triggers',(select jsonb_agg(jsonb_build_array(t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true)) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal)) order by c.relname)
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S') and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')),
 'functions',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),'acl',(select jsonb_agg(jsonb_build_array(case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable) order by x.grantee::regrole::text,x.privilege_type,x.grantor::regrole::text) from aclexplode(coalesce(p.proacl,acldefault(('f')::"char",p.proowner))) x),'body_sha256',encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex')) order by p.oid::regprocedure::text)
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind in ('f','p') and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')),
 'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p where schemaname='public' or schemaname='storage' and policyname in ('Journey members can read memory shot previews','Journey members can update memory shot previews','Journey members can upload memory shot previews','Trip members can read trip media','Trip members can upload trip media','trip_source_material_client_deny','trip_source_bucket_client_deny')),
 'types',(select jsonb_agg(jsonb_build_array(t.typname,t.typtype,(select jsonb_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid=t.oid)) order by t.typname) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and (t.typtype in ('e','d') or t.typtype='c' and exists(select 1 from pg_class tc where tc.oid=t.typrelid and tc.relkind='c'))),
 'roles',(select jsonb_agg(jsonb_build_object('name',r.rolname,'login',r.rolcanlogin,'super',r.rolsuper,'createdb',r.rolcreatedb,'createrole',r.rolcreaterole,'inherit',r.rolinherit,'bypass',r.rolbypassrls,'replication',r.rolreplication,
   'memberships',(select jsonb_agg(jsonb_build_array(pg_get_userbyid(m.roleid),pg_get_userbyid(m.member),m.admin_option,m.inherit_option,m.set_option) order by m.roleid::regrole::text,m.member::regrole::text) from (select roleid,member,bool_or(admin_option) as admin_option,bool_or(inherit_option) as inherit_option,bool_or(set_option) as set_option from pg_auth_members group by roleid,member) m where m.member=r.oid or m.roleid=r.oid),
   'settings',(select jsonb_agg(s.setconfig order by s.setdatabase) from pg_db_role_setting s where s.setrole=r.oid),
   'schemas',(select jsonb_agg(jsonb_build_array(n.nspname,has_schema_privilege(r.oid,n.oid,'USAGE'),has_schema_privilege(r.oid,n.oid,'CREATE')) order by n.nspname) from pg_namespace n where n.nspname !~ '^pg_(toast|temp)' and n.nspname not in ('pg_catalog','information_schema') and (has_schema_privilege(r.oid,n.oid,'USAGE') or has_schema_privilege(r.oid,n.oid,'CREATE')))) order by r.rolname) from pg_roles r where r.rolname like 'otr_%')
))::text,'sha256'),'hex') <> 'a56e074a33ea3e3b34c042a0e02c391f0074a5d868ee59e22f66f9ea22446e42' then raise exception 'R3_CATALOG_READER_POSTCONDITION';end if;
end $postcondition$;
commit;
