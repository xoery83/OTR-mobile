"""Extend the fixed local continuous candidate with existing Sparse P2 roots.

Preparer only: no SQL execution, policy activation, airport enablement or new grants.
"""
import hashlib
import json
import re
from pathlib import Path
from build_continuous_review_candidate import build, once, rollback_sql, PACKET, ROOT


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def build_p2(preimages, additional):
    post = build(preimages)
    rows = {r['signature']: r for r in preimages['functions'] + additional}
    for row in rows.values():
        assert hashlib.md5(row['definition'].encode()).hexdigest() == row['md5']
    cap_sig = 'trip_sustained_import_p1_capabilities(uuid,uuid)'
    guard_sig = 'trip_sustained_import_p1_guard(text,text,jsonb,jsonb,uuid,uuid)'
    cap = post[cap_sig]
    cap = once(cap, "requested_family IN ('P1','P3','P4','P5','P6')", "requested_family IN ('P1','P2','P3','P4','P5','P6')")
    cap = once(cap, "'[\"P1\",\"P3\",\"P4\",\"P5\",\"P6\"]'::jsonb", "'[\"P1\",\"P2\",\"P3\",\"P4\",\"P5\",\"P6\"]'::jsonb")
    registry_start = cap.index(" AND (SELECT md5(pg_get_functiondef('public.trip_core_resolve_airport")
    registry_end = cap.index("\n THEN RETURN QUERY", registry_start)
    registry = cap[registry_start:registry_end]
    marker = "  THEN RETURN QUERY SELECT true,ARRAY['CREATE_ITEM']::text[],ARRAY[requested_family]"
    cap = once(cap, marker, "   AND (requested_family<>'P2' OR (true\n" + registry + "))\n  THEN RETURN QUERY SELECT true,ARRAY[CASE WHEN requested_family='P2' THEN 'CREATE_SPARSE_FLIGHT' ELSE 'CREATE_ITEM' END]::text[],ARRAY[requested_family]")
    post[cap_sig] = cap

    guard = post[guard_sig]
    start = guard.index(" IF family='P2' THEN")
    end = guard.index("  RETURN;\n END IF;", start) + len("  RETURN;\n END IF;")
    branch = guard[start:end]
    scope_json = re.search(r"p2_live:=coalesce\(review_scope-'expiresAt'='([^']+)'::jsonb", branch).group(1)
    envelope_json = re.search(r"p2_q->'universalP2' IS DISTINCT FROM '([^']+)'::jsonb", branch).group(1)
    old_scope = json.loads(scope_json)
    branch = branch.replace(literal(scope_json)+'::jsonb', "(p2_scope-ARRAY['publicationEnvelope'])")
    branch = branch.replace(literal(envelope_json)+'::jsonb', "(p2_scope->'publicationEnvelope')")
    # Exact per-object values move to an immutable owning-publication-derived scope.
    for key, value in old_scope.items():
        if key in ('family', 'tripId'):
            continue
        branch = branch.replace(literal(value), "(p2_scope->>" + literal(key) + ")")
    branch = branch.replace("'NZ501'", "(p2_scope->>'flightNumberLiteral')").replace("'2026-11-02'", "(p2_scope->>'localDate')")
    branch = once(branch, "rr.scope_source_ids=ARRAY[s.id]", "s.id=ANY(rr.scope_source_ids)")
    branch = once(branch, "p2_live:=coalesce(review_scope-'expiresAt'=(p2_scope-ARRAY['publicationEnvelope']) AND", "p2_live:=coalesce((review_scope->>'mode'='CONTINUOUS_MINIMUMS' OR review_scope-'expiresAt'=(p2_scope-ARRAY['publicationEnvelope'])) AND")
    initialize = " p2_scope:=" + literal(scope_json) + "::jsonb || jsonb_build_object('publicationEnvelope'," + literal(envelope_json) + "::jsonb);\n"
    derive = (PACKET/'P2_SCOPE_DERIVATION.sql').read_text()
    branch = once(branch," IF family='P2' THEN\n", " IF family='P2' THEN\n" + initialize + derive)
    guard = guard[:start] + branch + guard[end:]
    guard = once(guard, 'p2_receipt public.trip_core_command_receipts;', 'p2_scope jsonb;dynamic_p2 jsonb;identity_key text;identity_purpose text;identity_bytes bytea;identity_hex text;\np2_receipt public.trip_core_command_receipts;')
    post[guard_sig] = guard

    # Historical association retains receipt, exact Source/Run/candidate/slot and evidence checks.
    sig = 'trip_core_guard_historical_source_association()'
    historical = rows[sig]['definition']
    start = historical.index(" and pp.request_sha256='42bccecc")
    end = historical.index("::uuid))))))",start) + len('::uuid')
    historical = historical[:start] + """
 and pp.request_sha256=public.trip_source_hash('otr-trip-core-source-publication-v2',pp.request_json)
 and pp.request_json->'universalP2'->>'version'='otr.universal.p2-source-proposal/1'
 and pp.request_json->'universalP2'->>'runId'=r.id::text
 and pp.request_json->'universalP2'->>'batchId'=r.capture_batch_id::text
 and pp.request_json->'universalP2'->>'taskId'=r.interpretation_task_id::text
 and pp.request_json->'universalP2'->>'resultSha256' ~ '^[a-f0-9]{64}$'
 and pp.request_json->'universalP2'->'sourceReview'->>'decision'='NEW'
 and pp.request_json->'universalP2'->'sourceReview'->'originalReviewed'='true'::jsonb
 and pp.request_json->'universalP2'->'sourceReview'->'tripReviewed'='true'::jsonb""" + historical[end:]
    post[sig] = historical

    sig = 'trip_core_publication_guard()'
    publication = rows[sig]['definition']
    start = publication.index(" if exists(select 1 from public.trip_source_runs rr where rr.id=new.run_id and rr.extractor_key='otr-universal-interpretation-v1') and\n")
    end = publication.index(" then raise exception 'P2_UNIVERSAL_BINDING_REQUIRED'", start)
    publication = publication[:start] + """
 if exists(select 1 from public.trip_source_runs rr where rr.id=new.run_id and rr.extractor_key='otr-universal-interpretation-v1') and
 (new.request_json->'universalP2'->>'version' IS DISTINCT FROM 'otr.universal.p2-source-proposal/1'
 or new.request_json->'universalP2'->>'runId' IS DISTINCT FROM new.run_id::text
 or new.request_json->'universalP2'->'sourceReview'->>'decision' IS DISTINCT FROM 'NEW'
 or new.request_json->'universalP2'->'sourceReview'->'originalReviewed' IS DISTINCT FROM 'true'::jsonb
 or new.request_json->'universalP2'->'sourceReview'->'tripReviewed' IS DISTINCT FROM 'true'::jsonb
 or coalesce(new.request_json->'universalP2'->>'resultSha256','') !~ '^[a-f0-9]{64}$')
""" + publication[end:]
    pending = re.search(r"r\.id='8af82103[^']+'::uuid and r\.capture_batch_id='[^']+'::uuid and r\.interpretation_task_id='[^']+'::uuid and new\.request_json->'universalP2'='[^']+'::jsonb", publication)
    assert pending
    publication = publication[:pending.start()] + """r.id::text=new.request_json->'universalP2'->>'runId'
 and r.capture_batch_id::text=new.request_json->'universalP2'->>'batchId'
 and r.interpretation_task_id::text=new.request_json->'universalP2'->>'taskId'""" + publication[pending.end():]
    post[sig] = publication

    sig = 'trip_core_finite_read_state_guard()'
    state = rows[sig]['definition']
    # Native's P3 arm must be supplied as the baseline once fixed/installed; do not drop it.
    for key, value in [('operation','50bfe576-c16d-8645-8cde-a355da5f13f9'),('target_item','ec73e4fd-c580-8063-96a8-ef7accda3748'),('source_intent','0886cd6b-02c1-8dc3-ba1e-29bc6543c6f4')]:
        state = once(state, " AND current_setting('otr.core."+key+"',true)="+literal(value), '')
    post[sig] = state
    resolver_row = json.loads((PACKET/'AIRPORT_RESOLVER_PREIMAGE.json').read_text())
    resolver = resolver_row['definition']
    assert hashlib.md5(resolver.encode()).hexdigest()==resolver_row['md5']
    old = "and service_date='2026-11-02'::date))"
    expiry = """and service_date='2026-11-02'::date AND EXISTS(
 select 1 from public.trip_sustained_dev_policy p where p.actor_account_id=actor and p.enabled and p.revoked_at is null and p.universal_p1_import_enabled
 and p.universal_p1_review_scope->>'tripId'=trip::text
 and (p.universal_p1_review_scope->>'expiresAt')::timestamptz>clock_timestamp()
 and (p.universal_p1_review_scope->>'family'='P2' or (p.universal_p1_review_scope->>'mode'='CONTINUOUS_MINIMUMS'
 and p.universal_p1_review_scope->'version'='1'::jsonb and p.universal_p1_review_scope->'families'='["P1","P2","P3","P4","P5","P6"]'::jsonb)))))"""
    resolver = once(resolver,old,expiry)
    post[resolver_row['signature']] = resolver
    # Capability pins the exact resolver implementation as before, now with SQL self-expiry.
    post[cap_sig] = post[cap_sig].replace(resolver_row['md5'],hashlib.md5(resolver.encode()).hexdigest())
    return post


