import {recentMarketArticles} from './newsFreshnessPolicy.ts';
/**
 * Shared eight-commodity free-first decision. Call ONLY with independently
 * publisher-verified originals, never unverified discovery suggestions.
 * This saves a paid Google Search when free evidence is already sufficiently
 * broad and current; it never approves Korean summaries or publication.
 *
 * Four is a maximum, not a quota. Sparse news keeps the normal supplementary
 * discovery path rather than pretending there are four current articles.
 */
export function canSummarizeWithoutPaidSearch<T extends {
  originalUrl?:string; publishedAt?:string;
}>(verifiedOriginals:readonly T[],now=new Date()):boolean {
  const urls=new Set<string>();
  const independent=verifiedOriginals.filter(item=>{
    let u:URL;
    try{u=new URL(String(item?.originalUrl||''));}catch{return false;}
    if(u.protocol!=='https:'||u.username||u.password||u.port)return false;
    const key=u.origin.toLowerCase()+u.pathname.replace(/\/+$/,'')+u.search;
    if(urls.has(key))return false;
    const date=Date.parse(String(item.publishedAt||''));
    if(!Number.isFinite(date)||date>now.getTime())return false;
    urls.add(key);
    return true;
  });
  return independent.length>=4 && recentMarketArticles(independent,7,now).length>=2;
}

/**
 * Use historical COVERAGE to avoid an unnecessary paid Google Search when
 * independently publisher-verified new originals already complement approved
 * published articles. Approved historical cards are not presented as fresh
 * search results, nor accepted as newly discovered evidence.
 *
 * Caller MUST pass articles returned by acceptedScheduledNews() as
 * previouslyApproved. Candidate RSS headlines are never acceptable here.
 */
type SourceCoverageRecord = {originalUrl?:string;publishedAt?:string};
export function canSummarizeUsingApprovedCoverage<
 NewOriginal extends SourceCoverageRecord,
 ApprovedArticle extends SourceCoverageRecord
>(verifiedNewOriginals:readonly NewOriginal[],previouslyApproved:readonly ApprovedArticle[],now=new Date()):boolean {
 const identity=(article:SourceCoverageRecord):string=>{
  try{
   const u=new URL(String(article?.originalUrl||''));
   if(u.protocol!=='https:'||u.username||u.password||u.port)return '';
   u.hash='';
   for(const key of [...u.searchParams.keys()])if(/^utm_|^(?:fbclid|gclid)$/i.test(key))u.searchParams.delete(key);
   u.searchParams.sort();
   return u.href;
  }catch{return '';}
 };
 const existing=new Set(previouslyApproved.map(identity).filter(Boolean));
 const novel=verifiedNewOriginals.filter(item=>{
  const id=identity(item);
  return id&&!existing.has(id);
 });
 // Require at least one NEW, independently checked original. Otherwise, using
 // saved coverage to skip discovery could freeze a fully stale publication.
 if(!novel.length)return false;
 return canSummarizeWithoutPaidSearch([...verifiedNewOriginals,...previouslyApproved],now);
}
