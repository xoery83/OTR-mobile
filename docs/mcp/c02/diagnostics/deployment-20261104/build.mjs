import { build } from '/Users/xoery/Project/otr-mobile/node_modules/esbuild/lib/main.js';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const main='/private/tmp/otr-mcp-c02-diagnostic-deployment-20261104';
const lane='/Users/xoery/.codex/worktrees/mcp-01-read-only/otr-mobile-canonical';
const out='/private/tmp/otr-mcp-c02-diagnostic-bundle-20261104';
const hash=b=>createHash('sha256').update(b).digest('hex');
const auth=['mcpAccountWriteBinding','mcpAccountReadBinding','mcpOAuthGrantVerifier','mcpConsentPage'];
const host=await build({absWorkingDir:lane,entryPoints:['mcp/c02Host.ts'],bundle:true,platform:'node',target:'node24',format:'esm',write:false,metafile:true,outfile:out+'/c02-host.mjs',alias:{'@':lane+'/src'},plugins:[{name:'integrated-auth',setup(b){b.onResolve({filter:/^\.\.\/backend\/src\/mcp/},a=>auth.includes(path.basename(a.path))?{path:main+'/backend/src/'+path.basename(a.path)+'.ts'}:undefined);}}]});
const capture=await build({absWorkingDir:main,entryPoints:['backend/src/serverCapture.ts'],bundle:true,platform:'node',target:'node24',format:'esm',alias:{'@':main+'/src','expo-crypto':main+'/backend/src/headlessExpoCrypto.ts'},external:['./src/data/auth/guestLocalWorkspace.ts','react-native','expo-*'],banner:{js:'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);'},write:false,metafile:true,outfile:out+'/server-capture.mjs'});
const manifests={sourceMain:'7c1301c6a2ac7bdfe22e3c00f31f747db2810977',hostCandidate:'978f02009544188b844870331aa1aa81b1b5d82b',artifacts:{},inputs:{}};
for(const [name,result,root] of [['c02-host.mjs',host,lane],['server-capture.mjs',capture,main]]){fs.writeFileSync(out+'/'+name,result.outputFiles[0].contents);manifests.artifacts[name]=hash(result.outputFiles[0].contents);manifests.inputs[name]=Object.fromEntries(Object.keys(result.metafile.inputs).map(p=>{const f=path.resolve(root,p);return [f,hash(fs.readFileSync(f))]}));fs.writeFileSync(out+'/'+name+'.meta.json',JSON.stringify(result.metafile,null,2));}
for(const name of ['c02-close.py','c02-close.test.py']){const b=fs.readFileSync(main+'/scripts/mcp/'+name);fs.writeFileSync(out+'/'+name,b);manifests.artifacts[name]=hash(b);}
fs.writeFileSync(out+'/BUILD_MANIFEST.json',JSON.stringify(manifests,null,2)+'\n');
console.log(JSON.stringify({artifacts:manifests.artifacts,inputCounts:Object.fromEntries(Object.entries(manifests.inputs).map(([k,v])=>[k,Object.keys(v).length]))}));
