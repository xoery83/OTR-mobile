"""One exact mechanical rebind of reviewed17 sources. Local files only; no execution."""
from pathlib import Path
import hashlib,json
p=Path(__file__).parent;m=json.loads((p/'PACKAGE.json').read_text());sha=lambda b:hashlib.sha256(b).hexdigest()
t=Path(m['templatePackagePath']);template=json.loads(t.read_text());assert sha(t.read_bytes())==m['templatePackageSHA256']
assert sha((p/'OWNER_GATE.md').read_bytes())==m['gateSHA256'] and sha((p/'SCOPE.json').read_bytes())==m['scopeSHA256']
for value in m['consumerInputs'].values():assert sha(Path(value['path']).read_bytes())==value['sha256']
replacements={m['templateWindowHex']:m['windowHex'],m['templateWindowId']:m['windowId'],m['templateGate']:m['gateSHA256'],m['templateScopeSHA256']:m['scopeSHA256']}
files={}
for name,h in template['staticFiles'].items():
 original=(t.parent/name).read_bytes();assert sha(original)==h,name
 text=original.decode()
 for before,after in replacements.items():text=text.replace(before,after)
 files[name.removeprefix('static/')]=text.encode()
assert files['SCOPE.json']==(p/'SCOPE.json').read_bytes()
for name,source in [('c02-normal-control.py','normal-control.mts'),('operators/config_cas.py','c02-timers.py')]:
 old=template['staticFiles']['static/'+source];new=sha(files[source]);assert old in files[name].decode();files[name]=files[name].replace(old.encode(),new.encode())
out=Path(m['generatedStaticDirectory']);out.mkdir(parents=True,exist_ok=True)
for name,raw in files.items():
 target=out/name;target.parent.mkdir(parents=True,exist_ok=True)
 if target.exists():assert target.read_bytes()==raw,'EXISTING_STAGE_DRIFT:'+name
 else:target.write_bytes(raw)
 if target.suffix=='.py':compile(raw,str(target),'exec')
m['staticFiles']={name:sha(raw) for name,raw in files.items()};m['mechanicalRebind']='Only fixed window/Gate/scope literals and consequent entry/timer byte pins; no behavior or authority expansion';(p/'PACKAGE.json').write_text(json.dumps(m,indent=2)+'\n')
print(json.dumps({'status':'MECHANICAL17_SOURCE_REBIND_VERIFIED','window':m['windowId'],'gate':m['gateSHA256'],'staticDirectory':str(out),'protectedActions':0,'normalSessionStarted':False}))
