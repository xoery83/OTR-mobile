-- F1 catalog/default-ACL commitment; caller wraps READ ONLY/ROLLBACK.
set local search_path=pg_catalog;
do $default_boundary$ begin
 -- F1: schema defaults add to global defaults; no schema REVOKE can mask a grant.
 if exists(select 1 from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
  cross join lateral aclexplode(d.defaclacl) a
  where d.defaclobjtype in ('r','S')
   and (d.defaclnamespace=0 or n.nspname !~ '^pg_' and n.nspname<>'information_schema')
   and (a.grantee=0 or a.grantee=(select oid from pg_roles where rolname='otr_trip_publication_catalog_reader'))) then
  raise exception 'R3_CATALOG_READER_UNSAFE_DEFAULT_ACL';end if;
end $default_boundary$;
select encode(extensions.digest((jsonb_build_object(
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
))::text,'sha256'),'hex') as catalog_security_sha256;
