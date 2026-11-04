-- Existing actual Source/Execution owner roles; only local read/assertion wrappers.
SET ROLE otr_trip_source_writer;
CREATE FUNCTION public.qa_png_execution(actor uuid,raw text,action text,expected jsonb,detail jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$SELECT public.trip_source_png_execution(actor,raw,action,expected,detail)$$;
REVOKE ALL ON FUNCTION public.qa_png_execution(uuid,text,text,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qa_png_execution(uuid,text,text,jsonb,jsonb) TO otr_trip_source_command_gateway;
RESET ROLE;
GRANT CREATE ON SCHEMA public TO otr_trip_source_execution_writer;
SET ROLE otr_trip_source_execution_writer;
CREATE FUNCTION public.qa_png_active(actor uuid,raw text,writing boolean) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$SELECT public.trip_source_finite_native_png_execution_allowed(actor,raw,writing)$$;
REVOKE ALL ON FUNCTION public.qa_png_active(uuid,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qa_png_active(uuid,text,boolean) TO otr_trip_source_command_gateway;
RESET ROLE;
GRANT SELECT ON qa_png_commands TO otr_trip_source_command_gateway;
SET SESSION AUTHORIZATION otr_trip_source_command_gateway;
DO $$DECLARE q jsonb;BEGIN
 SELECT c.q INTO q FROM qa_png_commands c WHERE operation='43000000-0000-4000-8000-000000000001';
 IF public.qa_png_active('00000000-0000-4000-8000-000000000002',q::text,true) IS NOT TRUE THEN RAISE EXCEPTION 'ACTIVE_BRIDGE_REJECTED_EXACT_COMMAND';END IF;
 IF has_function_privilege(current_user,'public.trip_source_finite_native_png_execution_allowed(uuid,text,boolean)','EXECUTE') THEN RAISE EXCEPTION 'GATEWAY_HAS_BRIDGE_EXECUTE';END IF;
END $$;
RESET SESSION AUTHORIZATION;
UPDATE public.trip_source_universal_scope SET expires_at=clock_timestamp()-interval '1 second';
SET SESSION AUTHORIZATION otr_trip_source_command_gateway;
DO $$DECLARE q jsonb;expected jsonb;detail jsonb;action text;BEGIN
 SELECT c.q INTO q FROM qa_png_commands c WHERE operation='43000000-0000-4000-8000-000000000001';
 IF public.qa_png_active('00000000-0000-4000-8000-000000000002',q::text,true) IS NOT FALSE OR public.qa_png_active('00000000-0000-4000-8000-000000000002',q::text,false) IS NOT TRUE THEN RAISE EXCEPTION 'CLOSED_ACTIVE_RETAINED_IDENTITY_CONFLATED';END IF;
 expected:=jsonb_build_object('attemptId','45000000-0000-4000-8000-000000000001','ownerRun','22000000-0000-4000-8000-000000000001','ownerFence',1);
 FOREACH action IN ARRAY ARRAY['REGISTER','CLAIM','ATTACH','ADVANCE'] LOOP
  detail:=CASE WHEN action='ADVANCE' THEN '{"nextPhase":"RUNNING"}'::jsonb ELSE NULL END;
  BEGIN
   PERFORM public.qa_png_execution('00000000-0000-4000-8000-000000000002',q::text,action,expected,detail);
   RAISE EXCEPTION 'CLOSED_SCOPE_STARTED_NEW_EXECUTION';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PNG_SCOPE_CLOSED' THEN RAISE;END IF;END;
 END LOOP;
 RAISE NOTICE 'ACTUAL ExecutionWriter->SourceWriter bridge and expired REGISTER/CLAIM(even TERMINAL)/ATTACH/RUNNING rejection PASS; retained read remains legal; Gateway direct bridge EXEC false';
END $$;
