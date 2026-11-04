// One approved Host-only execution. All Auth/business logic remains in the fixed runner.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, openSync, closeSync, fsyncSync, constants, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { checkDistinctSharedP1Packet, runDistinctSharedP1NextDay } from '../../../scripts/auth/distinct-shared-p1-next-day';
import { createAcceptedHostQaReceiver } from '../../../scripts/auth/resend-inbound-otp-native-relogin';
import { createResendQaReceiver } from '../../../scripts/auth/resend-inbound-otp';
import { inboundKeychainArgs, publicConfiguration } from '../../../scripts/auth/resend-inbound-otp-e2e';

const agentId = '/root/auth_distinct_p1_e2e_20261105';
const taskId = 'MC-SUBAGENT-20261105-AUTH-DISTINCT-E2E';
const candidate = '04bf6c908617e4135ec2a21e9a8c73698d02aa0d';
const qPath = '/Users/xoery/Project/otr-mobile-import/root2-hosted-ops-acceptance-20261103/docs/handoffs/ROOT2_HOSTED_OPS_V4/requests/MC-SLOW-START-20261105-IMPORT-AUTH-QUALIFICATION/AUTH_QUALIFICATION.json';
const qHash = '1d3b9ccc51bdaf369e450f72e3e2b17b662b814622489bfec1669815cc311a30';
const manifestHash = 'bd4e40ae3cdeba45eb1a34d48d518cdd52b5c3a51abb9dc05303cf61a7a48dc7';
const root = resolve('docs/ops/auth-c04-distinct-p1-e2e-20261105');
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
function verified(path: string, expected: string) { const bytes=readFileSync(path); if(sha(bytes)!==expected)throw Error('FIXED_ARTIFACT_HASH_MISMATCH'); return JSON.parse(bytes.toString()); }
const qualification = verified(qPath, qHash);
const scope = qualification.minimalNextOwnerScope;
const manifestPath = qualification.layers.SOURCE.manifest.path;
function assertFixed() {
  if(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==candidate)throw Error('CANDIDATE_CHANGED');
  const m=verified(manifestPath,manifestHash);
  for(const [file,hash] of Object.entries(m.files)) {
    if(sha(readFileSync(file))!==hash || sha(execFileSync('git',['show',`${candidate}:${file}`]))!==hash)throw Error('FIXED_SOURCE_CHANGED');
  }
  verified(qPath,qHash);
  for(const x of [qualification.layers.SOURCE.review,qualification.layers.HOSTED.snapshot,
    qualification.layers.HOSTED.databaseSnapshot,qualification.layers.HOSTED.d136InstalledReceipt]) verified(x.path,x.sha256);
  if(scope.candidate!==candidate || scope.manifestSHA256!==manifestHash || scope.maxMinutes!==10 || scope.maxPhysicalPosts!==1 || scope.OTPMaxPerExactAccount!==1)throw Error('AUTHORITY_BINDING_MISMATCH');
}
let T: number|null=null,D: number|null=null,actor: 'A'|'B'|null=null;
const journal: any={taskId,agentId,candidate,qualificationSHA256:qHash,manifestSHA256:manifestHash,
  operationId:scope.operationId,itemId:scope.itemId,status:'PREFLIGHT',T:null,D:null,
  ownerApprovalSource:'MC-SUBAGENT-20261105-AUTH-DISTINCT-E2E explicit Owner-approved fixed scope; preparation file alone does not grant execution',
  actors:{A:{otpAttempts:0},B:{otpAttempts:0}},events:[],corePhysicalPosts:0,credentialReads:0,networkRequests:0};
