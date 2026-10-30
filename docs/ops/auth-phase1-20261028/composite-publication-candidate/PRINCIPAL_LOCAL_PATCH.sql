-- DISPOSABLE BASELINE ONLY. This is NOT a Hosted DEV execution packet.
BEGIN;
DO $$ BEGIN
 IF current_database() !~ '^otr_auth_composite_[a-f0-9]{12}$'
 OR current_setting('otr.auth.composite_fixture',true) IS DISTINCT FROM 'LOCAL_DISPOSABLE'
 THEN RAISE EXCEPTION 'AUTH_COMPOSITE_DISPOSABLE_FIXTURE_REQUIRED';END IF;
END $$;

DO $$ BEGIN IF md5(pg_get_functiondef('public.trip_sustained_dev_scope_allowed(uuid,uuid,uuid,text)'::regprocedure)) IS DISTINCT FROM '0f3b543bab2431ee35c519ad8ce01ea9' THEN RAISE EXCEPTION 'AUTH_COMPOSITE_EXACT_PREIMAGE_REQUIRED';END IF;END $$;
CREATE OR REPLACE FUNCTION public.trip_sustained_dev_scope_allowed(actor uuid, trip uuid, operation uuid, kind text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE principal record;policy record;r record;owner_id oid;
BEGIN
 IF otr_auth_guest_composite.has_scope() THEN RETURN otr_auth_guest_composite.scope_allowed(actor,trip,operation,kind);END IF;
 IF current_user<>'postgres' OR actor IS NULL OR kind IS NULL OR kind NOT IN ('CREATE','METADATA','CORE','CORE_P3','CORE_P4','CORE_P5','CORE_P6','CORE_P2','CORE_P2_DETAILS','PERSON') THEN RETURN false;END IF;
 IF session_user<>(CASE kind WHEN 'CREATE' THEN 'otr_trip_create_gateway' WHEN 'METADATA' THEN 'otr_trip_metadata_gateway' WHEN 'PERSON' THEN 'otr_trip_person_command_gateway' ELSE 'otr_trip_core_v2_gateway' END) THEN RETURN false;END IF;
 SELECT oid INTO owner_id FROM pg_roles WHERE rolname='postgres';
 SELECT * INTO principal FROM pg_roles WHERE rolname=session_user;
 IF NOT principal.rolcanlogin OR principal.rolconnlimit<>1 OR principal.rolvaliduntil IS NOT NULL AND principal.rolvaliduntil<>'infinity'::timestamptz
 OR principal.rolsuper OR principal.rolcreatedb OR principal.rolcreaterole OR principal.rolinherit OR principal.rolbypassrls OR principal.rolreplication
 OR EXISTS(SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=principal.oid AND deptype='o')
 OR EXISTS(SELECT 1 FROM pg_auth_members m WHERE (m.roleid=principal.oid OR m.member=principal.oid) AND NOT (
 (m.member=owner_id AND m.roleid=principal.oid AND m.admin_option AND NOT m.inherit_option)
 OR(kind='PERSON' AND m.member=owner_id AND m.roleid=principal.oid AND m.grantor=owner_id AND NOT m.admin_option AND NOT m.inherit_option AND NOT m.set_option
 AND EXISTS(SELECT 1 FROM pg_auth_members paired WHERE paired.roleid=m.roleid AND paired.member=m.member AND paired.grantor='supabase_admin'::regrole AND paired.admin_option AND NOT paired.inherit_option AND NOT paired.set_option))
 OR(kind IN ('CORE','CORE_P3','CORE_P4','CORE_P5','CORE_P6','CORE_P2','CORE_P2_DETAILS') AND m.member=principal.oid AND m.roleid='otr_trip_core_v2_writer'::regrole AND NOT m.admin_option AND NOT m.inherit_option AND m.set_option)))
 THEN RETURN false;END IF;
 SELECT * INTO policy FROM public.trip_sustained_dev_policy WHERE actor_account_id=actor FOR SHARE;
 IF FOUND AND (NOT policy.enabled OR policy.revoked_at IS NOT NULL) THEN RETURN false;END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=actor AND is_anonymous IS FALSE) THEN RETURN false;END IF;
 IF kind IN ('CORE','CORE_P3','CORE_P4','CORE_P5','CORE_P6','CORE_P2','CORE_P2_DETAILS') AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname='otr_trip_core_v2_writer' AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls OR rolreplication)) THEN RETURN false;END IF;
 IF trip IS NULL THEN
  IF operation IS NULL OR kind IN ('CORE','CORE_P3','CORE_P4','CORE_P5','CORE_P6','CORE_P2','CORE_P2_DETAILS','PERSON') THEN RETURN false;END IF;
  IF kind='CREATE' THEN SELECT actor_account_id,trip_id INTO r FROM public.trip_create_receipts WHERE operation_id=operation;
  ELSE SELECT actor_account_id,trip_id INTO r FROM public.trip_metadata_update_receipts WHERE operation_id=operation;END IF;
  IF NOT FOUND THEN RETURN true;END IF;
  IF r.actor_account_id<>actor THEN RETURN false;END IF;trip:=r.trip_id;
 END IF;
 IF kind='CREATE' AND NOT EXISTS(SELECT 1 FROM public.trips WHERE id=trip) THEN
  RETURN NOT EXISTS(SELECT 1 FROM public.trip_create_receipts WHERE operation_id=operation);
 END IF;
 RETURN EXISTS(SELECT 1 FROM public.trip_create_receipts receipt JOIN public.trips t ON t.id=receipt.trip_id AND t.created_by=receipt.actor_account_id
  WHERE receipt.actor_account_id=actor AND receipt.trip_id=trip AND receipt.request_payload->'formatVersion'='2'::jsonb)
 AND EXISTS(SELECT 1 FROM public.journey_members WHERE trip_id=trip AND user_id=actor AND status='linked' AND role='owner') AND (kind<>'CORE_P2_DETAILS' OR (
 EXISTS(SELECT 1 FROM public.itinerary_events event JOIN public.trip_flight_intents flight ON flight.event_id=event.id AND flight.trip_id=event.trip_id
 WHERE event.id=nullif(current_setting('otr.core.target_item',true),'')::uuid AND event.trip_id=trip AND event.owner_account_id=actor AND event.experience_family='P2' AND flight.qualification='SPARSE' AND NOT EXISTS(SELECT 1 FROM public.trip_booking_item_links link WHERE link.trip_id=trip AND link.item_id=event.id AND link.active) AND NOT EXISTS(SELECT 1 FROM public.itinerary_transport_services service WHERE service.trip_id=trip AND service.event_id=event.id))
 AND EXISTS(SELECT 1 FROM public.trip_core_command_receipts rr
 WHERE rr.actor_account_id=actor AND rr.trip_id=trip AND rr.outcome IN ('APPLIED','NO_CHANGE')
 AND rr.command_version=2 AND rr.intent_version=2 AND rr.receipt_version=2
 AND rr.canonical_intent_text::jsonb->>'command'='CREATE_SPARSE_FLIGHT'
 AND rr.canonical_intent_text::jsonb->>'contractVersion'='2' AND rr.canonical_intent_text::jsonb->>'intentVersion'='2'
 AND rr.canonical_intent_text::jsonb->>'tripId'=trip::text AND rr.canonical_intent_text::jsonb->>'operationId'=rr.operation_id::text
 AND rr.canonical_intent_text::jsonb#>>'{target,kind}'='ITEM'
 AND rr.canonical_intent_text::jsonb#>>'{target,id}'=current_setting('otr.core.target_item',true)
 AND rr.canonical_intent_text::jsonb#>>'{admission,mode}'='MANUAL'
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(rr.canonical_intent_text::jsonb->'baseVector') v WHERE v->>'kind'='ITEM' AND v->>'id'=current_setting('otr.core.target_item',true) AND v->'revision' IS NOT DISTINCT FROM 'null'::jsonb)
 AND rr.canonical_intent_text::jsonb#>'{admission,sourceIntentId}' IS NOT DISTINCT FROM 'null'::jsonb
 AND rr.canonical_intent_text::jsonb#>'{admission,policyVersion}' IS NOT DISTINCT FROM 'null'::jsonb
 AND rr.intent_sha256=encode(sha256(convert_to('otr-trip-core-intent-v2'||E'\n'||rr.canonical_intent_text,'UTF8')),'hex')
 AND rr.body->>'actorAccountId'=actor::text AND rr.body->>'tripId'=trip::text AND rr.body->>'operationId'=rr.operation_id::text
 AND rr.body->>'command'='CREATE_SPARSE_FLIGHT' AND rr.body->>'intentSha256'=rr.intent_sha256 AND rr.body->>'receiptSha256'=rr.receipt_sha256 AND rr.body->>'outcome'=rr.outcome
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(rr.body#>'{result,created}') v WHERE v->>'kind'='ITEM' AND v->>'id'=current_setting('otr.core.target_item',true))
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(rr.body->'targetVector') v WHERE v->>'kind'='ITEM' AND v->>'id'=current_setting('otr.core.target_item',true) AND v->>'committedRevision'='1')
 )));
