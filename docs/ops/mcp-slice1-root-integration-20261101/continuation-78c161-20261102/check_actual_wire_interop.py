"""Offline actual-wire check; synthetic Docker metadata, no Host/CAS/DB calls."""
import hashlib,json,sys,time
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,'/private/tmp/otr-mcp-read-diag-609184bb-7a4a6bwu/operators')
from prepare_cas import make_plan
from deploy import digest
p=Path(__file__).parent
auth=Path('/private/tmp/otr-auth-mcp-slice1-78c1610ecf5f43409106fb67ecd36489')
b=json.loads((p/'EMPTY_ROUND_INTENT.json').read_text())['request']
v1=json.loads((auth/'MATCHED_PREVIEW_OWNER_APPROVAL.json').read_bytes())
raw=(auth/'MATCHED_PREVIEW_OWNER_APPROVAL_V2.json').read_bytes();v2=json.loads(raw)
assert {k:v for k,v in v2.items() if k!='clientId'}==v1
q=json.loads(b['authQaConfig']);q['confirmations']=[{'operationId':v2['operationId'],'previewDigest':v2['previewDigest']}]
base={'Config':{'Image':'synthetic-same-image','Env':['SYNTHETIC_BASE=1']},'HostConfig':{'Mounts':[]},'Mounts':[],'Image':'synthetic-same-image','State':{'Health':{'Status':'healthy'}}}
default={**base,'Id':b['defaultContainerId']}
current={**base,'Id':'synthetic-current-empty','Config':{**base['Config'],'Env':base['Config']['Env']+['OTR_DEV_MCP_WRITE_QA_CONFIG='+b['authQaConfig']]}}
r={**b,'phase':'CONFIRM','authQaConfig':json.dumps(q),'expectedCurrentContainerId':current['Id'],'expectedCurrentConfigSHA256':digest(current['Config']),'defaultConfigSHA256':digest(default['Config']),'approvalRecordSHA256':hashlib.sha256(raw).hexdigest()}
template={'beforeConfigHashes':{},'mountedFileHashes':{},'bundles':{},'protectedRoutes':[['/synthetic-only',401]]}
def no_io(*args,**kwargs): raise AssertionError('UNEXPECTED_EXTERNAL_IO')
results=[]
with patch('subprocess.run',no_io),patch('subprocess.check_output',no_io),patch('socket.socket',no_io):
 for label,approval in [('V1_MISSING_CLIENT_REJECTED',v1),('WRONG_CLIENT_REJECTED',{**v2,'clientId':'wrong-client'})]:
  try:make_plan({**r,'ownerApproval':approval},current,default,template,b['windowStartedAtMs']+1000)
  except AssertionError:results.append(label)
  else:raise AssertionError('INVALID_WIRE_ACCEPTED')
 g=make_plan({**r,'ownerApproval':v2},current,default,template,b['windowStartedAtMs']+1000)
 assert g['phase']=='CONFIRM' and json.loads(g['authQaConfig'])['confirmations']==q['confirmations'] and g['deadlineMs']==b['deadlineMs']
 results.append('V2_ACTUAL_WIRE_PLAN_CONSTRUCTION_PASS')
 assert int(time.time()*1000)>b['deadlineMs']
 try:make_plan({**r,'ownerApproval':v2},current,default,template,int(time.time()*1000))
 except AssertionError:results.append('EXPIRED_WINDOW_STILL_REJECTED')
 else:raise AssertionError('EXPIRED_WINDOW_ACCEPTED')
out={'status':'OFFLINE_ACTUAL_WIRE_INTEROP_PASS','checks':results,'fixtures':'actual V1/V2 approval and QA config; synthetic Docker snapshots, no Env credentials','testNow':'positive only simulates original within-window instant; does not reset real clock','hostCalls':0,'casCalls':0,'databaseCalls':0,'realAuthorityReactivated':False}
(p/'ACTUAL_WIRE_INTEROP_RESULT.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
