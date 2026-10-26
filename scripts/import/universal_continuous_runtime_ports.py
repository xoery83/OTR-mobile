"""Trusted SSH adapters for existing retained-container restore; no default execution."""
import json
import subprocess
import uuid
from pathlib import Path

HOST = 'root@178.105.151.143'
ROOT = '/opt/otr/dev-backend/private/universal-stage2-continuous'


def remote_python(source):
    value = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', HOST, 'python3', '-'],
                           input=source, text=True, capture_output=True, timeout=70)
    if value.returncode:
        # Raw environment/SQL/Provider values must never escape diagnostics.
        raise RuntimeError('REMOTE_RUNTIME_UNCONFIRMED')
    return json.loads(value.stdout)


def read_runtime(plan):
    safe = Path(__file__).with_name('universal_continuous_container.py').read_text()
    return remote_python(safe + '\nimport subprocess\n' +
                         "s=json.loads(subprocess.check_output(['docker','inspect','otr-dev-backend']))[0]\n" +
                         'print(json.dumps(safe_projection(s)))\n')


def stage_candidate(transition_id):
    if str(uuid.UUID(transition_id)) != transition_id:
        raise ValueError('EXACT_TRANSITION_ID')
    safe = Path(__file__).with_name('universal_continuous_container.py').read_text()
    result = remote_python(safe + '\ntransition_id=' + repr(transition_id) + '\n' + r'''
import subprocess,http.client,socket
s=json.loads(subprocess.check_output(['docker','inspect','otr-dev-backend']))[0]
keys=dict(line.strip().split('=',1) for line in open('/opt/otr/dev-backend/env/universal-provider-20261025.env') if line.strip())
proposed=payload(s,keys['OTR_DEV_DEEPSEEK_API_KEY'])
class Docker(http.client.HTTPConnection):
 def connect(self):
  self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);self.sock.settimeout(15);self.sock.connect('/var/run/docker.sock')
client=Docker('localhost',timeout=15)
client.request('POST','/v1.47/containers/create?name=otr-universal-candidate-'+transition_id,
               body=json.dumps(proposed),headers={'Content-Type':'application/json'})
response=client.getresponse();raw=response.read();client.close()
if response.status!=201:
 print(json.dumps({'status':'CREATE_REJECTED_RECONCILE_READONLY','httpStatus':response.status,
                   'category':'API_VERSION' if b'API version' in raw else 'DOCKER_CREATE_REJECTED'}));raise SystemExit(0)
identity=json.loads(raw)['Id']
candidate=json.loads(subprocess.check_output(['docker','inspect',identity]))[0]
if candidate['State']['Running'] or candidate['Image']!=IMAGE:raise ValueError('STAGED_IDENTITY_UNCONFIRMED')
if candidate['Config']['User']!=s['Config']['User'] or candidate['Config']['Cmd']!=s['Config']['Cmd'] or len(candidate['Mounts'])!=6:raise ValueError('STAGED_CONFIG_UNCONFIRMED')
print(json.dumps({'status':'FIXED_CANDIDATE_CREATED_NOT_STARTED','projection':safe_projection(candidate),'expectedRunningHostConfigSHA256':sha(canonical(proposed['HostConfig']))}))
''')
    if result.get('status') != 'FIXED_CANDIDATE_CREATED_NOT_STARTED':
        raise RuntimeError('CREATE_RECONCILE_READONLY_HTTP_' + str(result.get('httpStatus', 'UNKNOWN')))
    return result


