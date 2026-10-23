"""Actual isolated PG catalog -> existing SQLite Repository/WakeQueue/custody/HTTP.
No Hosted, authenticating user, real Provider or Native Session is accessed.
"""
from pathlib import Path
import tempfile,subprocess,os,json
ROOT=Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='otr-universal-catalog-') as directory:
 path=Path(directory);snapshot=path/'catalog.json'
 env=dict(os.environ,OTR_UNIVERSAL_FIXTURE_SNAPSHOT=str(snapshot))
 source=subprocess.run(['python3',str(ROOT/'scripts/import-workbench/universal-source-sql-acceptance.py')],env=env,cwd=ROOT,text=True,capture_output=True)
 if source.returncode:raise RuntimeError(source.stderr)
 pg=json.loads(source.stdout)
 entry=path/'runner.ts';bundle=path/'runner.mjs'
 entry.write_text('import {runUniversalContinuationFixture} from '+json.dumps(str(ROOT/'backend/src/__fixtures__/universalContinuationRuntime'))+';\nconsole.log(JSON.stringify(await runUniversalContinuationFixture("/custody-tests",'+snapshot.read_text()+'),null,2));\n')
 subprocess.run(['npx','esbuild',str(entry),'--bundle','--platform=node','--target=node24','--format=esm','--alias:@=./src','--external:react-native','--external:expo-*','--outfile='+str(bundle),'--banner:js=import { createRequire } from "node:module"; const require = createRequire(import.meta.url);'],cwd=ROOT,text=True,capture_output=True,check=True)
 result=subprocess.run(['docker','run','--rm','-i','--network','none','--read-only','--tmpfs','/custody-tests:rw,mode=700','--entrypoint','node','node:24-bookworm-slim','--input-type=module'],input=bundle.read_text(),text=True,capture_output=True)
 if result.returncode:raise RuntimeError(result.stderr)
 print(json.dumps({'status':'ISOLATED_PG_CATALOG_SQLITE_HOST_PASS','pgSource':pg,'sqliteCustodyHttp':json.loads(result.stdout),'realAuth':'NOT_RUN_SYNTHETIC_LOCAL_CONTEXT','realProviderCalls':0,'hostedWrites':0},indent=2))
