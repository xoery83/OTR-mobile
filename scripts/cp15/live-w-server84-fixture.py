"""LIVE-W synthetic sidecar; ONLY a task-owned network-none PostgreSQL fixture.
No host credentials, provider network or application session provisioning.
"""
from pathlib import Path
import json, subprocess, sys
root = Path(__file__).resolve().parents[2]
container = 'otr-live-w-server84'
assert subprocess.check_output(['docker', 'inspect', container, '--format', '{{.HostConfig.NetworkMode}}'], text=True).strip() == 'none'
data = json.load(sys.stdin)
def sql(body, user='supabase_admin'):
    result = subprocess.run(['docker', 'exec', '-i', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', 'postgres'], input=body, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError('LIVE_W_SERVER84_REJECTED')
    return result.stdout.strip()
def literal(value):
    return "'" + json.dumps(value, separators=(',', ':')).replace("'", "''") + "'::jsonb"
if sys.argv[1] == 'init':
    source = (root/'scripts/cp15/security-acceptance.py').read_text().split('select(scope)\n')[0]
    source = source.replace("'otr-cp15-acceptance'", repr(container))
    source = source.replace("exec(compile(source,str(root/'scripts/cp14/persistence-acceptance.py'),'exec'))", "source=source.replace('actor=uid();', 'actor='+repr(DATA['account'])+';');exec(compile(source,str(root/'scripts/cp14/persistence-acceptance.py'),'exec'))")
    namespace = {'__file__': str(root/'scripts/cp15/security-acceptance.py'), 'DATA': data}
    exec(compile(source, namespace['__file__'], 'exec'), namespace)
    scope = namespace['scope']
    scope.update(scope_id=data['remote']['scope_id'], pins=data['pins'], monetary_approved=True,
                 call_cost_nanos='1000000000', account_day_cost_nanos='1000000000', dev_day_cost_nanos='1000000000',
                 account_daily=1, dev_daily=1, provider_daily=1)
    # Align admitted provider/price IDs using the existing exact immutable row refs.
    scope = namespace['seal'](scope)
    namespace['invoke']('flight_activation_select', namespace['admin'](integration_id='cp15-flight', expected_version=0, row=scope))
    grant = dict(scope_id=scope['scope_id'], account_id=data['account'], revision=1, expires_at=namespace['FUTURE'], revoked=False, updated_by=data['account'])
    namespace['invoke']('flight_activation_account_grant', namespace['admin'](integration_id='cp15-flight', expected_version=0, row=grant))
    namespace['sql'](f"insert into public.trips(id,name,created_by) values('{data['trip']}','LIVE-W synthetic','{data['account']}');")
    print(json.dumps({'scope': scope, 'integration': namespace['i'], 'provider': namespace['p'], 'price': namespace['price']}))
elif sys.argv[1] == 'invoke':
    kind = data['kind']
    assert kind in ['flight_activation_reserve_call', 'external_integration_mark_dispatch', 'external_integration_usage_append', 'external_integration_observe_call']
    print(sql(f"set session authorization otr_external_integration_call_gateway; select public.{kind}({literal(data['context'])},{literal(data['command'])});"))
elif sys.argv[1] == 'readback':
    import uuid
    call = str(uuid.UUID(data['call']))
    print(sql(f"select json_build_object('call_id',c.call_id,'dispatch_state',c.dispatch_state,'starts',(select count(*) from public.external_integration_usage_events where call_id=c.call_id and observation_kind='START'),'holds',(select count(*) from public.flight_call_resource_holds where call_id=c.call_id),'usage',public.cp14_usage_projection(c.call_id)) from public.external_integration_calls c where c.call_id='{call}';", 'postgres'))
elif sys.argv[1] == 'start':
    import uuid
    call = str(uuid.UUID(data['call']))
    print(sql(f"select json_build_object('call_id',c.call_id,'request_sha256',c.request_sha256,'admission_sha256',c.admission_sha256,'start_sha256',u.observation_sha256,'dispatch_state',c.dispatch_state,'start_durable',true) from public.external_integration_calls c join public.external_integration_usage_events u on u.call_id=c.call_id and u.observation_kind='START' where c.call_id='{call}';", 'postgres'))
else:
    raise RuntimeError('FIXTURE_COMMAND_DENIED')
