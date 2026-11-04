"""Use the accepted offline Source image and actual codec/hash, never Hosted."""
from pathlib import Path
import json
import hashlib
import re
import os
import subprocess
import time
import uuid
import sys
from build_finite_native_proof_candidate import PINS,changes,build

root = Path(__file__).resolve().parents[2]
image = 'sha256:8b7c01e4b163b04bfd939652e69ae677e36315abd111bd4a36949658f73b5068'
name = 'otr-core-v2-test-' + uuid.uuid4().hex[:12]
def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=60, **kwargs)
def sql(body):
    return run(['docker','exec','-i',name,'psql','-XqAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],input=body)
def close_lock_proof():
    # Exercise the real helper as Gateway -> SourceWriter, with SELECT-only scope.
    sql("UPDATE public.trip_source_universal_scope SET expires_at=clock_timestamp()+interval '10 minutes'")
    q=sql("SELECT (source_command_pins->0->'command')::text FROM public.trip_source_universal_scope").stdout.strip()
    admit="SET SESSION AUTHORIZATION otr_trip_source_command_gateway; SELECT public.qa_finite_command('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',$q$"+q+"$q$);"
    for mode in ['ShareLock','ExclusiveLock']:
        body='BEGIN; '+(admit if mode=='ShareLock' else "SELECT pg_advisory_xact_lock(714024,2); UPDATE public.trip_source_universal_scope SET expires_at=clock_timestamp()-interval '1 second';")+' SELECT pg_sleep(2); COMMIT;'
        holder=subprocess.Popen(['docker','exec','-i',name,'psql','-XqAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        try:
            holder.stdin.write(body);holder.stdin.close();holder.stdin=None
            for _ in range(40):
                if sql("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND classid=714024 AND objid=2 AND objsubid=2 AND mode='"+mode+"' AND granted").stdout.strip()=='1':break
                if holder.poll() is not None:raise RuntimeError('CLOSE_LOCK_HOLDER_EXITED')
                time.sleep(.025)
            else:raise RuntimeError('CLOSE_LOCK_NOT_OBSERVED')
            contender="BEGIN; SET LOCAL lock_timeout='150ms'; "+("SELECT pg_advisory_xact_lock(714024,2);" if mode=='ShareLock' else admit)+" COMMIT;"
            try:sql(contender)
            except subprocess.CalledProcessError as error:
                if 'lock timeout' not in error.stderr:raise
            else:raise RuntimeError('CLOSE_LOCK_BYPASSED_'+mode)
        finally:
            out,err=holder.communicate(timeout=10)
            if holder.returncode:raise RuntimeError('CLOSE_LOCK_HOLDER_FAILED: '+err)
    if sql(admit).stdout.strip()!='f':raise RuntimeError('POST_CLOSE_COMMAND_ALLOWED')
    return 'actual SELECT-only helper shared lock blocks exclusive close; exclusive close blocks admission; post-close command denied'
if os.environ.get('DOCKER_HOST') and not os.environ['DOCKER_HOST'].startswith('unix://'):
    raise RuntimeError('LOCAL_DOCKER_REQUIRED')
if not run(['docker','context','inspect','--format','{{.Endpoints.docker.Host}}']).stdout.strip().startswith('unix://'):
    raise RuntimeError('LOCAL_DOCKER_REQUIRED')
def pdf_negative_fixture(private, directory):
    # Exact current columns/CHECKs/triggers for this UPDATE-only path. FK/index
    # installation and physical upload are outside this isolated proof.
    schema_file=directory/'PDF_EXECUTION_STAGE_COLUMNS_TRIGGERS_METADATA.json'
    checks_file=directory/'CURRENT_SOURCE_PROOF_TABLE_BOUNDARIES.json'
    for path,digest in [(schema_file,'567a0b615ac69af6153cc4efc569bcf3fc69e17e55f306bd176203a54f3698ac'),(checks_file,'147364eecc21ecddb5a91308b25ff2c5861bfc3636c0d9ada8238170b5fa7833')]:
        if hashlib.sha256(path.read_bytes()).hexdigest()!=digest:raise RuntimeError('PDF_NEGATIVE_SCHEMA_PREIMAGE_REJECTED')
    schema=json.loads(schema_file.read_text());observed=json.loads(checks_file.read_text())
    allowed={'trip_source_execution_attempts','trip_source_staged_resources'}
    for c in schema['columns']:
        if c['table'] not in allowed or not re.fullmatch('[a-z][a-z_0-9]*',c['column']):raise RuntimeError('PDF_NEGATIVE_COLUMN_REJECTED')
        if c['type'] not in ['uuid','bigint','name','text','boolean','jsonb','timestamp with time zone']:raise RuntimeError('PDF_NEGATIVE_TYPE_REJECTED')
        present=sql("SELECT count(*) FROM pg_attribute WHERE attrelid='public."+c['table']+"'::regclass AND attname='"+c['column']+"' AND NOT attisdropped").stdout.strip()
        if present=='0':
            if c['notNull'] or c['default'] is not None:raise RuntimeError('PDF_NEGATIVE_REQUIRED_COLUMN_NOT_REPRODUCED')
            sql('ALTER TABLE public.'+c['table']+' ADD COLUMN '+c['column']+' '+c['type'])
    for t in observed['tables']:
        if t['table'] not in allowed:continue
        table=t['table']
        sql("DO $$ DECLARE c record;BEGIN FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public."+table+"'::regclass AND contype='c' LOOP EXECUTE format('ALTER TABLE public."+table+" DROP CONSTRAINT %I',c.conname);END LOOP;END $$;")
        for c in t['checks']:
            if not re.fullmatch('[a-z_0-9]+',c['name']) or not c['definition'].startswith('CHECK '):raise RuntimeError('PDF_NEGATIVE_CHECK_REJECTED')
            sql('ALTER TABLE public.'+table+' ADD CONSTRAINT '+c['name']+' '+c['definition'])
    records=list(schema['functions'])
    for filename,ids in [('PDF_COMMAND_FRAME_METADATA.json',['58700','65868']),('SOURCE_MUTATION_RUN_GUARDS_METADATA.json',['65992']),('PDF_V4_OPERATION_GATE_METADATA.json',['66009']),('PDF_V4_RECOVERY_FUNCTIONS_METADATA.json',['66013','66020','66060','66062','66064']),('PDF_V4_EXECUTION_FUNCTIONS_METADATA.json',['66014'])]:
        rows=json.loads((directory/filename).read_text())['functions']
        records.extend(f for f in rows if str(f['oid']) in ids)
    # Actual legacy scope stays CLOSED. These are only its referenced config
    # columns; no legacy config/schema acceptance or enabling row is claimed.
    ddl=(root/'supabase/migrations/20261013000100_source_pdf_upload_authority.sql').read_text()
    sql(re.search(r'create table public.trip_source_pdf_upload_config \(.*?\n\);',ddl,re.S)[0])
    sql("ALTER TABLE public.trip_source_pdf_upload_config ADD COLUMN v4_enabled boolean NOT NULL DEFAULT false, ADD COLUMN v4_not_before timestamptz, ADD COLUMN v4_expires_at timestamptz, ADD COLUMN v4_capture_binding jsonb, ADD COLUMN v4_acquisition jsonb; INSERT INTO public.trip_source_pdf_upload_config(singleton) VALUES(true); REVOKE ALL ON public.trip_source_pdf_upload_config FROM PUBLIC; GRANT SELECT ON public.trip_source_pdf_upload_config TO otr_trip_source_writer,otr_trip_source_execution_writer;")
    for f in records:
        definition=(private/f"function-{f['oid']}.private.sql").read_text()
        if hashlib.sha256(definition.encode()).hexdigest()!=f['definitionSHA256']:raise RuntimeError('PDF_NEGATIVE_FUNCTION_SHA_REJECTED')
        if str(f['oid']) in ['58700','66013','66014']:
            for old,new in changes(str(f['oid']),definition):
                if definition.count(old)!=1:raise RuntimeError('PDF_NEGATIVE_PATCH_COUNT_REJECTED')
                definition=definition.replace(old,new)
        signature='public.'+f['name']+'('+f['args']+')'
        sql(definition+'; ALTER FUNCTION '+signature+' OWNER TO '+f['owner']+'; REVOKE ALL ON FUNCTION '+signature+' FROM PUBLIC,otr_trip_source_command_gateway,otr_trip_source_writer,otr_trip_source_execution_writer,postgres;')
        for acl in f['acl']:
            grantee=acl.split('=')[0]
            if grantee not in ['postgres','otr_trip_source_writer','otr_trip_source_execution_writer','otr_trip_source_command_gateway'] or acl.split('=')[1].split('/')[0]!='X':raise RuntimeError('PDF_NEGATIVE_FUNCTION_ACL_REJECTED')
            sql('GRANT EXECUTE ON FUNCTION '+signature+' TO '+grantee)
    for t in schema['triggers']:
        if t['table'] not in allowed or t['enabled']!='O':raise RuntimeError('PDF_NEGATIVE_TRIGGER_REJECTED')
        events=' OR '.join(event for bit,event in [(4,'INSERT'),(8,'DELETE'),(16,'UPDATE'),(32,'TRUNCATE')] if t['type']&bit)
        sql('DROP TRIGGER IF EXISTS '+t['name']+' ON public.'+t['table']+'; CREATE TRIGGER '+t['name']+' BEFORE '+events+' ON public.'+t['table']+' FOR EACH '+('ROW' if t['type']&1 else 'STATEMENT')+' EXECUTE FUNCTION public.'+t['functionName']+'();')
    fixture_sql=(root/'backend/src/__fixtures__/finiteNativeOwningPdfUnknownAssertions.sql').read_text()
    if '--pdf-starting' in sys.argv:
        old="1,'RUNNING','RUNNING',b,node,clock_timestamp());"
        if fixture_sql.count(old)!=1:raise RuntimeError('PDF_STARTING_FIXTURE_PREIMAGE_REJECTED')
        fixture_sql=fixture_sql.replace(old,"1,'STARTING','REGISTER',b,NULL,NULL);")
    return sql(fixture_sql)

created = False
try:
    run(['docker','run','--pull=never','--rm','--name',name,'--network','none','-d',image]);created=True
    for _ in range(100):
        q=subprocess.run(['docker','exec',name,'pg_isready','-h','127.0.0.1','-U','supabase_admin'],capture_output=True)
        if q.returncode==0:break
        time.sleep(.2)
    else:raise RuntimeError('LOCAL_PG_START_TIMEOUT')
    proof = '--proof' in sys.argv
    if proof:
        for migration in sorted((root/'supabase/migrations').glob('20261011000*.sql')):
            sql(migration.read_text())
    # Existing accepted Source owning tables, codec, canonical digest, constraints and RLS.
    for filename in ['universal_source_host_candidate.sql','universal_original_source_candidate.sql']:
        sql((root/'backend/sql'/filename).read_text())
    if proof:
        sql((root/'supabase/migrations/20261012000200_source_pdf_derivative_authority.sql').read_text())
        sql((root/'supabase/migrations/20261012000300_source_pdf_registration.sql').read_text())
        sql((root/'docs/ops/source-pdf-v2-linux-20261017/registration-authority-candidate.sql').read_text())
    sql("GRANT CREATE ON SCHEMA public TO otr_trip_source_writer; GRANT otr_trip_source_writer TO supabase_admin WITH SET TRUE;")
    for filename in ['universal_finite_native_helpers_candidate.sql','universal_finite_native_commands_candidate.sql']:
        sql('BEGIN; SET LOCAL ROLE otr_trip_source_writer;\n'+(root/'backend/sql'/filename).read_text()+'\nCOMMIT;')
    result=sql((root/'backend/src/__fixtures__/finiteNativeOwningCommandAssertions.sql').read_text())
    result.stdout+='\n'+close_lock_proof()+'\n'
    if proof:
        private=root.parent/'root2-hosted-ops-acceptance-20261103/.root2-private/import-source-preimages-20261104'
        # Empty closed dependencies for the untouched legacy predicate's SQL parse.
        policy=(root/'supabase/dev-forward/trip-sustained-sync/20261024000200_trip_sustained_dev.sql').read_text()
        sql(re.search(r'CREATE TABLE public.trip_sustained_dev_policy \(.*?\n\);',policy,re.S)[0])
        sql("ALTER TABLE public.trip_sustained_dev_policy ADD COLUMN universal_import_enabled boolean NOT NULL DEFAULT false, ADD COLUMN universal_png_import_enabled boolean NOT NULL DEFAULT false, ADD COLUMN universal_png_import_expires_at timestamptz;")
        receipt=(root/'supabase/migrations/20261013000500_trip_create_owning_port.sql').read_text()
        sql(re.search(r'create table public.trip_create_receipts \(.*?\n\);',receipt,re.S)[0])
        # Actual current closed sustained predicate, never a true/false test double.
        sql((private/'function-66385.private.sql').read_text()+";\nALTER FUNCTION public.trip_sustained_universal_allowed(uuid,uuid) OWNER TO postgres;")
        sql((private/'function-66868.private.sql').read_text()+";\nALTER FUNCTION public.trip_sustained_universal_pdf_allowed(uuid,uuid) OWNER TO postgres;")
        sql((private/'function-67144.private.sql').read_text()+";\nALTER FUNCTION public.trip_sustained_universal_png_allowed(uuid,uuid) OWNER TO postgres;")
        sql('GRANT SELECT ON public.trip_source_pdf_seals TO otr_trip_source_writer; CREATE POLICY source_v4_seal_read ON public.trip_source_pdf_seals FOR SELECT TO otr_trip_source_writer USING(true);')
        sql('BEGIN; SET LOCAL ROLE otr_trip_source_writer;\n'+(root/'backend/sql/universal_finite_native_pdf_scope_candidate.sql').read_text()+'\nCOMMIT;')
        # Both enter overloads exist during installation: the generated patch
        # must target the pinned three-argument port, leaving the new frame intact.
        original_enter=(private/'function-66871.private.sql').read_text()
        sql('SET ROLE otr_trip_source_writer;\n'+original_enter)
        four="SELECT md5(prosrc) FROM pg_proc WHERE oid='public.trip_source_universal_pdf_enter(uuid,uuid,uuid,jsonb)'::regprocedure"
        prior_four=sql(four).stdout
        patch=[p for p in re.findall(r'DO \$patch\$.*?END \$patch\$;',build(private),re.S) if 'FINITE_PROOF_PREIMAGE_66871' in p]
        if len(patch)!=1:raise RuntimeError('OVERLOADED_ENTER_PATCH_MISSING')
        sql('SET ROLE otr_trip_source_writer;\n'+patch[0])
        if sql(four).stdout!=prior_four:raise RuntimeError('FRAME_OVERLOAD_CHANGED_BY_PATCH')
        result.stdout+='\nACTUAL_GENERATED_THREE_ARGUMENT_ENTER_PATCH_WITH_FOUR_ARGUMENT_OVERLOAD_PASS\n'
        for oid in ['66870','66871','66872','67145','67150','67156']:
            definition=(private/f'function-{oid}.private.sql').read_text()
            if hashlib.sha256(definition.encode()).hexdigest()!=PINS[oid]:raise RuntimeError('ACTUAL_PROOF_PREIMAGE_REJECTED')
            for old,new in changes(oid,definition):
                if definition.count(old)!=1:raise RuntimeError('ACTUAL_PROOF_PATCH_COUNT_REJECTED')
                definition=definition.replace(old,new)
            if oid=='67156':
                sql(definition+';\nALTER FUNCTION public.trip_source_png_execution(uuid,text,text,jsonb,jsonb) OWNER TO otr_trip_source_execution_writer; REVOKE ALL ON FUNCTION public.trip_source_png_execution(uuid,text,text,jsonb,jsonb) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.trip_source_png_execution(uuid,text,text,jsonb,jsonb) TO otr_trip_source_writer;')
            else:sql('SET ROLE otr_trip_source_writer;\n'+definition)
        sql('BEGIN; SET LOCAL ROLE otr_trip_source_writer;\n'+(root/'backend/sql/universal_finite_native_routes_candidate.sql').read_text()+'\nCOMMIT;')
        proof_result=sql((root/'backend/src/__fixtures__/finiteNativeOwningPdfAssertions.sql').read_text()+'\n'+(root/'backend/src/__fixtures__/finiteNativeOwningPdfFrameAssertions.sql').read_text())
        result.stdout+='\n'+proof_result.stdout
        result.stderr+='\n'+proof_result.stderr
        # Reproduce the observed current PNG profile branch, keeping all existing
        # non-PDF identity/phase/terminal constraints. No Hosted constraint change.
        sql("ALTER TABLE public.trip_source_execution_attempts DROP CONSTRAINT trip_source_execution_attempts_profile_sha256_check; ALTER TABLE public.trip_source_execution_attempts ADD CONSTRAINT trip_source_execution_attempts_profile_sha256_check CHECK(profile_sha256 IN ('526b66b7bd63daeed309c3d2630cdeaec759a6031a9efe7ade381c06fd04ede5','0e22d87a595129dbd9a3b2b00a771379f0e26d15d7a46781c76c7c08ed65a726')); GRANT SELECT ON public.trip_source_execution_attempts,public.trip_source_staged_resources TO otr_trip_source_writer; CREATE POLICY source_pdf_execution_read ON public.trip_source_execution_attempts FOR SELECT TO otr_trip_source_writer USING(true); CREATE POLICY source_pdf_stage_read ON public.trip_source_staged_resources FOR SELECT TO otr_trip_source_writer USING(true);")
        png_result=sql((root/'backend/src/__fixtures__/finiteNativeOwningPngAssertions.sql').read_text()+'\nRESET SESSION AUTHORIZATION;\n'+(root/'backend/src/__fixtures__/finiteNativeOwningPngCloseAssertions.sql').read_text())
        result.stdout+='\n'+png_result.stdout
        result.stderr+='\n'+png_result.stderr
        # Real owning Run/Input writer and mixed reader, with current finite guard seam.
        for oid in ['66232','66234','66035']:
            definition=(private/f'function-{oid}.private.sql').read_text()
            if hashlib.sha256(definition.encode()).hexdigest()!=PINS[oid]:raise RuntimeError('ACTUAL_RUN_PREIMAGE_REJECTED')
            for old,new in changes(oid,definition):
                if definition.count(old)!=1:raise RuntimeError('ACTUAL_RUN_PATCH_COUNT_REJECTED')
                definition=definition.replace(old,new)
            sql('SET ROLE otr_trip_source_writer;\n'+definition)
        sql((private/'function-58507.private.sql').read_text())
        mixed_result=sql((root/'backend/src/__fixtures__/finiteNativeOwningMixedAssertions.sql').read_text())
        result.stdout+='\n'+mixed_result.stdout
        result.stderr+='\n'+mixed_result.stderr
        for oid,digest in {
            '58617':'8cf692ec083d1bef3ce2c657f22c631c36fdb37dafeec42c617d0c03c55f71ea',
            '67155':'734cbf5beda57dec97470aafcf196acf760460d5b952299e75f6f74c529aa199',
            '58612':'35593132ce38a3275bf0081ed873859e6bd96e52007158b74703507d6719c9a4',
            '58702':'10e64b3243b6dc9f32098d011015bee7df1e435407a4a8df66210ddba5c2bf1c',
        }.items():
            definition=(private/f'function-{oid}.private.sql').read_text()
            if hashlib.sha256(definition.encode()).hexdigest()!=digest:raise RuntimeError('ACTUAL_SOURCE_REFERENCE_PREIMAGE_REJECTED')
            sql(('RESET ROLE;\n' if oid in ['58617','58702'] else 'SET ROLE otr_trip_source_writer;\n')+definition)
        for oid in ['66243','66255','66263','58768','58229','58756']:
            definition=(private/f'function-{oid}.private.sql').read_text()
            if hashlib.sha256(definition.encode()).hexdigest()!=PINS[oid]:raise RuntimeError('ACTUAL_SOURCE_DML_PREIMAGE_REJECTED')
            for old,new in changes(oid,definition):
                if definition.count(old)!=1:raise RuntimeError('ACTUAL_SOURCE_DML_PATCH_COUNT_REJECTED')
                definition=definition.replace(old,new)
            sql(('RESET ROLE;\n' if oid in ['58229','58756','58768'] else 'SET ROLE otr_trip_source_writer;\n')+definition)
        # Reproduce the three observed current V4 INSERT policies missing from
        # the cached image; no Hosted policy change and no invented test grant.
        metadata=root.parent/'root2-hosted-ops-acceptance-20261103/docs/handoffs/ROOT2_HOSTED_OPS_V4/requests/IMP-C01-HOST-RESTORE-20261104-03/SOURCE_FIVE_TABLE_SECURITY_METADATA.json'
        if hashlib.sha256(metadata.read_bytes()).hexdigest()!='6daa82fcfabea840c16698a1c1f34c1a7d63bc7da62eb507a791bc986131d331':raise RuntimeError('CURRENT_SOURCE_SECURITY_METADATA_SHA_REJECTED')
        security=json.loads(metadata.read_text())
        for table,policy in [('trip_sources','source_v4_root_insert'),('trip_source_revisions','source_v4_revision_insert'),('trip_source_actions','source_v4_action_insert')]:
            row=[p for p in security['policies'] if p['table']==table and p['name']==policy]
            if len(row)!=1 or row[0]['command']!='a' or row[0]['roles']!=['otr_trip_source_writer'] or row[0]['withCheck']!='true' or row[0]['qual'] is not None or row[0]['permissive'] is not True:raise RuntimeError('CURRENT_SOURCE_INSERT_POLICY_PREIMAGE_REJECTED')
            sql('CREATE POLICY '+policy+' ON public.'+table+' FOR INSERT TO otr_trip_source_writer WITH CHECK(true);')
        acquire_result=sql((root/'backend/src/__fixtures__/finiteNativeOwningAcquireAssertions.sql').read_text())
        result.stdout+='\n'+acquire_result.stdout
        result.stderr+='\n'+acquire_result.stderr
        negative_result=pdf_negative_fixture(private,metadata.parent)
        result.stdout+='\n'+negative_result.stdout
        result.stderr+='\n'+negative_result.stderr
        if '--native-manifest' in sys.argv:
            native_file=Path(sys.argv[sys.argv.index('--native-manifest')+1])
            native=json.loads(native_file.read_text())['sourcePins']
            if len(native['inputs'])!=3 or any(i['sourceState']!='PREPARED' or i['bindingCas']['captureRevision']!=i['currentCaptureRevision'] for i in native['inputs']):raise RuntimeError('NATIVE_PROPOSALS_NOT_FROZEN')
            for i in native['inputs']:
                q=i['sourceCommand'];raw=json.dumps(q,ensure_ascii=False,separators=(',',':'))
                if '$native$' in raw:raise RuntimeError('NATIVE_CODEC_DELIMITER_REJECTED')
                if q['actor_account_id']!=native['accountId'] or q['trip_id']!=native['tripId'] or q['operation_id']!=i['sourceCommandPin']['operationId'] or q['payload']['original']['payload_sha256']!=i['sha256'] or q['payload']['original']['byte_count']!=i['byteCount']:raise RuntimeError('NATIVE_COMMAND_BINDING_CHANGED')
                if sql('SELECT public.trip_source_command_codec($native$'+raw+'$native$)=$native$'+raw+'$native$::jsonb').stdout.strip()!='t':raise RuntimeError('ACTUAL_NATIVE_SOURCE_CODEC_CHANGED')
            result.stdout+='\nACTUAL_QA150_THREE_NATIVE_COMMAND_CODEC_HASH_BINDING_PASS; immutable validation only, no Actor grant/Source write; manifestSHA256='+hashlib.sha256(native_file.read_bytes()).hexdigest()+'\n'
        if '--native-plan' in sys.argv:
            plan_file=Path(sys.argv[sys.argv.index('--native-plan')+1]);plan=json.loads(plan_file.read_text())
            frames=plan['sourceCommandPins'];commands=[f['command'] for f in frames if 'command' in f]
            if len(frames)!=11 or len(commands)!=9 or len({q['operation_id'] for q in commands})!=9:raise RuntimeError('NATIVE_FUTURE_PLAN_ROSTER_REJECTED')
            for q in commands:
                raw=json.dumps(q,ensure_ascii=False,separators=(',',':'))
                if '$planned$' in raw:raise RuntimeError('NATIVE_PLAN_DELIMITER_REJECTED')
                if sql('SELECT public.trip_source_command_codec($planned$'+raw+'$planned$)=$planned$'+raw+'$planned$::jsonb').stdout.strip()!='t':raise RuntimeError('ACTUAL_FUTURE_COMMAND_CODEC_REJECTED')
            result.stdout+='\nACTUAL_NINE_NATIVE_FUTURE_COMMAND_CODEC_HASH_PASS; projected fresh1/1/1 only, no actual Source receipt or permission; planSHA256='+hashlib.sha256(plan_file.read_bytes()).hexdigest()+'\n'
    directory=root.parent/'lane-c-private-artifacts-20261104/pg-reports'/name;directory.mkdir(parents=True)
    (directory/'result.txt').write_text(result.stdout+'\n'+result.stderr)
    print(json.dumps({'status':'ACTUAL_SOURCE_CODEC_HASH_COMMAND_SCOPE_PG_PASS','image':image,'report':str(directory/'result.txt'),'scope':'Actual three-format Source ACQUIRE/journal/receipt/replay/readback, Source codec/hash, PDF exact frame and seeded seal/VERIFY receipt, PNG proof/close, mixed Run/Input writer/reader, finite close concurrency' if proof else 'Source command finite admission and close concurrency only','limits':'Seeded proof records, selected current schema branches; no physical worker, full current PDF V4 schema, Hosted or Native E2E','network':'none','providerCalls':0}))
except subprocess.CalledProcessError as error:
    print(error.stderr[-5000:]);raise
finally:
    if created:subprocess.run(['docker','stop','--time','2',name],capture_output=True)
