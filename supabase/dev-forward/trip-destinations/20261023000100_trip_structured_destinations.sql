-- LOCAL CANDIDATE ONLY: new Trip structured destinations; no historical backfill.
BEGIN; SET LOCAL search_path=pg_catalog; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF md5(pg_get_functiondef('public.trip_create_result(uuid,uuid)'::regprocedure))<>'ad2c2778f5a15811b6ef806a6ba2d8d0'
 OR md5(pg_get_functiondef('public.trip_create_finite_scope_allowed(uuid,uuid,uuid)'::regprocedure))<>'4915f242e9e98a31800669b91d81b9bf'
 OR md5(pg_get_functiondef('public.trip_metadata_revision_guard()'::regprocedure))<>'f387200202891b93b90e01119a511a3b'
 OR md5(pg_get_functiondef('public.trip_metadata_snapshot(uuid,uuid,uuid)'::regprocedure))<>'ed57d227810145d5da847346b57503dd'
 OR md5(pg_get_functiondef('public.trip_metadata_update_command(uuid,uuid,uuid,jsonb)'::regprocedure))<>'8d7cdc0f81877718e8d785fc9f8ff991'
 THEN RAISE EXCEPTION 'STRUCTURED_ACCEPTED_PREIMAGE_MISMATCH'; END IF;
 IF current_user<>'postgres' OR EXISTS(SELECT 1 FROM public.trip_create_activation_gate WHERE enabled)
 OR EXISTS(SELECT 1 FROM public.trip_metadata_activation_gate WHERE enabled)
 OR EXISTS(SELECT 1 FROM public.trip_core_activation_gate WHERE runtime_enabled)
 OR EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename IN ('otr_trip_create_gateway','otr_trip_metadata_gateway','otr_trip_core_v2_gateway','otr_trip_core_v2_writer'))
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('otr_trip_create_gateway','otr_trip_metadata_gateway','otr_trip_core_v2_gateway','otr_trip_core_v2_writer') AND rolcanlogin)
 THEN RAISE EXCEPTION 'STRUCTURED_INSTALL_REQUIRES_DORMANT_ACCEPTED_BASE'; END IF;
END $$;
-- Existing trips row RLS/ACL remains unchanged; destinations is Cloud-shared metadata.
ALTER TABLE public.trips ADD COLUMN destinations jsonb;
CREATE FUNCTION public.trip_destinations_valid(items jsonb) RETURNS boolean
 LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE item jsonb; ids uuid[]:='{}'; claims text[]:='{}'; identity uuid; claim text;label text;
BEGIN
 IF items IS NULL OR jsonb_typeof(items)<>'array' OR jsonb_array_length(items)>20 OR octet_length(items::text)>131072 THEN RETURN false; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
  IF jsonb_typeof(item)<>'object' OR NOT item ?& ARRAY['destinationId','displayLabel','source']
  OR jsonb_typeof(item->'destinationId')<>'string' OR item->>'destinationId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR jsonb_typeof(item->'displayLabel')<>'string' THEN RETURN false; END IF;
  identity:=(item->>'destinationId')::uuid;label:=item->>'displayLabel';
  IF length(label) NOT BETWEEN 1 AND 256 OR octet_length(label)>1024 OR label~'^\s|\s$' THEN RETURN false; END IF;
  IF item->>'source'='MANUAL' AND item-ARRAY['destinationId','displayLabel','source']='{}'::jsonb THEN
   claim:='MANUAL:'||lower(regexp_replace(btrim(normalize(label,NFKC)),'\s+',' ','g'));
  ELSIF item->>'source'='APPLE_PLACE_ID' AND item ?& ARRAY['provider','providerPlaceId']
   AND item-ARRAY['destinationId','displayLabel','source','provider','providerPlaceId']='{}'::jsonb
   AND item->>'provider'='apple' AND jsonb_typeof(item->'providerPlaceId')='string'
   AND length(item->>'providerPlaceId') BETWEEN 1 AND 1024 AND octet_length(item->>'providerPlaceId')<=4096
   AND item->>'providerPlaceId'!~'^\s|\s$' THEN claim:='APPLE:'||(item->>'providerPlaceId');
  ELSE RETURN false; END IF;
  IF identity=ANY(ids) OR claim=ANY(claims) THEN RETURN false; END IF;
  ids:=array_append(ids,identity);claims:=array_append(claims,claim);
 END LOOP;RETURN true;
