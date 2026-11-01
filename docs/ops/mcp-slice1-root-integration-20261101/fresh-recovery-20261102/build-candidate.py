import hashlib,json,shutil,subprocess
from pathlib import Path
root=Path('/Users/xoery/.codex/worktrees/universal-photo-resume-integration-20261030/otr-mobile-canonical')
p=Path('/private/tmp/otr-mcp-diagnostics-assembly-20261102');base=Path('/private/tmp/otr-mcp-slice1-integration-20261101/compatible-tree');tree=p/'tree'
assert not tree.exists();shutil.copytree(base,tree,symlinks=True)
sha=lambda b:hashlib.sha256(b).hexdigest()
old=json.loads(Path('/private/tmp/otr-mcp-slice1-integration-20261101/ASSEMBLY.json').read_text())
for f,h in old['sourceInputs'].items():assert sha((tree/f).read_bytes())==h
changes={}
for commit,name,expected in [('f1de4b47','backend/src/mcpAccountWriteBinding.ts','e9ab356cf5d0b5bb4b4ebcbf1792ae4fe3c78134fdf16fff2f5c6feca4cf0eea'),('f1de4b47','backend/src/mcpQaRuntime.ts','5216d70ea05a74fe275c40af89edb799f2151ab7f92692cca2cc2ebb590e05d5')]:
 before=subprocess.check_output(['git','show',commit+'^:'+name],cwd=root);after=subprocess.check_output(['git','show',commit+':'+name],cwd=root);assert (tree/name).read_bytes()==before and sha(after)==expected;(tree/name).write_bytes(after);changes[name]={'before':sha(before),'after':sha(after)}
name='backend/mcp/slice1-qa-cases.json';b=subprocess.check_output(['git','show','88fe07f7:backend/mcp/slice1-fresh-qa-cases.json'],cwd=root);assert sha(b)=='6d5d4e07b14c5a5e9c692e3db24040a7dd076edddbcf8f743bbb86007169d6da';changes[name]={'before':sha((tree/name).read_bytes()),'after':sha(b)};(tree/name).write_bytes(b)
runtime=Path('/private/tmp/otr-auth-mcp-slice1-recovery-build-20261102/runtime.mjs').read_bytes();assert sha(runtime)=='a0560110a2a6419bb152f8bf423b13b27efbc5155574e303bb76ae299d844565';(p/'runtime.mjs').write_bytes(runtime)
# Same actual qualified Capture entry/flags; only approved owning input deltas above.
args=[str(tree/'node_modules/.bin/esbuild'),'backend/src/serverCapture.ts','--bundle','--platform=node','--target=node24','--format=esm','--alias:@=./src','--external:./src/data/auth/guestLocalWorkspace.ts','--alias:expo-crypto=./backend/src/headlessExpoCrypto.ts','--external:react-native','--external:expo-*','--outfile=dist/server-capture.mjs','--metafile=dist/recovery-capture-meta.json','--banner:js=import { createRequire } from "node:module"; const require = createRequire(import.meta.url);']
x=subprocess.run(args,cwd=tree,capture_output=True,text=True);assert x.returncode==0,x.stderr
meta=json.loads((tree/'dist/recovery-capture-meta.json').read_text());inputs={}
for f in meta['inputs']:
 path=Path(f)
 if path.is_absolute() or '..' in path.parts:continue
 inputs[f]=sha((tree/f).read_bytes())
assert set(inputs)==set(old['sourceInputs']), 'CAPTURE_GRAPH_DRIFT'
diff={f for f,h in inputs.items() if h!=old['sourceInputs'][f]};assert diff==set(changes),diff
out={'status':'DEFAULT_CLOSED_ASSEMBLY_LOCAL_READY_NOT_DEPLOYED','captureSHA256':sha((tree/'dist/server-capture.mjs').read_bytes()),'runtimeSHA256':sha(runtime),'sdkSHA256':'3b5ceca51d6ad4ba56312041880d01452e68d7bf1069dd19454ba34868e62083','fixtureSHA256':sha(b),'sourceCount':len(inputs),'captureChangedInputs':changes,'otherCaptureInputsPreserved':len(inputs)-len(changes),'sourceInputs':inputs,'guideSourceCommit':'bfde2503','authSourceCommit':'f1de4b47','freshFixtureCommit':'88fe07f7','activation':False,'deployment':False,'notesApproval':False,'oldUnknownReplayed':False}
(p/'ASSEMBLY.json').write_text(json.dumps(out,indent=2));print(json.dumps({k:v for k,v in out.items() if k!='sourceInputs'}))
