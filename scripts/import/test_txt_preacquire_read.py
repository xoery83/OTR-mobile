"""Focused runtime-visibility/absence PG boundary; not Source/Provider E2E or c420 runner."""
import ast
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
DOCKER = '/opt/homebrew/bin/docker'
IMAGE = 'sha256:6942962433a569e87f228b4d4ab7e11db5deca64e43babb3a038443ad6c4f1bb'
NAME = 'otr-txt-preacquire-' + uuid.uuid4().hex[:10]
OUT = ROOT / 'docs/ops/lane-c-txt-preacquire-read-20261105'
ACTOR = '10000000-0000-4000-8000-000000000001'
TRIP = '10000000-0000-4000-8000-000000000002'
BATCH = '10000000-0000-4000-8000-000000000003'
TASK = '10000000-0000-4000-8000-000000000004'
RUN = '10000000-0000-4000-8000-000000000005'
OTHER = '20000000-0000-4000-8000-000000000001'
canon = lambda v: json.dumps(v, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
hashv = lambda prefix, v: hashlib.sha256((prefix + '\n' + canon(v)).encode()).hexdigest()
helper_path = ROOT / 'scripts/import-workbench/universal-original-source-sql-acceptance.py'
helper_ast = ast.parse(helper_path.read_text())
exec(compile(ast.Module(body=[n for n in helper_ast.body if isinstance(n, ast.FunctionDef) and n.name in ['lit', 'command']], type_ignores=[]), str(helper_path), 'exec'))

def run(*args, text=None, check=True):
    p = subprocess.run([DOCKER, *args], input=text, text=True, capture_output=True, timeout=60)
    if check and p.returncode: raise RuntimeError(p.stderr[-3000:])
    return p

def sql(text, error=None):
    prefix = 'SET SESSION AUTHORIZATION otr_trip_source_command_gateway;'
    is_gateway = text.startswith(prefix)
    if is_gateway: text = text[len(prefix):]
    user = 'otr_trip_source_command_gateway' if is_gateway else 'supabase_admin'
    p = run('exec', '-i', '-e', 'PGPASSWORD=local-source-synthetic-only', NAME, 'psql', '-h', '127.0.0.1', '-XqAt', '-U', user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', text=text, check=False)
    if error:
        assert p.returncode and error in p.stderr, (error, p.stderr)
    else:
        assert p.returncode == 0, p.stderr
    return p.stdout.strip()

def definition(text, name):
    m = re.search(r'(?is)CREATE(?: OR REPLACE)? FUNCTION public\.' + name + r'\(.*?\$\$;', text)
    assert m, name
    return m.group()

checks = []
def find(inputs=None, actor=ACTOR, trip=TRIP, batch=BATCH, task=TASK, run_id=RUN, submission='a'*64):
    return 'SELECT public.trip_source_find_finite_universal_binding(' + ','.join(lit(x)+'::uuid' for x in [actor,trip,batch,task,run_id]) + ',' + lit(submission) + ',' + lit(canon(inputs if inputs is not None else [pin])) + '::jsonb);'

def gateway(q): return 'SET SESSION AUTHORIZATION otr_trip_source_command_gateway;' + q

def reject(q, label):
    p = run('exec', '-i', '-e', 'PGPASSWORD=local-source-synthetic-only', NAME, 'psql', '-h', '127.0.0.1', '-XqAt', '-U', 'otr_trip_source_command_gateway', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', text=q, check=False)
    assert p.returncode != 0, label + ': returned NULL/binding instead of rejecting'
    checks.append(label)

ADDITIONAL = "--additional" in sys.argv
created = False
try:
    assert run('context', 'inspect', '--format', '{{.Endpoints.docker.Host}}').stdout.strip().startswith('unix://')
    assert not os.environ.get('DOCKER_HOST') or os.environ['DOCKER_HOST'].startswith('unix://')
    run('run', '--pull=never', '--rm', '--network', 'none', '--cpus', '1', '--memory', '512m', '--tmpfs', '/var/lib/postgresql/data', '--name', NAME, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-d', IMAGE, '-c', 'shared_buffers=32MB', '-c', 'max_connections=20')
    created = True
    for _ in range(60):
        if run('exec', NAME, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', check=False).returncode == 0: break
        time.sleep(.2)
    else: raise RuntimeError('LOCAL_PG_START_TIMEOUT')
    bootstrap = (ROOT/'backend/src/__fixtures__/finiteNativeHelperBootstrap.sql').read_text()
    sql(bootstrap + '''
RESET ROLE;
REVOKE otr_trip_source_writer FROM otr_trip_source_command_gateway;

GRANT USAGE ON SCHEMA extensions TO otr_trip_source_writer;
ALTER TABLE public.trip_source_universal_scope ADD COLUMN source_command_pins jsonb DEFAULT '[]';
ALTER TABLE public.trip_source_runs ADD COLUMN generation bigint DEFAULT 1, ADD COLUMN created_at timestamptz DEFAULT clock_timestamp();
ALTER TABLE public.trip_source_representations ADD COLUMN introduced_revision bigint,ADD COLUMN material_kind text,ADD COLUMN encoding text,ADD COLUMN transform_version text,ADD COLUMN transform_options_sha256 text,ADD COLUMN parent_ids uuid[],ADD COLUMN payload_sha256 text,ADD COLUMN byte_count bigint,ADD COLUMN retention_state text,ADD COLUMN remote_state text;
CREATE TABLE public.trip_sources(id uuid PRIMARY KEY,trip_id uuid,acquired_by uuid,source_kind text,acquisition_channel text,acquisition_key text,lifecycle text,retention_state text,row_revision bigint,current_material_revision bigint);
CREATE TABLE public.trip_source_revisions(source_id uuid,material_revision bigint,retention_state text,original_representation_ids uuid[]);
ALTER TABLE public.trip_sources OWNER TO postgres;ALTER TABLE public.trip_source_runs OWNER TO postgres;ALTER TABLE public.trip_source_representations OWNER TO postgres;
GRANT SELECT ON public.trip_sources,public.trip_source_representations,public.trip_source_revisions,public.trip_source_runs TO otr_trip_source_writer;
ALTER TABLE public.trip_sources ENABLE ROW LEVEL SECURITY;ALTER TABLE public.trip_sources FORCE ROW LEVEL SECURITY;
ALTER TABLE public.trip_source_representations ENABLE ROW LEVEL SECURITY;ALTER TABLE public.trip_source_representations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.trip_source_runs ENABLE ROW LEVEL SECURITY;ALTER TABLE public.trip_source_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY global_source_read ON public.trip_sources FOR SELECT TO otr_trip_source_writer USING(true);
CREATE POLICY global_rep_read ON public.trip_source_representations FOR SELECT TO otr_trip_source_writer USING(true);
CREATE POLICY global_run_read ON public.trip_source_runs FOR SELECT TO otr_trip_source_writer USING(true);
CREATE FUNCTION public.trip_import_scope_lock(uuid,uuid) RETURNS void LANGUAGE sql AS $$SELECT$$;
CREATE FUNCTION public.trip_source_lock_universal_materials(uuid,uuid,uuid[]) RETURNS void LANGUAGE sql AS $$SELECT$$;
''')
    # Remove isolated helper doubles before installing real signatures/parameter names.
    sql('DROP FUNCTION public.trip_import_run_input_hash(jsonb);DROP FUNCTION public.trip_import_input_valid(public.trip_source_inputs,uuid,uuid,boolean);')
    # Actual public canonical hash and input descriptors, not a pins-only hash double.
    for path,name in [('supabase/migrations/20261004000400_trip_event_command_foundation.sql','trip_event_canonical_json'),('supabase/migrations/20261004000500_trip_source_command_foundation.sql','trip_source_hash'),('supabase/migrations/20261005001000_trip_import_flight_value_guards.sql','trip_import_run_input_hash'),('supabase/migrations/20261005000500_trip_import_admission_guards.sql','trip_import_input_valid')]:
        d = definition((ROOT/path).read_text(),name).replace('create function','CREATE OR REPLACE FUNCTION',1).replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1)
        sql(d)
    hash_preimage = sql("SELECT encode(sha256(convert_to(pg_get_functiondef('public.trip_import_run_input_hash(jsonb)'::regprocedure),'UTF8')),'hex');")
    assert hash_preimage == '9747298d0ca132f77833671a703d3b90d3e303d4cbc5e5d987eff7ff8494d36a', hash_preimage
    sql('GRANT EXECUTE ON FUNCTION public.trip_source_hash(text,jsonb),public.trip_import_run_input_hash(jsonb),public.trip_import_input_valid(public.trip_source_inputs,uuid,uuid,boolean),public.trip_event_canonical_json(json,integer) TO otr_trip_source_writer;')
    helpers = (ROOT/'backend/sql/universal_finite_native_helpers_candidate.sql').read_text()
    for name in ['trip_source_finite_native_identity','trip_source_finite_native_original_scope','trip_source_finite_native_retained_pin']:
        sql('SET ROLE otr_trip_source_writer;' + definition(helpers,name))
    internal_sigs = ['trip_source_finite_native_identity(uuid,uuid,uuid)','trip_source_finite_native_original_scope(uuid,uuid,uuid,uuid,uuid,text,jsonb)','trip_source_finite_native_retained_pin(uuid,uuid,public.trip_source_inputs)']
    for sig in internal_sigs: sql('REVOKE ALL ON FUNCTION public.'+sig+' FROM PUBLIC,otr_trip_source_command_gateway;')
    sig = 'public.trip_source_find_finite_universal_binding(uuid,uuid,uuid,uuid,uuid,text,jsonb)'
    old_text = subprocess.check_output(['git','show','6879b323654520423208d9cb0b42265b0d1e23cc:backend/sql/universal_finite_native_routes_candidate.sql'],cwd=ROOT,text=True)
    old_find = definition(old_text,'trip_source_find_finite_universal_binding')
    sql('SET ROLE otr_trip_source_writer;' + old_find)
    sql('REVOKE ALL ON FUNCTION '+sig+' FROM PUBLIC;GRANT EXECUTE ON FUNCTION '+sig+' TO otr_trip_source_command_gateway;')
    specimen = ROOT.parent/'lane-c-imp-c01-txt-shortest-20261105/docs/ops/lane-c-imp-c01-txt-shortest-20261105/fixtures/lantern-qa-garden-walk.txt'
    raw = specimen.read_bytes();assert len(raw)==77 and hashlib.sha256(raw).hexdigest()=='54ad166d421325cb12dad3fee8ebfe2d64a81e2980eef2e9115abde87254d647'
    q, command_pin = command(raw.decode(),'lantern-qa-garden-walk.txt')
    pin = {'id':str(uuid.uuid4()),'source_id':q['source_id'],'material_revision':1,'representation_id':q['payload']['original']['id'],'payload_sha256':q['payload']['original']['payload_sha256'],'byte_count':77,'observed_source_row_revision':1,'historical_selection':False}
    desc = [pin[k] for k in ['id','source_id','material_revision','representation_id','payload_sha256','byte_count','observed_source_row_revision','historical_selection']]+[1,'ORIGINAL','TEXT',None,None,None,[]]
    expected = hashv('otr-source-run-input-v1',[1,[desc]])
    sql('INSERT INTO public.trip_source_universal_scope(singleton,actor_id,trip_id,batch_id,task_id,run_id,submission_sha256,input_sha256,starts_at,expires_at,source_command_pins) VALUES(true,'+','.join(lit(x)+'::uuid' for x in [ACTOR,TRIP,BATCH,TASK,RUN])+','+lit('a'*64)+','+lit(expected)+",clock_timestamp()-interval '1 second',clock_timestamp()+interval '600 seconds',"+lit(canon([command_pin]))+'::jsonb);')
    if not ADDITIONAL:
        sql(gateway(find()),error='INVALID_IMPORT_INPUT');checks.append('RED oldfind with exact current58577 throws INVALID_IMPORT_INPUT before any Source/representation exists')
    new_find = definition((ROOT/'backend/sql/universal_finite_native_routes_candidate.sql').read_text(),'trip_source_find_finite_universal_binding').replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1)
    sql('SET ROLE otr_trip_source_writer;' + new_find)
    before = sql("SELECT json_build_array((SELECT count(*) FROM trip_sources),(SELECT count(*) FROM trip_source_representations),(SELECT count(*) FROM trip_source_runs),(SELECT count(*) FROM trip_source_inputs));")
    assert sql(gateway(find())) == '';assert sql("SELECT json_build_array((SELECT count(*) FROM trip_sources),(SELECT count(*) FROM trip_source_representations),(SELECT count(*) FROM trip_source_runs),(SELECT count(*) FROM trip_source_inputs));") == before
    checks.append('GREEN exact active global-missing Source/representation/Run returns NULL with zero Source/representation/Run/Input creation')
    if not ADDITIONAL:
        for field in ['actor','trip','batch','task','run_id']:
            reject(find(**{field:OTHER}), 'wrong '+field+' rejected')
        reject(find(submission='b'*64),'wrong submission rejected')
        for key,value in [('id',OTHER),('source_id',OTHER),('representation_id',OTHER),('payload_sha256','f'*64),('byte_count',78),('material_revision',2),('observed_source_row_revision',2),('historical_selection',True)]:
            v={**pin,key:value};reject(find([v]),'input '+key+' mismatch rejected')
        for key,value in [('byte_count','77'),('byte_count',0),('byte_count',262145),('id','not-uuid')]: reject(find([{**pin,key:value}]),'invalid input '+key+' '+str(value)+' rejected')
        v={**pin,'extra':True};reject(find([v]),'extra input key rejected');reject(find([pin,pin]),'multiple input rejected')
        for key,value in [('actorId',OTHER),('tripId',OTHER),('sourceId',OTHER),('representationId',OTHER),('operationId','not-uuid'),('operationKey','bad key'),('operationSha256','not-hash'),('profile','OTR_SUBMITTED_TEXT_V1')]:
            cp={**command_pin,key:value};sql('UPDATE trip_source_universal_scope SET source_command_pins='+lit(canon([cp]))+'::jsonb;');reject(find(),'protected command pin '+key+' mismatch rejected')
        sql('UPDATE trip_source_universal_scope SET source_command_pins='+lit(canon([command_pin]))+'::jsonb;')
        for update,label in [("starts_at=clock_timestamp()+interval '1 minute'",'future'),("starts_at=clock_timestamp()-interval '2 minutes',expires_at=clock_timestamp()-interval '1 minute'",'expired')]:
            sql('UPDATE trip_source_universal_scope SET '+update+';');reject(find(),label+' scope rejected')
            sql("UPDATE trip_source_universal_scope SET starts_at=clock_timestamp()-interval '1 second',expires_at=clock_timestamp()+interval '600 seconds';")
        sql('UPDATE qa_acl SET allowed=false;');reject(find(),'revoked/unlinked normal Actor helper denies');sql('UPDATE qa_acl SET allowed=true;')
        for table,policy in [('trip_sources','global_source_read'),('trip_source_representations','global_rep_read'),('trip_source_runs','global_run_read')]:
            sql('ALTER POLICY '+policy+' ON '+table+' USING(false);');reject(find(),'RLS hidden '+table+' rejected');sql('ALTER POLICY '+policy+' ON '+table+' USING(true);')
        sql('CREATE POLICY restrictive_source ON trip_sources AS RESTRICTIVE FOR SELECT TO otr_trip_source_writer USING(true);');reject(find(),'restrictive policy even with true cannot qualify global absence');sql('DROP POLICY restrictive_source ON trip_sources;')
        sql('REVOKE SELECT ON trip_source_representations FROM otr_trip_source_writer;');reject(find(),'missing existing SELECT rejects');sql('GRANT SELECT ON trip_source_representations TO otr_trip_source_writer;')
        sid=lit(pin['source_id']);rid=lit(pin['representation_id']);acqkey=lit(q['operation_key'])
        source="INSERT INTO trip_sources VALUES("+sid+'::uuid,'+lit(TRIP)+'::uuid,'+lit(ACTOR)+"::uuid,'FILE','FILES',"+acqkey+",'ACTIVE','RETAINED',1,1);"
        representation="INSERT INTO trip_source_representations(id,source_id,role,introduced_revision,material_kind,encoding,parent_ids,payload_sha256,byte_count,retention_state,remote_state) VALUES("+rid+'::uuid,'+sid+"::uuid,'ORIGINAL',1,'TEXT','UTF-8','{}',"+lit(pin['payload_sha256'])+",77,'RETAINED','NOT_APPLICABLE');"
        sql(source);reject(find(),'partial source without representation rejected');sql('DELETE FROM trip_sources;')
        sql(representation);reject(find(),'partial/foreign representation UUID without source rejected');sql('DELETE FROM trip_source_representations;')
        sql(source+representation+'INSERT INTO trip_source_revisions VALUES('+sid+'::uuid,1,\'RETAINED\',ARRAY['+rid+'::uuid]);')
        assert sql(gateway(find()))=='';checks.append('Already present valid original uses actual58577/input validation and returns TaskAbsent without re-ACQUIRE')
        for update,label in [("acquired_by="+lit(OTHER)+'::uuid','same hash wrong Source owner'),("trip_id="+lit(OTHER)+'::uuid','same hash wrong Source Trip'),('row_revision=2','stale Source revision')]:
            sql('UPDATE trip_sources SET '+update+';');reject(find(),label+' rejected');sql('UPDATE trip_sources SET acquired_by='+lit(ACTOR)+'::uuid,trip_id='+lit(TRIP)+'::uuid,row_revision=1;')
        sql("UPDATE trip_source_representations SET payload_sha256=repeat('f',64);");reject(find(),'actual source hash mismatch rejected');sql('UPDATE trip_source_representations SET payload_sha256='+lit(pin['payload_sha256'])+';')
        # Existing retained branch is exercised with a synthetic complete Run; no Source ACQUIRE/Provider or real receipt is claimed.
        sql("INSERT INTO trip_source_runs(id,actor_account_id,trip_id,capture_batch_id,interpretation_task_id,capture_submission_sha256,extractor_key,state,retention_state,scope_source_ids,input_sha256,extractor_version,operation_key,extractor_options_sha256) VALUES("+','.join(lit(x)+'::uuid' for x in [RUN,ACTOR,TRIP,BATCH,TASK])+','+lit('a'*64)+",'otr-universal-interpretation-v1','PENDING','RETAINED',ARRAY["+sid+'::uuid],'+lit(expected)+",'1',"+lit('universal:'+BATCH)+','+lit('a'*64)+');')
        sql('INSERT INTO trip_source_inputs SELECT id,source_id,material_revision,representation_id,payload_sha256,byte_count,observed_source_row_revision,historical_selection,'+lit(RUN)+"::uuid,NULL FROM jsonb_populate_record(NULL::public.trip_source_inputs,"+lit(canon(pin))+');')
        sql('DELETE FROM trip_source_universal_scope;')
        binding=json.loads(sql(gateway(find())));assert binding['runId']==RUN;checks.append('Existing retained Run branch still works after removing positive scope; synthetic Actor/Source lock fixture only')
        reject(find(task=OTHER),'retained wrong Task remains rejection')
    else:
        # New collision/owner-FORCE/pin-shape concerns only; do not replay the frozen48 suite.
        def conflicting_run(run_id, actor_id=ACTOR, trip_id=TRIP, batch_id=BATCH, task_id=TASK, state='PENDING'):
            return "INSERT INTO trip_source_runs(id,actor_account_id,trip_id,capture_batch_id,interpretation_task_id,capture_submission_sha256,extractor_key,state,retention_state) VALUES("+','.join(lit(x)+'::uuid' for x in [run_id,actor_id,trip_id,batch_id,task_id])+','+lit('a'*64)+",'otr-universal-interpretation-v1',"+lit(state)+",'RETAINED');"
        sql(conflicting_run(OTHER,task_id=OTHER));reject(find(),'global other Run with same Actor/Trip/Batch rejected');sql('DELETE FROM trip_source_runs;')
        sql(conflicting_run(OTHER,trip_id=OTHER,batch_id=OTHER));reject(find(),'global same-Actor Task collision on another Trip rejected');sql('DELETE FROM trip_source_runs;')
        sql(conflicting_run(RUN,actor_id=OTHER));reject(find(),'existing global Run wrong owner rejected');sql('DELETE FROM trip_source_runs;')
        sql(conflicting_run(RUN,state='FAILED'));reject(find(),'existing failed Run is not missing');sql('DELETE FROM trip_source_runs;')
        sql('ALTER TABLE trip_sources OWNER TO otr_trip_source_writer;ALTER POLICY global_source_read ON trip_sources USING(false);');reject(find(),'SourceWriter ownership with FORCE RLS and filtered policy cannot prove absence');sql('ALTER POLICY global_source_read ON trip_sources USING(true);ALTER TABLE trip_sources OWNER TO postgres;GRANT SELECT ON trip_sources TO otr_trip_source_writer;')
        cp={**command_pin,'extra':True};sql('UPDATE trip_source_universal_scope SET source_command_pins='+lit(canon([cp]))+'::jsonb;');reject(find(),'extra protected command pin key rejected');sql('UPDATE trip_source_universal_scope SET source_command_pins='+lit(canon([command_pin]))+'::jsonb;')
        reject(find({}),'nonarray complete input shape rejected')
        cp={k:v for k,v in command_pin.items() if k!='operationSha256'};sql('UPDATE trip_source_universal_scope SET source_command_pins='+lit(canon([cp]))+'::jsonb;');reject(find(),'missing protected command digest key rejected');sql('UPDATE trip_source_universal_scope SET source_command_pins='+lit(canon([command_pin]))+'::jsonb;')
        assert sql(gateway(find()))==''
        assert sql("SELECT json_build_array((SELECT count(*) FROM trip_sources),(SELECT count(*) FROM trip_source_representations),(SELECT count(*) FROM trip_source_runs),(SELECT count(*) FROM trip_source_inputs));")==before
        checks.append('Collision probes restored only own synthetic fixture; final exact empty read still NULL and zero data created by GET')
    unchanged = sql("SELECT encode(sha256(convert_to(pg_get_functiondef('public.trip_import_run_input_hash(jsonb)'::regprocedure),'UTF8')),'hex');");assert unchanged==hash_preimage
    checks.append('Actual58577 full definition unchanged across read fix; no 503 catch/404 conversion in SQL or Backend')
    result={'status':'FOCUSED_PREACQUIRE_VISIBILITY_READ_PG_PASS','image':IMAGE,'network':'none','checks':checks,'checkCount':len(checks),'actual58577FullDefinitionSHA256':hash_preimage,'prospectiveInputSHA256':expected,'sourceCommand':q,'runInput':pin,'scope':'Boundary fixture: actual public canonical hash/58577/input_valid; normal registered Actor/material lock helpers are explicit qa_acl/noop test doubles; Source/representation existing rows are synthetic negative/retained fixtures, not accepted originals or real receipts. Reuse Root2 V2 actual14 separately. No Provider/Hosted/device/oldc420 runner.','ProviderCalls':0,'HostedCalls':0,'SourceBusinessCalls':0,'constraints':'Only one find candidate changed; global RLS policy guards are actual PG catalog/current role checks; ownerpostgres/non-bypass SourceWriter FORCE RLS true.','oldFindDefinitionSHA256':hashlib.sha256(old_find.encode()).hexdigest(),'newFindDefinitionSHA256':hashlib.sha256(new_find.encode()).hexdigest()}
    OUT.mkdir(exist_ok=True);(OUT/('PREACQUIRE_COLLISION_INCREMENT.json' if ADDITIONAL else 'PREACQUIRE_FOCUSED_PG.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'status':result['status'],'checks':len(checks),'network':'none'}))
except Exception as error:
    if created:
        state = run('inspect','--format','{{json .State}}',NAME,check=False)
        print('LOCAL_FIXTURE_STATE',state.stdout.strip())
        logs = run('logs','--tail','12',NAME,check=False)
        print('LOCAL_FIXTURE_LOG_TAIL',(logs.stdout+logs.stderr)[-2000:])
    raise
finally:
    if created: run('rm','-f',NAME,check=False)
