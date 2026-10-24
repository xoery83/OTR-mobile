"""Finite CP14 configuration commands; sealed authority only, no provisioning defaults."""
import json
import re
import time
import os
import stat
import configparser
import subprocess
from pathlib import Path
from universal_scope_close import canonical,sha,instant,uid,digest,quote

KINDS=['external_integration_configure','intelligence_provider_config_append','external_integration_price_append','external_integration_set_kill','external_integration_set_kill']
ADMIN='otr_external_integration_admin_gateway'
CONTEXT={'version','principal_kind','verified_actor_id','verified_client_identity','verified_external_subject','verified_account_id','verified_environment','auth_source','auth_config_version','auth_session_reference','verified_at','expires_at','revoked','request_id','request_sha256','command_kind','gateway_identity'}

def validate_admin(plan):
    a=plan['adminControl'];s,e=instant(a['startsAt']),instant(a['expiresAt'])
    if a['version']!=1 or a['actorId']!=plan['sourceScope']['actor_id'] or a['integrationId']!=plan['providerScope']['integration_id']:raise ValueError('ADMIN_SCOPE_MISMATCH')
    if not re.fullmatch('[A-Za-z0-9._:-]{1,128}',a['integrationId']):raise ValueError('ADMIN_INTEGRATION_REQUIRED')
    if not 0<e-s<=900 or not s<=instant(plan['startsAt'])<instant(plan['expiresAt'])<=e-300 or instant(plan['expiresAt'])-instant(plan['startsAt'])>600:raise ValueError('ADMIN_RESTORATION_TAIL_REQUIRED')
    connection=a['connection']
    connectionKeys={'psql','psqlSHA256','serviceFile','serviceFileSHA256','serviceName'}|({'sshTunnel'} if 'sshTunnel' in connection else set())
    if set(connection)!=connectionKeys or not Path(connection['psql']).is_absolute() or not Path(connection['serviceFile']).is_absolute() or not re.fullmatch('[A-Za-z0-9_-]{1,64}',connection['serviceName']):raise ValueError('SEALED_ADMIN_CONNECTION_REQUIRED')
    digest(connection['psqlSHA256']);digest(connection['serviceFileSHA256'])
    if 'sshTunnel' in connection:validate_tunnel(connection['sshTunnel'])
    uid(a['actorId']);digest(a['verifiedAuthorityReceiptSHA256'])
    if a['verifiedAuthorityReceiptSHA256']=='0'*64:raise ValueError('VERIFIED_ADMIN_AUTHORITY_REQUIRED')
    if a['role']!={'name':ADMIN,'priorCanLogin':False,'expiresAt':a['expiresAt']}:raise ValueError('EXACT_TEMP_ADMIN_ROLE_REQUIRED')
    if a['environmentBaseline']['kill_switch'] is not True or not isinstance(a['environmentBaseline']['config_version'],int) or a['environmentBaseline']['config_version']<1:raise ValueError('CLOSED_ENVIRONMENT_BASELINE_REQUIRED')
    # This Gate is for one NEW integration, never an existing shared integration.
    if a['integrationBaseline'] is not None:raise ValueError('NEW_INTEGRATION_ONLY')
    if [x['kind'] for x in a['activation']]!=KINDS or len(a['restore'])!=2:raise ValueError('EXACT_ADMIN_COMMAND_SEQUENCE_REQUIRED')
    ids=set();audits=set()
    for index,x in enumerate(a['activation']+a['restore']):
        c,v=x['command'],x['context'];kind=x['kind']
        if kind not in KINDS or c['environment']!='DEV' or c['actor_id']!=a['actorId'] or c['version']!=1:raise ValueError('ADMIN_COMMAND_SCOPE')
        if c['request_id'] in ids or c['audit_id'] in audits:raise ValueError('ADMIN_COMMAND_ID_REUSED')
        uid(c['request_id']);uid(c['audit_id']);ids.add(c['request_id']);audits.add(c['audit_id'])
        body={k:v for k,v in c.items() if k!='request_sha256'}
        if c['request_sha256']!=sha(json.dumps({'domain':'otr-cp14-command-v1','command':body},sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()):raise ValueError('ADMIN_COMMAND_HASH')
        if set(v)!=CONTEXT or v['principal_kind']!='OTR_ADMIN' or v['gateway_identity']!=ADMIN or v['verified_actor_id']!=a['actorId'] or v['verified_environment']!='DEV' or v['command_kind']!=kind or v['request_id']!=c['request_id'] or v['request_sha256']!=c['request_sha256'] or v['revoked'] is not False or v['version']!=1:raise ValueError('VERIFIED_ADMIN_CONTEXT_REQUIRED')
        if instant(v['expires_at'])!=e or instant(v['verified_at'])>s or v['auth_config_version']<1 or not v['auth_source']:raise ValueError('ADMIN_CONTEXT_WINDOW')
        if c['integration_id']!=(None if index in [4,5] else a['integrationId']):raise ValueError('ADMIN_COMMAND_INTEGRATION')
        if index==0:
            r=c['row']
            if c['expected_version'] is not None or r['integration_id']!=a['integrationId'] or r['environment']!='DEV' or r['category']!='INTELLIGENCE_OUTBOUND' or r['kill_switch'] is not True or r['enabled'] is not True or r['config_version']!=1:raise ValueError('CLOSED_NEW_CONFIG_REQUIRED')
        elif index in [1,2]:
            if c['row']['integration_id']!=a['integrationId']:raise ValueError('CONFIG_ROW_SCOPE')
            if index==1:
                r=c['row']
                if r['provider_config_id']!=plan['providerScope']['provider_config_id'] or r['schema_contracts']!=[{'id':'universal-import','version':1,'dialect':'otr'}] or r['privacy_policy']!='REMOTE_ALLOWED' or not r['schema_output']:raise ValueError('UNIVERSAL_CONFIG_REQUIRED')
            elif c['row']['price_schedule_id']!=plan['providerScope']['price_schedule_id']:raise ValueError('PRICE_SCOPE')
        else:
            expected=[None,None,None,1,a['environmentBaseline']['config_version'],a['environmentBaseline']['config_version']+1,2][index]
            if c['expected_version']!=expected or c['kill_switch'] is not (index>=5):raise ValueError('EXACT_KILL_CAS_REQUIRED')
    for x,target in zip(a['restore'],[None,a['integrationId']]):
        if x['kind']!='external_integration_set_kill' or x['command']['integration_id']!=target:raise ValueError('RESTORE_ORDER_REQUIRED')
    grants=a['temporaryGrants']
    if len(grants)!=2 or {r['permission'] for r in grants}!={'CONFIG_ADMIN','SECURITY_ADMIN'}:raise ValueError('EXACT_TEMP_ADMIN_GRANTS_REQUIRED')
    for r in grants:
        if set(r)!={'admin_grant_id','actor_id','environment','permission','grant_revision','expires_at','revoked_at','created_at','created_by'} or r['actor_id']!=a['actorId'] or r['environment']!='DEV' or r['revoked_at'] is not None or r['grant_revision']!=1 or instant(r['expires_at'])!=e or instant(r['created_at'])!=s:raise ValueError('TEMP_ADMIN_GRANT_SCOPE')
        uid(r['admin_grant_id']);uid(r['created_by'])
    return a

def command_sql(x):
    return ('BEGIN; SET LOCAL lock_timeout=\'3s\'; SET LOCAL statement_timeout=\'20s\'; '
            'SELECT public.'+x['kind']+'('
            +quote(canonical(x['context']).decode())+'::jsonb,'+quote(canonical(x['command']).decode())+'::jsonb); COMMIT;')

def observe_sql(a):
    ids=[x['command']['request_id'] for x in a['activation']+a['restore']]
    return ("BEGIN READ ONLY; SELECT jsonb_build_object('environment',(SELECT jsonb_build_object('config_version',config_version,'kill_switch',kill_switch) FROM public.external_integration_environment_state WHERE environment='DEV'),"
            "'integration',(SELECT jsonb_build_object('config_version',config_version,'kill_switch',kill_switch) FROM public.external_integrations WHERE integration_id="+quote(a['integrationId'])+" AND environment='DEV'),"
            "'audits',COALESCE((SELECT jsonb_agg(jsonb_build_object('command_id',command_id,'admin_actor_id',admin_actor_id,'new_version',new_version,'safe_diff',safe_diff)) FROM public.external_integration_config_audit WHERE command_id IN ("+','.join(quote(i)+'::uuid' for i in ids)+")), '[]'::jsonb)) AS observation; COMMIT;")

def observe(a,sql):
    value=sql(observe_sql(a));rows=value if isinstance(value,list) else value.get('rows')
    if not isinstance(rows,list) or len(rows)!=1 or set(rows[0])!={'observation'}:raise ValueError('ADMIN_OBSERVATION_UNAVAILABLE')
    return rows[0]['observation']

def context_scope_hash(v):
    body={k:value for k,value in v.items() if k not in ['verified_at','expires_at','revoked','request_id','request_sha256','command_kind']}
    return sha(json.dumps(body,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode())

def receipted(o,x):
    c=x['command'];version=1 if x['kind']=='external_integration_price_append' else (c['expected_version'] or 0)+1
    return any(r['new_version']==version and r['safe_diff'].get('scope_sha256')==context_scope_hash(x['context']) and r['command_id']==c['request_id'] and r['admin_actor_id']==c['actor_id'] and r['safe_diff'].get('request_sha256')==c['request_sha256'] and r['safe_diff'].get('command_kind')==x['kind'] for r in o['audits'])

def dispatch_once(a,x,sql,admin_sql,now):
    if not instant(a['startsAt'])<=now()<instant(a['expiresAt']):raise ValueError('ADMIN_AUTHORITY_EXPIRED')
    if admin_sql is None:raise ValueError('ADMIN_LOGIN_TRANSPORT_REQUIRED')
    outcome='ACKNOWLEDGED'
    try:admin_sql(command_sql(x))
    except Exception:outcome='UNKNOWN'
    o=observe(a,sql)
    if not receipted(o,x):raise RuntimeError('ADMIN_COMMAND_UNKNOWN_OR_REJECTED')
    return o,outcome

def authority_sql(a):
    exact=[]
    for r in a['temporaryGrants']:
        fields={k:v for k,v in r.items() if k not in ['created_at','expires_at']}
        exact.append("EXISTS(SELECT 1 FROM public.external_integration_admin_grants g WHERE to_jsonb(g)-ARRAY['created_at','expires_at']="+quote(canonical(fields).decode())+"::jsonb AND created_at="+quote(r['created_at'])+"::timestamptz AND expires_at="+quote(r['expires_at'])+"::timestamptz)")
    exact += ["NOT EXISTS(SELECT 1 FROM public.external_integrations WHERE environment='DEV')","(SELECT count(*)=2 FROM public.external_integration_admin_grants WHERE actor_id="+quote(a['actorId'])+"::uuid AND environment='DEV' AND revoked_at IS NULL AND expires_at>clock_timestamp())", "EXISTS(SELECT 1 FROM pg_roles WHERE rolname='"+ADMIN+"' AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND NOT rolinherit AND rolvaliduntil="+quote(a['expiresAt'])+"::timestamptz)", "NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename='"+ADMIN+"')"]
    return "BEGIN READ ONLY; SELECT "+' AND '.join(exact)+" AS ready; COMMIT;"

def activate_once(plan,sql,admin_sql=None,now=time.time):
    a=validate_admin(plan)
    if plan['ownerAuthorized'] is not True:raise ValueError('OWNER_EXECUTION_REQUIRED')
    if not instant(plan['startsAt'])<=now()<instant(plan['expiresAt'])-80:raise ValueError('INNER_ACTIVATION_WINDOW_EXPIRED')
    ready=sql(authority_sql(a));rows=ready if isinstance(ready,list) else ready.get('rows')
    if rows!=[{'ready':True}]:raise ValueError('EXACT_FINITE_ADMIN_AUTHORITY_UNAVAILABLE')
    o=observe(a,sql)
    if o['environment']!=a['environmentBaseline'] or o['integration'] is not None or o['audits']:raise ValueError('ADMIN_BASELINE_DRIFT')
    outcomes=[]
    for x in a['activation']:
        if now()>=instant(plan['expiresAt'])-80:raise ValueError('INNER_ACTIVATION_WINDOW_EXPIRED')
        o,outcome=dispatch_once(a,x,sql,admin_sql,now);outcomes.append(outcome)
    return {'status':'FINITE_CONFIG_ACTIVE','writeDispositions':outcomes}

def revoke_sql(a):
    guards=[];updates=[]
    for r in a['temporaryGrants']:
        original=quote(canonical({k:v for k,v in r.items() if k not in ['created_at','expires_at']}).decode())+'::jsonb';key=quote(r['admin_grant_id'])+'::uuid'
        exact="to_jsonb(g)-ARRAY['created_at','expires_at']="+original+" AND g.created_at="+quote(r['created_at'])+"::timestamptz AND g.expires_at="+quote(r['expires_at'])+"::timestamptz"
        # Unknown prior writes are reconciled read-only; this is never rerun on UNKNOWN.
        guards.append("PERFORM 1 FROM public.external_integration_admin_grants WHERE admin_grant_id="+key+" FOR UPDATE; IF EXISTS(SELECT 1 FROM public.external_integration_admin_grants g WHERE g.admin_grant_id="+key+" AND NOT ("+exact+")) OR NOT EXISTS(SELECT 1 FROM public.external_integration_admin_grants g WHERE g.admin_grant_id="+key+") THEN RAISE EXCEPTION 'ADMIN_GRANT_DRIFT'; END IF;")
        updates.append("UPDATE public.external_integration_admin_grants SET revoked_at=clock_timestamp(),grant_revision=grant_revision+1 WHERE admin_grant_id="+key+';')
    guards.append("IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='"+ADMIN+"' AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND NOT rolinherit AND rolvaliduntil="+quote(a['expiresAt'])+"::timestamptz) THEN RAISE EXCEPTION 'ADMIN_ROLE_DRIFT'; END IF;")
    return ("BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='20s'; SELECT pg_advisory_xact_lock(714024,3); DO $finite$ BEGIN "+''.join(guards)+" END $finite$; "+''.join(updates)+" ALTER ROLE "+ADMIN+" NOLOGIN; SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename='"+ADMIN+"' AND backend_start>="+quote(a['startsAt'])+"::timestamptz AND backend_start<"+quote(a['expiresAt'])+"::timestamptz AND pid<>pg_backend_pid(); COMMIT;")

def revoked_sql(a):
    grants=[]
    for r in a['temporaryGrants']:
        original={k:v for k,v in r.items() if k not in ['revoked_at','grant_revision','created_at','expires_at']}
        grants.append("EXISTS(SELECT 1 FROM public.external_integration_admin_grants g WHERE admin_grant_id="+quote(r['admin_grant_id'])+"::uuid AND to_jsonb(g)-ARRAY['revoked_at','grant_revision','created_at','expires_at']="+quote(canonical(original).decode())+"::jsonb AND created_at="+quote(r['created_at'])+"::timestamptz AND expires_at="+quote(r['expires_at'])+"::timestamptz AND revoked_at IS NOT NULL AND grant_revision=2)")
    return "BEGIN READ ONLY; SELECT "+' AND '.join(grants+["NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='"+ADMIN+"' AND rolcanlogin)","NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename='"+ADMIN+"' AND backend_start>="+quote(a['startsAt'])+"::timestamptz AND backend_start<"+quote(a['expiresAt'])+"::timestamptz)"])+" AS closed; COMMIT;"

def restore_once(plan,sql,recover_only=False,now=time.time,admin_sql=None):
    a=validate_admin(plan)
    if plan['ownerAuthorized'] is not True:raise ValueError('OWNER_EXECUTION_REQUIRED')
    try:
        o=observe(a,sql)
        for x,key,baseline in [(a['restore'][0],'environment',a['environmentBaseline']),(a['restore'][1],'integration',None)]:
            current=o[key];c=x['command']
            if current==baseline:continue
            if current=={'config_version':c['expected_version']+1,'kill_switch':True} and receipted(o,x):continue
            if key=='integration' and current=={'config_version':1,'kill_switch':True}:continue
            if current!={'config_version':c['expected_version'],'kill_switch':False} or recover_only:return {'status':'RECONCILE_REQUIRED','adminClosed':False}
            o,_=dispatch_once(a,x,sql,admin_sql,now)
            if o[key]!={'config_version':c['expected_version']+1,'kill_switch':True}:return {'status':'RECONCILE_REQUIRED','adminClosed':False}
        if not recover_only:
            try:sql(revoke_sql(a))
            except Exception:pass
        result=sql(revoked_sql(a));rows=result if isinstance(result,list) else result.get('rows')
        closed=rows==[{'closed':True}]
        return {'status':'CLOSED_VERIFIED' if closed else 'RECONCILE_REQUIRED','adminClosed':closed}
    except Exception:return {'status':'RECONCILE_REQUIRED','adminClosed':False}

TUNNEL_HOST='178.105.151.143'
DB_HOST='db.tuqigdxrvrerfewsxqgm.supabase.co'
PINNED_DEV_CA_SHA256='700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7'
def validate_tunnel(t):
    keys={'pid','processStartedAt','processCommandSHA256','launchReceiptSHA256','launchReceiptFile','sshBinary','sshBinarySHA256','controlSocket','localPort','remoteUser','remoteHost','targetHost','targetPort','caFile','caFileSHA256'}
    if set(t)!=keys or not isinstance(t['pid'],int) or t['pid']<1 or not isinstance(t['localPort'],int) or not 1024<=t['localPort']<=65535 or t['remoteUser']!='root' or t['remoteHost']!=TUNNEL_HOST or t['targetHost']!=DB_HOST or t['targetPort']!=5432 or not t['processStartedAt']:raise ValueError('EXACT_TRUSTED_TUNNEL_REQUIRED')
    for key in ['processCommandSHA256','launchReceiptSHA256','sshBinarySHA256','caFileSHA256']:digest(t[key])
    if t['caFileSHA256']!=PINNED_DEV_CA_SHA256:raise ValueError('PINNED_SUPABASE_CA_REQUIRED')
    for key in ['sshBinary','controlSocket','caFile','launchReceiptFile']:
        if not Path(t[key]).is_absolute():raise ValueError('ABSOLUTE_TUNNEL_PATH_REQUIRED')
    return t

def trusted_tunnel_argv(t):
    # Pure launch proposal: PID/start/receipt do not exist until Root launches it.
    if t['remoteUser']!='root' or t['remoteHost']!=TUNNEL_HOST or t['targetHost']!=DB_HOST or t['targetPort']!=5432 or not isinstance(t['localPort'],int) or not 1024<=t['localPort']<=65535 or not Path(t['sshBinary']).is_absolute() or not Path(t['controlSocket']).is_absolute():raise ValueError('EXACT_TRUSTED_TUNNEL_REQUIRED')
    return [t['sshBinary'],'-M','-S',t['controlSocket'],'-N','-L',f"127.0.0.1:{t['localPort']}:{DB_HOST}:5432",'-oExitOnForwardFailure=yes','-oBatchMode=yes','-oStrictHostKeyChecking=yes','-oConnectTimeout=8',f"root@{TUNNEL_HOST}"]

def assert_tunnel(t):
    validate_tunnel(t)
    for path,h in [(t['sshBinary'],t['sshBinarySHA256']),(t['caFile'],t['caFileSHA256'])]:
        p=Path(path);st=p.lstat()
        if p.is_symlink() or not stat.S_ISREG(st.st_mode) or st.st_uid not in [0,os.getuid()] or st.st_mode&0o022 or sha(p.read_bytes())!=h:raise ValueError('TUNNEL_TRUST_INPUT_CHANGED')
    p=Path(t['controlSocket']);st=p.lstat();parent=p.parent.lstat()
    if p.is_symlink() or not stat.S_ISSOCK(st.st_mode) or st.st_uid!=os.getuid() or st.st_mode&0o777!=0o600 or p.parent.is_symlink() or not stat.S_ISDIR(parent.st_mode) or parent.st_uid!=os.getuid() or parent.st_mode&0o777!=0o700:raise ValueError('PRIVATE_TUNNEL_SOCKET_REQUIRED')
    receipt=Path(t['launchReceiptFile']);st=receipt.lstat();parent=receipt.parent.lstat()
    if receipt.is_symlink() or not stat.S_ISREG(st.st_mode) or st.st_uid!=os.getuid() or st.st_nlink!=1 or st.st_mode&0o777!=0o600 or receipt.parent.is_symlink() or parent.st_uid!=os.getuid() or parent.st_mode&0o777!=0o700 or sha(receipt.read_bytes())!=t['launchReceiptSHA256']:raise ValueError('PRIVATE_TUNNEL_RECEIPT_REQUIRED')
    launch=json.loads(receipt.read_text())
    expected={'version':1,'pid':t['pid'],'processStartedAt':t['processStartedAt'],'processCommandSHA256':t['processCommandSHA256'],'argv':trusted_tunnel_argv(t)}
    if launch!=expected:raise ValueError('TRUSTED_TUNNEL_LAUNCH_CHANGED')
    env=dict(os.environ,LC_ALL='C')
    r=subprocess.run(['/bin/ps','-p',str(t['pid']),'-o','lstart=','-o','command='],capture_output=True,text=True,env=env,timeout=3)
    if r.returncode or not r.stdout.strip().startswith(t['processStartedAt']) or sha(r.stdout.strip().encode())!=t['processCommandSHA256']:raise ValueError('TUNNEL_PROCESS_CHANGED')
    # Root seals the launch receipt for trusted_tunnel_argv; this process must still
    # own its private master socket. Never create/reconfigure a tunnel from this reader.
    r=subprocess.run([t['sshBinary'],'-S',t['controlSocket'],'-O','check','-oBatchMode=yes','-oStrictHostKeyChecking=yes',f"root@{TUNNEL_HOST}"],capture_output=True,text=True,timeout=3)
    if r.returncode or not re.search(r'\bpid='+str(t['pid'])+r'\)',r.stderr+r.stdout):raise ValueError('TUNNEL_MASTER_UNCONFIRMED')

class AdminSqlTransport:
    """Dedicated LOGIN, never management-role impersonation or credentials in argv."""
    def __init__(self,plan):
        a=validate_admin(plan);c=a['connection'];self.config=c;self.expires=instant(a['expiresAt'])
        parent=Path(c['serviceFile']).parent;st=parent.lstat()
        if parent.is_symlink() or parent.resolve()!=parent or not stat.S_ISDIR(st.st_mode) or st.st_uid not in [0,os.getuid()] or st.st_mode&0o777!=0o700:raise ValueError('ADMIN_PRIVATE_DIRECTORY_REQUIRED')
        for key,mode in [('serviceFile',0o600),('psql',None)]:
            p=Path(c[key]);st=p.lstat()
            if p.is_symlink() or not stat.S_ISREG(st.st_mode) or st.st_uid not in [0,os.getuid()] or st.st_mode&0o022 or (mode is not None and (st.st_mode&0o777!=mode or st.st_nlink!=1)) or sha(p.read_bytes())!=c[key+'SHA256']:raise ValueError('ADMIN_PRIVATE_FILE_CHANGED')
        parser=configparser.ConfigParser(interpolation=None);parser.read(c['serviceFile'])
        if parser.sections()!=[c['serviceName']]:raise ValueError('ONE_ADMIN_SERVICE_REQUIRED')
        fields=dict(parser[c['serviceName']])
        tunnel=c.get('sshTunnel')
        allowed={'host','port','dbname','user','password','sslmode','sslrootcert','connect_timeout'}|({'hostaddr'} if tunnel else set())
        root=tunnel['caFile'] if tunnel else 'system';port=str(tunnel['localPort']) if tunnel else '5432'
        if set(fields)-allowed or fields.get('host')!=DB_HOST or fields.get('user')!=ADMIN or fields.get('dbname')!='postgres' or fields.get('sslmode')!='verify-full' or fields.get('sslrootcert')!=root or fields.get('connect_timeout')!='8' or not fields.get('password') or fields.get('port','5432')!=port or (tunnel and fields.get('hostaddr')!='127.0.0.1'):raise ValueError('EXACT_DEV_ADMIN_SERVICE_REQUIRED')
        if tunnel:assert_tunnel(tunnel)
    def __call__(self,q):
        if time.time()>=self.expires:raise ValueError('ADMIN_AUTHORITY_EXPIRED')
        # Recheck sealed private input on every command, without logging its content.
        c=self.config;p=Path(c['serviceFile']);st=p.lstat()
        if p.is_symlink() or st.st_mode&0o777!=0o600 or st.st_uid not in [0,os.getuid()] or st.st_nlink!=1 or sha(p.read_bytes())!=c['serviceFileSHA256'] or sha(Path(c['psql']).read_bytes())!=c['psqlSHA256']:raise ValueError('ADMIN_PRIVATE_FILE_CHANGED')
        if 'sshTunnel' in c:assert_tunnel(c['sshTunnel'])
        env={k:v for k,v in os.environ.items() if not k.startswith('PG')}
        env['PGSERVICEFILE']=c['serviceFile']
        r=subprocess.run([c['psql'],'service='+c['serviceName'],'-X','-qAt','--no-password','-v','ON_ERROR_STOP=1'],input=q,text=True,capture_output=True,env=env,timeout=35)
        if r.returncode:raise RuntimeError('ADMIN_COMMAND_TRANSPORT_UNKNOWN')
        return r.stdout
