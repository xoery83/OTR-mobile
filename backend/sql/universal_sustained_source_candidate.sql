-- Stage II dormant candidate. No automatic migration or activation.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.trip_sustained_dev_policy ADD COLUMN universal_import_enabled boolean NOT NULL DEFAULT false;
-- One existing adoption policy. This helper only authorizes the protected Source
-- and Meter principals; normal Trip/Core permission never implies Universal.
CREATE FUNCTION public.trip_sustained_universal_allowed(actor uuid,trip uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p record;principal record;writer text;
BEGIN
 IF current_user<>'postgres' OR actor IS NULL OR trip IS NULL OR session_user NOT IN ('otr_trip_source_command_gateway','otr_external_integration_call_gateway') THEN RETURN false;END IF;
 SELECT * INTO principal FROM pg_roles WHERE rolname=session_user;
 writer:=CASE session_user WHEN 'otr_trip_source_command_gateway' THEN 'otr_trip_source_writer' ELSE 'otr_external_integration_meter_writer' END;
 IF NOT principal.rolcanlogin OR principal.rolconnlimit<>1 OR principal.rolvaliduntil IS NOT NULL AND principal.rolvaliduntil<>'infinity'::timestamptz
 OR principal.rolsuper OR principal.rolcreatedb OR principal.rolcreaterole OR principal.rolinherit OR principal.rolbypassrls OR principal.rolreplication
 OR EXISTS(SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=principal.oid AND deptype='o')
 OR EXISTS(SELECT 1 FROM pg_auth_members m WHERE (m.roleid=principal.oid OR m.member=principal.oid) AND NOT
  (m.member='postgres'::regrole AND m.roleid=principal.oid AND (
   (m.admin_option AND NOT m.inherit_option)
   OR (NOT m.admin_option AND NOT m.inherit_option AND NOT m.set_option AND m.grantor='postgres'::regrole
    AND EXISTS(SELECT 1 FROM pg_auth_members owner_edge WHERE owner_edge.member=m.member AND owner_edge.roleid=m.roleid
     AND owner_edge.grantor='supabase_admin'::regrole AND owner_edge.admin_option AND NOT owner_edge.inherit_option AND NOT owner_edge.set_option)))))
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname=writer AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls OR rolreplication)) THEN RETURN false;END IF;
 SELECT * INTO p FROM public.trip_sustained_dev_policy WHERE actor_account_id=actor FOR SHARE;
 IF NOT FOUND OR NOT p.enabled OR p.revoked_at IS NOT NULL OR NOT p.universal_import_enabled THEN RETURN false;END IF;
 RETURN EXISTS(SELECT 1 FROM public.trip_create_receipts r JOIN public.trips t ON t.id=r.trip_id AND t.created_by=r.actor_account_id
   WHERE r.actor_account_id=actor AND r.trip_id=trip AND r.request_payload->'formatVersion'='2'::jsonb AND r.created_at>=p.adoption_cutoff)
 AND EXISTS(SELECT 1 FROM public.journey_members WHERE trip_id=trip AND user_id=actor AND status='linked' AND role='owner');
