"""Build only the fixed C04 link/read-state candidate; never connect or install."""
from pathlib import Path
import hashlib
import sys

folder = Path(__file__).resolve().parent
source_bytes = (folder.parent / "login-role-compat/INSTALL_CANDIDATE.sql").read_bytes()
assert hashlib.sha256(source_bytes).hexdigest() == "3bbe7fbf47ae40d18dfcb91d98d1aa8da1cf3839853320f1e4733fc61490d565"
source = source_bytes.decode()
guard = Path(sys.argv[1]).read_text()
assert hashlib.sha256(guard.encode()).hexdigest() == "41e240f6bd952c95066184fdc916d3fe19bf836eec77f78dcf7a52e69314b1b6"
start = source.index("CREATE FUNCTION public.trip_member_claim_transaction(")
end = source.index("END$$;", start) + len("END$$;")
old_claim = source[start:end].replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", 1)
old_guard = guard
claim = old_claim

def replace_once(text, old, new):
    assert text.count(old) == 1, old[:80]
    return text.replace(old, new)

claim = replace_once(claim, " identity_scope jsonb;", " identity_scope jsonb;\n claim_operation uuid; expected_digest text;")
old_mark = "  UPDATE public.trip_directed_invite_targets SET status='CLAIMED',claimed_by=actor WHERE trip_directed_invite_targets.invite_id=invite_id;\n"
claim = replace_once(claim, old_mark, "")
anchor = "  UPDATE public.journey_members SET user_id=actor,status='linked',linked_at=clock_timestamp(),updated_at=clock_timestamp()\n"
admission = """  claim_operation:=(payload->>'operationId')::uuid;
  expected_digest:=encode(sha256(convert_to('otr-member-claim-v1'||chr(10)||
   '{"kind":"CLAIM_PERSON","operationId":'||to_json(payload->>'operationId')::text||
   ',"tripId":'||to_json(current_setting('otr.core.trip',true))::text||
   ',"personId":'||to_json(payload->>'personId')::text||
   ',"inviteId":'||to_json(payload->>'inviteId')::text||',"explicitConsent":true}', 'UTF8')),'hex');
  IF claim_operation IS NULL OR payload->>'intentDigest' IS DISTINCT FROM expected_digest
   OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(payload) k)
      IS DISTINCT FROM ARRAY['intentDigest','inviteId','operationId','personId']::text[]
   OR EXISTS(SELECT 1 FROM public.trip_member_claim_receipts WHERE operation_id=claim_operation)
   OR invite_row.max_uses IS DISTINCT FROM 1 OR invite_row.used_count IS DISTINCT FROM 0 THEN
   RAISE EXCEPTION 'MEMBER_LINK_ADMISSION_REQUIRED' USING ERRCODE='42501';END IF;
  UPDATE public.trip_directed_invite_targets SET status='CLAIMED',claimed_by=actor,
   claim_transaction_id=pg_current_xact_id(),claim_backend_pid=pg_backend_pid(),claim_operation_id=claim_operation
   WHERE trip_directed_invite_targets.invite_id=invite_id AND status='PENDING';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'MEMBER_LINK_CONFLICT' USING ERRCODE='23505';END IF;
"""
claim = replace_once(claim, anchor, admission + anchor)
clear = """  UPDATE public.trip_directed_invite_targets SET claim_transaction_id=NULL,claim_backend_pid=NULL,claim_operation_id=NULL
   WHERE trip_directed_invite_targets.invite_id=invite_id;
"""
counter = "  UPDATE public.journey_invites SET used_count=used_count+1,is_active=false WHERE id=invite_id;"
claim = replace_once(claim, counter, clear + counter + "\n  GET DIAGNOSTICS affected=ROW_COUNT;\n  IF affected<>1 THEN RAISE EXCEPTION 'MEMBER_LINK_CONFLICT' USING ERRCODE='23505';END IF;")
branch_anchor = " trip:=(to_jsonb(coalesce(new,old))->>'trip_id')::uuid;"
branch = """
 IF current_user='postgres' AND session_user='otr_trip_core_v2_gateway' AND TG_OP='UPDATE'
 AND NEW.trip_id IS NOT DISTINCT FROM OLD.trip_id
 AND NEW.epoch IS NOT DISTINCT FROM OLD.epoch AND NEW.revision=OLD.revision+1
 AND NEW.access_revision=OLD.access_revision+1
 AND public.trip_member_claim_read_state_allowed(trip) THEN RETURN NEW;END IF;
"""
guard = replace_once(guard, branch_anchor, branch_anchor + branch)
helper = """CREATE FUNCTION public.trip_member_claim_read_state_allowed(requested_trip uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $proof$
 SELECT session_user='otr_trip_core_v2_gateway'
 AND requested_trip IS NOT DISTINCT FROM nullif(current_setting('otr.core.trip',true),'')::uuid
 AND EXISTS(SELECT 1 FROM public.trip_directed_invite_targets d
  JOIN public.journey_members p ON p.id=d.person_id AND p.trip_id=d.trip_id
  JOIN public.trips t ON t.id=d.trip_id
  JOIN public.journey_invites i ON i.id=d.invite_id AND i.trip_id=d.trip_id
  WHERE d.trip_id=requested_trip AND d.status='CLAIMED'
   AND d.target_account_id=nullif(current_setting('otr.core.actor',true),'')::uuid
   AND d.claimed_by=d.target_account_id AND d.approved_by=t.created_by
   AND p.user_id=d.claimed_by AND p.status='linked'
   AND d.claim_transaction_id=pg_current_xact_id() AND d.claim_backend_pid=pg_backend_pid()
   AND d.claim_operation_id IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM public.trip_member_claim_receipts r WHERE r.operation_id=d.claim_operation_id)
   AND i.is_active IS FALSE AND i.max_uses=1 AND i.used_count=0 AND i.expires_at>clock_timestamp()
   AND NOT EXISTS(SELECT 1 FROM public.journey_removed_users r WHERE r.trip_id=d.trip_id AND r.user_id=d.claimed_by))
$proof$;
REVOKE ALL ON FUNCTION public.trip_member_claim_read_state_allowed(uuid)
 FROM PUBLIC,anon,authenticated,service_role,otr_trip_core_v2_gateway,otr_trip_core_v2_writer;
"""
acl_checks = """DO $acl$ DECLARE item record; fn pg_proc%ROWTYPE; BEGIN
 FOR item IN SELECT * FROM (VALUES
  ('public.trip_member_claim_transaction(text,jsonb)'::regprocedure,'otr_trip_core_v2_gateway'::regrole,true),
  ('public.trip_core_finite_read_state_guard()'::regprocedure,'otr_trip_core_v2_writer'::regrole,false)
 ) expected(signature,allowed_role,definer) LOOP
  SELECT * INTO STRICT fn FROM pg_proc WHERE oid=item.signature;
  IF fn.proowner<>'postgres'::regrole OR fn.prosecdef IS DISTINCT FROM item.definer
   OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
   OR (SELECT count(*) FROM aclexplode(coalesce(fn.proacl,acldefault('f',fn.proowner))))<>2
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(fn.proacl,acldefault('f',fn.proowner))) a
    WHERE a.grantee NOT IN (fn.proowner,item.allowed_role) OR a.grantor<>fn.proowner
     OR a.privilege_type<>'EXECUTE' OR a.is_grantable)
  THEN RAISE EXCEPTION 'MEMBER_LINK_READ_STATE_FUNCTION_ACL_DRIFT';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_class c WHERE c.oid='public.trip_directed_invite_targets'::regclass
   AND (c.relowner<>'postgres'::regrole OR NOT c.relrowsecurity OR c.relforcerowsecurity
    OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=c.oid)
    OR EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      WHERE a.grantee<>c.relowner OR a.grantor<>c.relowner)))
  OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.trip_directed_invite_targets'::regclass
    AND attnum>0 AND NOT attisdropped AND attacl IS NOT NULL)
 THEN RAISE EXCEPTION 'MEMBER_LINK_READ_STATE_PRIVATE_TABLE_ACL_DRIFT';END IF;
END $acl$;
"""
preflight = """-- CANDIDATE ONLY. Requires a new exact protected-install approval. Runtime remains closed.
BEGIN;
SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='20s';
DO $pre$ BEGIN
 IF current_user<>'postgres' OR current_setting('otr.auth.approved_project_ref',true) IS DISTINCT FROM 'tuqigdxrvrerfewsxqgm'
 OR current_setting('otr.auth.member_claim_read_state_gate',true) IS DISTINCT FROM 'OTR_C04_LINK_READ_STATE_V1'
 THEN RAISE EXCEPTION 'MEMBER_LINK_READ_STATE_EXACT_GATE_REQUIRED' USING ERRCODE='42501';END IF;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.trip_member_claim_transaction(text,jsonb)'::regprocedure)
 IS DISTINCT FROM 'a14a9cb8bd5044bd399f270e88d2d19f'
 OR encode(sha256(convert_to(pg_get_functiondef('public.trip_core_finite_read_state_guard()'::regprocedure),'UTF8')),'hex')
 IS DISTINCT FROM '41e240f6bd952c95066184fdc916d3fe19bf836eec77f78dcf7a52e69314b1b6'
 OR to_regprocedure('public.trip_member_claim_read_state_allowed(uuid)') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.trip_directed_invite_targets'::regclass
 AND attname IN ('claim_transaction_id','claim_backend_pid','claim_operation_id') AND NOT attisdropped)
 THEN RAISE EXCEPTION 'MEMBER_LINK_READ_STATE_PREIMAGE_DRIFT';END IF;
END $pre$;
ALTER TABLE public.trip_directed_invite_targets
 ADD COLUMN claim_transaction_id xid8, ADD COLUMN claim_backend_pid integer, ADD COLUMN claim_operation_id uuid,
 ADD CONSTRAINT member_claim_proof_complete CHECK (
  (claim_transaction_id IS NULL AND claim_backend_pid IS NULL AND claim_operation_id IS NULL)
  OR (claim_transaction_id IS NOT NULL AND claim_backend_pid IS NOT NULL AND claim_backend_pid>0
      AND claim_operation_id IS NOT NULL AND status='CLAIMED'));
"""
post = """DO $post$ DECLARE fn pg_proc%ROWTYPE; BEGIN
 SELECT * INTO STRICT fn FROM pg_proc WHERE oid='public.trip_member_claim_read_state_allowed(uuid)'::regprocedure;
 IF fn.proowner<>'postgres'::regrole OR NOT fn.prosecdef OR fn.prorettype<>'boolean'::regtype
  OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
  OR (SELECT count(*) FROM aclexplode(coalesce(fn.proacl,acldefault('f',fn.proowner))))<>1
  OR EXISTS(SELECT 1 FROM aclexplode(coalesce(fn.proacl,acldefault('f',fn.proowner))) a
    WHERE a.grantee<>fn.proowner OR a.grantor<>fn.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable)
 THEN RAISE EXCEPTION 'MEMBER_LINK_READ_STATE_HELPER_ACL_DRIFT';END IF;
END $post$;
"""
# Both old functions retain their exact owner/ACL. Unknown default helper grants abort this transaction.
split = preflight.index("ALTER TABLE public.trip_directed_invite_targets")
output = preflight[:split] + acl_checks + preflight[split:] + helper + "\n" + claim + "\n" + guard.rstrip().removesuffix(";") + ";\n" + acl_checks + post + "COMMIT;\n"
(folder / "INSTALL_CANDIDATE.sql").write_text(output)
def body_md5(sql, delimiter):
    return hashlib.md5(sql.split(delimiter)[1].encode()).hexdigest()

