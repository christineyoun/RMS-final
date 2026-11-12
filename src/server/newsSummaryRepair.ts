/**
 * Bounded, commodity-agnostic repair of a model's incomplete SUMMARY response.
 * Only original publisher-verified inputs can be retried. This cannot approve
 * news by itself, change facts, bypass binding checks or authorize paid calls.
 */
export type RepairInput = {
  rawId: string;
  originalUrl: string;
  rawTitle: string;
  rawSnippet: string;
};
export type RepairRejection = {url:string;reason:string};
const repairable = (reason:string) =>
  reason === 'missing-model-output' ||
  reason === 'missing-or-invalid-korean-summary' ||
  reason === 'invalid-or-missing-news-evidence-ids' ||
  reason === 'empty-evidence-quote' ||
  reason === 'evidence-quote-not-found-in-publisher-text' ||
  reason === 'missing-korean-summary' ||
  reason.startsWith('unsupported-number:');

/** No retry for irrelevant/empty publisher text or editorial/factual failures. */
export function planNewsSummaryRepair<T extends RepairInput>(
  verified: readonly T[],
  accepted: readonly {originalUrl:string}[],
  rejections: readonly RepairRejection[],
  maxPublished=4,
  maxRetry=6
):T[]{
  if(!Number.isSafeInteger(maxPublished)||maxPublished<1||
     !Number.isSafeInteger(maxRetry)||maxRetry<1)return [];
  const remaining=Math.max(0,maxPublished-accepted.length);
  // Repair a MODEL omission even in a sparse verified source pool. Earlier
  // policy required at least four sources before recovery, which stranded
  // valid two- and three-source commodities whenever a summary was omitted.
  // The caller separately enforces remaining authorized provider calls and
  // cost; this function never triggers a paid request on its own.
  if(remaining===0||verified.length<2||accepted.length>=verified.length)return [];
  const approved=new Set(accepted.map(x=>x.originalUrl));
  const rejected=new Map(rejections.map(x=>[x.url,x.reason]));
  const seen=new Set<string>();
  return verified.filter(x=>{
    if(!x.rawId||!x.originalUrl||!x.rawTitle||!x.rawSnippet||
       approved.has(x.originalUrl)||seen.has(x.originalUrl))return false;
    seen.add(x.originalUrl);
    const reason=rejected.get(x.originalUrl);
    return !!reason&&repairable(reason);
  }).slice(0,Math.min(maxRetry,verified.length));
}
