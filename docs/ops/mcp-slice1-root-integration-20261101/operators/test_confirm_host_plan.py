import copy,json,sys
import config_cas as cas
sys.modules['config_cas']=cas
import test_protocol as t
from prepare_cas import make_plan
f=t.Fixture('CONFIRM');default=f.snap[t.DEFAULT];current=f.snap[t.EMPTY]
default['HostConfig']['OomKillDisable']=None;current['HostConfig']=dict(default['HostConfig'],OomKillDisable=False)
request={'gateSHA256':cas.GATE,'phase':'CONFIRM','windowId':t.WINDOW,'clientProfile':'Claude','authQaConfig':json.dumps(t.qa(confirmed=True)),'windowStartedAtMs':t.NOW-1000,'expectedCurrentContainerId':t.EMPTY,'expectedCurrentConfigSHA256':cas.digest(current['Config']),'defaultContainerId':t.DEFAULT,'defaultConfigSHA256':cas.digest(default['Config']),'ownerApproval':t.approval(t.qa(confirmed=True)),'approvalRecordSHA256':f.g['approvalRecordSHA256']}
template={'beforeConfigHashes':{},'mountedFileHashes':{},'bundles':{},'protectedRoutes':[('/fixture',401)]}
g=make_plan(request,current,default,template,t.NOW)
assert g['expectedHostConfig']['OomKillDisable'] is False
assert g['restoreBaseline']['expectedHostConfig']['OomKillDisable'] is None
f.g=g;assert f.execute()['status']=='MCP_SLICE1_CONFIG_CAS_HEALTHY'
for key,value in [('OomKillDisable',True),('NetworkMode','host')]:
 bad=copy.deepcopy(current);bad['HostConfig'][key]=value
 try:make_plan(request,bad,default,template,t.NOW)
 except AssertionError:pass
 else:raise AssertionError('HOST_DRIFT_ACCEPTED')
print('CONFIRM plan null/default vs false/active PASS; active exact pin/default restore pin retained; true/network drift rejected.')
