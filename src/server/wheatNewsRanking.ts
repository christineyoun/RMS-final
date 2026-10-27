/**
 * Wheat-only ranking of verified, substantive publisher articles.
 * First diversify by publisher, then cover distinct procurement themes.
 * Relative recency is a preference, not a hard cutoff; older credible pieces
 * remain eligible if four fresh, relevant articles are unavailable.
 * Never accepts or verifies URLs itself; call AFTER original-page verification.
 */
import type { RetrievedSourceMetadata } from './marketIntelligenceService.ts';
import { wheatDiscoveryPriority } from './wheatPublicPageDiscovery.ts';

function normalizedHost(raw: string): string {
  try { return new URL(raw).hostname.toLowerCase().replace(/^www\./,''); }
  catch { return ''; }
}
function uniqueWords(title:string): Set<string> {
  const stop=new Set(['the','and','with','from','amid','after','when','will','while',
    'wheat','market','markets','report','prices','price','latest','update','daily',
    'says','shows','global','u','s','october','september','2026','outlook']);
  return new Set((title.toLowerCase().match(/[a-z]{3,}/g)||[]).filter(w=>!stop.has(w)));
}
export function wheatTopicGroup(title:string):string {
  const s=title.toLowerCase();
  if(/^grain market report(?:\s|$)/.test(s))return 'market-overview';
  if(/\b(?:drought|weather|rain|dry|flood|planting|harvest)\b/.test(s))return 'weather';
  if(/black sea|ship|freight|trade|export|import|logistic|tariff/.test(s))return 'trade';
  if(/price|futures|market|bid|cost|index/.test(s))return 'price';
  if(/production|stocks|supply|demand|wasde|outlook|forecast|crop/.test(s))return 'supply';
  if(/quality|protein|milling/.test(s))return 'quality';
  return 'other';
}
export function wheatRankScore(item:RetrievedSourceMetadata,now=Date.now()):number {
  const stamp=Date.parse(item.publishedAt+'T00:00:00Z');
  if(!Number.isFinite(stamp)||!item.rawSnippet||item.rawSnippet.length<100)return -Infinity;
  const age=Math.max(0,(now-stamp)/86400000);
  // Freshness strongly outweighs keyword stuffing; 0-7 days receive the most weight.
  const fresh=age<=7 ? 40-age*2 : age<=14 ? 26-(age-7)*2 : Math.max(0,12-(age-14)*1.3);
  const relevant=Math.min(13,Math.max(-12,wheatDiscoveryPriority(item.rawTitle)));
  const named=/\bwheat\b|\b(?:srw|hrw|hrs)\b/i.test(item.rawTitle)?4:0;
  const body=Math.min(3,Math.floor(item.rawSnippet.length/750));
  const fluff=/(?:nomination|award|staff|recruit|job opening|refugee camp|gala|congratulat|conference|training course)/i.test(item.rawTitle)?18:0;
  return fresh+relevant+named+body-fluff;
}
function similarStories(a:RetrievedSourceMetadata,b:RetrievedSourceMetadata):boolean {
  const aw=uniqueWords(a.rawTitle),bw=uniqueWords(b.rawTitle);
  if(!aw.size||!bw.size)return a.rawTitle.toLowerCase()===b.rawTitle.toLowerCase();
  const shared=[...aw].filter(x=>bw.has(x)).length;
  return shared>=2 && shared/Math.min(aw.size,bw.size)>=0.8;
}
/** Returns up to four distinct selections, with source diversity before repeats. */
export function selectWheatVerifiedNews(items:RetrievedSourceMetadata[],limit=4,now=Date.now()):RetrievedSourceMetadata[] {
  const seen=new Set<string>();
  const valid=items.filter(x=>{
    const host=normalizedHost(x.originalUrl);
    if(!host||!x.publishedAt||!x.rawSnippet||!x.rawSnippet.trim())return false;
    const key=x.originalUrl.toLowerCase().replace(/\/$/,'').split('?')[0];
    if(seen.has(key))return false;
    seen.add(key);return Number.isFinite(wheatRankScore(x,now));
  });
  const scores=new Map(valid.map(v=>[v.originalUrl,wheatRankScore(v,now)]));
  const out:RetrievedSourceMetadata[]=[];
  const hostCounts=new Map<string,number>();
  const themeCounts=new Map<string,number>();
  // Use Korean calendar dates consistently with the RMS dashboard. A 2 Oct
  // report remains within the last 14 calendar days on 16 Oct, even in the
  // afternoon; do not silently exclude it based on fractional hours elapsed.
  const day=86400000;
  const kstToday=Date.parse(new Date(now+9*3600000).toISOString().slice(0,10)+'T00:00:00Z');
  const isRecent=(x:RetrievedSourceMetadata):boolean=>{
    const ageDays=Math.round((kstToday-Date.parse(x.publishedAt+'T00:00:00Z'))/day);
    return ageDays>=0 && ageDays<=14;
  };
  const freshHosts=new Set(valid.filter(isRecent).map(x=>normalizedHost(x.originalUrl)));
  // If FOUR independently verified, recent publishers exist, select one per
  // publisher first. Otherwise retain the existing recency-aware fallback.
  // Source quality must already have passed verification before reaching here.
  const fullFreshDiversity=freshHosts.size>=limit;
  while(out.length<limit){
    const remaining=valid.filter(item=>!out.includes(item) &&
      !out.some(existing=>similarStories(existing,item)));
    if(!remaining.length)break;
    const freshRepresented=[...hostCounts.keys()].filter(host=>freshHosts.has(host)).length;
    const freshNeeded=Math.max(0,Math.min(3,freshHosts.size)-freshRepresented);
    const slots=limit-out.length;
    // Ensure three *recent* sources if three exist; never force a stale item
    // just to reach an arbitrary publisher quota.
    const constrained=(freshNeeded && slots<=freshNeeded)
      ? remaining.filter(item=>freshHosts.has(normalizedHost(item.originalUrl)) &&
        !hostCounts.has(normalizedHost(item.originalUrl)))
      : [];
    const diverse=fullFreshDiversity
      ? remaining.filter(item=>isRecent(item) && !hostCounts.has(normalizedHost(item.originalUrl)))
      : [];
    const choices=diverse.length ? diverse : (constrained.length?constrained:remaining);
    choices.sort((a,b)=>{
      const score=(x:RetrievedSourceMetadata)=>
        (scores.get(x.originalUrl)||0)
        -(hostCounts.get(normalizedHost(x.originalUrl))||0)*9
        -(themeCounts.get(wheatTopicGroup(x.rawTitle))||0)*5;
      return score(b)-score(a) || b.publishedAt.localeCompare(a.publishedAt) || a.originalUrl.localeCompare(b.originalUrl);
    });
    const next=choices[0],host=normalizedHost(next.originalUrl),theme=wheatTopicGroup(next.rawTitle);
    out.push(next);
    hostCounts.set(host,(hostCounts.get(host)||0)+1);
    themeCounts.set(theme,(themeCounts.get(theme)||0)+1);
  }
  return out;
}