EXCEPTION WHEN invalid_text_representation THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.trip_destinations_valid(jsonb) FROM PUBLIC,anon,authenticated,service_role,otr_trip_create_gateway,otr_trip_metadata_gateway;
-- Pure input-only CHECK validator, needed by existing authenticated/Backend table writers; no table reads or writes.
GRANT EXECUTE ON FUNCTION public.trip_destinations_valid(jsonb) TO authenticated,service_role;
ALTER TABLE public.trips ADD CONSTRAINT trip_destinations_valid CHECK(destinations IS NULL OR (destination IS NULL AND public.trip_destinations_valid(destinations)));
-- Replace only each gate's request check, preserving singleton constraints/rows/ACL/RLS.
DO $$ DECLARE x record; n integer; BEGIN
 FOR x IN SELECT conname,conrelid::regclass AS rel FROM pg_constraint WHERE conrelid IN ('public.trip_create_activation_gate'::regclass,'public.trip_metadata_activation_gate'::regclass) AND contype='c' AND pg_get_constraintdef(oid) LIKE '%request_payload%' LOOP
  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',x.rel,x.conname);
 END LOOP;
END $$;
ALTER TABLE public.trip_create_activation_gate ADD CONSTRAINT trip_create_gate_request_version CHECK((
 (NOT enabled AND actor_account_id IS NULL AND trip_id IS NULL AND operation_id IS NULL AND request_payload IS NULL AND started_at IS NULL AND expires_at IS NULL)
 OR (enabled AND actor_account_id IS NOT NULL AND trip_id IS NOT NULL AND operation_id IS NOT NULL
 AND jsonb_typeof(request_payload)='object' AND request_payload->>'tripId'=trip_id::text
 AND ((request_payload-ARRAY['tripId','name','destination','startDate','endDate']='{}'::jsonb AND request_payload ?& ARRAY['tripId','name','destination','startDate','endDate'] AND octet_length(request_payload::text)<=2048)
 OR (request_payload->'formatVersion'='2'::jsonb AND request_payload-ARRAY['formatVersion','tripId','name','destination','destinations','startDate','endDate']='{}'::jsonb AND request_payload ?& ARRAY['formatVersion','tripId','name','destination','destinations','startDate','endDate'] AND octet_length(request_payload::text)<=131072))
 AND started_at IS NOT NULL AND expires_at IS NOT NULL AND isfinite(started_at) AND isfinite(expires_at) AND expires_at>started_at AND expires_at<=started_at+interval '15 minutes')) IS TRUE);
ALTER TABLE public.trip_metadata_activation_gate ADD CONSTRAINT trip_metadata_gate_request_version CHECK((
 (NOT enabled AND actor_account_id IS NULL AND trip_id IS NULL AND operation_id IS NULL AND request_payload IS NULL AND started_at IS NULL AND expires_at IS NULL)
 OR (enabled AND actor_account_id IS NOT NULL AND trip_id IS NOT NULL AND operation_id IS NOT NULL
 AND jsonb_typeof(request_payload)='object' AND request_payload ?& ARRAY['formatVersion','operationId','tripId','before','after','expectedMetadataRevision']
 AND request_payload-ARRAY['formatVersion','operationId','tripId','before','after','expectedMetadataRevision']='{}'::jsonb
 AND ((request_payload->'formatVersion'='2'::jsonb AND octet_length(request_payload::text)<=8192) OR (request_payload->'formatVersion'='3'::jsonb AND octet_length(request_payload::text)<=262144))
 AND request_payload->>'operationId'=operation_id::text AND request_payload->>'tripId'=trip_id::text
 AND started_at IS NOT NULL AND expires_at IS NOT NULL AND isfinite(started_at) AND isfinite(expires_at) AND expires_at>started_at AND expires_at<=started_at+interval '15 minutes')) IS TRUE);

