/** Entirely offline. Saved real responses are data, never API requests. */
import {mock as replayClock} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {compileAnalysisSection,compileAnalysisSections} from '../analysisSections.ts';
import {validateReportedFact} from '../analysisReportedFact.ts';
import {parseGroundedAnalysis,AnalysisValidationError} from '../groundedAnalysisResponse.ts';
import {newsNumbersIssue} from '../newsEvidenceQuality.ts';
import {evaluateSavedNewsSummaries} from '../marketIntelligenceService.ts';
import {compareNewsContent} from '../newsContentChanges.ts';
import {publishScheduledContent,readScheduledContent,acceptedScheduledNews} from '../scheduledContent.ts';
import {aggregateOverview} from '../../utils/overviewIntelligence.ts';
import type {AnalysisEvidence} from '../analysisEvidence.ts';
const native=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Network/paid requests prohibited in hotfix tests');};
const fixture=JSON.parse(fs.readFileSync(fileURLToPath(new URL('./fixtures/oct27PaidValidation.json',import.meta.url)),'utf8'));
const now=new Date(fixture.now);replayClock.timers.enable({apis:['Date'],now});
const strict={strictUnits:true,exactValues:true};
const response=(body:any)=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(body)}]}}]});
const replay:any={analysis:[],news:[]};
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rms-hotfix-offline-'));
try{
 assert.equal(newsNumbersIssue('110억 리터','1100 crore litres',strict),null);
 assert.equal(newsNumbersIssue('1100 크로어(110억) 리터','1100 crore litres',strict),null);
 assert.equal(newsNumbersIssue('5년 평균 대비 8% 하락','8% below the five-year average',strict),null);
 for(const english of ['USD 610 per tonne','USD 610/metric ton','USD 610–650/metric ton','USD 610–650 per metric tonne'])assert.equal(newsNumbersIssue('톤당 610달러',english,strict),null,english);
 assert.equal(newsNumbersIssue('톤당 약 10달러','USD 10/metric ton',strict),null);
 assert(newsNumbersIssue('톤당 약 11달러','USD 10/metric ton',strict),'approximate wording never widens exact value tolerance');
 assert.equal(newsNumbersIssue('톤당 610~650달러','USD 610–650/metric ton',strict),null);
 for(const [claim,source]of [['111억 리터','1100 crore litres'],['110억 달러','1100 crore litres'],['6년 평균','five-year average'],['5년 계약','five-year average'],['610위안/톤','USD 610 per tonne'],['610달러/kg','USD 610 per tonne'],['650달러/톤','USD 610 per tonne'],['610유로/톤','USD 610–650 EUR/tonne'],['감자 수확량은 5년 평균 대비 8% 감소했습니다.','EU potato yields fall 8% below the five-year average.']])assert(newsNumbersIssue(claim,source,strict),claim);
 assert.equal(newsNumbersIssue('밀 수확량 전망 2,100만 톤','wheat harvest from 21.0 Mt, on higher yields.',strict),null,'mass harvest is not a per-hectare yield');
 assert.equal(newsNumbersIssue('EU 감자 단수는 5년 평균 대비 8% 낮습니다.','EU potato yields fall 8% below the five-year average.',strict),null);
 const crops=[['wheat','소맥'],['corn','옥수수'],['soybean','대두'],['soybean-oil','대두유'],['palm-oil','팜유'],['sugar','설탕'],['potato-starch','감자전분'],['tapioca-starch','타피오카전분']];
 for(const [id,ko]of crops){
  const evidence:AnalysisEvidence={commodity:id,failures:[],facts:['생산','소비'].map((metric,i)=>({id:'fact-'+i,commodity:id,topic:ko,text:`USDA 2026-10 보고: 세계 ${ko} ${metric} 전망 ${100-i*10}톤.`,sourceTitle:'USDA verified original',sourceUrl:'https://www.usda.gov/oce/commodity/wasde/wasde1026.pdf',observedAt:'2026-10-26',verifiedAt:now.toISOString(),recordSha256:'a'.repeat(64),verification:'original-record',measure:{metric,scope:'world:2026/2027',benchmark:id,unit:'tonne',value:100-i*10,valueKind:'forecast'}}))};
  const body={outputFormat:'evidence-sections-v1',confidenceScore:70,marketAnalysis:{evidenceIds:['fact-0','fact-1'],text:`세계 ${ko} 생산 전망은 100톤입니다. 세계 ${ko} 소비 전망은 90톤입니다.`},procurementStrategy:{evidenceIds:['fact-0'],text:`세계 ${ko} 생산 전망의 다음 발표를 비교하십시오.`}};
  const compiled=compileAnalysisSections(body,evidence,now);assert.equal(compiled.data.evidenceClaims[0].segments.filter((s:any)=>s.kind==='reported-fact').length,2,id);
  const parsed=parseGroundedAnalysis(response(body),'offline',now,evidence,{requiredContractVersion:4,requiredFactBinding:true});assert.equal(parsed.status,'live');
  for(const bad of [`세계 ${ko} 생산 전망은 999톤입니다.`,`브라질 ${ko} 생산 전망은 100톤입니다.`,`세계 ${ko} 생산은 100톤입니다.`,`세계 ${ko} 생산 전망은 100달러입니다.`])assert(validateReportedFact(bad,evidence.facts).issues.length,bad);
  assert.throws(()=>parseGroundedAnalysis(response({...body,marketAnalysis:{...body.marketAnalysis,text:`세계 ${ko} 생산 전망은 999톤입니다.`}}),'offline',now,evidence));
  assert.throws(()=>parseGroundedAnalysis(response({...body,procurementStrategy:{evidenceIds:['fact-0'],text:'물량의 50%를 즉시 구매하십시오.'}}),'offline',now,evidence));
  const badKind:any={outputFormat:'typed-segments-v1',factBinding:'verified-records-v1',evidenceContractVersion:4,confidenceScore:70,evidenceClaims:[{field:'executiveSummary',segments:[{kind:'fact',text:'',evidenceIds:['fact-0'],support:[]},{kind:'fact',text:'',evidenceIds:['fact-1'],support:[]},{kind:'reported-fact',text:`세계 ${ko} 생산 전망은 999톤입니다.`,evidenceIds:['fact-0'],support:[]}]},{field:'deskRecommendation',segments:compiled.data.evidenceClaims[1].segments}]};
  assert.throws(()=>parseGroundedAnalysis(response(badKind),'offline',now,evidence),'reported fact revalidated after compiler');
  const signed={...evidence.facts[0],text:`세계 ${ko} 생산 전망 변화 -3%.`};assert(validateReportedFact(`세계 ${ko} 생산 전망 변화 3%입니다.`,[signed]).issues.length,'negative sign preserved');
  const swapped={...evidence.facts[0],text:`세계 ${ko} 생산 전망 100톤, 소비 전망 90톤.`};assert(validateReportedFact(`세계 ${ko} 생산 전망 90톤입니다.`,[swapped]).issues.length,'cannot borrow a different metric quantity from the same sentence');
  for(const source of [`세계 ${ko} 재고 부족이 아닌 상황입니다.`,`세계 ${ko} 재고 부족은 불확실합니다.`])assert(validateReportedFact(`세계 ${ko} 재고 부족입니다.`,[{...evidence.facts[0],text:source}]).issues.length,'qualified or negated facts cannot become affirmative');
  assert(validateReportedFact(`세계 ${ko} 생산 전망은 100톤입니다.`,[{...evidence.facts[0],text:`잠정 세계 ${ko} 생산 전망 100톤.`}]).issues.length,'provisional qualifier preserved');
  const negative={...evidence.facts[0],text:`세계 ${ko} 재고 부족이 아닙니다.`};assert(validateReportedFact(`세계 ${ko} 재고 부족입니다.`,[negative]).issues.length,'negation preserved');
  const dir=path.join(temp,id);publishScheduledContent({['analysis-'+id]:{success:true,data:parsed}},'offline-accepted',dir);
  const manifest=fs.readFileSync(path.join(dir,'.rms-stage3/scheduled-content-current.json'));assert(readScheduledContent('analysis-'+id,dir));assert.deepEqual(publishScheduledContent({},'offline-empty',dir).accepted,[]);assert.deepEqual(fs.readFileSync(path.join(dir,'.rms-stage3/scheduled-content-current.json')),manifest);
 }
 for(const item of fixture.analysis){
  assert.deepEqual(item.previousIssues,['unsupported-section-analysis']);
  const sections:any={};
  for(const [field,kind]of [['marketAnalysis','conditional'],['procurementStrategy','recommendation'],['priceOutlook','conditional'],['bullishFactors','conditional'],['bearishFactors','conditional'],['monitoringItems','recommendation']] as const){
   const values=Array.isArray(item.body[field])?item.body[field]:item.body[field]?[item.body[field]]:[];
   sections[field]=values.map((value:any)=>{try{const parts=compileAnalysisSection(value,item.evidence,now,kind,field==='marketAnalysis');return {accepted:true,kinds:parts.map((p:any)=>p.kind)};}catch(e){return {accepted:false,reason:(e as Error).message};}});
  }
  let full:any;try{const data=parseGroundedAnalysis(response(item.body),item.model,now,item.evidence,{requiredContractVersion:4,requiredFactBinding:true});full={accepted:true,coverage:data.evidenceAudit?.sectionCoverage,omitted:data.evidenceAudit?.omittedSections};}catch(e){assert(e instanceof AnalysisValidationError);full={accepted:false,stage:e.stage,issues:e.issues};assert(!e.issues.includes('unsupported-section-analysis'),'specific failure reasons, not systemic classifier error');}
  replay.analysis.push({id:item.id,sections,full});
 }
 for(const item of fixture.news){const r=evaluateSavedNewsSummaries(item.id,item.inputs,item.text,['wheat','corn','soybean'].includes(item.id)?false:true,{requireEvidenceIds:true});const eligible=acceptedScheduledNews(item.id,r.articles);if(eligible.length){const dir=path.join(temp,'news-'+item.id),key='news-'+item.id;publishScheduledContent({[key]:{success:true,articles:eligible}},'offline-news',dir);const file=path.join(dir,'.rms-stage3/scheduled-content-current.json'),before=fs.readFileSync(file);assert.deepEqual(publishScheduledContent({[key]:{success:true,articles:[...eligible].reverse()}},'offline-reordered',dir).accepted,[]);assert.deepEqual(fs.readFileSync(file),before,'reorder does not rewrite publication or dates');}
 replay.news.push({id:item.id,publicationEligible:eligible.length,accepted:r.articles.map((a:any)=>({url:a.originalUrl,publishedAt:a.publishedAt,summary:a.summary})),rejections:r.rejections});}
 const sugar=replay.news.find((r:any)=>r.id==='sugar');assert(!sugar.rejections.some((r:any)=>r.reason==='unsupported-number:110억'),'actual crore equivalence fixed; independent source checks retained');
 const potato=replay.news.find((r:any)=>r.id==='potato-starch');assert.equal(potato.accepted.length,0,'actual yield conflation still rejected');
 const article=(url:string,summary='검증된 옥수수 수출 100톤.')=>({originalUrl:url,title:'옥수수 수출',summary,publishedAt:'2026-10-26',sourceName:'USDA'});
 const previous=[article('https://www.usda.gov/a'),article('https://www.usda.gov/b')];
 assert.equal(compareNewsContent(previous,[...previous].reverse()).hasNewContent,false,'reordering is not a new update');
 assert.equal(compareNewsContent(previous,[{...previous[1],retrievedAt:now.toISOString()},previous[0]]).hasNewContent,false,'fetch time is not editorial content');
 assert.equal(compareNewsContent(previous,[article('https://www.usda.gov/a?utm_source=test#top'),previous[1]]).hasNewContent,false,'canonical identity');
 const delta=compareNewsContent(previous,[article('https://www.usda.gov/a','검증된 옥수수 수출 110톤.'),article('https://www.usda.gov/c')]);assert.deepEqual([delta.added.length,delta.updated.length,delta.unchanged.length,delta.removed.length],[1,1,0,1]);
 const rows=fixture.analysis.map((i:any)=>({id:i.id,articles:replay.news.find((r:any)=>r.id===i.id)?.accepted.map((a:any)=>({...a,originalUrl:a.url,title:'검증된 시장 기사',sourceName:'Verified publisher'}))||[],analysis:null}));assert.deepEqual(aggregateOverview(rows),aggregateOverview(structuredClone(rows)),'deterministic Overview with independent news/AI results');
 if(process.env.RMS_HOTFIX_RESULTS)fs.writeFileSync(process.env.RMS_HOTFIX_RESULTS,JSON.stringify(replay,null,2),{mode:0o600});
 console.log('PASS hotfix: all-eight factual prose and safety cases, actual saved response/summary replay, exact numerical equivalents, yield conflation rejection, canonical article changes and fallback. Zero network/paid calls.');
 console.log(JSON.stringify(replay.analysis.map((r:any)=>({id:r.id,full:r.full,sections:Object.fromEntries(Object.entries(r.sections).map(([k,v]:any)=>[k,{pass:v.filter((a:any)=>a.accepted).length,fail:v.filter((a:any)=>!a.accepted).length}]))})),null,2));
}finally{replayClock.timers.reset();globalThis.fetch=native;fs.rmSync(temp,{recursive:true,force:true});}
