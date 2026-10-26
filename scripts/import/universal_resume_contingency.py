"""One approved close-only contingency. No Source/Provider activation or business writes."""
import base64
import datetime as dt
import json
import os
import subprocess
import sys
import time
from pathlib import Path
import universal_resume_security_rescue as r
from universal_config_control import receipted, revoke_sql
from universal_continuous_transition import canonical,sha,write_private,instant
from universal_continuous_runtime_ports import remote_python,admin_command,restore_retained,read_runtime
from universal_continuous_sql_ports import observe_sql,read_sql_metadata,GROUPS,DEPENDENCY,close_roles_sql
from universal_cleanup_only import roles_sql
from universal_scope_close import quote,SqlTransport


def observation_sql(normal,rescue):
    q=observe_sql(normal)
    old=','.join(quote(x['command']['request_id'])+'::uuid' for x in normal['providerControl']['activationCommands']+normal['providerControl']['closeCommands'])
    extra=','.join(quote(x['command']['request_id'])+'::uuid' for x in rescue['providerControl']['closeCommands'])
    token='command_id IN ('+old+')'
    if q.count(token)!=1:raise ValueError('EXACT_OBSERVATION_QUERY_REQUIRED')
    return q.replace(token,'command_id IN ('+old+','+extra+')')


def closed_provider(o):
    return o['scopeState']=='CLOSED' and o['grantState']=='CLOSED' and o['integration']=={'config_version':17,'kill_switch':True} and o['environment']=={'config_version':17,'kill_switch':True,'runtime_enabled':False}


def exact_closed_metadata(normal,state,metadata,security_revision=12):
    grants={g['permission']:g for g in state['grants']}
    if (len(grants)!=2 or grants['SECURITY_ADMIN']['admin_grant_id']!=r.SECURITY or grants['CONFIG_ADMIN']['admin_grant_id']!=r.CONFIG
        or grants['SECURITY_ADMIN']['grant_revision']!=security_revision or grants['CONFIG_ADMIN']['grant_revision']!=8
        or any(g['revoked_at'] is None or g['actor_id']!=normal['actorId'] or g['environment']!='DEV' for g in grants.values())
        or state['policy']['enabled'] is not False or state['policy']['universal_import_enabled'] is not False
        or type(state['sessions']) is not int or state['sessions']!=0 or len(state['roles'])!=3 or {x['name'] for x in state['roles']}!={'otr_trip_source_command_gateway','otr_external_integration_call_gateway','otr_external_integration_admin_gateway'}
        or any(x['login'] is not False or x['unsafe'] is not False or x['limit']!=1 for x in state['roles'])):return False
    names=[s for group in GROUPS.values() for s in group]
    return (metadata['unsafe'] is False and metadata['catalog']==normal['catalogBaseline']
        and all(metadata['functionHashes'].get(s)==normal['installedFunctionHashes'][s] for s in names)
        and metadata['functionHashes'].get(DEPENDENCY)==normal['functionPreimages'][DEPENDENCY]
        and all(x is False for x in metadata['sourceMeterLogins'].values())
        and all(type(x) is int and x==0 for x in metadata['sourceMeterSessions'].values()))


def execute_closures(normal,rescue,observe,invoke,claimed,clock=time.time):
    """Only owning results decide which close command is still pending."""
    outcomes=[]
    for i,(old,new) in enumerate(zip(normal['providerControl']['closeCommands'],rescue['providerControl']['closeCommands'])):
        o=observe();phase=o['grantState' if i==0 else 'scopeState'] if i<2 else o['integration' if i==2 else 'environment']
        is_closed=phase=='CLOSED' if i<2 else phase['config_version']==17 and phase['kill_switch'] is True
        if is_closed and (receipted(o,old) or receipted(o,new)):outcomes.append({'index':i,'outcome':'READBACK_ALREADY_CLOSED'});continue
        is_active=phase=='ACTIVE' if i<2 else phase['config_version']==16 and phase['kill_switch'] is False
        if not is_active or receipted(o,old) or receipted(o,new) or claimed(new):raise ValueError('RESCUE_OUTCOME_RECONCILE_REQUIRED')
        if i==3 and phase['runtime_enabled'] is not False:raise ValueError('GLOBAL_RUNTIME_DRIFT')
        if clock()>=instant(rescue['adminControl']['expiresAt'])-180:raise ValueError('RESCUE_RESTORE_RESERVE_REQUIRED')
        outcome='ACKNOWLEDGED'
        try:invoke(i)
        except Exception:outcome='UNKNOWN'
        o=observe()
        if not receipted(o,new):raise ValueError('RESCUE_CLOSE_UNCONFIRMED')
        phase=o['grantState' if i==0 else 'scopeState'] if i<2 else o['integration' if i==2 else 'environment']
        if not (phase=='CLOSED' if i<2 else phase['config_version']==17 and phase['kill_switch'] is True):raise ValueError('RESCUE_CLOSE_ROW_DRIFT')
        outcomes.append({'index':i,'outcome':outcome})
    if not closed_provider(observe()):raise ValueError('RESCUE_PROVIDER_NOT_CLOSED')
    return outcomes


