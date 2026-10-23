import {allowedPaths,imageDimensions,prepare,reconcile,validate} from './llm-first';
import {compactSchema,expandCompact,normalizeCompactEnums,normalizeCompactTicketEvidence} from './real-llm-compact';

export type Ready={sourceId:string;modality:string;submittedSha256:string;mime:string;bytes:Buffer};
export type OcrReceipt={version:'real-llm-01-local-ocr/1';sourceId:string;sourceSha256:string;sourceBytes?:number;imageWidth?:number;imageHeight?:number;pageIndex?:number;engine:'apple-vision';observations:{text:string;confidence?:number;boundingBox:{x:number;y:number;width:number;height:number}}[]};
type EvidenceStatus='TEXT_VERIFIED'|'OCR_CORROBORATED_ADVISORY'|'VISUAL_CANDIDATE_UNVERIFIED'|'BUSINESS_ROLE_UNVERIFIED'|'IMAGE_REGION_INVALID'|'TEXT_MISSING_OR_AMBIGUOUS'|'WRONG_SOURCE'|'UNSUPPORTED_PATH'|'CONTRADICTORY_FACT'|'DUPLICATE_FACT';
type Diagnostic={object:string;path:string;raw:string;sourceId:string|null;status:EvidenceStatus;ocrLine?:string;modelRegion?:unknown};
type Evidence=readonly unknown[];

