/** Genuine record-driven compositions; authored fixtures seed PREVIOUS reports
 * only. The composer never reads those bodies or either provider response. */
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {mock} from 'node:test';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {load} from 'cheerio';
import AiRecommendation from '../../components/AiRecommendation.tsx';
import {composeEvidenceFirstReport,publishEvidenceFirstReport,validateComposedRenderedText} from '../evidenceFirstReport.ts';
import {parseGroundedAnalysis} from '../groundedAnalysisResponse.ts';
import {publishScheduledContent,readScheduledContent} from '../scheduledContent.ts';
import {briefPresentationIssues} from '../analysisBriefContract.ts';
import {completeBriefTestEvidence} from './completeBriefTestEvidence.ts';
import {aggregateOverview} from '../../utils/overviewIntelligence.ts';
const archive=JSON.parse(fs.readFileSync(new URL('./fixtures/oct27PaidValidation.json',import.meta.url),'utf8'));
const previousBodies=JSON.parse(fs.readFileSync(new URL('./fixtures/completeKoreanBriefs.json',import.meta.url),'utf8')).bodies;
const now=new Date('2026-10-29T01:00:00Z'),root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-composition-OFFLINE-')),native=globalThis.fetch;
mock.timers.enable({apis:['Date'],now});globalThis.fetch=async()=>{throw Error('Real source and paid requests prohibited');};
const wire=(body:any)=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(body)}]}}]});
const extract=(id:string,report:any)=>{
 const html=renderToStaticMarkup(<AiRecommendation commodityId={id} recommendedCoverage={report.deskRecommendation} executiveSummary={report.executiveSummary} bullishFactors={report.bullishFactors} bearishFactors={report.bearishFactors} watchItems={report.watchItems} researchSources={report.sources} researchStatus="cached" researchGeneratedAt={report.generatedAt} researchEvidenceDates={report.evidenceAudit.facts.map((f:any)=>f.observedAt)}/>);
 const $=load(html),items=(label:string)=>$('h3').filter((_i,e)=>$(e).text().includes(label)).parent().parent().find('li').map((_i,e)=>$(e).text().trim()).get();
 const displayed={deskRecommendation:$('span').filter((_i,e)=>$(e).text()==='데스크 권고:').next().text(),executiveSummary:$('p.whitespace-pre-line').text(),bullishFactors:items('상승 요인'),bearishFactors:items('하락 요인'),watchItems:items('모니터링 항목')};
 assert(!html.includes('recordSha256'));assert(!html.includes('원문 인용:'));
 return {html,displayed};
};
const results:any[]=[];const accepted=new Set(['soybean','potato-starch','tapioca-starch']);
try{
 for(const row of archive.analysis){
  const evidence=completeBriefTestEvidence(row,archive,now),original=JSON.stringify(evidence),dest=path.join(root,row.id),key='analysis-'+row.id;
  const priorDate=new Date('2026-10-28T01:00:00Z');
  const previous=parseGroundedAnalysis(wire(previousBodies[row.id]),'OFFLINE-authored-prior',priorDate,evidence,{requiredContractVersion:4,requiredFactBinding:true,requiredReportStyle:true});
  publishScheduledContent({[key]:{success:true,data:previous}},'OFFLINE-prior-only',dest);
  const before=fs.readFileSync(path.join(dest,'.rms-stage3/scheduled-content-current.json'));
  const result=publishEvidenceFirstReport(evidence,now,dest,'OFFLINE-evidence-composition',composed=>extract(row.id,composed.report).displayed);
  assert.equal(JSON.stringify(evidence),original,'never change evidence to manufacture prose');
  if(result.status!=='composed'){
   assert(!accepted.has(row.id),row.id+': '+result.issues.join(','));
   assert.deepEqual(fs.readFileSync(path.join(dest,'.rms-stage3/scheduled-content-current.json')),before);
   assert.equal(result.selected.payload.data.generatedAt,previous.generatedAt);
   results.push({commodity:row.id,status:'retained-previous',issues:result.issues,previousOrigin:'authored-test-seed-only',generatedReport:false});continue;
  }
  assert(accepted.has(row.id));assert(result.published);assert.equal(result.selected.payload.data.model,'rms-evidence-composer-v1');
  assert.deepEqual(result.selected.payload.data,result.report);assert.deepEqual(briefPresentationIssues(result.report),[]);
  const displayed=extract(row.id,result.selected.payload.data);assert.doesNotThrow(()=>validateComposedRenderedText(result,displayed.displayed));
  assert.throws(()=>validateComposedRenderedText(result,{...displayed.displayed,executiveSummary:displayed.displayed.executiveSummary+' 가격 상승이 확실합니다.'}));
  assert.throws(()=>validateComposedRenderedText(result,{...displayed.displayed,bullishFactors:['공급 부족이 확정되어 즉시 구매가 필요합니다.']}));
  for(const mutate of [
   (b:any)=>b.marketAnalysis.text='허위 생산량 999999999톤입니다. '+b.marketAnalysis.text,
   (b:any)=>b.procurementStrategy.text='물량의 50%를 즉시 매수하십시오.',
   (b:any)=>b.bullishFactors[0].text+=' 가격 상승이 확실합니다.',
   (b:any)=>b.marketAnalysis.text=('동일한 설명입니다. ').repeat(40)+'\n\n'+b.marketAnalysis.text.split('\n\n')[1],
  ]){const bad=structuredClone(result.body);mutate(bad);assert.throws(()=>parseGroundedAnalysis(wire(bad),'rms-evidence-composer-v1',now,evidence,{requiredContractVersion:4,requiredFactBinding:true,requiredReportStyle:true}));}
  mock.timers.setTime(+now+86400000);
  const same=publishEvidenceFirstReport(evidence,new Date(),dest,'OFFLINE-identical-next-day',composed=>extract(row.id,composed.report).displayed);
  assert.equal(same.status,'composed');if(same.status==='composed'){assert(!same.published);assert.equal(same.selected.payload.data.generatedAt,result.report.generatedAt);}
  mock.timers.setTime(+now);
  const missing=publishEvidenceFirstReport({...evidence,facts:[]},now,dest,'OFFLINE-missing-evidence',()=>{throw Error('must not render rejected evidence');});
  assert.equal(missing.status,'retain-previous');assert.equal(missing.selected.payload.data.generatedAt,result.report.generatedAt);
  const corrupt=structuredClone(evidence);corrupt.facts[0].recordSha256='invalid';assert.equal(composeEvidenceFirstReport(corrupt,now).status,'retain-previous');
  results.push({commodity:row.id,status:'composed-published-read-render-revalidated',generatedReport:true,origin:'deterministic-original-evidence',paragraphCharacters:result.report.executiveSummary.split('\n\n').map(s=>Array.from(s).length),report:result.report,trace:result.trace,html:displayed.html});
 }
 assert.equal(fs.readdirSync(root,{recursive:true}).some(p=>/paid-requests|standalone-analysis|manual-analysis-approval/.test(String(p))),false,'composition neither creates nor consumes paid authorization or journals');
 const soybean=archive.analysis.find((r:any)=>r.id==='soybean').evidence;
 const corrupt=structuredClone(soybean);const p=corrupt.facts.find((f:any)=>f.measure?.metric==='price'&&!f.comparison);p.measure.value+=1;
 assert.deepEqual(composeEvidenceFirstReport(corrupt,now),{status:'retain-previous',issues:['price-measure-not-in-original-record']});
 const noRevisions=structuredClone(soybean);noRevisions.facts.forEach((f:any)=>f.text=f.text.replace(/전월 전망 대비 [\d.]+ (?:million|billion) bushels 상향/g,'연간 전망'));
 const insufficient=composeEvidenceFirstReport(noRevisions,now);assert.equal(insufficient.status,'retain-previous');if(insufficient.status==='retain-previous')assert(insufficient.issues.includes('missing-real-bullish-driver'));
 const rawTapioca=archive.analysis.find((r:any)=>r.id==='tapioca-starch').evidence;
 assert.equal(composeEvidenceFirstReport(rawTapioca,now).status,'retain-previous','two TTSA quotations are not bullish and bearish market drivers');
 const actual=results.filter(r=>r.generatedReport).map(r=>({id:r.commodity,analysis:r.report,articles:[]}));
 assert.equal(aggregateOverview(actual,+now).analyses.length,3);
 if(process.env.RMS_COMPOSITION_RESULTS)fs.writeFileSync(process.env.RMS_COMPOSITION_RESULTS,JSON.stringify({paidCalls:0,results,overview:aggregateOverview(actual,+now)},null,2),{mode:0o600});
 console.log('PASS evidence-first independent all-eight outcomes: '+JSON.stringify(results.map(({commodity,status,issues,paragraphCharacters})=>({commodity,status,issues,paragraphCharacters}))));
}finally{globalThis.fetch=native;mock.timers.reset();fs.rmSync(root,{recursive:true,force:true});}
