/** Pure helpers for step-5, round-1 publisher reconciliation. No I/O or API calls. */
import type {GradeRecord} from './source-grade.ts';
import type {Commodity} from './commodity-config.ts';

type OldSource = {id:string;grade:string;publisherUrl?:string|null;googleCitationUrl?:string|null};
type NewRecord = GradeRecord;

/** Canonical comparison key for the SAME publisher page, not merely its domain.
 * Tracking parameters do not distinguish articles. Other query parameters are retained.
 */
export function canonicalPublisherKey(raw:string|null|undefined):string|null {
  if(!raw)return null;
  try{
    const url=new URL(raw);
    if(url.protocol!=='http:'&&url.protocol!=='https:')return null;
    const host=url.hostname.toLowerCase().replace(/^www\./,'').replace(/\.$/,'');
    if(!host)return null;
    let pathname=url.pathname.replace(/\/{2,}/g,'/').replace(/\/$/,'')||'/';
    pathname=pathname.replace(/\/(?:index\.html?|default\.html?)$/i,'/')||'/';
    const tracked=new Set(['gclid','fbclid','msclkid','yclid','ref','src','source']);
    const params=[...url.searchParams.entries()].filter(([k])=>!k.toLowerCase().startsWith('utm_')&&!tracked.has(k.toLowerCase()));
    params.sort((a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1]));
    const qs=new URLSearchParams(params).toString();
    return `${host}${pathname}${qs?'?'+qs:''}`;
  }catch{return null;}
}

export function validateStep5Round1(input:any,commodity:Commodity='soybean'):void {
  if(!input||input.commodity!==commodity||input.stage!=='additional-google-discovery-round1'||input.round!==1||input.status!=='google-citations-found'||!Array.isArray(input.grounding?.sources))
    throw Error('Input is not a successful STEP5 round-1 Google discovery file.');
  if(!input.priorSnapshot||!Array.isArray(input.priorSnapshot.originalInventory)||input.priorSnapshot.originalInventory.length===0)
    throw Error('Previous source inventory missing. Preserve/reconcile old A and B first.');
  for(const source of input.grounding.sources){
    if(!source||typeof source.uri!=='string'||!source.uri.startsWith('https://')||typeof source.title!=='string')
      throw Error('Malformed provider-grounded source; no invented URLs accepted.');
  }
}

export type NewAssessment = {
  id:string; grade:GradeRecord['grade']; reason:string; publisherUrl:string|null;
  overlap:'same-publisher-as-prior'|'same-publisher-in-round'|'same-google-citation-as-prior'|'new-publisher-document'|'unresolved-publisher';
  duplicateOf:string|null;
};

/** Keep EVERY old/new row unchanged. Duplicate labeling is additional metadata only. */
export function reconcilePublishers(previous:OldSource[],newRecords:NewRecord[]):{
  records:NewAssessment[];summary:{oldSourceRecords:number;newCitationRecords:number;newPublisherDistinct:number;oldPublisherMatches:number;repeatedNewPublisherPages:number;unresolvedPublisherRecords:number;A:number;B:number;EXCLUDED:number};
}{
  const known=new Map<string,string>();
  const oldCitation=new Map<string,string>();
  for(const p of previous){
    const key=canonicalPublisherKey(p.publisherUrl);
    if(key&&!known.has(key))known.set(key,p.id);
    if(p.googleCitationUrl&&!oldCitation.has(p.googleCitationUrl))oldCitation.set(p.googleCitationUrl,p.id);
  }
  const seenThisRound=new Map<string,string>();
  const assessments:NewAssessment[]=[];
  for(let i=0;i<newRecords.length;i++){
    const r=newRecords[i],id=`G${String(r.googleCitation.index).padStart(3,'0')}`;
    const key=canonicalPublisherKey(r.publisherUrl);
    let overlap:NewAssessment['overlap'];let duplicateOf:string|null=null;
    if(key&&known.has(key)){overlap='same-publisher-as-prior';duplicateOf=known.get(key)!;}
    else if(key&&seenThisRound.has(key)){overlap='same-publisher-in-round';duplicateOf=seenThisRound.get(key)!;}
    else if(!key&&oldCitation.has(r.googleCitation.uri)){overlap='same-google-citation-as-prior';duplicateOf=oldCitation.get(r.googleCitation.uri)!;}
    else if(key){overlap='new-publisher-document';seenThisRound.set(key,id);}
    else overlap='unresolved-publisher';
    assessments.push({id,grade:r.grade,reason:r.reason,publisherUrl:r.publisherUrl,overlap,duplicateOf});
  }
  return {records:assessments,summary:{
    oldSourceRecords:previous.length,newCitationRecords:newRecords.length,
    newPublisherDistinct:assessments.filter(x=>x.overlap==='new-publisher-document').length,
    oldPublisherMatches:assessments.filter(x=>x.overlap==='same-publisher-as-prior'||x.overlap==='same-google-citation-as-prior').length,
    repeatedNewPublisherPages:assessments.filter(x=>x.overlap==='same-publisher-in-round').length,
    unresolvedPublisherRecords:assessments.filter(x=>x.overlap==='unresolved-publisher').length,
    A:newRecords.filter(x=>x.grade==='A').length,
    B:newRecords.filter(x=>x.grade==='B').length,
    EXCLUDED:newRecords.filter(x=>x.grade==='EXCLUDED').length,
  }};
}
