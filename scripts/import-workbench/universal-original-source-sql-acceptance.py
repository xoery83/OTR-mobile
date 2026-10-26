"""Actual owning UTF8 file + typed Source commands on isolated PG17, no seed Source rows."""
import hashlib,json,pathlib,subprocess,time,uuid,os,re,sys
ROOT=pathlib.Path(__file__).resolve().parents[2]
NAME='otr-universal-original-'+uuid.uuid4().hex[:10]
ACTOR='00000000-0000-4000-8000-000000000002';OTHER='00000000-0000-4000-8000-000000000003';TRIP='10000000-0000-4000-8000-000000000001'
checks=[]
def docker(*args,text=None,required=True):
 p=subprocess.run(['/opt/homebrew/bin/docker',*args],input=text,text=True,capture_output=True)
 if required and p.returncode:raise RuntimeError(p.stderr[-3000:])
 return p
def sql(q,error=None):
 p=docker('exec','-i',NAME,'psql','-XqAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1',text=q,required=False)
 if error:assert p.returncode and error in p.stderr,(error,p.stderr)
 else:assert p.returncode==0,p.stderr
 return p.stdout.strip()
def lit(v):return "'"+str(v).replace("'","''")+"'"
def gateway(q):return 'SET SESSION AUTHORIZATION otr_trip_source_command_gateway;'+q
canon=lambda v:json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':'))
hashv=lambda prefix,v:hashlib.sha256((prefix+'\n'+canon(v)).encode()).hexdigest()
def command(text,name,actor=ACTOR):
 s,r,o=[str(uuid.uuid4()) for _ in range(3)];key='universal:'+o
 payload=hashlib.sha256(text.encode()).hexdigest();kind='FILE' if name else 'TEXT';channel='FILES' if name else 'PASTE'
 desc=[r,'TEXT',name,None,None,'UTF-8',payload,len(text.encode()),text,None]
 cap=hashv('otr-source-capture-v1',[1,s,1,None,[r],'AS_SUPPLIED','ACQUISITION',None,None])
 acq=hashv('otr-source-acquisition-v1',[1,TRIP,actor,s,key,kind,channel,None,'UNKNOWN',cap,desc])
 digest=hashv('otr-source-command-v1',[1,'ACQUIRE_SOURCE',o,key,actor,TRIP,s,[key,acq,[kind,channel,None,'UNKNOWN'],['AS_SUPPLIED',cap],desc]])
 q={'contract_version':1,'command':'ACQUIRE_SOURCE','operation_id':o,'operation_key':key,'actor_account_id':actor,'trip_id':TRIP,'source_id':s,'operation_sha256':digest,'payload':{'acquisition_key':key,'acquisition_sha256':acq,'source_input':{'source_kind':kind,'acquisition_channel':channel,'captured_at':None,'capture_time_basis':'UNKNOWN'},'capture':{'completeness':'AS_SUPPLIED','capture_sha256':cap},'original':dict(zip(['id','material_kind','original_filename','part_key','mime_type','encoding','payload_sha256','byte_count','text_content','locator_uri'],desc))}}
 pin={'profile':'OTR_UTF8_TEXT_FILE_V1' if name else 'OTR_SUBMITTED_TEXT_V1','actorId':actor,'tripId':TRIP,'sourceId':s,'operationId':o,'operationKey':key,'operationSha256':digest,'representationId':r}
 return q,pin
