import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {mock} from 'node:test';
import {collectSugarPriceEvidence} from '../sugarAnalysisEvidence.ts';
import AiRecommendation from '../../components/AiRecommendation.tsx';
import {collectEvidenceFirstPublishers,collectedPublisherEvidence} from '../evidenceFirstPublishers.ts';
import {sourcePropositions} from '../analysisSourcePropositions.ts';
import {validateReportedFact} from '../analysisReportedFact.ts';
import {composeEvidenceFirstReport,publishEvidenceFirstReport} from '../evidenceFirstReport.ts';
import {renderedEvidenceReport} from '../evidenceReportRendering.tsx';
import {readScheduledContent} from '../scheduledContent.ts';
import {scheduledAnalysisEvidence} from '../scheduledEvidence.ts';
const now=new Date('2026-10-29T09:00:00Z'),root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-source-handoff-OFFLINE-'));
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/livePublisherPassagesOct29.json',import.meta.url),'utf8'));
const archive=JSON.parse(fs.readFileSync(new URL('./fixtures/oct27PaidValidation.json',import.meta.url),'utf8'));
mock.timers.enable({apis:['Date'],now});
const native=globalThis.fetch;globalThis.fetch=async()=>{throw Error('External network forbidden');};
try{
 // Explicitly synthetic HTML checks plumbing only; it is never a report source.
 const url='https://commodity-board.com/offline-mock-corn-handoff-regression',date='2026-10-28';
 const sentence='OFFLINE-MOCK Corn prices and export supply remain under review as the corn harvest proceeds and physical corn demand varies across the market.';
 const html='<html><head><meta property="og:title" content="OFFLINE-MOCK Corn market report"><meta property="article:published_time" content="'+date+'T12:00:00Z"><link rel="canonical" href="'+url+'"></head><body><article><h1>OFFLINE-MOCK Corn market report</h1><p>'+(sentence+' ').repeat(5)+'</p></article></body></html>';
 let response=html;
 const fetcher=async()=>new Response(response,{headers:{'content-type':'text/html'}});
 await collectEvidenceFirstPublishers('corn',root,now,{candidates:[{originalUrl:url,publishedAt:date}],fetcher:fetcher as any});
 const saved=collectedPublisherEvidence('corn',root,now);assert.equal(saved.length,1);assert(saved[0].referenceContext?.quote.includes(sentence));
 const packet=await scheduledAnalysisEvidence('corn',undefined,root,now);assert(packet.facts.some(f=>f.id===saved[0].id),'collector originals actually reach scheduled evidence');
 assert.equal(sourcePropositions(saved[0]).length,0,'unknown mock source does not authorize drivers');
 const file=path.join(root,'.rms-stage3/evidence/articles/article-'+saved[0].recordSha256+'.json'),bytes=fs.readFileSync(file);const receipt=JSON.parse(bytes.toString());receipt.html+='tampered';fs.writeFileSync(file,JSON.stringify(receipt));assert.equal(collectedPublisherEvidence('corn',root,now).length,0);fs.writeFileSync(file,bytes);
 for(const replacement of [html.replace(date+'T12:00:00Z','2026-10-27T12:00:00Z'),html.replace('href="'+url,'href="https://commodity-board.com/unrelated-article')]){response=replacement;await collectEvidenceFirstPublishers('corn',root,now,{candidates:[{originalUrl:url,publishedAt:date}],fetcher:fetcher as any});assert.equal(collectedPublisherEvidence('corn',root,now).length,0);}
 response=html;
 const denied=async()=>new Response('Access denied',{status:403});await collectEvidenceFirstPublishers('corn',root,now,{candidates:[{originalUrl:url,publishedAt:date}],fetcher:denied as any});assert.equal(collectedPublisherEvidence('corn',root,now).length,0,'a denied live check cannot reuse stale original evidence as current');
 const prices=path.join(root,'.rms-price-history/sugar.json');fs.mkdirSync(path.dirname(prices),{recursive:true});fs.writeFileSync(prices,JSON.stringify(fixture.sugarCollectorSample));
 assert(collectSugarPriceEvidence(root,now).facts.length>0,'real saved free collector output reaches Sugar evidence without a fake HTTP receipt');
 const invalid=structuredClone(fixture.sugarCollectorSample);invalid.payload.symbol='WRONG';fs.writeFileSync(prices,JSON.stringify(invalid));assert.equal(collectSugarPriceEvidence(root,now).facts.length,0,'wrong commodity/benchmark still fails');
 const status=[];
 for(const id of ['wheat','corn','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch']){
  const facts=fixture.facts.filter((f:any)=>f.commodity===id),base=structuredClone(archive.analysis.find((r:any)=>r.id===id).evidence);base.facts.push(...facts);if(id==='sugar')base.facts.push(...fixture.sugarPriceFacts.filter((f:any)=>!base.facts.some((g:any)=>g.id===f.id)));
  const composed=composeEvidenceFirstReport(base,now);assert.equal(composed.status,'composed',id+': '+JSON.stringify(composed));
  const published=publishEvidenceFirstReport(base,now,path.join(root,id),'OFFLINE-frozen-source-replay',renderedEvidenceReport);assert.equal(published.status,'composed');assert(published.published);assert(readScheduledContent('analysis-'+id,path.join(root,id)));
  const before=readScheduledContent('analysis-'+id,path.join(root,id));
  const unchanged=publishEvidenceFirstReport(base,new Date(+now+1000),path.join(root,id),'OFFLINE-identical-content',renderedEvidenceReport);assert(unchanged.status==='composed'&&!unchanged.published);assert.equal(unchanged.selected.payload.data.generatedAt,before.payload.data.generatedAt);
  const missing=publishEvidenceFirstReport({...base,facts:[]},now,path.join(root,id),'OFFLINE-missing-source',()=>{throw Error('must not display invalid report');});assert.equal(missing.status,'retain-previous');assert.equal(missing.selected.payload.data.generatedAt,before.payload.data.generatedAt);
  if(composed.status==='composed'){
   for(const atom of composed.trace.filter(a=>a.evidenceIds.some(id=>id.startsWith('live-article-'))))assert(validateReportedFact(atom.text+' 가격 상승이 확실합니다.',base.facts).issues.length>0);
   const r=composed.report,markup=renderToStaticMarkup(<AiRecommendation commodityId={id} executiveSummary={r.executiveSummary} recommendedCoverage={r.deskRecommendation} bullishFactors={r.bullishFactors} bearishFactors={r.bearishFactors} watchItems={r.watchItems} researchSources={r.sources} researchGeneratedAt={r.generatedAt} researchEvidenceDates={(r.evidenceAudit.facts as Array<{observedAt:string}>).map(f=>f.observedAt)} researchStatus="cached"/>);
   assert(!/분석 작성|근거 기준/.test(markup));assert.equal(r.generatedAt,now.toISOString());
  }
  status.push(id);
 }
 for(const fact of fixture.facts){
  const props=sourcePropositions(fact);if(!props.length)continue;
  const forged=structuredClone(fact);forged.referenceContext.quote='This original article does not contain those source statements.';assert.equal(sourcePropositions(forged).length,0);
  for(const p of props.filter((p:any)=>p.role==='fact'&&/12\.3%|351만/.test(p.text)))assert(validateReportedFact(p.text.replace('12.3%','12.4%').replace('351만','999만'),[fact]).issues.length,'wrong source number rejected');
  const wrongCrop={...fact,commodity:'unrelated'};assert.equal(sourcePropositions(wrongCrop).length,0);
  const wrongHash={...fact,recordSha256:'0'.repeat(64)};assert.equal(sourcePropositions(wrongHash).length,0);
 }
 console.log('PASS original HTML handoff, receipt tamper/date/canonical rejection, seven real-passage offline compositions/publications, invented-conclusion rejection, hidden technical UI dates; frozen replay is not live-run evidence: '+status.join(','));
}finally{globalThis.fetch=native;mock.timers.reset();fs.rmSync(root,{recursive:true,force:true});}