const persist=()=>writeFileSync(resolve(root,'RUN.json'),JSON.stringify(journal,null,2)+'\n',{mode:0o600});
const note=(event:any)=>{ journal.events.push({at:new Date().toISOString(),...event});persist(); };
function clock(now=Date.now()) {
  if(T===null||D===null)throw Error('EXECUTION_CLOCK_UNBOUND');
  if(now<T||now>=D)throw Error('SCOPE_EXPIRED');
}
async function qualify() {
  assertFixed();clock();
  if(journal.actors.A.cleanup==='PASS_LOCAL_SCOPE_REFRESH_REVOKED' && journal.actors.B.otpAttempts===0 && D!-Date.now()<240000)throw Error('INSUFFICIENT_TIME_FOR_B');
}
if(process.argv[2]==='--self-check') {
  assertFixed(); assert.throws(()=>clock(),/UNBOUND/);
  T=1000;D=601000;assert.doesNotThrow(()=>clock(1001));assert.throws(()=>clock(601000),/EXPIRED/);
  console.log('OPERATOR_CLOCK_AND_FIXED_BINDING_SELF_CHECK_PASS_NO_NETWORK_OR_CREDENTIAL');process.exit(0);
}
if(process.argv[2]!=='--execute')throw Error('EXPLICIT_EXECUTION_REQUIRED');
const lock=resolve(root,'EXECUTOR_ACTIVE.lock');
const fd=openSync(resolve(root,'EXECUTION_STARTED.json'),constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
writeFileSync(fd,JSON.stringify({taskId,agentId,at:new Date().toISOString(),phase:'PREFLIGHT_NOT_CLOCK_START'})+'\n');fsyncSync(fd);closeSync(fd);
mkdirSync(lock);persist();
const nativeFetch=globalThis.fetch;
let afterPostReceiptGets=0;
let key:string|undefined;
try {
  assertFixed();
  if(existsSync('docs/ops/auth-c04-distinct-p1-next-day-20261104/ATTEMPT.json'))throw Error('EXISTING_BUSINESS_ATTEMPT_RECONCILIATION_REQUIRED');
  await checkDistinctSharedP1Packet();
  const first=JSON.parse(readFileSync('docs/ops/auth-inbound-otp-20261030/FIRST_USER_E2E.json','utf8'));
  if(first.status!=='PASS'||first.reuseReleased!==true)throw Error('NORMAL_RECEIVING_RELEASE_REQUIRED');
  for(const [file,hash] of Object.entries(first.toolHashes))if(sha(readFileSync(`scripts/auth/${file}`))!==hash)throw Error('NORMAL_RECEIVING_CODE_CHANGED');
  const source=readFileSync('/Users/xoery/Project/otr-mobile/.env.local','utf8');
  const env:NodeJS.ProcessEnv={NODE_ENV:'development',OTR_DEV_OTP_TEST:'1'};
  for(const name of ['EXPO_PUBLIC_OTR_DEV_SUPABASE_URL','EXPO_PUBLIC_OTR_DEV_SUPABASE_PUBLISHABLE_KEY']){
    const match=source.match(new RegExp('^'+name+'=(.*)$','m'));if(!match)throw Error('PUBLIC_CONFIG_MISSING');env[name]=match[1].trim().replace(/^['"]|['"]$/g,'');
  }
  const publicOptions=publicConfiguration(env);
  key=process.env.OTR_QA_RESEND_API_KEY;
  if(!key){try{key=execFileSync('/usr/bin/security',[...inboundKeychainArgs],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:15000}).trim();}catch{throw Error('RECEIVING_CREDENTIAL_REQUIRED');}}
  journal.credentialReads=1;
  const emails={A:'otr-qa-3f43c81b-500b-4e59-b0a8-c7ffdbd19a31@eldouzileu.resend.app',B:'otr-qa-fde969f2-2dc5-4a33-83a1-268ac5fd6424@eldouzileu.resend.app'};
  globalThis.fetch=async(url,init)=>{
    const u=new URL(String(url)),method=init?.method??'GET';
    const cleanup=u.origin===publicOptions.url && (u.pathname==='/auth/v1/logout'&&u.search==='?scope=local'||u.pathname==='/auth/v1/token'&&u.search==='?grant_type=refresh_token');
    if(u.origin==='https://api.resend.com'){
      if(method!=='GET'||!/^\/emails\/receiving(?:\/[0-9a-f-]{36})?$/.test(u.pathname))throw Error('RECEIVING_ROUTE_DENIED');
    } else if(u.origin===publicOptions.url){
      if(!cleanup)await qualify();
      if(!['/auth/v1/otp','/auth/v1/verify','/auth/v1/user','/auth/v1/logout','/auth/v1/token'].includes(u.pathname))throw Error('AUTH_ROUTE_DENIED');
      if(u.pathname==='/auth/v1/otp'){
        const body=JSON.parse(String(init?.body));if(!actor||body.email!==emails[actor])throw Error('OTP_SCOPE_MISMATCH');
      }
    } else if(u.origin==='https://api-dev.xoery.art'){
      await qualify();
      const base=`/v2/trips/${scope.tripId}/core`;
      if(method==='POST'){
        if(actor!=='A'||u.pathname!==base+'/commands'||sha(String(init?.body))!==scope.wireSha256||journal.corePhysicalPosts!==0)throw Error('EXACT_SINGLE_POST_REQUIRED');
        if(D!-Date.now()<360000)throw Error('INSUFFICIENT_TIME_BEFORE_POST');
        journal.corePhysicalPosts=1;
      } else if(method==='GET'){
        const allowed=[base+'/collection',...(actor==='A'?[base+'/capabilities',base+'/operations/'+scope.operationId]:[])];
        if(!allowed.includes(u.pathname))throw Error('CORE_READ_SCOPE_MISMATCH');
        if(journal.corePhysicalPosts && u.pathname===base+'/operations/'+scope.operationId && ++afterPostReceiptGets>1)throw Error('RECEIPT_RECOVERY_ALREADY_ATTEMPTED');
        if(actor==='B' && D!-Date.now()<100000)throw Error('INSUFFICIENT_TIME_FOR_B_READ');
      }else throw Error('CORE_METHOD_DENIED');
    } else throw Error('NETWORK_ORIGIN_DENIED');
    journal.networkRequests++;note({phase:'HTTP_ATTEMPT',actor,method,origin:u.origin,path:u.pathname});
    const start=Date.now(),response=await nativeFetch(url,{...init,redirect:'error'});
    note({phase:'HTTP',actor,method,origin:u.origin,path:u.pathname,status:response.status,
      requestId:response.headers.get('x-request-id'),durationMs:Date.now()-start});
    return response;
  };
  const permission=createResendQaReceiver({key:key!,scope:'dedicated-qa-team',fetch:globalThis.fetch});
  await permission.checkPermission();
  journal.receivingPreflight='PASS_200_PERMISSION; sending daily quota is not exposed by this read; actual normal one-shot OTP acceptance is required within T/D';
  const receivers=Object.fromEntries((['A','B'] as const).map(a=>[a,createAcceptedHostQaReceiver({key:key!,scope:'dedicated-qa-team',email:emails[a],
    reserve(value){clock();if(journal.actors[a].challenge)throw Error('OTP_CHALLENGE_ALREADY_RESERVED');journal.actors[a].challenge=value;persist();}})])) as any;
  T=Date.now();D=T+600000;journal.T=new Date(T).toISOString();journal.D=new Date(D).toISOString();journal.status='EXECUTING';
  journal.qualifierBinding={ownerTask:taskId,candidate,manifestSHA256:manifestHash,root2SHA256:qHash,
    scope:qualification.minimalNextOwnerScope,softwareSnapshot:qualification.layers.HOSTED.containerId,
    quotaPolicy:'Bounded one normal OTP per exact Account; stop on refusal/429; no resend',historicalTypicalBudgetSeconds:180};persist();
  const result=await runDistinctSharedP1NextDay({receivers,publicOptions,qualify,
    noteCore:value=>note({channel:'CORE',...value}),
    noteAuth(a,value){actor=a;if(value.phase==='OTP_REQUEST_ATTEMPTED'){
      if(++journal.actors[a].otpAttempts>1)throw Error('OTP_ALREADY_ATTEMPTED');
    }if(value.ownSessionCleanup)journal.actors[a].cleanup=value.ownSessionCleanup;
      if(value.phase==='HOST_IDENTITY_VERIFIED')journal.actors[a].identityVerified=true;
      note({channel:'AUTH',actor:a,...value});},
  });
  journal.result=result;journal.status='HOSTED_DISTINCT_SHARED_P1_PASS';
} catch(error) {
  journal.status='STOPPED_NO_RETRY';
  journal.failure={name:error instanceof Error?error.name:'Unknown',code:error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:'EXECUTION_FAILED_SANITIZED'};
} finally {
  globalThis.fetch=nativeFetch;
  journal.completedAt=new Date().toISOString();journal.historicalUnknown='f5e/4028 FROZEN_NO_REPLAY';
  const clean=(['A','B'] as const).every(a=>journal.actors[a].otpAttempts===0||journal.actors[a].cleanup==='PASS_LOCAL_SCOPE_REFRESH_REVOKED');
  journal.ownResourceRelease=clean?'PASS_OWN_SCOPE_RELEASED':'UNPROVEN_RETAIN_LOCAL_ATTEMPT_LOCK';persist();
  if(clean)rmSync(lock,{recursive:true});
  key=undefined;
}