CREATE OR REPLACE FUNCTION public.trip_metadata_revision_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.metadata_revision<>0 THEN RAISE EXCEPTION 'METADATA_REVISION_SERVER_OWNED' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.metadata_revision IS DISTINCT FROM OLD.metadata_revision THEN
  RAISE EXCEPTION 'METADATA_REVISION_SERVER_OWNED' USING ERRCODE='42501';
 END IF;
 IF ROW(NEW.name,NEW.destination,NEW.start_date,NEW.end_date,NEW.created_by,NEW.destinations) IS DISTINCT FROM
    ROW(OLD.name,OLD.destination,OLD.start_date,OLD.end_date,OLD.created_by,OLD.destinations) THEN
  IF OLD.metadata_revision>=9007199254740991 THEN RAISE EXCEPTION 'METADATA_REVISION_EXHAUSTED' USING ERRCODE='22023'; END IF;
  NEW.metadata_revision:=OLD.metadata_revision+1;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER trip_metadata_revision_guard ON public.trips;
CREATE TRIGGER trip_metadata_revision_guard BEFORE INSERT OR UPDATE OF name,destination,start_date,end_date,created_by,metadata_revision,destinations ON public.trips FOR EACH ROW EXECUTE FUNCTION public.trip_metadata_revision_guard();

