"""Pure generated-pointer/close boundary regression; no Docker, filesystem or authority calls."""
import ast, copy, hashlib, json, re
from pathlib import Path

root=Path('/private/tmp/otr-mcp-c02-s1-package-20261103/operators')
def functions(path,names,scope):
    tree=ast.parse(path.read_text())
    selected=ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names],type_ignores=[])
    exec(compile(selected,str(path),'exec'),scope)

files={}
scope={'copy':copy,'hashlib':hashlib,'json':json,'HELPER_SHA':'9'*64,
       'atomic_private':lambda p,v:files.__setitem__(p,json.dumps(v).encode()),
       'private':lambda p:files[p]}
functions(root/'config_cas.py',{'publish_close_plan'},scope)
closer={'re':re};functions(Path('scripts/mcp/c02-close.py'),{'validate'},closer)
g={'gateSHA256':'a'*64,'windowId':'b'*32,'defaultContainerId':'c'*64,
   'candidateImage':'sha256:'+'d'*64,'deadlineMs':1800000,
   'restoreBaseline':{'beforeContainerId':'c'*64,'beforeConfigSHA256':'e'*64,
   'beforeImage':'sha256:'+'d'*64,'candidateImage':'sha256:'+'d'*64,'restoreHelperSHA256':'9'*64}}
base=Path('/not-written')
scope['publish_close_plan'](g,base,'f'*64,'1'*64)
pointer=json.loads(files[base/'close-current.json']);raw=files[base/'deploy-plan.json'];plan=json.loads(raw)
sha=hashlib.sha256(raw).hexdigest()
closer['validate'](pointer,plan,sha)
for key in ['defaultContainerId','defaultConfigSHA256','planSHA256']:
    bad=dict(pointer);bad[key]='0'*64
    try:closer['validate'](bad,plan,sha)
    except AssertionError:pass
    else:raise AssertionError('drift accepted: '+key)
print('PASS generated publish_close_plan → close.validate; 3 binding drift rejections; privileged actions=0')

import time,uuid
validation={'json':json,'time':time,'uuid':uuid}
functions(root/'config_cas.py',{'validate_config','same_window'},validation)
p={'startsAt':1000,'normalCloseAt':161000,'expiresAt':281000,
   'gateSHA256':'a'*64,'windowId':str(uuid.uuid4()),'command':None}
empty={'plan':p,'confirmations':[]}
validation['validate_config'](json.dumps(empty),'ChatGPT',1000,'EMPTY',now=2000)
for phase,profile,now in [('EMPTY','Claude',2000),('EMPTY','ChatGPT',161000),('EDIT','ChatGPT',2000)]:
    try:validation['validate_config'](json.dumps(empty),profile,1000,phase,now=now)
    except (AssertionError,TypeError):pass
    else:raise AssertionError('bad config accepted')
create=copy.deepcopy(empty);create['plan']['command']={'command':'CREATE_ITEM','operationId':'new-create','target':{'id':'new-item'}}
create['confirmations']=[{}]
validation['same_window'](empty,create,'CREATE')
edit=copy.deepcopy(create);edit['plan']['command']={'command':'SET_ITEM_SCHEDULE','operationId':'new-edit','target':{'id':'new-item'}};edit['plan']['createdOperationId']='new-create'
validation['same_window'](create,edit,'EDIT')
for change in ['target','createdOperationId','windowId']:
    bad=copy.deepcopy(edit)
    if change=='target':bad['plan']['command']['target']={'id':'different-item'}
    else:bad['plan'][change]='wrong'
    try:validation['same_window'](create,bad,'EDIT')
    except AssertionError:pass
    else:raise AssertionError('transition drift accepted: '+change)
print('PASS pure EMPTY config/time/profile and CREATE→EDIT same-window/parent/target transitions; 6 negatives')


import datetime as dt
fresh={'dt':dt}
functions(Path('scripts/mcp/prepare-c02-window.py'),{'require_fresh_control'},fresh)
now=dt.datetime(2026,11,3,tzinfo=dt.timezone.utc)
for age in [0,120]:fresh['require_fresh_control'](now,now-dt.timedelta(seconds=age))
for age in [-1,121]:
    try:fresh['require_fresh_control'](now,now-dt.timedelta(seconds=age))
    except AssertionError:pass
    else:raise AssertionError('stale/future control accepted')
