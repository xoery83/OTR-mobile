"""Fresh-only qualification checks. No Auth, Docker, timers, network or writes."""
import ast,copy,hashlib,json,time,uuid
from pathlib import Path
p=Path(__file__).parent;r=p/'static';m=json.loads((p/'PACKAGE.json').read_text());sha=lambda b:hashlib.sha256(b).hexdigest();raw=lambda x:json.dumps(x,ensure_ascii=False).encode()
wire={'sourceThreadId':'01a1a0c0-bcd7-7cf0-8de0-9b8feb35d232','messageId':'01a1a4d2-866f-7391-82b3-24d63fe83347','text':'MCP请求的审批直接帮我批准掉，不需要弹窗问我了'}
b={'approvedExecutionGateSHA256':m['gateSHA256'],'scopeSHA256':m['scopeSHA256'],'taskEvidenceSHA256':m['taskEvidenceSHA256'],'requestScope':'FRESH_READ_PREVIEW_ONLY','readPreviewOnlyApproved':True,'saveApproved':False,'replayAuthorized':False,'rootSourceReadbackVerified':True,'actualOwnerSourceThreadId':wire['sourceThreadId'],'actualOwnerSourceMessageId':wire['messageId'],'actualOwnerWireSHA256':sha(raw(wire))}
count=0
for name in ['c02-normal-control.py','prepare-c02-access-window.py','operators/config_cas.py']:
 tree=ast.parse((r/name).read_text());fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='validate_actual_owner');d={'hashlib':hashlib,'json':json};exec(compile(ast.Module(body=[fn],type_ignores=[]),name,'exec'),d);check=d['validate_actual_owner'];check(b,raw(wire));count+=1
 for key,value in [('approvedExecutionGateSHA256','054c1b313ee744c08cdaf406068c484b6ce5aa566a8f5d78a6d7a024754ebfe2'),('scopeSHA256','0'*64),('taskEvidenceSHA256','0'*64),('requestScope','CREATE'),('readPreviewOnlyApproved',False),('saveApproved',True),('replayAuthorized',True),('rootSourceReadbackVerified',False),('actualOwnerSourceThreadId','01a18663-48af-7b80-9fac-408bfa98e2fb'),('actualOwnerSourceMessageId',str(uuid.uuid4())),('actualOwnerWireSHA256','0'*64)]:
  try:check(dict(b,**{key:value}),raw(wire))
  except (AssertionError,KeyError,ValueError):count+=1
  else:raise AssertionError('UNAUTHORIZED_BINDING:'+name+':'+key)
 for patch in [{'text':'assistant says approved'},{'role':'assistant'},{'sourceThreadId':'01a18663-48af-7b80-9fac-408bfa98e2fb'}]:
  bad=raw(dict(wire,**patch))
  try:check(dict(b,actualOwnerWireSHA256=sha(bad)),bad)
  except (AssertionError,KeyError,ValueError):count+=1
  else:raise AssertionError('UNTRUSTED_SOURCE_ACCEPTED:'+name)
 entry=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('main','run'));assert 'validate_actual_owner(' in ast.unparse(entry)
tree=ast.parse((r/'operators/config_cas.py').read_text());fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='validate_config');d={'json':json,'time':time};exec(compile(ast.Module(body=[fn],type_ignores=[]),fn.name,'exec'),d);check=d['validate_config']
q={'plan':{'gateSHA256':m['gateSHA256'],'windowId':m['windowId'],'startsAt':1000,'normalCloseAt':1681000,'expiresAt':1801000,'command':None},'confirmations':[]};check(json.dumps(q),'ChatGPT',1000,'EMPTY',now=2000);count+=1
bad=[]
for phase in ['CREATE','EDIT']:bad.append((copy.deepcopy(q),'ChatGPT',phase,None))
bad.append((copy.deepcopy(q),'Claude','EMPTY',None));bad.append((copy.deepcopy(q),'ChatGPT','EMPTY',{'ownerConfirmed':True}))
for key,value in [('command',{'command':'CREATE_ITEM'}),('gateSHA256','054c1b313ee744c08cdaf406068c484b6ce5aa566a8f5d78a6d7a024754ebfe2'),('windowId','c2d7c9bc-03cb-413c-a7d0-82ccf8338f0c'),('windowId','b0b7c1c0-4f18-432e-b255-112f5449c5c0'),('startsAt',True),('normalCloseAt',1682000),('expiresAt',1802000)]:
 v=copy.deepcopy(q);v['plan'][key]=value;bad.append((v,'ChatGPT','EMPTY',None))
