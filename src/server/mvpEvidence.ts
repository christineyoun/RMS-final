export const remainingIds = ['soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'];
export function snapshotIssues(key:string, body:any):string[] {
  if (!body || typeof body!=='object') return ['response-not-an-object'];
  if (body.error || body.success===false) return [String(body.error || body.errorMessage || body.status || 'upstream-unsuccessful')];
  if(key.startsWith('analysis-')) {
    const a=body.data;
    if(!a) return ['analysis-data-missing'];
    return [typeof a.executiveSummary!=='string' || a.executiveSummary.trim().length<(a.evidenceAudit?.outputFormat==='evidence-sections-v1'?1:140) ? 'executiveSummary-missing-or-too-short' : '',
      typeof a.deskRecommendation!=='string' || !a.deskRecommendation.trim() ? 'deskRecommendation-missing' : '',
      !Number.isFinite(Date.parse(a.generatedAt)) ? 'generatedAt-missing-or-invalid' : '',
      !Array.isArray(a.sources) || !a.sources.some((s:any)=>{try{return new URL(s.url).protocol==='https:';}catch{return false;}}) ? 'grounded-sources-missing' : '',
      ...['bullishFactors','bearishFactors','watchItems'].filter(k=>!Array.isArray(a[k])).map(k=>k+'-missing')].filter(Boolean) as string[];
  }
  if(key.startsWith('news-')) {
    if(!Array.isArray(body.articles)||!body.articles.length)return ['no-publishable-articles-after-source-and-summary-validation'];
    return body.articles.flatMap((a:any,i:number)=>[
      !a.originalUrl && `article-${i}:original-url-missing`, !a.publishedAt && `article-${i}:publication-date-missing`,
      !a.summary && `article-${i}:summary-missing`, a.unavailable && `article-${i}:source-unavailable`
    ].filter(Boolean));
  }
  return [];
}

