"""Focused rebind checks only; reuses reviewed behavior, no Auth/Root2 actions."""
import ast,hashlib,json,time,runpy
from pathlib import Path
p=Path(__file__).parent;m=json.loads((p/'PACKAGE.json').read_text());r=Path(m['generatedStaticDirectory']);sha=lambda b:hashlib.sha256(b).hexdigest()
for name,h in m['staticFiles'].items():assert sha((r/name).read_bytes())==h,name
assert len(m['staticFiles'])==17 and sha((p/'OWNER_GATE.md').read_bytes())==m['gateSHA256'] and sha((p/'SCOPE.json').read_bytes())==m['scopeSHA256']
for obj in m['consumerInputs'].values():assert sha(Path(obj['path']).read_bytes())==obj['sha256']
scope=json.loads((p/'SCOPE.json').read_text());boundary=json.loads(Path(m['credentialBoundary']['path']).read_text())
assert scope['browserReceiverCredentialProposal']['boundarySHA256']==m['credentialBoundary']['sha256']==sha(Path(m['credentialBoundary']['path']).read_bytes())
assert boundary['precisePermissionProposal']['listMetadata']['serverSideRecipientFilter'] is False and boundary['precisePermissionProposal']['memory']['physicalStringMemoryErasureGuaranteed'] is False
assert boundary['precisePermissionProposal']['listMetadata']['maxPolls']==12 and boundary['precisePermissionProposal']['requestBudget']['maxGETStarts']==24
assert m['priorC7D0']['globalFinal']['sha256']=='c9507111d7c87caa58591bf97a19f7796c5b987a07df6fa6c63bd61c8a915196' and not m['credentialBoundary']['currentApproval']
t=ast.parse((r/'operators/config_cas.py').read_text());fn=next(n for n in t.body if isinstance(n,ast.FunctionDef) and n.name=='validate_config');ctx={'json':json,'time':time};exec(compile(ast.Module(body=[fn],type_ignores=[]),'read-only-config','exec'),ctx)
q={'plan':{'gateSHA256':m['gateSHA256'],'windowId':m['windowId'],'startsAt':1000,'normalCloseAt':1681000,'expiresAt':1801000,'command':None},'confirmations':[]};ctx['validate_config'](json.dumps(q),'ChatGPT',1000,'EMPTY',now=2000)
for phase in ['CREATE','EDIT']:
 try:ctx['validate_config'](json.dumps(q),'ChatGPT',1000,phase,now=2000)
 except AssertionError:pass
 else:raise AssertionError('NONEMPTY_PHASE_ACCEPTED')