rollback = f"""-- Exact rollback only after runtime closure/no in-flight Claim; preserve business rows/receipts.
BEGIN;
SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='20s';
DO $rollback$ BEGIN
 IF current_user<>'postgres' OR current_setting('otr.auth.approved_project_ref',true) IS DISTINCT FROM 'tuqigdxrvrerfewsxqgm'
 OR current_setting('otr.auth.member_claim_read_state_gate',true) IS DISTINCT FROM 'OTR_C04_LINK_READ_STATE_V1'
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.trip_member_claim_transaction(text,jsonb)'::regprocedure)
 IS DISTINCT FROM '{body_md5(claim, '$$')}'
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.trip_core_finite_read_state_guard()'::regprocedure)
 IS DISTINCT FROM '{body_md5(guard, '$function$')}'
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.trip_member_claim_read_state_allowed(uuid)'::regprocedure)
 IS DISTINCT FROM '{body_md5(helper, '$proof$')}'
 OR EXISTS(SELECT 1 FROM public.trip_directed_invite_targets WHERE claim_transaction_id IS NOT NULL
   OR claim_backend_pid IS NOT NULL OR claim_operation_id IS NOT NULL)
 THEN RAISE EXCEPTION 'MEMBER_LINK_READ_STATE_ROLLBACK_DRIFT_OR_ACTIVE_PROOF';END IF;
END $rollback$;
""" + acl_checks + post + old_claim + "\n" + old_guard.rstrip().removesuffix(";") + ";\n" + """DROP FUNCTION public.trip_member_claim_read_state_allowed(uuid);
ALTER TABLE public.trip_directed_invite_targets DROP CONSTRAINT member_claim_proof_complete,
 DROP COLUMN claim_transaction_id, DROP COLUMN claim_backend_pid, DROP COLUMN claim_operation_id;
""" + acl_checks + "COMMIT;\n"
(folder / "ROLLBACK_CANDIDATE.sql").write_text(rollback)
print(hashlib.sha256(output.encode()).hexdigest())
