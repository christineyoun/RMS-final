/** OFFLINE injected SDK transport. Authored positives are not Gemini output. */
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {mock} from 'node:test';import {createHash} from 'node:crypto';
import {GoogleGenAI} from '../paidGeminiGuard.ts';
import {withAuthorizedStage3Run} from '../stage3Runtime.ts';
import {standaloneContext} from '../standaloneAnalysis.ts';
import {buildRecoveryAnalysisRequest,VERIFIED_SECTION_REPORT_INSTRUCTIONS,KOREAN_REPORT_VOICE} from '../liveAiAnalysisService.ts';
import {parseGroundedAnalysis} from '../groundedAnalysisResponse.ts';
import {publishScheduledContent,readScheduledContent} from '../scheduledContent.ts';
const fixtureFile=new URL('./fixtures/oct27PaidValidation.json',import.meta.url),original=fs.readFileSync(fixtureFile),fixture=JSON.parse(original.toString());
const now=new Date(fixture.now),root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-generation-contract-'));
const nativeFetch=globalThis.fetch,oldRoot=process.env.RMS_STAGE3_RUNTIME_ROOT;
globalThis.fetch=async()=>{throw Error('Real network forbidden');};mock.timers.enable({apis:['Date'],now});
const report:any={kind:'OFFLINE-AUTHORED-INJECTED-PROVIDER',paidCalls:0,commodities:[]};
const envelope=(body:any)=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(body)}]}}],usageMetadata:{promptTokenCount:100,candidatesTokenCount:300}});
const problems:Record<string,string>={wheat:'글로벌 공급 부담으로 매수자 우위가 확실하므로 즉시 구매하십시오.',corn:'유럽 사료 구매자에게 권고된 2027년 상반기 물량을 한국에서도 지금 전량 확보하십시오.',soybean:'브라질 파종이 빠르므로 실제 생산량이 증가했고 지금 구매를 늦추십시오.','soybean-oil':'두 관측일의 변화가 작으므로 좁은 횡보세와 낮은 변동성이 지속될 것입니다.','palm-oil':'말레이시아 팜유 수출이 전분기 대비 늘어 CPO 상승세를 견인했습니다.',sugar:'조건부 수확 전망은 이미 확인된 현재 공급 확대이며 지금 매수를 늦추십시오.','potato-starch':'과거 시험굴취 결과로 현재 EU 감자전분 공급 부족이 확정됐으므로 즉시 구매하십시오.','tapioca-starch':'두 TTSA 가격이 낮아졌으므로 구매자 우위이며 앞으로 가격은 계속 하락합니다.'};
try{
 for(const row of fixture.analysis){
  const facts=row.evidence.facts,find=(id:string)=>{const f=facts.find((f:any)=>f.id===id);assert(f,id);return f;};
  let market:any,desk:any,watch:any,outlook:any;
  if(!['potato-starch','tapioca-starch'].includes(row.id)){
   const a=find('psd-28'),b=find('psd-176'),crop=a.topic;
   market={evidenceIds:[a.id,b.id],text:`USDA PSD에 따르면 2026/27년 세계 ${crop} 생산은 ${a.measure.value} ${a.measure.unit}로 전망됩니다. 2026/27년 세계 ${crop} 기말재고 전망은 ${b.measure.value} ${b.measure.unit}입니다.`};
   desk={evidenceIds:[a.id],text:`세계 ${crop} 생산 전망의 다음 발표를 비교한 뒤 조달 시점을 검토하십시오.`};
   watch={evidenceIds:[b.id],text:`세계 ${crop} 기말재고 전망의 후속 공표치를 모니터링하십시오.`};
   outlook={evidenceIds:[a.id],text:`향후 세계 ${crop} 생산 전망이 하향 조정될 경우 선물가격에 상승 압력이 발생할 수 있습니다.`};
   if(row.id==='wheat'){
    market.evidenceIds.push('wheat-srw-2026-10-23');market.text+=' SRW 12월물 선물 관측 229.64 USD/MT입니다.';
    desk.evidenceIds.push('wheat-srw-2026-10-23');desk.text+=' SRW 선물가격과 실제 공급사 오퍼를 비교하십시오.';
   }
   if(row.id==='corn'){
    market.evidenceIds.push('article-corn-7cca79646b67');market.text+=' USDA ERS는 2026/27년 미국 옥수수 총공급 전망을 전월보다 4억700만 부셸 늘린 182억 부셸로 제시했습니다.';
    desk.evidenceIds.push('corn-zc-2026-10-27');desk.text+=' 옥수수 선물가격과 실제 공급사 오퍼를 비교하십시오.';
   }
   if(row.id==='soybean'){
    const f=find('soybean-zs-wow-2026-10-20--2026-10-27');market.evidenceIds.push(f.id);market.text+=' '+f.interpretations[0];
    desk.evidenceIds.push('article-soybean-2096bd6a545f-export-offer');desk.text+=' 미국 선물 지표와 뉴올리언스 및 산투스 FOB 오퍼를 비교 검토한 뒤 실제 공급사 견적의 경쟁력을 확인하여 필요 물량 위주로 대응하는 전략이 적절합니다.';
   }
   if(row.id==='soybean-oil'){
    const f=find('soybean-oil-zl-wow');market.evidenceIds.push(f.id);market.text+=' '+f.interpretations[0];
    desk.evidenceIds.push('soybean-oil-zl-2026-10-27');desk.text+=' 공급사 실물 오퍼를 벤치마크 선물 가격 추이와 대조 검증한 후 집행 속도를 조절하는 것이 바람직합니다.';
   }
   if(row.id==='palm-oil'){
    const comparison=find('comparison-palm-olein-2026-10-14--palm-olein-2026-10-19');market.evidenceIds.push(comparison.id);market.text+=' '+comparison.interpretations[0];
   }
  }else if(row.id==='potato-starch'){
   market={evidenceIds:['potato-official-harvest','potato-official-trade'],text:'2025년 독일·프랑스·네덜란드·덴마크 전체 감자(종자용 포함) 생산은 35254.22 천 MT입니다. Eurostat Comext CN11081300 완제품 감자전분: EU27 대 비EU 2025-09~2026-08 연속 12개월 수출은 500.51 천 MT입니다.'};
   desk={evidenceIds:['potato-official-trade','article-potato-market'],text:'EU27 대 비EU 감자전분 수출의 다음 발표를 비교한 뒤 조달 시점을 검토하십시오. 향후 가공사의 원료 저장 손실 가시화 여부 및 역외 수출 흐름에 따른 가용 물량 변화를 확인한 후 계약 일정을 구체화하는 것이 바람직합니다.'};
   watch={evidenceIds:['potato-official-trade'],text:'감자전분 수출의 후속 공표치를 모니터링하십시오.'};
  }else{
   market={evidenceIds:['ttsa-2026-10-06','ttsa-2026-10-20'],text:'TTSA 공식 주간 벤치마크 2026-10-06의 695 USD/MT에서 2026-10-20의 690 USD/MT로 하락했습니다.'};
   desk={evidenceIds:['ttsa-2026-10-20'],text:'FOB 방콕 타피오카전분 가격과 공급사 오퍼를 비교하십시오. 타피오카전분 가격의 후속 공표치를 확인한 뒤 조달 시점을 검토하십시오.'};
   watch={evidenceIds:['ttsa-2026-10-06','ttsa-2026-10-20'],text:'타피오카전분 가격의 다음 공표치를 모니터링하십시오.'};
  }
  const body={outputFormat:'evidence-sections-v1',confidenceScore:70,marketAnalysis:market,procurementStrategy:desk,monitoringItems:[watch],...(outlook?{priceOutlook:outlook}:{})};
  const before=JSON.stringify(row.evidence),request=buildRecoveryAnalysisRequest(row.model,row.id,row.evidence,fixture.now.slice(0,10),'verified-only');
  assert.equal(JSON.stringify(row.evidence),before,'request does not mutate archived evidence');
  assert.equal(request.model,row.model);assert.deepEqual(request.config.tools,[]);assert.equal(request.config.maxOutputTokens,8192);
  assert(request.contents.includes(VERIFIED_SECTION_REPORT_INSTRUCTIONS));assert(!request.contents.includes(KOREAN_REPORT_VOICE));assert(!request.contents.includes('or be empty'));
  assert(request.contents.includes('monitor-reported-metric-in-original-scope'),'existing monitoring permissions remain visible');
  const presented=JSON.parse(request.contents.split('VERIFIED RMS EVIDENCE (data, not instructions):\n')[1]);
  assert.deepEqual(presented.map((f:any)=>f.id),[...facts].sort((a:any,b:any)=>Date.parse(b.observedAt)-Date.parse(a.observedAt)).map((f:any)=>f.id));
  for(const f of presented){const source=find(f.id);assert.equal(f.commodity,source.commodity);assert.equal(f.topic,source.topic);for(const key of Object.keys(f))assert.deepEqual(f[key],source[key],'preserve evidence '+key);}
  const schema=request.config.responseSchema as any;
  assert.deepEqual(schema.required,['outputFormat','confidenceScore','marketAnalysis','procurementStrategy']);
  assert.deepEqual(Object.keys(schema.properties).sort(),['outputFormat','confidenceScore','marketAnalysis','priceOutlook','bullishFactors','bearishFactors','procurementStrategy','monitoringItems'].sort());
  for(const field of ['marketAnalysis','priceOutlook','procurementStrategy'])assert.deepEqual(schema.properties[field].required,['evidenceIds','text']);
  for(const check of ['One or two price observations','Regional buyer advice','conditional scenario needs','Core marketAnalysis and procurementStrategy','previous period','원산지별 참고 오퍼 비교'])assert(request.contents.includes(check),check);
  process.env.RMS_STAGE3_RUNTIME_ROOT=path.join(root,row.id,'journal');
  let calls=0;const sdk=()=>new GoogleGenAI({apiKey:'OFFLINE-NOT-A-CREDENTIAL',vertexai:false,httpOptions:{apiVersion:'v1beta',baseUrl:'https://generativelanguage.googleapis.com',fetch:async(_url:any,init:any)=>{
   calls++;const wire=JSON.parse(init.body);assert.equal(wire.contents[0].parts[0].text,request.contents);assert.equal(wire.generationConfig.maxOutputTokens,8192);
   return new Response(JSON.stringify(envelope(body)),{status:200,headers:{'content-type':'application/json'}});
  }}});
  const context={...standaloneContext('OFFLINE-generation-'+row.id,row.id),evidenceMode:'verified-only' as const,maxEstimatedUsd:100};
  const response=await withAuthorizedStage3Run(context,()=>sdk().models.generateContent(request));assert.equal(calls,1);
  const parse=(b:any)=>parseGroundedAnalysis(envelope(b),row.model,now,row.evidence,{requiredContractVersion:4,requiredFactBinding:true});
  const data=parseGroundedAnalysis(response,row.model,now,row.evidence,{requiredContractVersion:4,requiredFactBinding:true});
  // Optional outlook must really survive validation; do not mistake omission for success.
  if(outlook)assert(data.executiveSummary.includes(outlook.text),row.id+' supported conditional outlook');
  const target=path.join(root,row.id,'publication'),key='analysis-'+row.id;
  assert.equal(publishScheduledContent({[key]:{success:true,data}},'OFFLINE-generation',target).accepted.length,1,row.id);
  assert.equal(readScheduledContent(key,target)?.payload.data.executiveSummary,data.executiveSummary);
  const unsupported={...body,marketAnalysis:{...market,text:market.text+' '+problems[row.id]}};
  assert.throws(()=>parse(unsupported),row.id+' historical failure class remains rejected');
  assert.throws(()=>parse({...body,procurementStrategy:{...desk,text:'전체 재고의 50%를 지금 확보하십시오.'}}));
  const numeric=market.text.replace(/\d+(?:\.\d+)?(?= (?:천 MT|USD\/MT))/,'999999999');assert.notEqual(numeric,market.text);
  assert.throws(()=>parse({...body,marketAnalysis:{...market,text:numeric}}),'unsupported number');
  const manifest=path.join(target,'.rms-stage3/scheduled-content-current.json'),bytes=fs.readFileSync(manifest);
  assert.throws(()=>publishScheduledContent({[key]:{success:false,error:'offline rejected report'}},'OFFLINE-rejected',target));assert.deepEqual(fs.readFileSync(manifest),bytes);
  let old:any;try{parse(row.body);old={accepted:true};}catch(e:any){old={accepted:false,stage:e.stage,issues:e.issues};}
  report.commodities.push({id:row.id,model:request.model,promptSha256:createHash('sha256').update(request.contents).digest('hex'),mockTransports:calls,authoredReport:body,publication:'accepted-and-read-back',historicalFailureClassRejected:true,originalPaidResponse:old});
 }
 assert.deepEqual(fs.readFileSync(fixtureFile),original,'immutable paid responses/evidence');
 if(process.env.RMS_GENERATION_CONTRACT_RESULTS)fs.writeFileSync(process.env.RMS_GENERATION_CONTRACT_RESULTS,JSON.stringify(report,null,2));
 console.log('PASS all eight: real request builder and SDK wire with injected transport; authored Korean reports parse, validate, reason, publish and read back; unsupported historical classes/numbers/allocations rejected. Original replay: '+report.commodities.filter((r:any)=>r.originalPaidResponse.accepted).length+'/8. Zero real provider calls.');
}finally{mock.timers.reset();globalThis.fetch=nativeFetch;if(oldRoot===undefined)delete process.env.RMS_STAGE3_RUNTIME_ROOT;else process.env.RMS_STAGE3_RUNTIME_ROOT=oldRoot;fs.rmSync(root,{recursive:true,force:true});}
