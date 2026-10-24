"""Network-none PG17 scope-closure/process regression. No Auth, Sources or Provider calls."""
import datetime as dt,json,os,subprocess,sys,tempfile,time,uuid
from pathlib import Path
from universal_close_test import plan,rehash
from universal_scope_close import canonical,close_once,close_sql,readback_sql
ROOT=Path(__file__).resolve().parents[2];NAME='otr-universal-close-'+uuid.uuid4().hex[:12]
DOCKER='docker';IMAGE='otr-core-v2-server84-fixture:20261012';checks=[]
def docker(*args,text=None,required=True):
    r=subprocess.run([DOCKER,*args],input=text,text=True,capture_output=True,timeout=35)
    if required and r.returncode:raise RuntimeError(r.stderr[-2000:])
    return r

def sql(text):
    r=docker('exec','-i',NAME,'psql','-XqAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1',text=text)
    return [{'closed':True}] if r.stdout.strip().splitlines()[-1:]==['t'] else []
def literal(value):return "'"+value.replace("'","''")+"'"
def install_scope(p):
    for table,key in [('trip_source_universal_scope','sourceScope'),('universal_import_provider_scope','providerScope')]:
        row=canonical(p[key]).decode()
        sql(f"INSERT INTO public.{table} SELECT * FROM jsonb_populate_record(NULL::public.{table},{literal(row)}::jsonb);")
    sql("ALTER ROLE otr_trip_source_command_gateway LOGIN PASSWORD 'ISOLATED_ONLY' VALID UNTIL "+literal(p['expiresAt'])+';')
