"""Disposable network-none PG fixture. DB identities are NOT real Auth/DEV evidence."""
import concurrent.futures, datetime as dt, json, os, pathlib, subprocess, sys, tempfile, time, uuid
import control
from control_test import plan
DOCKER='/opt/homebrew/bin/docker'; NAME='otr-c-close-'+uuid.uuid4().hex[:10]; IMAGE='otr-core-v2-server84-fixture:20261012'
def docker(*a,text=None,check=True):
 r=subprocess.run([DOCKER,*a],input=text,text=True,capture_output=True,timeout=30)
 if check and r.returncode: raise RuntimeError('FIXTURE_DOCKER_FAILED:'+r.stderr[-500:])
 return r
def sql(text):
 r=docker('exec','-i',NAME,'psql','-XqAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1',text=text)
 lines=[l for l in r.stdout.splitlines() if l.strip()]
 if lines and lines[-1]=='t':return [{'closed':True}]
 return []
checks=[]
try:
 docker('run','--network','none','--name',NAME,'-d',IMAGE)
 for i in range(60):
  if docker('exec',NAME,'pg_isready','-U','supabase_admin',check=False).returncode==0:break
  time.sleep(.2)
 sql("CREATE ROLE otr_trip_create_gateway NOLOGIN; CREATE ROLE otr_trip_metadata_gateway NOLOGIN;"+
 ''.join(f"CREATE TABLE public.{t}(singleton boolean primary key,enabled boolean,actor_account_id uuid,trip_id uuid,operation_id uuid,request_payload jsonb,started_at timestamptz,expires_at timestamptz); INSERT INTO public.{t}(singleton,enabled)VALUES(true,false);" for t in control.GATES.values()))
 sql('CREATE TABLE IF NOT EXISTS public.trip_core_activation_gate(runtime_enabled boolean);CREATE TABLE IF NOT EXISTS public.trip_source_command_gate(enabled boolean);CREATE TABLE IF NOT EXISTS public.trip_source_pdf_gate(enabled boolean);')
 with tempfile.TemporaryDirectory(prefix='otr-c-watch-') as d:
  os.chmod(d,0o700);p=plan();p['ownerAuthorized']=True
  op=control.Operator(p,d,sql);op.service=lambda *a,**k:{'verified':True}
  sql(op.activation_sql('create','ISOLATED_ONLY'))
  sql('GRANT SELECT ON public.trip_create_activation_gate TO otr_trip_create_gateway;')
  # Real active role session holds gate FOR SHARE; closer must terminate BEFORE UPDATE.
  held=subprocess.Popen([DOCKER,'exec','-i','-e','PGPASSWORD=ISOLATED_ONLY',NAME,'psql','-XqAt','-h','127.0.0.1','-U','otr_trip_create_gateway','-d','postgres','-v','ON_ERROR_STOP=1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  held.stdin.write("BEGIN; SET LOCAL statement_timeout='15s'; SELECT singleton FROM public.trip_create_activation_gate FOR SHARE; SELECT pg_sleep(12); COMMIT;");held.stdin.close();time.sleep(.5)
  # Actual dedicated PG login, scoped backend_start inside plan. Fixture-only SELECT models RPC FOR SHARE.
  begin=time.monotonic();r=op.close();assert r['status']=='CLOSED_VERIFIED',r
  assert time.monotonic()-begin<6;held.wait(timeout=5);assert held.returncode!=0
  checks.append('real PG gate FOR SHARE holder terminated before update; bounded verified close')
  # A later window cannot be cleared by this stale watcher.
  sql(op.activation_sql('metadata','ISOLATED_ONLY'))
  sql("UPDATE public.trip_metadata_activation_gate SET started_at=started_at+interval '1 second';")
  old=op.close();assert old['status']=='RECONCILE_REQUIRED';checks.append('stale window mismatch stops before role/gate/service modification')
  sql("UPDATE public.trip_metadata_activation_gate SET started_at=started_at-interval '1 second';")
  assert op.close()['status']=='CLOSED_VERIFIED'
  # Independent OS process watchdog continues after a killed parent/operator. Uses real PG through
  # the same fixed SQL builder; service restoration is an isolated state-file simulator, NOT Docker DEV.
  expiry=dt.datetime.now(dt.timezone.utc)+dt.timedelta(seconds=2);p=plan();p['ownerAuthorized']=True;p['expiresAt']=expiry.isoformat();p['startsAt']=(expiry-dt.timedelta(seconds=5)).isoformat()
  op=control.Operator(p,d,sql);sql(op.activation_sql('create','ISOLATED_ONLY'))
  childdir=pathlib.Path(d)/'detached';childdir.mkdir(mode=0o700);pf=pathlib.Path(d)/'fixture-plan.json';pf.write_text(json.dumps(p))
  child=pathlib.Path(d)/'watch.py';child.write_text('''import sys,json,pathlib,subprocess\nsys.path.insert(0,sys.argv[1])\nfrom control import Operator\np=json.loads(pathlib.Path(sys.argv[2]).read_text())\ndef sql(t):\n r=subprocess.run([sys.argv[4],'exec','-i',sys.argv[5],'psql','-XqAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],input=t,text=True,capture_output=True,timeout=25)\n if r.returncode:raise RuntimeError('fixture SQL failed')\n return [{'closed':True}] if r.stdout.strip().splitlines()[-1:] == ['t'] else []\no=Operator(p,sys.argv[3],sql)\ndef service(*a):\n pathlib.Path(sys.argv[3]+'/service-restored').write_text('isolated service simulator')\n return {'verified':True}\no.service=service\no.watch()\n''')
  parent=pathlib.Path(d)/'parent.py';parent.write_text('import subprocess,sys,time\np=subprocess.Popen(sys.argv[1:],start_new_session=True,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)\nprint(p.pid,flush=True)\ntime.sleep(30)\n')
  parentproc=subprocess.Popen([sys.executable,str(parent),sys.executable,str(child),str(pathlib.Path(__file__).parent),str(pf),str(childdir),DOCKER,NAME],stdout=subprocess.PIPE,text=True)
  childpid=int(parentproc.stdout.readline());parentproc.terminate();parentproc.wait(timeout=2)
  deadline=time.monotonic()+6
  while time.monotonic()<deadline and not list(childdir.glob('close-*.json')):time.sleep(.1)
  receipts=list(childdir.glob('close-*.json'));assert receipts and json.loads(receipts[0].read_text())['status']=='CLOSED_VERIFIED'
  assert (childdir/'service-restored').exists();checks.append('independent detached watchdog survives killed operator parent and closes real PG at expiry; simulated service restored')
 print(json.dumps({'status':'ISOLATED_PG_AND_PROCESS_PASS','checks':checks,'realAuth':False,'hosted':False,'serviceRestore':'ISOLATED_STATE_FILE_ONLY'}))
finally:docker('rm','-f',NAME,check=False)
