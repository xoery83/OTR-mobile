-- Isolated proposal only. No Hosted install, role LOGIN, activation or deployment authorized.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'METADATA_INSTALLER_REQUIRED'; END IF;
 IF to_regprocedure('public.trip_create_finite_scope_allowed(uuid,uuid,uuid)') IS NULL
 OR to_regprocedure('public.trip_create_command(uuid,uuid,uuid,text,text,date,date)') IS NULL
 OR to_regprocedure('public.trip_create_result(uuid,uuid)') IS NULL THEN RAISE EXCEPTION 'ACCEPTED_TCL_REQUIRED'; END IF;
 IF md5(pg_get_functiondef('public.trip_create_result(uuid,uuid)'::regprocedure))<>'ce13962ef89ce377d0a4db18c7fa8cad'
 OR md5(pg_get_functiondef('public.trip_create_command(uuid,uuid,uuid,text,text,date,date)'::regprocedure))<>'9e28168bf2c88fc9fbd6dec4209f62ca'
 OR md5(pg_get_functiondef('public.trip_create_finite_scope_allowed(uuid,uuid,uuid)'::regprocedure))<>'4915f242e9e98a31800669b91d81b9bf'
 OR md5(pg_get_functiondef('public.trip_core_finite_read_state_guard()'::regprocedure))<>'680f19be480eb934301c8b5b920eb76a' THEN RAISE EXCEPTION 'ACCEPTED_TCL_PREIMAGE_MISMATCH'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('otr_trip_create_gateway','otr_trip_core_v2_gateway','otr_trip_core_v2_writer') AND rolcanlogin)
 OR EXISTS(SELECT 1 FROM public.trip_create_activation_gate WHERE enabled)
 OR EXISTS(SELECT 1 FROM public.trip_core_activation_gate WHERE runtime_enabled)
 THEN RAISE EXCEPTION 'CLOSE_EXISTING_TRIP_CORE_BEFORE_INSTALL'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='otr_trip_metadata_gateway') THEN RAISE EXCEPTION 'METADATA_ROLE_ALREADY_EXISTS'; END IF;
END $$;

-- Internal direct-RPC tables: no Data API grants, owner-definer only, no RLS policies.
CREATE ROLE otr_trip_metadata_gateway NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 1;
GRANT USAGE ON SCHEMA public TO otr_trip_metadata_gateway;
ALTER TABLE public.trips ADD COLUMN metadata_revision bigint NOT NULL DEFAULT 0
 CHECK(metadata_revision BETWEEN 0 AND 9007199254740991);
CREATE FUNCTION public.trip_metadata_revision_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.metadata_revision<>0 THEN RAISE EXCEPTION 'METADATA_REVISION_SERVER_OWNED' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.metadata_revision IS DISTINCT FROM OLD.metadata_revision THEN
  RAISE EXCEPTION 'METADATA_REVISION_SERVER_OWNED' USING ERRCODE='42501';
 END IF;
 IF ROW(NEW.name,NEW.destination,NEW.start_date,NEW.end_date,NEW.created_by) IS DISTINCT FROM
    ROW(OLD.name,OLD.destination,OLD.start_date,OLD.end_date,OLD.created_by) THEN
  IF OLD.metadata_revision>=9007199254740991 THEN RAISE EXCEPTION 'METADATA_REVISION_EXHAUSTED' USING ERRCODE='22023'; END IF;
  NEW.metadata_revision:=OLD.metadata_revision+1;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.trip_metadata_revision_guard() FROM PUBLIC,anon,authenticated,service_role,otr_trip_metadata_gateway;
CREATE TRIGGER trip_metadata_revision_guard BEFORE INSERT OR UPDATE OF name,destination,start_date,end_date,created_by,metadata_revision ON public.trips
 FOR EACH ROW EXECUTE FUNCTION public.trip_metadata_revision_guard();

