from pathlib import Path
import subprocess,json,re
p=Path(__file__).parent
cid='6ed159e58bbbf0fd2fa6fece68275a888646af1999ce7df46dfdb42035586ec2'
cmd=['docker','exec','-i',cid,'psql','-XqAt','-h','/tmp','-U','postgres','-d','photo_png_qualified_6c2fe499','-v','ON_ERROR_STOP=1']
A='f4b059c5-8241-4ffb-aa15-37fa25474543';T='825f79b2-4a9d-4535-a62e-43000ca50c4a'
setup=f"""BEGIN;
UPDATE public.trip_sustained_dev_policy SET enabled=true,revoked_at=null,universal_import_enabled=true,universal_png_import_enabled=true,universal_png_import_expires_at=clock_timestamp()+interval '30 minutes',adoption_cutoff='2026-10-29T00:00:00Z' WHERE actor_account_id='{A}';
UPDATE public.trip_source_runs SET operation_key='universal:'||capture_batch_id::text,extractor_options_sha256=capture_submission_sha256,scope_sha256=public.trip_source_hash('otr-source-run-scope-v1',jsonb_build_array(1,trip_id,actor_account_id,to_jsonb(scope_source_ids)));
"""
# Local temporary function executes the unchanged production body under its real
# invoker (SourceWriter), called through a test-only SECURITY DEFINER wrapper.
# No fixture table/column or persistent function is created; one transaction rolls back.
def test(name,version,mutation='',expected='PASS',pinpatch=''):
 s=(p/f'{version}.sql').read_text()
 s=s.replace('public.trip_source_sustained_run_row(tab text, op text, n jsonb)','pg_temp.photo_run_pin_body(tab text, op text, n jsonb)',1)
 s=s.replace(' LANGUAGE plpgsql\n',' LANGUAGE plpgsql\n SECURITY DEFINER\n',1)
 s=s.replace('public.trip_source_universal_pdf_material(', 'pg_temp.pdf_png_only(')
 prefix="CREATE FUNCTION pg_temp.pdf_png_only(actor uuid, trip uuid, pin public.trip_source_inputs, normal boolean, writing boolean) RETURNS jsonb LANGUAGE plpgsql AS $pdf$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.trip_source_representations WHERE id=pin.representation_id AND source_id=pin.source_id AND role='ORIGINAL' AND material_kind='BINARY' AND mime_type='image/png') THEN RAISE EXCEPTION 'FIXTURE_NON_PNG_UNSUPPORTED';END IF;RETURN null;END $pdf$;"+s+";ALTER FUNCTION pg_temp.photo_run_pin_body(text,text,jsonb) OWNER TO otr_trip_source_writer;"
 raw="(SELECT to_jsonb(x) FROM public.trip_source_inputs x WHERE id='10000000-0000-4000-8000-000000000013')"
 if pinpatch:raw="("+raw+"||'"+json.dumps(pinpatch)+"'::jsonb)"
 # Read the existing local row before changing session; no privilege elevation in DEV.
 q=setup+mutation+prefix+"SELECT "+raw+" AS pin \\gset\nSET SESSION AUTHORIZATION otr_trip_source_command_gateway;SELECT pg_temp.photo_run_pin_body('trip_source_inputs','INSERT', :'pin'::jsonb);ROLLBACK;"
 r=subprocess.run(cmd,input=q,text=True,capture_output=True,timeout=20)
 good=(r.returncode==0 and r.stdout.strip().splitlines()[-1]=='t') if expected=='PASS' else r.returncode!=0 and expected in r.stderr
 result={'name':name,'passed':good,'expected':expected,'returncode':r.returncode,'error':re.search(r'ERROR:\s*([^\n]+)',r.stderr).group(1) if 'ERROR:' in r.stderr else None}
 print(json.dumps(result))
 if not good:(p/'test-failure.private.log').write_text(r.stderr);raise SystemExit(1)
 return result
checks=[]
checks.append(test('actual_before_rejects_verified_PNG','before',expected='INPUT_STALE'))
checks.append(test('minimal_after_accepts_verified_PNG','after'))
checks.append(test('PNG_closed_rejects','after',mutation='UPDATE public.trip_sustained_dev_policy SET universal_png_import_enabled=false,universal_png_import_expires_at=null;',expected='INPUT_STALE'))
checks.append(test('PNG_expired_rejects','after',mutation="UPDATE public.trip_sustained_dev_policy SET universal_png_import_expires_at=clock_timestamp()-interval '1 second';",expected='INPUT_STALE'))
checks.append(test('stale_input_rejects','after',expected='INPUT_STALE',pinpatch={"observed_source_row_revision":2}))
checks.append(test('historical_input_rejects','after',expected='INPUT_STALE',pinpatch={"historical_selection":True}))
checks.append(test('missing_source_rejects','after',expected='INPUT_STALE',pinpatch={"source_id":"10000000-0000-4000-8000-000000000099"}))
for field,value in [('payload_sha256','a'*64),('byte_count',42631),('confirmation_id','10000000-0000-4000-8000-000000000099'),('material_revision',2),('representation_id','10000000-0000-4000-8000-000000000099')]:
 checks.append(test('invalid_'+field,'after',expected='INPUT_STALE',pinpatch={field:value}))
(p/'local-checks.json').write_text(json.dumps({'status':'LOCAL_BODY_PASS','checks':checks,'limits':'Existing isolated fixture, unchanged body in transaction-local pg_temp wrapper; no table/column/role/GRANT changes or persistent installation. PDF helper is represented only by its explicit non-PDF NULL branch; actual PNG facts and scope helpers are unchanged. Not full Begin/PDF regression or Hosted E2E.'},indent=2)+'\n')
