-- Candidate only: exact Owner approval required. No function body or policy change.
BEGIN;
SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='20s';
SELECT pg_advisory_xact_lock(714024,2);
DO $cas$ BEGIN
 IF current_user<>'postgres' OR (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN RAISE EXCEPTION 'PNG_DEFINER_OPERATOR_DRIFT';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=67149 AND p.oid='public.trip_source_read_sustained_png_proof(uuid,uuid,uuid,uuid,bigint)'::regprocedure AND p.proowner='otr_trip_source_writer'::regrole AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='c94c9e52951e7f58e7cead7197dadae00d1da3189e4804431015febe370a3e83' AND p.proacl::text='{otr_trip_source_writer=X/otr_trip_source_writer,otr_trip_core_v2_gateway=X/otr_trip_source_writer,otr_trip_core_v2_writer=X/otr_trip_source_writer}') THEN RAISE EXCEPTION 'PNG_PROOF_PREIMAGE_DRIFT';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE oid=64306 AND roleid='otr_trip_source_writer'::regrole AND member='postgres'::regrole AND grantor='postgres'::regrole AND NOT admin_option AND NOT inherit_option AND NOT set_option) THEN RAISE EXCEPTION 'PNG_DEFINER_EDGE_DRIFT';END IF;
 IF EXISTS(SELECT 1 FROM public.trip_source_core_v2_candidates WHERE candidate_id='3bdc40b7-add4-8902-b8fa-f3e8773652ef') OR EXISTS(SELECT 1 FROM public.trip_core_command_receipts WHERE operation_id='4f095d9c-449e-8456-a134-c69e9c33f3bb') OR EXISTS(SELECT 1 FROM public.itinerary_events WHERE id='c59d3d03-6830-84e8-8579-02a59fe624fa') THEN RAISE EXCEPTION 'PNG_DEFINER_SAVE_STATE_CHANGED';END IF;
END $cas$;
CREATE TEMP TABLE png_definer_graph ON COMMIT DROP AS SELECT * FROM pg_auth_members;
CREATE TEMP TABLE png_definer_schema ON COMMIT DROP AS SELECT nspacl FROM pg_namespace WHERE nspname='public';
GRANT otr_trip_source_writer TO postgres WITH INHERIT true,SET true;
SET LOCAL ROLE otr_trip_source_writer;
GRANT EXECUTE ON FUNCTION public.trip_source_read_sustained_png_proof(uuid,uuid,uuid,uuid,bigint) TO postgres;
RESET ROLE;
GRANT otr_trip_source_writer TO postgres WITH ADMIN false,INHERIT false,SET false;
DO $post$ BEGIN
 IF (SELECT jsonb_agg(to_jsonb(m) ORDER BY roleid,member,grantor) FROM png_definer_graph m) IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(m) ORDER BY roleid,member,grantor) FROM pg_auth_members m) OR (SELECT nspacl FROM png_definer_schema) IS DISTINCT FROM (SELECT nspacl FROM pg_namespace WHERE nspname='public') THEN RAISE EXCEPTION 'PNG_DEFINER_MAINTENANCE_NOT_RESTORED';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=67149 AND p.proowner='otr_trip_source_writer'::regrole AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='c94c9e52951e7f58e7cead7197dadae00d1da3189e4804431015febe370a3e83' AND p.proacl::text='{otr_trip_source_writer=X/otr_trip_source_writer,otr_trip_core_v2_gateway=X/otr_trip_source_writer,otr_trip_core_v2_writer=X/otr_trip_source_writer,postgres=X/otr_trip_source_writer}') OR NOT has_function_privilege('postgres','public.trip_source_read_sustained_png_proof(uuid,uuid,uuid,uuid,bigint)','EXECUTE') THEN RAISE EXCEPTION 'PNG_DEFINER_POSTIMAGE_DRIFT';END IF;
END $post$;
COMMIT;
