-- Candidate only. Owning Person create, not Account linking, invitation or participation lifecycle.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
DO $$BEGIN
 IF md5(pg_get_functiondef('public.trip_sustained_dev_scope_allowed(uuid,uuid,uuid,text)'::regprocedure))<>'54d94b8e00ee7228cfe2d38085475089' THEN RAISE EXCEPTION 'PERSON_SCOPE_PARENT_PREIMAGE_MISMATCH';END IF;
 IF current_user<>'postgres' OR to_regclass('public.trip_sustained_dev_policy') IS NULL OR EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE enabled)
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('otr_trip_create_gateway','otr_trip_metadata_gateway','otr_trip_core_v2_gateway','otr_trip_person_command_gateway') AND rolcanlogin)
 OR EXISTS(SELECT 1 FROM public.trip_person_command_gate WHERE enabled)
 THEN RAISE EXCEPTION 'PERSON_CREATE_REQUIRES_CLOSED_PARENT';END IF;
END $$;
CREATE TABLE public.trip_person_create_receipts (
 operation_id uuid PRIMARY KEY,actor_account_id uuid NOT NULL,trip_id uuid NOT NULL,person_id uuid NOT NULL UNIQUE,
 request_payload jsonb NOT NULL CHECK(jsonb_typeof(request_payload)='object'),
 result_payload jsonb NOT NULL CHECK(jsonb_typeof(result_payload)='object'),
 accepted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.trip_person_create_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trip_person_create_receipts FROM PUBLIC,anon,authenticated,service_role,otr_trip_person_command_gateway,otr_trip_person_lifecycle_writer,otr_trip_person_receipt_reader;
CREATE FUNCTION public.trip_person_create_receipt_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$BEGIN
 IF TG_OP<>'INSERT' OR current_user<>'postgres' OR session_user<>'otr_trip_person_command_gateway' THEN RAISE EXCEPTION 'PERSON_CREATE_RECEIPT_IMMUTABLE' USING ERRCODE='42501';END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.trip_person_create_receipt_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER trip_person_create_receipt_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.trip_person_create_receipts FOR EACH ROW EXECUTE FUNCTION public.trip_person_create_receipt_guard();
CREATE TRIGGER trip_person_create_receipt_no_truncate BEFORE TRUNCATE ON public.trip_person_create_receipts FOR EACH STATEMENT EXECUTE FUNCTION public.trip_person_create_receipt_guard();
CREATE FUNCTION public.trip_person_cloud_create_command(actor uuid,trip uuid,operation uuid,request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r record;person uuid;name text;instant timestamptz;result jsonb;create_operation uuid;
BEGIN
 IF actor IS NULL OR trip IS NULL OR operation IS NULL OR session_user<>'otr_trip_person_command_gateway' OR NOT public.trip_sustained_dev_scope_allowed(actor,trip,operation,'PERSON') THEN RAISE EXCEPTION 'PERSON_CREATE_FORBIDDEN' USING ERRCODE='42501';END IF;
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
END $$;
CREATE FUNCTION public.trip_person_cloud_create_result(actor uuid,trip uuid,operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE r record;p record;BEGIN
 IF actor IS NULL OR trip IS NULL OR operation IS NULL OR session_user<>'otr_trip_person_command_gateway' OR NOT public.trip_sustained_dev_scope_allowed(actor,trip,operation,'PERSON') THEN RAISE EXCEPTION 'PERSON_CREATE_FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT * INTO r FROM public.trip_person_create_receipts WHERE operation_id=operation AND actor_account_id=actor AND trip_id=trip FOR SHARE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO p FROM public.journey_members WHERE id=r.person_id AND trip_id=trip FOR SHARE;
 IF NOT FOUND OR p.user_id IS NOT NULL OR p.status<>'unlinked' OR p.display_name IS DISTINCT FROM r.request_payload->>'displayName' OR NOT p.participation_active OR p.participation_revision<>0 THEN RAISE EXCEPTION 'PERSON_CURRENT_READBACK_UNAVAILABLE' USING ERRCODE='55000';END IF;
 IF NOT public.trip_sustained_dev_scope_allowed(actor,trip,operation,'PERSON') THEN RAISE EXCEPTION 'PERSON_CREATE_FORBIDDEN' USING ERRCODE='42501';END IF;RETURN r.result_payload;
END $$;
REVOKE ALL ON FUNCTION public.trip_person_cloud_create_command(uuid,uuid,uuid,jsonb),public.trip_person_cloud_create_result(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,otr_trip_person_lifecycle_writer,otr_trip_person_receipt_reader;
GRANT EXECUTE ON FUNCTION public.trip_person_cloud_create_command(uuid,uuid,uuid,jsonb),public.trip_person_cloud_create_result(uuid,uuid,uuid) TO otr_trip_person_command_gateway;
COMMIT;
