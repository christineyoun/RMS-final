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
  publishedAt?:string;
};
export type RepairRejection = {url:string;reason:string};
/** Do not anchor a numeric repair on an already rejected value or draft. */
export function newsSummaryRepairFeedback<T>(reason:string,previousRejectedDraft:T|null) {
  if(reason.startsWith('unsupported-number:'))return {
    failedValidation:'unsupported-number',
    repairMode:'qualitative-from-original',
    previousRejectedDraft:null,
  } as const;
  return {failedValidation:reason,repairMode:'correct-original-binding',previousRejectedDraft} as const;
}
/** Shared editorial instructions for the existing ONE bounded optional repair.
 * Numeric failures must be rebuilt without using any part of the invalid
 * draft as factual evidence. The output still goes through all acceptance
 * checks; a retry is not an approval. */
export const NEWS_SUMMARY_REPAIR_GUIDANCE = [
  'Repair ONLY the supplied original, independently verified publisher passages. Every output item needs its matching rawId and passage evidenceIds. Return only a JSON array of {rawId,evidenceIds,title,summary}.',
  'If repairMode is qualitative-from-original: ignore previousRejectedDraft and every failed numeric assertion. Write a substantive Korean title and summary using only a supported qualitative market change. Do not include digits, dates, price levels, quantities, percentages, numerical abbreviations, or unit conversions in the title or summary. The publisher date is already stored separately. Do not infer a market direction from a number alone. Omit the article if no useful, source-supported qualitative development remains.',
  'If repairMode is correct-original-binding: correct omissions or passage IDs using ONLY the original rawSnippet and sourceEvidence. Any retained number must match the cited passage, metric, original unit and period exactly; never calculate, round, extrapolate or convert. The rejected draft is not evidence.',
  'In both modes: preserve uncertainty, the exact commodity and region, and source meaning. Do not borrow from other articles or invent claims. Omit weak, promotional or off-topic items rather than filling a card quota.'
].join('\n');
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
  maxRetry=6,
  now=new Date()
):T[]{
  if(!Number.isSafeInteger(maxPublished)||maxPublished<1||
     !Number.isSafeInteger(maxRetry)||maxRetry<1)return [];
  const remaining=Math.max(0,maxPublished-accepted.length);
  // A single verified new article can need a repaired model response. Four
  // accepted older responses do not make a newer rejected original irrelevant.
  // The caller still enforces the existing paid request and budget controls.
  if(!verified.length||accepted.length>=verified.length)return [];
  const approved=new Set(accepted.map(x=>x.originalUrl));
  const rejected=new Map(rejections.map(x=>[x.url,x.reason]));
  const seen=new Set<string>();
  const candidates=verified.filter(x=>{
    if(!x.rawId||!x.originalUrl||!x.rawTitle||!x.rawSnippet||
       approved.has(x.originalUrl)||seen.has(x.originalUrl))return false;
    seen.add(x.originalUrl);
    const reason=rejected.get(x.originalUrl);
    return !!reason&&repairable(reason);
  }).map((source,index)=>({source,index,date:Date.parse(String(source.publishedAt||''))}))
    .sort((a,b)=>(Number.isFinite(b.date)?b.date:-Infinity)-(Number.isFinite(a.date)?a.date:-Infinity)||a.index-b.index);
  if(remaining>0)return candidates.slice(0,Math.min(maxRetry,verified.length)).map(x=>x.source);

  // If all four response slots are filled, authorize a repair ONLY when a
  // recent independently verified candidate is newer than every accepted
  // response. A newly valid summary may legitimately displace an older card.
  // This never creates a second repair call: the caller performs at most its
  // existing single optional request, subject to its cost/attempt guard.
  const newestAccepted=Math.max(...accepted.map(x=>Date.parse(String((x as {publishedAt?:string}).publishedAt||'')))
    .filter(Number.isFinite),-Infinity);
  if(!Number.isFinite(newestAccepted))return [];
  const nowMs=now.getTime();
  if(!Number.isFinite(nowMs))return [];
  const novelRecent=candidates.filter(x=>Number.isFinite(x.date)&&x.date>newestAccepted&&
    x.date<=nowMs+86400000&&nowMs-x.date<=7*86400000);
  return novelRecent.slice(0,Math.min(maxRetry,1)).map(x=>x.source);
}
