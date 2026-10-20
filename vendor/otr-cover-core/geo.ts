/** Static lookup only. This is a sourced catalog adapter, never Trip/Location persistence. */
export interface GeoEntity {
 id:string; type:string; names:{en?:string;zh?:string;local?:string[];primary?:string;latin?:string}; aliases:string[];
 countryCodes:string[]; adminIds?:string[]; lat?:number;lon?:number;source:string;sourceId:string;geonamesId?:string;
 visualContexts?:string[];
}
export interface GeoAmbiguity {text:string;candidates:GeoEntity[]}
export interface GeoMatch {entity:GeoEntity;matched:string;source:'destination'|'name'|'confirmed';hierarchyAliasIds?:string[]}
export interface GeoResult {status:'resolved'|'ambiguous'|'unknown'|'partial';locations:GeoEntity[];ambiguities:GeoAmbiguity[];unknownParts:string[];matches:GeoMatch[]}
export function normalizeGeo(text:string):string{return text.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');}
export class GeoIndex {
 readonly byId=new Map<string,GeoEntity>(); readonly aliases=new Map<string,GeoEntity[]>(); readonly aliasCount:number; readonly countriesByCode=new Map<string,GeoEntity>();
 constructor(entities:readonly GeoEntity[]){
  for(const e of entities){if(this.byId.has(e.id))throw new Error('Duplicate geo ID '+e.id);this.byId.set(e.id,e);if(e.type==='country')for(const code of [...e.countryCodes,...e.aliases.filter(a=>/^[A-Z]{2}$/.test(a))])this.countriesByCode.set(code,e);}
  for(const e of entities){for(const name of new Set([e.names.en,e.names.zh,e.names.primary,e.names.latin,...(e.names.local??[]),...e.aliases].filter((x):x is string=>!!x).map(normalizeGeo))){if(name.length<2 || (name.length===2 && /^[a-z]+$/.test(name)))continue;const list=this.aliases.get(name)??[];if(!list.some(x=>x.id===e.id))list.push(e);this.aliases.set(name,list);}}
  for(const list of this.aliases.values())list.sort((a,b)=>a.id.localeCompare(b.id,'en'));
  this.aliasCount=this.aliases.size;
 }
 searchResults(query:string,limit=8):{candidates:GeoEntity[];total:number;exact:boolean}{const q=normalizeGeo(query);if(!q)return {candidates:[],total:0,exact:false};const exact=this.aliases.get(q);if(exact)return {candidates:exact.slice(0,limit),total:exact.length,exact:true};const ids=new Set<string>();const out:GeoEntity[]=[];for(const [alias,entities]of this.aliases){if(alias.startsWith(q))for(const e of entities)if(!ids.has(e.id)){ids.add(e.id);out.push(e);}}return {candidates:out.slice(0,limit),total:out.length,exact:false};}
 search(query:string,limit=8):GeoEntity[]{return this.searchResults(query,limit).candidates;}
 private mentions(text:string):{text:string;start:number;end:number;candidates:GeoEntity[]}[]{
  const normalized=normalizeGeo(text);const spans:{text:string;start:number;end:number;candidates:GeoEntity[]}[]=[];
  // Bounded text + n-grams keep query cost independent of catalog size.
  const tokens=[...normalized.matchAll(/[\p{L}\p{N}]+/gu)];
  for(let i=0;i<tokens.length;i++){for(let count=Math.min(10,tokens.length-i);count>=1;count--){const start=tokens[i].index!;const last=tokens[i+count-1];const end=last.index!+last[0].length;const name=normalized.slice(start,end);const candidates=this.aliases.get(name);if(candidates)spans.push({text:name,start,end,candidates});}}
  // CJK names can be embedded in an unspaced Trip name, unlike Latin word substrings.
  for(const run of normalized.matchAll(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/gu)){
   for(let i=0;i<run[0].length;i++)for(let size=Math.min(24,run[0].length-i);size>=2;size--){const name=run[0].slice(i,i+size);const candidates=this.aliases.get(name);if(candidates)spans.push({text:name,start:run.index!+i,end:run.index!+i+size,candidates});}
  }
  const accepted:typeof spans=[];
  for(const s of spans.sort((a,b)=>(b.end-b.start)-(a.end-a.start)||a.start-b.start)){if(!accepted.some(x=>s.start<x.end&&s.end>x.start))accepted.push(s);}
  return accepted.sort((a,b)=>a.start-b.start);
 }
 resolve(text:string,source:'destination'|'name'='destination',confirmedIds:readonly string[]=[]):GeoResult{
  if(text.length>1000)throw new RangeError('Location text is bounded to 1000 characters');
  const locations:GeoEntity[]=[];const matches:GeoMatch[]=[];const ambiguities:GeoAmbiguity[]=[];const unknownParts:string[]=[];
  if(confirmedIds.length){for(const id of confirmedIds){const entity=this.byId.get(id);if(!entity)throw new Error('Unknown confirmed geo ID '+id);locations.push(entity);matches.push({entity,matched:id,source:'confirmed'});}return {status:'resolved',locations,ambiguities,unknownParts,matches};}
  const parts=text.split(/[\/;；→\n]+/u).map(p=>p.trim()).filter(Boolean);
  for(const part of parts){
   const spans=this.mentions(part);for(const code of part.match(/\b[A-Z]{2}\b/g)??[]){const entity=this.countriesByCode.get(code);if(entity){const normalized=normalizeGeo(part);const at=normalized.indexOf(code.toLowerCase());if(at>=0&&!spans.some(s=>at>=s.start&&at<s.end))spans.push({text:code,start:at,end:at+2,candidates:[entity]});}}const countryContext=new Set<string>();const adminContext=new Set<string>();
   for(const span of spans){const country=span.candidates.filter(e=>e.type==='country');if(country.length===1&&span.candidates.length===1)for(const code of country[0].countryCodes)countryContext.add(code);const regions=span.candidates.filter(e=>e.type==='region');if(regions.length===1&&span.candidates.length===1)adminContext.add(regions[0].id);}
   // Explicit ISO country codes provide context without making short codes loose aliases.
   for(const code of part.match(/\b[A-Z]{2}\b/g)??[]){for(const canonicalCode of this.countriesByCode.get(code)?.countryCodes??[])countryContext.add(canonicalCode);}
   const typeHint=/\b(city|town)\b/i.test(part)?'city':/\b(country)\b/i.test(part)?'country':/\b(province|prefecture|state|region)\b/i.test(part)?'region':null;
   for(const span of spans){
    let candidates=span.candidates;
    if(countryContext.size)candidates=candidates.filter(e=>e.countryCodes.some(c=>countryContext.has(c)));
    if(adminContext.size&&candidates.some(e=>e.type!=='country'&&e.type!=='region')){const narrowed=candidates.filter(e=>e.type==='country'||e.type==='region'||e.adminIds?.some(id=>adminContext.has(id)));if(narrowed.length)candidates=narrowed;else candidates=[];}
    if(typeHint&&candidates.some(e=>e.type===typeHint))candidates=candidates.filter(e=>e.type===typeHint);
    // A city and its own direct parent sharing an alias describe one hierarchy,
    // not two remote destinations. Never collapse multiple cities or unrelated regions.
    const cities=candidates.filter(e=>e.type==='city');const regions=candidates.filter(e=>e.type==='region');let hierarchyAliasIds:string[]|undefined;
    if(!typeHint&&candidates.length===2&&cities.length===1&&regions.length===1&&cities[0].adminIds?.includes(regions[0].id)&&cities[0].countryCodes.length===1&&regions[0].countryCodes.length===1&&cities[0].countryCodes[0]===regions[0].countryCodes[0]){hierarchyAliasIds=[regions[0].id];candidates=cities;}
    if(candidates.length===1){const entity=candidates[0];if(!locations.some(e=>e.id===entity.id)){locations.push(entity);matches.push({entity,matched:span.text,source,...(hierarchyAliasIds?{hierarchyAliasIds}:{})});}}
    else if(candidates.length>1)ambiguities.push({text:span.text,candidates});
    else unknownParts.push(span.text+'（与地点上下文不兼容）');
   }
   // Unmatched destination words stay visible even next to a recognized country/city.
   if(!spans.length)unknownParts.push(part);
   else if(source==='destination'){
    let residual=normalizeGeo(part);for(const span of [...spans].sort((a,b)=>b.start-a.start))residual=residual.slice(0,span.start)+' '.repeat(span.end-span.start)+residual.slice(span.end);
    residual=residual.replace(/\b(city|town|country|region|state|province|prefecture)\b/gu,' ').trim().replace(/\s+/g,' ');
    if(residual)unknownParts.push(residual);
   }
  }
  const unique=locations.filter(e=>!(e.type==='country'&&locations.some(x=>x.type!=='country'&&x.countryCodes.some(c=>e.countryCodes.includes(c)))));
  const status=ambiguities.length?'ambiguous':unknownParts.length&&unique.length?'partial':unique.length?'resolved':'unknown';
  return {status,locations:unique,ambiguities,unknownParts:[...new Set(unknownParts)],matches};
 }
}
