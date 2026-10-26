import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {z} from 'zod';
import {PrivateStore} from './store';

const sha=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const kinds=['P1','P2','P3','P4','P5','P6'] as const;
const textField=z.strictObject({sourceId:z.string().min(1),path:z.string().min(1),raw:z.string().min(1),start:z.number().int().min(0),end:z.number().int().positive(),uncertainty:z.string().optional()});
const imageField=z.strictObject({sourceId:z.string().min(1),path:z.string().min(1),raw:z.string().min(1),region:z.strictObject({imageSha256:z.string().regex(/^[a-f0-9]{64}$/),x:z.number().int().min(0),y:z.number().int().min(0),width:z.number().int().positive(),height:z.number().int().positive(),unit:z.literal('PIXELS')}),uncertainty:z.string().optional()});
const field=z.union([textField,imageField]);
const object=z.strictObject({token:z.string().min(1),kind:z.enum(kinds),subtype:z.string().min(1),fields:z.array(field).min(1),bookingTokens:z.array(z.string()).default([]),ticketTokens:z.array(z.string()).default([])});
const booking=z.strictObject({token:z.string().min(1),supplier:field,reference:field,fields:z.array(field).default([]),objectTokens:z.array(z.string()).min(1)});
const ticket=z.strictObject({token:z.string().min(1),label:field,objectTokens:z.array(z.string()).min(1)});
export const subtypes:Record<(typeof kinds)[number],readonly string[]>={P1:['ACTIVITY'],P2:['FLIGHT'],P3:['ACCOMMODATION'],P4:['RENTAL_CAR'],P5:['TRAIN','BUS','FERRY'],P6:['ACTIVITY']};
export const responseSchema=z.strictObject({schema:z.literal('otr-workbench-llm-interpretation/1'),objects:z.array(object).max(64),bookings:z.array(booking).max(64),tickets:z.array(ticket).max(64),unresolved:z.array(z.strictObject({sourceId:z.string().min(1),reason:z.string().min(1)})).max(64)});
export type LlmResponse=z.infer<typeof responseSchema>;
export type Source={id:string;name:string;mime:string;bytes:Buffer;preparedText?:string;prepared?:{bytes:Buffer;mime:string;originalSha256:string;submittedSha256:string;operations:string[]}};
export type Capability={mimes:string[];modalities:('TEXT'|'DOCUMENT'|'IMAGE')[]};
export type Provider={name:string;model:string;mode:'MOCK'|'REAL';capability:Capability;execute:(request:{runId:string;schema:string;representations:{sourceId:string;mime:string;modality:string;bytes:Buffer;sha256:string}[]},signal?:AbortSignal)=>Promise<{output:unknown;usage:{inputTokens:number|null;outputTokens:number|null;source:'ACTUAL'|'UNAVAILABLE'|'SYNTHETIC'};latencyMs:number;costUsd:number|null}>};
export type Path='A_DIRECT'|'B_PREPARED';
const activeRuns=new Map<string,Promise<any>>();
const modality=(mime:string)=>mime==='application/pdf'?'DOCUMENT':mime.startsWith('image/')?'IMAGE':'TEXT';
export function imageDimensions(bytes:Buffer,mime:string){
 if(mime==='image/png'&&bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
 if(mime==='image/jpeg'&&bytes[0]===0xff&&bytes[1]===0xd8){let i=2;while(i+9<bytes.length){if(bytes[i++]!==0xff)break;const marker=bytes[i++];if(marker===0xd9||marker===0xda)break;const len=bytes.readUInt16BE(i);if(len<2||i+len>bytes.length)break;if([0xc0,0xc1,0xc2,0xc3].includes(marker))return {height:bytes.readUInt16BE(i+3),width:bytes.readUInt16BE(i+5)};i+=len;}}
 return null;
}
export function prepare(source:Source,path:Path,capability:Capability){
 const originalSha256=sha(source.bytes),originalBytes=source.bytes.length;
 let bytes=source.bytes,mime=source.mime,operations:string[]=[];
 if(path==='B_PREPARED'){
  if(source.prepared){
   const r=source.prepared;
   if(r.originalSha256!==originalSha256||r.submittedSha256!==sha(r.bytes)||!r.operations.length||
    !((source.mime==='application/pdf'||source.mime==='text/html')&&r.mime==='text/plain'||source.mime==='image/png'&&r.mime==='image/jpeg'||source.mime==='text/plain'&&r.mime==='text/plain'))
    return {status:'UNSUPPORTED' as const,reason:'PREPARATION_RECEIPT_MISMATCH',sourceId:source.id,originalSha256,originalBytes};
   bytes=r.bytes;mime=r.mime;operations=r.operations;
  }else{
  if(source.mime!=='text/plain')return {status:'UNSUPPORTED' as const,reason:'VERIFIED_EXTRACTION_RECEIPT_REQUIRED',sourceId:source.id,originalSha256,originalBytes};
  if(source.preparedText===undefined)return {status:'UNSUPPORTED' as const,reason:'PREPARED_TEXT_UNAVAILABLE',sourceId:source.id,originalSha256,originalBytes};
  {
   let decoded:string;try{decoded=new TextDecoder('utf-8',{fatal:true}).decode(source.bytes);}catch{return {status:'UNSUPPORTED' as const,reason:'SOURCE_UTF8_INVALID',sourceId:source.id,originalSha256,originalBytes};}
   if(decoded!==source.preparedText)return {status:'UNSUPPORTED' as const,reason:'PREPARED_SOURCE_MISMATCH',sourceId:source.id,originalSha256,originalBytes};
  }
  // shortcut: text-only layout compaction; page/raster selection requires a versioned extractor receipt.
  const text=source.preparedText.replace(/\r\n/g,'\n').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n');
  bytes=Buffer.from(text,'utf8');mime='text/plain';operations=['DIRECT_UTF8_TEXT_V1','NORMALIZE_LINE_ENDINGS','TRIM_LINE_ENDS','COLLAPSE_BLANK_LINES'];
  }
 }
 const mode=modality(mime);
 if(!capability.mimes.includes(mime)||!capability.modalities.includes(mode))return {status:'UNSUPPORTED' as const,reason:'PROVIDER_MODALITY_UNSUPPORTED',sourceId:source.id,originalSha256,originalBytes,requestedMime:mime,requestedModality:mode};
 return {status:'READY' as const,sourceId:source.id,originalSha256,originalBytes,submittedSha256:sha(bytes),submittedBytes:bytes.length,mime,modality:mode,operations,bytes};
}
export const allowedPaths:Record<(typeof kinds)[number],Set<string>>={
 P1:new Set(['activity.name','activity.date','activity.time','activity.location','activity.description','activity.category','title','schedule.start.local_date','schedule.start.local_time','place.authored_label']),
 P2:new Set(['service','flight_number','marketing_flight','operating_flight','origin.place_label','destination.place_label','origin.airport_code','destination.airport_code','origin.local_date','origin.local_time','destination.local_date','destination.local_time','transport_subtype']),
 P3:new Set(['property.name','property.address','check_in.date','check_in.time','check_out.date','check_out.time','checkin.local_date','checkout.local_date','room.type','guest.name','title','schedule.start.local_date','schedule.end.local_date']),
 P4:new Set(['rental.company','rental.category','agency.name','pickup.place','pickup.place_label','pickup.date','pickup.time','return.place','return.date','return.time','driver.name','title']),
 P5:new Set(['service','service.number','operator','operator.name','origin.place_label','destination.place_label','origin.local_date','origin.local_time','destination.local_date','destination.local_time','platform','transport_subtype']),
 P6:new Set(['activity.name','activity.date','activity.time','activity.venue','activity.description','title','schedule.start.local_date','schedule.start.local_time','place.authored_label']),
};
export function validate(output:unknown,prepared:ReturnType<typeof prepare>[]){
 const parsed=responseSchema.safeParse(output);if(!parsed.success)return {status:'REJECTED' as const,reason:'INVALID_RESPONSE_SCHEMA',findings:[parsed.error.issues.map(i=>i.path.join('.')+':'+i.message).join('; ')],value:null};
 const value=parsed.data,findings:string[]=[];
 const byId=new Map(prepared.filter(p=>p.status==='READY').map(p=>[p.sourceId,p]));
 const tokens=(a:{token:string}[],what:string)=>{if(new Set(a.map(x=>x.token)).size!==a.length)findings.push('DUPLICATE_'+what+'_TOKEN');};
 tokens(value.objects,'OBJECT');tokens(value.bookings,'BOOKING');tokens(value.tickets,'TICKET');
 for(const o of value.objects)if(!subtypes[o.kind].includes(o.subtype))findings.push('TYPE_SUBTYPE_MISMATCH:'+o.token);
 const objectTokens=new Set(value.objects.map(o=>o.token)),bookingTokens=new Set(value.bookings.map(b=>b.token)),ticketTokens=new Set(value.tickets.map(t=>t.token));
 const fields=[...value.objects.flatMap(o=>o.fields),...value.bookings.flatMap(b=>[b.supplier,b.reference,...b.fields]),...value.tickets.map(t=>t.label)];
 for(const o of value.objects)for(const f of o.fields)if(!allowedPaths[o.kind].has(f.path))findings.push('TYPE_FIELD_MISMATCH:'+o.kind+':'+f.path);
 for(const b of value.bookings){if(b.supplier.path!=='booking.supplier'||b.reference.path!=='booking.reference')findings.push('BOOKING_FIELD_MISMATCH:'+b.token);for(const f of b.fields)if(!/^(?:booking\.[a-z_]+|property\.[a-z_]+)$/.test(f.path))findings.push('BOOKING_FIELD_MISMATCH:'+f.path);}
 for(const t of value.tickets)if(!['ticket.label','entitlement.label'].includes(t.label.path))findings.push('TICKET_FIELD_MISMATCH:'+t.token);
 for(const f of fields){const p=byId.get(f.sourceId);if(!p||p.status!=='READY'){findings.push('UNKNOWN_SOURCE:'+f.sourceId);continue;}const bytes=p.bytes;
  if('region' in f){const r=f.region,size=imageDimensions(bytes,p.mime);if(p.modality!=='IMAGE'||r.imageSha256!==p.submittedSha256||!size||r.x+r.width>size.width||r.y+r.height>size.height)findings.push('IMAGE_EVIDENCE_INVALID:'+f.sourceId+':'+f.path);}
  else if(p.modality!=='TEXT'||f.end<=f.start||f.end>bytes.length||!Buffer.from(f.raw).equals(bytes.subarray(f.start,f.end)))findings.push('EVIDENCE_MISMATCH:'+f.sourceId+':'+f.path);
  if(/(?:source_instant|coreAirportBinding|canonicalId)$/i.test(f.path))findings.push('FORBIDDEN_AUTHORITY_FIELD:'+f.path);
 }
 for(const o of value.objects){for(const t of o.bookingTokens)if(!bookingTokens.has(t))findings.push('BOOKING_LINK_UNKNOWN:'+t);for(const t of o.ticketTokens)if(!ticketTokens.has(t))findings.push('TICKET_LINK_UNKNOWN:'+t);}
 for(const b of value.bookings)for(const t of b.objectTokens)if(!objectTokens.has(t))findings.push('BOOKING_OBJECT_UNKNOWN:'+t);
 for(const t of value.tickets)for(const token of t.objectTokens)if(!objectTokens.has(token))findings.push('TICKET_OBJECT_UNKNOWN:'+token);
 for(const o of value.objects){for(const t of o.bookingTokens)if(!value.bookings.find(b=>b.token===t)?.objectTokens.includes(o.token))findings.push('BOOKING_LINK_ASYMMETRIC:'+t);for(const t of o.ticketTokens)if(!value.tickets.find(x=>x.token===t)?.objectTokens.includes(o.token))findings.push('TICKET_LINK_ASYMMETRIC:'+t);}
 for(const b of value.bookings)for(const token of b.objectTokens)if(!value.objects.find(o=>o.token===token)?.bookingTokens.includes(b.token))findings.push('BOOKING_LINK_ASYMMETRIC:'+b.token);
 for(const t of value.tickets)for(const token of t.objectTokens)if(!value.objects.find(o=>o.token===token)?.ticketTokens.includes(t.token))findings.push('TICKET_LINK_ASYMMETRIC:'+t.token);
 for(const u of value.unresolved)if(!byId.has(u.sourceId))findings.push('UNRESOLVED_SOURCE_UNKNOWN:'+u.sourceId);
 return findings.length?{status:'REJECTED' as const,reason:'VALIDATION_FINDINGS',findings,value:null}:{status:'ACCEPTED' as const,reason:null,findings:[],value};
}
export function reconcile(value:LlmResponse,runId:string){
 const stable=(type:string,token:string)=>sha(runId+'|'+type+'|'+token).slice(0,24);
 const objects=value.objects.map(o=>({id:stable('object',o.token),...o,validation:'CANDIDATE_VALIDATED',admission:'NOT_RUN',closure:'POLICY_PENDING',visualReviewRequired:o.fields.some(f=>'region' in f)}));
 const reviews:{status:string;reason:string;tokens:string[]}[]=[];
 const unresolved=[...value.unresolved];
 const bookings=value.bookings.map(b=>({id:stable('booking',b.token),...b,relationCandidateWith:[] as string[]}));
 for(let i=0;i<bookings.length;i++)for(let j=i+1;j<bookings.length;j++){
  const a=bookings[i],b=bookings[j];
  if(a.supplier.raw.toUpperCase()!==b.supplier.raw.toUpperCase()||a.reference.raw!==b.reference.raw)continue;
  const facts=new Map(a.fields.map(f=>[f.path,f.raw]));const conflict=b.fields.some(f=>facts.has(f.path)&&facts.get(f.path)!==f.raw);
  if(conflict)reviews.push({status:'REVIEW_MAPPING_PENDING',reason:'CONFLICTING_BOOKING_FACTS',tokens:[a.token,b.token]});
  else unresolved.push({sourceId:b.reference.sourceId,reason:'BOOKING_TARGET_IDENTITY_UNVERIFIED:'+a.token+':'+b.token});
 }
 const tickets=value.tickets.map(t=>({id:stable('ticket',t.token),...t,authority:'NONE'}));
 const documents=[...new Set([...value.objects.flatMap(o=>o.fields.map(f=>f.sourceId)),...value.bookings.flatMap(b=>[b.supplier.sourceId,b.reference.sourceId]),...value.tickets.map(t=>t.label.sourceId)])].map(id=>({id:stable('document',id),sourceId:id,identity:'SOURCE_ONLY'}));
 for(const o of objects)if(o.visualReviewRequired)reviews.push({status:'REVIEW_MAPPING_PENDING',reason:'VISUAL_EVIDENCE_REQUIRES_HUMAN_VERIFICATION',tokens:[o.token]});
 return {objects,bookings,tickets,documents,reviews,unresolved};
}
export async function runLlmFirst(args:{batchKey:string;sources:Source[];path:Path;provider:Provider;store:PrivateStore;signal?:AbortSignal;defer?:boolean;resume?:boolean;timeoutMs?:number}){
 const {batchKey,sources,path,provider,store,signal}=args;
 if(provider.mode!=='MOCK')throw Error('REAL_PROVIDER_NOT_AUTHORIZED_IN_LAB');
 if(!sources.length||sources.length>64||new Set(sources.map(s=>s.id)).size!==sources.length)throw Error('SOURCE_MANIFEST_INVALID');
 const preparationStarted=performance.now();
 const prepared=sources.map(s=>prepare(s,path,provider.capability));
 const preparationMs=Math.round((performance.now()-preparationStarted)*100)/100;
 const pins=sources.map(s=>({id:s.id,sha256:sha(s.bytes),bytes:s.bytes.length}));
 const runId=sha(JSON.stringify({version:3,batchKey,pins,path,provider:provider.name,model:provider.model,capability:provider.capability,preparation:prepared.map(p=>({sourceId:p.sourceId,status:p.status,submittedSha256:p.status==='READY'?p.submittedSha256:null,operations:p.status==='READY'?p.operations:[]}))})).slice(0,32);
 const active=activeRuns.get(runId);if(active)return {...await active,replayed:true};
 const work=(async()=>{
 const receiptName=`llm-first-${runId}.json`;
 try{const previous=store.read(receiptName) as any;if(previous.runId===runId&&!(previous.status==='PENDING_INTERPRETATION'&&args.resume))return {...previous,replayed:true};}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 const header={version:'otr-workbench-llm-first/1',runId,batchKey,path,provider:provider.name,model:provider.model,execution:'MOCK' as const,createdAt:new Date().toISOString(),preparationMs,uploadMs:null,capability:provider.capability,representations:prepared.map(({bytes,...p})=>p),usage:{inputTokens:null,outputTokens:null,source:'UNAVAILABLE',costUsd:null},retry:{attempts:0,maxAttempts:1},admission:'NOT_RUN',canonicalWrites:false};
 if(args.defer){const receipt={...header,status:'PENDING_INTERPRETATION',validation:null,proposals:null,error:null};store.save(receiptName,receipt);return receipt;}
 if(prepared.every(p=>p.status!=='READY')){const receipt={...header,status:'UNSUPPORTED',validation:null,proposals:null,error:'INPUT_MODALITY_UNSUPPORTED'};store.save(receiptName,receipt);return receipt;}
 if(signal?.aborted){const receipt={...header,status:'CANCELLED',validation:null,proposals:null,error:'CANCELLED_BEFORE_EXECUTION'};store.save(receiptName,receipt);return receipt;}
 const ready=prepared.filter((p):p is Extract<ReturnType<typeof prepare>,{status:'READY'}>=>p.status==='READY');
 const request={runId,schema:'otr-workbench-llm-interpretation/1',representations:ready.map(p=>({sourceId:p.sourceId,mime:p.mime,modality:p.modality,bytes:p.bytes,sha256:p.submittedSha256}))};
 // A durable dispatch marker prevents a crash or uncertain timeout from silently repeating a billable call.
 store.save(receiptName,{...header,status:'EXECUTION_OUTCOME_UNKNOWN',validation:null,proposals:null,error:'DISPATCH_STARTED',retry:{attempts:1,maxAttempts:1}});
 let receipt:any;
 try{
  const timeoutMs=args.timeoutMs??30000;
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000)throw Error('TIMEOUT_INVALID');
  const result=await new Promise<Awaited<ReturnType<Provider['execute']>>>((resolve,reject)=>{
   const controller=new AbortController();
   let settled=false;
   const finish=(fn:(value:any)=>void,value:any)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancelled);fn(value);};
   const timer=setTimeout(()=>{controller.abort();finish(reject,Error('TIMEOUT_UNCONFIRMED'));},timeoutMs);
   const cancelled=()=>{controller.abort();finish(reject,Error('CANCELLED_UNCONFIRMED'));};
   signal?.addEventListener('abort',cancelled,{once:true});
   Promise.resolve().then(()=>provider.execute(request,controller.signal)).then(value=>finish(resolve,value),error=>finish(reject,error));
  });
  const validation=validate(result.output,prepared);receipt={...header,status:validation.status==='ACCEPTED'&&ready.length<prepared.length?'PARTIAL_ACCEPTED':validation.status,validation:{status:validation.status,reason:validation.reason,findings:validation.findings},proposals:validation.value?{...reconcile(validation.value,runId),unresolved:[...validation.value.unresolved,...prepared.filter(p=>p.status!=='READY').map(p=>({sourceId:p.sourceId,reason:p.reason}))]}:null,usage:{inputTokens:null,outputTokens:null,source:'SYNTHETIC',costUsd:null},latencyMs:result.latencyMs,retry:{attempts:1,maxAttempts:1},error:null};}
 catch(error){const message=error instanceof Error?error.message:'PROVIDER_FAILURE';const uncertain=message==='TIMEOUT_UNCONFIRMED'||message==='CANCELLED_UNCONFIRMED';const code=uncertain?'EXECUTION_OUTCOME_UNKNOWN':'PROVIDER_FAILURE';receipt={...header,status:code,validation:null,proposals:null,error:message,retry:{attempts:1,maxAttempts:1}};}
 store.save(receiptName,receipt);return receipt;
 })();
 activeRuns.set(runId,work);
 try{return await work;}finally{if(activeRuns.get(runId)===work)activeRuns.delete(runId);}
}
