import { randomUUID } from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fixture} from '../../../../backend/src/guestAdoptionCompositePlan.fixture';
import {prepareGuestAdoptionCompositePlan} from '../../../../backend/src/guestAdoptionCompositePlan';
if (process.argv[2]) {
 const f=JSON.parse(readFileSync(process.argv[2],'utf8'));
 const grant=JSON.parse(readFileSync(process.argv[3],'utf8'));
 const plan=await prepareGuestAdoptionCompositePlan(f.user,{grant,preparationSha256:f.checkpoint.sha256},f.checkpoint);
 process.stdout.write(JSON.stringify(plan));
} else {
 const f=fixture(), t=f.body.trips[0];
 Object.assign(t.create,{formatVersion:2,destinations:[]});
 Object.assign(t.metadata,{destinations:[]});
 Object.assign(t.ledgerInitialization,{settlementCurrency:'NZD',settlementScale:2});
 const person={version:1,operationId:randomUUID(),personId:randomUUID(),tripId:t.create.tripId,accountId:f.grant.sourceGuestLocalId,tripCreateOperationId:t.create.operationId,displayName:'旅人 Å'};
 (t.people as unknown[]).push(person);t.queueOperationIds.push(person.operationId);
 f.body.totals.people++;f.body.totals.queueOperations++;f.grant.resources.people++;
 const after={...t.metadata,name:'Guest Edited retained'};
 const action={localActionVersion:1,actionId:randomUUID(),operationId:randomUUID(),tripId:t.create.tripId,dependencyOperationId:t.create.operationId,before:t.metadata,after};
 (t.deferredMetadata as unknown[]).push(action);t.queueOperationIds.push(action.actionId);t.metadata=after;
 f.body.totals.queueOperations++;
 const checkpoint=await f.source();
 const {status:_status,grantId:_id,policyVersion:_policy,expiresAt:_expiry,...request}=f.grant;
 process.stdout.write(JSON.stringify({user:f.user,checkpoint,request}));
}
