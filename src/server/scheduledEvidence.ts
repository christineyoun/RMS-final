import {readPotatoCompositionEvidence} from './potatoCompositionEvidence.ts';
import {collectedPublisherEvidence} from './evidenceFirstPublishers.ts';
import {prepareAnalysisEvidence} from './analysisArticleEvidence.ts';
import {savedCerealEvidence} from './scheduledCerealEvidence.ts';
/** Read already verified source records, never treat Korean AI prose as evidence. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {collectAnalysisEvidence,validAnalysisFact,type AnalysisFact} from './analysisEvidence.ts';
import {readScheduledContent} from './scheduledContent.ts';
import {hasMarketArticleBody} from './newsEvidenceQuality.ts';
export async function scheduledAnalysisEvidence(id:string,articles?:any[],root=process.cwd(),now=new Date()){
 const evidence=['wheat','corn'].includes(id)?collectAnalysisEvidence(id,root,now):await prepareAnalysisEvidence(id,root,now,{fetchSources:false}),sha=(s:string)=>createHash('sha256').update(s).digest('hex');
 const cereal=savedCerealEvidence(id,root,now);evidence.facts.push(...cereal.facts);evidence.failures.push(...cereal.failures);
 for(const article of articles||readScheduledContent('news-'+id,root)?.payload?.articles||[]){
  const e=article.verifiedSourceEvidence;if(!e||article.linkStatus!=='verified'||article.unavailable||e.originalUrl!==article.originalUrl||e.publishedAt!==article.publishedAt||e.sourceHeadline!==article.sourceHeadline||typeof e.excerpt!=='string')continue;
  const fact=verifiedScheduledArticleFact(id,article,now);
  if(!fact)continue;
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
 if(id==='potato-starch'){const official=readPotatoCompositionEvidence(root,now);for(const fact of official.facts){evidence.facts=evidence.facts.filter(f=>f.id!==fact.id);evidence.facts.push(fact);}evidence.failures.push(...official.failures);}
 evidence.facts.push(...collectedPublisherEvidence(id,root,now));
 const seen=new Set<string>();evidence.facts=evidence.facts.filter(f=>{if(!validAnalysisFact(f,id,now)){evidence.failures.push('invalid-scheduled-record:'+f.id);return false;}if(seen.has(f.id))return false;seen.add(f.id);return true;});
 return evidence;
}
/** Original verified excerpts remain evidence even if a generated summary fails.
 * This pure adapter does NOT verify a new URL or promote arbitrary model text. */
export function verifiedScheduledArticleFact(id:string,article:any,now=new Date()):AnalysisFact|null{
 const e=article?.verifiedSourceEvidence;
 if(article?.linkStatus!=='verified'||article.unavailable||!e||e.originalUrl!==article.originalUrl||e.publishedAt!==article.publishedAt||e.sourceHeadline!==article.sourceHeadline||typeof e.sourceHeadline!=='string'||!e.sourceHeadline.trim()||typeof e.excerpt!=='string'||e.excerpt.length>12000||!hasMarketArticleBody(e.excerpt,e.sourceHeadline))return null;
 const sha=(s:string)=>createHash('sha256').update(s).digest('hex'),digest=sha(JSON.stringify(e));
 const fact:AnalysisFact={id:'publisher-'+sha(e.originalUrl).slice(0,16),commodity:id,topic:id,text:`${e.publishedAt} ${e.sourceHeadline} 원문 인용: “${e.excerpt}”`,sourceUrl:e.originalUrl,sourceTitle:e.sourceHeadline,observedAt:e.publishedAt,verifiedAt:e.verifiedAt,verification:'original-record',recordSha256:digest,referenceContext:{receiptSha256:digest,quote:e.excerpt}};
 return validAnalysisFact(fact,id,now)?fact:null;
}
