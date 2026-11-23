/** Use the commodity's already accepted selection priority, even if older
 * publications omit a historical editorial review timestamp. No new facts. */
export function overviewIssuePriority(article:{title?:string;summary?:string;procurementReview?:{priority?:unknown}}):number {
  const stored=article.procurementReview?.priority;
  if(typeof stored==='number'&&Number.isInteger(stored)&&stored>=0&&stored<=4)return stored;
  // Existing legacy fallback; absence of a review is not a new approval.
  return /생산|재고|단수|수출|공급|관세|바이오연료|가뭄|강수|선적|운임/.test(String(article.title||'')+' '+String(article.summary||''))?4:2;
}
