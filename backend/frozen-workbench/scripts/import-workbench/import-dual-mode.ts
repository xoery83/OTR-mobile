import {validate,type LlmResponse} from './llm-first';

export const IMPORT_MODE_CONTRACT_VERSION='otr-workbench-import-mode/1' as const;
export type ImportMode='UNIVERSAL_IMPORT'|'FORM_SCOPED_AUTOFILL';
export type ValidatedInterpretation=ReturnType<typeof validate>;
export type FormScope={kind:LlmResponse['objects'][number]['kind'];action:'CREATE'|'EDIT';itemId?:string;revision?:number;selectedToken?:string;draft:Record<string,string>;dirtyPaths?:string[];intentionalClearPaths?:string[]};

export function projectImportMode(validation:ValidatedInterpretation,mode:ImportMode,scope?:FormScope,eligibleTokens?:ReadonlySet<string>){
 if(validation.status!=='ACCEPTED'||!validation.value)throw Error('TYPED_EVIDENCE_VALIDATION_REQUIRED');
 const value=validation.value;
 const objects=eligibleTokens?value.objects.filter(o=>eligibleTokens.has(o.token)):value.objects;
 // A shared observation is withheld if any linked item failed the consumer gate.
 const bookings=eligibleTokens?value.bookings.filter(b=>b.objectTokens.length>0&&b.objectTokens.every(t=>eligibleTokens.has(t))):value.bookings;
 const tickets=eligibleTokens?value.tickets.filter(t=>t.objectTokens.length>0&&t.objectTokens.every(token=>eligibleTokens.has(token))):value.tickets;
 if(mode==='UNIVERSAL_IMPORT')return {
  version:IMPORT_MODE_CONTRACT_VERSION,mode,records:objects,bookingObservations:bookings,ticketObservations:tickets,
  documentSourceIds:[...new Set([...value.objects.flatMap(o=>o.fields.map(f=>f.sourceId)),...value.bookings.flatMap(b=>[b.supplier.sourceId,b.reference.sourceId]),...value.tickets.map(t=>t.label.sourceId)])],
  relationStatus:'OWNING_READER_UNAVAILABLE' as const,proposedReviews:[],unresolved:value.unresolved,
  admission:'NOT_RUN' as const,
 };
 if(!scope)throw Error('FORM_SCOPE_REQUIRED');
 if(scope.action==='EDIT'&&(!scope.itemId||scope.revision===undefined||!Number.isInteger(scope.revision)||scope.revision<0))throw Error('EDIT_ID_REVISION_REQUIRED');
 const same=objects.filter(o=>o.kind===scope.kind),other=value.objects.filter(o=>o.kind!==scope.kind);
 const current=scope.selectedToken?same.find(o=>o.token===scope.selectedToken):scope.action==='CREATE'?same[0]:undefined;
 if(scope.selectedToken&&!current)throw Error('SELECTED_OBJECT_NOT_IN_SCOPE');
 const draft={...scope.draft},conflicts:{path:string;existing:string;extracted:string;choice:'KEEP'|'REPLACE'|'PENDING'}[]=[];
 const touched=new Set([...(scope.dirtyPaths??[]),...(scope.intentionalClearPaths??[])]);
 for(const f of current?.fields??[]){const existing=draft[f.path]?.trim();if(!existing&&!touched.has(f.path))draft[f.path]=f.raw;else if((existing??'')!==f.raw)conflicts.push({path:f.path,existing:draft[f.path]??'',extracted:f.raw,choice:'PENDING'});}
 return {
  version:IMPORT_MODE_CONTRACT_VERSION,mode,form:{kind:scope.kind,action:scope.action,itemId:scope.itemId??null,revision:scope.revision??null},
  selectedCandidateToken:current?.token??null,identityQualification:scope.action==='EDIT'?'OWNING_ITEM_MATCH_UNAVAILABLE':'NOT_REQUIRED',originalDraft:{...scope.draft},autofillDraft:draft,conflicts,
  fieldSuggestions:current?.fields??[],dirtyPaths:[...(scope.dirtyPaths??[])],intentionalClearPaths:[...(scope.intentionalClearPaths??[])],
  additionalDrafts:same.filter(o=>o.token!==current?.token).map(o=>({token:o.token,fields:Object.fromEntries(o.fields.map(f=>[f.path,f.raw])),fieldEvidence:o.fields})),
  deferredCrossType:other.map(o=>({token:o.token,kind:o.kind})),
  bookingObservations:bookings.length,ticketObservations:tickets.length,
  unresolved:[...value.unresolved,...(scope.action==='EDIT'&&same.length?[{sourceId:'FORM_SCOPE',reason:current?'CURRENT_ITEM_MATCH_REQUIRES_USER_CONFIRMATION':'CURRENT_ITEM_MATCH_UNCONFIRMED'}]:[])],
  proposedReviews:[],save:'USER_FORM_SAVE_REQUIRED' as const,admission:'NOT_RUN' as const,
 };
}

export function resolveFormConflict(draft:Record<string,string>,conflict:{path:string;existing:string;extracted:string},choice:'KEEP'|'REPLACE'|'CANCEL'){
 if(choice==='CANCEL')return {...draft};
 if(draft[conflict.path]!==conflict.existing)throw Error('FORM_DRAFT_CHANGED');
 return choice==='REPLACE'?{...draft,[conflict.path]:conflict.extracted}:{...draft};
}
