"""Proposed exact new-Actor policy delta. Pure SQL, never default activation.

Signup is not policy authority. This requires a separate Owner scope approval.
"""
from universal_scope_close import quote
from universal_continuous_transition import ACTOR, instant, canonical, sha

CUTOFF = '2026-10-25T06:15:00Z'


def _binding(plan):
    if (plan.get('actorId') != ACTOR or plan.get('project') != 'tuqigdxrvrerfewsxqgm'
            or plan.get('policyActiveRow') != {'actor_account_id': ACTOR, 'enabled': True,
                'adoption_cutoff': CUTOFF, 'revoked_at': None, 'universal_import_enabled': True}):
        raise ValueError('EXACT_NEW_QA_POLICY_REQUIRED')
    start, end = instant(plan['startsAt']), instant(plan['adminControl']['expiresAt'])
    if not 0 < end - start <= 900 or instant(CUTOFF) > start:
        raise ValueError('EXACT_POLICY_WINDOW_REQUIRED')
    return quote(ACTOR) + '::uuid'


def activate_sql(plan):
    actor = _binding(plan)
    start, end, cutoff = map(quote, (plan['startsAt'], plan['adminControl']['expiresAt'], CUTOFF))
    return f"""BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='20s';
SELECT pg_advisory_xact_lock(714025,3);
DO $qa$ BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'QA_POLICY_OPERATOR_REQUIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.trip_sustained_dev_policy'::regclass
   AND attname='universal_import_enabled' AND NOT attisdropped) THEN
  RAISE EXCEPTION 'QA_POLICY_SCHEMA_REQUIRED';
 END IF;
 IF clock_timestamp()<{start}::timestamptz OR clock_timestamp()>={end}::timestamptz-interval '240 seconds' THEN RAISE EXCEPTION 'QA_POLICY_WINDOW_CLOSED';END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id={actor} AND email_confirmed_at IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id={actor} AND account_role='free_user') THEN RAISE EXCEPTION 'NORMAL_QA_PROFILE_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE actor_account_id={actor}) THEN RAISE EXCEPTION 'QA_POLICY_ALREADY_EXISTS_RECONCILE_ONLY';END IF;
 IF EXISTS(SELECT 1 FROM public.trip_create_receipts WHERE actor_account_id={actor}) THEN RAISE EXCEPTION 'QA_TRIP_PREIMAGE_NOT_EMPTY';END IF;
END $qa$;
INSERT INTO public.trip_sustained_dev_policy(actor_account_id,enabled,adoption_cutoff,revoked_at,universal_import_enabled)
VALUES({actor},true,{cutoff}::timestamptz,NULL,true);
COMMIT;"""


def close_sql(plan):
    actor = _binding(plan)
    cutoff = quote(CUTOFF)
    # Close all capabilities newly introduced by this policy, not only Universal.
    return f"""BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='20s';
SELECT pg_advisory_xact_lock(714025,3);
DO $qa$ BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'QA_POLICY_OPERATOR_REQUIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.trip_sustained_dev_policy'::regclass
   AND attname='universal_import_enabled' AND NOT attisdropped) THEN
  IF EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE actor_account_id={actor})
  THEN RAISE EXCEPTION 'QA_POLICY_PREIMAGE_DRIFT';END IF;
  RETURN;
 END IF;
 PERFORM 1 FROM public.trip_sustained_dev_policy WHERE actor_account_id={actor} FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE actor_account_id={actor}
  AND (adoption_cutoff IS DISTINCT FROM {cutoff}::timestamptz
       OR NOT ((enabled AND universal_import_enabled AND revoked_at IS NULL)
               OR (NOT enabled AND NOT universal_import_enabled AND revoked_at IS NOT NULL))))
 THEN RAISE EXCEPTION 'QA_POLICY_PREIMAGE_DRIFT';END IF;
 EXECUTE 'UPDATE public.trip_sustained_dev_policy SET enabled=false,universal_import_enabled=false,revoked_at=clock_timestamp() WHERE actor_account_id=$1 AND enabled AND universal_import_enabled AND revoked_at IS NULL' USING {actor};
END $qa$;
COMMIT;"""


