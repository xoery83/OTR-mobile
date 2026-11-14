"""Case-scoped offline guards; no helper IO, sessions, Host or business commands."""
import ast,hashlib,json,uuid
from pathlib import Path
p=Path(__file__).parent;m=json.loads((p/'PACKAGE.json').read_text());r=p/'static';intent=json.loads((p/'ORIGINAL_INTENT.json').read_text());root='01a1a0c0-bcd7-7cf0-8de0-9b8feb35d232';msg='11111111-1111-4111-8111-111111111111';gate=m['gateSHA256']
w={'sourceThreadId':root,'messageId':msg,'role':'user','sourceKind':'DIRECT_HUMAN_REPLY','text':'SYNTHETIC_TEST_APPROVAL_NOT_AUTHORITY','gateSHA256':gate,'explicitUnknownReplayApproval':True,'phase':'CREATE','actorAccountId':intent['actorAccountId'],'tripId':intent['tripId'],'operationId':intent['operationId'],'targetItemId':intent['target']['id'],'commandSHA256':intent['commandSHA256'],'intentSHA256':intent['intentSHA256'],'previewDigest':intent['previewDigest']}
raw=lambda x:json.dumps(x,ensure_ascii=False).encode();digest=lambda b:hashlib.sha256(b).hexdigest()
b={'actualOwnerSourceThreadId':root,'actualOwnerSourceMessageId':msg,'rootSourceReadbackVerified':True,'actualOwnerWireSHA256':digest(raw(w)),'approvedExecutionGateSHA256':gate}
assert r.is_dir(), 'STATIC_ARTIFACTS_UNAVAILABLE: restore and pin reviewed helper sources before qualification; historical PASS is not current qualification'
count=0
for name in ['c02-normal-control.py','prepare-c02-access-window.py','operators/config_cas.py']:
 tree=ast.parse((r/name).read_text());f=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='validate_actual_owner');d={'json':json,'hashlib':hashlib,'uuid':uuid};exec(compile(ast.Module(body=[f],type_ignores=[]),name,'exec'),d);check=d[f.name];check(b,raw(w));count+=1
 cases=[(dict(b,rootSourceReadbackVerified=False),raw(w)),(dict(b,actualOwnerWireSHA256='0'*64),raw(w))]
 for key,value in [('sourceThreadId','01a18663-48af-7b80-9fac-408bfa98e2fb'),('messageId',str(uuid.uuid4())),('role','assistant'),('sourceKind','AGENT_HANDOFF'),('gateSHA256','b'*64),('explicitUnknownReplayApproval',False),('actorAccountId',str(uuid.uuid4())),('tripId',str(uuid.uuid4())),('operationId',str(uuid.uuid4())),('targetItemId',str(uuid.uuid4())),('commandSHA256','b'*64),('intentSHA256','b'*64),('previewDigest','b'*64),('text','')]:
  bad=raw(dict(w,**{key:value}));cases.append((dict(b,actualOwnerWireSHA256=digest(bad)),bad))
 old=raw({'sourceThreadId':root,'messageId':'01a1a4d2-866f-7391-82b3-24d63fe83347','text':'MCP请求的审批直接帮我批准掉，不需要弹窗问我了'});cases.append((dict(b,actualOwnerWireSHA256=digest(old)),old))
 for binding,payload in cases:
  try:check(binding,payload)
  except (AssertionError,KeyError,ValueError):count+=1
  else:raise AssertionError('UNAUTHORIZED_OWNER_PROOF_ACCEPTED:'+name)
 # All executable consumers retain the source proof check.
 entry=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('main','run'));assert 'validate_actual_owner(' in ast.unparse(entry)
# Existing config validator, exercised without running its protected entry.
tree=ast.parse((r/'operators/config_cas.py').read_text());f=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='validate_config');d={'json':json,'hashlib':hashlib,'uuid':uuid,'time':type('Clock',(),{'time':staticmethod(lambda:2)})};exec(compile(ast.Module(body=[f],type_ignores=[]),f.name,'exec'),d);check=d[f.name]
c={'gateSHA256':gate,'operationId':intent['operationId'],'previewDigest':intent['previewDigest'],'sourceThreadId':root,'sourceMessageId':msg,'sourceEvidenceSHA256':b['actualOwnerWireSHA256']};a=dict(b,ownerConfirmed=True,sourceThreadId=root,sourceMessageId=msg,sourceEvidenceSHA256=b['actualOwnerWireSHA256'],operationId=intent['operationId'],previewDigest=intent['previewDigest']);q={'plan':{'gateSHA256':gate,'windowId':str(uuid.uuid4()),'startsAt':1000,'normalCloseAt':1681000,'expiresAt':1801000,'command':intent['command']},'confirmations':[c]};check(json.dumps(q),'ChatGPT',1000,'CREATE',a,now=2000);count+=1
badq=json.loads(json.dumps(q));badq['plan']['command']['payload']['title']='UNAPPROVED_TITLE'
for qq,phase,approval in [(badq,'CREATE',a),(q,'EDIT',a),(q,'CREATE',dict(a,ownerConfirmed=False)),(q,'CREATE',dict(a,sourceEvidenceSHA256='0'*64))]:
 try:check(json.dumps(qq),'ChatGPT',1000,phase,approval,now=2000)
 except (AssertionError,KeyError,ValueError):count+=1
 else:raise AssertionError('UNAUTHORIZED_MUTATION_ACCEPTED')