try:fresh['require_fresh_control'](now,now.replace(tzinfo=None))
except AssertionError:pass
else:raise AssertionError('timezone-free control accepted')
print('PASS new finite-window fresh own-control boundary: 0/120sec accepted; future/stale/naive rejected; no clock/session started')


launch={}
launch_tree=ast.parse(Path('scripts/mcp/c02-normal-control.py').read_text())
exec(compile(ast.Module(body=[n for n in launch_tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in ['WINDOW','CLIENT','ACCOUNT','THREAD'] for t in n.targets) or isinstance(n,ast.FunctionDef) and n.name=='validate_binding'],type_ignores=[]),'c02-normal-control.py','exec'),launch)
b={'status':'ACTUAL_OWNER_SOURCE_READBACK_VERIFIED_NOT_ACTIVATED','approvedExecutionGateSHA256':'a'*64,'ownerAccessApproved':True,'sourceThreadId':launch['THREAD'],'sourceMessageId':'synthetic-only-source','rootSourceReadbackVerified':True,'windowId':launch['WINDOW'],'accountId':launch['ACCOUNT'],'clientId':launch['CLIENT'],'freshConsumerUIReady':True,'resourceReadyNoConflict':True,'dcrDisabledVerified':True,'timersAndIssuerCloseQualified':True,'closeUnchangedDefaultProbe':'PASS'}
launch['validate_binding']('a'*64,b)
for k,v in [('accountId','wrong'),('clientId','wrong'),('windowId','wrong'),('sourceThreadId','wrong'),('ownerAccessApproved',False),('resourceReadyNoConflict',False),('dcrDisabledVerified',False),('timersAndIssuerCloseQualified',False),('closeUnchangedDefaultProbe','UNKNOWN')]:
    bad=copy.deepcopy(b);bad[k]=v
    try:launch['validate_binding']('a'*64,bad)
    except AssertionError:pass
    else:raise AssertionError(k)
try:launch['validate_binding']('fe7508f4611c166b8f3935253517accf8bfdda7e50ab5705d09abbc0e1f54cd4',b)
except AssertionError:pass
else:raise AssertionError('software gate accepted')
print('PASS new control-launch binding1positive/10negative; normal OTP/session/network calls0')

# Actual Host lacks Node; parse only the byte-pinned module in the fixed current container.
import hashlib, types
source=ast.parse(Path('/private/tmp/otr-mcp-c02-s1-package-20261103/operators/config_cas.py').read_text())
run_node=next(n for n in source.body if isinstance(n,ast.FunctionDef) and n.name=='run')
parse_call=next(n for n in run_node.body if isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and ast.unparse(n.value.func)=='subprocess.run')
pos=run_node.body.index(parse_call);pin_check=run_node.body[pos-1]
assert isinstance(pin_check,ast.Assert) and 'subprocess_bytes' in ast.unparse(pin_check)
checks=compile(ast.Module(body=[pin_check,parse_call],type_ignores=[]),'container-module-precheck','exec')
module_bytes=b'synthetic-pinned-module';calls=[];reads=[]
def read_module(cid,filename):
    reads.append((cid,filename));return module_bytes
ctx={'hashlib':hashlib,'C02_HOST_SHA':hashlib.sha256(module_bytes).hexdigest(),'subprocess_bytes':read_module,'subprocess':types.SimpleNamespace(run=lambda *a,**k:calls.append((a,k))),'g':{'beforeContainerId':'fixed-current-container','authQaConfig':'{"synthetic":true}'}}
exec(checks,ctx)
argv=calls[0][0][0]
assert argv[:5]==['docker','exec','-i','fixed-current-container','node']
assert argv[-1]=='file:///app/mcp/c02-host.mjs' and calls[0][1]['input']=='{"synthetic":true}'
assert reads==[('fixed-current-container','mcp/c02-host.mjs')]
calls.clear();ctx['subprocess_bytes']=lambda *_:b'drifted-module'
try:exec(checks,ctx)
except AssertionError:pass
else:raise AssertionError('unverified container module executed')
assert not calls
print('PASS same-container Node precheck: exact CID/module/payload; drift rejects before import; privileged actions0')