def readback_sql(plan):
    actor = _binding(plan)
    return f"""BEGIN READ ONLY;
SELECT jsonb_build_object('present',EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE actor_account_id={actor}),
 'closed',NOT EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE actor_account_id={actor}
   AND (enabled OR COALESCE((to_jsonb(trip_sustained_dev_policy)->>'universal_import_enabled')::boolean,false) OR revoked_at IS NULL OR adoption_cutoff IS DISTINCT FROM {quote(CUTOFF)}::timestamptz))) AS policy;
COMMIT;"""


def resume_sql(plan, closed_preimage, approved_trip_receipt=None):
    """Same approved policy only, after a positively verified failed-run closure."""
    actor = _binding(plan)
    expected = {'actor_account_id': ACTOR, 'enabled': False,
                'adoption_cutoff': CUTOFF.replace('Z', '+00:00'),
                'universal_import_enabled': False,
                'revoked_at': closed_preimage.get('revoked_at')}
    if closed_preimage != expected or not isinstance(expected['revoked_at'], str):
        raise ValueError('EXACT_FAILED_RUN_CLOSED_POLICY_REQUIRED')
    revoked = instant(expected['revoked_at'].replace('+00:00', 'Z'))
    if not instant(CUTOFF) <= revoked <= instant(plan['startsAt']):
        raise ValueError('PRIOR_CLOSURE_RECEIPT_REQUIRED')
    row = quote(__import__('json').dumps(closed_preimage, sort_keys=True, separators=(',', ':')))
    trip_guard = f"EXISTS(SELECT 1 FROM public.trip_create_receipts WHERE actor_account_id={actor})"
    if approved_trip_receipt is not None:
        r = approved_trip_receipt
        if (set(r) != {'actor_account_id','created_at','operation_id','request_payload','trip_id'}
                or r['actor_account_id'] != ACTOR or r['trip_id'] != '825f79b2-4a9d-4535-a62e-43000ca50c4a'
                or r['operation_id'] != 'ca52729b-b36b-4c30-b9f1-240c19b5e35e'
                or sha(canonical(r['request_payload'])) != '8f85a26b0f95db50e06248b8e2faa489be0555a38d8634dc5d0564e0f5127e3f'):
            raise ValueError('EXACT_ALREADY_ACCEPTED_QA_TRIP_RECEIPT_REQUIRED')
        literal = quote(canonical(r).decode())
        trip = quote(r['trip_id'])+'::uuid'
        trip_guard = f"""(SELECT count(*) FROM public.trip_create_receipts WHERE actor_account_id={actor})<>1
 OR NOT EXISTS(SELECT 1 FROM public.trip_create_receipts r WHERE actor_account_id={actor}
   AND to_jsonb(r)=to_jsonb(jsonb_populate_record(null::public.trip_create_receipts,{literal}::jsonb)))
 OR NOT EXISTS(SELECT 1 FROM public.trips WHERE id={trip} AND created_by={actor})
 OR NOT EXISTS(SELECT 1 FROM public.journey_members WHERE trip_id={trip} AND user_id={actor}
   AND status='linked' AND role='owner')"""
    return f"""BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='20s';
SELECT pg_advisory_xact_lock(714025,3);
DO $qa$ BEGIN
 IF current_user<>'postgres' OR clock_timestamp()<{quote(plan['startsAt'])}::timestamptz
 OR clock_timestamp()>={quote(plan['adminControl']['expiresAt'])}::timestamptz-interval '240 seconds'
 THEN RAISE EXCEPTION 'QA_POLICY_RECOVERY_WINDOW';END IF;
 PERFORM 1 FROM public.trip_sustained_dev_policy WHERE actor_account_id={actor} FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy p WHERE actor_account_id={actor}
   AND to_jsonb(p)=to_jsonb(jsonb_populate_record(null::public.trip_sustained_dev_policy,{row}::jsonb)))
 OR {trip_guard}
 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id={actor} AND email_confirmed_at IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id={actor} AND account_role='free_user')
 THEN RAISE EXCEPTION 'QA_POLICY_EXACT_RECOVERY_PREIMAGE';END IF;
END $qa$;
UPDATE public.trip_sustained_dev_policy SET enabled=true,universal_import_enabled=true,revoked_at=NULL
WHERE actor_account_id={actor};COMMIT;"""
