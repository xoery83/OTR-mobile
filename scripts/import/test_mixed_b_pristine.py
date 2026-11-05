"""Isolated PostgreSQL role, command and lock test for the mixed-B initial observation."""
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
DOCKER = '/opt/homebrew/bin/docker'
IMAGE = 'sha256:6942962433a569e87f228b4d4ab7e11db5deca64e43babb3a038443ad6c4f1bb'
NAME = 'otr-b-pristine-' + uuid.uuid4().hex[:10]
ACTOR, TRIP, BATCH, OTHER = (str(uuid.uuid4()) for _ in range(4))
GATEWAY = 'otr_trip_source_command_gateway'
WRITER = 'otr_trip_source_writer'
SIGNATURE = 'public.trip_source_find_finite_universal_binding(uuid,uuid,uuid,uuid,uuid,text,jsonb)'
DOMAIN = 'otr.import.mixed-b-initial/1'
CANDIDATE = ROOT/'backend/sql/universal_mixed_b_pristine_candidate.sql'
BASE = Path('/private/tmp/c01-b-source-67459-base-definition-20261106.sql')
OUT = Path('/private/tmp/IMP-C01-B-MATERIAL-CURRENT-PG-20261106.json')
canon = lambda value: json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
hashv = lambda domain, value: hashlib.sha256((domain + '\n' + canon(value)).encode()).hexdigest()
lit = lambda value: "'" + str(value).replace("'", "''") + "'"


def batch_identity(purpose):
    raw = bytearray(hashlib.sha256(canon(['otr.universal.batch-identity/1',ACTOR,TRIP,BATCH,purpose]).encode()).digest()[:16])
    raw[6] = (raw[6] & 15) | 128
    raw[8] = (raw[8] & 63) | 128
    return str(uuid.UUID(bytes=bytes(raw)))


TASK, RUN = batch_identity('task'), batch_identity('run')
SUBMISSION = 'a' * 64


def run(*args, data=None, check=True):
    p = subprocess.run([DOCKER, *args], input=data, text=True, capture_output=True, timeout=45)
    if check and p.returncode:
        raise RuntimeError(p.stderr[-3000:])
    return p


def psql(role):
    return ['exec','-i',NAME,'psql','-h','127.0.0.1','-XqAt','-U',role,'-d','postgres','-v','ON_ERROR_STOP=1']


def sql(text, role='supabase_admin', error=None):
    p = run(*psql(role), data=text, check=False)
    if error:
        assert p.returncode and error in p.stderr, (error, p.stderr)
    else:
        assert p.returncode == 0, p.stderr
    return p.stdout.strip()


def definition(path, name):
    text = (ROOT/path).read_text()
    return re.search(r'(?is)CREATE(?: OR REPLACE)? FUNCTION public\.' + name + r'\(.*?\$\$;', text).group()


def find(value, actor=ACTOR, trip=TRIP, batch=BATCH, task=TASK, run_id=RUN, submission=SUBMISSION):
    return 'SELECT public.trip_source_find_finite_universal_binding(' + ','.join(lit(x)+'::uuid' for x in [actor,trip,batch,task,run_id]) + ',' + lit(submission) + ',' + lit(canon(value)) + '::jsonb);'


def build_acquire(ordinal, kind, channel, mime, raw):
    source, representation, operation, input_id = (str(uuid.uuid4()) for _ in range(4))
    key = 'universal:' + operation
    sha = hashlib.sha256(raw).hexdigest()
    filename = ('fixture.png' if ordinal==0 else 'fixture.pdf') if mime else None
    descriptor = [representation,'BINARY' if mime else 'TEXT',filename,None,mime,None if mime else 'UTF-8',sha,len(raw),None if mime else raw.decode(),None]
    capture = hashv('otr-source-capture-v1',[1,source,1,None,[representation],'AS_SUPPLIED','ACQUISITION',None,None])
    acquisition = hashv('otr-source-acquisition-v1',[1,TRIP,ACTOR,source,key,kind,channel,None,'UNKNOWN',capture,descriptor])
    op_sha = hashv('otr-source-command-v1',[1,'ACQUIRE_SOURCE',operation,key,ACTOR,TRIP,source,[key,acquisition,[kind,channel,None,'UNKNOWN'],['AS_SUPPLIED',capture],descriptor]])
    command = dict(contract_version=1,command='ACQUIRE_SOURCE',operation_id=operation,operation_key=key,actor_account_id=ACTOR,trip_id=TRIP,source_id=source,operation_sha256=op_sha,payload=dict(acquisition_key=key,acquisition_sha256=acquisition,source_input=dict(source_kind=kind,acquisition_channel=channel,captured_at=None,capture_time_basis='UNKNOWN'),capture=dict(completeness='AS_SUPPLIED',capture_sha256=capture),original=dict(zip(['id','material_kind','original_filename','part_key','mime_type','encoding','payload_sha256','byte_count','text_content','locator_uri'],descriptor))))
    pin = dict(ordinal=ordinal,profile=['OTR_PNG_CAPTURE_ORIGINAL_V1','OTR_PDF_CAPTURE_ORIGINAL_V1','OTR_SUBMITTED_TEXT_V1'][ordinal],inputId=input_id,sourceId=source,originalRepresentationId=representation,byteCount=len(raw),sha256=sha,operationId=operation,operationKey=key,operationSha256=op_sha)
    return pin, dict(batchId=BATCH,taskId=TASK,runId=RUN,submissionSha256=SUBMISSION,command=command)


def tagged(manifest):
    return dict(mixedBInitial=dict(manifest=manifest,sha256=hashv(DOMAIN,manifest)))


def set_pins(values):
    sql('UPDATE trip_source_universal_scope SET source_command_pins='+lit(canon(values))+'::jsonb;')