def acquire(q):return "select public.trip_source_acquire_universal_original("+lit(q['actor_account_id'])+'::uuid,'+lit(canon(q))+');'
created=False
try:
 docker('run','--name',NAME,'--network','none','-d','otr-core-v2-server84-fixture:20261012');created=True
 for _ in range(50):
  if docker('exec',NAME,'pg_isready','-U','supabase_admin',required=False).returncode==0:break
  time.sleep(.2)
 else:raise RuntimeError('PG_NOT_READY')
 before=sql("select md5(prosrc) from pg_proc where oid='public.trip_source_command_codec(text)'::regprocedure;")
 edges=sql("select coalesce(jsonb_agg(to_jsonb(m) order by m.oid),'[]') from pg_auth_members m where roleid='otr_trip_source_writer'::regrole and member='postgres'::regrole;")
 source=(ROOT/'backend/sql/universal_source_host_candidate.sql').read_text();candidate=(ROOT/'backend/sql/universal_original_source_candidate.sql').read_text()
 pdf_before={};pdf_mode=os.environ.get('OTR_UNIVERSAL_PDF_V4_FIXTURE')=='1'
 if pdf_mode:
  observed=json.loads((ROOT/'scripts/import-workbench/fixtures/universal-pdf-v4-observed-roots.json').read_text())
  # Actual observed root definitions. Missing private PDF scope dependencies are
  # deliberately CLOSED test sentinels, never fake positive PDF proof/authority.
  sql("create function public.trip_source_pdf_upload_v4_scope() returns jsonb language plpgsql as $$begin raise exception 'PDF_V4_FIXTURE_CLOSED';end$$;create function public.trip_source_pdf_registration_gate() returns void language plpgsql as $$begin raise exception 'PDF_REGISTRATION_FIXTURE_CLOSED';end$$;")
  for root in observed['roots']:
   sql(root['definition']+';')
   if root['name']=='trip_source_pdf_upload_v4_command(jsonb)':sql('alter function public.'+root['name']+' owner to otr_trip_source_writer;')
   actual=sql("select md5(prosrc) from pg_proc where oid="+lit('public.'+root['name'])+"::regprocedure;")
   assert actual==root['body_md5'],(root['name'],actual)
   pdf_before[root['name']]=sql("select prosrc from pg_proc where oid="+lit('public.'+root['name'])+"::regprocedure;")
  sql("DO $patch$declare d text;begin select pg_get_functiondef(oid) into d from pg_proc where oid='public.trip_source_register(text,uuid,text)'::regprocedure;execute replace(d,'perform public.trip_source_assert_gate();','perform public.trip_source_assert_gate(); perform public.trip_source_pdf_upload_v4_command(j);');end$patch$;")
  assert sql("select md5(prosrc) from pg_proc where oid='public.trip_source_register(text,uuid,text)'::regprocedure;")=='0a350c6e55e425dbd6c225a26fb3fd76'
  sql("create function public.fixture_pdf_gate() returns void language plpgsql security definer set search_path=pg_catalog as $$begin perform public.trip_source_assert_gate();end$$;alter function public.fixture_pdf_gate() owner to otr_trip_source_writer;create function public.fixture_pdf_command() returns void language plpgsql security definer set search_path=pg_catalog as $$begin perform public.trip_source_pdf_upload_v4_command('{}'::jsonb);end$$;alter function public.fixture_pdf_command() owner to otr_trip_source_writer;")
  sql(gateway("select public.fixture_pdf_gate();"),error='PDF_V4_FIXTURE_CLOSED')
  checks.append('exact four observed PDF V4 roots and register0a350 installed; PDF private dependencies CLOSED sentinels, not PDF Runtime PASS')
  bad=os.environ.get('OTR_UNIVERSAL_BAD_PDF_PREIMAGE')
  if bad:
   assert bad in ['trip_source_register(text,uuid,text)','trip_source_assert_gate()','trip_source_operation_guard()','guard_trip_source_mutation()']
   sql("DO $patch$declare d text;b text;begin select pg_get_functiondef(oid),prosrc into d,b from pg_proc where oid="+lit('public.'+bad)+"::regprocedure;execute replace(d,b,b||E'\\n-- UNAPPROVED DRIFT');end$patch$;")
 sql('SET ROLE postgres;'+source)
 if pdf_mode and os.environ.get('OTR_UNIVERSAL_BAD_PDF_PREIMAGE'):
  sql('SET ROLE postgres;'+candidate,error='UTF8_SOURCE_PREIMAGE')
  assert sql("select to_regprocedure('public.trip_source_universal_original_pin()') is null;")=='t'
  assert sql('select count(*) from trip_source_universal_scope;')=='0'
  print(json.dumps({'status':'ISOLATED_PG_UNKNOWN_PREIMAGE_DENIED','root':bad,'providerCalls':0,'hostedWrites':0}));sys.exit(0)
 sql('SET ROLE postgres;'+candidate)
 if pdf_mode:
  def body(name):return sql("select prosrc from pg_proc where oid="+lit('public.'+name)+"::regprocedure;")
  assert body('trip_source_pdf_upload_v4_command(jsonb)')==pdf_before['trip_source_pdf_upload_v4_command(jsonb)']
  assert body('trip_source_assert_gate()').replace('if public.trip_source_universal_original_pin() is null then perform public.trip_source_pdf_upload_v4_scope();end if;','perform public.trip_source_pdf_upload_v4_scope();')==pdf_before['trip_source_assert_gate()']
  wrap=re.search(r"replace\(definition,'perform public.trip_source_pdf_upload_v4_operation\(new\);',\$universal\$(.*?)\$universal\$",candidate,re.S).group(1)
  assert body('trip_source_operation_guard()').replace(wrap,'perform public.trip_source_pdf_upload_v4_operation(new);')==pdf_before['trip_source_operation_guard()']
  original_trigger=re.sub(r'\n/\* UNIVERSAL_ORIGINAL_INSERT_BEGIN \*/.*?/\* UNIVERSAL_ORIGINAL_INSERT_END \*/\n','',body('guard_trip_source_mutation()'),flags=re.S)
  assert original_trigger==pdf_before['guard_trip_source_mutation()']
  assert body('trip_source_register(text,uuid,text)').count('perform public.trip_source_pdf_upload_v4_command(j);')==1
  sql(gateway("select public.fixture_pdf_gate();"),error='PDF_V4_FIXTURE_CLOSED')
  sql(gateway("select public.fixture_pdf_command();"),error='PDF_V4_FIXTURE_CLOSED')
  checks.append('PDF validator unchanged; removing finite-only branches exactly recovers legacy gate/operation/mutation bodies and missing-scope negative remains denied')
 result_candidate=(ROOT/'backend/sql/universal_original_result_candidate.sql').read_text();sql('SET ROLE postgres;'+result_candidate)
 assert before==sql("select md5(prosrc) from pg_proc where oid='public.trip_source_command_codec(text)'::regprocedure;")
 assert edges==sql("select coalesce(jsonb_agg(to_jsonb(m) order by m.oid),'[]') from pg_auth_members m where roleid='otr_trip_source_writer'::regrole and member='postgres'::regrole;")
 assert sql('select not enabled from trip_source_command_gate;')=='t';checks.append('legacy codec/owner edge preserved and global Source gate CLOSED')
 file_text='\ufeffTrip file original\r\n酒店 New Zealand\r\nExact bytes.'
 typed='Walk to the museum.\n支持同一批文件。'
 commands=[command(file_text,'Original.TXT'),command(typed,None)]
 native_path=os.environ.get('OTR_UNIVERSAL_NATIVE_SOURCE_INPUTS')
 native=json.loads(pathlib.Path(native_path).read_text()) if native_path else None
 if native:
  assert native['actor']==ACTOR and native['trip']==TRIP and len(native['commands'])==2
  commands=[]
  for q in native['commands']:
   profile='OTR_UTF8_TEXT_FILE_V1' if q['payload']['source_input']['source_kind']=='FILE' else 'OTR_SUBMITTED_TEXT_V1'
   pin={'profile':profile,'actorId':ACTOR,'tripId':TRIP,'sourceId':q['source_id'],'operationId':q['operation_id'],'operationKey':q['operation_key'],'operationSha256':q['operation_sha256'],'representationId':q['payload']['original']['id']}
   commands.append((q,pin))
  file_text,typed=[q['payload']['original']['text_content'] for q,p in commands]
  checks.append('input commands are exact actual Native C3/SQLite Repository/Queue outputs, no fabricated Source snapshot')
 q=commands[0][0]
 sql(gateway(acquire(q)),error='UNIVERSAL_SOURCE_SCOPE_CLOSED');checks.append('unprovisioned new owning entry CLOSED')
 ids={k:str(uuid.uuid4()) for k in ('batch','task','run')}
 if native:ids['batch']=native['batchId']
 submission_hash=native['submissionSha256'] if native else 'a'*64
 inputs=[{'id':str(uuid.uuid4()),'source_id':q['source_id'],'material_revision':1,'representation_id':q['payload']['original']['id'],'payload_sha256':q['payload']['original']['payload_sha256'],'byte_count':q['payload']['original']['byte_count'],'observed_source_row_revision':1,'historical_selection':False} for q,p in commands]
 pins=[p for q,p in commands]
 descriptors=[[i['id'],i['source_id'],1,i['representation_id'],i['payload_sha256'],i['byte_count'],1,False,1,'ORIGINAL','TEXT',None,None,None,[]] for i in sorted(inputs,key=lambda i:(i['source_id'],i['material_revision'],i['representation_id'],i['id']))]
 expected_input_hash=hashv('otr-source-run-input-v1',[1,descriptors])
 sql("insert into trip_source_universal_scope(singleton,actor_id,trip_id,batch_id,task_id,run_id,submission_sha256,input_sha256,starts_at,expires_at,source_command_pins) values(true,"+','.join(lit(x)+'::uuid' for x in [ACTOR,TRIP,ids['batch'],ids['task'],ids['run']])+","+lit(submission_hash)+","+lit(expected_input_hash)+",clock_timestamp()-interval '1 second',clock_timestamp()+interval '120 seconds',"+lit(canon(pins))+"::jsonb);")
 if pdf_mode:
  foreign_pin={**pins[0],'actorId':OTHER};changed_pin={**pins[0],'operationSha256':'f'*64}
  for invalid_pin in [None,foreign_pin,changed_pin]:
   sql(gateway("select set_config('otr.universal.source_pin',"+lit(canon(invalid_pin))+",false);select public.fixture_pdf_gate();"),error='PDF_V4_FIXTURE_CLOSED')
  checks.append('NULL/foreign/hash-changed forged settings cannot enter finite branch; closed PDF legacy rejection retained')
 sql(gateway('BEGIN ISOLATION LEVEL REPEATABLE READ;select trip_source_lookup_universal_original('+lit(ACTOR)+'::uuid,'+lit(canon(commands[0][0]))+');'),error='UNSUPPORTED_TRANSACTION_ISOLATION')
 checks.append('scoped result reuses owning READ COMMITTED gate and denies stale-snapshot isolation')
 for q,p in commands:
  assert sql(gateway('select trip_source_lookup_universal_original('+lit(ACTOR)+'::uuid,'+lit(canon(q))+');'))==''
  result=json.loads(sql(gateway('BEGIN ISOLATION LEVEL READ COMMITTED;'+acquire(q)+'COMMIT;')))
  assert result['outcome']=='APPLIED' and result['result_material_revision']==1 and result['result_remote_state']=='NOT_APPLICABLE' and result['result_action_id']
  replay=json.loads(sql(gateway('BEGIN ISOLATION LEVEL READ COMMITTED;'+acquire(q)+'COMMIT;')));assert replay==result
  lookup=json.loads(sql(gateway('select trip_source_lookup_universal_original('+lit(ACTOR)+'::uuid,'+lit(canon(q))+');')));assert lookup==result
 checks.append('real existing Source command/journal/action/receipt creation and exact replay/result lookup for FILE and PASTE')
 catalogue=json.loads(sql(gateway('select trip_source_read_import_catalogs('+lit(ACTOR)+'::uuid,'+lit(TRIP)+'::uuid);')))
 for q,p in commands:
  s=next(s for s in catalogue['trip_sources'] if s['id']==q['source_id']);r=next(r for r in catalogue['trip_source_representations'] if r['id']==q['payload']['original']['id'])
  assert s['source_kind']==q['payload']['source_input']['source_kind'] and s['acquisition_channel']==q['payload']['source_input']['acquisition_channel']
  assert r['original_filename']==q['payload']['original']['original_filename'] and r['text_content']==q['payload']['original']['text_content'] and r['payload_sha256']==q['payload']['original']['payload_sha256'] and r['byte_count']==q['payload']['original']['byte_count']
 checks.append('independent owning catalog readback preserves filename, FILE/FILES vs TEXT/PASTE, BOM/CRLF/Unicode/hash/bytes')
 request={'runId':ids['run'],'batchId':ids['batch'],'taskId':ids['task'],'submissionSha256':submission_hash,'inputs':inputs}
 run=json.loads(sql(gateway('select trip_source_begin_universal_inputs('+lit(ACTOR)+'::uuid,'+lit(TRIP)+'::uuid,'+lit(canon(request))+');')));assert run['state']=='PENDING'
 scope=json.loads(sql(gateway('select trip_source_read_universal_inputs('+','.join(lit(x)+'::uuid' for x in [ACTOR,TRIP,ids['batch'],ids['task'],ids['run']])+');')))
 assert len(scope['representations'])==2
 by_id={r['inputId']:r['text'] for r in scope['representations']}
 assert [by_id[i['id']] for i in inputs]==[file_text,typed]
 checks.append('actual registered Sources feed initial PENDING Run and retained Universal read without a model result')
 if os.environ.get('OTR_UNIVERSAL_FIXTURE_SNAPSHOT'):
  after_catalog=json.loads(sql(gateway('select trip_source_read_import_catalogs('+lit(ACTOR)+'::uuid,'+lit(TRIP)+'::uuid);')))
  pathlib.Path(os.environ['OTR_UNIVERSAL_FIXTURE_SNAPSHOT']).write_text(json.dumps({'catalog':after_catalog,'manifest':scope,'run':run}))
 q,p=commands[0];sql(gateway("select trip_source_acquire_source("+lit(ACTOR)+'::uuid,'+lit(canon(q))+');'),error='INVALID_SOURCE_COMMAND');checks.append('old entry cannot silently acquire FILE UTF8 through its V1 codec')
 foreign,_=command('Other identity','Other.txt',OTHER);sql(gateway('BEGIN;'+acquire(foreign)),error='SOURCE_ACCESS_DENIED');checks.append('cross-account denied')
 changed,_=command('Changed text','Changed.txt');sql(gateway('BEGIN;'+acquire(changed)),error='UNIVERSAL_SOURCE_SCOPE_CLOSED');checks.append('unpinned operation denied despite same allowed Actor/Trip')
 for text,name in [('%PDF-1.4\nnot text','Fake.txt'),('abc','wrong.pdf'),('A'*262145,'Large.txt')]:
  bad,_=command(text,name);sql(gateway('BEGIN;'+acquire(bad)),error='INVALID_SOURCE_COMMAND' if name!='wrong.pdf' else 'UTF8_FILE_PROFILE_UNSUPPORTED')
 checks.append('PDF masquerade/wrong filename/oversize reject; no new profile permissiveness')
 boundary,_=command('A'*262144,'a'*251+'.txt')
 assert sql("select public.trip_source_utf8_file_codec("+lit(canon(boundary))+")->>'command';")=='ACQUIRE_SOURCE'
 null_name,_=command('x',None);null_name['payload']['source_input']={'source_kind':'FILE','acquisition_channel':'FILES','captured_at':None,'capture_time_basis':'UNKNOWN'}
 sql(gateway('BEGIN;'+acquire(null_name)),error='UTF8_FILE_PROFILE_UNSUPPORTED')
 nul,_=command('bad\0text','Nul.txt');sql(gateway('BEGIN;'+acquire(nul)),error='unsupported Unicode escape sequence')
 sql('SET SESSION AUTHORIZATION authenticated;'+acquire(commands[0][0]),error='permission denied')
 assert sql("select not has_table_privilege('otr_trip_source_writer','trip_sources','UPDATE') and not has_table_privilege('otr_trip_source_writer','trip_source_operations','UPDATE');")=='t'
 checks.append('exact size/filename boundary, NUL/null filename, direct app-role denial and no UPDATE grants')
 sql("update trip_source_universal_scope set source_command_pins='[]';")
 sql(gateway('select trip_source_lookup_universal_original('+lit(ACTOR)+'::uuid,'+lit(canon(commands[0][0]))+');'),error='UNIVERSAL_SOURCE_SCOPE_CLOSED')
 sql('update trip_source_universal_scope set source_command_pins='+lit(canon(pins))+'::jsonb;')
 checks.append('result lookup works before Source exists; exact pinned receipt read closes immediately when SQL scope pins revoked')
 sql("update trip_source_universal_scope set starts_at=clock_timestamp()-interval '120 seconds',expires_at=clock_timestamp()-interval '1 second';")
 sql(gateway('BEGIN;'+acquire(commands[1][0])),error='UNIVERSAL_SOURCE_SCOPE_CLOSED')
 sql(gateway('select trip_source_lookup_universal_original('+lit(ACTOR)+'::uuid,'+lit(canon(commands[1][0]))+');'),error='UNIVERSAL_SOURCE_SCOPE_CLOSED')
 if pdf_mode:
  sql(gateway("select set_config('otr.universal.source_pin',"+lit(canon(pins[0]))+",false);select public.fixture_pdf_gate();"),error='PDF_V4_FIXTURE_CLOSED')
  checks.append('expired formerly valid setting falls back to original closed PDF guard')
 assert sql('select not enabled from trip_source_command_gate;')=='t'
 assert sql("select count(*) from trip_source_operations where trip_id='10000000-0000-4000-8000-000000000001';")=='2'
 assert sql("select count(*) from trip_source_candidates where run_id="+lit(ids['run'])+';')=='0'
 checks.append('expiry stops wrapper; exactly2 immutable operations; no Candidate/Admission/global activation')
 print(json.dumps({'status':'ISOLATED_OWNING_SOURCE_ORIGINAL_PASS','schemaSha256':hashlib.sha256(candidate.encode()).hexdigest(),'resultSchemaSha256':hashlib.sha256(result_candidate.encode()).hexdigest(),'checks':checks,'providerCalls':0,'hostedWrites':0},indent=2))
finally:
 if created:docker('rm','-f',NAME)