def runtime_closed(normal,value):
    p=normal['runtime']
    return value=={'containerId':p['originalContainerId'],'imageId':p['baselineImageId'],'healthy':True,'configSHA256':p['baselineConfigSHA256'],'hostConfigSHA256':p['baselineHostConfigSHA256'],'mountsSHA256':p['baselineMountsSHA256']}


def transfer_projection(rescue,expected):
    payload=canonical({k:v for k,v in rescue.items() if k!='operatorPlanSHA256'})
    source='data='+repr(base64.b64encode(payload).decode())+'\nexpected='+repr(expected)+'\nnewsha='+repr(rescue['operatorPlanSHA256'])+'\n'+r'''
import os,json,hashlib,base64
p='/opt/otr/dev-backend/private/universal-stage2-continuous/plan.json'
assert os.stat(p).st_mode&511==384 and hashlib.sha256(open(p,'rb').read()).hexdigest()==expected
b=base64.b64decode(data);assert hashlib.sha256(b).hexdigest()==newsha
t=p+'.rescue-'+newsha;fd=os.open(t,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'wb') as f:f.write(b)
assert hashlib.sha256(open(p,'rb').read()).hexdigest()==expected
os.replace(t,p)
print(json.dumps({'sha256':hashlib.sha256(open(p,'rb').read()).hexdigest()}))
'''
    if remote_python(source).get('sha256')!=rescue['operatorPlanSHA256']:raise ValueError('RESCUE_PROJECTION_TRANSFER_UNKNOWN')