CREATE TABLE public.trip_metadata_activation_gate (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT false,
 actor_account_id uuid,trip_id uuid,operation_id uuid,request_payload jsonb,started_at timestamptz,expires_at timestamptz,
 CHECK((NOT enabled AND actor_account_id IS NULL AND trip_id IS NULL AND operation_id IS NULL AND request_payload IS NULL AND started_at IS NULL AND expires_at IS NULL)
 OR (enabled AND actor_account_id IS NOT NULL AND trip_id IS NOT NULL AND operation_id IS NOT NULL AND request_payload IS NOT NULL
 AND jsonb_typeof(request_payload)='object' AND octet_length(request_payload::text)<=8192
 AND request_payload ?& ARRAY['formatVersion','operationId','tripId','before','after','expectedMetadataRevision']
 AND request_payload-ARRAY['formatVersion','operationId','tripId','before','after','expectedMetadataRevision']='{}'::jsonb
 AND request_payload->'formatVersion'='2'::jsonb
 AND request_payload->>'operationId'=operation_id::text AND request_payload->>'tripId'=trip_id::text
 AND started_at IS NOT NULL AND expires_at IS NOT NULL AND isfinite(started_at) AND isfinite(expires_at)
 AND expires_at>started_at AND expires_at<=started_at+interval '15 minutes'))
);
INSERT INTO public.trip_metadata_activation_gate(singleton) VALUES(true);
ALTER TABLE public.trip_metadata_activation_gate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trip_metadata_activation_gate FROM PUBLIC,anon,authenticated,service_role,otr_trip_metadata_gateway;
CREATE TABLE public.trip_metadata_update_receipts (
 operation_id uuid PRIMARY KEY,actor_account_id uuid NOT NULL,trip_id uuid NOT NULL,
 request_payload jsonb NOT NULL CHECK(jsonb_typeof(request_payload)='object'),
 result_payload jsonb NOT NULL CHECK(jsonb_typeof(result_payload)='object'),
 before_revision bigint NOT NULL CHECK(before_revision BETWEEN 0 AND 9007199254740991),
 after_revision bigint NOT NULL CHECK(after_revision BETWEEN before_revision AND before_revision+1 AND after_revision<=9007199254740991),
 accepted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.trip_metadata_update_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trip_metadata_update_receipts FROM PUBLIC,anon,authenticated,service_role,otr_trip_metadata_gateway;
CREATE FUNCTION public.trip_metadata_receipt_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'METADATA_RECEIPT_IMMUTABLE' USING ERRCODE='42501'; END $$;
REVOKE ALL ON FUNCTION public.trip_metadata_receipt_immutable() FROM PUBLIC,anon,authenticated,service_role,otr_trip_metadata_gateway;
CREATE TRIGGER trip_metadata_receipt_immutable BEFORE UPDATE OR DELETE ON public.trip_metadata_update_receipts
 FOR EACH ROW EXECUTE FUNCTION public.trip_metadata_receipt_immutable();
CREATE TRIGGER trip_metadata_receipt_no_truncate BEFORE TRUNCATE ON public.trip_metadata_update_receipts
 FOR EACH STATEMENT EXECUTE FUNCTION public.trip_metadata_receipt_immutable();

create function public.trip_metadata_finite_scope_allowed(actor uuid,trip uuid,operation uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare gate public.trip_metadata_activation_gate%rowtype; principal record;instant timestamptz;owner_id oid;
begin
 if session_user<>'otr_trip_metadata_gateway' or current_user<>'postgres' or actor is null or operation is null then return false;end if;
 select oid into owner_id from pg_roles where rolname=current_user;
 select * into principal from pg_roles where rolname='otr_trip_metadata_gateway';
 if not found or not principal.rolcanlogin or principal.rolconnlimit<>1 or principal.rolvaliduntil is null
 or principal.rolsuper or principal.rolcreatedb or principal.rolcreaterole or principal.rolinherit or principal.rolbypassrls or principal.rolreplication
 or exists(select 1 from pg_auth_members m where (m.roleid=principal.oid or m.member=principal.oid) and not (m.roleid=principal.oid and m.member=owner_id and m.admin_option and not m.inherit_option and not m.set_option))
 or not exists(select 1 from pg_class c where c.oid='public.trip_metadata_activation_gate'::regclass and c.relowner=owner_id and c.relrowsecurity and not c.relforcerowsecurity)
 or exists(select 1 from pg_policy where polrelid='public.trip_metadata_activation_gate'::regclass)
 or exists(select 1 from pg_class c cross join lateral aclexplode(c.relacl) a where c.oid='public.trip_metadata_activation_gate'::regclass and (a.grantee<>owner_id or a.is_grantable))
 or exists(select 1 from pg_shdepend where refclassid='pg_authid'::regclass and refobjid=principal.oid and deptype='o')
 or exists(select 1 from pg_class c cross join lateral aclexplode(c.relacl) a where a.grantee=principal.oid)
 or exists(select 1 from pg_attribute c cross join lateral aclexplode(c.attacl) a where a.grantee=principal.oid)
 or exists(select 1 from pg_namespace n cross join lateral aclexplode(n.nspacl) a where a.grantee=principal.oid and (n.nspname<>'public' or a.privilege_type<>'USAGE' or a.is_grantable))
 or exists(select 1 from pg_database d cross join lateral aclexplode(d.datacl) a where a.grantee=principal.oid)
 or exists(select 1 from pg_tablespace t cross join lateral aclexplode(t.spcacl) a where a.grantee=principal.oid)
 or exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a where a.grantee=principal.oid and (a.privilege_type<>'EXECUTE' or a.is_grantable or p.oid not in (
  'public.trip_metadata_update_command(uuid,uuid,uuid,jsonb)'::regprocedure,
  'public.trip_metadata_update_result(uuid,uuid)'::regprocedure,
  'public.trip_metadata_snapshot(uuid,uuid,uuid)'::regprocedure,
  'public.trip_metadata_finite_scope_allowed(uuid,uuid,uuid)'::regprocedure)))
 then return false;end if;
 select * into gate from public.trip_metadata_activation_gate where singleton for share;
 instant:=clock_timestamp();
 return coalesce(gate.enabled and actor=gate.actor_account_id and operation=gate.operation_id
  and (trip=gate.trip_id or trip is null)
  and instant>=gate.started_at and instant<gate.expires_at
  and principal.rolvaliduntil>instant and principal.rolvaliduntil<=gate.expires_at,false);
end $$;

CREATE FUNCTION public.trip_metadata_snapshot(p_actor uuid,p_trip uuid,p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t record;member_id uuid;result jsonb;
BEGIN
 IF session_user<>'otr_trip_metadata_gateway' THEN RAISE EXCEPTION 'METADATA_PRINCIPAL_REQUIRED' USING ERRCODE='42501'; END IF;
 IF NOT public.trip_metadata_finite_scope_allowed(p_actor,p_trip,p_operation) THEN RAISE EXCEPTION 'METADATA_CLOSED' USING ERRCODE='55000'; END IF;
 SELECT * INTO t FROM public.trips WHERE id=p_trip FOR SHARE;
 IF NOT FOUND OR t.created_by IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'METADATA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT id INTO member_id FROM public.journey_members WHERE trip_id=p_trip AND user_id=p_actor AND status='linked' AND role='owner' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'METADATA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 result:=jsonb_build_object('formatVersion',2,'actorAccountId',p_actor,'tripId',p_trip,'metadataRevision',t.metadata_revision,
 'metadata',jsonb_build_object('name',t.name,'destination',t.destination,'startDate',t.start_date,'endDate',t.end_date));
 IF NOT public.trip_metadata_finite_scope_allowed(p_actor,p_trip,p_operation) THEN RAISE EXCEPTION 'METADATA_CLOSED' USING ERRCODE='55000'; END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.trip_metadata_update_result(p_operation uuid,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r public.trip_metadata_update_receipts%rowtype;t record;member_id uuid;
BEGIN
 IF session_user<>'otr_trip_metadata_gateway' THEN RAISE EXCEPTION 'METADATA_PRINCIPAL_REQUIRED' USING ERRCODE='42501'; END IF;
 IF NOT public.trip_metadata_finite_scope_allowed(p_actor,NULL,p_operation) THEN RAISE EXCEPTION 'METADATA_CLOSED' USING ERRCODE='55000'; END IF;
 SELECT * INTO r FROM public.trip_metadata_update_receipts WHERE operation_id=p_operation FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF r.actor_account_id<>p_actor THEN RAISE EXCEPTION 'METADATA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT public.trip_metadata_finite_scope_allowed(p_actor,r.trip_id,p_operation) THEN RAISE EXCEPTION 'METADATA_CLOSED' USING ERRCODE='55000'; END IF;
 SELECT * INTO t FROM public.trips WHERE id=r.trip_id FOR SHARE;
 IF NOT FOUND OR t.created_by IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'METADATA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT id INTO member_id FROM public.journey_members WHERE trip_id=r.trip_id AND user_id=p_actor AND status='linked' AND role='owner' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'METADATA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF r.request_payload IS DISTINCT FROM (SELECT request_payload FROM public.trip_metadata_activation_gate WHERE singleton) THEN RAISE EXCEPTION 'METADATA_OPERATION_COLLISION' USING ERRCODE='23505'; END IF;
 IF NOT public.trip_metadata_finite_scope_allowed(p_actor,r.trip_id,p_operation) THEN RAISE EXCEPTION 'METADATA_CLOSED' USING ERRCODE='55000'; END IF;
 RETURN r.result_payload;
END $$;

CREATE FUNCTION public.trip_metadata_update_command(p_operation uuid,p_actor uuid,p_trip uuid,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t record;r public.trip_metadata_update_receipts%rowtype;member_id uuid;side text;v jsonb;expected bigint;actual bigint;result jsonb;
BEGIN
 IF session_user<>'otr_trip_metadata_gateway' THEN RAISE EXCEPTION 'METADATA_PRINCIPAL_REQUIRED' USING ERRCODE='42501'; END IF;
 IF NOT public.trip_metadata_finite_scope_allowed(p_actor,p_trip,p_operation) THEN RAISE EXCEPTION 'METADATA_CLOSED' USING ERRCODE='55000'; END IF;
 IF p_request IS NULL OR jsonb_typeof(p_request)<>'object' OR octet_length(p_request::text)>8192
 OR NOT p_request ?& ARRAY['formatVersion','operationId','tripId','before','after','expectedMetadataRevision']
 OR p_request-ARRAY['formatVersion','operationId','tripId','before','after','expectedMetadataRevision']<>'{}'::jsonb
 OR p_request->'formatVersion'<>'2'::jsonb OR jsonb_typeof(p_request->'operationId')<>'string' OR p_request->>'operationId'<>p_operation::text
 OR jsonb_typeof(p_request->'tripId')<>'string' OR p_request->>'tripId'<>p_trip::text
 OR jsonb_typeof(p_request->'expectedMetadataRevision')<>'number' OR (p_request->>'expectedMetadataRevision')!~'^[0-9]+$'
 THEN RAISE EXCEPTION 'METADATA_INVALID' USING ERRCODE='22023'; END IF;
 IF (p_request->>'expectedMetadataRevision')::numeric>9007199254740991 THEN RAISE EXCEPTION 'METADATA_INVALID' USING ERRCODE='22023'; END IF;
 expected:=(p_request->>'expectedMetadataRevision')::bigint;
 FOREACH side IN ARRAY ARRAY['before','after'] LOOP
  v:=p_request->side;
  IF jsonb_typeof(v)<>'object' OR NOT v ?& ARRAY['name','destination','startDate','endDate']
  OR v-ARRAY['name','destination','startDate','endDate']<>'{}'::jsonb OR jsonb_typeof(v->'name')<>'string'
  OR length(v->>'name') NOT BETWEEN 1 AND 256 OR v->>'name'<>btrim(v->>'name')
  OR jsonb_typeof(v->'destination') NOT IN ('null','string') OR length(v->>'destination')>256 OR v->>'destination'<>btrim(v->>'destination')
  OR jsonb_typeof(v->'startDate') NOT IN ('null','string') OR jsonb_typeof(v->'endDate') NOT IN ('null','string')
  THEN RAISE EXCEPTION 'METADATA_INVALID' USING ERRCODE='22023'; END IF;
  IF (v->>'startDate' IS NOT NULL AND ((v->>'startDate')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR to_char((v->>'startDate')::date,'YYYY-MM-DD')<>v->>'startDate'))
  OR (v->>'endDate' IS NOT NULL AND ((v->>'endDate')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR to_char((v->>'endDate')::date,'YYYY-MM-DD')<>v->>'endDate'))
  OR ((v->>'startDate')::date>(v->>'endDate')::date)
  THEN RAISE EXCEPTION 'METADATA_INVALID' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF p_request IS DISTINCT FROM (SELECT request_payload FROM public.trip_metadata_activation_gate WHERE singleton) THEN RAISE EXCEPTION 'METADATA_OPERATION_COLLISION' USING ERRCODE='23505'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_operation::text,0));
 SELECT * INTO t FROM public.trips WHERE id=p_trip FOR UPDATE;
 IF NOT FOUND OR t.created_by IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'METADATA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT id INTO member_id FROM public.journey_members WHERE trip_id=p_trip AND user_id=p_actor AND status='linked' AND role='owner' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'METADATA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.trip_metadata_update_receipts WHERE operation_id=p_operation FOR SHARE;
 IF FOUND THEN
  IF r.actor_account_id<>p_actor THEN RAISE EXCEPTION 'METADATA_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF r.trip_id<>p_trip OR r.request_payload IS DISTINCT FROM p_request THEN RAISE EXCEPTION 'METADATA_OPERATION_COLLISION' USING ERRCODE='23505'; END IF;
  IF NOT public.trip_metadata_finite_scope_allowed(p_actor,p_trip,p_operation) THEN RAISE EXCEPTION 'METADATA_CLOSED' USING ERRCODE='55000'; END IF;
  RETURN r.result_payload;
 END IF;
 IF t.metadata_revision<>expected OR jsonb_build_object('name',t.name,'destination',t.destination,'startDate',t.start_date,'endDate',t.end_date) IS DISTINCT FROM p_request->'before'
 THEN RAISE EXCEPTION 'METADATA_STALE_REVISION_OR_TUPLE' USING ERRCODE='40001'; END IF;
 UPDATE public.trips SET name=p_request->'after'->>'name',destination=p_request->'after'->>'destination',
 start_date=(p_request->'after'->>'startDate')::date,end_date=(p_request->'after'->>'endDate')::date WHERE id=p_trip RETURNING metadata_revision INTO actual;
 result:=p_request||jsonb_build_object('actorAccountId',p_actor,'resultMetadataRevision',actual);
 INSERT INTO public.trip_metadata_update_receipts(operation_id,actor_account_id,trip_id,request_payload,result_payload,before_revision,after_revision)
 VALUES(p_operation,p_actor,p_trip,p_request,result,expected,actual);
 IF NOT public.trip_metadata_finite_scope_allowed(p_actor,p_trip,p_operation) THEN RAISE EXCEPTION 'METADATA_CLOSED' USING ERRCODE='55000'; END IF;
 RETURN result;
END $$;

-- Default-deferred expiry guard protects the trusted fixed Backend transaction.
-- Credential custody is Backend-only: an arbitrary SQL client can SET CONSTRAINTS
-- early and bypass a commit-time deadline. This is not a malicious-client boundary.
CREATE FUNCTION public.trip_metadata_commit_scope_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT public.trip_metadata_finite_scope_allowed(NEW.actor_account_id,NEW.trip_id,NEW.operation_id)
 THEN RAISE EXCEPTION 'METADATA_EXPIRED_BEFORE_COMMIT' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.trip_metadata_commit_scope_guard() FROM PUBLIC,anon,authenticated,service_role,otr_trip_metadata_gateway;
CREATE CONSTRAINT TRIGGER trip_metadata_commit_scope_guard AFTER INSERT ON public.trip_metadata_update_receipts
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.trip_metadata_commit_scope_guard();
REVOKE ALL ON FUNCTION public.trip_metadata_finite_scope_allowed(uuid,uuid,uuid),public.trip_metadata_snapshot(uuid,uuid,uuid),
 public.trip_metadata_update_command(uuid,uuid,uuid,jsonb),public.trip_metadata_update_result(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.trip_metadata_finite_scope_allowed(uuid,uuid,uuid),public.trip_metadata_snapshot(uuid,uuid,uuid),
 public.trip_metadata_update_command(uuid,uuid,uuid,jsonb),public.trip_metadata_update_result(uuid,uuid) TO otr_trip_metadata_gateway;

-- Preserve original Create metadata after later lawful Edits; current owning identity checks stay intact.
create or replace function public.trip_create_result(p_operation uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$ declare r record;t record;p record;s record;begin
 if session_user<>'otr_trip_create_gateway' then raise exception 'TRIP_CREATE_PRINCIPAL_UNAVAILABLE' using errcode='42501';end if;
 if not public.trip_create_finite_scope_allowed(p_actor,null,p_operation) then raise exception 'TRIP_CREATE_CAPABILITY_CLOSED' using errcode='55000';end if;
 select * into r from public.trip_create_receipts where operation_id=p_operation for share;
 if not found then return null;end if;
 if not public.trip_create_finite_scope_allowed(p_actor,r.trip_id,p_operation) then raise exception 'TRIP_CREATE_CAPABILITY_CLOSED' using errcode='55000';end if;
 if r.actor_account_id<>p_actor then raise exception 'TRIP_CREATE_ACTOR_MISMATCH' using errcode='42501';end if;
 select id,name,destination,start_date,end_date,created_by into t from public.trips where id=r.trip_id for share;
 select id,status into p from public.journey_members where trip_id=r.trip_id and user_id=p_actor for share;
 select epoch,revision,access_revision into s from public.trip_core_read_state where trip_id=r.trip_id for share;
 if t.id is null or t.created_by<>p_actor or p.id is null or p.status<>'linked' or s.epoch is null then
  raise exception 'TRIP_CREATE_OWNING_STATE_UNAVAILABLE' using errcode='42501';
 end if;
 return jsonb_build_object('operationId',r.operation_id,'tripId',t.id,'actorAccountId',r.actor_account_id,'ownerPersonId',p.id,
  'coreEpoch',s.epoch,'coreRevision',s.revision,'coreAccessRevision',s.access_revision,
  'name',r.request_payload->'name','destination',r.request_payload->'destination','startDate',r.request_payload->'startDate','endDate',r.request_payload->'endDate');
end $$;
COMMIT;