def main():
    pre = json.loads((PACKET/'DEV_PREIMAGES.json').read_text())
    additional = json.loads((PACKET/'P2_ADDITIONAL_PREIMAGES.json').read_text())
    # Preserve the Native sole Writer's fixed P3 arm; live CAS must confirm this baseline before installation.
    baseline = json.loads((PACKET/'NATIVE_READ_STATE_BASELINE.json').read_text())
    native = (PACKET/'NATIVE_READ_STATE_BASELINE.sql').read_text()
    assert hashlib.md5(native.encode()).hexdigest()==baseline['md5']
    additional = [{**row,'definition':native,'md5':baseline['md5'],'baselineSourceCommit':baseline['sourceCommit']} if row['signature']==baseline['signature'] else row for row in additional]
    post = build_p2(pre, additional)
    (PACKET/'CONTINUOUS_REVIEW_POSTIMAGES_CANDIDATE.json').write_text(json.dumps(post,indent=2)+'\n')
    merged = {**pre,'functions':pre['functions']+additional+[json.loads((PACKET/'AIRPORT_RESOLVER_PREIMAGE.json').read_text())]}
    rollback = rollback_sql(merged,post).replace("'P5_ITEM','P6_ITEM')","'P5_ITEM','P6_ITEM','FLIGHT_OCCURRENCE')")
    (PACKET/'CONTINUOUS_REVIEW_ROLLBACK_CANDIDATE.sql').write_text(rollback)
    print(json.dumps({'status':'SIX_FAMILY_CANDIDATE_NOT_GATE_READY','functions':{sig:hashlib.md5(body.encode()).hexdigest() for sig,body in post.items()},'activated':False}))


if __name__=='__main__':
    main()
