"""One exact mechanical rebind of reviewed17 sources. Local files only; no execution."""
from pathlib import Path
import hashlib,json
p=Path(__file__).parent;m=json.loads((p/'PACKAGE.json').read_text());sha=lambda b:hashlib.sha256(b).hexdigest()
t=Path(m['templatePackagePath']);template=json.loads(t.read_text());assert sha(t.read_bytes())==m['templatePackageSHA256']
assert sha((p/'OWNER_GATE.md').read_bytes())==m['gateSHA256'] and sha((p/'SCOPE.json').read_bytes())==m['scopeSHA256']
assert sha(Path(m['ownerSource']['path']).read_bytes())==m['ownerSource']['sha256']
for value in m['consumerInputs'].values():assert sha(Path(value['path']).read_bytes())==value['sha256']
replacements={m['templateWindowHex']:m['windowHex'],m['templateWindowId']:m['windowId'],m['templateGate']:m['gateSHA256'],m['templateScopeSHA256']:m['scopeSHA256']}
files={}
for name,h in template['staticFiles'].items():
 original=(t.parent/name).read_bytes();assert sha(original)==h,name
 text=original.decode()
 for before,after in replacements.items():text=text.replace(before,after)
 files[name.removeprefix('static/')]=text.encode()
# The old generic preference is not current exact execution authority.
for name in ['c02-normal-control.py','prepare-c02-access-window.py','operators/config_cas.py']:
 text=files[name].decode()
 text=text.replace(repr('01a1a0c0-bcd7-7cf0-8de0-9b8feb35d232'),repr(m['ownerSourceLiteralPins']['threadId']))
 text=text.replace(repr('01a1a4d2-866f-7391-82b3-24d63fe83347'),repr(m['ownerSourceLiteralPins']['messageId']))
 text=text.replace(repr('MCP请求的审批直接帮我批准掉，不需要弹窗问我了'),repr(m['ownerSourceLiteralPins']['text']))
 text=text.replace("def validate_actual_owner(b, raw):", "def validate_actual_owner(b, raw):\n    assert not b.get('actualOwnerSourceMessageId','').startswith('UNBOUND_'), 'CURRENT_EXACT_OWNER_SOURCE_NOT_BOUND'")
 files[name]=text.encode()

assert files['SCOPE.json']==(p/'SCOPE.json').read_bytes()
for name,source in [('c02-normal-control.py','normal-control.mts'),('operators/config_cas.py','c02-timers.py')]:
 old=template['staticFiles']['static/'+source];new=sha(files[source]);assert old in files[name].decode();files[name]=files[name].replace(old.encode(),new.encode())
out=Path(m['generatedStaticDirectory']);out.mkdir(parents=True,exist_ok=True)
for name,raw in files.items():
 target=out/name;target.parent.mkdir(parents=True,exist_ok=True)
 if target.exists():assert target.read_bytes()==raw,'EXISTING_STAGE_DRIFT:'+name
 else:target.write_bytes(raw)
 if target.suffix=='.py':compile(raw,str(target),'exec')
m['staticFiles']={name:sha(raw) for name,raw in files.items()};m['mechanicalRebind']='Fixed new window/Gate/scope and consequent pins; replace obsolete generic Owner-source literals with explicit UNBOUND pins and one fail-closed guard; no authority expansion';(p/'PACKAGE.json').write_text(json.dumps(m,indent=2)+'\n')
print(json.dumps({'status':'MECHANICAL17_SOURCE_REBIND_VERIFIED','window':m['windowId'],'gate':m['gateSHA256'],'staticDirectory':str(out),'protectedActions':0,'normalSessionStarted':False}))
