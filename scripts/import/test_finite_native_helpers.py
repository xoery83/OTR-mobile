from pathlib import Path
import subprocess,json,time,uuid,os
if os.environ.get("DOCKER_HOST") and not os.environ["DOCKER_HOST"].startswith("unix://"):
 raise RuntimeError("LOCAL_DOCKER_REQUIRED")
endpoint=subprocess.check_output(["docker","context","inspect","--format","{{.Endpoints.docker.Host}}"],text=True).strip()
if not endpoint.startswith("unix://"): raise RuntimeError("LOCAL_DOCKER_REQUIRED")
name='otr-lane-c-finite-'+uuid.uuid4().hex[:12]
image='sha256:6942962433a569e87f228b4d4ab7e11db5deca64e43babb3a038443ad6c4f1bb'
def run(args,**kw): return subprocess.run(args,check=True,capture_output=True,text=True,**kw)
try:
 run(['docker','run','--pull=never','--rm','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_PASSWORD=local-synthetic-fixture-only',image])
 for i in range(60):
  q=subprocess.run(['docker','exec',name,'pg_isready','-h','127.0.0.1','-U','postgres'],capture_output=True)
  if q.returncode==0:break
  time.sleep(.25)
 else:raise RuntimeError('LOCAL_PG_START_TIMEOUT')
 root=Path(__file__).resolve().parents[2]
 bootstrap=(root/'backend/src/__fixtures__/finiteNativeHelperBootstrap.sql').read_text()
 helpers=(root/'backend/sql/universal_finite_native_helpers_candidate.sql').read_text()
 tests=(root/'backend/src/__fixtures__/finiteNativeHelperAssertions.sql').read_text()
 result=run(['docker','exec','-i',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1'],input=bootstrap+'\nBEGIN;\n'+helpers+'\nCOMMIT;')
 result=run(['docker','exec','-i','-e','PGPASSWORD=local-source-synthetic-only',name,'psql','-h','127.0.0.1','-U','otr_trip_source_command_gateway','-d','postgres','-v','ON_ERROR_STOP=1'],input=tests)
 routes=(root/'backend/sql/universal_finite_native_routes_candidate.sql').read_text()
 run(['docker','exec','-i',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1'],input='BEGIN; SET LOCAL ROLE otr_trip_source_writer;\n'+routes+'\nCOMMIT;')
 route_tests=(root/'backend/src/__fixtures__/finiteNativeRouteAssertions.sql').read_text()
 route_result=run(['docker','exec','-i','-e','PGPASSWORD=local-source-synthetic-only',name,'psql','-h','127.0.0.1','-U','otr_trip_source_command_gateway','-d','postgres','-v','ON_ERROR_STOP=1'],input=route_tests)
 run(['docker','exec','-i',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1'],input='SET ROLE otr_trip_source_writer; DROP FUNCTION public.trip_source_finite_native_run_row(text,text,jsonb); DROP FUNCTION public.trip_source_finite_native_png_material(uuid,uuid,uuid,uuid,bigint); DROP FUNCTION public.trip_source_finite_native_material(uuid,uuid,public.trip_source_inputs,boolean); DROP FUNCTION public.trip_source_begin_finite_universal_inputs(uuid,uuid,text); DROP FUNCTION public.trip_source_find_finite_universal_binding(uuid,uuid,uuid,uuid,uuid,text,jsonb);')
 # RLS fault injection: filtered global Run queries may not authorize ABSENT.
 rls="INSERT INTO public.trip_source_universal_scope SELECT true,actor_account_id,trip_id,capture_batch_id,interpretation_task_id,id,capture_submission_sha256,input_sha256,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '10 minutes' FROM public.trip_source_runs; GRANT SELECT ON public.trip_source_runs TO otr_trip_source_writer; ALTER TABLE public.trip_source_runs OWNER TO postgres; ALTER TABLE public.trip_source_runs ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_hidden ON public.trip_source_runs FOR SELECT TO otr_trip_source_writer USING (false);"
 run(['docker','exec','-i',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1'],input=rls)
 rls_test="SET ROLE otr_trip_source_writer; DO $$ BEGIN IF NOT row_security_active('public.trip_source_runs'::regclass) THEN RAISE EXCEPTION 'RLS_FIXTURE_INACTIVE';END IF; IF public.trip_source_finite_native_identity('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000005') THEN RAISE EXCEPTION 'FILTERED_RUN_TREATED_AS_ABSENT';END IF;END $$;"
 run(['docker','exec','-i','-e','PGPASSWORD=local-source-synthetic-only',name,'psql','-h','127.0.0.1','-U','otr_trip_source_command_gateway','-d','postgres','-v','ON_ERROR_STOP=1'],input=rls_test)
 # Fault injection: an unrelated default EXEC grantee must reject all new functions.
 reset="SET ROLE otr_trip_source_writer; DROP FUNCTION public.trip_source_finite_native_retained_pin(uuid,uuid,public.trip_source_inputs); DROP FUNCTION public.trip_source_finite_native_normalized_scope(uuid,uuid,uuid,uuid,uuid,text,jsonb); DROP FUNCTION public.trip_source_finite_native_original_scope(uuid,uuid,uuid,uuid,uuid,text,jsonb); DROP FUNCTION public.trip_source_finite_native_identity(uuid,uuid,uuid); RESET ROLE; CREATE ROLE qa_unexpected_grantee; SET ROLE otr_trip_source_writer; ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO qa_unexpected_grantee;"
 run(['docker','exec','-i',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1'],input=reset)
 rejected=subprocess.run(['docker','exec','-i',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1'],input='BEGIN; SET LOCAL ROLE otr_trip_source_writer;\n'+helpers+'\nCOMMIT;',capture_output=True,text=True)
 if rejected.returncode==0 or 'SOURCE_FINITE_HELPER_ACL_REJECTED' not in rejected.stderr: raise RuntimeError('DEFAULT_ACL_FAIL_CLOSED_TEST_FAILED')
 remaining=run(['docker','exec',name,'psql','-U','postgres','-Atc',"SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'trip_source_finite_native_%'"]).stdout.strip()
 if remaining!='0': raise RuntimeError('INSTALL_TRANSACTION_NOT_ROLLED_BACK')
 report=Path('/private/tmp')/name;report.mkdir();(report/'result.txt').write_text(result.stdout+'\n'+route_result.stdout+'\n'+route_result.stderr)
 print(json.dumps({'status':'SCOPED_HELPER_PG_PASS_WITH_DEFAULT_ACL_ROLLBACK','fixture':'Synthetic tables and explicit proof/hash test doubles, NOT full owning proof E2E','container':name,'network':'none','report':str(report/'result.txt'),'outputTail':result.stdout[-1600:]}))
except subprocess.CalledProcessError as e:
 print(e.stderr[-4000:]);raise
finally:
 subprocess.run(['docker','stop','--time','2',name],capture_output=True)