def run(normal,directory):
    # No implicit repeated contingency. Claim and sealed preimages survive failure.
    directory=Path(directory)/'security-close-rescue'
    if directory.exists():
        # Existing claimant is independently watched; no second renewal or restore.
        result=directory/'result.json'
        raise ValueError('RESCUE_ALREADY_CLAIMED_REQUIRES_FRESH_READBACK')
    directory.mkdir(mode=0o700)
    sql=SqlTransport('/Users/xoery/Project/otr-mobile/node_modules/.bin/supabase','/Users/xoery/Project/otr-mobile-canonical',str(directory))
    one=lambda query,key:sql(query)['rows'][0][key]
    state=one(roles_sql(),'state');meta=one(read_sql_metadata(normal),'metadata')
    if not exact_closed_metadata(normal,state,meta,10):raise ValueError('RESCUE_REQUIRES_CLOSED_POLICY_SERVICE_ADMIN')
    now=dt.datetime.now(dt.timezone.utc).replace(microsecond=0);z=lambda d:d.isoformat().replace('+00:00','Z')
    old_end=dt.datetime.fromisoformat(normal['adminControl']['expiresAt'].replace('Z','+00:00'))
    # Existing own normal session, no Session copy. Operator independently GET /user.
    auth=remote_python(r'''
import json,datetime,urllib.request
p='/opt/otr/dev-backend/private/qa-auth/universal-stage2-20261025.json'
a=json.load(open(p));c=json.load(open('/opt/otr/dev-backend/private/universal-stage2-continuous/credentials.json'))
assert a['accountId']=='f4b059c5-8241-4ffb-aa15-37fa25474543'
request=urllib.request.Request('https://tuqigdxrvrerfewsxqgm.supabase.co/auth/v1/user',headers={'apikey':c['publishableKey'],'Authorization':'Bearer '+a['session']['access_token']})
with urllib.request.urlopen(request,timeout=10) as response:u=json.load(response)
assert u['id']==a['accountId'] and u['email_confirmed_at']
z=lambda d:d.isoformat().replace('+00:00','Z')
print(json.dumps({'verifiedAt':z(datetime.datetime.now(datetime.timezone.utc)),'expiresAt':z(datetime.datetime.fromtimestamp(a['session']['expires_at'],datetime.timezone.utc))}))
''')
    # Seal the window after the actual /user receipt, never before its timestamp.
    now=dt.datetime.now(dt.timezone.utc).replace(microsecond=0)+dt.timedelta(seconds=2)
    separate=(old_end-now).total_seconds()<360
    start=max(now,old_end+dt.timedelta(seconds=1)) if separate else now
    end=start+dt.timedelta(seconds=900) if separate else old_end
    close=min(start+dt.timedelta(seconds=480),end-dt.timedelta(seconds=240))
    if instant(auth['expiresAt'])<end.timestamp():raise ValueError('NORMAL_RESCUE_AUTH_COVERAGE_REQUIRED')
    prior=next(g for g in state['grants'] if g['permission']=='SECURITY_ADMIN')
    rescue=r.build(normal,prior,auth['verifiedAt'],z(start),z(end),z(close),separate)
    write_private(directory/'plan.json',rescue);transfer_projection(rescue,normal['operatorPlanSHA256'])
    # Standalone process owns lock/watch/deadline; parent does not reuse normal ports.
    log=open(directory/'watch.log','x');os.chmod(directory/'watch.log',0o600)
    proc=subprocess.Popen([sys.executable,__file__,'watch',str(directory),sha(canonical(rescue))],stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.DEVNULL,start_new_session=True,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'})
    for _ in range(30):
        if (directory/'watch-armed.json').exists():break
        if proc.poll() is not None:raise ValueError('RESCUE_WATCH_NOT_ARMED')
        time.sleep(.2)
    else:raise ValueError('RESCUE_WATCH_NOT_ARMED')
    while time.time()<start.timestamp():time.sleep(min(1,start.timestamp()-time.time()))
    disposition='ACKNOWLEDGED'
    try:sql(r.setup_sql(rescue))
    except Exception:disposition='UNKNOWN'
    actual=one(roles_sql(),'state')
    if not r.active_security(rescue,actual):raise ValueError('RESCUE_RENEWAL_NOT_VERIFIED')
    write_private(directory/'renewal-readback.json',{'disposition':disposition,'state':actual})
    return finish(rescue,directory,sql)


def finish(rescue,directory,sql):
    import fcntl
    directory=Path(directory);normal=rescue['normalResumePlan'];r.validate(rescue)
    with open(directory/'close.lock','a') as lock:
        os.chmod(directory/'close.lock',0o600)
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:return {'status':'CLOSER_BUSY'}
        if (directory/'result.json').exists():return json.loads((directory/'result.json').read_text())
        one=lambda q,k:sql(q)['rows'][0][k]
        observe=lambda:one(observation_sql(normal,rescue),'observation')
        def claimed(c):
            return remote_python("import os,json\nprint(json.dumps({'claimed':os.path.exists('/opt/otr/dev-backend/private/universal-stage2-continuous/command-"+c['command']['request_id']+".claimed')}))")['claimed']
        steps=[];ok=False
        try:steps=execute_closures(normal,rescue,observe,lambda i:admin_command(rescue,'closeCommands',i),claimed);ok=True
        except Exception:pass
        try:sql(r.close_sql(rescue))
        except Exception:pass
        state=one(roles_sql(),'state');meta=one(read_sql_metadata(normal),'metadata')
        closed=ok and exact_closed_metadata(normal,state,meta) and closed_provider(observe())
        if closed:
            # Reuse reviewed diagnostics retention and retained-container rollback.
            from universal_continuous_runtime_ports import retain_diagnostics
            if not (directory/'restore-claimed.json').exists():
                retain_diagnostics(normal,directory)
                write_private(directory/'restore-claimed.json',{'normalPlanSHA256':sha(canonical(normal))})
                try:restore_retained(normal)
                except Exception:pass
            closed=runtime_closed(normal,read_runtime(normal)) and exact_closed_metadata(normal,one(roles_sql(),'state'),one(read_sql_metadata(normal),'metadata')) and closed_provider(observe())
        result={'status':'CLOSED_VERIFIED' if closed else 'RECONCILE_REQUIRED','checks':dict.fromkeys(['source','sql','admin','runtime'],closed),'steps':steps}
        write_private(directory/'result.json',result);return result


def watch(directory,digest):
    directory=Path(directory);rescue=json.loads((directory/'plan.json').read_text())
    if sha(canonical(rescue))!=digest:raise ValueError('RESCUE_PLAN_SEAL')
    r.validate(rescue);normal=rescue['normalResumePlan']
    sql=SqlTransport('/Users/xoery/Project/otr-mobile/node_modules/.bin/supabase','/Users/xoery/Project/otr-mobile-canonical',str(directory))
    write_private(directory/'watch-armed.json',{'planSHA256':digest})
    while time.time()<instant(rescue['closeAt']):
        if (directory/'result.json').exists():return json.loads((directory/'result.json').read_text())
        time.sleep(1)
    while time.time()<instant(rescue['adminControl']['expiresAt'])-120:
        value=finish(rescue,directory,sql)
        if value['status']!='CLOSER_BUSY':return value
        time.sleep(1)
    try:sql(r.close_sql(rescue))
    except Exception:pass
    return {'status':'RECONCILE_REQUIRED','reason':'RESCUE_CLOSER_BUSY_DEADLINE'}

if __name__=='__main__':
    if len(sys.argv)!=4 or sys.argv[1]!='watch':raise SystemExit('EXPLICIT_WATCH_ONLY')
    try:print(json.dumps(watch(sys.argv[2],sys.argv[3])))
    except Exception:print(json.dumps({'status':'RECONCILE_REQUIRED'}));raise SystemExit(2)