function verifiedTextSpan(bytes:Buffer,e:Evidence,raw:string){
 const needle=Buffer.from(raw,'utf8'),first=bytes.indexOf(needle);
 if(first<0)return null;
 const start=e.length===5?Number(e[3]):first,end=e.length===5?Number(e[4]):start+needle.length;
 if(e.length!==5&&bytes.indexOf(needle,first+1)>=0||start<0||end!==start+needle.length||!bytes.subarray(start,end).equals(needle))return null;
 return {start,end};
}
function roleQualified(path:string,kind:string|undefined,line:string,raw:string,rawStart:number){
 const rentalRole=kind==='P4'?/^(pickup|return)\./.exec(path):null;
 const rentalField=rentalRole?.[1]&&path.slice(rentalRole[1].length+1);
 const rentalPrefix=rentalRole?(rentalField==='date'||rentalField==='time'?new RegExp(rentalRole[1]+'\\s+'+rentalField):/^(?:place|place_label)$/.test(rentalField??'')?new RegExp(rentalRole[1]+'(?:\\s+(?:place|location))?'):null):null;
 if(rentalRole&&!rentalPrefix)return false;
 const prefix=rentalPrefix??(path==='booking.supplier'?/(?:booking supplier|supplier|provider)/:path==='booking.reference'?/(?:booking\s+(?:ref(?:erence)?|number)|reservation\s+(?:ref(?:erence)?|number))/:path==='ticket.label'?/(?:ticket id(?:\s+[a-z0-9]+)?|ticket number|ticket no\.?|ticket reference)/:path==='activity.venue'?/(?:venue)/:path==='rental.company'||path==='agency.name'?/(?:rental company|company|supplier|provider)/:kind==='P5'&&path==='service'?/(?:(?:servizio\s*\/\s*)?service|train(?:\s+service)?|bus(?:\s+service)?|ferry(?:\s+service)?)/:kind==='P5'&&(path==='operator'||path==='operator.name')?/(?:operator|operatore|operated by|carrier)/:null);
 if(!prefix)return true;
 const label=new RegExp('^\\s*(?:<[^>]+>\\s*)*'+prefix.source+'\\s*:', 'i').exec(line);
 if(!label)return false;
 const nextField=/(?:\s*\|\s*|\s*;\s*|\s+(?:document\s+title|title|supplier|provider|operator|service|booking\s+ref|reference|company|date|time)\s*:|<\/)/i.exec(line.slice(label[0].length));
 const valueEnd=label[0].length+(nextField?.index??line.slice(label[0].length).length);
 return rawStart>=label[0].length&&rawStart+raw.length<=valueEnd;
}
function uniquelyRoleBoundSpan(bytes:Buffer,path:string,kind:string|undefined,raw:string){
 if(!['booking.supplier','booking.reference','ticket.label','activity.venue'].includes(path))return null;
 const needle=Buffer.from(raw,'utf8'),matches:{start:number;end:number}[]=[];
 for(let at=bytes.indexOf(needle);at>=0;at=bytes.indexOf(needle,at+1)){
  const lineStart=bytes.lastIndexOf(10,at-1)+1,lineEnd=bytes.indexOf(10,at+needle.length);
  const line=bytes.subarray(lineStart,lineEnd<0?bytes.length:lineEnd).toString('utf8');
  const charStart=bytes.subarray(lineStart,at).toString('utf8').length;
  if(roleQualified(path,kind,line,raw,charStart))matches.push({start:at,end:at+needle.length});
 }
 return matches.length===1?matches[0]:null;
}
function structuredLocalDate(bytes:Buffer,path:string,raw:string,sourceIndex:number,fields:Evidence[]|undefined){
 if(!/^(?:origin|destination)\.local_date$/.test(path)||!/^\d{4}-\d{2}-\d{2}$/.test(raw)||!fields)return null;
 const clockPath=path.replace('local_date','local_time');
 const clocks=fields.filter(e=>e[0]===sourceIndex&&e[1]===clockPath&&typeof e[2]==='string');
 if(clocks.length!==1)return null;
 const clock=verifiedTextSpan(bytes,clocks[0],clocks[0][2] as string);
 if(!clock||!/^\d{2}:\d{2}$/.test(clocks[0][2] as string))return null;
 const lines:{start:number;end:number;text:string}[]=[];
 for(let start=0;start<bytes.length;){const next=bytes.indexOf(10,start),end=next<0?bytes.length:next;lines.push({start,end,text:bytes.subarray(start,end).toString('utf8')});start=end+1;}
 const role=path.startsWith('origin.')?/^\s*(?:<[^>]+>\s*)*(?:departure|depart)\s*[:|]/i:/^\s*(?:<[^>]+>\s*)*(?:arrival|arrive)\s*[:|]/i;
 const anyRole=/^\s*(?:<[^>]+>\s*)*(?:departure|depart|arrival|arrive)\s*[:|]/i;
 const needle=Buffer.from(raw),matches:{start:number;end:number}[]=[];
 for(let i=0;i<lines.length;i++){
  if(!role.test(lines[i].text))continue;
  let last=i;while(last+1<lines.length&&last<i+2&&!anyRole.test(lines[last+1].text)&&/^(?:(?:Date|Time)\s*:\s*)?(?:\d{4}-\d{2}-\d{2}|\d{2}:\d{2})\s*$/i.test(lines[last+1].text.trim()))last++;
  const blockStart=lines[i].start,blockEnd=lines[last].end;
  if(blockEnd-blockStart>256||clock.start<blockStart||clock.end>blockEnd)continue;
  const block=bytes.subarray(blockStart,blockEnd),at=block.indexOf(needle);
  if(at<0||block.indexOf(needle,at+1)>=0)continue;
  matches.push({start:blockStart+at,end:blockStart+at+needle.length});
 }
 return matches.length===1?matches[0]:null;
}

function unqualifiedForwardedTicket(bytes:Buffer){
 // shortcut: withhold all P6 items from a source-only forwarded notice; mixed independent grants need a source-scoped rights reader.
 const text=bytes.toString('utf8').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
 return /\bforwarded\b|转发/.test(text.toLowerCase())&&/(?:transfer|admission|entry)\s+(?:right|rights|permission).{0,40}\b(?:not confirmed|unconfirmed|unknown|not verified)\b|(?:转让资格|入场权|入场资格).{0,20}(?:未确认|无法确认|不确定)/i.test(text);
}

