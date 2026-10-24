begin read only;
set local statement_timeout='5000ms';
select jsonb_build_object(
 'environment',(select jsonb_build_object('environment',environment,'config_version',config_version,'kill_switch',kill_switch,'runtime_enabled',runtime_enabled) from public.external_integration_environment_state where environment='DEV'),
 'syntheticActorAdminGrants',(select coalesce(jsonb_agg(jsonb_build_object('permission',permission,'grant_revision',grant_revision,'expires_at',expires_at,'revoked_at',revoked_at)),'[]'::jsonb) from public.external_integration_admin_grants where actor_id='1f65e932-b6d8-4ea4-9cc9-fe9da331b424' and environment='DEV'),
 'adminGateway',(select jsonb_build_object('name',rolname,'login',rolcanlogin,'superuser',rolsuper,'inherit',rolinherit,'bypassRls',rolbypassrls,'validUntil',rolvaliduntil) from pg_roles where rolname='otr_external_integration_admin_gateway'),
 'adminGatewayMemberships',(select coalesce(jsonb_agg(jsonb_build_object('role',r.rolname,'member',u.rolname,'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option)),'[]'::jsonb) from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member where r.rolname='otr_external_integration_admin_gateway' or u.rolname='otr_external_integration_admin_gateway'),
 'meterPostgresEdge',(select coalesce(jsonb_agg(jsonb_build_object('role',r.rolname,'member',u.rolname,'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option)),'[]'::jsonb) from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member where r.rolname='otr_external_integration_meter_writer' and u.rolname='postgres'),
 'cp15Dependencies',jsonb_build_object('scopes',to_regclass('public.flight_activation_scopes'),'grants',to_regclass('public.flight_activation_account_grants'),'holds',to_regclass('public.flight_call_resource_holds'),'reserve',to_regprocedure('public.flight_activation_reserve_call(jsonb,jsonb)'),'lock',to_regprocedure('public.cp15_lock_trip_authority(uuid,uuid)'),'admission',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='cp15_flight_admission'))
) as qualification;
rollback;
