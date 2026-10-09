-- Credential-free read-only capability manifest. Caller wraps in READ ONLY/ROLLBACK.
set local search_path=pg_catalog;
select jsonb_build_object(
 'version','otr-r3-dev-v1-catalog-reader-1',
 'role',(select jsonb_build_object('name',rolname,'login',rolcanlogin,'superuser',rolsuper,
  'createdb',rolcreatedb,'createrole',rolcreaterole,'inherit',rolinherit,'replication',rolreplication,
  'bypassrls',rolbypassrls,'connection_limit',rolconnlimit,'password_expiry',rolvaliduntil,
  'settings',rolconfig) from pg_roles where rolname='otr_trip_publication_catalog_reader'),
 'memberships',(select coalesce(jsonb_agg(jsonb_build_array(pg_get_userbyid(roleid),pg_get_userbyid(member),
  pg_get_userbyid(grantor),admin_option,inherit_option,set_option) order by roleid::regrole::text,member::regrole::text,grantor::regrole::text),'[]')
  from pg_auth_members where member='otr_trip_publication_catalog_reader'::regrole or roleid='otr_trip_publication_catalog_reader'::regrole),
 'ownership_count',(select count(*) from pg_shdepend where refclassid='pg_authid'::regclass
  and refobjid='otr_trip_publication_catalog_reader'::regrole and deptype='o'),
 'database_rights',jsonb_build_object('connect',has_database_privilege('otr_trip_publication_catalog_reader',current_database(),'CONNECT'),
  'create',has_database_privilege('otr_trip_publication_catalog_reader',current_database(),'CREATE'),
  'temp',has_database_privilege('otr_trip_publication_catalog_reader',current_database(),'TEMP'),
  'public_acl',(select datacl from pg_database where datname=current_database())),
 'schemas',(select jsonb_agg(jsonb_build_object('name',nspname,'usage',has_schema_privilege('otr_trip_publication_catalog_reader',oid,'USAGE'),
  'create',has_schema_privilege('otr_trip_publication_catalog_reader',oid,'CREATE'),'acl',nspacl) order by nspname)
  from pg_namespace where nspname !~ '^pg_' and nspname<>'information_schema'),
 'relations',(select coalesce(jsonb_agg(jsonb_build_object('name',c.oid::regclass::text,'kind',c.relkind,
  'acl',c.relacl,'column_acls',(select jsonb_agg(jsonb_build_array(attname,attacl) order by attnum) from pg_attribute
   where attrelid=c.oid and attnum>0 and not attisdropped and attacl is not null)) order by c.oid::regclass::text),'[]')
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname !~ '^pg_' and n.nspname<>'information_schema' and c.relkind in ('r','p','v','m','f','S')
  and case when c.relkind='S' then has_sequence_privilege('otr_trip_publication_catalog_reader',c.oid,'USAGE,SELECT,UPDATE') else
   has_table_privilege('otr_trip_publication_catalog_reader',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   or has_any_column_privilege('otr_trip_publication_catalog_reader',c.oid,'SELECT,INSERT,UPDATE,REFERENCES') end),
 'routines',(select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),
  'security_definer',p.prosecdef,'result',p.prorettype::regtype::text,'settings',p.proconfig,
  'definition_sha256',encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex'),
  'acl',p.proacl,'public_execute',exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE'),
  'extension',exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')) order by p.oid::regprocedure::text),'[]')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname !~ '^pg_' and n.nspname<>'information_schema'
  and p.prokind in ('f','p') and has_schema_privilege('otr_trip_publication_catalog_reader',n.oid,'USAGE')
  and has_function_privilege('otr_trip_publication_catalog_reader',p.oid,'EXECUTE')),
 'default_acls',(select coalesce(jsonb_agg(to_jsonb(d) order by d.oid),'[]') from pg_default_acl d
  where d.defaclrole='otr_trip_publication_catalog_reader'::regrole or exists(select 1 from aclexplode(d.defaclacl) a
   where a.grantee in (0,'otr_trip_publication_catalog_reader'::regrole))),
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
 'closed',jsonb_build_object('source',not exists(select 1 from public.trip_source_command_gate where enabled),
  'event',not exists(select 1 from public.trip_event_command_gate where enabled),
  'person',not exists(select 1 from public.trip_person_command_gate where enabled),
  'import',not exists(select 1 from public.trip_import_admission_gate where flight_admission_enabled or capture_admission_enabled),
  'provider',not exists(select 1 from public.external_integration_environment_state where not kill_switch or runtime_enabled))
) as principal_manifest;
