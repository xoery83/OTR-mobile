"""Local source revision only. Never launch, bind time, login or touch Hosted."""
from pathlib import Path
import ast,hashlib,json
p=Path(__file__).parent;old=Path('docs/mcp/c02/s1/fresh-preview-receiver-20261105');m=json.loads((old/'PACKAGE.json').read_text());sha=lambda b:hashlib.sha256(b).hexdigest();gate=sha((p/'OWNER_GATE.md').read_bytes());scope=sha((p/'SCOPE.json').read_bytes());out=Path('dist/mcp-c02-own-session-sdk-6d49/static');out.mkdir(parents=True,exist_ok=True);files={}
for name,h in m['staticFiles'].items():
 raw=(Path(m['generatedStaticDirectory'])/name).read_bytes();assert sha(raw)==h
 files[name]=raw.decode().replace(m['gateSHA256'],gate).replace(m['scopeSHA256'],scope)
files['SCOPE.json']=(p/'SCOPE.json').read_text()
files['normal-control.mts']=(p/'normal-control.mts').read_text().replace("../../../../../scripts/mcp/c02-own-session-consent.mts","./own-session-consent.mjs").replace("../../../../../scripts/mcp/c02-own-callback-pipe.mts","./own-callback-pipe.mjs")
files['c02-normal-control.py']=files['c02-normal-control.py'].replace(m['staticFiles']['normal-control.mts'],sha(files['normal-control.mts'].encode())).replace('a8b9b8e264270f4ddf84dbf65e2cdf7365f61efa3c0d69c6989a4af8422f055d','0d91a18fab1416179daca912761034121be0556dbc81de61e79f52c450112a3b')
for name in ['own-session-consent.mjs','own-callback-pipe.mjs']:files[name]=Path('dist/c02-own-session-sdk-source',name).read_text()
for name in ['own-session-consent.mjs','own-callback-pipe.mjs']:
 files['c02-normal-control.py']=files['c02-normal-control.py'].replace('PINS = {', 'PINS = {\n    str(ENTRY.with_name('+repr(name)+')): '+repr(sha(files[name].encode()))+',',1)

wrapper=files['c02-normal-control.py']
wrapper=wrapper.replace("binding_path=Path(sys.argv[1]);gate=sys.argv[2];b=json.loads(binding_path.read_text())", "validate_only = sys.argv[1] == '--validate-entry-only'\n    offset = 2 if validate_only else 1\n    binding_path=Path(sys.argv[offset]);gate=sys.argv[offset+1];b=json.loads(binding_path.read_text())")
wrapper=wrapper.replace("    public={};keys=", "    if validate_only:return\n    public={};keys=")
wrapper=wrapper.replace("'/private/tmp/otr-auth-consumer-control-c02-'+WINDOW,CLIENT]", "'/private/tmp/otr-auth-consumer-control-c02-'+WINDOW,CLIENT,str(binding_path),gate]")
files['c02-normal-control.py']=wrapper
for name,text in files.items():
 path=out/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(text)
 if name.endswith('.py'):ast.parse(text)
packet={'status':'ACTIVATION_SOURCE_BOUND_PENDING_FINAL_REVIEW_NOT_EXECUTION_READY','requestId':m['requestId'],'sourceMode':'SDK_OAUTH_CONSENT','windowId':m['windowId'],'windowHex':m['windowHex'],'gateSHA256':gate,'scopeSHA256':scope,'generatedStaticDirectory':str(out),'templatePackage':{'path':str(old/'PACKAGE.json'),'sha256':sha((old/'PACKAGE.json').read_bytes())},'consumerInputs':m['consumerInputs'],'hostSHA256':m['hostSHA256'],'softwareDeploymentNecessary':False,'staticFiles':{name:sha(text.encode()) for name,text in files.items()},'sourceReadiness':'ACTIVATION_BINDING_LOCAL_ONLY_PENDING_FINAL_REVIEW','ownerSourceReference':{'path':str(p/'OWNER_SOURCE.json'),'sha256':sha((p/'OWNER_SOURCE.json').read_bytes()),'meaning':'Actual original human raw wire/text/context unchanged; all3 source literals bound. SDK mapping via Root2 scope-only receipt, final activation review pending; platformfalse.'},'platformRecognizedExecutionApproval':False,'root2ScopeRevisionReceipt':None,'startsAt':None,'normalCloseAt':None,'hardExpiresAt':None,'clockStarted':False,'authorityActivated':False,'command':None,'confirmations':[],'saveApproved':False,'browserOtp':'NOT_RUN','browserReceiver':'NOT_USED','browserReservationCaller':'DEFAULT_OFF_NOT_USED','normalControlCredentialImplementation':'Original owning helper unchanged; no new browser credential access','callbackSecretHandling':'One private FIFO only, not regularfile/log/tooloutput','needsBeforeExecution':['Independent source and scope mapping Review','Final independent actual3guard/Node-entry/release-producer review','Main/source integration if required','Root2 current qualifications/platform/livewaiter and actual file binder','Root2 private original prelogin binding with sdkSourcePackageSHA256 and exact final source pins; main revalidates via same Python guard', 'Root2 actual release producer and derived hash-only private relay must be independently qualified']}
boundary=Path('/Users/xoery/Project/otr-mobile-import/root2-hosted-ops-acceptance-20261103/docs/handoffs/ROOT2_HOSTED_OPS_V4/requests/ROOT2-MCP-FRESH-P3-QUALIFICATION-20261105/SDK_SOURCE_REVISION_BOUNDARY.json')
assert sha(boundary.read_bytes())=='c1b087c8681f93d700bb3f336a3f28cb40a6f1c6bd51c1393dfe65191c8ed76e'
packet['releaseProducerContract']={'path':str(p/'ROOT2_SDK_RELEASE_CONTRACT.md'),'sha256':sha((p/'ROOT2_SDK_RELEASE_CONTRACT.md').read_bytes()),'actualProducerAccepted':False,'actualRelease':None}
packet['root2ScopeRevisionReceipt']={'path':str(boundary),'sha256':sha(boundary.read_bytes()),'status':'SCOPE_INTERPRETATION_ONLY_NOT_EXECUTION_APPROVAL','priorPackageTarget':'43b2f509aa229cd19e5ad9597ec5d80c5e466d88dc8198bc62219b578fb586f7','repairedPackageNeedsDeltaQualification':True}
(p/'PACKAGE.json').write_text(json.dumps(packet,indent=2)+'\n');print(json.dumps({'status':packet['status'],'gate':gate,'scope':scope,'packageSHA256':sha((p/'PACKAGE.json').read_bytes()),'staticFiles':len(files),'T':None}))