def clear():sql('DELETE FROM public.trip_source_universal_scope;DELETE FROM public.universal_import_provider_scope;ALTER ROLE otr_trip_source_command_gateway NOLOGIN;')
created=False
try:
    docker('run','--name',NAME,'--network','none','-d',IMAGE);created=True
    for _ in range(60):
        if docker('exec',NAME,'pg_isready','-U','supabase_admin',required=False).returncode==0:break
        time.sleep(.2)
    else:raise RuntimeError('FIXTURE_NOT_READY')
    # Reuse the accepted CP14/CP15 fixture installer/ACL baseline, stopping before
    # any Flight scope or call. This is the same local prelude as provider acceptance.
    prelude=(ROOT/'scripts/cp15/security-acceptance.py').read_text().split('scope=dict(')[0]
    prelude=prelude.replace("'otr-cp15-acceptance'",repr(NAME))
    prelude=prelude.replace("'cp15-flight'",repr('universal-close-'+uuid.uuid4().hex[:8])).replace('vault:otr/dev/deepseek/flight-import-v1','vault:otr/dev/deepseek/universal-import-v1').replace('deepseek-flight-v1','deepseek-universal-v1')
    prelude=prelude.replace("schema_contracts=[{'id':'flight','version':1,'dialect':'otr'}],privacy_policy=", "schema_contracts=[{'id':'universal-import','version':1,'dialect':'otr'}],schema_output=True,privacy_policy=")
    start=prelude.index('rid=uid();fields=admin(runtime_enabled=True);')
    end=prelude.index("i=row('external_integrations');",start)
    prelude=prelude[:start]+"revision=int(scalar(\"select config_version from public.external_integration_environment_state where environment='DEV';\"))\ninvoke('external_integration_set_kill',admin(expected_version=revision,kill_switch=False))\n"+prelude[end:]
    namespace={'__file__':str(ROOT/'scripts/cp15/security-acceptance.py')}
    exec(compile(prelude,namespace['__file__'],'exec'),namespace)
    docker('exec','-i',NAME,'psql','-XqAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1',text=(ROOT/'supabase/migrations/20261012000100_model_task_protected_admission.sql').read_text())
    for f in ['universal_source_host_candidate.sql','universal_original_source_candidate.sql','universal_provider_admission_candidate.sql']:
        docker('exec','-i',NAME,'psql','-XqAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1',text=(ROOT/'backend/sql'/f).read_text())
    p=plan();install_scope(p)
    # Exact finite-role connection only, no Source rows or owning data proof is fabricated.
    held=subprocess.Popen([DOCKER,'exec','-i','-e','PGPASSWORD=ISOLATED_ONLY',NAME,'psql','-XqAt','-h','127.0.0.1','-U','otr_trip_source_command_gateway','-d','postgres'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    held.stdin.write('SELECT pg_sleep(12);');held.stdin.close();time.sleep(.4)
    result=close_once(p,sql,lambda p:{'verified':True,'windowId':p['windowId']})
    assert result['status']=='CLOSED_VERIFIED',result
    held.wait(timeout=5);assert held.returncode!=0
    checks.append('actual owning scope tables closed; exact finite role NOLOGIN and window session terminated')
    assert close_once(p,sql,lambda p:{'verified':True,'windowId':p['windowId']})['status']=='CLOSED_VERIFIED'
    checks.append('repeated exact close is idempotent; no business row touched')
    install_scope(p);sql("UPDATE public.trip_source_universal_scope SET batch_id=gen_random_uuid();")
    assert close_once(p,sql,lambda p:(_ for _ in ()).throw(AssertionError('MUST_NOT_RESTORE')))['status']=='RECONCILE_REQUIRED'
    checks.append('stale scope mismatch leaves newer window and service unchanged')
    clear();install_scope(p)
    sql("ALTER ROLE otr_trip_source_command_gateway VALID UNTIL "+literal((dt.datetime.fromisoformat(p['expiresAt'].replace('Z','+00:00'))+dt.timedelta(seconds=1)).isoformat())+';')
    assert close_once(p,sql,lambda p:(_ for _ in ()).throw(AssertionError('MUST_NOT_RESTORE')))['status']=='RECONCILE_REQUIRED'
    checks.append('foreign role expiry refuses NOLOGIN/session/service changes')
    clear();install_scope(p)
    def lost_after_commit(q):
        result=sql(q)
        if q.startswith('BEGIN;'):raise RuntimeError('COMMIT_REPLY_LOST')
        return result
    r=close_once(p,lost_after_commit,lambda p:{'verified':True,'windowId':p['windowId']})
    assert r['status']=='CLOSED_VERIFIED' and r['sqlWriteDisposition']=='UNKNOWN'
    checks.append('actual committed close with lost response reconciles by independent readback, no write retry')
    p=plan();end=dt.datetime.now(dt.timezone.utc)+dt.timedelta(seconds=2);start=end-dt.timedelta(seconds=5)
    stamp=lambda t:t.isoformat().replace('+00:00','Z')
    p['startsAt']=stamp(start);p['expiresAt']=stamp(end)
    for key in ['sourceScope','providerScope']:p[key]['starts_at']=p['startsAt'];p[key]['expires_at']=p['expiresAt']
    rehash(p);install_scope(p)
    with tempfile.TemporaryDirectory(prefix='universal-detached-watch-') as d:
        d=Path(d);pf=d/'plan.json';pf.write_text(json.dumps(p));rd=d/'run'
        from universal_watchdog import prepare
        digest=prepare(pf,rd)
        child=d/'watch_fixture.py';child.write_text("""import sys,json,subprocess\nfrom pathlib import Path\nsys.path.insert(0,sys.argv[1])\nfrom universal_watchdog import watch\nfrom universal_scope_close import close_once\ndef sql(q):\n r=subprocess.run(['docker','exec','-i',sys.argv[4],'psql','-XqAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],input=q,text=True,capture_output=True,timeout=25)\n if r.returncode:raise RuntimeError('FIXTURE_SQL')\n return [{'closed':True}] if r.stdout.strip().splitlines()[-1:]==['t'] else []\ndef close(p,d):return close_once(p,sql,lambda p:{'verified':True,'windowId':p['windowId']})\nwatch(sys.argv[2],sys.argv[3],closer=close)\n""")
        parent=d/'parent.py';parent.write_text("import subprocess,sys,time\np=subprocess.Popen(sys.argv[1:],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)\nprint(p.pid,flush=True)\ntime.sleep(30)\n")
        process=subprocess.Popen([sys.executable,str(parent),sys.executable,str(child),str(Path(__file__).parent),str(rd),digest,NAME],stdout=subprocess.PIPE,text=True)
        childpid=int(process.stdout.readline());process.terminate();process.wait(timeout=3)
        until=time.monotonic()+7
        while time.monotonic()<until and not (rd/'watch-result.json').exists():time.sleep(.1)
        assert json.loads((rd/'watch-result.json').read_text())['status']=='CLOSED_VERIFIED'
    checks.append('independent watchdog survives killed parent and closes actual PG at expiry; runtime restore simulated')
    assert sql(readback_sql(p))==[{'closed':True}]
    assert docker('exec',NAME,'psql','-XqAt','-U','supabase_admin','-d','postgres','-c','select not enabled from trip_source_command_gate').stdout.strip()=='t'
    checks.append('existing global Source gate remains closed; Trip/P1 global policies never referenced')
    print(json.dumps({'status':'ISOLATED_PG_AND_DETACHED_WATCH_PASS','checks':checks,'runtimeRestore':'SIMULATED_UNIT_TESTED_SEPARATELY','realAuth':False,'hostedWrites':0,'providerCalls':0},indent=2))
finally:
    if created:docker('rm','-f',NAME,required=False)
