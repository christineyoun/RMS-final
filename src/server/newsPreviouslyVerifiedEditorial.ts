/** Prepare previous approved news for OPTIONAL evidence-bound editorial revision.
 * No network, model invocation, write, or acceptance bypass occurs here.
 * Caller must separately satisfy paid-run authorization and model budget.
 */
import {acceptedScheduledNews} from './scheduledContent.ts';
import type {MarketArticle,RetrievedSourceMetadata} from './marketIntelligenceService.ts';

export function previouslyVerifiedEditorialSources(
  commodity:string,
  previous:readonly MarketArticle[],
  urlsAlreadyInCurrentRun:ReadonlySet<string>
):Array<{source:RetrievedSourceMetadata;article:MarketArticle}>{
  // The same full original-page receipt and substantive-news gates used in
  // scheduled publication must pass again; a historical URL alone is insufficient.
  const eligible=acceptedScheduledNews(commodity,[...previous]);
  return eligible.flatMap((article:MarketArticle)=>{
    if(urlsAlreadyInCurrentRun.has(article.originalUrl))return [];
    const evidence=article.verifiedSourceEvidence;
    if(!evidence?.excerpt||!article.sourceHeadline||!article.originalUrl)return [];
    const source:RetrievedSourceMetadata={
      rawId:article.originalUrl,
      rawTitle:article.sourceHeadline,
      rawSnippet:evidence.excerpt,
      publishedAt:article.publishedAt,
      originalUrl:article.originalUrl,
      sourceName:article.sourceName,
      sourceType:article.sourceType,
      retrievedAt:article.retrievedAt,
    };
    return [{source,article}];
  });
}
