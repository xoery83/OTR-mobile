-- Candidate definitions, not an installation grant. Root2 installs only under an exact Gate.
-- The existing Core capability row owns the separate, default-closed write switch.
DO $member_install_pre$
BEGIN
 IF current_user<>'postgres'
 OR current_setting('otr.auth.approved_project_ref',true) IS DISTINCT FROM 'tuqigdxrvrerfewsxqgm'
 OR current_setting('otr.core.member_revoke_install_gate',true) IS DISTINCT FROM 'OTR_MEMBER_REVOKE_V2_DEFAULT_CLOSED_INSTALL'
 THEN RAISE EXCEPTION 'MEMBER_REVOKE_PROTECTED_INSTALL_REQUIRED';END IF;
 IF to_regprocedure('public.trip_core_member_access(uuid,uuid,text,jsonb)') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.trip_core_activation_gate'::regclass AND attname='member_revoke_enabled' AND NOT attisdropped)
 THEN RAISE EXCEPTION 'MEMBER_REVOKE_INSTALL_PREIMAGE_DRIFT';END IF;
END $member_install_pre$;

ALTER TABLE public.trip_core_activation_gate ADD COLUMN member_revoke_enabled boolean NOT NULL DEFAULT false;

CREATE FUNCTION public.trip_core_member_scope_allowed(actor uuid, trip uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE g public.trip_core_activation_gate;
BEGIN
 IF current_user<>'postgres' OR session_user<>'otr_trip_core_v2_gateway' OR actor IS NULL OR trip IS NULL THEN RETURN false;END IF;
 SELECT * INTO g FROM public.trip_core_activation_gate WHERE singleton FOR SHARE;
 RETURN coalesce(g.member_revoke_enabled AND g.scope_actor_account_id=actor AND g.scope_trip_id=trip
  AND clock_timestamp()>=g.scope_started_at AND clock_timestamp()<g.scope_expires_at,false);
END $$;
REVOKE ALL ON FUNCTION public.trip_core_member_scope_allowed(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,otr_trip_core_v2_gateway,otr_trip_core_v2_writer;

CREATE FUNCTION public.trip_core_member_write_allowed(tab text, op text, n jsonb, old_row jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE p jsonb; a uuid; t uuid; b jsonb; r jsonb;
BEGIN
 IF current_user<>'postgres' OR session_user<>'otr_trip_core_v2_gateway' THEN RETURN false; END IF;
 p:=nullif(current_setting('otr.core.member_revoke_proof',true),'')::jsonb;
 IF p IS NULL THEN RETURN false;END IF;
 a:=(p->>'actor')::uuid;t:=(p->>'trip')::uuid;b:=p->'before';r:=p->'receipt';
 IF public.trip_core_member_scope_allowed(a,t) IS NOT TRUE
 OR NOT EXISTS(SELECT 1 FROM public.journey_members m WHERE m.trip_id=t AND m.user_id=a AND m.status='linked' AND m.role='owner')
 OR EXISTS(SELECT 1 FROM public.journey_removed_users WHERE trip_id=t AND user_id=a)

 THEN RETURN false;END IF;
 IF tab='trip_core_read_state' THEN
  RETURN EXISTS(SELECT 1 FROM public.journey_removed_users WHERE trip_id=t AND user_id=(p->>'target')::uuid) AND op='UPDATE' AND p->>'stage'='STATE' AND n->>'trip_id'=t::text
   AND n->>'epoch'=b->>'epoch' AND old_row->>'epoch'=b->>'epoch'
   AND (old_row->>'revision')::bigint=(b->>'revision')::bigint
   AND (old_row->>'access_revision')::bigint=(b->>'accessRevision')::bigint
   AND (n->>'revision')::bigint=(b->>'revision')::bigint+1
   AND (n->>'access_revision')::bigint=(b->>'accessRevision')::bigint+1;
 END IF;
 IF tab='trip_core_command_receipts' THEN
  RETURN op='INSERT' AND p->>'stage'='RECEIPT' AND n=r
   AND n->>'actor_account_id'=a::text AND n->>'trip_id'=t::text
   AND n#>>'{body,command}'='REVOKE_LINKED_MEMBER_ACCESS'
   AND n->>'intent_sha256'=encode(sha256(convert_to('otr-trip-core-intent-v2'||E'\n'||(n->>'canonical_intent_text'),'UTF8')),'hex')
   AND n->>'receipt_sha256'=public.trip_source_hash('otr-trip-core-receipt-v2',(n->'body')-'receiptSha256');
 END IF;
 RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.trip_core_member_write_allowed(text,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role,otr_trip_core_v2_gateway,otr_trip_core_v2_writer;

CREATE FUNCTION public.trip_core_member_denial_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid;
BEGIN
 -- Formal Claim already uses this Trip lock. Legacy membership writes join it too.
 IF TG_TABLE_NAME='journey_members' THEN
  FOR t IN SELECT DISTINCT x FROM unnest(ARRAY[(to_jsonb(OLD)->>'trip_id')::uuid,(to_jsonb(NEW)->>'trip_id')::uuid]) x WHERE x IS NOT NULL ORDER BY x LOOP
   PERFORM 1 FROM public.trips WHERE id=t FOR UPDATE;
  END LOOP;
  RETURN coalesce(NEW,OLD);
 END IF;
 t:=OLD.trip_id;
 PERFORM 1 FROM public.trips WHERE id=t FOR UPDATE;
 IF OLD.reason='CORE_MEMBER_REVOKE_V2' OR EXISTS(
  SELECT 1 FROM public.trip_core_command_receipts r
  WHERE r.trip_id=t AND r.body->>'command'='REVOKE_LINKED_MEMBER_ACCESS'
   AND r.outcome IN ('APPLIED','NO_CHANGE') AND r.body#>>'{accessTransition,targetAccountId}'=OLD.user_id::text
 ) THEN RAISE EXCEPTION 'MEMBER_REGRANT_NOT_AUTHORIZED' USING ERRCODE='42501';END IF;
 RETURN coalesce(NEW,OLD);
END $$;
REVOKE ALL ON FUNCTION public.trip_core_member_denial_guard() FROM PUBLIC,anon,authenticated,service_role,otr_trip_core_v2_gateway,otr_trip_core_v2_writer;
CREATE TRIGGER core_member_revoke_serialize BEFORE INSERT OR UPDATE OR DELETE ON public.journey_members
 FOR EACH ROW EXECUTE FUNCTION public.trip_core_member_denial_guard();
CREATE TRIGGER core_member_revoke_retain BEFORE UPDATE OR DELETE ON public.journey_removed_users
 FOR EACH ROW EXECUTE FUNCTION public.trip_core_member_denial_guard();

CREATE FUNCTION public.trip_core_member_access(actor uuid, trip uuid, method text, payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET TimeZone='UTC' SET DateStyle='ISO, YMD' AS $$
DECLARE q jsonb; raw text; digest text; operation uuid; person uuid; target_account uuid;
 current_state public.trip_core_read_state; after_state public.trip_core_read_state;
 prior public.trip_core_command_receipts; owner_person uuid; member_person uuid;
 target_person public.journey_members; owner_count integer; b jsonb; r jsonb; row_json jsonb;
 outcome text; error_code text; receipt_id uuid; at_time timestamptz; proof jsonb;
 previous_proof text:=current_setting('otr.core.member_revoke_proof',true);
BEGIN
 IF current_user<>'postgres' OR session_user<>'otr_trip_core_v2_gateway'
 OR actor IS NULL OR trip IS NULL OR method IS NULL OR method NOT IN ('EXECUTE','RECEIPT','ACCESS_LOSS')
 OR jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'NOT_VISIBLE' USING ERRCODE='42501';END IF;
 IF method='EXECUTE' THEN PERFORM 1 FROM public.trips WHERE id=trip FOR UPDATE;
 ELSE PERFORM 1 FROM public.trips WHERE id=trip FOR SHARE;END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_VISIBLE' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM auth.users WHERE id=actor AND is_anonymous IS FALSE AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=clock_timestamp()) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_VISIBLE' USING ERRCODE='42501';END IF;
 -- A non-member receipt delegates to the existing graph-only reader, not a new membership prerequisite.
 IF method='RECEIPT' THEN
  IF public.trip_event_keys(payload,ARRAY['operationId']) IS NOT TRUE THEN RAISE EXCEPTION 'INVALID_PAYLOAD';END IF;
  IF EXISTS(SELECT 1 FROM public.journey_removed_users WHERE trip_id=trip AND user_id=actor) THEN RAISE EXCEPTION 'NOT_VISIBLE' USING ERRCODE='42501';END IF;
  operation:=(payload->>'operationId')::uuid;
  SELECT * INTO prior FROM public.trip_core_command_receipts WHERE actor_account_id=actor AND operation_id=operation AND trip_id=trip AND body->>'command'='REVOKE_LINKED_MEMBER_ACCESS';
  IF NOT FOUND THEN RETURN NULL;END IF;
 END IF;
 SELECT min(id::text)::uuid,count(*) INTO member_person,owner_count FROM public.journey_members
 WHERE trip_id=trip AND user_id=actor AND status='linked';
 IF owner_count<>1 THEN RAISE EXCEPTION 'NOT_VISIBLE' USING ERRCODE='42501';END IF;
 IF method='ACCESS_LOSS' THEN
  IF payload<>'{}'::jsonb THEN RAISE EXCEPTION 'INVALID_PAYLOAD';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.journey_removed_users WHERE trip_id=trip AND user_id=actor) THEN RETURN NULL;END IF;
  SELECT * INTO STRICT current_state FROM public.trip_core_read_state WHERE trip_id=trip FOR SHARE;
  RETURN jsonb_build_object('schemaId','otr.trip.core-access-loss/1','accountId',actor,'tripId',trip,'personId',member_person,'state','ACCESS_REVOKED',
   'coreReference',jsonb_build_object('epoch',current_state.epoch,'revision',current_state.revision,'accessRevision',current_state.access_revision));
 END IF;
 IF EXISTS(SELECT 1 FROM public.journey_removed_users WHERE trip_id=trip AND user_id=actor)
 THEN RAISE EXCEPTION 'NOT_VISIBLE' USING ERRCODE='42501';END IF;
 IF method='RECEIPT' THEN RETURN jsonb_build_object('projection','FULL','domainReceiptId',prior.id,'receipt',prior.body);END IF;
 IF public.trip_event_keys(payload,ARRAY['command','canonicalIntent','intentSha256']) IS NOT TRUE THEN RAISE EXCEPTION 'INVALID_PAYLOAD';END IF;
 q:=payload->'command';raw:=payload->>'canonicalIntent';digest:=payload->>'intentSha256';
 IF raw IS NULL OR octet_length(raw)>32768 OR raw IS DISTINCT FROM public.trip_event_canonical_json(q::json)
 OR digest IS DISTINCT FROM public.trip_source_hash('otr-trip-core-intent-v2',q)
 OR public.trip_event_keys(q,ARRAY['contractVersion','intentVersion','operationId','tripId','command','target','baseVector','admission','payload']) IS NOT TRUE
 OR q->'contractVersion' IS DISTINCT FROM '2'::jsonb OR q->'intentVersion' IS DISTINCT FROM '2'::jsonb OR q->>'command' IS DISTINCT FROM 'REVOKE_LINKED_MEMBER_ACCESS'
 OR q->>'tripId' IS DISTINCT FROM trip::text OR q->'target' IS DISTINCT FROM jsonb_build_object('kind','TRIP_ACCESS','id',trip)
 OR q->'admission' IS DISTINCT FROM jsonb_build_object('mode','MANUAL','sourceIntentId',NULL,'policyVersion',NULL)
 OR jsonb_typeof(q->'baseVector') IS DISTINCT FROM 'array' OR jsonb_array_length(q->'baseVector')<>1
 OR public.trip_event_keys(q->'baseVector'->0,ARRAY['kind','id','revision']) IS NOT TRUE
 OR q#>>'{baseVector,0,kind}' IS DISTINCT FROM 'TRIP_ACCESS' OR q#>>'{baseVector,0,id}' IS DISTINCT FROM trip::text
 OR (q#>>'{baseVector,0,revision}') IS NULL OR (q#>>'{baseVector,0,revision}')!~'^[1-9][0-9]*$'
 OR (q#>>'{baseVector,0,revision}')::numeric>9007199254740991
 OR public.trip_event_keys(q->'payload',ARRAY['personId','targetAccountId','coreEpoch']) IS NOT TRUE
 THEN RAISE EXCEPTION 'INVALID_PAYLOAD';END IF;
 operation:=(q->>'operationId')::uuid;person:=(q#>>'{payload,personId}')::uuid;target_account:=(q#>>'{payload,targetAccountId}')::uuid;
 IF operation IS NULL OR person IS NULL OR target_account IS NULL OR (q#>>'{payload,coreEpoch}')::uuid IS NULL THEN RAISE EXCEPTION 'INVALID_PAYLOAD';END IF;
 PERFORM set_config('otr.core.actor',actor::text,true);PERFORM set_config('otr.core.trip',trip::text,true);PERFORM set_config('otr.core.operation',operation::text,true);
 PERFORM pg_advisory_xact_lock(hashtextextended('otr-core2-operation:'||actor||':'||operation,0));
 SELECT * INTO prior FROM public.trip_core_command_receipts WHERE actor_account_id=actor AND operation_id=operation;
 IF FOUND THEN
  IF prior.trip_id<>trip OR prior.intent_sha256<>digest OR prior.canonical_intent_text<>raw OR prior.body->>'command'<>'REVOKE_LINKED_MEMBER_ACCESS'
  THEN RAISE EXCEPTION 'OPERATION_REUSE_MISMATCH';END IF;
  RETURN jsonb_build_object('projection','FULL','domainReceiptId',prior.id,'receipt',prior.body);
 END IF;
 IF EXISTS(SELECT 1 FROM public.trip_event_operation_receipts WHERE actor_account_id=actor AND operation_key=operation) THEN RAISE EXCEPTION 'OPERATION_REUSE_MISMATCH';END IF;
 -- Normal access and this explicit switch are both required; no inheritance from a P-type gate.
 IF public.trip_core_member_scope_allowed(actor,trip) IS NOT TRUE THEN RAISE EXCEPTION 'CORE_CAPABILITY_CLOSED';END IF;
 SELECT count(*),min(m.id::text)::uuid INTO owner_count,owner_person
 FROM public.journey_members m WHERE m.trip_id=trip AND m.status='linked' AND m.role='owner';
 IF owner_count<>1 OR owner_person IS DISTINCT FROM member_person THEN RAISE EXCEPTION 'NOT_VISIBLE' USING ERRCODE='42501';END IF;
 SELECT * INTO STRICT current_state FROM public.trip_core_read_state WHERE trip_id=trip FOR UPDATE;
 after_state:=current_state;outcome:='NO_CHANGE';error_code:=NULL;
 SELECT * INTO target_person FROM public.journey_members WHERE id=person AND trip_id=trip;
 IF NOT FOUND OR target_person.user_id IS DISTINCT FROM target_account OR target_person.status<>'linked'
 OR target_person.role='owner' OR target_account=actor OR person=owner_person
 OR (SELECT count(*) FROM public.journey_members WHERE trip_id=trip AND user_id=target_account AND status='linked')<>1
 THEN outcome:='REJECTED';error_code:='NOT_VISIBLE';
 ELSIF current_state.epoch IS DISTINCT FROM (q#>>'{payload,coreEpoch}')::uuid OR current_state.access_revision IS DISTINCT FROM (q#>>'{baseVector,0,revision}')::bigint
 THEN outcome:='CONFLICT';error_code:='REVISION_CONFLICT';
 ELSIF NOT EXISTS(SELECT 1 FROM public.journey_removed_users WHERE trip_id=trip AND user_id=target_account) THEN
  IF current_state.revision>=9007199254740991 OR current_state.access_revision>=9007199254740991 THEN RAISE EXCEPTION 'REVISION_OVERFLOW';END IF;
  INSERT INTO public.journey_removed_users(trip_id,user_id,removed_by_user_id,reason) VALUES(trip,target_account,actor,'CORE_MEMBER_REVOKE_V2');
  proof:=jsonb_build_object('actor',actor,'trip',trip,'target',target_account,'stage','STATE','before',jsonb_build_object('epoch',current_state.epoch,'revision',current_state.revision,'accessRevision',current_state.access_revision));
  PERFORM set_config('otr.core.member_revoke_proof',proof::text,true);
  UPDATE public.trip_core_read_state SET revision=revision+1,access_revision=access_revision+1 WHERE trip_id=trip RETURNING * INTO after_state;
  outcome:='APPLIED';
 END IF;
 at_time:=transaction_timestamp();receipt_id:=gen_random_uuid();
 b:=jsonb_build_object('receiptVersion',2,'commandVersion',2,'intentVersion',2,'actorAccountId',actor,'tripId',trip,'operationId',operation,'command','REVOKE_LINKED_MEMBER_ACCESS','intentSha256',digest,
  'targetVector',jsonb_build_array(jsonb_build_object('kind','TRIP_ACCESS','id',trip,'baseRevision',(q#>>'{baseVector,0,revision}')::bigint,'committedRevision',CASE WHEN error_code IS NULL THEN after_state.access_revision END)),
  'outcome',outcome,'result',jsonb_build_object('created','[]'::jsonb,'changed','[]'::jsonb,'retiredEdges','[]'::jsonb,'replacement',NULL,'custodyGrantId',NULL),'errorCode',error_code,
  'committedAt',to_char(at_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'audit',jsonb_build_object('before','[]'::jsonb,'after','[]'::jsonb,'evidenceRefs','[]'::jsonb,'authorizationRefs','[]'::jsonb),
  'accessTransition',CASE WHEN error_code IS NULL THEN jsonb_build_object('personId',person,'targetAccountId',target_account,
   'before',jsonb_build_object('epoch',current_state.epoch,'revision',current_state.revision,'accessRevision',current_state.access_revision),
   'after',jsonb_build_object('epoch',after_state.epoch,'revision',after_state.revision,'accessRevision',after_state.access_revision)) ELSE NULL END);
 b:=b||jsonb_build_object('receiptSha256',public.trip_source_hash('otr-trip-core-receipt-v2',b));
 row_json:=jsonb_build_object('id',receipt_id,'actor_account_id',actor,'trip_id',trip,'operation_id',operation,'command_version',2,'intent_version',2,'receipt_version',2,'canonical_intent_text',raw,'intent_sha256',digest,'receipt_sha256',b->>'receiptSha256','outcome',outcome,'body',b,'committed_at',at_time);
 proof:=jsonb_build_object('actor',actor,'trip',trip,'target',target_account,'stage','RECEIPT','receipt',row_json);
 -- Rejection/conflict writes have no denial. Their immutable receipt is still produced by this Owner-qualified transaction.
 PERFORM set_config('otr.core.member_revoke_proof',proof::text,true);
 INSERT INTO public.trip_core_command_receipts SELECT * FROM jsonb_populate_record(NULL::public.trip_core_command_receipts,row_json);
 PERFORM set_config('otr.core.member_revoke_proof',coalesce(previous_proof,''),true);
 RETURN jsonb_build_object('projection','FULL','domainReceiptId',receipt_id,'receipt',b);
END $$;
REVOKE ALL ON FUNCTION public.trip_core_member_access(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role,otr_trip_core_v2_gateway,otr_trip_core_v2_writer;
-- Deliberately no GRANT/activation here. Exact installation/EXEC and compatible reader cutover require Root2's protected Gate.

DO $member_install_post$
DECLARE item record;f pg_proc;
BEGIN
 FOR item IN SELECT * FROM (VALUES
  ('public.trip_core_member_scope_allowed(uuid,uuid)',false),
  ('public.trip_core_member_write_allowed(text,text,jsonb,jsonb)',false),
  ('public.trip_core_member_denial_guard()',true),
  ('public.trip_core_member_access(uuid,uuid,text,jsonb)',true)
 ) v(signature,definer) LOOP
  SELECT * INTO STRICT f FROM pg_proc WHERE oid=to_regprocedure(item.signature);
  IF f.proowner<>'postgres'::regrole OR f.prosecdef IS DISTINCT FROM item.definer
  OR EXISTS(SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a
   WHERE a.grantee<>f.proowner OR a.grantor<>f.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable)
  OR has_function_privilege('otr_trip_core_v2_gateway',f.oid,'EXECUTE')
  OR has_function_privilege('otr_trip_core_v2_writer',f.oid,'EXECUTE')
  THEN RAISE EXCEPTION 'MEMBER_REVOKE_FUNCTION_ACL_DRIFT';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.trip_core_activation_gate WHERE member_revoke_enabled)
 THEN RAISE EXCEPTION 'MEMBER_REVOKE_EXPECTED_CLOSED';END IF;
END $member_install_post$;
