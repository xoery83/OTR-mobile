from pathlib import Path
import subprocess,json
p=Path('/Users/xoery/.codex/worktrees/universal-photo-resume-integration-20261030/otr-mobile-canonical/docs/ops/universal-product-20261028/photo/first-lookup')
cmd=['docker','exec','-i','6ed159e58bbbf0fd2fa6fece68275a888646af1999ce7df46dfdb42035586ec2','psql','-XqAt','-h','/tmp','-U','postgres','-d','photo_png_qualified_6c2fe499','-v','ON_ERROR_STOP=1']
def run(sql):return subprocess.run(cmd,input=sql,text=True,capture_output=True,timeout=30)
probe="SELECT jsonb_build_object('graph',(SELECT jsonb_agg(to_jsonb(m) ORDER BY roleid,member,grantor) FROM pg_auth_members m),'acl',(SELECT nspacl FROM pg_namespace WHERE nspname='public'),'pin',(SELECT md5(pg_get_functiondef('public.trip_source_universal_original_pin()'::regprocedure))));"
baseline=run(probe);assert baseline.returncode==0
prefix="BEGIN;GRANT otr_trip_source_writer TO postgres WITH ADMIN false,INHERIT false,SET false;"
def body(name):return (p/name).read_text().replace('BEGIN;','',1).removesuffix('COMMIT;\n').replace('oid=66243','oid=22614')
fwd=body('install.sql');reverse=body('rollback.sql')
checks=[('FORWARD_REVERSE',prefix+fwd+reverse+"ROLLBACK;",None),('FAULT_BEFORE_RESTORE',prefix+fwd.replace('REVOKE CREATE ON SCHEMA',"DO $fault$ BEGIN RAISE EXCEPTION 'INJECTED_BEFORE_RESTORE';END $fault$;REVOKE CREATE ON SCHEMA",1)+'ROLLBACK;','INJECTED_BEFORE_RESTORE'),('FAULT_AFTER_RESTORE',prefix+fwd+"DO $fault$ BEGIN RAISE EXCEPTION 'INJECTED_AFTER_RESTORE';END $fault$;ROLLBACK;",'INJECTED_AFTER_RESTORE')]
results=[]
for name,sql,error in checks:
 r=run(sql);after=run(probe);ok=(r.returncode==0 if error is None else r.returncode!=0 and error in r.stderr) and after.returncode==0 and after.stdout==baseline.stdout
 Path('/private/tmp/otr-photo-first-lookup-repair-20261031/'+name+'.private.log').write_text(r.stderr)
 results.append({'name':name,'passed':ok,'baselineRestored':after.stdout==baseline.stdout})
out={'status':'PASS' if all(r['passed'] for r in results) else 'FAIL','cases':results,'fixtureAdjustments':['OID 66243→22614 only in local test copy','missing pre-existing membership edge supplied only inside outer rollback transaction'],'fixture':'existing network-none PostgreSQL','devExecuted':False};(p/'maintenance-checks.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out));assert out['status']=='PASS'
