import {createHash} from 'node:crypto';import {selectProcurementNews} from '../newsProcurementSelection.ts';import {verifyOtherCommodityArticles} from '../all8ArticleVerification.ts';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import AiRecommendation from '../../components/AiRecommendation.tsx';
import {GoogleGenAI} from '../paidGeminiGuard.ts';import {withAuthorizedStage3Run} from '../stage3Runtime.ts';import {standaloneContext} from '../standaloneAnalysis.ts';
/** OFFLINE-MOCK: simplified output compiles into the existing factual validator. */
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {mock} from 'node:test';
import {newsSourceEvidence} from '../newsSourceFacts.ts';import {evaluateSavedNewsSummaries} from '../marketIntelligenceService.ts';import {publishScheduledContent,readScheduledContent} from '../scheduledContent.ts';import {cornSelectedQuality} from '../cornVerifiedNews.ts';import {parseGroundedAnalysis} from '../groundedAnalysisResponse.ts';import {buildRecoveryAnalysisRequest} from '../liveAiAnalysisService.ts';import {validateConditionalReasoning} from '../analysisReasoning.ts';import {isDirectAiFooterSource} from '../../utils/aiSourcePresentation.ts';import type {AnalysisEvidence} from '../analysisEvidence.ts';
const runtimeBefore=process.env.RMS_STAGE3_RUNTIME_ROOT;
const now=new Date('2026-10-27T00:05:00Z'),old=process.cwd(),native=fetch,root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-simplified-OFFLINE-MOCK-'));
mock.timers.enable({apis:['Date'],now});globalThis.fetch=async()=>{throw Error('Network/Gemini/cloud prohibited');};
const crops=[['wheat','wheat','소맥'],['corn','corn','옥수수'],['soybean','soybean','대두'],['soybean-oil','soybean oil','대두유'],['palm-oil','palm oil','팜유'],['sugar','sugar','설탕'],['potato-starch','potato starch','감자전분'],['tapioca-starch','tapioca starch','타피오카전분']];
const response=(body:any)=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(body)}]}}]});
try{
 for(const [id,en,ko]of crops){
  const articles=[];
  for(const name of ['exports','supply','trade','harvest']){
   const input={rawId:'OFFLINE-MOCK-'+name,rawTitle:en+' '+name+' bulletin',rawSnippet:`${en} exports rose to 100 tonnes.`,originalUrl:'https://www.usda.gov/oce/commodity/wasde/wasde1026.pdf?OFFLINE-MOCK='+name,publishedAt:'2026-10-26',retrievedAt:now.toISOString(),sourceName:'OFFLINE-MOCK publisher',sourceType:'official' as const};
   assert(input.rawSnippet.length<200);
   const item={rawId:input.rawId,title:`${ko} ${name}`,summary:`${ko} 수출 100톤.`,evidenceIds:newsSourceEvidence(input).map(e=>e.evidenceId)};
   const evaluate=(body:any,locked=input)=>evaluateSavedNewsSummaries(id,[locked],JSON.stringify([body]),true,{requireEvidenceIds:true});
   const result=evaluate(item);assert.equal(result.articles.length,1,id+' short substantive news; no generated quote');articles.push(result.articles[0]);
   assert.equal(evaluate({...item,summary:`${ko} 수출 999톤.`}).articles.length,0);
   assert.equal(evaluate({...item,summary:`${ko} 수출 100부셸.`}).articles.length,0);
   assert.equal(evaluate({...item,evidenceIds:['fabricated']}).articles.length,0);
   assert.equal(evaluate(item,{...input,rawSnippet:input.rawTitle}).articles.length,0,'title-only evidence fails');
   const quoted={...item,evidenceQuote:`${en} exports rose`};assert.equal(evaluate(quoted).articles.length,1,'optional short exact quote');assert.equal(evaluate({...quoted,evidenceQuote:'invented quotation'}).articles.length,0);
  }
  // Ranking must not replace a validated source-bound summary after its evidence check.
  const rankingRoot=path.join(root,'ranking-'+id);fs.mkdirSync(path.join(rankingRoot,'src/data'),{recursive:true});
  fs.writeFileSync(path.join(rankingRoot,'src/data/news_procurement_reviews.json'),JSON.stringify({reviews:{[id]:[{url:articles[0].originalUrl,publishedAt:articles[0].publishedAt,sourceSummarySha256:createHash('sha256').update(articles[0].summary).digest('hex'),decision:'retain',summary:'조작된 수출량 999톤',title:'조작된 제목'}]}}));
  process.chdir(rankingRoot);try{const ranked=selectProcurementNews(id,[articles[0]]);assert.equal(ranked[0].summary,articles[0].summary);assert.equal(ranked[0].title,articles[0].title);}finally{process.chdir(old);}
  for(let n=1;n<=4;n++){
   const dir=path.join(root,id+'-'+n),key='news-'+id;
   assert.equal(publishScheduledContent({[key]:{success:true,articles:articles.slice(0,n)}},'OFFLINE-MOCK-news',dir).accepted.length,1);
   const saved=readScheduledContent(key,dir);assert.equal(saved.payload.articles.length,n,id+' publishes '+n);
   assert(saved.payload.articles.every((a:any)=>a.publishedAt==='2026-10-26'&&a.verifiedSourceEvidence.excerpt));
   const file=path.join(dir,'.rms-stage3/scheduled-content-current.json'),before=fs.readFileSync(file);
   assert.deepEqual(publishScheduledContent({[key]:{success:true,articles:[]}},'OFFLINE-MOCK-empty',dir).accepted,[]);assert.deepEqual(fs.readFileSync(file),before,'empty update retains exact prior manifest');
  }
  const packet:AnalysisEvidence={commodity:id,failures:[],facts:[0,1].map(i=>({id:i?'stocks':'production',commodity:id,topic:ko,text:`OFFLINE-MOCK 세계 ${ko} ${i?'기말재고':'생산'} 전망의 검증된 동일 범위 기록입니다.`,sourceUrl:'https://www.usda.gov/oce/commodity/wasde/wasde1026.pdf',sourceTitle:'OFFLINE-MOCK packet',observedAt:'2026-10-26',verifiedAt:now.toISOString(),verification:'original-record',recordSha256:'a'.repeat(64),measure:{metric:i?'기말재고':'생산',scope:'world:2026/2027',benchmark:'OFFLINE-MOCK',unit:'천 MT',value:100+i,valueKind:'forecast'}}))};
  const body:any={outputFormat:'evidence-sections-v1',confidenceScore:55,marketAnalysis:{evidenceIds:['production','stocks'],text:`세계 ${ko} 생산 전망의 검증된 동일 범위 기록입니다. 세계 ${ko} 기말재고 전망의 검증된 동일 범위 기록입니다.`},procurementStrategy:{evidenceIds:['production'],text:`세계 ${ko} 생산 전망의 다음 발표를 비교하십시오.`},priceOutlook:{evidenceIds:['production'],text:`향후 세계 ${ko} 생산 전망이 하향 수정된다면 선물 가격에 상승 압력이 생길 수 있습니다.`}};
  const parse=(b:any)=>parseGroundedAnalysis(response(b),'OFFLINE-MOCK',now,packet,{requiredContractVersion:4,requiredFactBinding:true});
  const good=parse(body);assert.equal(good.status,'live');assert.equal(good.evidenceAudit?.outputFormat,'evidence-sections-v1');assert(good.executiveSummary.includes('상승 압력'));assert.deepEqual(good.bullishFactors,[]);assert.deepEqual(good.bearishFactors,[]);assert.deepEqual(good.watchItems,[]);const html=renderToStaticMarkup(React.createElement(AiRecommendation,{commodityId:id,executiveSummary:good.executiveSummary,recommendedCoverage:good.deskRecommendation,bullishFactors:good.bullishFactors,bearishFactors:good.bearishFactors,watchItems:good.watchItems,researchSources:good.sources,researchStatus:'live'}));assert(html.includes(ko));assert(!html.includes('NaN'));
  const partial=structuredClone(body);partial.bullishFactors=[{evidenceIds:['production'],text:'생산량은 999 MT입니다.'}];partial.bearishFactors=[{evidenceIds:['missing'],text:'가격 하락 확정'}];const checked=parse(partial);assert.deepEqual(checked.bullishFactors,[]);assert.deepEqual(checked.bearishFactors,[]);assert((checked.evidenceAudit?.omittedSections as any[]).length===2);assert(!checked.executiveSummary.includes('999'));
  const noOptional=parse({...body,priceOutlook:undefined});assert(!noOptional.executiveSummary.includes('상승 압력'),'missing price evidence is not a neutral/positive conclusion');
  assert(!noOptional.executiveSummary.includes('OFFLINE-MOCK'),'internal reference prefixes are not visible prose');
  assert.throws(()=>parse({...body,marketAnalysis:{...body.marketAnalysis,text:''},priceOutlook:undefined}),'empty analysis cannot be filled by raw references');
  for(const bad of [{...body,marketAnalysis:{evidenceIds:['fake'],text:''}},{...body,procurementStrategy:{evidenceIds:['production'],text:'물량의 50%를 즉시 구매하십시오.'}},{...body,marketAnalysis:{evidenceIds:['production','production'],text:''}}])assert.throws(()=>parse(bad));
  const out=path.join(root,'analysis-'+id),key='analysis-'+id;
  publishScheduledContent({[key]:{success:true,data:good}},'OFFLINE-MOCK-complete',out);assert(readScheduledContent(key,out)?.payload.data.executiveSummary);const fullManifest=fs.readFileSync(path.join(out,'.rms-stage3/scheduled-content-current.json'));assert.deepEqual(publishScheduledContent({[key]:{success:true,data:noOptional}},'OFFLINE-MOCK-missing-outlook',out).accepted,[]);assert.deepEqual(fs.readFileSync(path.join(out,'.rms-stage3/scheduled-content-current.json')),fullManifest);
  const richer={...good,bullishFactors:['검증된 상승 요인'],watchItems:['검증된 후속 발표']};publishScheduledContent({[key]:{success:true,data:richer}},'OFFLINE-MOCK-stronger',out);
  const before=fs.readFileSync(path.join(out,'.rms-stage3/scheduled-content-current.json'));
  assert.deepEqual(publishScheduledContent({[key]:{success:true,data:noOptional}},'OFFLINE-MOCK-partial',out).accepted,[]);assert.deepEqual(fs.readFileSync(path.join(out,'.rms-stage3/scheduled-content-current.json')),before,'partial never combines with older sections');
  // Default verified-only generation exposes six section names, not sentence metadata.
  const requestPacket=id==='palm-oil'?JSON.parse(fs.readFileSync(new URL('./fixtures/analysis-grounding-evidence-v1.json',import.meta.url),'utf8')).packets['palm-oil']:structuredClone(packet);
  const req=buildRecoveryAnalysisRequest('gemini-3.8-flash',id,requestPacket,'2026-10-27','verified-only'),schema:any=req.config.responseSchema;
  assert.equal(schema.properties.outputFormat.enum[0],'evidence-sections-v1');assert(!schema.properties.evidenceClaims);for(const name of ['marketAnalysis','priceOutlook','bullishFactors','bearishFactors','procurementStrategy','monitoringItems'])assert(schema.properties[name]);assert.deepEqual(req.config.tools,[]);if(id==='wheat'){process.env.RMS_STAGE3_RUNTIME_ROOT=root;let calls=0;const ctx=standaloneContext('OFFLINE-MOCK-six-section-wire');const reply=await withAuthorizedStage3Run(ctx,()=>new GoogleGenAI({apiKey:'OFFLINE-NOT-REAL',vertexai:false,httpOptions:{apiVersion:'v1beta',fetch:async(_url:any,init:any)=>{calls++;const wire=JSON.parse(init.body);assert.equal(wire.generationConfig.responseSchema.properties.outputFormat.enum[0],'evidence-sections-v1');assert(!wire.generationConfig.responseSchema.properties.evidenceClaims);return Response.json({...response(body),usageMetadata:{promptTokenCount:10,candidatesTokenCount:20}});}}}).models.generateContent(req));assert.equal(calls,1);assert.equal(parseGroundedAnalysis(reply,'OFFLINE-MOCK',now,packet,{requiredContractVersion:4,requiredFactBinding:true}).status,'live');}
 }
 // Exercise actual publisher HTML/date verification with a body shorter than the removed quota.
 const originalBlockedFetch=globalThis.fetch;
 const tinyInput={rawId:'OFFLINE-MOCK-html',rawTitle:'Soybean oil bulletin',rawSnippet:'',originalUrl:'https://www.usda.gov/offline-mock-report',publishedAt:'2026-10-26',retrievedAt:now.toISOString(),sourceName:'USDA',sourceType:'official' as const};
 const html=(paragraph:string,date=true)=>`<html><head><meta property="og:title" content="Soybean oil bulletin">${date?'<meta property="article:published_time" content="2026-10-26">':''}</head><body><article><h1>Soybean oil bulletin</h1>${paragraph}</article></body></html>`;
 try{globalThis.fetch=async()=>new Response(html('<p>Soybean oil exports rose to 100 tonnes.</p>'),{headers:{'content-type':'text/html'}});assert.equal((await verifyOtherCommodityArticles([tinyInput],'soybean-oil')).length,1);
 globalThis.fetch=async()=>new Response(html(''),{headers:{'content-type':'text/html'}});assert.equal((await verifyOtherCommodityArticles([tinyInput],'soybean-oil')).length,0);
 globalThis.fetch=async()=>new Response(html('<p>Soybean oil exports rose.</p>',false),{headers:{'content-type':'text/html'}});assert.equal((await verifyOtherCommodityArticles([tinyInput],'soybean-oil')).length,0);
 }finally{globalThis.fetch=originalBlockedFetch;}
 assert.equal(cornSelectedQuality([],+now).readyForReview,false);for(let n=1;n<=4;n++)assert(cornSelectedQuality(Array.from({length:n},(_,i)=>({originalUrl:'https://www.usda.gov/report'+i,publishedAt:'2026-10-26'})) as any,+now).readyForReview);
 const area:any={id:'area-decline',commodity:'wheat',topic:'소맥',text:'OFFLINE-MOCK 세계 소맥 재배면적은 두 공표 관측일 사이 감소했습니다.',sourceUrl:'https://www.usda.gov/oce/commodity/wasde/wasde1026.pdf',sourceTitle:'OFFLINE-MOCK acreage',observedAt:'2026-10-26',verifiedAt:now.toISOString(),verification:'original-record',recordSha256:'b'.repeat(64),measure:{metric:'acreage',scope:'world',benchmark:'OFFLINE-MOCK',unit:'ha',value:90,valueKind:'actual'},comparison:{metric:'acreage',baselineId:'area-2026-10-01',currentId:'area-2026-10-26',direction:'decrease',pct:-10,observationCount:2,monotonic:true}};
 const verdict=(text:string,ref=area)=>validateConditionalReasoning(text,[ref],{kind:'conditional',support:[{evidenceId:ref.id,aspect:'acreage'}]}).issues;
 assert.deepEqual(verdict('세계 소맥 재배면적 감소가 향후 실제 생산 감소로 이어진다면 선물 가격에 상승 압력이 생길 수 있습니다.'),[]);
 assert(verdict('세계 소맥 재배면적 감소로 생산 손실이 확정됐으며 가격은 반드시 상승합니다.').length);assert(verdict('브라질 소맥 재배면적 감소가 향후 실제 생산 감소로 이어진다면 선물 가격에 상승 압력이 생길 수 있습니다.').length);assert(verdict('세계 소맥 재배면적 감소가 향후 실제 생산 감소로 이어진다면 선물 가격에 상승 압력이 생길 수 있습니다.',{...area,comparison:{...area.comparison,direction:'increase'}}).length);
 assert.equal(isDirectAiFooterSource({url:'https://api.fas.usda.gov/api/psd/commodity/0410000/world/year/2026',title:'USDA API'}),false);
 console.log('PASS OFFLINE-MOCK all eight: 1–4 short verified articles, no mandatory quote/length quota, exact sources/numbers/units, source-only rejection, six-section output through existing claim checks, conditional acreage pathway, safe optional omission, unchanged last-good manifest and public citation policy. No Gemini/network/cloud calls.');
}finally{if(runtimeBefore===undefined)delete process.env.RMS_STAGE3_RUNTIME_ROOT;else process.env.RMS_STAGE3_RUNTIME_ROOT=runtimeBefore;process.chdir(old);mock.timers.reset();globalThis.fetch=native;fs.rmSync(root,{recursive:true,force:true});}
