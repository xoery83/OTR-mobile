import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {session} from '../../../../backend/src/__fixtures__/tripCoreV2Sql';
import {withCorePgStorageTransaction,type CorePgConnection} from '../../../../backend/src/tripCoreV2PgStorage';
import {executeGuestAdoptionCompositePgOnTransaction} from '../../../../backend/src/guestAdoptionCompositePg';
const [container,database,path,mode]=process.argv.slice(2);
assert(['rollback','commit'].includes(mode));
const material=JSON.parse(readFileSync(path,'utf8'));
const connection:CorePgConnection={async withLease(work){const handle=session(container,{database});try{return await work(handle.lease);}finally{handle.close();}}};
const hash=async(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
let result:Awaited<ReturnType<typeof executeGuestAdoptionCompositePgOnTransaction>>|undefined;
try {
 await withCorePgStorageTransaction(connection,hash,async context=>{
  result=await executeGuestAdoptionCompositePgOnTransaction(material.fixture.user,material.grant.adoptionId,material.plan.sha256,context);
  const body=JSON.parse(result.canonicalText);
  assert.equal(body.authority,'NONE');assert.equal(body.records.length,1);
  assert.equal(body.records[0].intents.length,1);
  assert.equal(body.records[0].intents[0].receipt.outcome,'APPLIED');
  assert.equal(body.records[0].intents[0].receipt.actorAccountId,material.fixture.user.id);
  assert.equal(body.records[0].people[0].person.userId,null);
  assert.equal(body.records[0].metadata[0].receipt.after.name,'Guest Edited retained');
  assert.equal(body.records[0].ledger.settlementCurrency,'NZD');
  assert.equal(body.queueMappings.length,4);
  assert.equal(body.localRestoreStatus,'REQUIRED_NOT_EXECUTED');
  if(mode==='rollback')throw Error('EXPECTED_ISOLATED_ROLLBACK');
 },undefined,{sustainedDev:true});
 assert.equal(mode,'commit');
} catch(error) {
 if(mode!=='rollback'||!(error instanceof Error)||error.message!=='EXPECTED_ISOLATED_ROLLBACK')throw error;
}
assert(result);
const body=JSON.parse(result.canonicalText);
process.stdout.write(JSON.stringify({status:'REAL_PG_EXECUTOR_COMPONENT_'+mode.toUpperCase(),authority:'NONE',executionSha256:result.sha256,
 accountId:material.fixture.user.id,adoptionId:material.grant.adoptionId,tripId:body.records[0].tripId,
 itemId:body.records[0].intents[0].receipt.result.created.find((entry:{kind:string})=>entry.kind==='ITEM').id,
 receiptId:body.records[0].intents[0].domainReceiptId,
 coreOutcome:body.records[0].intents[0].receipt.outcome,
 queueMappings:body.queueMappings.length,localRestoreStatus:body.localRestoreStatus}));
