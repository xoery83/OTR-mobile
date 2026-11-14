"""Focused rebind checks only; reuses reviewed behavior, no Auth/Root2 actions."""
import ast,hashlib,json,time,runpy
from pathlib import Path
p=Path(__file__).parent;m=json.loads((p/'PACKAGE.json').read_text());r=Path(m['generatedStaticDirectory']);sha=lambda b:hashlib.sha256(b).hexdigest()
for name,h in m['staticFiles'].items():assert sha((r/name).read_bytes())==h,name
assert len(m['staticFiles'])==17 and sha((p/'OWNER_GATE.md').read_bytes())==m['gateSHA256'] and sha((p/'SCOPE.json').read_bytes())==m['scopeSHA256']
for obj in m['consumerInputs'].values():assert sha(Path(obj['path']).read_bytes())==obj['sha256']
t=ast.parse((r/'operators/config_cas.py').read_text());fn=next(n for n in t.body if isinstance(n,ast.FunctionDef) and n.name=='validate_config');ctx={'json':json,'time':time};exec(compile(ast.Module(body=[fn],type_ignores=[]),'read-only-config','exec'),ctx)
q={'plan':{'gateSHA256':m['gateSHA256'],'windowId':m['windowId'],'startsAt':1000,'normalCloseAt':1681000,'expiresAt':1801000,'command':None},'confirmations':[]};ctx['validate_config'](json.dumps(q),'ChatGPT',1000,'EMPTY',now=2000)
for phase in ['CREATE','EDIT']:
 try:ctx['validate_config'](json.dumps(q),'ChatGPT',1000,phase,now=2000)
 except AssertionError:pass
 else:raise AssertionError('NONEMPTY_PHASE_ACCEPTED')
c={n.targets[0].id:n.value.value for n in t.body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and isinstance(n.value,ast.Constant)};assert c['C02_HOST_SHA']==m['hostSHA256'] and c['C02_TIMERS_SHA']==sha((r/'c02-timers.py').read_bytes())
timers=runpy.run_path(str(r/'c02-timers.py'),run_name='pure_rebind_check');pointer={'gateSHA256':m['gateSHA256'],'windowId':m['windowHex'],'deadlineMs':1801000,'planSHA256':'a'*64,'defaultContainerId':'b'*64,'defaultConfigSHA256':'c'*64};restore={'beforeContainerId':'b'*64,'beforeConfigSHA256':'c'*64,'beforeImage':'sha256:'+'d'*64,'candidateImage':'sha256:'+'d'*64};assert timers['validate'](q,pointer,restore,'a'*64,1000)==q['plan']
print('17 exact derived sources/Gate/scope/consumer facts/entry+timer pins and EMPTY-only/newtimer binding PASS; zero Auth/OTP/network/clock; prior61/9/12 behavior tests reused, not rerun')
