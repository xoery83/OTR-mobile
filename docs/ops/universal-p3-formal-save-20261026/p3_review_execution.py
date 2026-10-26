"""One approved P3 DEV window. Existing SQL transport and retained-container rollback only."""
import argparse,datetime,fcntl,hashlib,json,os,pathlib,subprocess,sys,time
REPO=pathlib.Path(__file__).resolve().parents[3]
LINKED=pathlib.Path('/Users/xoery/Project/otr-mobile-universal-handoff-20261026')
PACKET=pathlib.Path(__file__).resolve().parent
REMOTE='/opt/otr/dev-backend/private/universal-p3-activation-5882798a/operator.py'
ACTOR='f4b059c5-8241-4ffb-aa15-37fa25474543'
sys.path.insert(0,str(REPO/'scripts/import'))
from universal_scope_close import SqlTransport

def iso(t):return datetime.datetime.fromtimestamp(t,datetime.timezone.utc).isoformat().replace('+00:00','Z')
def write(root,name,value):
 fd=os.open(root/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w') as f:json.dump(value,f);f.flush();os.fsync(f.fileno())
def source_sql(name):
 expected=json.loads((PACKET/'P3_GATE_PACKAGE_SHA256.json').read_text())[name]
 text=(PACKET/name).read_text()
 if hashlib.sha256(text.encode()).hexdigest()!=expected:raise ValueError('P3_PACKAGE_DRIFT')
 return text

def transport(root):return SqlTransport('/Users/xoery/Project/otr-mobile/node_modules/.bin/supabase',str(LINKED),str(root))
def observe(sql):
 rows=sql("BEGIN READ ONLY;SELECT universal_p1_import_enabled AS enabled,universal_p1_review_scope AS scope FROM public.trip_sustained_dev_policy WHERE actor_account_id='"+ACTOR+"';ROLLBACK;")['rows']
 if len(rows)!=1:raise ValueError('P3_POLICY_NOT_UNIQUE')
 return rows[0]
def remote(mode):
 r=subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=10','root@178.105.151.143','python3 '+REMOTE+' '+mode],capture_output=True,text=True,timeout=90)
 if r.returncode:raise ValueError('P3_RUNTIME_OPERATION_UNCONFIRMED')
 return json.loads(r.stdout)
def close(root):
 lock=os.open(root/'close.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
 with os.fdopen(lock,'w') as stream:
  fcntl.flock(stream,fcntl.LOCK_EX)
  if (root/'closed.json').exists():return json.loads((root/'closed.json').read_text())
  sql=transport(root);sql("SET lock_timeout='2s';SET statement_timeout='20s';\n"+source_sql('P3_REVIEW_CLOSE.sql'));row=observe(sql)
  if row!={'enabled':False,'scope':None}:raise ValueError('P3_SCOPE_CLOSURE_UNCONFIRMED')
  runtime=remote('rollback')
  if runtime.get('status')!='ROLLBACK_VERIFIED':raise ValueError('P3_RUNTIME_CLOSURE_UNCONFIRMED')
  out={'status':'P3_SCOPE_CLOSED_RUNTIME_DEFAULT_RESTORED','at':iso(time.time()),'policy':row,'runtime':runtime,'businessRecordsDeleted':0}
  write(root,'closed.json',out);return out

def activate(root,plan):
 lock=os.open(root/'close.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
 with os.fdopen(lock,'w') as stream:
  fcntl.flock(stream,fcntl.LOCK_EX)
  if (root/'closed.json').exists():raise ValueError('P3_WINDOW_ALREADY_CLOSED')
  if time.time()>plan['closeAt']-300 or not (root/'watch-claimed.json').exists():raise ValueError('P3_CLOSURE_RESERVE_REQUIRED')
  write(root,'activation-claimed.json',{'at':iso(time.time())})
  sql=transport(root);text=source_sql('P3_REVIEW_ACTIVATE.sql')
  # Shorten to the already fixed outer deadline; no rolling extension on SQL dispatch.
  text=text.replace("__P3_FIXED_WINDOW_DEADLINE__", plan["expiresAt"])
  sql("SET lock_timeout='2s';SET statement_timeout='20s';\n"+text);row=observe(sql);scope=dict(row.get('scope') or {});expires=scope.pop('expiresAt',None)
  if row.get('enabled') is not True or scope!=plan['scope'] or datetime.datetime.fromisoformat(expires.replace('Z','+00:00')).timestamp()>plan['deadline']+.001:raise ValueError('P3_ACTIVATION_READBACK_MISMATCH')
  write(root,'activated.json',{'at':iso(time.time()),'policy':row});return {'status':'P3_SCOPE_ACTIVE','policy':row}


def main():
 a=argparse.ArgumentParser();a.add_argument('mode',choices=['self-test','arm','activate','close','watch','status']);a.add_argument('--run-dir');args=a.parse_args()
 if args.mode=='self-test':
  scope=json.loads((PACKET/'P3_REVIEW_SCOPE.json').read_text())
  assert scope['candidateId']=='ebee124d-9a68-8fcd-919c-46d5157cffda' and scope['taskId']=='46945250-bfd8-8fcf-af74-f2e56bf85f7d'
  assert 'trip_sustained_dev_policy' in source_sql('P3_REVIEW_CLOSE.sql')
  assert "__P3_FIXED_WINDOW_DEADLINE__" in source_sql('P3_REVIEW_ACTIVATE.sql')
  import tempfile
  calls=[]
  def fake_sql(text):
   calls.append(text);return {'rows':[{'enabled':False,'scope':None}]}
  original_transport,original_remote=globals()['transport'],globals()['remote']
  globals()['transport']=lambda root:fake_sql
  globals()['remote']=lambda mode:{'status':'ROLLBACK_VERIFIED'} if mode=='rollback' else None
  try:
   with tempfile.TemporaryDirectory(prefix='otr-p3-operator-selfcheck-') as temp:
    root=pathlib.Path(temp);first=close(root);before=len(calls);second=close(root)
    assert first==second and len(calls)==before and first['businessRecordsDeleted']==0
    try:activate(root,{'closeAt':time.time()+660})
    except ValueError as e:assert str(e)=='P3_WINDOW_ALREADY_CLOSED'
    else:raise AssertionError('CLOSED_WINDOW_REOPENED')
    assert len(calls)==before and not (root/'activation-claimed.json').exists()
  finally:globals()['transport'],globals()['remote']=original_transport,original_remote
  state={'enabled':False,'scope':None}
  def active_sql(text):
   if 'DO $activate$' in text:
    assert '__P3_FIXED_WINDOW_DEADLINE__' not in text and plan['expiresAt'] in text
    state.update(enabled=True,scope={**scope,'expiresAt':plan['expiresAt']})
   if 'DO $close$' in text:state.update(enabled=False,scope=None)
   return {'rows':[dict(state)]}
  globals()['transport']=lambda root:active_sql
  globals()['remote']=lambda mode:{'status':'ROLLBACK_VERIFIED'}
  try:
   with tempfile.TemporaryDirectory(prefix='otr-p3-activation-selfcheck-') as temp:
    root=pathlib.Path(temp);t=time.time();plan={'closeAt':t+660,'deadline':t+900,'expiresAt':iso(t+900),'scope':scope}
    write(root,'watch-claimed.json',{'fixture':True})
    assert activate(root,plan)['status']=='P3_SCOPE_ACTIVE'
    try:activate(root,plan)
    except FileExistsError:pass
    else:raise AssertionError('ACTIVATION_CLAIM_REUSED')
    assert close(root)['policy']=={'enabled':False,'scope':None}
  finally:globals()['transport'],globals()['remote']=original_transport,original_remote
  assert datetime.datetime.fromisoformat(iso(900).replace('Z','+00:00')).timestamp()==900
  print(json.dumps({'status':'P3_WINDOW_SELF_CHECK_PASS','noNetwork':True,'idempotentClosure':True}));return
 if args.mode in ('arm','activate'):
  approval=json.loads((PACKET/'P3_SAVE_OWNER_APPROVAL.json').read_text())
  if approval.get('ownerApproved') is not True or approval.get('gateCommit')!='200ef78c':raise ValueError('P3_EXACT_OWNER_APPROVAL_REQUIRED')
 if not args.run_dir:raise ValueError('RUN_DIR_REQUIRED')
 root=pathlib.Path(args.run_dir).resolve()
 if root.parent!=pathlib.Path('/private/tmp') or not root.name.startswith('otr-p3-window-'):raise ValueError('OWNED_RUN_DIR_REQUIRED')
 if args.mode=='arm':
  root.mkdir(mode=0o700,exist_ok=False)
  row=observe(transport(root))
  if row!={'enabled':False,'scope':None}:raise ValueError('P3_CLOSED_PREIMAGE_REQUIRED')
  t=time.time();deadline=remote('deadline')['deadline']
  if not t+600<deadline<=t+900:raise ValueError('P3_OUTER_DEADLINE_REQUIRED')
  plan={'startsAt':iso(t),'expiresAt':iso(deadline),'closeAt':deadline-240,'deadline':deadline,'actor':ACTOR,'scope':json.loads((PACKET/'P3_REVIEW_SCOPE.json').read_text())}
  write(root,'window.json',plan)
  log=open(root/'watch.log','xb');os.chmod(root/'watch.log',0o600)
  child=subprocess.Popen([sys.executable,str(pathlib.Path(__file__).resolve()),'watch','--run-dir',str(root)],stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
  write(root,'watchdog.json',{'pid':child.pid})
  for _ in range(30):
   if (root/'watch-claimed.json').exists():break
   if child.poll() is not None:raise ValueError('P3_WATCH_START_FAILED')
   time.sleep(.1)
  else:raise ValueError('P3_WATCH_NOT_ARMED')
  print(json.dumps({'status':'P3_CLOSER_ARMED','window':plan,'pid':child.pid}));return
 plan=json.loads((root/'window.json').read_text())
 if args.mode=='watch':
  write(root,'watch-claimed.json',{'pid':os.getpid(),'at':iso(time.time())})
  while time.time()<plan['closeAt']:
   if (root/'closed.json').exists():return
   time.sleep(1)
  for attempt in range(1,4):
   try:print(json.dumps(close(root)));return
   except Exception as e:
    write(root,'close-failed-'+str(attempt)+'.json',{'at':iso(time.time()),'kind':type(e).__name__,'status':'RECONCILE_REQUIRED'})
    if attempt==3 or time.time()>=plan['deadline']:raise
    time.sleep(min(5,max(0,plan['deadline']-time.time())))
 if args.mode=='activate':print(json.dumps(activate(root,plan)));return
 if args.mode=='close':print(json.dumps(close(root)));return
 if args.mode=='status':print(json.dumps({'policy':observe(transport(root)),'closed':(root/'closed.json').exists(),'expiresAt':plan['expiresAt']}))
if __name__=='__main__':
 try:main()
 except Exception as e:
  print(json.dumps({'status':'P3_OPERATION_UNCONFIRMED_RECONCILE_READ_ONLY','kind':type(e).__name__}));sys.exit(1)