print(f'{count} offline original-intent/source/phase guard cases PASS; no external IO')
# Existing post-Create EDIT transition: a different exact Owner approval is mandatory.
edit=json.loads(json.dumps(intent['command']));edit['command']='SET_ITEM_SCHEDULE';edit['operationId']='22222222-2222-4222-8222-222222222222';edit['baseVector'][0]['revision']=1;edit['payload']={'schedule':edit['payload']['schedule']};edit['payload']['schedule']['end']['local_time']='10:15'
edigest='b'*64;ew=dict(w,messageId='33333333-3333-4333-8333-333333333333',phase='EDIT',explicitEditApproval=True,originalCreateOperationId=intent['operationId'],operationId=edit['operationId'],commandSHA256=digest(json.dumps(edit,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()),previewDigest=edigest);eb=dict(b,actualOwnerSourceMessageId=ew['messageId'],actualOwnerWireSHA256=digest(raw(ew)),previewDigest=edigest);tree=ast.parse((r/'operators/config_cas.py').read_text());fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='validate_actual_owner');ns={'json':json,'hashlib':hashlib,'uuid':uuid};exec(compile(ast.Module(body=[fn],type_ignores=[]),fn.name,'exec'),ns);owner=ns[fn.name];owner(eb,raw(ew),'EDIT',edit);count+=1
for patch in [{'phase':'CREATE'},{'explicitEditApproval':False},{'commandSHA256':'f'*64},{'originalCreateOperationId':str(uuid.uuid4())}]:
 bad=raw(dict(ew,**patch));bb=dict(eb,actualOwnerWireSHA256=digest(bad))
 try:owner(bb,bad,'EDIT',edit)
 except (AssertionError,KeyError,ValueError):count+=1
 else:raise AssertionError('STALE_OR_UNAPPROVED_EDIT_ACCEPTED')
ea=dict(eb,ownerConfirmed=True,sourceThreadId=root,sourceMessageId=ew['messageId'],sourceEvidenceSHA256=eb['actualOwnerWireSHA256'],operationId=edit['operationId'],previewDigest=edigest);eq=json.loads(json.dumps(q));eq['plan']['command']=edit;eq['plan']['createdOperationId']=intent['operationId'];eq['confirmations']=[dict(c,sourceMessageId=ew['messageId'],operationId=edit['operationId'],previewDigest=edigest,sourceEvidenceSHA256=eb['actualOwnerWireSHA256'])];check(json.dumps(eq),'ChatGPT',1000,'EDIT',ea,now=2000);count+=1
for key,value in [('createdOperationId',str(uuid.uuid4()))]:
 qq=json.loads(json.dumps(eq));qq['plan'][key]=value
 try:check(json.dumps(qq),'ChatGPT',1000,'EDIT',ea,now=2000)
 except (AssertionError,KeyError,ValueError):count+=1
 else:raise AssertionError('WRONG_CREATE_PARENT_ACCEPTED')
print(f'{count} total offline cases PASS including separate exact EDIT approval; no external IO')
fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='validate_approval_origin');ns={};exec(compile(ast.Module(body=[fn],type_ignores=[]),fn.name,'exec'),ns);origin=ns[fn.name];origin(b,a,'CREATE');origin(b,ea,'EDIT');count+=2
for access,approval,phase in [(b,a,'EDIT'),(b,ea,'CREATE'),(b,dict(ea,actualOwnerSourceThreadId='wrong'),'EDIT')]:
 try:origin(access,approval,phase)
 except (AssertionError,KeyError,ValueError):count+=1
 else:raise AssertionError('OWNER_APPROVAL_ORIGIN_REUSED')
# A known old GET-only message remains forbidden even if someone adds save fields.
oldmsg='01a1a4d2-866f-7391-82b3-24d63fe83347';bad=raw(dict(w,messageId=oldmsg));bb=dict(b,actualOwnerSourceMessageId=oldmsg,actualOwnerWireSHA256=digest(bad))
try:owner(bb,bad,'CREATE')
except (AssertionError,KeyError,ValueError):count+=1
else:raise AssertionError('OLD_GET_ONLY_MESSAGE_RELABELED_AS_SAVE')
print(f'{count} total offline cases PASS, including old GET-source hard rejection and independent EDIT approval')
# Fixed packet byte pins, including restored/reconstructed sources and Gate.
for name, expected in m['staticFiles'].items():
 assert digest((p/name).read_bytes()) == expected, 'STATIC_PIN_DRIFT:'+name
assert digest((p/m['gatePath']).read_bytes()) == m['gateSHA256']
consts={n.targets[0].id:ast.literal_eval(n.value) for n in ast.parse((r/'operators/config_cas.py').read_text()).body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and isinstance(n.value,ast.Constant)}
assert consts['C02_TIMERS_SHA'] == digest((r/'c02-timers.py').read_bytes())
assert consts['C02_HOST_SHA'] == m['generatedHostArtifact']['sha256']
assert digest(Path(m['generatedHostArtifact']['path']).read_bytes()) == consts['C02_HOST_SHA']
print('Fixed static manifest/Gate/Timer/Host byte pins PASS; no execution authority')