c={n.targets[0].id:n.value.value for n in t.body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and isinstance(n.value,ast.Constant)};assert c['C02_HOST_SHA']==m['hostSHA256'] and c['C02_TIMERS_SHA']==sha((r/'c02-timers.py').read_bytes())
timers=runpy.run_path(str(r/'c02-timers.py'),run_name='pure_rebind_check');pointer={'gateSHA256':m['gateSHA256'],'windowId':m['windowHex'],'deadlineMs':1801000,'planSHA256':'a'*64,'defaultContainerId':'b'*64,'defaultConfigSHA256':'c'*64};restore={'beforeContainerId':'b'*64,'beforeConfigSHA256':'c'*64,'beforeImage':'sha256:'+'d'*64,'candidateImage':'sha256:'+'d'*64};assert timers['validate'](q,pointer,restore,'a'*64,1000)==q['plan']
# Synthetic source fixtures exercise only extracted pure guards, never human approval.
import copy,datetime as dt
owner=json.loads((p/'OWNER_SOURCE.json').read_text())
assert sha((p/'OWNER_SOURCE.json').read_bytes())==m['ownerSource']['sha256']
actual_raw=Path(owner['actualOwnerWirePath']).read_bytes();actual_wire=json.loads(actual_raw)
assert sha(actual_raw)==owner['actualOwnerWireSHA256'] and set(actual_wire)=={'sourceThreadId','messageId','text'}
assert actual_wire['sourceThreadId']==owner['actualOwnerSourceThreadId']=='01a18663-48af-7b80-9fac-408bfa98e2fb'
assert actual_wire['messageId']==owner['actualOwnerSourceMessageId']=='01a1a8aa-8a58-7b83-833a-63f62d66aa2c'
assert actual_wire['text']==owner['actualOwnerText']=='我提前批准你的审批。一会儿不用问我了\n'
assert Path(owner['rawText']['path']).read_text()==actual_wire['text']
assert owner['directHumanSourceVerified'] and not owner['platformRecognizedExecutionApproval'] and not owner['SaveApproved'] and not owner['credentialReadApproved']
for key in ['rawText','context','contextMappingReview']:assert sha(Path(owner[key]['path']).read_bytes())==owner[key]['sha256']
assert not owner['questionReplyWrapper'] and not owner['humanContainsGateHash'] and not owner['sourceRelabeled']
assert m['ownerSourceLiteralPins']=={'threadId':actual_wire['sourceThreadId'],'messageId':actual_wire['messageId'],'text':actual_wire['text'].strip()}
assert m['startsAt'] is None and m['normalCloseAt'] is None and m['hardExpiresAt'] is None and not m['clockStarted']
for obj in m['root2Qualification']:assert sha(Path(obj['path']).read_bytes())==obj['sha256']
fixture={'threadId':'FIXTURE_DIRECT_HUMAN_THREAD_NOT_APPROVAL','messageId':'FIXTURE_DIRECT_HUMAN_MESSAGE_NOT_APPROVAL','text':"FIXTURE exact approved scope, not actual approval; quote's safe."}
def pure_guard(tree):
 fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='validate_actual_owner')
 ns={'json':json,'hashlib':hashlib};exec(compile(ast.fix_missing_locations(ast.Module(body=[fn],type_ignores=[])),'pure-owner-fixture','exec'),ns);return ns['validate_actual_owner']
def binding(wire):
 raw=json.dumps(wire).encode();return {'approvedExecutionGateSHA256':m['gateSHA256'],'scopeSHA256':m['scopeSHA256'],'taskEvidenceSHA256':m['taskEvidenceSHA256'],'requestScope':'FRESH_READ_PREVIEW_ONLY','readPreviewOnlyApproved':True,'saveApproved':False,'replayAuthorized':False,'rootSourceReadbackVerified':True,'actualOwnerSourceThreadId':wire['sourceThreadId'],'actualOwnerSourceMessageId':wire['messageId'],'actualOwnerWireSHA256':sha(raw)},raw
def rejects(fn,b,raw):
 try:fn(b,raw)
 except AssertionError:return
 raise AssertionError('UNAUTHORIZED_OWNER_SOURCE_ACCEPTED')
checks=0
guards={name for name in m['staticFiles'] if name.endswith('.py') and any(isinstance(n,ast.FunctionDef) and n.name=='validate_actual_owner' for n in ast.parse((r/name).read_text()).body)}
assert guards=={'c02-normal-control.py','prepare-c02-access-window.py','operators/config_cas.py'}
for name in ['c02-normal-control.py','prepare-c02-access-window.py','operators/config_cas.py']:
 source=(r/name).read_text();tree=ast.parse(source);pending=pure_guard(tree)
 assert '01a1a4d2-866f-7391-82b3-24d63fe83347' not in source and 'MCP请求的审批直接帮我批准掉' not in source
 wire={'sourceThreadId':'UNBOUND_OWNER_THREAD_'+m['windowHex'],'messageId':'UNBOUND_OWNER_MESSAGE_'+m['windowHex'],'text':'UNBOUND_OWNER_APPROVAL_TEXT_'+m['windowHex']};b,raw=binding(wire);rejects(pending,b,raw);checks+=1
 b,raw=binding(actual_wire);b['actualOwnerWireSHA256']=owner['actualOwnerWireSHA256'];pending(b,actual_raw);checks+=1
 old={'sourceThreadId':'01a1a0c0-bcd7-7cf0-8de0-9b8feb35d232','messageId':'01a1a4d2-866f-7391-82b3-24d63fe83347','text':'MCP请求的审批直接帮我批准掉，不需要弹窗问我了'};b,raw=binding(old);rejects(pending,b,raw);checks+=1
 # Simulate only the predefined future literal rebind in memory; no saved approval.
 class BoundFixture(ast.NodeTransformer):
  def visit_Constant(self,node):
   if isinstance(node.value,str):
    for key,value in m['ownerSourceLiteralPins'].items():
     if node.value==value:return ast.copy_location(ast.Constant(fixture[key]),node)
   return node
 bound=pure_guard(BoundFixture().visit(copy.deepcopy(tree)))
 wire={'sourceThreadId':fixture['threadId'],'messageId':fixture['messageId'],'text':fixture['text']};b,raw=binding(wire);bound(b,raw);checks+=1
 b['actualOwnerWireSHA256']='0'*64;rejects(bound,b,raw);checks+=1
 b,raw=binding(wire);b['saveApproved']=True;rejects(bound,b,raw);checks+=1
 b,raw=binding(wire);b['replayAuthorized']=True;rejects(bound,b,raw);checks+=1
 b,raw=binding(old);rejects(bound,b,raw);checks+=1
