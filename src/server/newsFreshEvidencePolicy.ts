
import {recentMarketArticles} from './newsFreshnessPolicy.ts';

export function focusOnFreshVerifiedNews<
  T extends {publishedAt?:string;rawTitle?:string;title?:string;sourceName?:string}
>(
  items:readonly T[],
  now=new Date(),
  minimumRecent=2,
  commodity=''
):T[]{
  // RMS_MI_SOURCE_PRIORITY_V10: reject clearly sugar-only Corn headlines.
  const eligible=items.filter(item=>{
    const title=String(item.rawTitle||item.title||'');
    return !(commodity==='corn' &&
      /\bsugar(?:cane)?\b/i.test(title) &&
      !/\b(?:corn|maize)\b/i.test(title));
  });

  const recent=recentMarketArticles(eligible,7,now);
  // Newer publisher reports take priority, but older valid reports remain
  // available for the four-card target and for evidence-grounded summarization.
  const pool=[...recent,...eligible.filter(item=>!recent.includes(item))];

  // Prefer independent publishers before repeating a source.
  const seen=new Set<string>();
  const first:T[]=[];
  const rest:T[]=[];

  for(const item of pool){
    const publisher=String(
      item.sourceName||'unknown'
    ).trim().toLowerCase();

    if(seen.has(publisher))rest.push(item);
    else {
      seen.add(publisher);
      first.push(item);
    }
  }

  return [...first,...rest];
}
