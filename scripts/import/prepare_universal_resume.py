"""Prepare one exact approved recovery plan; no permission or business mutation."""
import sys,json,datetime as dt
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from universal_scope_close import SqlTransport,quote
from universal_continuous_transition import canonical,sha,prepare,ACTOR
from universal_continuous_commands import bind
from universal_continuous_sql_ports import validate_sql_plan

def main():
 b=Path('/private/tmp/otr-universal-resume-20261026');old=Path('/private/tmp/otr-universal-stage2-live-control');p=json.load(open(old/'run7/plan.json'))
 closed=json.load(open(b/'closed-preimages.json'));stage=json.load(open(b/'stage.json'))
 closure=json.load(open('/private/tmp/otr-universal-cleanup-20261026/run1/cleanup-result.json'))
 assert closure['status']=='CLOSED_VERIFIED' and closure['rollbackVerified'] is True
 gate=Path(__file__).resolve().parents[2]/'docs/ops/universal-stage2-20261025/actual-execution/cleanup-20261026/STAGE_II_CONSOLIDATED_RESUME_GATE.md'
 p.pop('operatorPlanSHA256',None)
 p['approvedResumeGateSHA256']=sha(gate.read_bytes())
 now=dt.datetime.now(dt.timezone.utc).replace(microsecond=0)+dt.timedelta(seconds=60)
 z=lambda x:x.isoformat().replace('+00:00','Z')
 p['transitionId']=stage['transitionId'];p['startsAt']=z(now);p['expiresAt']=z(now+dt.timedelta(seconds=660));p['providerExpiresAt']='2026-11-01T08:48:56Z'
 r=p['runtime'];c=stage['projection'];r.update(imageId=c['imageId'],stagedContainerId=c['containerId'],backupContainerName='otr-universal-original-'+p['transitionId'],activeConfigSHA256=c['configSHA256'],createdHostConfigSHA256=c['hostConfigSHA256'],activeHostConfigSHA256=stage['expectedRunningHostConfigSHA256'],activeMountsSHA256=c['mountsSHA256'])
 a=p['adminControl'];a.update(startsAt=p['startsAt'],expiresAt=z(now+dt.timedelta(seconds=900)));a['role']['expiresAt']=a['expiresAt']
 a['grantRenewalPreimages']={g['permission']:g for g in closed['grants']}
 a['temporaryGrants']=[{**g,'grant_revision':g['grant_revision']+1,'expires_at':a['expiresAt'],'revoked_at':None} for g in closed['grants']]
 p['recoveryPreimages']=json.load(open(b/'closed-provider-preimages.json'))
 profile=json.load(open(old/'profile.json'))
 facts={**p['recoveryPreimages'],'providerConfigId':'08e8113c-41dd-47cf-8d90-fc9eba98162e','configurationSHA256':p['recoveryPreimages']['scope']['configuration_sha256'],'profile':profile['profile'],'profileSHA256':profile['profileSHA256']}
 auth=p['providerControl']['activationCommands'][0]['context'].copy()
 for k in ('request_id','request_sha256','command_kind','gateway_identity'):auth.pop(k)
 normal=json.load(open(old/'normal-auth-latest.json'));assert normal['status']=='NORMAL_OWN_REFRESH_USER_VERIFIED' and normal['accountId']==ACTOR and normal['expiresAt']>=a['expiresAt']
 auth.update(verified_at=normal['verifiedAt'],expires_at=a['expiresAt'])
 sql=SqlTransport('/Users/xoery/Project/otr-mobile/node_modules/.bin/supabase','/Users/xoery/Project/otr-mobile-canonical',str(b))
 def row_hash(kind,row):
  if kind=='price':return sha(canonical(row))
  q="BEGIN READ ONLY;SET LOCAL TIME ZONE 'UTC';SELECT (to_jsonb(jsonb_populate_record(null::public.flight_activation_scopes,"+quote(json.dumps(row))+"::jsonb))-'scope_sha256') AS normalized;COMMIT;"
  return sha(canonical(sql(q)['rows'][0]['normalized']))
 p['providerControl']=bind(p,facts,auth,row_hash);validate_sql_plan(p)
 op=b/'operator-plan.json'
 with op.open('xb') as f:f.write(canonical(p))
 op.chmod(0o600);p['operatorPlanSHA256']=sha(op.read_bytes())
 digest=prepare(p,b/'run1')
 binding={'status':'PREPARED_NOT_STARTED','startsAt':p['startsAt'],'innerCloseAt':p['expiresAt'],'outerCloseAt':a['expiresAt'],'providerExpiresAt':p['providerExpiresAt'],'planSHA256':digest,'operatorPlanSHA256':p['operatorPlanSHA256'],'qaInputSHA256':'e227e9fd95978157c63862a5092d1791b4b0ea69aa998c3b6d027b12e4800b8c','operator':'Coordinator','rollbackOwner':'Coordinator','mode':'OWNER_APPROVED_CONSOLIDATED_RESUME'}
 f=b/'binding.json';f.write_bytes(canonical(binding));f.chmod(0o600);print(json.dumps(binding))
if __name__=='__main__':
 if sys.argv[1:]!=['--prepare-approved-once']:raise SystemExit('EXPLICIT_PREPARE_REQUIRED')
 main()