END $$;
REVOKE ALL ON FUNCTION public.trip_sustained_universal_allowed(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,authenticator;
GRANT EXECUTE ON FUNCTION public.trip_sustained_universal_allowed(uuid,uuid) TO otr_trip_source_writer,otr_external_integration_meter_writer;
CREATE TEMP TABLE universal_source_owner_edge ON COMMIT DROP AS SELECT admin_option,inherit_option,set_option FROM pg_auth_members WHERE roleid='otr_trip_source_writer'::regrole AND member='postgres'::regrole AND grantor='postgres'::regrole;
DO $$BEGIN IF has_schema_privilege('otr_trip_source_writer','public','CREATE') THEN RAISE EXCEPTION 'UNIVERSAL_OWNER_CREATE_PREIMAGE';END IF;END $$;
GRANT otr_trip_source_writer TO postgres WITH INHERIT true,SET true;
GRANT CREATE ON SCHEMA public TO otr_trip_source_writer;
-- Actual owning rows, not a temporary exact-QA scope, qualify normal Run INSERT.
CREATE FUNCTION public.trip_source_sustained_run_row(tab text,op text,n jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE r public.trip_source_runs;i public.trip_source_inputs;s public.trip_sources;rep public.trip_source_representations;
BEGIN
 IF session_user<>'otr_trip_source_command_gateway' OR current_user<>'otr_trip_source_writer' THEN RETURN false;END IF;
 IF tab='trip_source_runs' THEN r:=jsonb_populate_record(null::public.trip_source_runs,n);
 ELSIF tab IN ('trip_source_inputs','trip_source_candidates') THEN SELECT * INTO r FROM public.trip_source_runs WHERE id=(n->>'run_id')::uuid;
 ELSE RETURN false;END IF;
 IF r.extractor_key IS DISTINCT FROM 'otr-universal-interpretation-v1' OR NOT public.trip_sustained_universal_allowed(r.actor_account_id,r.trip_id) THEN RETURN false;END IF;
 IF op<>'INSERT' OR tab NOT IN ('trip_source_runs','trip_source_inputs') OR r.state IS DISTINCT FROM 'PENDING' OR r.row_revision IS DISTINCT FROM 1
 OR r.retention_state IS DISTINCT FROM 'RETAINED' OR r.superseded_by IS NOT NULL OR r.completed_at IS NOT NULL OR r.error_code IS NOT NULL
 OR r.capture_batch_id IS NULL OR r.interpretation_task_id IS NULL OR r.capture_submission_sha256 !~ '^[a-f0-9]{64}$'
 OR r.extractor_version IS DISTINCT FROM '1' OR r.operation_key IS DISTINCT FROM 'universal:'||r.capture_batch_id::text
 OR r.extractor_options_sha256 IS DISTINCT FROM r.capture_submission_sha256 OR r.created_at IS NULL OR r.created_at>clock_timestamp()
 OR NOT public.trip_source_uuid_array_valid(r.scope_source_ids,1,64)
 OR r.scope_sha256 IS DISTINCT FROM public.trip_source_hash('otr-source-run-scope-v1',jsonb_build_array(1,r.trip_id,r.actor_account_id,to_jsonb(r.scope_source_ids)))
 THEN RAISE EXCEPTION 'UNIVERSAL_SUSTAINED_RUN_DENIED';END IF;
 IF (SELECT count(*) FROM public.trip_sources WHERE id=ANY(r.scope_source_ids) AND trip_id=r.trip_id AND acquired_by=r.actor_account_id AND lifecycle='ACTIVE' AND retention_state='RETAINED' AND current_material_revision=1)<>cardinality(r.scope_source_ids) THEN RAISE EXCEPTION 'INPUT_STALE';END IF;
 IF tab='trip_source_inputs' THEN
  i:=jsonb_populate_record(null::public.trip_source_inputs,n);
  SELECT * INTO s FROM public.trip_sources WHERE id=i.source_id;
  SELECT * INTO rep FROM public.trip_source_representations WHERE source_id=i.source_id AND id=i.representation_id;
  IF to_jsonb(i) IS DISTINCT FROM n OR i.confirmation_id IS NOT NULL OR i.material_revision IS DISTINCT FROM 1 OR i.historical_selection IS DISTINCT FROM false
  OR NOT i.source_id=ANY(r.scope_source_ids) OR NOT public.trip_import_input_valid(i,r.actor_account_id,r.trip_id,true)
  OR rep.role IS DISTINCT FROM 'ORIGINAL' OR rep.material_kind IS DISTINCT FROM 'TEXT' OR rep.encoding IS DISTINCT FROM 'UTF-8'
  OR rep.remote_state IS DISTINCT FROM 'NOT_APPLICABLE' OR rep.byte_count NOT BETWEEN 1 AND 262144 OR rep.byte_count IS DISTINCT FROM octet_length(rep.text_content)
  OR NOT(s.source_kind='TEXT' AND s.acquisition_channel='PASTE' OR s.source_kind='FILE' AND s.acquisition_channel='FILES')
  THEN RAISE EXCEPTION 'INPUT_STALE';END IF;
 ELSIF to_jsonb(r) IS DISTINCT FROM n THEN RAISE EXCEPTION 'UNIVERSAL_SUSTAINED_RUN_DENIED';END IF;
 RETURN true;
END $$;
ALTER FUNCTION public.trip_source_sustained_run_row(text,text,jsonb) OWNER TO otr_trip_source_writer;
REVOKE ALL ON FUNCTION public.trip_source_sustained_run_row(text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role,authenticator;
DO $patch$ DECLARE definition text;body text;old text;replacement text;BEGIN
 SELECT prosrc,pg_get_functiondef(oid) INTO body,definition FROM pg_proc WHERE oid='public.trip_source_universal_original_pin()'::regprocedure AND proowner='otr_trip_source_writer'::regrole AND NOT prosecdef;
 old:=$old$if not exists(select 1 from public.trip_source_universal_scope s where s.singleton and s.actor_id=(p->>'actorId')::uuid$old$;
 replacement:=$new$if not public.trip_sustained_universal_allowed((p->>'actorId')::uuid,(p->>'tripId')::uuid) and not exists(select 1 from public.trip_source_universal_scope s where s.singleton and s.actor_id=(p->>'actorId')::uuid$new$;
 IF body IS NULL OR (length(body)-length(replace(body,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'UNIVERSAL_ORIGINAL_PIN_PREIMAGE';END IF;
 EXECUTE replace(definition,body,replace(body,old,replacement));
 SELECT prosrc,pg_get_functiondef(oid) INTO body,definition FROM pg_proc WHERE oid='public.trip_source_begin_universal_inputs(uuid,uuid,text)'::regprocedure AND proowner='otr_trip_source_writer'::regrole AND prosecdef;
 old:=$old$if not exists(select 1 from public.trip_source_universal_scope s where singleton and s.actor_id=actor and s.trip_id=trip$old$;
 replacement:=$new$if not public.trip_sustained_universal_allowed(actor,trip) and not exists(select 1 from public.trip_source_universal_scope s where singleton and s.actor_id=actor and s.trip_id=trip$new$;
 IF body IS NULL OR (length(body)-length(replace(body,old,'')))/length(old)<>2 THEN RAISE EXCEPTION 'UNIVERSAL_RUN_BEGIN_PREIMAGE';END IF;
 EXECUTE replace(definition,body,replace(body,old,replacement));
 SELECT prosrc,pg_get_functiondef(oid) INTO body,definition FROM pg_proc WHERE oid='public.trip_source_run_only_row(text,text,jsonb)'::regprocedure AND proowner='otr_trip_source_writer'::regrole AND NOT prosecdef;
 old:=$old$ /* UNIVERSAL_RUN_ONLY_BEGIN */$old$;
 IF body IS NULL OR (length(body)-length(replace(body,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'UNIVERSAL_RUN_GUARD_PREIMAGE';END IF;
 EXECUTE replace(definition,body,replace(body,old,E' if public.trip_source_sustained_run_row(tab,op,n) then return;end if;\n'||old));
END $patch$;
CREATE FUNCTION public.trip_source_begin_sustained_universal_inputs(actor uuid,trip uuid,raw text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN
 IF NOT public.trip_sustained_universal_allowed(actor,trip) THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_CLOSED';END IF;
 RETURN public.trip_source_begin_universal_inputs(actor,trip,raw);
END $$;
CREATE FUNCTION public.trip_source_find_sustained_universal_binding(actor uuid,trip uuid,batch uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE r public.trip_source_runs;pins jsonb;BEGIN
 IF NOT public.trip_sustained_universal_allowed(actor,trip) THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_CLOSED';END IF;
 PERFORM public.trip_import_scope_lock(actor,trip);
 IF NOT public.trip_source_lock_universal_actor(actor,trip,false) THEN RAISE EXCEPTION 'SOURCE_ACCESS_DENIED';END IF;
 SELECT * INTO r FROM public.trip_source_runs WHERE actor_account_id=actor AND trip_id=trip AND capture_batch_id=batch;
 IF NOT FOUND THEN RETURN null;END IF;
 IF r.extractor_key<>'otr-universal-interpretation-v1' OR r.state='FAILED' OR r.retention_state<>'RETAINED' OR r.superseded_by IS NOT NULL THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;
 SELECT jsonb_agg(to_jsonb(i)-'run_id'-'confirmation_id' ORDER BY id) INTO pins FROM public.trip_source_inputs i WHERE run_id=r.id;
 IF jsonb_array_length(pins) NOT BETWEEN 1 AND 64 OR EXISTS(SELECT 1 FROM public.trip_source_inputs i WHERE run_id=r.id AND NOT public.trip_import_input_valid(i,actor,trip,true)) THEN RAISE EXCEPTION 'INPUT_STALE';END IF;
 RETURN jsonb_build_object('actorId',actor,'tripId',trip,'batchId',batch,'submissionSha256',r.capture_submission_sha256,'runId',r.id,'taskId',r.interpretation_task_id,'generation',r.generation,'createdAt',r.created_at,'inputs',pins);
END $$;
CREATE FUNCTION public.trip_source_read_sustained_universal_inputs(actor uuid,trip uuid,batch uuid,task uuid,run uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN
 IF NOT public.trip_sustained_universal_allowed(actor,trip) THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_CLOSED';END IF;
 RETURN public.trip_source_read_universal_inputs(actor,trip,batch,task,run);
END $$;
ALTER FUNCTION public.trip_source_begin_sustained_universal_inputs(uuid,uuid,text) OWNER TO otr_trip_source_writer;
ALTER FUNCTION public.trip_source_find_sustained_universal_binding(uuid,uuid,uuid) OWNER TO otr_trip_source_writer;
ALTER FUNCTION public.trip_source_read_sustained_universal_inputs(uuid,uuid,uuid,uuid,uuid) OWNER TO otr_trip_source_writer;
REVOKE ALL ON FUNCTION public.trip_source_begin_sustained_universal_inputs(uuid,uuid,text),public.trip_source_find_sustained_universal_binding(uuid,uuid,uuid),public.trip_source_read_sustained_universal_inputs(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,authenticator;
GRANT EXECUTE ON FUNCTION public.trip_source_begin_sustained_universal_inputs(uuid,uuid,text),public.trip_source_find_sustained_universal_binding(uuid,uuid,uuid),public.trip_source_read_sustained_universal_inputs(uuid,uuid,uuid,uuid,uuid) TO otr_trip_source_command_gateway;
REVOKE CREATE ON SCHEMA public FROM otr_trip_source_writer;
DO $$DECLARE edge record;BEGIN SELECT * INTO edge FROM universal_source_owner_edge;
 IF FOUND THEN EXECUTE format('grant otr_trip_source_writer to postgres with admin %s,inherit %s,set %s',CASE WHEN edge.admin_option THEN 'true' ELSE 'false' END,CASE WHEN edge.inherit_option THEN 'true' ELSE 'false' END,CASE WHEN edge.set_option THEN 'true' ELSE 'false' END);
 ELSE REVOKE otr_trip_source_writer FROM postgres;END IF;
END $$;
COMMIT;