CREATE OR REPLACE FUNCTION public.trip_metadata_update_command(p_operation uuid,p_actor uuid,p_trip uuid,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t record;r public.trip_metadata_update_receipts%rowtype;member_id uuid;side text;v jsonb;expected bigint;actual bigint;result jsonb;
BEGIN
 IF session_user<>'otr_trip_metadata_gateway' THEN RAISE EXCEPTION 'METADATA_PRINCIPAL_REQUIRED' USING ERRCODE='42501'; END IF;
 IF NOT public.trip_metadata_finite_scope_allowed(p_actor,p_trip,p_operation) THEN RAISE EXCEPTION 'METADATA_CLOSED' USING ERRCODE='55000'; END IF;
 IF p_request IS NULL OR jsonb_typeof(p_request)<>'object' OR octet_length(p_request::text)>(CASE WHEN p_request->'formatVersion'='3'::jsonb THEN 262144 ELSE 8192 END)
 OR NOT p_request ?& ARRAY['formatVersion','operationId','tripId','before','after','expectedMetadataRevision']
 OR p_request-ARRAY['formatVersion','operationId','tripId','before','after','expectedMetadataRevision']<>'{}'::jsonb
 OR p_request->'formatVersion' NOT IN ('2'::jsonb,'3'::jsonb) OR jsonb_typeof(p_request->'operationId')<>'string' OR p_request->>'operationId'<>p_operation::text
 OR jsonb_typeof(p_request->'tripId')<>'string' OR p_request->>'tripId'<>p_trip::text
 OR jsonb_typeof(p_request->'expectedMetadataRevision')<>'number' OR (p_request->>'expectedMetadataRevision')!~'^[0-9]+$'
 THEN RAISE EXCEPTION 'METADATA_INVALID' USING ERRCODE='22023'; END IF;
 IF (p_request->>'expectedMetadataRevision')::numeric>9007199254740991 THEN RAISE EXCEPTION 'METADATA_INVALID' USING ERRCODE='22023'; END IF;
 expected:=(p_request->>'expectedMetadataRevision')::bigint;
 FOREACH side IN ARRAY ARRAY['before','after'] LOOP
  v:=p_request->side;
  IF jsonb_typeof(v)<>'object' OR NOT v ?& ARRAY['name','destination','startDate','endDate']
  OR (v-CASE WHEN p_request->'formatVersion'='3'::jsonb THEN ARRAY['name','destination','startDate','endDate','destinations'] ELSE ARRAY['name','destination','startDate','endDate'] END)<>'{}'::jsonb
 OR (p_request->'formatVersion'='3'::jsonb AND (NOT v ? 'destinations' OR v->'destination'<>'null'::jsonb OR NOT public.trip_destinations_valid(v->'destinations'))) OR jsonb_typeof(v->'name')<>'string'
  OR length(v->>'name') NOT BETWEEN 1 AND 256 OR v->>'name'<>btrim(v->>'name')
  OR jsonb_typeof(v->'destination') NOT IN ('null','string') OR length(v->>'destination')>256 OR v->>'destination'<>btrim(v->>'destination')
  OR jsonb_typeof(v->'startDate') NOT IN ('null','string') OR jsonb_typeof(v->'endDate') NOT IN ('null','string')
  THEN RAISE EXCEPTION 'METADATA_INVALID' USING ERRCODE='22023'; END IF;
  IF (v->>'startDate' IS NOT NULL AND ((v->>'startDate')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR to_char((v->>'startDate')::date,'YYYY-MM-DD')<>v->>'startDate'))
  OR (v->>'endDate' IS NOT NULL AND ((v->>'endDate')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR to_char((v->>'endDate')::date,'YYYY-MM-DD')<>v->>'endDate'))
  OR ((v->>'startDate')::date>(v->>'endDate')::date)
  THEN RAISE EXCEPTION 'METADATA_INVALID' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF p_request->'formatVersion'='3'::jsonb AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_request->'before'->'destinations') b JOIN jsonb_array_elements(p_request->'after'->'destinations') a ON b->>'destinationId'=a->>'destinationId' WHERE b->'source' IS DISTINCT FROM a->'source' OR b->'providerPlaceId' IS DISTINCT FROM a->'providerPlaceId') THEN RAISE EXCEPTION 'DESTINATION_IDENTITY_MISMATCH' USING ERRCODE='22023'; END IF;
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
 IF (t.destinations IS NOT NULL) IS DISTINCT FROM (p_request->'formatVersion'='3'::jsonb) THEN RAISE EXCEPTION 'METADATA_VERSION_REQUIRED' USING ERRCODE='22023'; END IF;
 IF t.metadata_revision<>expected OR (jsonb_build_object('name',t.name,'destination',t.destination,'startDate',t.start_date,'endDate',t.end_date)||CASE WHEN p_request->'formatVersion'='3'::jsonb THEN jsonb_build_object('destinations',t.destinations) ELSE '{}'::jsonb END) IS DISTINCT FROM p_request->'before'
 THEN RAISE EXCEPTION 'METADATA_STALE_REVISION_OR_TUPLE' USING ERRCODE='40001'; END IF;
 UPDATE public.trips SET name=p_request->'after'->>'name',destination=p_request->'after'->>'destination',
 start_date=(p_request->'after'->>'startDate')::date,end_date=(p_request->'after'->>'endDate')::date,destinations=CASE WHEN p_request->'formatVersion'='3'::jsonb THEN p_request->'after'->'destinations' ELSE NULL END WHERE id=p_trip RETURNING metadata_revision INTO actual;
 result:=p_request||jsonb_build_object('actorAccountId',p_actor,'resultMetadataRevision',actual);
 INSERT INTO public.trip_metadata_update_receipts(operation_id,actor_account_id,trip_id,request_payload,result_payload,before_revision,after_revision)
 VALUES(p_operation,p_actor,p_trip,p_request,result,expected,actual);
 IF NOT public.trip_metadata_finite_scope_allowed(p_actor,p_trip,p_operation) THEN RAISE EXCEPTION 'METADATA_CLOSED' USING ERRCODE='55000'; END IF;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.trip_metadata_snapshot(p_actor uuid,p_trip uuid,p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t record;member_id uuid;result jsonb;
BEGIN
 IF session_user<>'otr_trip_metadata_gateway' THEN RAISE EXCEPTION 'METADATA_PRINCIPAL_REQUIRED' USING ERRCODE='42501'; END IF;
 IF NOT public.trip_metadata_finite_scope_allowed(p_actor,p_trip,p_operation) THEN RAISE EXCEPTION 'METADATA_CLOSED' USING ERRCODE='55000'; END IF;
 SELECT * INTO t FROM public.trips WHERE id=p_trip FOR SHARE;
 IF NOT FOUND OR t.created_by IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'METADATA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT id INTO member_id FROM public.journey_members WHERE trip_id=p_trip AND user_id=p_actor AND status='linked' AND role='owner' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'METADATA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 result:=jsonb_build_object('formatVersion',CASE WHEN t.destinations IS NULL THEN 2 ELSE 3 END,'actorAccountId',p_actor,'tripId',p_trip,'metadataRevision',t.metadata_revision,
 'metadata',jsonb_build_object('name',t.name,'destination',t.destination,'startDate',t.start_date,'endDate',t.end_date)||CASE WHEN t.destinations IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('destinations',t.destinations) END);
 IF NOT public.trip_metadata_finite_scope_allowed(p_actor,p_trip,p_operation) THEN RAISE EXCEPTION 'METADATA_CLOSED' USING ERRCODE='55000'; END IF;
 RETURN result;
END $$;
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
  'name',r.request_payload->'name','destination',r.request_payload->'destination','startDate',r.request_payload->'startDate','endDate',r.request_payload->'endDate')||CASE WHEN r.request_payload->'formatVersion'='2'::jsonb THEN jsonb_build_object('formatVersion',2,'destinations',r.request_payload->'destinations','metadataRevision',0) ELSE '{}'::jsonb END;