def restore_retained(plan):
    # Keep inspect/environment in remote memory. Reuse the accepted exact-ID restore.
    body = Path(__file__).with_name('universal_runtime_close.py').read_text()
    body = body.split("if __name__", 1)[0]
    source = body + '\n' + 'plan=' + repr(plan) + '\n' + r'''
def call(args):
    return subprocess.check_output(args,text=True,stderr=subprocess.PIPE,timeout=35)
def check(snapshot,candidate):
    r=plan['runtime']
    expected={'configSHA256':r['activeConfigSHA256'] if candidate else r['baselineConfigSHA256'],
              'hostConfigSHA256':r.get('createdHostConfigSHA256',r['activeHostConfigSHA256']) if candidate and snapshot['State'].get('Status')=='created' else r['activeHostConfigSHA256'] if candidate else r['baselineHostConfigSHA256'],
              'mountsSHA256':r['activeMountsSHA256'] if candidate else r['baselineMountsSHA256']}
    actual={'configSHA256':sha(canonical(snapshot['Config'])),
            'hostConfigSHA256':sha(canonical(snapshot['HostConfig'])),
            'mountsSHA256':sha(canonical(sorted(snapshot['Mounts'],key=lambda m:(m['Destination'],m['Source']))))}
    image=r['imageId'] if candidate else r['baselineImageId']
    if actual!=expected or snapshot['Image']!=image:raise ValueError('EXACT_RUNTIME_DRIFT')
restore_retained(plan,call,check)
end=time.monotonic()+40
while time.monotonic()<end:
    s=json.loads(call(['docker','inspect',plan['runtime']['originalContainerId']]))[0]
    check(s,False)
    if s['State'].get('Health',{}).get('Status')=='healthy':break
    time.sleep(1)
else:raise ValueError('RESTORED_HEALTH_UNCONFIRMED')
print(json.dumps({'status':'RETAINED_ORIGINAL_RESTORED_VERIFIED'}))
'''
    return remote_python(source)


def admin_command(plan, phase, index):
    if phase not in ('activationCommands', 'closeCommands') or type(index) is not int or index < 0:
        raise ValueError('EXACT_COMMAND_SELECTION')
    digest = plan['operatorPlanSHA256']
    if len(digest) != 64 or any(c not in '0123456789abcdef' for c in digest):
        raise ValueError('EXACT_PLAN_SEAL')
    # All argv are fixed/scalar nonsecrets; operator obtains its own normal Session privately.
    args = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', HOST,
            'docker', 'run', '--rm', '--network', 'host', '--user', '0:0',
            '--entrypoint', 'node', '-v', ROOT + ':' + ROOT + ':rw',
            '-v', '/opt/otr/dev-backend/private/qa-auth/universal-stage2-20261025.json:/opt/otr/dev-backend/private/qa-auth/universal-stage2-20261025.json:ro',
            plan['runtime']['imageId'], ROOT + '/universal-continuous-operator.mjs', phase, str(index), digest]
    value = subprocess.run(args, text=True, capture_output=True, timeout=45)
    if value.returncode:
        raise RuntimeError('ADMIN_COMMAND_UNKNOWN_OR_REJECTED')
    result = json.loads(value.stdout)
    if result.get('status') != 'ACKNOWLEDGED_REQUIRES_INDEPENDENT_READBACK':
        raise RuntimeError('ADMIN_ACK_UNCONFIRMED')
    return result


def retain_diagnostics(plan, directory):
    """Retain the existing reviewed redacted startup evidence before candidate removal."""
    import importlib.util
    import inspect
    from universal_continuous_transition import canonical, sha, write_private
    path = Path(__file__).resolve().parents[1] / 'dev/metadata_closed_retry.py'
    spec = importlib.util.spec_from_file_location('resume_diagnostics', path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    code = 'import json,os,re,hashlib,hmac,subprocess\n'
    code += '\n'.join(inspect.getsource(getattr(module, name)) for name in ['redact', 'environment_projection', 'diagnostics'])
    code += '\nruntime=' + repr(plan['runtime']) + '\nartifact=' + repr(sha(canonical(plan))) + '\n' + r"""
p='/opt/otr/dev-backend/private/universal-stage2-continuous/resume-diagnostics-'+artifact+'.json'
if os.path.exists(p):
 assert os.stat(p).st_mode&511==384
 b=open(p,'rb').read()
else:
 s=json.loads(subprocess.check_output(['docker','inspect',runtime['stagedContainerId']]))[0]
 old=json.loads(subprocess.check_output(['docker','inspect',runtime['originalContainerId']]))[0]
 assert s['Id']==runtime['stagedContainerId'] and s['Image']==runtime['imageId']
 logs=subprocess.check_output(['docker','logs','--tail','60','--timestamps',s['Id']],stderr=subprocess.STDOUT,text=True,timeout=15)
 safe=diagnostics(s,logs,dict(v.split('=',1) for v in old['Config']['Env']),os.urandom(32))
 b=json.dumps(safe,sort_keys=True,separators=(',',':')).encode()
 fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'wb') as f:f.write(b)
print(json.dumps({'status':'REDACTED_DIAGNOSTICS_RETAINED','sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'path':p}))
"""
    receipt = remote_python(code)
    local = Path(directory) / 'diagnostics-receipt.json'
    if not local.exists(): write_private(local, receipt)
    return receipt
