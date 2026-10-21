/** Presentation only: no provider requests, snapshot writes or approvals. */
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {load} from 'cheerio';
import AiRecommendation from '../../components/AiRecommendation.tsx';
import {aiPublisherLabel,type AiDisplaySource} from '../../utils/aiSourcePresentation.ts';
import {RMS_PROCUREMENT_CONDITION} from '../../utils/rmsProcurementCondition.ts';
const paths=fs.readdirSync('.rms-stage3/snapshots').map(n=>'.rms-stage3/snapshots/'+n);const hashes=()=>paths.map(p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'));const before=hashes();
const source=(url:string,title='Complete original article title'):AiDisplaySource=>({url,title});
for(const [url,label]of [
 ['https://biomassmagazine.com/articles/a','Biomass Magazine'],['https://www.global-agriculture.com/news/a','Global Agriculture'],
 ['https://agrolatam.com/a','AgroLatam'],['https://commodity-board.com/a','Commodity Board'],['https://www.dtnpf.com/a','DTN'],
 ['https://ers.usda.gov/publications/1','USDA'],['https://www.usda.gov/a','USDA'],['https://www.agriculture.gov.au/abares/report','ABARES'],
 ['https://www.reuters.com/a','Reuters'],['https://www.example.org/a','example.org'],['https://biomassmagazine.com.example.org/a','biomassmagazine.com.example.org'],
 ['https://www.agriculture.gov.au/other-report','agriculture.gov.au'],
])assert.equal(aiPublisherLabel(source(url)),label);
assert.equal(aiPublisherLabel({...source('https://unlisted.example/a'),publisher:'Verified Publisher',publisherVerified:true}),'Verified Publisher');
assert.equal(aiPublisherLabel({...source('https://unlisted.example/a'),publisher:'Unverified Publisher'}),'unlisted.example');
assert.equal(aiPublisherLabel(source('https://vertexaisearch.cloud.google.com/grounding-api-redirect/a','Reuters')),'vertexaisearch.cloud.google.com');

const links=[source('https://dtnpf.com/article/a?edition=1','Full first DTN article'),source('https://dtnpf.com/article/a?edition=2','Full second DTN article'),source('https://www.usda.gov/a'),source('https://www.reuters.com/a'),source('https://commodity-board.com/a'),source('https://biomassmagazine.com/a')];
for(const id of ['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch']){
 const body={deskRecommendation:'OFFLINE-MOCK: 분할 구매 검토',executiveSummary:'OFFLINE-MOCK: 동일한 분석 내용과 원문 링크를 유지하는 표시 테스트입니다.',bullishFactors:['상승 요인 하나','상승 요인 둘'],bearishFactors:['하락 요인 하나','하락 요인 둘'],watchItems:['확인 항목 하나','확인 항목 둘']};
 const html=renderToStaticMarkup(<AiRecommendation commodityId={id} researchStatus="cached" researchGeneratedAt="2026-10-21T06:04:07.823Z" researchModel="Gemini AI" recommendedCoverage={body.deskRecommendation} executiveSummary={body.executiveSummary} bullishFactors={body.bullishFactors} bearishFactors={body.bearishFactors} watchItems={body.watchItems} researchSources={links}/>),$=load(html),text=$.text();
 for(const removed of ['RMS 구매 조건','Gemini AI','저장 분석','자료 확인:',RMS_PROCUREMENT_CONDITION])assert(!text.includes(removed),id+': '+removed);
 for(const kept of [body.deskRecommendation,body.executiveSummary,...body.bullishFactors,...body.bearishFactors,...body.watchItems,'RMS AI 시장 전망'])assert(text.includes(kept));
 const a=$('[data-rms-ai-sources] a');assert.equal(a.length,6);assert.deepEqual(a.map((_,n)=>$(n).attr('href')).get(),links.map(s=>s.url));
 assert.equal(a.filter((_,n)=>$(n).text().trim()==='DTN\u00a0↗').length,2);
 for(let i=0;i<links.length;i++){assert(a.eq(i).attr('title')?.includes(links[i].title));assert(a.eq(i).attr('title')?.includes(links[i].url));assert(!a.eq(i).attr('class')?.includes('truncate'));}
 assert($('[data-rms-ai-sources]').text().includes(' · '));assert(!$('[data-rms-procurement-condition]').length);
}
for(const id of ['wheat','corn','soybean','tapioca-starch']){
 const d=JSON.parse(fs.readFileSync('.rms-stage3/snapshots/analysis-'+id+'.json','utf8')).payload.data;
 const $=load(renderToStaticMarkup(<AiRecommendation commodityId={id} researchStatus="cached" researchGeneratedAt={d.generatedAt} recommendedCoverage={d.deskRecommendation} executiveSummary={d.executiveSummary} bullishFactors={d.bullishFactors} bearishFactors={d.bearishFactors} watchItems={d.watchItems} researchSources={d.sources}/>));
 assert($.text().includes(d.executiveSummary));assert.deepEqual($('[data-rms-ai-sources] a').map((_,n)=>$(n).attr('href')).get(),[...new Set(d.sources.map((s:any)=>s.url))]);
 for(const removed of ['RMS 구매 조건','Gemini AI','저장 분석','자료 확인:'])assert(!$.text().includes(removed));
}
const loading=load(renderToStaticMarkup(<AiRecommendation isLoading researchStatus="cached"/>)).text();assert(!loading.includes('Gemini AI'));assert(!loading.includes('저장 분석'));
assert.deepEqual(hashes(),before);console.log('PASS universal AI cleanup: all eight cards, four genuine reports, exact/all URLs, duplicate publishers, tooltips and no visible metadata; snapshots unchanged.');
