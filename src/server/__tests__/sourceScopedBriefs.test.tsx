/** OFFLINE. Original publisher inputs, never edited model responses. */
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {mock} from 'node:test';
import {completeBriefTestEvidence} from './completeBriefTestEvidence.ts';
import {analysisGenerationReadiness} from '../analysisExpressionHints.ts';
import {sourcePropositions,sourcePropositionSupport} from '../analysisSourcePropositions.ts';
import {verifiedScheduledArticleFact} from '../scheduledEvidence.ts';
import {parseGroundedAnalysis} from '../groundedAnalysisResponse.ts';
import {validateReportedFact} from '../analysisReportedFact.ts';
import {canonicalAnalysisQualityIssues} from '../analysisPublicationQuality.ts';
import {briefPresentationIssues} from '../analysisBriefContract.ts';
import {buildRecoveryAnalysisRequest} from '../liveAiAnalysisService.ts';
import {validateConditionalReasoning} from '../analysisReasoning.ts';
import {publishScheduledContent,readScheduledContent} from '../scheduledContent.ts';
import {aggregateOverview} from '../../utils/overviewIntelligence.ts';

const archive=JSON.parse(fs.readFileSync(new URL('./fixtures/oct27PaidValidation.json',import.meta.url),'utf8'));
const next=JSON.parse(fs.readFileSync(new URL('./fixtures/oct28PaidAnalysis.json',import.meta.url),'utf8'));
const examples=JSON.parse(fs.readFileSync(new URL('./fixtures/completeKoreanBriefs.json',import.meta.url),'utf8')).bodies;
const now=new Date('2026-10-28T01:00:00Z'),root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-source-briefs-OFFLINE-')),native=globalThis.fetch;
mock.timers.enable({apis:['Date'],now});globalThis.fetch=async()=>{throw Error('No network/paid operations');};
const response=(body:any)=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(body)}]}}]});
const parse=(body:any,row:any,evidence:any)=>parseGroundedAnalysis(response(body),row.model,new Date(),evidence,{requiredContractVersion:4,requiredFactBinding:true,requiredReportStyle:true});
const published:any[]=[];
try{
 for(const row of archive.analysis){
  const evidence=completeBriefTestEvidence(row,archive,now),body=examples[row.id],plan=analysisGenerationReadiness(evidence);
  assert(plan.feasible,row.id+': '+plan.missing.join(','));
  const data=parse(body,row,evidence),dest=path.join(root,row.id),key='analysis-'+row.id;
  assert(publishScheduledContent({[key]:{success:true,data}},'OFFLINE-eight',dest).accepted.includes(key));
  const before=fs.readFileSync(path.join(dest,'.rms-stage3/scheduled-content-current.json'));
  // HTTP success alone is not validation success, and cannot change saved data.
  const rejected=structuredClone(body);rejected.procurementStrategy.text='원가 하락이 확실하므로 물량의 50%를 즉시 구매';
  assert.throws(()=>parse(rejected,row,evidence));
  assert.deepEqual(fs.readFileSync(path.join(dest,'.rms-stage3/scheduled-content-current.json')),before);
  mock.timers.setTime(+now+86400000);const same=parse(body,row,evidence);
  assert.deepEqual(publishScheduledContent({[key]:{success:true,data:same}},'OFFLINE-identical-next-day',dest).accepted,[]);
  assert.equal(readScheduledContent(key,dest).payload.data.generatedAt,data.generatedAt);
  mock.timers.setTime(+now);published.push({id:row.id,analysis:readScheduledContent(key,dest).payload.data,articles:[]});
  for(const category of ['bullishFactors','bearishFactors','monitoringItems']){
   const bad=structuredClone(body);bad[category]=[];assert.throws(()=>parse(bad,row,evidence),row.id+' missing '+category);
  }
  const weak={...data,executiveSummary:('세계 해당 원료 생산 전망은 연간 전망치입니다. ').repeat(8)+'\n\n'+data.executiveSummary.split('\n\n')[1]};
  assert(briefPresentationIssues(weak).includes('brief-repetitive-classification-filler'));
 }
 const overview=aggregateOverview(published,+now);
 assert.equal(overview.analyses.length,8);
 for(const row of published)assert.equal(overview.analyses.find(r=>r.id===row.id).generatedAt,row.analysis.generatedAt);
 const tapioca=archive.analysis.find((r:any)=>r.id==='tapioca-starch');
 assert.deepEqual(analysisGenerationReadiness(tapioca.evidence).missing,['bullish-driver','bearish-driver']);
 assert.throws(()=>buildRecoveryAnalysisRequest(tapioca.model,tapioca.id,tapioca.evidence,'2026-10-28','verified-only'),/no paid request made/);
 const full=completeBriefTestEvidence(tapioca,archive,now),publisher=full.facts.find(f=>f.id.startsWith('publisher-'))!;
 assert(sourcePropositions(publisher).some(p=>p.role==='bullish'));
 assert(sourcePropositions(publisher).some(p=>p.role==='bearish'));
 for(const change of [
  {sourceUrl:'https://www.usda.gov/unrelated'}, {observedAt:'2026-10-28'},
  {referenceContext:{...publisher.referenceContext,receiptSha256:'0'.repeat(64)}},
  {text:publisher.text+' Therefore guaranteed profits.'},
 ])assert.equal(sourcePropositions({...publisher,...change}).length,0);
 for(const p of sourcePropositions(publisher)){
  assert.equal(sourcePropositionSupport(p.text+' 따라서 가격 상승은 확실합니다.',[publisher],p.role),null);
 }
 const raw=archive.news.find((n:any)=>n.id==='tapioca-starch').inputs.find((i:any)=>i.rawId==='procurement-tapioca');
 const e={originalUrl:raw.originalUrl,publishedAt:raw.publishedAt,sourceHeadline:raw.rawTitle,excerpt:raw.rawSnippet,verifiedAt:raw.retrievedAt};
 const article={originalUrl:e.originalUrl,publishedAt:e.publishedAt,sourceHeadline:e.sourceHeadline,linkStatus:'verified',verifiedSourceEvidence:e,summary:'invented model summary 999999 tonnes'};
 const source=verifiedScheduledArticleFact('tapioca-starch',article,now)!;
 assert.deepEqual(source,verifiedScheduledArticleFact('tapioca-starch',{...article,summary:'a different invalid summary'},now));
 assert(!source.text.includes('invented model'));assert.equal(source.recordSha256,source.referenceContext?.receiptSha256);
 assert.equal(verifiedScheduledArticleFact('tapioca-starch',{...article,linkStatus:'unverified'},now),null);
 assert.equal(verifiedScheduledArticleFact('tapioca-starch',{...article,verifiedSourceEvidence:{...e,excerpt:e.sourceHeadline}},now),null);
 const opposite=sourcePropositions(source).find(p=>p.role==='bearish')!;
 assert(canonicalAnalysisQualityIssues({factBinding:'verified-records-v1',evidenceClaims:[{field:'bullishFactors.0',segments:[{kind:'fact',text:source.text,evidenceIds:[source.id]},{kind:'reported-fact',text:opposite.text,evidenceIds:[source.id]}]}]},full).includes('missing-supported-market-driver:bullishFactors.0'));
 const soy=archive.analysis.find((r:any)=>r.id==='soybean'),body=next.analysis.find((r:any)=>r.id==='soybean').body;
 const planting=body.marketAnalysis.text.split(/(?<=[.!?])\s+/)[1],offer=body.marketAnalysis.text.split(/(?<=[.!?])\s+/)[3];
 assert.deepEqual(validateReportedFact(planting,soy.evidence.facts).issues,[]);
 assert.deepEqual(validateReportedFact(offer,soy.evidence.facts).issues,[]);
 for(const wrong of [planting.replace('52%','53%'),planting.replace('43%','44%'),planting.replace('5년','6년'),planting.replace('19일','20일'),planting.replace('브라질','미국'),planting+' 따라서 생산량 증가가 확실합니다.',offer.replace('517.38','505.23'),offer.replace('USD/MT','USD/kg'),offer.replace('11월','12월')])assert(validateReportedFact(wrong,soy.evidence.facts).issues.length,wrong);
 const potato=archive.analysis.find((r:any)=>r.id==='potato-starch'),potatoSentences=next.analysis.find((r:any)=>r.id===potato.id).body.marketAnalysis.text.split(/(?<=[.!?])\s+/);
 for(const text of potatoSentences.slice(1))assert.deepEqual(validateReportedFact(text,potato.evidence.facts).issues,[]);
 for(const wrong of [potatoSentences[1].replace('500.51','500.52'),potatoSentences[1].replace('13.72','13.73'),potatoSentences[1].replace('EU27','EU28'),potatoSentences[1].replace('2025년 9월','2025년 8월'),potatoSentences[1].replace('11081300','11081400'),potatoSentences[1].replace('천 MT','MT'),potatoSentences[2].replace('35,254.22','35,254.23'),potatoSentences[2].replace('전체 감자','완제품 감자전분'),potatoSentences[2].replace('781.6','781.7')])assert(validateReportedFact(wrong,potato.evidence.facts).issues.length,wrong);
 const tapiocaSentences=next.analysis.find((r:any)=>r.id==='tapioca-starch').body.marketAnalysis.text.split(/(?<=[.!?])\s+/);
 for(const text of tapiocaSentences)assert.deepEqual(validateReportedFact(text,tapioca.evidence.facts).issues,[]);
 for(const wrong of [tapiocaSentences[1].replace('690','691'),tapiocaSentences[1].replace('20일','21일'),tapiocaSentences[1].replace('USD/MT','USD/kg'),tapiocaSentences[2].replace('구별됩니다','동일합니다')])assert(validateReportedFact(wrong,tapioca.evidence.facts).issues.length,wrong);
 const oil=archive.analysis.find((r:any)=>r.id==='soybean-oil').evidence.facts.find((f:any)=>f.id==='soybean-oil-zl-2026-10-27');
 assert.deepEqual(validateConditionalReasoning('대두유 선물가격과 정제유 공급사 오퍼를 비교하십시오.',[oil],{kind:'recommendation',support:[{evidenceId:oil.id,aspect:'price-level'}]}).issues,[]);
 assert(validateConditionalReasoning('대두유 선물가격은 정제유 현물 가격과 동일하므로 즉시 구매하십시오.',[oil],{kind:'recommendation',support:[{evidenceId:oil.id,aspect:'price-level'}]}).issues.length);
 if(process.env.RMS_BRIEF_PUBLICATION_RESULTS)fs.writeFileSync(process.env.RMS_BRIEF_PUBLICATION_RESULTS,JSON.stringify({accepted:published.map(r=>({id:r.id,generatedAt:r.analysis.generatedAt,evidenceDates:r.analysis.evidenceAudit.facts.map((f:any)=>f.observedAt),report:r.analysis})),overview,paidCalls:0},null,2),{mode:0o600});
 console.log('PASS all-eight complete source-backed briefs; independent reject/retain/unchanged dates; Overview accepted inputs; source/time/direction/number/currency mutations; no fabricated drivers or paid calls.');
}finally{mock.timers.reset();globalThis.fetch=native;fs.rmSync(root,{recursive:true,force:true});}
