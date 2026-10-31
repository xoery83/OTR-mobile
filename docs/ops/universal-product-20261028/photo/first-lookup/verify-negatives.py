from pathlib import Path
import json,subprocess
p=Path('/private/tmp/otr-photo-first-lookup-repair-20261031')
raw=(p/'retained-command.private.json').read_text(); fix=(p/'pin-after.private.sql').read_text()
a="'f4b059c5-8241-4ffb-aa15-37fa25474543'"; literal='$retained$'+raw+'$retained$'
base="BEGIN;CREATE TRIGGER photo_fixture_update_guard BEFORE UPDATE OR DELETE ON public.trip_sources FOR EACH ROW EXECUTE FUNCTION public.guard_trip_source_mutation();SET LOCAL statement_timeout='10s';GRANT USAGE ON SCHEMA extensions TO otr_trip_source_writer,otr_trip_source_operation_reader;"+fix
cases={}
for name,enabled,expiry in [('CLOSED_MISSING_DENIED','false','NULL'),('EXPIRED_MISSING_DENIED','true',"clock_timestamp()-interval '1 second'")]:
 cases[name]=base+f"UPDATE public.trip_sustained_dev_policy SET universal_png_import_enabled={enabled},universal_png_import_expires_at={expiry} WHERE actor_account_id={a};SET SESSION AUTHORIZATION otr_trip_source_command_gateway;"+f"DO $test$ BEGIN BEGIN PERFORM public.trip_source_lookup_universal_original({a},{literal});RAISE EXCEPTION 'EXPECTED_DENIAL';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'UNIVERSAL_SOURCE_SCOPE_CLOSED' THEN RAISE;END IF;END;END $test$;ROLLBACK;"
# Derive the exact READ_RECEIPT pin with the same owning codec, never change the command identity.
setup=base+f"UPDATE public.trip_sustained_dev_policy SET universal_png_import_enabled=true,universal_png_import_expires_at=clock_timestamp()+interval '5 minutes' WHERE actor_account_id={a};SET SESSION AUTHORIZATION otr_trip_source_command_gateway;SELECT public.trip_source_acquire_universal_original({a},{literal}) IS NOT NULL;"
pin=f"DO $pin$ DECLARE q jsonb:=public.trip_source_command_codec({literal});BEGIN PERFORM set_config('otr.universal.source_pin',jsonb_build_object('profile','OTR_PNG_CAPTURE_ORIGINAL_V1','access','READ_RECEIPT','actor',q->>'actor_account_id','trip',q->>'trip_id','source',q->>'source_id','representation',q->'payload'->'original'->>'id','operation',q->>'operation_id','key',q->>'operation_key','digest',q->>'operation_sha256','sha256',q->'payload'->'original'->>'payload_sha256','byteCount',q->'payload'->'original'->'byte_count','filename',q->'payload'->'original'->>'original_filename','acquisitionSha256',q->'payload'->>'acquisition_sha256','captureSha256',q->'payload'->'capture'->>'capture_sha256')::text,true);IF public.trip_source_universal_original_pin() IS NULL THEN RAISE EXCEPTION 'PIN_INVALID';END IF;END $pin$;"
for name,dml in [('READ_PIN_UPDATE_DENIED',"UPDATE public.trip_sources SET acquired_by='00000000-0000-4000-8000-000000000001' WHERE id='2bf0294a-47df-4176-999f-0e352e34543c'"),('READ_PIN_INSERT_DENIED',"INSERT INTO public.trip_sources SELECT * FROM public.trip_sources WHERE id='2bf0294a-47df-4176-999f-0e352e34543c'")]:
 helper="CREATE FUNCTION public.photo_read_pin_test() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $helper$ BEGIN "+pin+" IF NOT EXISTS(SELECT 1 FROM public.trip_sources WHERE id='2bf0294a-47df-4176-999f-0e352e34543c') THEN RAISE EXCEPTION 'FIXTURE_SOURCE_ABSENT';END IF;BEGIN "+dml+";RAISE EXCEPTION 'EXPECTED_DENIAL';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'PNG_SOURCE_MUTATION_DENIED' THEN RAISE;END IF;END;END $helper$;ALTER FUNCTION public.photo_read_pin_test() OWNER TO otr_trip_source_writer;"
 cases[name]=setup.replace('SET SESSION AUTHORIZATION otr_trip_source_command_gateway;',helper+'SET SESSION AUTHORIZATION otr_trip_source_command_gateway;')+"SELECT public.photo_read_pin_test();ROLLBACK;"
results=[]
for name,sql in cases.items():
 r=subprocess.run(['docker','exec','-i','6ed159e58bbbf0fd2fa6fece68275a888646af1999ce7df46dfdb42035586ec2','psql','-XqAt','-h','/tmp','-U','postgres','-d','photo_png_qualified_6c2fe499','-v','ON_ERROR_STOP=1'],input=sql,capture_output=True,text=True,timeout=30)
 (p/(name+'.private.log')).write_text(r.stderr)
 results.append({'name':name,'passed':r.returncode==0})
out={'status':'PASS' if all(x['passed'] for x in results) else 'FAIL','cases':results,'network':'none','allTransactionsRolledBack':True};(p/'negative-checks.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
