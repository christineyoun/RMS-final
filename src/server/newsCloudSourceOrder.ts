/**
 * The October 27 production Cloud viewer's source-selection order.
 *
 * Source-verification has ALREADY ranked these original publisher records.
 * Do not replace that rank with an independent freshness-first reordering
 * before Gemini summarization. Keep the later cross-commodity guard by using
 * its eligibility result, not its ordering result.
 *
 * All inputs are dynamically discovered and independently verified.
 * No articles, market data, URLs, saved outputs or paid provider calls here.
 */
import {focusOnFreshVerifiedNews} from './newsFreshEvidencePolicy.ts';
export function cloudCompatibleVerifiedSourcePool<
  T extends {publishedAt?:string;rawTitle?:string;title?:string;sourceName?:string}
>(rankedVerified:readonly T[],commodity:string,now=new Date()):T[]{
  const eligible=focusOnFreshVerifiedNews(rankedVerified,now,2,commodity);
  const allowed=new Set(eligible);
  return rankedVerified.filter(item=>allowed.has(item));
}
