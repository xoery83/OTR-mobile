BEGIN;SET LOCAL search_path=pg_catalog;DO $$BEGIN IF EXISTS(SELECT 1 FROM public.trip_create_activation_gate WHERE enabled) OR EXISTS(SELECT 1 FROM public.trip_metadata_activation_gate WHERE enabled) OR EXISTS(SELECT 1 FROM public.trip_core_activation_gate WHERE runtime_enabled) OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('otr_trip_create_gateway','otr_trip_metadata_gateway','otr_trip_core_v2_gateway') AND rolcanlogin) THEN RAISE EXCEPTION 'NORMAL_CLOSE_BEFORE_ROLLBACK';END IF;END$$;
DO $$BEGIN IF md5(pg_get_functiondef('public.trip_create_finite_scope_allowed(uuid,uuid,uuid)'::regprocedure))<>'2d21d537181bed1a22d6c1e12da2a9dd' THEN RAISE EXCEPTION 'NORMAL_ROLLBACK_POSTIMAGE_MISMATCH';END IF;END$$;
DO $$BEGIN IF md5(pg_get_functiondef('public.trip_metadata_finite_scope_allowed(uuid,uuid,uuid)'::regprocedure))<>'80f84ca26cf6bb72b4a8d5b34adc3939' THEN RAISE EXCEPTION 'NORMAL_ROLLBACK_POSTIMAGE_MISMATCH';END IF;END$$;
DO $$BEGIN IF md5(pg_get_functiondef('public.trip_core_finite_scope_allowed(uuid,uuid)'::regprocedure))<>'f9844571a9a461c465baf17936bad67b' THEN RAISE EXCEPTION 'NORMAL_ROLLBACK_POSTIMAGE_MISMATCH';END IF;END$$;
DO $$BEGIN IF md5(pg_get_functiondef('public.trip_core_guard_write()'::regprocedure))<>'8b99e7386ebc9042cc71e2877c540e9a' THEN RAISE EXCEPTION 'NORMAL_ROLLBACK_POSTIMAGE_MISMATCH';END IF;END$$;
DO $$BEGIN IF md5(pg_get_functiondef('public.trip_core_finite_read_state_guard()'::regprocedure))<>'0be5c6d268a541ae969de2de94c679ac' THEN RAISE EXCEPTION 'NORMAL_ROLLBACK_POSTIMAGE_MISMATCH';END IF;END$$;
DO $$BEGIN IF md5(pg_get_functiondef('public.trip_create_command(uuid,uuid,uuid,jsonb)'::regprocedure))<>'def60842ef3af2e3984468a12240593f' THEN RAISE EXCEPTION 'NORMAL_ROLLBACK_POSTIMAGE_MISMATCH';END IF;END$$;
DO $$BEGIN IF md5(pg_get_functiondef('public.trip_metadata_update_command(uuid,uuid,uuid,jsonb)'::regprocedure))<>'49e83a17d83a9c0243ddbeaa212c090f' THEN RAISE EXCEPTION 'NORMAL_ROLLBACK_POSTIMAGE_MISMATCH';END IF;END$$;
DO $$BEGIN IF md5(pg_get_functiondef('public.trip_normal_dev_scope_allowed(uuid,uuid,uuid,text)'::regprocedure))<>'d8177c5353c6d5a17c7278534f1dac0a' THEN RAISE EXCEPTION 'NORMAL_ROLLBACK_POSTIMAGE_MISMATCH';END IF;END$$;
CREATE OR REPLACE FUNCTION public.trip_create_finite_scope_allowed(actor uuid, trip uuid, operation uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
end $function$;
CREATE OR REPLACE FUNCTION public.trip_metadata_finite_scope_allowed(actor uuid, trip uuid, operation uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
end $function$;
CREATE OR REPLACE FUNCTION public.trip_core_finite_scope_allowed(actor uuid, trip uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare gate public.trip_core_activation_gate%rowtype; instant timestamptz;
begin
 -- ADMIN is trusted migration ownership, not a sandbox; unexpected edges fail closed.
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
end $function$;
CREATE OR REPLACE FUNCTION public.trip_core_guard_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$ declare old_json jsonb;new_json jsonb;actor uuid;trip uuid; begin
 if tg_op='TRUNCATE' then raise exception 'CORE_V2_PHYSICAL_DELETE_FORBIDDEN' using errcode='42501';end if;
 if tg_op='DELETE' then old_json:=to_jsonb(old);else new_json:=to_jsonb(new);end if;
 if tg_op='UPDATE' then old_json:=to_jsonb(old);end if;
 if session_user='otr_trip_core_v2_gateway' or current_user='otr_trip_core_v2_writer' then
  actor:=nullif(current_setting('otr.core.actor',true),'')::uuid;trip:=(coalesce(new_json,old_json)->>'trip_id')::uuid;
  if session_user<>'otr_trip_core_v2_gateway' or current_user<>'otr_trip_core_v2_writer'
   or trip is distinct from nullif(current_setting('otr.core.trip',true),'')::uuid
   or not public.trip_core_finite_scope_allowed(actor,trip)
   or current_setting('otr.core.command',true) is distinct from 'CREATE_ITEM'
   or current_setting('otr.core.admission',true) is distinct from 'MANUAL'
   or coalesce(current_setting('otr.core.family',true),'') not in ('P1','P3')
   or tg_op<>'INSERT' or tg_table_name not in ('itinerary_events','trip_activity_details','trip_stay_details','trip_stay_rooms','trip_item_participants','trip_item_visibility_people','trip_core_command_receipts')
   or tg_table_name='itinerary_events' and (new_json->>'business_contract_version' is distinct from '2' or new_json->>'experience_family' is distinct from current_setting('otr.core.family',true))
   or tg_table_name='trip_activity_details' and current_setting('otr.core.family',true)<>'P1'
   or tg_table_name in ('trip_stay_details','trip_stay_rooms') and current_setting('otr.core.family',true)<>'P3'
   or tg_table_name='trip_core_command_receipts' and new_json->>'actor_account_id' is distinct from actor::text
  then raise exception 'CORE_V2_CAPABILITY_CLOSED' using errcode='42501';end if;
 end if;
 if tg_table_name in ('itinerary_events','itinerary_reservations') and coalesce(old_json->>'business_contract_version',new_json->>'business_contract_version') is null then return coalesce(new,old);end if;
 if tg_table_name in ('itinerary_transport_endpoints','itinerary_transport_services') and coalesce(old_json->>'trip_id',new_json->>'trip_id') is null then return coalesce(new,old);end if;
 if current_user<>'otr_trip_core_v2_writer' or not exists(select 1 from public.trip_core_activation_gate where singleton and runtime_enabled) then raise exception 'CORE_V2_CAPABILITY_CLOSED' using errcode='42501';end if;
 actor:=nullif(current_setting('otr.core.actor',true),'')::uuid;trip:=(coalesce(new_json,old_json)->>'trip_id')::uuid;
 if not public.trip_core_actor_has_trip(actor,trip) then raise exception 'CORE_V2_NOT_VISIBLE' using errcode='42501';end if;
 if tg_op='DELETE' and tg_table_name in ('itinerary_events','itinerary_reservations','trip_entitlements','trip_operational_documents','trip_instruction_entries','trip_booking_observations','trip_core_command_receipts','trip_source_core_v2_candidates','trip_source_core_v2_intents','trip_source_core_v2_slots') then raise exception 'CORE_V2_PHYSICAL_DELETE_FORBIDDEN' using errcode='42501';end if;
 if tg_op='UPDATE' and (old_json->'id' is distinct from new_json->'id' or old_json->'trip_id' is distinct from new_json->'trip_id' or old_json->'owner_account_id' is distinct from new_json->'owner_account_id' or old_json->'created_at' is distinct from new_json->'created_at') then raise exception 'CORE_V2_IMMUTABLE_IDENTITY' using errcode='23514';end if;
 if tg_table_name='trip_core_command_receipts' and tg_op<>'INSERT' then raise exception 'CORE_V2_RECEIPT_IMMUTABLE' using errcode='23514';end if;
 if tg_table_name='trip_source_core_v2_candidates' and tg_op<>'INSERT' then raise exception 'CORE_V2_CANDIDATE_IMMUTABLE' using errcode='23514';end if;
 if tg_table_name='trip_instruction_entries' and tg_op='UPDATE' and (old_json-array['revision','visibility','hidden_at','updated_at','field_state']) is distinct from (new_json-array['revision','visibility','hidden_at','updated_at','field_state']) then raise exception 'CORE_V2_INSTRUCTION_IMMUTABLE' using errcode='23514';end if;
 if tg_table_name='itinerary_events' and tg_op<>'DELETE' and not public.trip_core_event_row_valid(new_json) then raise exception 'CORE_V2_INVALID_AGGREGATE' using errcode='23514';end if;
 return coalesce(new,old);
end $function$;
CREATE OR REPLACE FUNCTION public.trip_core_finite_read_state_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare actor uuid;trip uuid;operation uuid;
begin
 trip:=(to_jsonb(coalesce(new,old))->>'trip_id')::uuid;
 if session_user='otr_trip_core_v2_gateway' or current_user='otr_trip_core_v2_writer' then
  actor:=nullif(current_setting('otr.core.actor',true),'')::uuid;
  if current_user<>'otr_trip_core_v2_writer' or session_user<>'otr_trip_core_v2_gateway' or tg_op not in ('INSERT','UPDATE') or not public.trip_core_finite_scope_allowed(actor,trip)
   or trip is distinct from nullif(current_setting('otr.core.trip',true),'')::uuid
   or current_setting('otr.core.command',true) is distinct from 'CREATE_ITEM'
   or tg_op='INSERT' and not exists(select 1 from public.trip_core_read_state where trip_id=trip)
   or tg_op='UPDATE' and (new.epoch is distinct from old.epoch or new.access_revision is distinct from old.access_revision or new.revision<>old.revision+1) then raise exception 'CORE_V2_CAPABILITY_CLOSED' using errcode='42501';end if;
 elsif session_user='otr_trip_create_gateway' then
  select r.actor_account_id,r.operation_id into actor,operation from public.trip_create_receipts r join public.trips t on t.id=r.trip_id and t.created_by=r.actor_account_id where r.trip_id=trip for share of r;
  if tg_op<>'INSERT' or not public.trip_create_finite_scope_allowed(actor,trip,operation) then raise exception 'TRIP_CREATE_CAPABILITY_CLOSED' using errcode='55000';end if;
 end if;
 -- Existing privileged membership invalidation retains its current authority.
 return coalesce(new,old);
end $function$;
CREATE OR REPLACE FUNCTION public.trip_create_command(p_operation uuid, p_actor uuid, p_trip uuid, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
END $function$;
CREATE OR REPLACE FUNCTION public.trip_metadata_update_command(p_operation uuid, p_actor uuid, p_trip uuid, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
END $function$;
ALTER TABLE public.trip_core_activation_gate DROP CONSTRAINT finite_core_scope_contract, ADD CONSTRAINT finite_core_scope_contract CHECK ((((NOT runtime_enabled) AND (enabled_commands = '{}'::text[]) AND (enabled_families = '{}'::text[]) AND (enabled_admission_modes = '{}'::text[]) AND (scope_actor_account_id IS NULL) AND (scope_trip_id IS NULL) AND (scope_started_at IS NULL) AND (scope_expires_at IS NULL)) OR (runtime_enabled AND (enabled_commands = ARRAY['CREATE_ITEM'::text]) AND (enabled_families = ARRAY['P1'::text, 'P3'::text]) AND (enabled_admission_modes = ARRAY['MANUAL'::text]) AND (scope_actor_account_id IS NOT NULL) AND (scope_trip_id IS NOT NULL) AND (scope_started_at IS NOT NULL) AND (scope_expires_at IS NOT NULL) AND isfinite(scope_started_at) AND isfinite(scope_expires_at) AND (scope_expires_at > scope_started_at) AND (scope_expires_at <= (scope_started_at + '00:15:00'::interval)))));
ALTER TABLE public.trip_create_activation_gate DROP CONSTRAINT trip_create_gate_request_version, ADD CONSTRAINT trip_create_gate_request_version CHECK (((((NOT enabled) AND (actor_account_id IS NULL) AND (trip_id IS NULL) AND (operation_id IS NULL) AND (request_payload IS NULL) AND (started_at IS NULL) AND (expires_at IS NULL)) OR (enabled AND (actor_account_id IS NOT NULL) AND (trip_id IS NOT NULL) AND (operation_id IS NOT NULL) AND (jsonb_typeof(request_payload) = 'object'::text) AND ((request_payload ->> 'tripId'::text) = (trip_id)::text) AND ((((request_payload - ARRAY['tripId'::text, 'name'::text, 'destination'::text, 'startDate'::text, 'endDate'::text]) = '{}'::jsonb) AND (request_payload ?& ARRAY['tripId'::text, 'name'::text, 'destination'::text, 'startDate'::text, 'endDate'::text]) AND (octet_length((request_payload)::text) <= 2048)) OR (((request_payload -> 'formatVersion'::text) = '2'::jsonb) AND ((request_payload - ARRAY['formatVersion'::text, 'tripId'::text, 'name'::text, 'destination'::text, 'destinations'::text, 'startDate'::text, 'endDate'::text]) = '{}'::jsonb) AND (request_payload ?& ARRAY['formatVersion'::text, 'tripId'::text, 'name'::text, 'destination'::text, 'destinations'::text, 'startDate'::text, 'endDate'::text]) AND (octet_length((request_payload)::text) <= 131072))) AND (started_at IS NOT NULL) AND (expires_at IS NOT NULL) AND isfinite(started_at) AND isfinite(expires_at) AND (expires_at > started_at) AND (expires_at <= (started_at + '00:15:00'::interval)))) IS TRUE));
ALTER TABLE public.trip_metadata_activation_gate DROP CONSTRAINT trip_metadata_gate_request_version, ADD CONSTRAINT trip_metadata_gate_request_version CHECK (((((NOT enabled) AND (actor_account_id IS NULL) AND (trip_id IS NULL) AND (operation_id IS NULL) AND (request_payload IS NULL) AND (started_at IS NULL) AND (expires_at IS NULL)) OR (enabled AND (actor_account_id IS NOT NULL) AND (trip_id IS NOT NULL) AND (operation_id IS NOT NULL) AND (jsonb_typeof(request_payload) = 'object'::text) AND (request_payload ?& ARRAY['formatVersion'::text, 'operationId'::text, 'tripId'::text, 'before'::text, 'after'::text, 'expectedMetadataRevision'::text]) AND ((request_payload - ARRAY['formatVersion'::text, 'operationId'::text, 'tripId'::text, 'before'::text, 'after'::text, 'expectedMetadataRevision'::text]) = '{}'::jsonb) AND ((((request_payload -> 'formatVersion'::text) = '2'::jsonb) AND (octet_length((request_payload)::text) <= 8192)) OR (((request_payload -> 'formatVersion'::text) = '3'::jsonb) AND (octet_length((request_payload)::text) <= 262144))) AND ((request_payload ->> 'operationId'::text) = (operation_id)::text) AND ((request_payload ->> 'tripId'::text) = (trip_id)::text) AND (started_at IS NOT NULL) AND (expires_at IS NOT NULL) AND isfinite(started_at) AND isfinite(expires_at) AND (expires_at > started_at) AND (expires_at <= (started_at + '00:15:00'::interval)))) IS TRUE));
DROP FUNCTION public.trip_normal_dev_scope_allowed(uuid,uuid,uuid,text);COMMIT;