function normalizeBookingShape(raw:unknown,ready:Ready[]){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!Array.isArray((raw as {bookings?:unknown}).bookings))return raw;
 const bookings=(raw as {bookings:unknown[]}).bookings.map(value=>{
  if(!value||typeof value!=='object'||Array.isArray(value))return value;
  const b=value as Record<string,unknown>;
  const located=(path:'booking.supplier'|'booking.reference',text:unknown)=>{
   if(typeof text!=='string'||!text)return text;
   const matches=ready.flatMap((source,index)=>source.modality==='TEXT'&&uniquelyRoleBoundSpan(source.bytes,path,undefined,text)?[[index,text]]:[]);
   return matches.length===1?matches[0]:text;
  };
  const supplier=located('booking.supplier',b.supplier),reference=located('booking.reference',b.reference);
  const f=Array.isArray(b.f)?b.f.filter(e=>{
   if(!Array.isArray(e)||e.length!==2||!Number.isInteger(e[0])||typeof e[1]!=='string')return true;
   const match=/^\s*(Booking supplier|Booking ref)\s*:\s*(.+?)\s*$/i.exec(e[1]);
   if(!match)return true;
   const fixed=match[1].toLowerCase()==='booking supplier'?supplier:reference;
   const source=ready[e[0]];
   return !(Array.isArray(fixed)&&fixed[0]===e[0]&&fixed[1]===match[2]&&source?.modality==='TEXT'&&source.bytes.includes(Buffer.from(e[1])));
  }):b.f;
  return {...b,supplier,reference,f};
 });
 return {...raw,bookings};
}