END $function$
;
DO $$ BEGIN IF md5(pg_get_functiondef('public.trip_create_finite_scope_allowed(uuid,uuid,uuid)'::regprocedure)) IS DISTINCT FROM 'e1f0b43c3e064797cf30f6529c9dd259' THEN RAISE EXCEPTION 'AUTH_COMPOSITE_EXACT_PREIMAGE_REQUIRED';END IF;END $$;
CREATE OR REPLACE FUNCTION public.trip_create_finite_scope_allowed(actor uuid, trip uuid, operation uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare gate public.trip_create_activation_gate%rowtype; principal record;instant timestamptz;owner_id oid;
begin
 IF otr_auth_guest_composite.has_scope() THEN RETURN otr_auth_guest_composite.scope_allowed(actor,trip,operation,'CREATE');END IF;
 if public.trip_sustained_dev_scope_allowed(actor,trip,operation,'CREATE') then return true;end if;
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
end $function$
;
DO $$ BEGIN IF md5(pg_get_functiondef('public.trip_metadata_finite_scope_allowed(uuid,uuid,uuid)'::regprocedure)) IS DISTINCT FROM '7588f600f62851a31fbc34aad99efda0' THEN RAISE EXCEPTION 'AUTH_COMPOSITE_EXACT_PREIMAGE_REQUIRED';END IF;END $$;
CREATE OR REPLACE FUNCTION public.trip_metadata_finite_scope_allowed(actor uuid, trip uuid, operation uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare gate public.trip_metadata_activation_gate%rowtype; principal record;instant timestamptz;owner_id oid;
begin
 IF otr_auth_guest_composite.has_scope() THEN RETURN otr_auth_guest_composite.scope_allowed(actor,trip,operation,'METADATA');END IF;
 if public.trip_sustained_dev_scope_allowed(actor,trip,operation,'METADATA') then return true;end if;
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
end $function$
;
DO $$ BEGIN IF md5(pg_get_functiondef('public.trip_core_finite_scope_allowed(uuid,uuid)'::regprocedure)) IS DISTINCT FROM '2944bd81f8bd72bbe7ecf2c94044cc34' THEN RAISE EXCEPTION 'AUTH_COMPOSITE_EXACT_PREIMAGE_REQUIRED';END IF;END $$;
CREATE OR REPLACE FUNCTION public.trip_core_finite_scope_allowed(actor uuid, trip uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare gate public.trip_core_activation_gate%rowtype; instant timestamptz;
begin
 IF otr_auth_guest_composite.has_scope() THEN RETURN otr_auth_guest_composite.scope_allowed(actor,trip,null,'CORE');END IF;
 if public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE') then return true;end if; -- ADMIN is trusted migration ownership, not a sandbox; unexpected edges fail closed.
 if exists(select 1 from pg_roles where rolname in ('otr_trip_core_v2_gateway','otr_trip_core_v2_writer','otr_trip_create_gateway') and (rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or rolinherit or rolbypassrls or rolreplication))
 or (select count(*) from pg_roles where rolname in ('otr_trip_core_v2_gateway','otr_trip_core_v2_writer','otr_trip_create_gateway'))<>3
 or exists(select 1 from pg_auth_members m where (m.roleid in ('otr_trip_core_v2_gateway'::regrole,'otr_trip_core_v2_writer'::regrole,'otr_trip_create_gateway'::regrole) or m.member in ('otr_trip_core_v2_gateway'::regrole,'otr_trip_core_v2_writer'::regrole,'otr_trip_create_gateway'::regrole)) and not (
  (m.member=current_user::regrole and m.roleid in ('otr_trip_core_v2_gateway'::regrole,'otr_trip_core_v2_writer'::regrole,'otr_trip_create_gateway'::regrole) and m.admin_option and not m.inherit_option and not m.set_option)
  or (m.roleid='otr_trip_core_v2_writer'::regrole and m.member='otr_trip_core_v2_gateway'::regrole and not m.admin_option and not m.inherit_option and m.set_option))) then return false;end if;
 if session_user not in ('otr_trip_core_v2_gateway','otr_trip_create_gateway') or actor is null then return false;end if;
 select * into gate from public.trip_core_activation_gate where singleton for share;
 instant:=clock_timestamp();
 return coalesce(gate.runtime_enabled and actor=gate.scope_actor_account_id
  and (trip=gate.scope_trip_id or trip is null and session_user='otr_trip_create_gateway')
  and instant>=gate.scope_started_at and instant<gate.scope_expires_at,false);
end $function$
;
DO $$ BEGIN IF md5(pg_get_functiondef('public.trip_create_command(uuid,uuid,uuid,jsonb)'::regprocedure)) IS DISTINCT FROM '4322d84a62bbc6d05f0c15d17e37c29d' THEN RAISE EXCEPTION 'AUTH_COMPOSITE_EXACT_PREIMAGE_REQUIRED';END IF;END $$;
CREATE OR REPLACE FUNCTION public.trip_create_command(p_operation uuid, p_actor uuid, p_trip uuid, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE payload jsonb;inserted uuid;r record;v jsonb;
BEGIN
 IF session_user='otr_trip_core_v2_gateway' THEN PERFORM otr_auth_guest_composite.enter_operation(p_actor,p_trip,p_operation,'CREATE',p_request);END IF;
 IF session_user<>'otr_trip_create_gateway' AND NOT otr_auth_guest_composite.scope_allowed(p_actor,p_trip,p_operation,'CREATE') THEN RAISE EXCEPTION 'TRIP_CREATE_PRINCIPAL_REQUIRED' USING ERRCODE='42501'; END IF;
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
 IF NOT public.trip_sustained_dev_scope_allowed(p_actor,p_trip,p_operation,'CREATE') AND payload IS DISTINCT FROM (SELECT request_payload FROM public.trip_create_activation_gate WHERE singleton) THEN RAISE EXCEPTION 'TRIP_CREATE_COLLISION' USING ERRCODE='23505'; END IF;
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
END $function$
;
DO $$ BEGIN IF md5(pg_get_functiondef('public.trip_create_result(uuid,uuid)'::regprocedure)) IS DISTINCT FROM '50e31c3bb0b9b385e8cf764eba5c59fa' THEN RAISE EXCEPTION 'AUTH_COMPOSITE_EXACT_PREIMAGE_REQUIRED';END IF;END $$;
CREATE OR REPLACE FUNCTION public.trip_create_result(p_operation uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$ declare r record;t record;p record;s record;begin
 if session_user<>'otr_trip_create_gateway' AND NOT otr_auth_guest_composite.scope_allowed(p_actor,null,p_operation,'CREATE') then raise exception 'TRIP_CREATE_PRINCIPAL_UNAVAILABLE' using errcode='42501';end if;
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
end $function$
;
DO $$ BEGIN IF md5(pg_get_functiondef('public.trip_metadata_update_command(uuid,uuid,uuid,jsonb)'::regprocedure)) IS DISTINCT FROM '8d9d9397b645847198be42cca5484f61' THEN RAISE EXCEPTION 'AUTH_COMPOSITE_EXACT_PREIMAGE_REQUIRED';END IF;END $$;
CREATE OR REPLACE FUNCTION public.trip_metadata_update_command(p_operation uuid, p_actor uuid, p_trip uuid, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE t record;r public.trip_metadata_update_receipts%rowtype;member_id uuid;side text;v jsonb;expected bigint;actual bigint;result jsonb;
BEGIN
 IF session_user='otr_trip_core_v2_gateway' THEN PERFORM otr_auth_guest_composite.enter_operation(p_actor,p_trip,p_operation,'METADATA',p_request);END IF;
 IF session_user<>'otr_trip_metadata_gateway' AND NOT otr_auth_guest_composite.scope_allowed(p_actor,p_trip,p_operation,'METADATA') THEN RAISE EXCEPTION 'METADATA_PRINCIPAL_REQUIRED' USING ERRCODE='42501'; END IF;
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
 IF NOT (p_request->'formatVersion'='3'::jsonb AND public.trip_sustained_dev_scope_allowed(p_actor,p_trip,p_operation,'METADATA')) AND p_request IS DISTINCT FROM (SELECT request_payload FROM public.trip_metadata_activation_gate WHERE singleton) THEN RAISE EXCEPTION 'METADATA_OPERATION_COLLISION' USING ERRCODE='23505'; END IF;
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
END $function$
;
DO $$ BEGIN IF md5(pg_get_functiondef('public.trip_metadata_snapshot(uuid,uuid,uuid)'::regprocedure)) IS DISTINCT FROM '4bb7e25ff9ef1077ecd5cf955bebb331' THEN RAISE EXCEPTION 'AUTH_COMPOSITE_EXACT_PREIMAGE_REQUIRED';END IF;END $$;
CREATE OR REPLACE FUNCTION public.trip_metadata_snapshot(p_actor uuid, p_trip uuid, p_operation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE t record;member_id uuid;result jsonb;
BEGIN
 IF session_user<>'otr_trip_metadata_gateway' AND NOT otr_auth_guest_composite.scope_allowed(p_actor,p_trip,p_operation,'METADATA') THEN RAISE EXCEPTION 'METADATA_PRINCIPAL_REQUIRED' USING ERRCODE='42501'; END IF;
 IF NOT public.trip_metadata_finite_scope_allowed(p_actor,p_trip,p_operation) THEN RAISE EXCEPTION 'METADATA_CLOSED' USING ERRCODE='55000'; END IF;
 SELECT * INTO t FROM public.trips WHERE id=p_trip FOR SHARE;
 IF NOT FOUND OR t.created_by IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'METADATA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT id INTO member_id FROM public.journey_members WHERE trip_id=p_trip AND user_id=p_actor AND status='linked' AND role='owner' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'METADATA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 result:=jsonb_build_object('formatVersion',CASE WHEN t.destinations IS NULL THEN 2 ELSE 3 END,'actorAccountId',p_actor,'tripId',p_trip,'metadataRevision',t.metadata_revision,
 'metadata',jsonb_build_object('name',t.name,'destination',t.destination,'startDate',t.start_date,'endDate',t.end_date)||CASE WHEN t.destinations IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('destinations',t.destinations) END);
 IF NOT public.trip_metadata_finite_scope_allowed(p_actor,p_trip,p_operation) THEN RAISE EXCEPTION 'METADATA_CLOSED' USING ERRCODE='55000'; END IF;
 RETURN result;
END $function$
;
DO $$ BEGIN IF md5(pg_get_functiondef('public.trip_metadata_update_result(uuid,uuid)'::regprocedure)) IS DISTINCT FROM 'df4d8ff6fab2e7313d925b10bab1cff3' THEN RAISE EXCEPTION 'AUTH_COMPOSITE_EXACT_PREIMAGE_REQUIRED';END IF;END $$;
CREATE OR REPLACE FUNCTION public.trip_metadata_update_result(p_operation uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE r public.trip_metadata_update_receipts%rowtype;t record;member_id uuid;
BEGIN
 IF session_user<>'otr_trip_metadata_gateway' AND NOT otr_auth_guest_composite.scope_allowed(p_actor,null,p_operation,'METADATA') THEN RAISE EXCEPTION 'METADATA_PRINCIPAL_REQUIRED' USING ERRCODE='42501'; END IF;
 IF NOT public.trip_metadata_finite_scope_allowed(p_actor,NULL,p_operation) THEN RAISE EXCEPTION 'METADATA_CLOSED' USING ERRCODE='55000'; END IF;
 SELECT * INTO r FROM public.trip_metadata_update_receipts WHERE operation_id=p_operation FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF r.actor_account_id<>p_actor THEN RAISE EXCEPTION 'METADATA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT public.trip_metadata_finite_scope_allowed(p_actor,r.trip_id,p_operation) THEN RAISE EXCEPTION 'METADATA_CLOSED' USING ERRCODE='55000'; END IF;
 SELECT * INTO t FROM public.trips WHERE id=r.trip_id FOR SHARE;
 IF NOT FOUND OR t.created_by IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'METADATA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT id INTO member_id FROM public.journey_members WHERE trip_id=r.trip_id AND user_id=p_actor AND status='linked' AND role='owner' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'METADATA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT otr_auth_guest_composite.scope_allowed(p_actor,r.trip_id,p_operation,'METADATA') AND r.request_payload IS DISTINCT FROM (SELECT request_payload FROM public.trip_metadata_activation_gate WHERE singleton) THEN RAISE EXCEPTION 'METADATA_OPERATION_COLLISION' USING ERRCODE='23505'; END IF;
 IF NOT public.trip_metadata_finite_scope_allowed(p_actor,r.trip_id,p_operation) THEN RAISE EXCEPTION 'METADATA_CLOSED' USING ERRCODE='55000'; END IF;
 RETURN r.result_payload;
END $function$
;
DO $$ BEGIN IF md5(pg_get_functiondef('public.trip_person_cloud_create_command(uuid,uuid,uuid,jsonb)'::regprocedure)) IS DISTINCT FROM 'c7bfbffe0e2bdcb6acb365db34d576d5' THEN RAISE EXCEPTION 'AUTH_COMPOSITE_EXACT_PREIMAGE_REQUIRED';END IF;END $$;
CREATE OR REPLACE FUNCTION public.trip_person_cloud_create_command(actor uuid, trip uuid, operation uuid, request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE r record;person uuid;name text;instant timestamptz;result jsonb;create_operation uuid;
BEGIN
 IF session_user='otr_trip_core_v2_gateway' THEN PERFORM otr_auth_guest_composite.enter_operation(actor,trip,operation,'PERSON',request);END IF;
 IF actor IS NULL OR trip IS NULL OR operation IS NULL OR (session_user<>'otr_trip_person_command_gateway' AND NOT otr_auth_guest_composite.scope_allowed(actor,trip,operation,'PERSON')) OR NOT public.trip_sustained_dev_scope_allowed(actor,trip,operation,'PERSON') THEN RAISE EXCEPTION 'PERSON_CREATE_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF request IS NULL OR jsonb_typeof(request)<>'object' OR request-ARRAY['version','operationId','tripId','personId','tripCreateOperationId','dataOwnership','displayName']<>'{}'::jsonb
 OR NOT request ?& ARRAY['version','operationId','tripId','personId','tripCreateOperationId','dataOwnership','displayName'] OR request->'version' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(request->'version') IS DISTINCT FROM 'number' OR request->>'dataOwnership' IS DISTINCT FROM 'CLOUD_SHARED_AUTHORED' OR jsonb_typeof(request->'dataOwnership') IS DISTINCT FROM 'string'
 OR octet_length(request::text)>8192 OR request->>'tripId' IS DISTINCT FROM trip::text OR request->>'operationId' IS DISTINCT FROM operation::text
 OR jsonb_typeof(request->'tripId') IS DISTINCT FROM 'string' OR jsonb_typeof(request->'operationId') IS DISTINCT FROM 'string'
 OR jsonb_typeof(request->'personId') IS DISTINCT FROM 'string' OR jsonb_typeof(request->'tripCreateOperationId') IS DISTINCT FROM 'string'
 OR jsonb_typeof(request->'displayName') IS DISTINCT FROM 'string' OR char_length(request->>'displayName') NOT BETWEEN 1 AND 256 OR request->>'displayName'<>btrim(request->>'displayName')
 THEN RAISE EXCEPTION 'PERSON_CREATE_INVALID' USING ERRCODE='22023';END IF;
 person:=(request->>'personId')::uuid;name:=request->>'displayName';create_operation:=(request->>'tripCreateOperationId')::uuid;
 IF person IS NULL OR create_operation IS NULL OR NOT EXISTS(SELECT 1 FROM public.trip_create_receipts WHERE operation_id=create_operation AND actor_account_id=actor AND trip_id=trip AND request_payload->'formatVersion'='2'::jsonb) THEN RAISE EXCEPTION 'PERSON_CREATE_BINDING' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('otr-person-create:'||operation::text,0));
 PERFORM 1 FROM public.trips WHERE id=trip FOR UPDATE;
 SELECT * INTO r FROM public.trip_person_create_receipts WHERE operation_id=operation;
 IF FOUND THEN
  IF r.actor_account_id<>actor OR r.trip_id<>trip OR r.person_id<>person OR r.request_payload IS DISTINCT FROM request THEN RAISE EXCEPTION 'PERSON_CREATE_COLLISION' USING ERRCODE='23505';END IF;RETURN r.result_payload;
 END IF;
 IF EXISTS(SELECT 1 FROM public.journey_members WHERE id=person) OR EXISTS(SELECT 1 FROM public.trip_person_create_receipts WHERE person_id=person)
 OR EXISTS(SELECT 1 FROM public.trip_create_receipts WHERE operation_id=operation) OR EXISTS(SELECT 1 FROM public.trip_metadata_update_receipts WHERE operation_id=operation) OR EXISTS(SELECT 1 FROM public.trip_core_command_receipts WHERE operation_id=operation AND actor_account_id=actor)
 THEN RAISE EXCEPTION 'PERSON_CREATE_COLLISION' USING ERRCODE='23505';END IF;
 instant:=clock_timestamp();
 INSERT INTO public.journey_members(id,trip_id,user_id,display_name,role,status,participation_active,participation_revision,created_at,updated_at)
 VALUES(person,trip,NULL,name,'group_member','unlinked',true,0,instant,instant);
 -- Existing privileged Person/roster invalidation authority: no Core item mutation or synthetic certificate.
 UPDATE public.trip_core_read_state SET revision=revision+1,access_revision=access_revision+1 WHERE trip_id=trip;
 result:=jsonb_build_object('receiptVersion',1,'actorAccountId',actor,'request',request,'person',jsonb_build_object('personId',person,'tripId',trip,'displayName',name,'status','unlinked','userId',null,'participationActive',true,'participationRevision',0),'acceptedAt',instant);
 INSERT INTO public.trip_person_create_receipts(operation_id,actor_account_id,trip_id,person_id,request_payload,result_payload,accepted_at) VALUES(operation,actor,trip,person,request,result,instant);
 IF NOT public.trip_sustained_dev_scope_allowed(actor,trip,operation,'PERSON') THEN RAISE EXCEPTION 'PERSON_CREATE_FORBIDDEN' USING ERRCODE='42501';END IF;
 RETURN result;
END $function$
;
DO $$ BEGIN IF md5(pg_get_functiondef('public.trip_person_cloud_create_result(uuid,uuid,uuid)'::regprocedure)) IS DISTINCT FROM '300baf9749d32863eb92b76d8fc9a17f' THEN RAISE EXCEPTION 'AUTH_COMPOSITE_EXACT_PREIMAGE_REQUIRED';END IF;END $$;
CREATE OR REPLACE FUNCTION public.trip_person_cloud_create_result(actor uuid, trip uuid, operation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$DECLARE r record;p record;BEGIN
 IF actor IS NULL OR trip IS NULL OR operation IS NULL OR (session_user<>'otr_trip_person_command_gateway' AND NOT otr_auth_guest_composite.scope_allowed(actor,trip,operation,'PERSON')) OR NOT public.trip_sustained_dev_scope_allowed(actor,trip,operation,'PERSON') THEN RAISE EXCEPTION 'PERSON_CREATE_FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT * INTO r FROM public.trip_person_create_receipts WHERE operation_id=operation AND actor_account_id=actor AND trip_id=trip FOR SHARE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO p FROM public.journey_members WHERE id=r.person_id AND trip_id=trip FOR SHARE;
 IF NOT FOUND OR p.user_id IS NOT NULL OR p.status<>'unlinked' OR p.display_name IS DISTINCT FROM r.request_payload->>'displayName' OR NOT p.participation_active OR p.participation_revision<>0 THEN RAISE EXCEPTION 'PERSON_CURRENT_READBACK_UNAVAILABLE' USING ERRCODE='55000';END IF;
 IF NOT public.trip_sustained_dev_scope_allowed(actor,trip,operation,'PERSON') THEN RAISE EXCEPTION 'PERSON_CREATE_FORBIDDEN' USING ERRCODE='42501';END IF;RETURN r.result_payload;
END $function$
;
DO $$ BEGIN IF md5(pg_get_functiondef('public.trip_person_create_receipt_guard()'::regprocedure)) IS DISTINCT FROM '1d5ed7d68c5477647a624514a19ee847' THEN RAISE EXCEPTION 'AUTH_COMPOSITE_EXACT_PREIMAGE_REQUIRED';END IF;END $$;
CREATE OR REPLACE FUNCTION public.trip_person_create_receipt_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$BEGIN
 IF TG_OP<>'INSERT' OR current_user<>'postgres' OR (session_user<>'otr_trip_person_command_gateway' AND NOT otr_auth_guest_composite.scope_allowed(NEW.actor_account_id,NEW.trip_id,NEW.operation_id,'PERSON')) THEN RAISE EXCEPTION 'PERSON_CREATE_RECEIPT_IMMUTABLE' USING ERRCODE='42501';END IF;RETURN NEW;
END $function$
;
DO $$ BEGIN IF md5(pg_get_functiondef('public.trip_core_finite_read_state_guard()'::regprocedure)) IS DISTINCT FROM 'fa773459d8159bb512f0177399373ba1' THEN RAISE EXCEPTION 'AUTH_COMPOSITE_EXACT_PREIMAGE_REQUIRED';END IF;END $$;
CREATE OR REPLACE FUNCTION public.trip_core_finite_read_state_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare actor uuid;trip uuid;operation uuid;
begin
 trip:=(to_jsonb(coalesce(new,old))->>'trip_id')::uuid;
 IF current_user='postgres' AND session_user='otr_trip_core_v2_gateway' THEN
  IF TG_OP='INSERT' AND otr_auth_guest_composite.read_state_allowed(trip,'CREATE')
  AND NEW.revision=1 AND NEW.access_revision=1 THEN RETURN NEW;END IF;
  IF TG_OP='UPDATE' AND otr_auth_guest_composite.read_state_allowed(trip,'PERSON')
  AND NEW.epoch IS NOT DISTINCT FROM OLD.epoch AND NEW.revision=OLD.revision+1
  AND NEW.access_revision=OLD.access_revision+1 THEN RETURN NEW;END IF;
 END IF;

 if session_user='otr_trip_core_v2_gateway' or current_user='otr_trip_core_v2_writer' then
  actor:=nullif(current_setting('otr.core.actor',true),'')::uuid;
  if current_user<>'otr_trip_core_v2_writer' or session_user<>'otr_trip_core_v2_gateway' or tg_op not in ('INSERT','UPDATE') or not public.trip_core_finite_scope_allowed(actor,trip)
   or trip is distinct from nullif(current_setting('otr.core.trip',true),'')::uuid
   or (current_setting('otr.core.command',true) is distinct from 'CREATE_ITEM' and not (public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE') and current_setting('otr.core.command',true) in ('SET_ITEM_TEXT','SET_ITEM_SCHEDULE','SET_ITEM_PLACE','SET_ITEM_PARTICIPATION')))
   or tg_op='INSERT' and not exists(select 1 from public.trip_core_read_state where trip_id=trip)
   or tg_op='UPDATE' and (new.epoch is distinct from old.epoch or new.access_revision is distinct from old.access_revision or new.revision<>old.revision+1) then raise exception 'CORE_V2_CAPABILITY_CLOSED' using errcode='42501';end if;
 elsif session_user='otr_trip_create_gateway' then
  select r.actor_account_id,r.operation_id into actor,operation from public.trip_create_receipts r join public.trips t on t.id=r.trip_id and t.created_by=r.actor_account_id where r.trip_id=trip for share of r;
  if tg_op<>'INSERT' or not public.trip_create_finite_scope_allowed(actor,trip,operation) then raise exception 'TRIP_CREATE_CAPABILITY_CLOSED' using errcode='55000';end if;
 end if;
 -- Existing privileged membership invalidation retains its current authority.
 return coalesce(new,old);
end $function$
;
GRANT EXECUTE ON FUNCTION public.trip_create_finite_scope_allowed(uuid,uuid,uuid),public.trip_metadata_finite_scope_allowed(uuid,uuid,uuid),public.trip_core_finite_scope_allowed(uuid,uuid),public.trip_create_command(uuid,uuid,uuid,jsonb),public.trip_create_result(uuid,uuid),public.trip_metadata_update_command(uuid,uuid,uuid,jsonb),public.trip_metadata_snapshot(uuid,uuid,uuid),public.trip_metadata_update_result(uuid,uuid),public.trip_person_cloud_create_command(uuid,uuid,uuid,jsonb),public.trip_person_cloud_create_result(uuid,uuid,uuid) TO otr_trip_core_v2_gateway;
COMMIT;