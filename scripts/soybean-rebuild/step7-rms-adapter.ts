/** Pure STEP 7 -> existing RMS AI card adapter. Common for all eight commodities. */
import {auditFinalResult, type FinalResult, type EvidenceSource} from './step7-core.ts';
import {assessStep7AiRisk,type PreviewAiRisk} from './step7-ai-risk.ts';
import {bindOverviewTakeaway} from './step7-overview-takeaway.ts';
import type {PublishedOverviewTakeaway} from '../../src/utils/overviewTakeaway.ts';

export const COMMODITY_IDS = ['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'] as const;
export type RmsCardData = {
  deskRecommendation:string; purchaseActions:string[];
  executiveSummary:string; bullishFactors:string[]; bearishFactors:string[]; watchItems:string[];
  sources:Array<{title:string;url:string}>;generatedAt:string;status:'cached';model:string;
  /** Read-only, unapproved stand-alone test. Never use as a publication receipt. */
  rmsStep7Preview:true;
  procurementRiskPreview?:PreviewAiRisk;
  overviewTakeaway?:PublishedOverviewTakeaway;
};
export type Step7Saved = {
  stage:string;status:string;commodity:string;recordedAt:string;model?:string;
  overviewTakeawayReviewed?:boolean;
  result?:FinalResult|null;audit?:{invalidSourceIds?:string[];tooLongFactors?:string[];headlineTooLong?:boolean};
};
export function safePublisherOriginal(raw:string|null|undefined):raw is string {
  if(!raw)return false;
  try {
    const u=new URL(raw),h=u.hostname.toLowerCase();
    return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!!h.includes('.')&&
      !/^(?:localhost|\d{1,3}(?:\.\d{1,3}){3}|\[.*\])$/.test(h)&&
      !/\.(?:local|internal|test|example)$/.test(h)&&
      !/(^|\.)google\.com$/.test(h)&&h!=='vertexaisearch.cloud.google.com'&&u.pathname!=='/'&&
      !['api.fas.usda.gov','query1.finance.yahoo.com'].includes(h);
  }catch{return false;}
}
/** Review-only warnings. They NEVER erase source excerpts or rewrite Gemini text. */
export function advisoryWarnings(r:FinalResult):string[] {
  const p=r.procurementStrategy;
  const warnings:string[]=[];
  if(/\d[\d,.]*(?:\s*[~～\-–]\s*\d[\d,.]*)?\s*%/.test(p))
    warnings.push('구매 비중(%)의 계산 근거 및 실제 계약·재고 자료 확인 필요');
  if(/\d[\d,.]*(?:\s*[~～\-–]\s*\d[\d,.]*)?\s*(?:센트|원|달러|USD|EUR|€|\$)/i.test(p)||/\d[\d,.]*\s*센트/.test(p))
    warnings.push('매수 가격 기준의 기준일·계약월·산출 근거 확인 필요');
  if(/(?:생산량|수확량|수확).{0,32}(?<!미)확정/.test(r.marketOutlook))
    warnings.push('시장전망에서 전망치와 실제 확정치를 구분했는지 확인 필요');
  return warnings;
}
export function adaptStep7ToRms(saved:Step7Saved,sources:EvidenceSource[]):{data:RmsCardData;warnings:string[];references:string[]} {
  if(saved.stage!=='final-market-outlook-and-procurement'||saved.status!=='report-created'||!saved.result)
    throw Error('STEP7 success result required; report-review-needed is not displayable.');
  if(!COMMODITY_IDS.includes(saved.commodity as (typeof COMMODITY_IDS)[number]))throw Error('Unknown commodity ID');
  const r=saved.result;
  const audit=auditFinalResult(r,{sources} as any);
  if(audit.invalidSourceIds.length||audit.tooLongFactors.length||audit.headlineTooLong)
    throw Error('STEP7 source/length audit failed: '+JSON.stringify(audit));
  for(const v of [r.headline,r.marketOutlook,r.procurementStrategy])if(!v?.trim())throw Error('Empty market content');
  if(!Array.isArray(sources)||sources.some(s=>!s.id||!s.grade))throw Error('Missing source inventory');
  const riskEvaluation=assessStep7AiRisk(saved.commodity,r.procurementRisk,sources);
  const procurementRiskPreview=riskEvaluation.risk;
  const ids=new Set([...r.sourceIds,...r.bullishFactors.flatMap(x=>x.sourceIds),
    ...r.bearishFactors.flatMap(x=>x.sourceIds),...r.monitoringFactors.flatMap(x=>x.sourceIds),
    ...(procurementRiskPreview?r.procurementRisk?.sourceIds||[]:[])]);
  const cited=sources.filter(s=>ids.has(s.id)&&s.grade!=='EXCLUDED'&&safePublisherOriginal(s.url));
  // Reference links are REAL publisher destinations. Never substitute Google relay or an invented URL.
  const unique=new Map(cited.map(s=>[s.url!,{title:(s.grade==='B'?'[원문 접근 제한] ':'[원문 열람] ')+(s.title||new URL(s.url!).hostname),url:s.url!}]));
  if(!unique.size)throw Error('No cited publisher original URL available for RMS footer');
  const generated=new Date(saved.recordedAt);
  if(!Number.isFinite(generated.getTime()))throw Error('Invalid STEP7 generation timestamp');
  const overviewTakeaway=saved.overviewTakeawayReviewed===true
    ? bindOverviewTakeaway(r.overviewTakeaway,cited):undefined;
  const warnings=advisoryWarnings(r);
  if(riskEvaluation.warning)warnings.push(riskEvaluation.warning);
  return {data:{deskRecommendation:r.headline.trim(),
    executiveSummary:r.marketOutlook.trim(),purchaseActions:[r.procurementStrategy.trim()],
    bullishFactors:r.bullishFactors.map(x=>x.text.trim()),
    bearishFactors:r.bearishFactors.map(x=>x.text.trim()),
    watchItems:r.monitoringFactors.map(x=>x.text.trim()),
    sources:[...unique.values()],generatedAt:generated.toISOString(),
    status:'cached',model:saved.model||'gemini',rmsStep7Preview:true,
    ...(procurementRiskPreview?{procurementRiskPreview}:{}),
    ...(overviewTakeaway?{overviewTakeaway:{...overviewTakeaway,commodityId:saved.commodity,generatedAt:generated.toISOString()}}:{})},
    warnings,references:[...ids]};
}
