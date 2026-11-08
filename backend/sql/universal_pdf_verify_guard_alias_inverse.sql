-- Protected Source mutation guard maintenance. Preserve exact privileges and predicates.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='25s';
DO $patch$
DECLARE
 target regprocedure:='public.guard_trip_source_mutation()';
 definition text;
BEGIN
 IF current_user<>'postgres'
  OR NOT pg_try_advisory_xact_lock(hashtextextended('otr-source-activation-v1',0))
 THEN RAISE EXCEPTION 'PDF_VERIFY_GUARD_WRITER_OR_LOCK';END IF;
 SELECT pg_get_functiondef(p.oid) INTO definition FROM pg_proc p
 WHERE p.oid=target AND pg_get_userbyid(p.proowner)='postgres' AND NOT p.prosecdef
   AND p.proconfig=ARRAY['search_path=pg_catalog'] AND p.proacl::text='{postgres=X/postgres}';
 IF definition IS NULL OR encode(sha256(convert_to(definition,'UTF8')),'hex')<>'ae21a74d2ab81a56bf8b9d5ddf5556500b3342fdeb01d821bfda4d315cabc8c2'
 THEN RAISE EXCEPTION 'PDF_VERIFY_GUARD_PREIMAGE_DRIFT';END IF;
 definition:=replace(definition,$before$not exists(select 1 from public.trip_source_operations verify_op join public.trip_sources verify_source on verify_source.id=verify_op.source_id where verify_op.representation_id=old.id and verify_op.source_id=old.source_id and verify_op.command='VERIFY_REPRESENTATION' and verify_op.phase='IO_QUIESCENT' and verify_op.worker_identity=session_user and verify_op.expected_representation_row_revision=old.row_revision and verify_op.bound_payload_sha256=old.payload_sha256 and verify_op.bound_byte_count=old.byte_count and verify_op.expected_source_row_revision=verify_source.row_revision and verify_op.material_revision=verify_source.current_material_revision and verify_op.actor_account_id=verify_source.acquired_by)$before$,$after$not exists(select 1 from public.trip_source_operations o join public.trip_sources s on s.id=o.source_id where o.representation_id=old.id and o.source_id=old.source_id and o.command='VERIFY_REPRESENTATION' and o.phase='IO_QUIESCENT' and o.worker_identity=session_user and o.expected_representation_row_revision=old.row_revision and o.bound_payload_sha256=old.payload_sha256 and o.bound_byte_count=old.byte_count and o.expected_source_row_revision=s.row_revision and o.material_revision=s.current_material_revision and o.actor_account_id=s.acquired_by)$after$);
 IF encode(sha256(convert_to(definition,'UTF8')),'hex')<>'5554d854ecdf525db3b79c76c2ae649f88b9716cefe939168b3f7c88db14b68c'
 THEN RAISE EXCEPTION 'PDF_VERIFY_GUARD_TRANSFORM_DRIFT';END IF;
 EXECUTE definition;
 IF encode(sha256(convert_to(pg_get_functiondef(target),'UTF8')),'hex')<>'5554d854ecdf525db3b79c76c2ae649f88b9716cefe939168b3f7c88db14b68c'
 THEN RAISE EXCEPTION 'PDF_VERIFY_GUARD_POSTIMAGE_DRIFT';END IF;
END $patch$;
COMMIT;