prepare=ast.parse((r/'prepare-c02-access-window.py').read_text());fn=next(n for n in prepare.body if isinstance(n,ast.FunctionDef) and n.name=='require_fresh_control');ns={};exec(compile(ast.Module(body=[fn],type_ignores=[]),'pure-freshness','exec'),ns)
start=dt.datetime(2026,1,1,tzinfo=dt.timezone.utc);ns['require_fresh_control'](start+dt.timedelta(seconds=120),start)
try:ns['require_fresh_control'](start+dt.timedelta(seconds=121),start)
except AssertionError:pass
else:raise AssertionError('STALE_CONTROL_ACCEPTED')
assert m['command'] is None and m['confirmations']==[] and not m['saveApproved'] and m['reviewStatus']=='OWNER_SOURCE_BINDING_PENDING_INDEPENDENT_DELTA_REVIEW'

assert sha(Path(m['priorC7D0']['globalFinal']['path']).read_bytes())==m['priorC7D0']['globalFinal']['sha256']
assert m['receiverSourceReadiness']['mustPrecedeAnyTOrOTP'] and not m['receiverSourceReadiness']['credentialReadOccurred']
assert sha(Path(m['root2OpsInterface']['path']).read_bytes())==m['root2OpsInterface']['sha256']
ops=json.loads((p/'OPS_INTERFACE_BINDING.json').read_text())
assert ops['windowId']==m['windowId'] and ops['gateSHA256']==m['gateSHA256'] and ops['OwnerSource']['userMessageId']==owner['actualOwnerSourceMessageId']
assert ops['actualLIVESHA256'] is None and ops['clock']['T'] is None and ops['actualExecutionRoot'] is None
assert ops['credentialReadinessBeforeAnyOTPOrT'] and not ops['receiverModuleImportReadinessSufficient']
assert boundary['precisePermissionProposal']['selectors']=={'service':'OTR_QA_RESEND_API_KEY','account':'resend','label':'OTR-QA-Inbound'}
assert boundary['precisePermissionProposal']['listMetadata']['paginationTraversal'] is False
assert boundary['precisePermissionProposal']['matchingDetail']['fetchNonmatchingBodyAllowed'] is False
context=json.loads(Path(m['approvalContext']['path']).read_text())
assert sha(Path(m['approvalContext']['path']).read_bytes())==m['approvalContext']['sha256']
assert context['singleProposedReferent']['gateSHA256']==m['gateSHA256'] and context['singleProposedReferent']['scopeSHA256']==m['scopeSHA256']
advance=Path(context['actualWire']['path']);assert sha(advance.read_bytes())==context['actualWire']['sha256']
assert json.loads(advance.read_text())['text']=='我提前批准你的审批。一会儿不用问我了\n'
assert context['actualExecutionSourceBound'] is False and context['platformRecognizedExecutionApproval'] is False
print(json.dumps({'status':'PASS_FOCUSED_ACTUAL_ADVANCE_SOURCE_BINDING','staticFiles':17,'consumerInputs':4,'ownerSourceCases':checks,'actualGuardEntrypoints':len(guards),'freshnessBoundaryCases':2,'actualHumanAdvanceReadback':True,'platformExecutionApproval':False,'clockStarted':False,'AuthOTPNetworkHostedConsumerActions':0,'historicalBehaviorTestsRerun':False}))