def qualify_ordered(pins, frames, tag, manifest, checks):
    # The common owner function, proof, codec and result hash are actual SQL.
    # This limited fixture supplies a DML delegate instead of the full Hosted Source schema.
    foundation='supabase/migrations/20261004000500_trip_source_command_foundation.sql'
    sql(f"""
CREATE ROLE otr_trip_source_operation_reader NOLOGIN;
GRANT USAGE ON SCHEMA extensions TO otr_trip_source_operation_reader;
GRANT EXECUTE ON FUNCTION extensions.digest(bytea,text) TO otr_trip_source_operation_reader;
CREATE TABLE public.trip_source_command_gate(singleton boolean PRIMARY KEY,enabled boolean);
INSERT INTO public.trip_source_command_gate VALUES(true,true);
GRANT SELECT ON public.trip_source_command_gate TO {WRITER};
GRANT SELECT,UPDATE ON public.trips,public.trip_members,public.journey_members TO {WRITER};
GRANT SELECT ON public.trip_source_operations,public.trip_sources TO otr_trip_source_operation_reader;
CREATE POLICY qa_receipt_reader ON trip_source_operations FOR SELECT TO otr_trip_source_operation_reader USING(true);
CREATE POLICY qa_receipt_reader ON trip_sources FOR SELECT TO otr_trip_source_operation_reader USING(true);
"""+definition(foundation,'trip_source_operation_lookup')+f"""
ALTER FUNCTION public.trip_source_operation_lookup(uuid,uuid,uuid,uuid,text,text) OWNER TO otr_trip_source_operation_reader;
REVOKE ALL ON FUNCTION public.trip_source_operation_lookup(uuid,uuid,uuid,uuid,text,text) FROM PUBLIC,{GATEWAY};
GRANT EXECUTE ON FUNCTION public.trip_source_operation_lookup(uuid,uuid,uuid,uuid,text,text) TO {WRITER};
SET ROLE {WRITER};
"""+definition(foundation,'trip_source_assert_gate')+definition(foundation,'trip_source_lock_scope')+f"""
REVOKE ALL ON FUNCTION public.trip_source_assert_gate(),public.trip_source_lock_scope(uuid,uuid,uuid) FROM PUBLIC,{GATEWAY};
""")
    sql(f'''
GRANT INSERT ON trip_sources,trip_source_representations,trip_source_operations TO {WRITER};
CREATE POLICY qa_insert ON trip_sources FOR INSERT TO {WRITER} WITH CHECK(true);
CREATE POLICY qa_insert ON trip_source_representations FOR INSERT TO {WRITER} WITH CHECK(true);
CREATE POLICY qa_insert ON trip_source_operations FOR INSERT TO {WRITER} WITH CHECK(true);
SET ROLE {WRITER};
CREATE FUNCTION public.trip_source_register(family text,actor uuid,raw text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE q jsonb:=public.trip_source_command_codec(raw);p jsonb:=q->'payload';r jsonb:=p->'original';o public.trip_source_operations;
 remote text:=CASE WHEN r->>'material_kind'='TEXT' THEN 'NOT_APPLICABLE' ELSE 'PENDING' END;historic jsonb;
BEGIN
 IF current_user<>'{WRITER}' OR session_user<>'{GATEWAY}' OR family<>'ACQUIRE_SOURCE'
  OR q->>'actor_account_id'<>actor::text THEN RAISE EXCEPTION 'FIXTURE_ACQUIRE_DENIED';END IF;
 historic:=public.trip_source_operation_lookup(actor,(q->>'trip_id')::uuid,(q->>'source_id')::uuid,
  (q->>'operation_id')::uuid,q->>'operation_key',q->>'operation_sha256');
 IF historic IS NOT NULL THEN RETURN historic;END IF;
 PERFORM public.trip_source_assert_gate();
 PERFORM public.trip_source_lock_scope(actor,(q->>'trip_id')::uuid,(q->>'source_id')::uuid);
 INSERT INTO public.trip_sources VALUES((q->>'source_id')::uuid,(q->>'trip_id')::uuid,actor,
  p->'source_input'->>'source_kind',p->'source_input'->>'acquisition_channel',q->>'operation_key',
  'ACTIVE','RETAINED',1,1,p->>'acquisition_sha256');
 INSERT INTO public.trip_source_representations(id,source_id,role,mime_type,introduced_revision,material_kind,payload_sha256,byte_count,retention_state,remote_state)
 VALUES((r->>'id')::uuid,(q->>'source_id')::uuid,'ORIGINAL',r->>'mime_type',1,r->>'material_kind',r->>'payload_sha256',(r->>'byte_count')::bigint,'RETAINED',remote);
 o.id:=(q->>'operation_id')::uuid;o.trip_id:=(q->>'trip_id')::uuid;o.actor_account_id:=actor;
 o.source_id:=(q->>'source_id')::uuid;o.representation_id:=(r->>'id')::uuid;o.operation_key:=q->>'operation_key';
 o.phase:='FINAL';o.command:=family;o.operation_sha256:=q->>'operation_sha256';o.outcome:='APPLIED';
 o.completed_at:=clock_timestamp();o.result_source_row_revision:=1;o.result_material_revision:=1;o.result_representation_row_revision:=1;
 o.result_remote_state:=remote;o.result_retention_state:='RETAINED';o.result_action_id:=gen_random_uuid();
 o.result_sha256:=public.trip_source_hash('otr-source-result-v1',public.trip_source_result_tuple(o));
 INSERT INTO public.trip_source_operations SELECT o.*;
 RETURN public.trip_source_operation_reply(o);
END $$;
REVOKE ALL ON FUNCTION public.trip_source_register(text,uuid,text) FROM PUBLIC,{GATEWAY};
'''+(ROOT/'backend/sql/universal_mixed_b_acquire_owner_candidate.sql').read_text()+f'''
REVOKE ALL ON FUNCTION public.trip_source_acquire_source(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trip_source_acquire_source(uuid,text) TO {GATEWAY};
''')
    def acquire(frame):
        return 'SELECT public.trip_source_acquire_source('+lit(ACTOR)+'::uuid,'+lit(canon(frame['command']))+');'
    def next_ordinal():
        return json.loads(sql(find(dict(version='otr.import.mixed-b-acquire-next/1',initialManifest=manifest)),GATEWAY))['ordinal']
    def counts():
        return json.loads(sql('SELECT jsonb_build_array((SELECT count(*) FROM trip_sources),(SELECT count(*) FROM trip_source_representations),(SELECT count(*) FROM trip_source_operations));'))
    assert sql(f"SELECT has_function_privilege('{GATEWAY}','public.trip_source_register(text,uuid,text)','EXECUTE');")=='f'
    assert next_ordinal()==0
    sql(acquire(frames[1]),GATEWAY,error='INPUT_STALE')
    assert counts()==[0,0,0]
    first = json.loads(sql(acquire(frames[0]),GATEWAY))
    assert first['operation_id']==pins[0]['operationId'] and next_ordinal()==1
    sql(acquire(frames[2]),GATEWAY,error='INPUT_STALE')
    sql('UPDATE trip_sources SET row_revision=2;')
    sql(acquire(frames[1]),GATEWAY,error='UNIVERSAL_SOURCE_RUN_UNAVAILABLE')
    sql('UPDATE trip_sources SET row_revision=1;')
    sql("UPDATE trip_source_operations SET phase='IO_UNKNOWN';")
    sql(acquire(frames[1]),GATEWAY,error='UNIVERSAL_SOURCE_RUN_UNAVAILABLE')
    sql("UPDATE trip_source_operations SET phase='FINAL';")
    assert counts()==[1,1,1]
    assert json.loads(sql(acquire(frames[1]),GATEWAY))['operation_id']==pins[1]['operationId']
    assert next_ordinal()==2
    sql('UPDATE trip_source_universal_scope SET input_sha256='+lit('0'*64)+';')
    sql(acquire(frames[2]),GATEWAY,error='UNIVERSAL_SOURCE_RUN_UNAVAILABLE')
    assert counts()==[2,2,2]
    sql('UPDATE trip_source_universal_scope SET input_sha256='+lit(hashv(DOMAIN,manifest))+';')
    assert json.loads(sql(acquire(frames[2]),GATEWAY))['operation_id']==pins[2]['operationId']
    assert json.loads(sql(acquire(frames[0]),GATEWAY))==first
    sql(find(dict(version='otr.import.mixed-b-acquire-next/1',initialManifest=manifest)),GATEWAY,error='UNIVERSAL_SOURCE_RUN_UNAVAILABLE')
    assert counts()==[3,3,3]
    checks.append('actual common Gateway guard serially admits original IDs; out-of-order, prior UNKNOWN/drift and wrong phase do not reach fixture DML; exact FINAL replay is read-only')
    sql('DELETE FROM trip_source_operations;DELETE FROM trip_source_representations;DELETE FROM trip_sources;')
    def send(session, statement):
        session.stdin.write(statement+'\n')
        session.stdin.flush()

    def expect_wait(holder, mode):
        query = ("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=714024 "
                 "AND objid=2 AND objsubid=2 AND NOT granted AND mode="+lit(mode)+");")
        for _ in range(60):
            send(holder, query)
            if holder.stdout.readline().strip()=='t':
                return
            assert holder.poll() is None
            time.sleep(.025)
        raise AssertionError('CUTOVER_COMPETITOR_WAIT_NOT_OBSERVED_'+mode)

    def session(role):
        return subprocess.Popen([DOCKER,*psql(role)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE,text=True)

    # Enrollment has an uncommitted tag while ACQUIRE can only see the ordinary preimage.
    set_pins(frames)
    enroll = 'UPDATE trip_source_universal_scope SET source_command_pins='+lit(canon(frames+[tag]))+'::jsonb;'
    settings = "SET statement_timeout='8s';SET lock_timeout='6s';"
    with session('supabase_admin') as operator, session(GATEWAY) as gateway:
        send(operator,settings+'BEGIN;SELECT pg_advisory_xact_lock(714024,2);'+enroll+"SELECT 'cutover-held';")
        assert operator.stdout.readline().strip()==''
        assert operator.stdout.readline().strip()=='cutover-held'
        send(gateway,settings+acquire(frames[1]))
        expect_wait(operator,'ShareLock')
        send(operator,"COMMIT;SELECT 'cutover-committed';")
        assert operator.stdout.readline().strip()=='cutover-committed'
        gateway.stdin.close()
        assert gateway.wait(timeout=8)!=0
        assert 'UNIVERSAL_SOURCE_SCOPE_CLOSED' in gateway.stderr.read()
        operator.stdin.close()
        assert operator.wait(timeout=8)==0,operator.stderr.read()
    assert counts()==[0,0,0]
    checks.append('exclusive enrollment wins: ordinary preimage ACQUIRE waits, sees committed protected tag, denies with zero Source/rep/operation writes')

    set_pins(frames)
    with session(GATEWAY) as gateway, session('supabase_admin') as operator:
        send(gateway,settings+"BEGIN ISOLATION LEVEL REPEATABLE READ;SELECT current_setting('transaction_isolation')||':'||pg_current_snapshot()::text;")
        assert gateway.stdout.readline().strip().startswith('repeatable read:')
        send(operator,settings+'BEGIN;SELECT pg_advisory_xact_lock(714024,2);'+enroll+"SELECT 'rr-cutover-held';")
        assert operator.stdout.readline().strip()==''
        assert operator.stdout.readline().strip()=='rr-cutover-held'
        send(gateway,acquire(frames[1]))
        gateway.stdin.close()
        assert gateway.wait(timeout=4)!=0
        error=gateway.stderr.read()
        assert 'UNSUPPORTED_TRANSACTION_ISOLATION' in error and 'trip_source_assert_gate' not in error,error
        send(operator,"COMMIT;SELECT 'rr-cutover-committed';")
        assert operator.stdout.readline().strip()=='rr-cutover-committed'
        operator.stdin.close()
        assert operator.wait(timeout=8)==0,operator.stderr.read()
    assert counts()==[0,0,0]
    checks.append('repeatable-read Gateway with pre-enrollment snapshot is rejected at common entry while exclusive cutover is held; enrollment commits and no rows were written')

    # Ordinary ACQUIRE already holds the shared fence when enrollment starts.
    set_pins(frames)
    legacy=build_acquire(2,'TEXT','PASTE',None,b'ordinary synthetic legacy')[1]
    with session(GATEWAY) as gateway, session('supabase_admin') as operator:
        send(gateway,settings+'BEGIN;'+acquire(legacy))
        receipt=json.loads(gateway.stdout.readline())
        assert receipt['outcome']=='APPLIED'
        send(operator,settings+'BEGIN;SELECT pg_advisory_xact_lock(714024,2);'+enroll+"COMMIT;SELECT 'enrolled';")
        expect_wait(gateway,'ExclusiveLock')
        send(gateway,"COMMIT;SELECT 'ordinary-committed';")
        assert gateway.stdout.readline().strip()=='ordinary-committed'
        assert operator.stdout.readline().strip()==''
        assert operator.stdout.readline().strip()=='enrolled'
        gateway.stdin.close()
        operator.stdin.close()
        assert gateway.wait(timeout=8)==0,gateway.stderr.read()
        assert operator.wait(timeout=8)==0,operator.stderr.read()
    assert counts()==[1,1,1]
    checks.append('ordinary ACQUIRE wins: enrollment waits for shared owner transaction, then both commit in order with one original write')

    set_pins(frames)
    sql("UPDATE journey_members SET role='viewer';UPDATE trip_source_command_gate SET enabled=false;")
    assert json.loads(sql(acquire(legacy),GATEWAY))==receipt
    assert counts()==[1,1,1]
    sql("UPDATE trip_source_command_gate SET enabled=true;")
    fresh=build_acquire(2,'TEXT','PASTE',None,b'legacy write must still require group access')[1]
    sql(acquire(fresh),GATEWAY,error='SOURCE_ACCESS_DENIED')
    assert counts()==[1,1,1]
    sql("UPDATE journey_members SET role='group_member';DELETE FROM trip_source_operations;DELETE FROM trip_source_representations;DELETE FROM trip_sources;")
    set_pins(frames+[tag])
    checks.append('untagged legacy historic FINAL remains read-only under closed write gate and viewer access; new viewer acquisition is denied')


def install_run_writers():
    # The baseline owning BEGIN is reused with the already-reviewed finite normalized gate.
    begin = definition('backend/sql/universal_source_host_candidate.sql','trip_source_begin_universal_inputs')
    gates = re.findall(r"if not exists\(select 1 from public\.trip_source_universal_scope s where singleton.*?then raise exception 'UNIVERSAL_SOURCE_SCOPE_CLOSED';end if;",begin,re.S)
    assert len(gates)==2
    gate = "if public.trip_source_finite_native_normalized_scope(actor,trip,(q->>'batchId')::uuid,(q->>'taskId')::uuid,(q->>'runId')::uuid,q->>'submissionSha256',q->'inputs') IS NOT TRUE then raise exception 'UNIVERSAL_SOURCE_SCOPE_CLOSED';end if;"
    for before in gates:
        begin=begin.replace(before,gate,1)
    writer='backend/sql/universal_finite_native_routes_candidate.sql'
    sql(f'''
ALTER TABLE public.trip_source_runs ADD COLUMN row_revision bigint DEFAULT 1, ADD COLUMN scope_sha256 text,
 ADD COLUMN completed_at timestamptz, ADD COLUMN error_code text;
ALTER TABLE public.trip_source_runs ALTER COLUMN state SET DEFAULT 'PENDING', ALTER COLUMN retention_state SET DEFAULT 'RETAINED';
GRANT INSERT ON public.trip_source_runs TO {WRITER};
CREATE POLICY qa_run_insert ON public.trip_source_runs FOR INSERT TO {WRITER} WITH CHECK(true);
SET ROLE {WRITER};
'''+begin+definition(writer,'trip_source_finite_native_run_row')+definition(writer,'trip_source_begin_finite_universal_inputs')+f'''
REVOKE ALL ON FUNCTION public.trip_source_begin_universal_inputs(uuid,uuid,text),public.trip_source_begin_finite_universal_inputs(uuid,uuid,text),public.trip_source_finite_native_run_row(text,text,jsonb) FROM PUBLIC,{GATEWAY};
GRANT EXECUTE ON FUNCTION public.trip_source_begin_universal_inputs(uuid,uuid,text),public.trip_source_begin_finite_universal_inputs(uuid,uuid,text) TO {GATEWAY};
CREATE FUNCTION public.qa_finite_run_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF session_user='{GATEWAY}' AND public.trip_source_finite_native_run_row(TG_TABLE_NAME,TG_OP,to_jsonb(NEW)) IS NOT TRUE
 THEN RAISE EXCEPTION 'FIXTURE_RUN_WRITE_DENIED';END IF;
 RETURN NEW;
END $$;
RESET ROLE;
CREATE TRIGGER qa_run_guard BEFORE INSERT ON public.trip_source_runs FOR EACH ROW EXECUTE FUNCTION public.qa_finite_run_guard();
CREATE TRIGGER qa_input_guard BEFORE INSERT ON public.trip_source_inputs FOR EACH ROW EXECUTE FUNCTION public.qa_finite_run_guard();
''')


def qualify_material(pins, frames, tag, manifest, checks, on_material=None):
    original_inputs, stored_inputs = [], []
    source_ids = sorted(pin['sourceId'] for pin in pins)
    qvals = lambda values: ','.join(lit(x) for x in values)
    for ordinal, pin in enumerate(pins):
        sid, rid = pin['sourceId'], pin['originalRepresentationId']
        source_kind, channel, mime = [('IMAGE','FILES','image/png'),('FILE','FILES','application/pdf'),('TEXT','PASTE',None)][ordinal]
        source_rev = 2 if ordinal==1 else 1
        row_rev = 2 if ordinal<2 else 1
        sql('INSERT INTO trip_sources VALUES('+qvals([sid,TRIP,ACTOR,source_kind,channel,pin['operationKey'],'ACTIVE','RETAINED',row_rev,source_rev])+');')
        sql("INSERT INTO trip_source_revisions VALUES("+qvals([sid,source_rev,'RETAINED'])+",ARRAY["+lit(rid)+"::uuid]);")
        sql("INSERT INTO trip_source_representations(id,source_id,role,mime_type,introduced_revision,material_kind,encoding,parent_ids,payload_sha256,byte_count,retention_state,remote_state) VALUES("+qvals([rid,sid,'ORIGINAL'])+","+(lit(mime) if mime else 'NULL')+','+qvals([1,'BINARY' if mime else 'TEXT'])+','+('NULL' if mime else "'UTF-8'")+','+qvals(['{}',pin['sha256'],pin['byteCount'],'RETAINED','VERIFIED' if mime else 'NOT_APPLICABLE'])+');')
        p = dict(id=pin['inputId'],source_id=sid,material_revision=source_rev,representation_id=rid,payload_sha256=pin['sha256'],byte_count=pin['byteCount'],observed_source_row_revision=row_rev,historical_selection=False)
        original_inputs.append(p)
        if ordinal==0:
            sql("INSERT INTO qa_proofs VALUES("+qvals([rid,ACTOR,TRIP,'{"verified":true}'])+",true);")
        if ordinal==1:
            derived = str(uuid.uuid4())
            derived_bytes = b'Synthetic extracted PDF itinerary text'
            derived_hash = hashlib.sha256(derived_bytes).hexdigest() if on_material else 'd'*64
            derived_size = len(derived_bytes) if on_material else 115
            options = '71804d69ac7011fc3b27231d7f6942cb696edb7ced9e696c083d4ce05fdd9ee5' if on_material else 'b'*64
            sql("INSERT INTO trip_source_representations(id,source_id,role,transform_key,introduced_revision,material_kind,encoding,transform_version,transform_options_sha256,parent_ids,payload_sha256,byte_count,retention_state,remote_state) VALUES("+qvals([derived,sid,'DERIVED','otr.pdf.qpdf-poppler',2,'TEXT','UTF-8','2',options])+",ARRAY["+lit(rid)+"::uuid],"+qvals([derived_hash,derived_size,'RETAINED','NOT_APPLICABLE'])+');')
            facts = dict(pdfSource=dict(original=dict(representationId=rid,sha256=pin['sha256'],byteCount=pin['byteCount']),sealSha256='c'*64,pageMapSha256='e'*64,transformOptionsSha256=options))
            sql("INSERT INTO qa_proofs VALUES("+qvals([derived,ACTOR,TRIP,canon(facts)])+",true);")
            p = {**p,'representation_id':derived,'payload_sha256':derived_hash,'byte_count':derived_size}
            original_facts={**facts,'input':p}
            sql("INSERT INTO qa_proofs VALUES("+qvals([rid,ACTOR,TRIP,canon(original_facts)])+",true);")
        stored_inputs.append(p)
        sql("INSERT INTO trip_source_operations(id,trip_id,actor_account_id,source_id,representation_id,operation_key,phase,command,operation_sha256,outcome,completed_at,result_source_row_revision,result_material_revision,result_representation_row_revision,result_remote_state,result_retention_state,result_action_id) VALUES("+qvals([pin['operationId'],TRIP,ACTOR,sid,rid,pin['operationKey'],'FINAL','ACQUIRE_SOURCE',pin['operationSha256'],'APPLIED'])+",clock_timestamp(),1,1,1,"+qvals(['PENDING' if mime else 'NOT_APPLICABLE','RETAINED',str(uuid.uuid4())])+');')
    sql("UPDATE trip_source_operations o SET result_sha256=trip_source_hash('otr-source-result-v1',trip_source_result_tuple(o));")
    active_hash = sql("SELECT trip_import_run_input_hash("+lit(canon(original_inputs))+"::jsonb);")
    stored_hash = sql("SELECT trip_import_run_input_hash("+lit(canon(stored_inputs))+"::jsonb);")
    assert len({active_hash,stored_hash,hashv(DOMAIN,manifest)})==3
    sql("UPDATE trip_source_universal_scope SET input_sha256="+lit(active_hash)+",starts_at=clock_timestamp()-interval '1 second',expires_at=clock_timestamp()+interval '900 seconds';")
    set_pins(frames+[tag])
    envelope = dict(version='otr.import.mixed-b-material-current/1',initialManifest=manifest,inputs=original_inputs)
    def reject(label, value=envelope, reason='UNIVERSAL_SOURCE_RUN_UNAVAILABLE'):
        sql(find(value),GATEWAY,error=reason)
        checks.append(label)
    reject('material proof cannot create an absent Run')
    pre_run = dict(version='otr.import.mixed-b-pre-run/1', initialManifest=manifest,
                   inputs=original_inputs, normalizedInputs=stored_inputs, materialInputSha256=active_hash)
    observe = json.loads(sql(find(pre_run), GATEWAY))
    assert observe == dict(version=pre_run['version'], initialManifestSha256=hashv(DOMAIN,manifest),
                           materialInputSha256=active_hash, normalizedInputSha256=stored_hash)
    reject('pre-Run wrong loaded hash denied', {**pre_run, 'materialInputSha256':'0'*64})
    reject('pre-Run forged normalized originals denied', {**pre_run, 'normalizedInputs':original_inputs})
    checks.append('pre-Run exact current originals and normalized hash qualified with all FINAL receipts, zero Run writes')
    ready = dict(version='otr.import.mixed-b-material-ready/1',initialManifest=manifest,
                 inputs=original_inputs,materialInputSha256=active_hash)
    absent = json.loads(sql(find(ready),GATEWAY))
    assert absent['runState']=='ABSENT' and absent['normalizedInputSha256']==stored_hash
    reject('material-ready wrong protected hash denied',{**ready,'materialInputSha256':'0'*64})
    assert sql('SELECT count(*) FROM trip_source_runs;')=='0'
    sql("INSERT INTO trip_source_runs(id,actor_account_id,trip_id,capture_batch_id,interpretation_task_id,capture_submission_sha256,extractor_key,state,retention_state,scope_source_ids,input_sha256,extractor_version,operation_key,extractor_options_sha256) VALUES("+qvals([RUN,ACTOR,TRIP,BATCH,TASK,SUBMISSION,'otr-universal-interpretation-v1','PENDING','RETAINED'])+",ARRAY["+qvals(source_ids)+"]::uuid[],"+qvals([stored_hash,'1','universal:'+BATCH,SUBMISSION])+");")
    reject('pre-existing Run without stored inputs is partial, not current')
    sql('DELETE FROM trip_source_runs;')
    run_request=dict(runId=RUN,batchId=BATCH,taskId=TASK,submissionSha256=SUBMISSION,inputs=original_inputs)
    def begin(value, endpoint='trip_source_begin_finite_universal_inputs', error=None):
        return sql('SELECT public.'+endpoint+'('+qvals([ACTOR,TRIP,canon(value)])+');',GATEWAY,error=error)
    begin(run_request,error='MIXED_B_RUN_WRITE_DENIED')
    begin({**run_request,'materialInputSha256':active_hash},error='MIXED_B_RUN_WRITE_DENIED')
    begin({**run_request,'materialInputSha256':'0'*64,'normalizedInputSha256':stored_hash},error='UNIVERSAL_SOURCE_RUN_UNAVAILABLE')
    begin({**run_request,'materialInputSha256':active_hash,'normalizedInputSha256':'0'*64},error='MIXED_B_RUN_WRITE_DENIED')
    begin({**run_request,'inputs':stored_inputs},'trip_source_begin_universal_inputs',error='MIXED_B_RUN_WRITE_DENIED')
    assert sql('SELECT count(*) FROM trip_source_runs;')=='0'
    exact_begin={**run_request,'materialInputSha256':active_hash,'normalizedInputSha256':stored_hash}
    owned_run=json.loads(begin(exact_begin))
    assert owned_run['id']==RUN and owned_run['input_sha256']==stored_hash
    assert sql('SELECT count(*) FROM trip_source_inputs;')=='3'
    begin(exact_begin,error='MIXED_B_RUN_WRITE_DENIED')
    retained=json.loads(sql(find(ready),GATEWAY))
    assert retained['runState']=='PENDING' and retained['normalizedInputSha256']==stored_hash
    checks.append('read-only material-ready observes ABSENT or exact PENDING and derives same normalized hash without writes')
    checks.append('actual finite BEGIN and common row guard write one deterministic Run and three normalized pins; missing/wrong hash, direct bypass and repeat denied')
    before = sql("SELECT jsonb_build_array((SELECT count(*) FROM trip_source_runs),(SELECT count(*) FROM trip_source_inputs),(SELECT count(*) FROM trip_source_operations));")
    proof = json.loads(sql(find(envelope),GATEWAY))
    assert proof['version']==envelope['version'] and proof['materialInputSha256']==active_hash
    assert proof['initialManifestSha256']==hashv(DOMAIN,manifest) and proof['scopeRemainingMs']>0
    assert proof['binding']==json.loads(sql(find(original_inputs),GATEWAY))
    assert any('pdfSource' in p for p in proof['binding']['inputs'])
    checks.append('current material proof separates protected original hash, stored normalized hash and tagged initial hash')
    assert sql("SELECT jsonb_build_array((SELECT count(*) FROM trip_source_runs),(SELECT count(*) FROM trip_source_inputs),(SELECT count(*) FROM trip_source_operations));")==before
    checks.append('current proof did not create Run, Input, operation or receipt')
    if on_material:
        on_material(dict(initial=manifest, binding=proof['binding'], inputs=original_inputs,
                         expectedMaterial=dict(inputSha256=active_hash, expiresAt=proof['scopeExpiresAt']),
                         bytesByOrdinal=[b'png metadata fixture'.hex(),derived_bytes.hex(),b'submitted fixture text'.hex()]))
        return

    altered = copy.deepcopy(envelope); altered['inputs'][0]['observed_source_row_revision']=1
    reject('old material observation rejected by exact protected hash',altered)
    altered = copy.deepcopy(envelope); altered['inputs'][0]['id']=altered['inputs'][1]['id']
    reject('duplicate material logical input rejected',altered)
    altered = copy.deepcopy(envelope); altered['inputs'][1]=stored_inputs[1]
    reject('caller cannot substitute normalized PDF derivative for pinned original',altered)
    sql("UPDATE trip_sources SET row_revision=row_revision+1 WHERE id="+lit(pins[0]['sourceId'])+";")
    reject('current Source revision mismatch rejects material proof',reason='INPUT_STALE')
    sql("UPDATE trip_sources SET row_revision=row_revision-1 WHERE id="+lit(pins[0]['sourceId'])+";")
    sql("UPDATE trip_source_operations SET phase='IO_UNKNOWN' WHERE id="+lit(pins[0]['operationId'])+";")
    reject('UNKNOWN historical acquisition cannot prove positive material')
    sql("UPDATE trip_source_operations SET phase='FINAL',result_sha256=repeat('a',64) WHERE id="+lit(pins[0]['operationId'])+";")
    reject('forged FINAL immutable acquisition digest rejected',reason='REPLAY_UNAVAILABLE')
    sql("UPDATE trip_source_operations o SET result_sha256=trip_source_hash('otr-source-result-v1',trip_source_result_tuple(o));")
    p = pins[0]
    later = str(uuid.uuid4())
    sql("INSERT INTO trip_source_operations(id,trip_id,actor_account_id,source_id,representation_id,operation_key,phase) VALUES("+qvals([later,TRIP,ACTOR,p['sourceId'],p['originalRepresentationId'],'later:unknown','IO_UNKNOWN'])+");")
    reject('unresolved additional operation rejects even if all exact ACQUIRE rows are FINAL')
    sql("DELETE FROM trip_source_operations WHERE id="+lit(later)+";")
    attempt = str(uuid.uuid4())
    sql("INSERT INTO trip_source_execution_attempts VALUES("+qvals([attempt,p['operationId'],TRIP,p['sourceId'],p['originalRepresentationId'],p['operationSha256'],p['operationKey'],'UNKNOWN','true'])+");")
    reject('unresolved execution attempt rejects even if exact owning operation and materials are FINAL')
    sql("UPDATE trip_source_execution_attempts SET phase='TERMINAL',termination_outstanding=false;")
    assert json.loads(sql(find(envelope),GATEWAY))['binding']['runId']==RUN
    checks.append('consistent terminal historical attempt is allowed')
    sql("UPDATE trip_source_execution_attempts SET operation_sha256=repeat('f',64);")
    reject('mismatched terminal attempt is not accepted as settled history')
    sql("DELETE FROM trip_source_execution_attempts;")
    sql("UPDATE qa_proofs SET valid=false WHERE id="+lit(pins[0]['originalRepresentationId'])+";")
    reject('owning PNG fact rejected even when original hash and receipt match')
    sql("UPDATE qa_proofs SET valid=true;")
    sql("UPDATE trip_source_runs SET state='READY';")
    reject('settled existing Run cannot recreate Task through material guard')
    sql("UPDATE trip_source_runs SET state='PENDING';")
    with subprocess.Popen([DOCKER,*psql(GATEWAY)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True) as worker:
        worker.stdin.write('BEGIN;'+find(envelope)+'\n')
        worker.stdin.flush()
        assert json.loads(worker.stdout.readline())['binding']['runId']==RUN
        sql("SET lock_timeout='200ms';SELECT pg_advisory_xact_lock(714024,2);",error='lock timeout')
        sql("SET lock_timeout='200ms';UPDATE trip_source_runs SET state='READY';",error='lock timeout')
        sql("SET lock_timeout='200ms';UPDATE trip_sources SET row_revision=999;",error='lock timeout')
        checks.append('positive material lease holds exact Run/Source rows and excludes scope close')
        worker.stdin.write('COMMIT;\n'); worker.stdin.close()
        assert worker.wait(timeout=4)==0
    sql("UPDATE trip_source_universal_scope SET starts_at=clock_timestamp()-interval '2 minutes',expires_at=clock_timestamp()-interval '1 minute';")
    reject('closed scope denies positive material even with retained Run')
    assert json.loads(sql(find(original_inputs),GATEWAY))['runId']==RUN
    checks.append('exact retained mixed Run remains readable after close')
    sql('DELETE FROM trip_source_inputs;DELETE FROM trip_source_runs;DELETE FROM trip_source_operations;DELETE FROM trip_source_representations;DELETE FROM trip_source_revisions;DELETE FROM trip_sources;DELETE FROM qa_proofs;')


def qualify(checks, on_material=None, on_ordered=None):
    candidate = CANDIDATE.read_text()
    start = candidate.index(' -- Typed protected mixed-B observations')
    end = candidate.index(' IF NOT current_material AND public.trip_source_lock_universal_actor')
    retained = (candidate[candidate.index('CREATE OR REPLACE FUNCTION'):start]+candidate[end:]).replace('CREATE OR REPLACE FUNCTION','CREATE FUNCTION',1)
    retained = re.sub(r'\n initial_hash text;.*?\nBEGIN','\nBEGIN',retained,count=1,flags=re.S)
    retained = retained.replace('IF NOT current_material AND public.trip_source_lock_universal_actor','IF public.trip_source_lock_universal_actor',1)
    retained = retained.replace("  IF current_material THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_RUN_UNAVAILABLE';END IF;\n",'',1)
    retained = retained[:retained.index(' IF current_material THEN\n  remaining_ms')].replace(' binding:=jsonb_build_object(', ' RETURN jsonb_build_object(',1)+'END $$;\n'
    assert retained == BASE.read_text()
    checks.append('legacy TXT/actual-material and retained definitions are byte-identical after subtracting new declarations/branch')
    sql((ROOT/'backend/src/__fixtures__/finiteNativeHelperBootstrap.sql').read_text()+'''
RESET ROLE;
REVOKE otr_trip_source_writer FROM otr_trip_source_command_gateway;
GRANT USAGE ON SCHEMA extensions TO otr_trip_source_writer;
ALTER TABLE public.trip_source_universal_scope ADD COLUMN source_command_pins jsonb DEFAULT '[]';
ALTER TABLE public.trip_source_runs ADD COLUMN generation bigint DEFAULT 1,ADD COLUMN created_at timestamptz DEFAULT clock_timestamp();
ALTER TABLE public.trip_source_representations ADD COLUMN introduced_revision bigint,ADD COLUMN material_kind text,ADD COLUMN encoding text,ADD COLUMN transform_version text,ADD COLUMN transform_options_sha256 text,ADD COLUMN parent_ids uuid[],ADD COLUMN payload_sha256 text,ADD COLUMN byte_count bigint,ADD COLUMN retention_state text,ADD COLUMN remote_state text,ADD COLUMN row_revision bigint DEFAULT 1;
CREATE TABLE public.trip_sources(id uuid PRIMARY KEY,trip_id uuid,acquired_by uuid,source_kind text,acquisition_channel text,acquisition_key text,lifecycle text,retention_state text,row_revision bigint,current_material_revision bigint,acquisition_sha256 text);
CREATE TABLE public.trip_source_operations(id uuid PRIMARY KEY,trip_id uuid,actor_account_id uuid,source_id uuid,representation_id uuid,operation_key text,phase text,command text,operation_sha256 text,outcome text,error_code text,completed_at timestamptz,result_source_row_revision bigint,result_material_revision bigint,result_representation_row_revision bigint,result_remote_state text,result_retention_state text,result_action_id uuid,result_verified_at timestamptz,result_sha256 text,attempt_generation bigint);
CREATE TABLE public.trip_source_execution_attempts(id uuid PRIMARY KEY,operation_id uuid,trip_id uuid,source_id uuid,representation_id uuid,operation_sha256 text,operation_key text,phase text,termination_outstanding boolean);
CREATE TABLE public.trip_source_revisions(source_id uuid,material_revision bigint,retention_state text,original_representation_ids uuid[]);
CREATE TABLE public.trips(id uuid PRIMARY KEY,created_by uuid);
CREATE TABLE public.trip_members(id uuid PRIMARY KEY,trip_id uuid,user_id uuid);
CREATE TABLE public.journey_members(id uuid PRIMARY KEY,trip_id uuid,user_id uuid,status text,role text);
DROP FUNCTION public.trip_event_keys(jsonb,text[]);
DROP FUNCTION public.trip_source_lock_universal_actor(uuid,uuid,boolean);
DROP FUNCTION public.trip_import_run_input_hash(jsonb);
DROP FUNCTION public.trip_import_input_valid(public.trip_source_inputs,uuid,uuid,boolean);

''')
    for table in ['trip_sources','trip_source_representations','trip_source_runs','trip_source_operations','trip_source_execution_attempts']:
        sql(f'ALTER TABLE public.{table} OWNER TO postgres;GRANT SELECT ON public.{table} TO {WRITER};ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY;ALTER TABLE public.{table} FORCE ROW LEVEL SECURITY;CREATE POLICY global_read ON public.{table} FOR SELECT TO {WRITER} USING(true);')
    sql('GRANT SELECT ON trip_source_revisions TO '+WRITER+';GRANT UPDATE(state) ON trip_source_runs TO '+WRITER+';CREATE POLICY run_update ON trip_source_runs FOR UPDATE TO '+WRITER+' USING(true) WITH CHECK(true);')
    migrations = {
        'supabase/migrations/20261004000300_trip_source_protected_foundation.sql':['trip_source_representation_valid','trip_source_uuid_array_valid'],
        'supabase/migrations/20261004000400_trip_event_command_foundation.sql':['trip_event_keys','trip_event_canonical_json','trip_event_utc_timestamp'],
        'supabase/migrations/20261004000500_trip_source_command_foundation.sql':['trip_source_hash','trip_source_payload_tuple','trip_source_command_codec','trip_source_admission','trip_source_result_tuple','trip_source_operation_reply'],
        'supabase/migrations/20261005000500_trip_import_admission_guards.sql':['trip_import_scope_lock','trip_import_input_valid'],
        'supabase/migrations/20261005001000_trip_import_flight_value_guards.sql':['trip_import_run_input_hash'],
        'backend/sql/universal_source_host_candidate.sql':['trip_source_lock_universal_actor','trip_source_lock_universal_materials'],
        'backend/sql/universal_finite_native_helpers_candidate.sql':['trip_source_finite_native_identity','trip_source_finite_native_original_scope','trip_source_finite_native_normalized_scope','trip_source_finite_native_retained_pin'],
        'backend/sql/universal_finite_native_commands_candidate.sql':['trip_source_finite_native_command','trip_source_finite_native_original_context'],
    }
    for path, names in migrations.items():
        for name in names:
            sql(definition(path,name))
    sql(f'SET ROLE {WRITER};'+BASE.read_text()+f';REVOKE ALL ON FUNCTION {SIGNATURE} FROM PUBLIC;GRANT EXECUTE ON FUNCTION {SIGNATURE} TO {GATEWAY};')
    sql('INSERT INTO trips VALUES('+lit(TRIP)+','+lit(OTHER)+');INSERT INTO journey_members VALUES('+lit(str(uuid.uuid4()))+','+lit(TRIP)+','+lit(ACTOR)+",'linked','group_member');")
    pins, frames = map(list,zip(build_acquire(0,'IMAGE','FILES','image/png',b'png metadata fixture'),build_acquire(1,'FILE','FILES','application/pdf',b'pdf metadata fixture'),build_acquire(2,'TEXT','PASTE',None,b'submitted fixture text')))
    manifest = dict(version=DOMAIN,actorId=ACTOR,tripId=TRIP,batchId=BATCH,taskId=TASK,runId=RUN,submissionSha256=SUBMISSION,originals=pins)
    tag = tagged(manifest)
    sql('INSERT INTO trip_source_universal_scope VALUES(true,'+','.join(lit(x) for x in [ACTOR,TRIP,BATCH,TASK,RUN,SUBMISSION,tag['mixedBInitial']['sha256']])+',clock_timestamp()-interval \'1 second\',clock_timestamp()+interval \'900 seconds\',\'[]\');')
    set_pins(frames+[tag])
    sql(find(manifest),GATEWAY,error='UNIVERSAL_SOURCE_RUN_UNAVAILABLE')
    checks.append('old current definition rejects initial typed B before any originals exist')
    sql(f'SET ROLE {WRITER};'+candidate)
    acl = sql(f"SELECT proowner::regrole,prosecdef,proconfig,has_function_privilege('{GATEWAY}',oid,'EXECUTE') FROM pg_proc WHERE oid='{SIGNATURE}'::regprocedure;")
    assert acl == f'{WRITER}|t|{{search_path=pg_catalog}}|t'
    qualify_ordered(pins, frames, tag, manifest, checks)
    if on_ordered:
        sql(f"""SET ROLE {WRITER};
CREATE FUNCTION public.trip_source_acquire_universal_original(a uuid,r text) RETURNS jsonb LANGUAGE sql
SECURITY DEFINER SET search_path=pg_catalog AS $$SELECT public.trip_source_acquire_source(a,r)$$;
CREATE FUNCTION public.trip_source_lookup_universal_original(a uuid,r text) RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE q jsonb:=public.trip_source_command_codec(r);
BEGIN RETURN public.trip_source_operation_lookup(a,(q->>'trip_id')::uuid,(q->>'source_id')::uuid,
 (q->>'operation_id')::uuid,q->>'operation_key',q->>'operation_sha256');END $$;
REVOKE ALL ON FUNCTION public.trip_source_acquire_universal_original(uuid,text),public.trip_source_lookup_universal_original(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trip_source_acquire_universal_original(uuid,text),public.trip_source_lookup_universal_original(uuid,text) TO {GATEWAY};""")
        on_ordered(dict(initial=manifest,commands=[f['command'] for f in frames]))
        assert sql('SELECT count(*) FROM trip_source_operations;')=='3'
        sql('DELETE FROM trip_source_operations;DELETE FROM trip_source_representations;DELETE FROM trip_sources;')
    install_run_writers()
    if on_material:
        qualify_material(pins, frames, tag, manifest, checks, on_material)
        return

    def reject(label, value=manifest, reason='UNIVERSAL_SOURCE_RUN_UNAVAILABLE', **keys):
        sql(find(value,**keys),GATEWAY,error=reason)
        checks.append(label)
    result = json.loads(sql(find(manifest),GATEWAY))
    assert result == dict(version='otr.import.mixed-b-pristine/1',initialManifestSha256=hashv(DOMAIN,manifest),firstCommandSha256=hashv('otr.import.mixed-b-first-acquire/1',frames[0]['command']))
    checks.append('exact active strict envelope yields typed proof with actual PG hash/command codec, no material input hash use')
    for label, scope_pins in [('no tag',frames),('duplicate exact tag',frames+[tag,tag]),('duplicate malformed tag',frames+[tag,{'mixedBInitial':None}]),('malformed digest',frames+[{'mixedBInitial':{'manifest':manifest,'sha256':'0'*64}}]),('tag with extra command',frames+[{**tag,'command':frames[0]['command']}]),('four ACQUIRE frames',frames+[frames[0],tag]),('misordered ACQUIRE frames',[frames[1],frames[0],frames[2],tag])]:
        set_pins(scope_pins)
        reject(label)
    set_pins(frames+[tag])
    for key in ['trip','batch','task','run_id']:
        reject('wrong '+key,**{key:OTHER})
    reject('wrong submission',submission='b'*64)
    altered = copy.deepcopy(manifest); altered['originals'][0]['inputId']=OTHER
    reject('caller input ID not protected',altered)
    altered = copy.deepcopy(manifest); altered['originals'][0]['operationSha256']='0'*64
    set_pins(frames+[tagged(altered)]);reject('protected pin mismatch with actual canonical command',altered)
    altered = copy.deepcopy(manifest); altered['originals'][0]['inputId']=pins[1]['inputId']
    set_pins(frames+[tagged(altered)]);reject('duplicate logical input ID even if protected tag matches',altered)
    set_pins(frames+[tag])
    sql(find(manifest),error='SOURCE_ACCESS_DENIED');checks.append('wrong DB session rejected')
    sql("UPDATE journey_members SET role='guest';")
    reject('current linked read-only Actor rejected',reason='SOURCE_ACCESS_DENIED')
    sql("UPDATE journey_members SET role='group_member';")
    sql("UPDATE journey_members SET status='revoked';")
    reject('revoked Actor rejected',reason='SOURCE_ACCESS_DENIED')
    sql("UPDATE journey_members SET status='linked';")
    sql('BEGIN ISOLATION LEVEL REPEATABLE READ;'+find(manifest),GATEWAY,error='UNIVERSAL_SOURCE_RUN_UNAVAILABLE')
    checks.append('REPEATABLE READ cannot reuse a stale pristine observation')
    for table in ['trip_sources','trip_source_representations','trip_source_runs','trip_source_operations','trip_source_execution_attempts']:
        sql(f'ALTER POLICY global_read ON {table} USING(false);')
        reject('filtered current-role RLS rejects '+table)
        sql(f'ALTER POLICY global_read ON {table} USING(true);')
    sql(f'CREATE POLICY restricted ON trip_source_operations AS RESTRICTIVE FOR SELECT TO {WRITER} USING(true);')
    reject('any restrictive policy on operations fails closed')
    sql('DROP POLICY restricted ON trip_source_operations;')
    pin = pins[0]
    sql('INSERT INTO trip_sources(id,trip_id,acquired_by,acquisition_key) VALUES('+','.join(lit(x) for x in [pin['sourceId'],OTHER,OTHER,'unrelated'])+');')
    reject('foreign Source ID collision')
    sql('DELETE FROM trip_sources;')
    sql('INSERT INTO trip_source_representations(id,source_id) VALUES('+lit(pin['originalRepresentationId'])+','+lit(OTHER)+');')
    reject('foreign original representation collision')
    sql('DELETE FROM trip_source_representations;')
    sql('INSERT INTO trip_source_operations(id,trip_id,actor_account_id,source_id,representation_id,operation_key,phase) VALUES('+','.join(lit(x) for x in [pin['operationId'],OTHER,OTHER,OTHER,OTHER,'foreign','IO_UNKNOWN'])+');')
    reject('global IO_UNKNOWN operation rejects pristine')
    sql("UPDATE trip_source_operations SET phase='FINAL';")
    reject('global FINAL receipt still rejects pristine')
    sql('DELETE FROM trip_source_operations;')
    sql('INSERT INTO trip_source_runs(id,actor_account_id,trip_id,interpretation_task_id) VALUES('+','.join(lit(x) for x in [OTHER,OTHER,OTHER,TASK])+');')
    reject('foreign Run Task collision')
    sql('DELETE FROM trip_source_runs;')
    with subprocess.Popen([DOCKER,*psql(GATEWAY)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True) as worker:
        worker.stdin.write('BEGIN;'+find(manifest)+'\n')
        worker.stdin.flush()
        assert json.loads(worker.stdout.readline()) == result
        sql("SET lock_timeout='200ms';SELECT pg_advisory_xact_lock(714024,2);",error='lock timeout')
        sql("SET lock_timeout='200ms';UPDATE journey_members SET status='revoked';",error='lock timeout')
        checks.append('owning PG transaction holds both exclusive close competitor and Actor revocation out')
        worker.stdin.write('COMMIT;\n'); worker.stdin.close()
        assert worker.wait(timeout=4)==0
    sql("UPDATE trip_source_universal_scope SET starts_at=clock_timestamp()-interval '2 minutes',expires_at=clock_timestamp()-interval '1 minute';")
    reject('expired exact scope denied')
    assert sql('SELECT (SELECT count(*) FROM trip_sources)+(SELECT count(*) FROM trip_source_representations)+(SELECT count(*) FROM trip_source_runs)+(SELECT count(*) FROM trip_source_operations)+(SELECT count(*) FROM trip_source_inputs);')=='0'
    checks.append('typed read created zero Source, operation, representation, Run or Input rows')
    qualify_material(pins, frames, tag, manifest, checks)
    txt = pins[2]
    original = dict(id=txt['inputId'],source_id=txt['sourceId'],material_revision=1,representation_id=txt['originalRepresentationId'],payload_sha256=txt['sha256'],byte_count=txt['byteCount'],observed_source_row_revision=1,historical_selection=False)
    plain = dict(profile='OTR_UTF8_TEXT_FILE_V1',actorId=ACTOR,tripId=TRIP,sourceId=txt['sourceId'],representationId=txt['originalRepresentationId'],operationId=txt['operationId'],operationKey=txt['operationKey'],operationSha256=txt['operationSha256'])
    order = ['id','source_id','material_revision','representation_id','payload_sha256','byte_count','observed_source_row_revision','historical_selection']
    expected = hashv('otr-source-run-input-v1',[1,[[original[key] for key in order]+[1,'ORIGINAL','TEXT',None,None,None,[]]]])
    sql("UPDATE trip_source_universal_scope SET input_sha256="+lit(expected)+",starts_at=clock_timestamp()-interval '1 second',expires_at=clock_timestamp()+interval '60 seconds';")
    set_pins([plain])
    assert sql(find([original]),GATEWAY)==''
    checks.append('existing single TXT initial route still returns Task/Run-absent NULL under flat protected pin')
    sid, rid, key = [lit(txt[x]) for x in ['sourceId','originalRepresentationId','operationKey']]
    sql('INSERT INTO trip_sources VALUES('+sid+','+lit(TRIP)+','+lit(ACTOR)+",'FILE','FILES',"+key+",'ACTIVE','RETAINED',1,1);")
    sql("INSERT INTO trip_source_representations(id,source_id,role,introduced_revision,material_kind,encoding,parent_ids,payload_sha256,byte_count,retention_state,remote_state) VALUES("+rid+","+sid+",'ORIGINAL',1,'TEXT','UTF-8','{}',"+lit(txt['sha256'])+","+str(txt['byteCount'])+",'RETAINED','NOT_APPLICABLE');")
    sql("INSERT INTO trip_source_revisions VALUES("+sid+",1,'RETAINED',ARRAY["+rid+"::uuid]);")
    assert sql(find([original]),GATEWAY)==''
    checks.append('existing TXT actual-material branch still accepts genuine visible local fixture rows')
    sql("INSERT INTO trip_source_runs(id,actor_account_id,trip_id,capture_batch_id,interpretation_task_id,capture_submission_sha256,extractor_key,state,retention_state,scope_source_ids,input_sha256,extractor_version,operation_key,extractor_options_sha256) VALUES("+','.join(lit(x) for x in [RUN,ACTOR,TRIP,BATCH,TASK,SUBMISSION])+",'otr-universal-interpretation-v1','PENDING','RETAINED',ARRAY["+sid+"::uuid],"+lit(expected)+",'1',"+lit('universal:'+BATCH)+","+lit(SUBMISSION)+");")
    sql("INSERT INTO trip_source_inputs SELECT id,source_id,material_revision,representation_id,payload_sha256,byte_count,observed_source_row_revision,historical_selection,"+lit(RUN)+"::uuid,NULL FROM jsonb_populate_record(NULL::public.trip_source_inputs,"+lit(canon(original))+");")
    sql("DELETE FROM trip_source_universal_scope;")
    assert json.loads(sql(find([original]),GATEWAY))['runId']==RUN
    checks.append('existing retained TXT Run still reads independently after positive scope removed')
    output = dict(state='LOCAL_MIXED_B_PRISTINE_AND_MATERIAL_PG_PASS',image=IMAGE,network='none',checks=checks,checkCount=len(checks),definitionSha256=hashlib.sha256(CANDIDATE.read_bytes()).hexdigest(),scope='Actual PG role/FORCE RLS, canonical Source codec, immutable receipt verifier, normalized and original scope hashes, actual Actor/Source/Run/close locks. PNG and sealed PDF facts are explicit controlled owning-proof doubles. All rows and receipts are synthetic fixtures. No real ACQUIRE, Hosted runtime, enrollment or business.')
    OUT.write_text(json.dumps(output,indent=2)+'\n')
    print(json.dumps({'state':output['state'],'checks':len(checks),'network':'none'}))


def main():
    assert run('context','inspect','--format','{{.Endpoints.docker.Host}}').stdout.strip().startswith('unix://')
    assert not os.environ.get('DOCKER_HOST') or os.environ['DOCKER_HOST'].startswith('unix://')
    created = False
    try:
        run('run','--pull=never','--rm','--network','none','--cpus','1','--memory','512m','--tmpfs','/var/lib/postgresql/data','--name',NAME,'-e','POSTGRES_HOST_AUTH_METHOD=trust','-d',IMAGE,'-c','shared_buffers=32MB','-c','max_connections=20')
        created = True
        for _ in range(60):
            if run('exec',NAME,'pg_isready','-h','127.0.0.1','-U','postgres',check=False).returncode==0:
                break
            time.sleep(.2)
        else:
            raise RuntimeError('LOCAL_PG_START_TIMEOUT')
        qualify([])
    finally:
        if created:
            run('rm','-f',NAME,check=False)


if __name__ == '__main__':
    main()
