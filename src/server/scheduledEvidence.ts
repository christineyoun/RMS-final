/** Read already verified source records, never treat Korean AI prose as evidence. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {collectAnalysisEvidence,validAnalysisFact,type AnalysisFact} from './analysisEvidence.ts';
import {readScheduledContent} from './scheduledContent.ts';
export function scheduledAnalysisEvidence(id:string,articles?:any[],root=process.cwd(),now=new Date()){
 const evidence=collectAnalysisEvidence(id,root,now),sha=(s:string)=>createHash('sha256').update(s).digest('hex');
 for(const article of articles||readScheduledContent('news-'+id,root)?.payload?.articles||[]){
  const e=article.verifiedSourceEvidence;if(!e||e.originalUrl!==article.originalUrl||e.publishedAt!==article.publishedAt)continue;
  const fact:AnalysisFact={id:'publisher-'+sha(e.originalUrl).slice(0,16),commodity:id,topic:id,text:`${e.publishedAt} ${e.sourceHeadline}: ${e.excerpt}`,sourceUrl:e.originalUrl,sourceTitle:e.sourceHeadline,observedAt:e.publishedAt,verifiedAt:e.verifiedAt,verification:'original-record',recordSha256:sha(JSON.stringify(e))};
  if(validAnalysisFact(fact,id,now))evidence.facts.push(fact);
 }
 if(id==='tapioca-starch')try{
  const history=JSON.parse(fs.readFileSync(path.join(root,'.rms-price-history/tapioca-starch.json'),'utf8'));
  const sourceUrl='https://www.thaitapiocastarch.org/en/information/statistics/weekly_tapioca_starch_price',verifiedAt=history.sourceChecks?.[sourceUrl]?.lastSuccessAt;
  for(const p of history.points.filter((p:any)=>p.provenance==='source-verified'&&p.benchmark==='tapioca-fob'&&p.unit==='USD/MT'&&p.sourceUrl===sourceUrl&&p.usdPerMT>0).slice(-2)){
   const fact:AnalysisFact={id:'ttsa-'+p.date,commodity:id,topic:'타피오카전분',text:`TTSA ${p.date} 타피오카전분 FOB Bangkok 공식 주간 관측 ${p.usdPerMT} USD/MT. 한국 도착가 또는 원료 카사바 생산량이 아닙니다.`,sourceUrl,sourceTitle:'TTSA weekly tapioca starch price',observedAt:p.date,verifiedAt,verification:'original-record',recordSha256:sha(JSON.stringify(p)),measure:{metric:'price',scope:'FOB Bangkok',benchmark:'TTSA:TS',unit:'USD/MT',value:p.usdPerMT,valueKind:'actual'}};
   if(validAnalysisFact(fact,id,now))evidence.facts.push(fact);
  }
 }catch{evidence.failures.push('No verified TTSA weekly price evidence');}
 return evidence;
}
