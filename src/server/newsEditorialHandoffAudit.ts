/**
 * Evidence-only diagnostics for the scheduled Market Intelligence handoff.
 * This observes (but does not alter) source verification, model validation and
 * editorial selection. In particular, an independently verified page is NOT
 * automatically an approved story. A future email monitor can distinguish a
 * missed summarization slot from a source-evidence or selection rejection.
 */
type Source={originalUrl:string;publishedAt:string;sourceName?:string};
type Rejection={url:string;reason:string};
const key=(s:Source)=>String(s.originalUrl||'');
const latest=(items:readonly Source[])=>items.map(x=>String(x.publishedAt||'').slice(0,10))
  .filter(x=>/^20\d{2}-\d{2}-\d{2}$/.test(x)).sort().at(-1)||null;
export function auditNewsEditorialHandoff(
  verifiedPool:readonly Source[],
  chosenForSummary:readonly Source[],
  acceptedSummaries:readonly Source[],
  chosenForHandoff:readonly Source[],
  rejections:readonly Rejection[]
){
  const summaryUrls=new Set(chosenForSummary.map(key));
  const acceptedUrls=new Set(acceptedSummaries.map(key));
  const handoffUrls=new Set(chosenForHandoff.map(key));
  const rejectedByUrl=new Map(rejections.map(r=>[r.url,r.reason]));
  const mostRecentHandoff=latest(chosenForHandoff);
  const newestOmitted=verifiedPool.filter(s=>key(s)&&
    (!mostRecentHandoff||String(s.publishedAt).slice(0,10)>mostRecentHandoff)&&
    !handoffUrls.has(key(s)));
  const awaitingReview=newestOmitted.map(s=>({
    publishedAt:s.publishedAt,sourceName:s.sourceName||'',originalUrl:s.originalUrl,
    stage:!summaryUrls.has(key(s))?'verified-but-not-in-editorial-input':
      !acceptedUrls.has(key(s))?'editorial-validation-failed':
        'accepted-summary-not-in-handoff',
    reason:rejectedByUrl.get(key(s))||null
  }));
  return {
    verifiedSourceCount:verifiedPool.length,
    summarizedSourceCount:chosenForSummary.length,
    approvedSummaryCount:acceptedSummaries.length,
    handoffCount:chosenForHandoff.length,
    newestVerifiedSourceDate:latest(verifiedPool),
    newestHandoffDate:mostRecentHandoff,
    newerVerifiedNotInHandoff:awaitingReview,
    note:'A verified original still requires a valid Korean summary and final selection. This is a handoff audit, not proof that no newer external reporting exists.'
  };
}
