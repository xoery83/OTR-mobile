-- Candidate rollback: restore previous Reader software and drain its reads before dropping the new helper.
BEGIN;
SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='20s';
DO $rollback$ DECLARE f pg_proc%ROWTYPE; BEGIN
 IF current_user<>'postgres' OR current_setting('otr.core.approved_project_ref',true) IS DISTINCT FROM 'tuqigdxrvrerfewsxqgm'
 OR current_setting('otr.core.member_read_gate',true) IS DISTINCT FROM 'OTR_CORE_MEMBER_READ_SCOPE_V1'
 THEN RAISE EXCEPTION 'CORE_MEMBER_READ_EXACT_GATE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT f FROM pg_proc WHERE oid='public.trip_sustained_core_read_scope_allowed(uuid,uuid)'::regprocedure;
 IF md5(f.prosrc) IS DISTINCT FROM '882997ee273bded9f32e7b70868e2afb' OR f.proowner<>'postgres'::regrole OR NOT f.prosecdef
 OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
 OR (SELECT count(*) FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))))<>2
 OR EXISTS(SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a
  WHERE a.grantee NOT IN (f.proowner,'otr_trip_core_v2_gateway'::regrole) OR a.grantor<>f.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable)
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.trip_core_finite_scope_allowed(uuid,uuid)'::regprocedure) IS DISTINCT FROM '3339e0dce619dbd8d92651c3ccf213eb'
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.trip_sustained_core_capabilities(uuid,uuid)'::regprocedure) IS DISTINCT FROM '85ddf997f6984bbf771f22c728843553'
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.trip_sustained_dev_scope_allowed(uuid,uuid,uuid,text)'::regprocedure) IS DISTINCT FROM '2ffdada2e9916df010b960e84f77bffb'
 THEN RAISE EXCEPTION 'CORE_MEMBER_READ_ROLLBACK_DRIFT'; END IF;
END $rollback$;
DROP FUNCTION public.trip_sustained_core_read_scope_allowed(uuid,uuid);
COMMIT;
