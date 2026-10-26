"""Actual CP14 finite config/CAS restore on owned network-none PG only; synthetic rates/auth."""
from pathlib import Path
import subprocess,json,uuid,time,sys,hashlib,copy
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts/import'))
from universal_config_control_test import fixture,rehash
from universal_config_control import activate_once,restore_once,command_sql,observe_sql,validate_admin
from universal_scope_close import canonical
from build_universal_admin_plan import build_admin_plan,AUTH_BASE,ORDER
NAME='otr-universal-config-'+uuid.uuid4().hex[:12]
created=False
try:
    r=subprocess.run(['docker','run','--name',NAME,'--network','none','-d','otr-core-v2-server84-fixture:20261012'],capture_output=True,text=True);assert r.returncode==0,r.stderr;created=True
    for _ in range(50):
        if subprocess.run(['docker','exec',NAME,'pg_isready','-U','supabase_admin'],capture_output=True).returncode==0:break
        time.sleep(.2)
    else:raise RuntimeError('ISOLATED_PG_NOT_READY')
    # Cached Server84 contains historical synthetic integration rows. Keep it intact;
    # a schema-only NEW database matches actual DEV's empty Provider baseline.
    dump=subprocess.run(['docker','exec',NAME,'pg_dump','--schema-only','--section=pre-data','-U','supabase_admin','-d','postgres'],capture_output=True,text=True);assert dump.returncode==0,dump.stderr[-2000:]
    made=subprocess.run(['docker','exec',NAME,'createdb','-U','supabase_admin','--template=template0','universal_config_clean'],capture_output=True,text=True);assert made.returncode==0,made.stderr
    applied=subprocess.run(['docker','exec','-i',NAME,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','universal_config_clean'],input='CREATE SCHEMA IF NOT EXISTS public AUTHORIZATION pg_database_owner;\n'+dump.stdout,text=True,capture_output=True);assert applied.returncode==0,applied.stderr[-2500:]
    seeded=subprocess.run(['docker','exec',NAME,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d','universal_config_clean','-c',"insert into public.external_integration_environment_state(environment,updated_at) values('TEST',clock_timestamp()),('DEV',clock_timestamp()),('PRODUCTION',clock_timestamp());"],capture_output=True,text=True);assert seeded.returncode==0,seeded.stderr
    post=subprocess.run(['docker','exec',NAME,'pg_dump','--schema-only','--section=post-data','-U','supabase_admin','-d','postgres'],capture_output=True,text=True);assert post.returncode==0,post.stderr[-2000:]
    applied=subprocess.run(['docker','exec','-i',NAME,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','universal_config_clean'],input=post.stdout,text=True,capture_output=True);assert applied.returncode==0,applied.stderr[-2500:]
    source=(ROOT/'scripts/cp15/security-acceptance.py').read_text().split("for permission in ['CONFIG_ADMIN','SECURITY_ADMIN','COST_READER','SUPPORT_RECOVERY']:")[0].replace("'otr-cp15-acceptance'",repr(NAME))
    source=source.replace("exec(compile(source,","source=source.replace(\"'-d','postgres'\",\"'-d','universal_config_clean'\")\nexec(compile(source,")
    ns={'__file__':str(ROOT/'scripts/cp15/security-acceptance.py')};exec(compile(source,ns['__file__'],'exec'),ns)
    sql,row,actor=ns['sql'],ns['row'],ns['actor'];p=fixture();old=p['sourceScope']['actor_id']
    p=json.loads(json.dumps(p).replace(old,actor));a=p['adminControl'];integration=a['integrationId']
    baseline=json.loads(sql("select jsonb_build_object('config_version',config_version,'kill_switch',kill_switch) from public.external_integration_environment_state where environment='DEV';").stdout.strip());assert baseline['kill_switch'] is True
    a['environmentBaseline']=baseline;a['activation'][4]['command']['expected_version']=baseline['config_version'];a['restore'][0]['command']['expected_version']=baseline['config_version']+1
    i=row('external_integrations');i.update(integration_id=integration,category='INTELLIGENCE_OUTBOUND',vendor_namespace='DeepSeek',environment='DEV',enabled=True,kill_switch=True,config_version=1,capabilities=['EXTRACT'],health_state='UNKNOWN',credential_reference='vault:isolated/no-real-key',created_by=actor,updated_by=actor)
    cfg=row('intelligence_provider_configs');cfg.update(provider_config_id=p['providerScope']['provider_config_id'],integration_id=integration,provider_id='DeepSeek',model_id='deepseek-flash',model_version='DeepSeek-V4.1-Flash',adapter_version='isolated-universal',provider_class='COMMERCIAL_REMOTE',capabilities=['EXTRACT'],modalities=['TEXT'],schema_contracts=[{'id':'universal-import','version':1,'dialect':'otr'}],schema_output=True,privacy_policy='REMOTE_ALLOWED',network_required=True,routing_class='COMMERCIAL_REMOTE',routing_eligibility='ELIGIBLE',replay_support='UNSUPPORTED',created_by=actor)
    price=row('external_integration_price_schedules');price.update(price_schedule_id=p['providerScope']['price_schedule_id'],integration_id=integration,provider_id='DeepSeek',model_id='deepseek-flash',schedule_version='synthetic-only',currency='USD',effective_from=ns['NOW'],rounding_policy='SUM_THEN_CEIL_NANOS_V1',created_by=actor)
    for x,r in zip(a['activation'][:3],[i,cfg,price]):x['command']['row']=r
    a['activation'][2]['command']['units']=[{'price_schedule_id':price['price_schedule_id'],'unit_key':k,'measurement_unit':k,'unit_quantity':1000,'price_per_quantity':'0.000001','unit_definition':{'version':1,'relationship':'DISJOINT','included_in':None,'billable':True}} for k in ['input_tokens','cached_input_tokens','output_tokens']]
    for x in a['activation']+a['restore']:
        c=x['command'];c['request_sha256']=hashlib.sha256(canonical({'domain':'otr-cp14-command-v1','command':{k:v for k,v in c.items() if k!='request_sha256'}})).hexdigest();x['context'].update(verified_actor_id=actor,verified_account_id=actor,request_sha256=c['request_sha256'])
    # Bind all seven commands through the same no-network Root packaging entry.
    # These are declared synthetic authority facts, never actual normal Auth evidence.
    auth={k:v for k,v in a['activation'][0]['context'].items() if k in AUTH_BASE}
    auth['auth_session_reference']='vault:isolated-normal-auth'
    facts={'version':1,'actorId':actor,'outerStartsAt':a['startsAt'],'outerExpiresAt':a['expiresAt'],
      'environmentBaseline':baseline,'connection':a['connection'],
      'verifiedAuthorityReceiptSHA256':a['verifiedAuthorityReceiptSHA256'],'normalAuthReceiptSHA256':'f'*64,
      'authSessionExpiresAt':a['expiresAt'],'authContextBase':auth,
      'commandIdentities':{name:{'requestId':x['command']['request_id'],'auditId':x['command']['audit_id']} for name,x in zip(ORDER,a['activation']+a['restore'])},
      'grantIdentities':{g['permission']:g['admin_grant_id'] for g in a['temporaryGrants']},
      'grantorActorId':actor,'reasonCode':a['activation'][0]['command']['reason_code'],
      'integrationRow':i,'providerRow':cfg,'priceRow':price,'priceUnits':a['activation'][2]['command']['units']}
    p.pop('adminControl');p=build_admin_plan(p,facts);a=p['adminControl']
    def transport(q):
        result=sql(q,'postgres',True)
        if result.returncode:
            print(result.stderr[-2000:],file=sys.stderr);raise RuntimeError('ISOLATED_SQL_REJECTED')
        lines=result.stdout.strip().splitlines();return (lines[-1] if lines[-1] in ['t','f'] else json.loads(lines[-1])) if lines else []
    def wrapped(q):
        result=transport(q)
        return [{'observation':result}] if 'AS observation' in q else [{'closed':result=='t'}] if ' AS closed;' in q else [{'ready':result=='t'}] if ' AS ready;' in q else result
    checks=[]
    # Arm-before-provision: original empty grants + NOLOGIN is already closed.
    assert restore_once(p,wrapped)['status']=='CLOSED_VERIFIED'
    checks.append('never-activated empty integration/grants and NOLOGIN confirmed closed without provisioning')
    partial=json.loads(json.dumps(p).replace(actor,ns['other']));pa=partial['adminControl']
    for x in pa['activation']+pa['restore']:
        c=x['command'];c['request_sha256']=hashlib.sha256(canonical({'domain':'otr-cp14-command-v1','command':{k:v for k,v in c.items() if k!='request_sha256'}})).hexdigest();x['context']['request_sha256']=c['request_sha256']
    for g in pa['temporaryGrants']:g['admin_grant_id']=str(uuid.uuid4())
    g=pa['temporaryGrants'][0]
    sql("insert into public.external_integration_admin_grants select (jsonb_populate_record(null::public.external_integration_admin_grants,"+ns['literal'](g)+")).*;")
    sql("alter role otr_external_integration_admin_gateway login password 'ISOLATED_SYNTHETIC_NO_DEV_CREDENTIAL' valid until '"+pa['expiresAt']+"';")
    drift=copy.deepcopy(partial);drift['adminControl']['temporaryGrants'][0]['created_by']=str(uuid.uuid4())
    assert restore_once(drift,wrapped)['status']=='RECONCILE_REQUIRED'
    assert sql("select revoked_at is null from public.external_integration_admin_grants where admin_grant_id='"+g['admin_grant_id']+"';").stdout.strip()=='t'
    foreign=copy.deepcopy(pa['temporaryGrants'][1]);foreign['admin_grant_id']=str(uuid.uuid4())
    sql("insert into public.external_integration_admin_grants select (jsonb_populate_record(null::public.external_integration_admin_grants,"+ns['literal'](foreign)+")).*;")
    assert restore_once(partial,wrapped)['status']=='RECONCILE_REQUIRED'
    assert sql("select revoked_at is null from public.external_integration_admin_grants where admin_grant_id='"+g['admin_grant_id']+"';").stdout.strip()=='t'
    # Disposable fixture owner withdraws its foreign grant; control never touches it.
    sql("update public.external_integration_admin_grants set revoked_at=clock_timestamp(),grant_revision=2 where admin_grant_id='"+foreign['admin_grant_id']+"';")
    assert restore_once(partial,wrapped)['status']=='CLOSED_VERIFIED'
    assert restore_once(partial,wrapped,recover_only=True)['status']=='CLOSED_VERIFIED'
    checks.append('pre-configure one-grant partial provisioning revoked exactly; absent second grant accepted, drift/foreign grant rejected without mutation')
    for g in a['temporaryGrants']:
        # Isolated pre-existing fixture permission is replaced with this exact finite grant.
        g['actor_id']=actor;g['created_by']=actor
        sql("insert into public.external_integration_admin_grants select (jsonb_populate_record(null::public.external_integration_admin_grants,"+ns['literal'](g)+")).*;")
    sql("alter role otr_external_integration_admin_gateway login password 'ISOLATED_SYNTHETIC_NO_DEV_CREDENTIAL' valid until '"+a['expiresAt']+"';")
    rehash(p);validate_admin(p)
    def admin_transport(q):
        # Actual dedicated fixture LOGIN; local trusted socket, no copied Auth/session/secret.
        r=subprocess.run(['docker','exec','-i','-e','PGPASSWORD=ISOLATED_SYNTHETIC_NO_DEV_CREDENTIAL',NAME,'psql','-h','127.0.0.1','-X','-qAt','-v','ON_ERROR_STOP=1','-U','otr_external_integration_admin_gateway','-d','universal_config_clean'],input=q,text=True,capture_output=True)
        if r.returncode:print(r.stderr[-2000:],file=sys.stderr);raise RuntimeError('ISOLATED_ADMIN_REJECTED')
        return r.stdout
    # One owning activation command transport loses its response after COMMIT: exact audit reconciles.
    lost=[False]
    def unknown_once(q):
        result=admin_transport(q)
        if 'public.external_integration_configure(' in q and not lost[0]:lost[0]=True;raise RuntimeError('SIMULATED_RESPONSE_LOSS_AFTER_COMMIT')
        return result
    assert activate_once(p,wrapped,admin_sql=unknown_once)['writeDispositions'][0]=='UNKNOWN';checks.append('binder-generated real configure/configAppend/priceAppend and two set_kill commands; UNKNOWN COMMIT reconciled by immutable audit')
    assert json.loads(sql("select to_jsonb(s) from public.external_integration_environment_state s where environment='DEV';").stdout)['runtime_enabled'] is False;checks.append('global runtime_enabled remains false')
    # Wrong CAS is rejected by the actual owning function; no state mutation.
    bad=copy.deepcopy(a['restore'][0]);bad['command']['expected_version']=9
    bad['command']['request_sha256']=hashlib.sha256(canonical({'domain':'otr-cp14-command-v1','command':{k:v for k,v in bad['command'].items() if k!='request_sha256'}})).hexdigest();bad['context']['request_sha256']=bad['command']['request_sha256']
    result=sql('SET SESSION AUTHORIZATION otr_external_integration_admin_gateway; '+command_sql(bad),'supabase_admin',True);assert result.returncode and 'CP14_CONFIG_CAS' in result.stderr;checks.append('actual owning CAS conflict denies restore without overwrite')
    assert restore_once(p,wrapped,admin_sql=admin_transport)['status']=='CLOSED_VERIFIED';checks.append('real environment then integration owning CAS restore, exact grants revoked and admin role NOLOGIN')
    assert restore_once(p,wrapped,recover_only=True)['status']=='CLOSED_VERIFIED';checks.append('restart recovery read-only confirms exact restore audit and revoked authority')
    assert sql("select count(*) from public.external_integration_admin_grants where actor_id='"+actor+"' and environment='TEST' and permission='COST_READER' and revoked_at is null;").stdout.strip()=='1';checks.append('unrelated existing grant untouched')
    print(json.dumps({'status':'LOCAL_ISOLATED_CP14_CONFIG_RESTORE_PASS','fixtureDatabase':'new schema-only universal_config_clean; cached original DB unchanged; zero DEV integrations before activation','checks':checks,'hostedWrites':0,'providerCalls':0,'auth':'synthetic FK/context fixture, not actual normal Auth qualification','prices':'synthetic rates only, not deployable schedule'},indent=2))
finally:
    if created:subprocess.run(['docker','rm','-f',NAME],capture_output=True)
