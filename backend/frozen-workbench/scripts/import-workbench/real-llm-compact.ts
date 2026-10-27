import {z} from 'zod';
import {subtypes,type LlmResponse} from './llm-first';

// Transport-only compression. The adapter expands this into the existing Workbench validator contract.
const textEvidence=z.tuple([z.number().int().min(0),z.string().min(1),z.string().min(1),z.number().int().min(0),z.number().int().positive()]);
const locatedTextEvidence=z.tuple([z.number().int().min(0),z.string().min(1),z.string().min(1)]);
const visualEvidence=z.tuple([z.number().int().min(0),z.string().min(1),z.string().min(1),z.strictObject({x:z.number().int().min(0),y:z.number().int().min(0),w:z.number().int().positive(),h:z.number().int().positive()})]);
const evidence=z.union([locatedTextEvidence,textEvidence,visualEvidence]);
const fixedEvidence=z.union([
 z.tuple([z.number().int().min(0),z.string().min(1)]),
 z.tuple([z.number().int().min(0),z.string().min(1),z.number().int().min(0),z.number().int().positive()]),
 z.tuple([z.number().int().min(0),z.string().min(1),z.strictObject({x:z.number().int().min(0),y:z.number().int().min(0),w:z.number().int().positive(),h:z.number().int().positive()})]),
]);
const item=z.strictObject({id:z.string().min(1).max(40),kind:z.enum(['P1','P2','P3','P4','P5','P6']),subtype:z.string().min(1).max(40),f:z.array(evidence).min(1).max(32)});
const booking=z.strictObject({id:z.string().min(1).max(40),supplier:fixedEvidence,reference:fixedEvidence,f:z.array(evidence).max(16).default([])});
const ticket=z.strictObject({id:z.string().min(1).max(40),label:fixedEvidence});
export const compactSchema=z.strictObject({v:z.literal(2),items:z.array(item).max(64),bookings:z.array(booking).max(64),tickets:z.array(ticket).max(64),links:z.array(z.tuple([z.enum(['B','T']),z.string().min(1),z.string().min(1)])).max(128),issues:z.array(z.tuple([z.number().int().min(0),z.string().min(1).max(300)])).max(64)});
export const COMPACT_PROMPT_VERSION='real-llm-01-compact/5';
export type EnumNormalization={object:string;field:'kind'|'subtype'|'ticket.label';raw:string;canonical:string};
export function normalizeCompactTicketEvidence(raw:unknown){
 const changes:EnumNormalization[]=[];
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!Array.isArray((raw as {tickets?:unknown}).tickets))return {value:raw,changes};
 const tickets=(raw as {tickets:unknown[]}).tickets.map((ticket,index)=>{
  if(!ticket||typeof ticket!=='object'||Array.isArray(ticket))return ticket;
  const original=ticket as Record<string,unknown>,label=original.label;
  if(!Array.isArray(label)||label.length!==1||!fixedEvidence.safeParse(label[0]).success)return ticket;
  changes.push({object:typeof original.id==='string'?original.id:`#${index}`,field:'ticket.label',raw:JSON.stringify(label),canonical:JSON.stringify(label[0])});
  return {...original,label:label[0]};
 });
 return {value:{...raw,tickets},changes};
}
export function normalizeCompactEnums(raw:unknown){
 const changes:EnumNormalization[]=[];
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!Array.isArray((raw as {items?:unknown}).items))return {value:raw,changes};
 const canonical=(value:unknown,choices:readonly string[])=>typeof value==='string'&&/^[A-Za-z0-9_]+$/.test(value)&&choices.includes(value.toUpperCase())?value.toUpperCase():value;
 const items=(raw as {items:unknown[]}).items.map((item,index)=>{
  if(!item||typeof item!=='object'||Array.isArray(item))return item;
  const original=item as Record<string,unknown>,object=typeof original.id==='string'?original.id:`#${index}`;
  const kind=canonical(original.kind,Object.keys(subtypes));
  const literal=kind==='P3'&&original.subtype==='HOTEL'?'ACCOMMODATION':original.subtype;
  const subtype=typeof kind==='string'&&Object.hasOwn(subtypes,kind)?canonical(literal,subtypes[kind as keyof typeof subtypes]):literal;
  if(kind!==original.kind)changes.push({object,field:'kind',raw:original.kind as string,canonical:kind as string});
  if(subtype!==original.subtype)changes.push({object,field:'subtype',raw:original.subtype as string,canonical:subtype as string});
  return {...original,kind,subtype};
 });
 return {value:{...raw,items},changes};
}
type Ready={sourceId:string;modality:string;submittedSha256:string;bytes?:Buffer};
export function expandCompact(raw:unknown,ready:Ready[]):LlmResponse{
 const wire=compactSchema.parse(raw);
 const field=(e:z.infer<typeof evidence>)=>{
  const source=ready[e[0]];if(!source)throw Error('COMPACT_SOURCE_INDEX_INVALID');
  if(e.length===3){if(source.modality!=='TEXT'||!source.bytes)throw Error('COMPACT_TEXT_SOURCE_INVALID');const needle=Buffer.from(e[2],'utf8'),start=source.bytes.indexOf(needle);if(start<0||source.bytes.indexOf(needle,start+1)>=0)throw Error('COMPACT_TEXT_NOT_UNIQUE');return {sourceId:source.sourceId,path:e[1],raw:e[2],start,end:start+needle.length};}
  return e.length===5?{sourceId:source.sourceId,path:e[1],raw:e[2],start:e[3],end:e[4]}:{sourceId:source.sourceId,path:e[1],raw:e[2],region:{imageSha256:source.submittedSha256,x:e[3].x,y:e[3].y,width:e[3].w,height:e[3].h,unit:'PIXELS' as const}};
 };
 const fixed=(e:z.infer<typeof fixedEvidence>,path:'booking.supplier'|'booking.reference'|'ticket.label')=>field((e.length===2?[e[0],path,e[1]]:e.length===4?[e[0],path,e[1],e[2],e[3]]:[e[0],path,e[1],e[2]]) as z.infer<typeof evidence>);
 const ids=new Set([...wire.items.map(x=>x.id),...wire.bookings.map(x=>x.id),...wire.tickets.map(x=>x.id)]);
 if(ids.size!==wire.items.length+wire.bookings.length+wire.tickets.length)throw Error('COMPACT_DUPLICATE_TOKEN');
 const itemIds=new Set(wire.items.map(x=>x.id)),bookIds=new Set(wire.bookings.map(x=>x.id)),ticketIds=new Set(wire.tickets.map(x=>x.id));
 const linkKeys=new Set<string>();
 for(const [type,parent,child] of wire.links){if(!itemIds.has(child)||(type==='B'?!bookIds.has(parent):!ticketIds.has(parent)))throw Error('COMPACT_LINK_UNKNOWN');const key=`${type}:${parent}:${child}`;if(linkKeys.has(key))throw Error('COMPACT_DUPLICATE_LINK');linkKeys.add(key);}
 return {schema:'otr-workbench-llm-interpretation/1',objects:wire.items.map(i=>({token:i.id,kind:i.kind,subtype:i.subtype,fields:i.f.map(field),bookingTokens:wire.links.filter(l=>l[0]==='B'&&l[2]===i.id).map(l=>l[1]),ticketTokens:wire.links.filter(l=>l[0]==='T'&&l[2]===i.id).map(l=>l[1])})),bookings:wire.bookings.map(b=>({token:b.id,supplier:fixed(b.supplier,'booking.supplier'),reference:fixed(b.reference,'booking.reference'),fields:b.f.map(field),objectTokens:wire.links.filter(l=>l[0]==='B'&&l[1]===b.id).map(l=>l[2])})),tickets:wire.tickets.map(t=>({token:t.id,label:fixed(t.label,'ticket.label'),objectTokens:wire.links.filter(l=>l[0]==='T'&&l[1]===t.id).map(l=>l[2])})),unresolved:wire.issues.map(u=>{const source=ready[u[0]];if(!source)throw Error('COMPACT_ISSUE_SOURCE_INVALID');return {sourceId:source.sourceId,reason:u[1]};})};
}
