/** OFFLINE: unchanged paid bodies versus authored, explicitly conditional fixtures. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import assert from 'node:assert/strict';import {mock} from 'node:test';import {createHash} from 'node:crypto';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import AiRecommendation from '../../components/AiRecommendation.tsx';
import {parseGroundedAnalysis} from '../groundedAnalysisResponse.ts';
import {compileAnalysisSection} from '../analysisSections.ts';
import {briefPresentationIssues,ANALYSIS_BRIEF_STYLE} from '../analysisBriefContract.ts';
import {analysisReplacementIssues} from '../analysisPublicationQuality.ts';
import {buildRecoveryAnalysisRequest} from '../liveAiAnalysisService.ts';
import {publishScheduledContent,readScheduledContent} from '../scheduledContent.ts';
import {validateReportedFact} from '../analysisReportedFact.ts';
import {aggregateOverview} from '../../utils/overviewIntelligence.ts';
import {eligibleMarketIssue} from '../../utils/marketIssueEligibility.ts';
import {snapshotIssues} from '../mvpEvidence.ts';
import {verifiedKoreanExpressions} from '../analysisExpressionHints.ts';
import {scheduledAnalysisResults} from '../scheduledAi.ts';
import {completeBriefTestEvidence} from './completeBriefTestEvidence.ts';

const oct27=JSON.parse(fs.readFileSync(new URL('./fixtures/oct27PaidValidation.json',import.meta.url),'utf8'));
const oct28=JSON.parse(fs.readFileSync(new URL('./fixtures/oct28PaidAnalysis.json',import.meta.url),'utf8'));
assert.equal(createHash('sha256').update(fs.readFileSync(new URL('./fixtures/oct27PaidValidation.json',import.meta.url))).digest('hex'),oct28.evidenceFixtureSha256);
const complete=JSON.parse(fs.readFileSync(new URL('./fixtures/completeKoreanBriefs.json',import.meta.url),'utf8')).bodies;
const now=new Date('2026-10-28T01:00:00Z'),native=globalThis.fetch;
const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-integrated-brief-OFFLINE-'));
mock.timers.enable({apis:['Date'],now});globalThis.fetch=async()=>{throw Error('Real network and paid calls prohibited');};
const reply=(body:any)=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(body)}]}}]});
const parse=(body:any,row:any,strict=true)=>parseGroundedAnalysis(reply(body),row.model,now,row.evidence,{requiredContractVersion:4,requiredFactBinding:true,requiredReportStyle:strict});
const results:any={archived:[],authored:[],paidCalls:0};
try{
 for(const row of oct27.analysis){
  const request=buildRecoveryAnalysisRequest(row.model,row.id,completeBriefTestEvidence(row,oct27,now),'2026-10-28','verified-only');
  assert((request.config.responseSchema as any).required.includes('reportStyle'));
  assert((request.config.responseSchema as any).required.includes('priceOutlook'));
  assert(request.contents.includes('verifiedKoreanExpressions'));
  for(const fact of row.evidence.facts)for(const text of verifiedKoreanExpressions(fact).facts)assert.deepEqual(validateReportedFact(text,[fact]).issues,[]);
  for(const [date,body]of [['2026-10-27',row.body],['2026-10-28',oct28.analysis.find((v:any)=>v.id===row.id).body]] as const){
   const outcome:any={id:row.id,date,evidenceDates:[...new Set(row.evidence.facts.map((f:any)=>f.observedAt))].sort(),sections:{}};
   for(const field of ['marketAnalysis','procurementStrategy'])try{
    compileAnalysisSection(body[field],row.evidence,now,field==='marketAnalysis'?'conditional':'recommendation',field==='marketAnalysis');outcome.sections[field]={accepted:true};
   }catch(e:any){outcome.sections[field]={accepted:false,reason:e.message};}
   for(const strict of [false,true])try{
    const data=parse(body,row,strict),dest=path.join(root,date,row.id,String(strict)),key='analysis-'+row.id;
    const accepted=publishScheduledContent({[key]:{success:true,data}},'OFFLINE-unchanged-replay',dest).accepted.includes(key)&&!!readScheduledContent(key,dest);
    outcome[strict?'newContract':'legacyContract']={accepted,generatedAt:data.generatedAt};
   }catch(e:any){outcome[strict?'newContract':'legacyContract']={accepted:false,stage:e.stage||'publication',issues:e.issues||[e.message]};}
   results.archived.push(outcome);
  }
  const evidence=completeBriefTestEvidence(row,oct27,now),body=structuredClone(complete[row.id]);
  const [first,second]=body.marketAnalysis.text.split('\n\n'),ko=evidence.facts[0].topic;
  const data=parse(body,{...row,evidence});assert.deepEqual(briefPresentationIssues(data),[]);
  assert(!briefPresentationIssues({...data,deskRecommendation:'가'.repeat(40),bullishFactors:['나'.repeat(70)]}).some(s=>/recommendation|bullishFactors/.test(s)),'inclusive presentation boundaries only; fact validation is separate');
  assert.equal(data.executiveSummary,body.marketAnalysis.text);assert.equal(data.deskRecommendation,body.procurementStrategy.text);
  const facts=data.evidenceAudit.facts;assert(Array.isArray(facts)&&facts.length>=2);assert(!data.executiveSummary.includes(evidence.facts[0].text));
  const key='analysis-'+row.id,dest=path.join(root,'authored',row.id);
  assert(publishScheduledContent({[key]:{success:true,data}},'OFFLINE-authored',dest).accepted.includes(key));
  assert.deepEqual(readScheduledContent(key,dest).payload.data,data);
  const html=renderToStaticMarkup(<AiRecommendation commodityId={row.id} executiveSummary={data.executiveSummary} recommendedCoverage={data.deskRecommendation} bullishFactors={data.bullishFactors} bearishFactors={data.bearishFactors} watchItems={data.watchItems} researchSources={data.sources} researchStatus="cached"/>);
  assert(html.includes('whitespace-pre-line'));assert(html.includes(data.deskRecommendation));
  assert(!html.includes('recordSha256'));assert(!html.includes('원문 인용:'));
  for(const mutate of [
   (b:any)=>{b.procurementStrategy.text='가'.repeat(41);},
   (b:any)=>{b.bullishFactors[0].text='가'.repeat(71);},
   (b:any)=>{b.bearishFactors=[];},
   (b:any)=>{b.monitoringItems[0].text='상승요인 없음';},
   (b:any)=>{b.marketAnalysis.text=first;},
   (b:any)=>{b.marketAnalysis.text='짧은 요약\n\n짧은 권고';},
   (b:any)=>{b.marketAnalysis.text=first+'\n\n물량의 50%를 즉시 구매하십시오.';},
   (b:any)=>{b.marketAnalysis.text='세계 '+ko+' 생산 전망은 999999999톤입니다. '+first+'\n\n'+second;},
  ]){const bad=structuredClone(body);mutate(bad);assert.throws(()=>parse(bad,{...row,evidence}));}
  assert.throws(()=>parse(body,{...row,evidence:{commodity:row.id,facts:[],failures:['missing']}}));
  const previous=structuredClone(data);previous.bullishFactors.push('기존 두 번째 요인');
  assert.deepEqual(analysisReplacementIssues(data,previous),[],'fewer complete bullets is not regression');
  const corrupt=structuredClone(data);corrupt.bullishFactors=[];
  assert(snapshotIssues(key,{success:true,data:corrupt}).length);
  assert.throws(()=>publishScheduledContent({[key]:{success:true,data:corrupt}},'OFFLINE-rejected',dest));
  assert.equal(readScheduledContent(key,dest).payload.data.generatedAt,data.generatedAt);
  const changed=structuredClone(data);changed.executiveSummary='허위 '+changed.executiveSummary;
  assert(snapshotIssues(key,{success:true,data:changed}).length,'publication rechecks visible prose against audited claims');
  const changedSource=structuredClone(data);changedSource.sources[0].url='https://fake.invalid/source';
  assert(snapshotIssues(key,{success:true,data:changedSource}).length,'publication rechecks original source identity');
  results.authored.push({id:row.id,accepted:true,firstParagraphCharacters:Array.from(first).length,secondParagraphCharacters:Array.from(second).length,visibleTextExact:true});
 }
 // Supported paraphrases are deliberately scoped; causal suffixes and wrong
 // commodities, forecast status and currencies cannot ride on matching IDs.
 const palm=oct27.analysis.find((r:any)=>r.id==='palm-oil');
 const price='확인된 두 관측 사이 말레이시아 CPO 선물 종가는 상승했습니다.';
 assert.deepEqual(validateReportedFact(price,palm.evidence.facts).issues,[]);
 const increasingWindow=palm.evidence.facts.filter((f:any)=>!f.comparison&&f.measure?.benchmark==='palm-cpo'&&f.observedAt>='2026-10-14');
 for(const text of [price.replace('상승','하락'),price+' 따라서 매수자 우위가 확실합니다.',price.replace('CPO','대두')])assert(validateReportedFact(text,increasingWindow).issues.length);
 const articles=Array.from({length:6},(_,i)=>({originalUrl:'https://www.usda.gov/news/'+i,publishedAt:'2026-10-'+String(27-i).padStart(2,'0'),linkStatus:'verified',title:'옥수수 수출 여건',summary:'옥수수 수출 물량과 공급 전망을 확인합니다.',sourceType:'official'}));
 const overview=aggregateOverview([{id:'corn',analysis:null,articles}],+now);
 assert.deepEqual(overview.issues.map(a=>a.originalUrl),articles.slice(0,5).map(a=>a.originalUrl));
 assert(!eligibleMarketIssue({...articles[0],publishedAt:'2026-10-01'},+now));
 assert(!eligibleMarketIssue({...articles[0],originalUrl:'https://anonymous.blogspot.com/post'},+now));
 const unavailable=oct27.analysis.map((r:any)=>({id:r.id,analysis:null,articles:[]}));
 assert.equal(aggregateOverview(unavailable,+now).analyses.length,0);
 const selected:Record<string,any>={};
 for(const row of results.authored.filter((r:any)=>r.accepted))selected['analysis-'+row.id]=readScheduledContent('analysis-'+row.id,path.join(root,'authored',row.id)).payload;
 const matrixRoot=path.join(root,'matrix');publishScheduledContent(selected,'OFFLINE-matrix',matrixRoot);
 const matrix=scheduledAnalysisResults({phases:{
  'analysis-wheat':{status:'accepted',generationSucceeded:true},
  'analysis-corn':{status:'retained-previous',reason:'generation-or-evidence-validation'},
  'analysis-soybean':{status:'retained-previous',reason:'analysis-content-unchanged',generationSucceeded:true},
  'analysis-soybean-oil':{status:'retained-previous',reason:'not-authorized'},
  'analysis-sugar':{status:'retained-previous',validationIssues:['unsupported-number'],generationSucceeded:true},
  'analysis-potato-starch':{status:'retained-previous',validationIssues:['unsupported-causal-conclusion'],generationSucceeded:true},
 }} as any,{'analysis-wheat':selected['analysis-wheat']},matrixRoot);
 assert.equal(matrix.length,8);
 const status=(id:string)=>matrix.find(r=>r.commodity===id)!;
 assert.equal(status('wheat').status,'Updated');assert(status('wheat').publicationSucceeded);
 assert.equal(status('corn').status,'Retained previous report');
 assert.equal(status('soybean').status,'Unchanged');assert(status('soybean').validationSucceeded);
 assert.equal(status('soybean-oil').status,'Not authorized');
 assert.equal(status('potato-starch').status,'Retained previous report');assert.equal(status('potato-starch').reason,'unsupported-causal-conclusion');
 assert.equal(status('tapioca-starch').status,'Not authorized');
 const noPrior=scheduledAnalysisResults({phases:{'analysis-potato-starch':{status:'retained-previous',reason:'unsupported-driver'}}} as any,{},path.join(root,'no-prior'));assert.equal(noPrior.find(r=>r.commodity==='potato-starch')?.status,'Rejected');results.statusMatrix=matrix;
 assert.equal(results.archived.length,16);assert.equal(results.authored.length,8);
 if(process.env.RMS_INTEGRATED_RESULTS)fs.writeFileSync(process.env.RMS_INTEGRATED_RESULTS,JSON.stringify(results,null,2),{mode:0o600});
 console.log('PASS integrated brief: '+JSON.stringify({authored:results.authored,archivedAccepted:results.archived.filter((r:any)=>r.newContract.accepted).length,paidCalls:0}));
}finally{globalThis.fetch=native;mock.timers.reset();fs.rmSync(root,{recursive:true,force:true});}
