import {normalizeCompactEnums} from './real-llm-compact';
import type {inspectCompactEvidence,Ready} from './real-llm-evidence';

type Inspection=ReturnType<typeof inspectCompactEvidence>;
export type QualityTier='HIGH_CONFIDENCE'|'REVIEWABLE'|'ABSTAIN';
const core:Record<string,readonly string[]>={
 P1:['activity.name'],P2:['flight_number','marketing_flight','service'],P3:['property.name'],
 P4:['rental.company','agency.name'],P5:['service','service.number'],P6:['activity.name'],
};
const verified=new Set(['TEXT_VERIFIED','OCR_CORROBORATED_ADVISORY']);

// Consumer decision only. Evidence, typed validation and formal authority remain upstream.
export function projectImportQuality(raw:unknown,inspection:Inspection,ready:Ready[]){
 const normalized=normalizeCompactEnums(raw).value as {items?:unknown[]}|null;
 const modelItems=Array.isArray(normalized?.items)?normalized.items:[];
 const candidate=new Map((inspection.proposals?.objects??[]).map(o=>[o.token,o]));
 const issues=[...inspection.unresolved,...(inspection.proposals?.unresolved??[])];
 const sourceNegativeIds=new Set(ready.filter(source=>source.modality==='TEXT'&&/(?:trip idea only|inspiration only|no confirmed plan|unbooked travel idea|仅为旅行灵感|尚无确认行程)/i.test(source.bytes.toString('utf8'))).map(source=>source.sourceId));
 const itemSources=new Set(inspection.fieldEvidence.filter(f=>modelItems.some(value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&(value as {id?:unknown}).id===f.object)).map(f=>f.sourceId).filter((x):x is string=>!!x));
 // An issue on an unmatched source may target any batch item. When its source matches
 // item evidence, isolate the veto to that source and retain independent items.
 const affects=(sourceIds:string[],pattern:RegExp)=>{
  const relevant=issues.filter(u=>pattern.test(u.reason));
  return relevant.some(u=>!itemSources.has(u.sourceId)||sourceIds.includes(u.sourceId));
 };
 const decisions=modelItems.flatMap(value=>{
  if(!value||typeof value!=='object'||Array.isArray(value))return [];
  const item=value as {id?:unknown;kind?:unknown};
  const token=typeof item.id==='string'?item.id:'UNKNOWN',kind=typeof item.kind==='string'?item.kind:'UNKNOWN';
  const facts=inspection.fieldEvidence.filter(f=>f.object===token);
  const sourceIds=[...new Set(facts.map(f=>f.sourceId).filter((x):x is string=>!!x))];
  const accepted=candidate.get(token);
  const coreEvidence=facts.some(f=>core[kind]?.includes(f.path)&&verified.has(f.status));
  const visual=facts.some(f=>f.status==='OCR_CORROBORATED_ADVISORY');
  const missing=facts.some(f=>!verified.has(f.status));
  let tier:QualityTier='ABSTAIN',reasons:string[]=[];
  if(!accepted)reasons=[inspection.unresolved.some(u=>u.reason==='FORWARDED_TICKET_RIGHTS_UNVERIFIED')&&kind==='P6'?'FORWARDED_TICKET_RIGHTS_UNVERIFIED':inspection.schemaValidity==='INVALID'?'INVALID_SCHEMA':'OBJECT_EVIDENCE_OR_TYPED_VALIDATION_FAILED'];
  else if(affects(sourceIds,/(?:cancellation notice|change pending|amendment target)/i))reasons=['LIFECYCLE_TARGET_UNAVAILABLE'];
  else if(sourceIds.some(id=>sourceNegativeIds.has(id))||affects(sourceIds,/(?:trip idea only|inspiration only|no confirmed plan|unbooked travel idea|仅为旅行灵感|尚无确认行程)/i))reasons=['UNCONFIRMED_TRAVEL_IDEA'];
  else if(!coreEvidence)reasons=['CORE_FIELD_EVIDENCE_MISSING'];
  else if(visual||missing||kind==='P6') {
   tier='REVIEWABLE';reasons=[visual?'IMAGE_EVIDENCE_ADVISORY':missing?'FIELD_EVIDENCE_PARTIAL':'P6_PARTICIPATION_OR_RIGHTS_UNVERIFIED'];
  }else{tier='HIGH_CONFIDENCE';reasons=['CORE_AND_FIELD_EVIDENCE_VERIFIED'];}
  return [{token,kind,tier,reasons,sourceIds,fieldCount:accepted?.fields.length??0}];
 });
 return {decisions,acceptedTokens:decisions.filter(d=>d.tier==='HIGH_CONFIDENCE').map(d=>d.token),reviewableTokens:decisions.filter(d=>d.tier==='REVIEWABLE').map(d=>d.token),abstainedTokens:decisions.filter(d=>d.tier==='ABSTAIN').map(d=>d.token),formalQualification:'NOT_SCORABLE' as const};
}