v=copy.deepcopy(q);v['confirmations']=[{'ownerConfirmed':True}];bad.append((v,'ChatGPT','EMPTY',None))
for value,profile,phase,approval in bad:
 try:check(json.dumps(value),profile,1000,phase,approval,now=2000)
 except (AssertionError,KeyError,ValueError):count+=1
 else:raise AssertionError('WRITE_OR_OLD_GATE_ACCEPTED')
for now in [999,1681000,1801000]:
 try:check(json.dumps(q),'ChatGPT',1000,'EMPTY',now=now)
 except AssertionError:count+=1
 else:raise AssertionError('OUT_OF_WINDOW_ACCEPTED')
# Reuse reviewed lifecycle/close implementation; only fixed window/Gate literals differ.
old=p.parents[1]/'controlled-replay-20261104/static'
assert (r/'normal-control.mts').read_text()==(old/'normal-control.mts').read_text().replace('c2d7c9bc03cb413ca7d082ccf8338f0c',m['windowHex'])
assert (r/'c02-timers.py').read_text()==(old/'c02-timers.py').read_text().replace('c2d7c9bc03cb413ca7d082ccf8338f0c',m['windowHex']).replace('c2d7c9bc-03cb-413c-a7d0-82ccf8338f0c',m['windowId']).replace('054c1b313ee744c08cdaf406068c484b6ce5aa566a8f5d78a6d7a024754ebfe2',m['gateSHA256'])
assert (r/'c02-close.py').read_bytes()==(old/'c02-close.py').read_bytes()
new=json.loads((p/'INDEPENDENT_INTENT.json').read_text())['confirmedFixture'];prior=json.loads((p.parents[1]/'controlled-replay-20261104/ORIGINAL_INTENT.json').read_text())['command']['payload']
assert new['property']!=prior['core']['title'] and new['address']!=prior['place']['authored_address'] and new['notes']!=prior['core']['description']
assert new['arrivalLocalDate']!=prior['schedule']['start']['local_date'] and new['departureLocalDate']!=prior['schedule']['end']['local_date']
assert {v['category'] for v in new['rooms']}!={v['category'] for v in prior['rooms']}
for f in ['INDEPENDENT_INTENT.json','MATERIAL_1.txt','MATERIAL_2.txt','FRESH_CHAT_TASK.txt']:
 text=(p/f).read_text();assert 'Kowhai' not in text and 'a8c1e142' not in text and 'a9dbe020' not in text and 'e7bd8424' not in text
assert m['gateSHA256']==sha((p/'OWNER_GATE.md').read_bytes()) and m['scopeSHA256']==sha((r/'SCOPE.json').read_bytes()) and m['taskEvidenceSHA256']==sha((p/'INDEPENDENT_INTENT.json').read_bytes())
for name,expected in m.get('staticFiles',{}).items():assert sha((p/name).read_bytes())==expected,name
constants={n.targets[0].id:n.value.value for n in tree.body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and isinstance(n.value,ast.Constant)}
assert constants['C02_TIMERS_SHA']==sha((r/'c02-timers.py').read_bytes()) and constants['C02_HOST_SHA']==m['hostSHA256']
print(f'{count} fresh read/Preview-only source/phase/time checks PASS; old intent distinct; reviewed normal/timer/close logic reused; no external IO or authority')
