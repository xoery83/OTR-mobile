"""Wire reviewed transition ports to existing DEV transports; watch is explicit."""
import argparse
import json
from pathlib import Path
from universal_scope_close import SqlTransport, quote
from universal_continuous_transition import validate, watch, handoff, close_transition, private
from universal_continuous_sql_ports import create_sql_ports, validate_sql_plan
from universal_continuous_runtime_ports import admin_command, read_runtime, restore_retained, remote_python
import universal_qa_policy


def one(value, key):
    if not isinstance(value, dict) or len(value.get('rows', [])) != 1 or set(value['rows'][0]) != {key}:
        raise ValueError('EXACT_READBACK_REQUIRED')
    return value['rows'][0][key]


def verified_retained_source_probe(value, actor):
    return value == {'version': 'otr.qa.source-reader-probe/1',
                     'status': 'PROTECTED_SOURCE_READER_ROUNDTRIP_VERIFIED',
                     'actorId': actor, 'tripId': '825f79b2-4a9d-4535-a62e-43000ca50c4a',
                     'batchId': '8b91dbf8-cb7d-4f72-a54c-ed78e5753f4b', 'sourceCount': 2,
                     'taskOrAdmissionQualification': 'NOT_EVALUATED'} and type(value.get('sourceCount')) is int


def ports(plan, directory):
    validate(plan); validate_sql_plan(plan)
    sql = SqlTransport('/Users/xoery/Project/otr-mobile/node_modules/.bin/supabase',
                       '/Users/xoery/Project/otr-mobile-canonical', directory)

    def invoke(x):
        commands = plan['providerControl']['closeCommands']
        return admin_command(plan, 'closeCommands', commands.index(x))

    def retained_source_probe():
        # Read existing admitted sources only. This does not validate an expired Task.
        source = 'image=' + repr(plan['runtime']['imageId']) + '\n' + r"""
import json,subprocess
root='/opt/otr/dev-backend/private/universal-stage2-continuous'
args=['docker','run','--rm','--network','host','--user','0:0','--entrypoint','node',
 '-v',root+':'+root+':rw',
 '-v','/opt/otr/dev-backend/private/qa-auth/universal-stage2-20261025.json:/opt/otr/dev-backend/private/qa-auth/universal-stage2-20261025.json:ro',
 image,root+'/universal-stage2-qa-entry.mjs','readiness']
r=subprocess.run(args,capture_output=True,text=True,timeout=45)
if r.returncode:raise ValueError('SOURCE_READER_PROBE_FAILED')
v=json.loads(r.stdout)
print(json.dumps(v))
"""
        return verified_retained_source_probe(remote_python(source), plan['actorId'])

    def source_probe(_):
        if "recoveryPreimages" in plan:
            return retained_source_probe()
        # A newly persisted owning Run, not a caller-supplied Source snapshot.
        value = one(sql("BEGIN READ ONLY; SELECT (SELECT jsonb_build_object('tripId',trip_id,'batchId',capture_batch_id,'taskId',interpretation_task_id) FROM public.trip_source_runs WHERE actor_account_id=" + quote(plan['actorId']) + "::uuid AND created_at>=" + quote(plan['startsAt']) + "::timestamptz AND extractor_key='otr-universal-interpretation-v1' ORDER BY created_at DESC LIMIT 1) AS run; COMMIT;"), 'run')
        if value is None: return False
        source = 'run=' + repr(value) + '\nexpected_actor=' + repr(plan['actorId']) + '\n' + r'''
import json,urllib.request
a=json.load(open('/opt/otr/dev-backend/private/qa-auth/universal-stage2-20261025.json'))
if a['accountId']!=expected_actor:raise ValueError('EXACT_QA_ACTOR_REQUIRED')
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
opener=urllib.request.build_opener(NoRedirect)
url='https://api-dev.xoery.art/v2/import-batches/'+run['batchId']+'/interpretations?tripId='+run['tripId']
request=urllib.request.Request(url,headers={'Authorization':'Bearer '+a['session']['access_token']})
with opener.open(request,timeout=15) as response:
 result=json.load(response)
print(json.dumps({'verified':result.get('version')=='otr.backend.universal-context/1' and result.get('accountId')==a['accountId'] and result.get('actorId')==a['accountId'] and result.get('taskId')==run['taskId'] and result.get('tripId')==run['tripId'] and result.get('batchId')==run['batchId']}))
'''
        return remote_python(source).get('verified') is True

    def budget(_):
        p = plan['providerControl']; scope = p['scopeActiveRow']; grant = p['grantActiveRow']
        # Compare complete actual rows, including expiry, pins and all cost/call ceilings.
        literal = lambda row: quote(json.dumps(row, sort_keys=True, separators=(',', ':'))) + '::jsonb'
        verified = one(sql("BEGIN READ ONLY; SELECT EXISTS(SELECT 1 FROM public.flight_activation_scopes s JOIN public.flight_activation_account_grants g USING(scope_id) WHERE to_jsonb(s)=to_jsonb(jsonb_populate_record(null::public.flight_activation_scopes," + literal(scope) + ")) AND to_jsonb(g)=to_jsonb(jsonb_populate_record(null::public.flight_activation_account_grants," + literal(grant) + "))) AS verified; COMMIT;"), 'verified')
        if verified is not True: raise ValueError('ACTUAL_BUDGET_BINDING_UNAVAILABLE')
        return {'scopeId': plan['scopeId'], 'expiresAt': plan['providerExpiresAt'], 'bounds': plan['budget'],
                'sourceAndUsageBindingVerified': True}

    result = create_sql_ports(plan, sql, invoke, normal_service_probe=source_probe)
    original_source = result['read_source']
    def all_new_policy_capabilities(p):
        source = original_source(p)
        state = one(sql(universal_qa_policy.readback_sql(plan)), 'policy')
        # A closed Universal flag alone cannot prove the newly enrolled Core policy closed.
        source['policyEnabled'] = source['policyEnabled'] or state['closed'] is not True
        return source
    result['read_source'] = all_new_policy_capabilities
    result['disable_policy'] = lambda _: sql(universal_qa_policy.close_sql(plan))
    def restore_with_diagnostics(_):
        from universal_continuous_runtime_ports import retain_diagnostics
        retain_diagnostics(plan, directory)
        return restore_retained(plan)
    result.update(read_runtime=lambda _: read_runtime(plan), restore_retained=restore_with_diagnostics, read_budget=budget)
    if plan.get('approvedResumeGateSHA256'):
        from universal_resume_contingency import run
        result['rescue_cleanup'] = lambda _: run(plan, directory)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['watch', 'handoff', 'close'])
    parser.add_argument('--run-dir', required=True)
    parser.add_argument('--plan-sha', required=True)
    args = parser.parse_args()
    directory = private(args.run_dir, True)
    plan = json.loads(private(directory / 'plan.json').read_text())
    from universal_continuous_transition import sha, canonical
    if sha(canonical(plan)) != args.plan_sha: raise ValueError('EXACT_PLAN_HASH_REQUIRED')
    adapter = ports(plan, str(directory))
    if args.action == 'watch': result = watch(directory, args.plan_sha, adapter)
    elif args.action == 'handoff': result = handoff(plan, directory, adapter)
    else: result = close_transition(plan, directory, adapter)
    print(json.dumps(result))


if __name__ == '__main__':
    try: main()
    except Exception:
        print(json.dumps({'status': 'EXECUTION_UNCONFIRMED_RECONCILE_READONLY'}))
        raise SystemExit(2)
