/** Shared original-page intake for preview and the paid MI pipeline.
 * Discovery metadata never becomes publication evidence until the caller's
 * independent original-publisher verifier has accepted it.
 * All incoming sources are collected dynamically; this module has no publisher,
 * commodity, date, URL, article or output-count exceptions.
 */
import {otherCommodityVerificationPool} from './otherCommodityNewsPool.ts';
import {createHash} from 'node:crypto';
import type {RetrievedSourceMetadata} from './marketIntelligenceService.ts';

/** RSS item indexes are not globally unique across search queries or feeds.
 * A stable source ID derived from the verified original URL prevents two
 * unrelated stories with the same provisional rawId from sharing a Gemini
 * response slot. This computes the ID at runtime; no story data is embedded.
 */
export function assignVerifiedOriginalIds<T extends {rawId:string;originalUrl:string}>(items:T[]):T[]{
  for(const item of items){
    const original=new URL(item.originalUrl);
    original.hash='';
    for(const key of [...original.searchParams.keys()]){
      if(/^utm_|^(?:fbclid|gclid)$/i.test(key))original.searchParams.delete(key);
    }
    original.searchParams.sort();
    const identity=original.toString();
    const rawId='original-'+createHash('sha256').update(identity).digest('hex');
    // A URL identity is unique within one verified source set. If duplicate
    // entries survive previous filtering, they should share an ID, not invent
    // distinct evidence for one original article.
    item.rawId=rawId;
  }
  return items;
}

export type IntakeRejection = {url:string;reason:string};
export type IntakeResult = {
  candidates:RetrievedSourceMetadata[];
  verified:RetrievedSourceMetadata[];
  rejected:IntakeRejection[];
  warnings:string[];
};

export async function verifyDynamicNewsIntake(
  key:string,
  sources:{saved?:readonly RetrievedSourceMetadata[]; discovered?:readonly RetrievedSourceMetadata[];
    supplemental?:readonly RetrievedSourceMetadata[]; warnings?:readonly string[]},
  verify:(candidates:RetrievedSourceMetadata[],commodity:string,
    onRejected?:(item:IntakeRejection)=>void)=>Promise<RetrievedSourceMetadata[]>,
  now=new Date(),
  maximum=32
):Promise<IntakeResult>{
  const candidates=otherCommodityVerificationPool(
    sources.saved||[],[...(sources.supplemental||[]),...(sources.discovered||[])],[],now,maximum,key
  );
  const rejected:IntakeRejection[]=[];
  const verified=assignVerifiedOriginalIds(await verify(candidates,key,item=>rejected.push(item)));
  const acceptedUrls=new Set(verified.map(a=>a.originalUrl));
  const rejectedUrls=new Set(rejected.map(a=>a.url));
  for(const candidate of candidates){
    if(!acceptedUrls.has(candidate.originalUrl)&&!rejectedUrls.has(candidate.originalUrl))
      rejected.push({url:candidate.originalUrl,reason:'original-page-not-verified'});
  }
  return {candidates,verified,rejected,warnings:[...(sources.warnings||[])]};
}

export function compareWithPublishedNews(
  verified:readonly RetrievedSourceMetadata[],
  published:readonly {originalUrl?:string}[]
){
  const normalize=(value:unknown)=>{
    try{
      const url=new URL(String(value||''));
      if(url.protocol!=='https:')return '';
      url.hash='';
      for(const key of [...url.searchParams.keys()]){
        if(/^utm_|^(?:fbclid|gclid)$/i.test(key))url.searchParams.delete(key);
      }
      url.searchParams.sort();
      return url.href.replace(/\/$/,'');
    }catch{return '';}
  };
  const seen=new Set(published.map(a=>normalize(a.originalUrl)).filter(Boolean));
  const novel=verified.filter(a=>{const url=normalize(a.originalUrl);return !!url&&!seen.has(url)});
  return {newVerified:novel,alreadyPublished:verified.filter(a=>!novel.includes(a))};
}