end $$;
CREATE FUNCTION public.trip_create_command(p_operation uuid,p_actor uuid,p_trip uuid,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE payload jsonb;inserted uuid;r record;v jsonb;
BEGIN
 IF session_user<>'otr_trip_create_gateway' THEN RAISE EXCEPTION 'TRIP_CREATE_PRINCIPAL_REQUIRED' USING ERRCODE='42501'; END IF;
 IF NOT public.trip_create_finite_scope_allowed(p_actor,p_trip,p_operation) THEN RAISE EXCEPTION 'TRIP_CREATE_CLOSED' USING ERRCODE='55000'; END IF;
 IF p_request IS NULL OR jsonb_typeof(p_request)<>'object' OR p_request->'formatVersion'<>'2'::jsonb
 OR NOT p_request ?& ARRAY['formatVersion','operationId','tripId','name','destination','destinations','startDate','endDate']
 OR p_request-ARRAY['formatVersion','operationId','tripId','name','destination','destinations','startDate','endDate']<>'{}'::jsonb
 OR jsonb_typeof(p_request->'operationId')<>'string' OR jsonb_typeof(p_request->'tripId')<>'string'
 OR octet_length(p_request::text)>131072 OR p_request->>'operationId'<>p_operation::text OR p_request->>'tripId'<>p_trip::text
 OR p_request->'destination'<>'null'::jsonb OR NOT public.trip_destinations_valid(p_request->'destinations')
 OR jsonb_typeof(p_request->'name')<>'string' OR length(p_request->>'name') NOT BETWEEN 1 AND 256 OR p_request->>'name'<>btrim(p_request->>'name')
 OR jsonb_typeof(p_request->'startDate') NOT IN ('null','string') OR jsonb_typeof(p_request->'endDate') NOT IN ('null','string')
 THEN RAISE EXCEPTION 'TRIP_CREATE_INVALID' USING ERRCODE='22023'; END IF;
 IF (p_request->>'startDate' IS NOT NULL AND ((p_request->>'startDate')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR to_char((p_request->>'startDate')::date,'YYYY-MM-DD')<>p_request->>'startDate'))
 OR (p_request->>'endDate' IS NOT NULL AND ((p_request->>'endDate')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR to_char((p_request->>'endDate')::date,'YYYY-MM-DD')<>p_request->>'endDate'))
 OR ((p_request->>'startDate')::date>(p_request->>'endDate')::date) THEN RAISE EXCEPTION 'TRIP_CREATE_INVALID' USING ERRCODE='22023'; END IF;
 payload:=p_request-'operationId';
 IF payload IS DISTINCT FROM (SELECT request_payload FROM public.trip_create_activation_gate WHERE singleton) THEN RAISE EXCEPTION 'TRIP_CREATE_COLLISION' USING ERRCODE='23505'; END IF;
 INSERT INTO public.trip_create_receipts(operation_id,trip_id,actor_account_id,request_payload) VALUES(p_operation,p_trip,p_actor,payload)
 ON CONFLICT(operation_id) DO NOTHING RETURNING operation_id INTO inserted;
 IF inserted IS NULL THEN
  SELECT * INTO r FROM public.trip_create_receipts WHERE operation_id=p_operation FOR UPDATE;
  IF r.actor_account_id<>p_actor THEN RAISE EXCEPTION 'TRIP_CREATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF r.trip_id<>p_trip OR r.request_payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'TRIP_CREATE_COLLISION' USING ERRCODE='23505'; END IF;
 ELSE
  INSERT INTO public.trips(id,name,destination,destinations,start_date,end_date,created_by)
  VALUES(p_trip,p_request->>'name',NULL,p_request->'destinations',(p_request->>'startDate')::date,(p_request->>'endDate')::date,p_actor);
  INSERT INTO public.trip_core_read_state(trip_id) VALUES(p_trip);
 END IF;
 RETURN public.trip_create_result(p_operation,p_actor);
END $$;
REVOKE ALL ON FUNCTION public.trip_create_command(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.trip_create_command(uuid,uuid,uuid,jsonb) TO otr_trip_create_gateway;

create or replace function public.trip_create_finite_scope_allowed(actor uuid,trip uuid,operation uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare gate public.trip_create_activation_gate%rowtype; principal record;instant timestamptz;owner_id oid;
begin
 if session_user<>'otr_trip_create_gateway' or current_user<>'postgres' or actor is null or operation is null then return false;end if;
 select oid into owner_id from pg_roles where rolname=current_user;
 select * into principal from pg_roles where rolname='otr_trip_create_gateway';
 if not found or not principal.rolcanlogin or principal.rolconnlimit<>1 or principal.rolvaliduntil is null
 or principal.rolsuper or principal.rolcreatedb or principal.rolcreaterole or principal.rolinherit or principal.rolbypassrls or principal.rolreplication
 or exists(select 1 from pg_auth_members m where (m.roleid=principal.oid or m.member=principal.oid) and not (m.roleid=principal.oid and m.member=owner_id and m.admin_option and not m.inherit_option and not m.set_option))
 or not exists(select 1 from pg_class c where c.oid='public.trip_create_activation_gate'::regclass and c.relowner=owner_id and c.relrowsecurity and not c.relforcerowsecurity)
 or exists(select 1 from pg_policy where polrelid='public.trip_create_activation_gate'::regclass)
 or exists(select 1 from pg_class c cross join lateral aclexplode(c.relacl) a where c.oid='public.trip_create_activation_gate'::regclass and (a.grantee<>owner_id or a.is_grantable))
 or exists(select 1 from pg_shdepend where refclassid='pg_authid'::regclass and refobjid=principal.oid and deptype='o')
 or exists(select 1 from pg_class c cross join lateral aclexplode(c.relacl) a where a.grantee=principal.oid)
 or exists(select 1 from pg_attribute c cross join lateral aclexplode(c.attacl) a where a.grantee=principal.oid)
 or exists(select 1 from pg_namespace n cross join lateral aclexplode(n.nspacl) a where a.grantee=principal.oid and (n.nspname<>'public' or a.privilege_type<>'USAGE' or a.is_grantable))
 or exists(select 1 from pg_database d cross join lateral aclexplode(d.datacl) a where a.grantee=principal.oid)
 or exists(select 1 from pg_tablespace t cross join lateral aclexplode(t.spcacl) a where a.grantee=principal.oid)
 or exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a where a.grantee=principal.oid and (a.privilege_type<>'EXECUTE' or a.is_grantable or p.oid not in (
  'public.trip_create_command(uuid,uuid,uuid,text,text,date,date)'::regprocedure,
  'public.trip_create_command(uuid,uuid,uuid,jsonb)'::regprocedure,
  'public.trip_create_result(uuid,uuid)'::regprocedure,
  'public.trip_core_finite_scope_allowed(uuid,uuid)'::regprocedure,
  'public.trip_create_finite_scope_allowed(uuid,uuid,uuid)'::regprocedure)))
 then return false;end if;
 select * into gate from public.trip_create_activation_gate where singleton for share;
 instant:=clock_timestamp();
 return coalesce(gate.enabled and actor=gate.actor_account_id and operation=gate.operation_id
  and (trip=gate.trip_id or trip is null)
  and instant>=gate.started_at and instant<gate.expires_at
  and principal.rolvaliduntil>instant and principal.rolvaliduntil<=gate.expires_at,false);
end $$;
COMMIT;