// Only a separately hashed OCR observation may locate image text. A model rectangle is advisory.
export function inspectCompactEvidence(raw:unknown,ready:Ready[],prepared:ReturnType<typeof prepare>[],ocrReceipts:OcrReceipt[]=[],runId='LOCAL_REPLAY_ONLY'){
 const normalized=normalizeCompactEnums(raw),ticketShape=normalizeCompactTicketEvidence(normalized.value),normalizations=[...normalized.changes,...ticketShape.changes];
 const bookingShape=normalizeBookingShape(ticketShape.value,ready);
 const parsed=compactSchema.safeParse(bookingShape);
 const schemaFindings=parsed.success?[]:parsed.error.issues.map(i=>i.path.join('.')+':'+i.message);
 // A malformed Booking/Ticket cannot invalidate a separately well-formed Trip Item.
 const original=bookingShape as Record<string,unknown>|null;
 const partial=!parsed.success&&original&&typeof original==='object'&&!Array.isArray(original)&&Array.isArray(original.items)&&Array.isArray(original.bookings)&&Array.isArray(original.tickets)&&Array.isArray(original.links)&&Array.isArray(original.issues)
  ?compactSchema.safeParse({...original,items:original.items.filter(i=>compactSchema.shape.items.element.safeParse(i).success),bookings:original.bookings.filter(b=>compactSchema.shape.bookings.element.safeParse(b).success),tickets:original.tickets.filter(t=>compactSchema.shape.tickets.element.safeParse(t).success),links:original.links.filter(l=>compactSchema.shape.links.element.safeParse(l).success),issues:original.issues.filter(i=>compactSchema.shape.issues.element.safeParse(i).success)})
  :null;
 if(!parsed.success&&(!partial?.success||Array.isArray(original?.items)&&original.items.length>0&&partial.data.items.length===0))return {normalizations,schemaValidity:'INVALID' as const,schemaFindings,fieldEvidence:[] as Diagnostic[],businessCandidateValidation:'NOT_RUN' as const,businessFindings:[] as string[],proposals:null,unresolved:[] as {sourceId:string;reason:string}[]};
 const wire=(parsed.success?parsed.data:partial?.data)!,diagnostics:Diagnostic[]=[],unresolved:{sourceId:string;reason:string}[]=[],businessFindings:string[]=[];
 if(!parsed.success)unresolved.push({sourceId:'BATCH',reason:'MALFORMED_OBJECTS_WITHHELD'});
 const resolve=(e:Evidence,object:string,path:string,rawText:string,sourceIndex:number,kind?:string,fields?:Evidence[]):unknown[]|null=>{
  const source=ready[sourceIndex],modelRegion=e.length===4?e[3]:e.length===3&&typeof e[2]==='object'?e[2]:undefined;
  const report=(status:EvidenceStatus,ocrLine?:string)=>{diagnostics.push({object,path,raw:rawText,sourceId:source?.sourceId??null,status,...(ocrLine?{ocrLine}:{}),...(modelRegion?{modelRegion}:{})});if(status!=='TEXT_VERIFIED'&&status!=='OCR_CORROBORATED_ADVISORY')unresolved.push({sourceId:source?.sourceId??'UNKNOWN',reason:status+':'+path});};
  if(!source){report('WRONG_SOURCE');return null;}
  if(source.modality==='TEXT'){
   if(modelRegion){report('WRONG_SOURCE');return null;}
   const direct=verifiedTextSpan(source.bytes,e,rawText)??(e.length===5?null:uniquelyRoleBoundSpan(source.bytes,path,kind,rawText));
   const hasClock=/^(?:origin|destination)\.local_date$/.test(path)&&fields?.some(f=>f[0]===sourceIndex&&f[1]===path.replace('local_date','local_time'));
   const structured=hasClock?structuredLocalDate(source.bytes,path,rawText,sourceIndex,fields):null;
   const span=hasClock?(structured&&(e.length!==5||direct?.start===structured.start)?structured:null):direct;
   if(!span){report('TEXT_MISSING_OR_AMBIGUOUS');return null;}
   const lineStart=source.bytes.lastIndexOf(10,span.start-1)+1,lineEnd=source.bytes.indexOf(10,span.end);
   const line=source.bytes.subarray(lineStart,lineEnd<0?source.bytes.length:lineEnd).toString('utf8');
   const rawStart=source.bytes.subarray(lineStart,span.start).toString('utf8').length;
   if(!roleQualified(path,kind,line,rawText,rawStart)){report('BUSINESS_ROLE_UNVERIFIED');return null;}
   report('TEXT_VERIFIED');return [sourceIndex,path,rawText,span.start,span.end];
  }
  if(source.modality!=='IMAGE'){report('WRONG_SOURCE');return null;}
  if(e.length===5){report('WRONG_SOURCE');return null;}
  const size=imageDimensions(source.bytes,source.mime);
  if(!size){report('IMAGE_REGION_INVALID');return null;}
  if(modelRegion){const b=modelRegion as {x:number;y:number;w:number;h:number};if(!Number.isInteger(b.x)||!Number.isInteger(b.y)||!Number.isInteger(b.w)||!Number.isInteger(b.h)||b.x<0||b.y<0||b.w<=0||b.h<=0||b.x+b.w>size.width||b.y+b.h>size.height){report('IMAGE_REGION_INVALID');return null;}}
  const receipt=ocrReceipts.find(r=>r.sourceId===source.sourceId&&r.sourceSha256===source.submittedSha256&&r.engine==='apple-vision'&&r.version==='real-llm-01-local-ocr/1'&&(source.mime==='image/jpeg'?r.sourceBytes===source.bytes.length&&r.imageWidth===size.width&&r.imageHeight===size.height&&r.pageIndex===0:(r.sourceBytes===undefined||r.sourceBytes===source.bytes.length)&&(r.imageWidth===undefined||r.imageWidth===size.width)&&(r.imageHeight===undefined||r.imageHeight===size.height)&&(r.pageIndex===undefined||r.pageIndex===0)));
  let observations=receipt?.observations.filter(o=>o.text.includes(rawText)&&(o.confidence===undefined||o.confidence>=.5))??[];
  if(observations.length>1&&/^(pickup|return)\./.test(path))observations=observations.filter(o=>o.text.toLowerCase().startsWith(path.split('.')[0]+':'));
  if(observations.length!==1){report('VISUAL_CANDIDATE_UNVERIFIED');return null;}
  const observation=observations[0],b=observation.boundingBox;
  if(!Number.isFinite(b.x)||!Number.isFinite(b.y)||!Number.isFinite(b.width)||!Number.isFinite(b.height)||b.x<0||b.y<0||b.width<=0||b.height<=0||b.x+b.width>1.000001||b.y+b.height>1.000001){report('VISUAL_CANDIDATE_UNVERIFIED');return null;}
  const ocrValueAt=observation.text.indexOf(rawText);
  if(ocrValueAt<0||observation.text.indexOf(rawText,ocrValueAt+1)>=0||!roleQualified(path,kind,observation.text,rawText,ocrValueAt)){report('BUSINESS_ROLE_UNVERIFIED',observation.text);return null;}
  const ocrBox={x:Math.floor(b.x*size.width),y:Math.floor(b.y*size.height),w:Math.ceil((b.x+b.width)*size.width)-Math.floor(b.x*size.width),h:Math.ceil((b.y+b.height)*size.height)-Math.floor(b.y*size.height)};
  if(modelRegion){const m=modelRegion as {x:number;y:number;w:number;h:number};const overlap=Math.max(0,Math.min(m.x+m.w,ocrBox.x+ocrBox.w)-Math.max(m.x,ocrBox.x))*Math.max(0,Math.min(m.y+m.h,ocrBox.y+ocrBox.h)-Math.max(m.y,ocrBox.y));if(overlap<ocrBox.w*ocrBox.h*.5||m.w*m.h>ocrBox.w*ocrBox.h*4){report('VISUAL_CANDIDATE_UNVERIFIED');return null;}}
  report('OCR_CORROBORATED_ADVISORY',observation.text);
  return [sourceIndex,path,rawText,ocrBox];
 };
 const items=wire.items.flatMap(item=>{
  const cited=new Set(item.f.map(e=>e[0]));
  if(item.kind==='P6'&&cited.size>0&&[...cited].every(index=>ready[index]?.modality==='TEXT'&&unqualifiedForwardedTicket(ready[index].bytes))){
   for(const index of cited)unresolved.push({sourceId:ready[index].sourceId,reason:'FORWARDED_TICKET_RIGHTS_UNVERIFIED'});
   return [];
  }
  const seen=new Map<string,string>();let conflict=false;
  for(const e of item.f){const earlier=seen.get(e[1]);if(earlier!==undefined){diagnostics.push({object:item.id,path:e[1],raw:e[2],sourceId:ready[e[0]]?.sourceId??null,status:earlier===e[2]?'DUPLICATE_FACT':'CONTRADICTORY_FACT'});conflict=true;}else seen.set(e[1],e[2]);}
  if(conflict){businessFindings.push('DUPLICATE_OR_CONTRADICTORY_FACT:'+item.id);return [];}
  const f=item.f.flatMap(e=>{if(!allowedPaths[item.kind].has(e[1])){diagnostics.push({object:item.id,path:e[1],raw:e[2],sourceId:ready[e[0]]?.sourceId??null,status:'UNSUPPORTED_PATH'});unresolved.push({sourceId:ready[e[0]]?.sourceId??'UNKNOWN',reason:'UNSUPPORTED_PATH:'+e[1]});return [];}const located=resolve(e,item.id,e[1],e[2],e[0],item.kind,item.f);return located?[located]:[];});
  return f.length?[{...item,f}]:[];
 });
 // Image Booking/Ticket claims remain diagnostic until their business identity is independently reviewed.
 const fixed=(located:unknown[])=>located.length===5?[located[0],located[2],located[3],located[4]]:[located[0],located[2],located[3]];
 const fixedField=(e:Evidence,path:string):unknown[]=>e.length===2?[e[0],path,e[1]]:e.length===4?[e[0],path,e[1],e[2],e[3]]:[e[0],path,e[1],e[2]];
 const bookings=wire.bookings.flatMap(b=>{
  const seen=new Map<string,string>([['booking.supplier',b.supplier[1]],['booking.reference',b.reference[1]]]);let conflict=false;
  for(const e of b.f){const earlier=seen.get(e[1]);if(earlier!==undefined){diagnostics.push({object:b.id,path:e[1],raw:e[2],sourceId:ready[e[0]]?.sourceId??null,status:earlier===e[2]?'DUPLICATE_FACT':'CONTRADICTORY_FACT'});conflict=true;}else seen.set(e[1],e[2]);}
  if(conflict){businessFindings.push('DUPLICATE_OR_CONTRADICTORY_BOOKING_FACT:'+b.id);unresolved.push({sourceId:ready[b.supplier[0]]?.sourceId??'UNKNOWN',reason:'BOOKING_FACT_CONFLICT:'+b.id});return [];}
  const supplier=resolve(fixedField(b.supplier,'booking.supplier'),b.id,'booking.supplier',b.supplier[1],b.supplier[0]),reference=resolve(fixedField(b.reference,'booking.reference'),b.id,'booking.reference',b.reference[1],b.reference[0]);
  const fields=b.f.map(e=>resolve(e,b.id,e[1],e[2],e[0]));
  const imageIdentity=ready[b.supplier[0]]?.modality==='IMAGE'||ready[b.reference[0]]?.modality==='IMAGE';
  if(imageIdentity||!supplier||!reference||fields.some(f=>!f)){unresolved.push({sourceId:ready[b.supplier[0]]?.sourceId??'UNKNOWN',reason:imageIdentity?'IMAGE_BOOKING_IDENTITY_UNVERIFIED':'BOOKING_EVIDENCE_UNVERIFIED'});return [];}
  return [{...b,supplier:fixed(supplier),reference:fixed(reference),f:fields as unknown[][]}];
 });
 const tickets=wire.tickets.flatMap(t=>{const located=resolve(fixedField(t.label,'ticket.label'),t.id,'ticket.label',t.label[1],t.label[0]);const imageIdentity=ready[t.label[0]]?.modality==='IMAGE',linked=wire.links.some(l=>l[0]==='T'&&l[1]===t.id&&items.some(i=>i.id===l[2]&&i.kind==='P6'));
  if(imageIdentity||!located||!linked){unresolved.push({sourceId:ready[t.label[0]]?.sourceId??'UNKNOWN',reason:imageIdentity?'IMAGE_TICKET_IDENTITY_UNVERIFIED':!located?'TICKET_EVIDENCE_UNVERIFIED':'TICKET_TARGET_UNVERIFIED'});return [];}return [{...t,label:fixed(located)}];});
 const itemIds=new Set(items.map(i=>i.id)),bookingIds=new Set(bookings.map(b=>b.id)),ticketIds=new Set(tickets.map(t=>t.id));
 const safe={...wire,items,bookings,tickets,links:wire.links.filter(l=>itemIds.has(l[2])&&(l[0]==='B'?bookingIds.has(l[1]):ticketIds.has(l[1])))};
 const schemaValidity=parsed.success?'VALID' as const:'PARTIAL' as const;
 const empty=()=>({...safe,items:[],bookings:[],tickets:[],links:[],issues:[]});
 const qualifiedItems=items.filter(item=>{
  try{const checked=validate(expandCompact({...empty(),items:[item]},ready),prepared);if(checked.status==='ACCEPTED')return true;businessFindings.push(...checked.findings.map(f=>'ITEM:'+item.id+':'+f));}
  catch(error){businessFindings.push('ITEM:'+item.id+':'+(error instanceof Error?error.message:'COMPACT_DECODE_FAILURE'));}
  unresolved.push({sourceId:ready[Number(item.f[0]?.[0])]?.sourceId??'UNKNOWN',reason:'ITEM_TYPED_VALIDATION_FAILED:'+item.id});return false;
 });
 const qualifiedIds=new Set(qualifiedItems.map(i=>i.id));
 const qualifiedBookings=bookings.filter(b=>safe.links.some(l=>l[0]==='B'&&l[1]===b.id&&qualifiedIds.has(l[2])));
 const qualifiedTickets=tickets.filter(t=>safe.links.some(l=>l[0]==='T'&&l[1]===t.id&&qualifiedIds.has(l[2])));
 const qualified={...safe,items:qualifiedItems,bookings:qualifiedBookings,tickets:qualifiedTickets,links:safe.links.filter(l=>qualifiedIds.has(l[2])&&(l[0]==='B'?qualifiedBookings.some(b=>b.id===l[1]):qualifiedTickets.some(t=>t.id===l[1])))};
 if(!qualifiedItems.length&&!qualifiedBookings.length&&!qualifiedTickets.length)return {normalizations,schemaValidity,schemaFindings,fieldEvidence:diagnostics,businessCandidateValidation:businessFindings.length?'REJECTED' as const:'NOT_RUN' as const,businessFindings,proposals:null,unresolved};
 try{const expanded=expandCompact(qualified,ready),checked=validate(expanded,prepared);if(checked.status!=='ACCEPTED')return {normalizations,schemaValidity,schemaFindings,fieldEvidence:diagnostics,businessCandidateValidation:'REJECTED' as const,businessFindings:[...businessFindings,...checked.findings],proposals:null,unresolved};const proposals=reconcile(checked.value!,runId);proposals.unresolved.push(...unresolved);return {normalizations,schemaValidity,schemaFindings,fieldEvidence:diagnostics,businessCandidateValidation:'ACCEPTED' as const,businessFindings,proposals,unresolved};}
 catch(error){return {normalizations,schemaValidity,schemaFindings,fieldEvidence:diagnostics,businessCandidateValidation:'REJECTED' as const,businessFindings:[...businessFindings,error instanceof Error?error.message:'COMPACT_DECODE_FAILURE'],proposals:null,unresolved};}
}
