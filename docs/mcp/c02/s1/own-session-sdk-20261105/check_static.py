"""Pure source/pin/EMPTY checks; never import any runtime/main/Hosted function."""
from pathlib import Path
import ast,hashlib,json,time
p=Path(__file__).parent;m=json.loads((p/'PACKAGE.json').read_text());r=Path(m['generatedStaticDirectory']);sha=lambda b:hashlib.sha256(b).hexdigest()
assert len(m['staticFiles'])==19
for n,h in m['staticFiles'].items():assert sha((r/n).read_bytes())==h,n
assert sha((p/'OWNER_GATE.md').read_bytes())==m['gateSHA256'] and sha((p/'SCOPE.json').read_bytes())==m['scopeSHA256']
assert not m['clockStarted'] and not m['authorityActivated'] and all(m[k] is None for k in ['startsAt','normalCloseAt','hardExpiresAt','command']) and m['confirmations']==[] and not m['saveApproved']
for obj in m['consumerInputs'].values():assert sha(Path(obj['path']).read_bytes())==obj['sha256']
owner=json.loads((p/'OWNER_SOURCE.json').read_text());raw=Path(owner['actualOwnerWirePath']).read_bytes();assert sha(raw)==owner['actualOwnerWireSHA256']=='1511200f3d42d3d686cd18b117c39c2b8f9216e1d334de2974cd311744e513b9'
assert json.loads(raw)['text']==owner['actualOwnerText']=='我提前批准你的审批。一会儿不用问我了\n' and not owner['platformRecognizedExecutionApproval'] and not owner['SaveApproved']
for name in ['c02-normal-control.py','prepare-c02-access-window.py','operators/config_cas.py']:
 tree=ast.parse((r/name).read_text());fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='validate_actual_owner');ns={'hashlib':hashlib,'json':json};exec(compile(ast.Module(body=[fn],type_ignores=[]),'pure-source-guard','exec'),ns)
 b={'approvedExecutionGateSHA256':m['gateSHA256'],'scopeSHA256':m['scopeSHA256'],'taskEvidenceSHA256':'8a54447f75490fee53861e0d9a8ecc65f4fe3b6525ae6e7092bd06afa82150d6','requestScope':'FRESH_READ_PREVIEW_ONLY','readPreviewOnlyApproved':True,'saveApproved':False,'replayAuthorized':False,'rootSourceReadbackVerified':True,'actualOwnerSourceThreadId':owner['actualOwnerSourceThreadId'],'actualOwnerSourceMessageId':owner['actualOwnerSourceMessageId'],'actualOwnerWireSHA256':sha(raw)}
 ns['validate_actual_owner'](b,raw)
 for key,value in [('actualOwnerSourceMessageId','UNBOUND_SDK_SOURCE_REVIEW_PENDING'),('actualOwnerSourceMessageId','01a1a4d2-866f-7391-82b3-24d63fe83347'),('scopeSHA256','0'*64),('saveApproved',True)]:
  invalid={**b,key:value}
  try:ns['validate_actual_owner'](invalid,raw)
  except AssertionError:pass
  else:raise AssertionError('Wrong source binding accepted '+name)
tree=ast.parse((r/'operators/config_cas.py').read_text());fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='validate_config');ns={'json':json,'time':time};exec(compile(ast.Module(body=[fn],type_ignores=[]),'pure-empty','exec'),ns)
q={'plan':{'gateSHA256':m['gateSHA256'],'windowId':m['windowId'],'startsAt':1000,'normalCloseAt':1681000,'expiresAt':1801000,'command':None},'confirmations':[]};ns['validate_config'](json.dumps(q),'ChatGPT',1000,'EMPTY',now=2000)
assert 'SDK_START_BINDING_REQUIRED' in (r/'normal-control.mts').read_text() and '--validate-entry-only' in (r/'normal-control.mts').read_text() and 'readSdkRelease' in (r/'normal-control.mts').read_text()
print('PASS19pins/inputs/3actualsourceguards+UNBOUND/old/wrongscopeReject/EMPTY/Tnull/guardedentry; protectedactions0')
# Synthetic metadata exercises existing startup validation-only; env/Auth are forbidden.
import tempfile,sys
from unittest.mock import patch
wrapper={'__file__':str(r/'c02-normal-control.py'),'__name__':'pure_validate_entry_fixture'}
exec(compile((r/'c02-normal-control.py').read_text(),'pure-wrapper','exec'),wrapper)
fixture={**b,'status':'ACTUAL_OWNER_SOURCE_READBACK_VERIFIED_NOT_ACTIVATED','ownerAccessApproved':True,'sourceThreadId':'01a18663-48af-7b80-9fac-408bfa98e2fb','sourceMessageId':'FIXTURE_CURRENT_METADATA_NOT_ACTUAL_ROOT2_EVIDENCE','windowId':m['windowHex'],'accountId':'1f3d7935-1bdc-4952-8d7f-0f72077368c1','clientId':'83504d3f-59d4-43fd-99b1-bebc54c40f7d','freshConsumerUIReady':True,'resourceReadyNoConflict':True,'dcrDisabledVerified':True,'timersAndIssuerCloseQualified':True,'closeUnchangedDefaultProbe':'PASS','gatePath':str(p/'OWNER_GATE.md'),'actualOwnerWirePath':owner['actualOwnerWirePath']}
original_read=Path.read_text
with tempfile.TemporaryDirectory(prefix='sdk-entry-guard-') as tmp:
 f=Path(tmp)/'binding.json';f.write_text(json.dumps(fixture));saved=sys.argv
 def no_env(path,*args,**kwargs):
  assert str(path)!='/Users/xoery/Project/otr-mobile/.env.local','VALIDATE_ONLY_REACHED_ENV'
  return original_read(path,*args,**kwargs)
 try:
  sys.argv=['fixture','--validate-entry-only',str(f),m['gateSHA256']]
  with patch.object(Path,'read_text',no_env),patch.object(wrapper['subprocess'],'run',side_effect=AssertionError('VALIDATE_ONLY_STARTED_AUTH')):wrapper['main']()
 finally:sys.argv=saved
print('PASS synthetic original startup guard returns before env/Auth; no actualRoot2metadata asserted')
