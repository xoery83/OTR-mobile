begin read only;set local statement_timeout='5000ms';
select jsonb_build_object('currentUser',current_user,'sessionUser',session_user,'functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'bodyMd5',md5(p.prosrc),'owner',r.rolname,'securityDefiner',p.prosecdef) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='public' and p.oid in ('public.flight_activation_reserve_call(jsonb,jsonb)'::regprocedure,'public.external_integration_mark_dispatch(jsonb,jsonb)'::regprocedure))) as qualification;
rollback;
