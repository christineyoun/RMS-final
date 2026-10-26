import {mock as testClock} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {collectAnalysisEvidence,type AnalysisEvidence} from '../analysisEvidence.ts';
import {parseGroundedAnalysis,AnalysisValidationError} from '../groundedAnalysisResponse.ts';
import {buildRecoveryAnalysisRequest} from '../liveAiAnalysisService.ts';
import {persistAnalysisSnapshot} from '../analysisSnapshotPersistence.ts';
import {recordAnalysisDiagnostic} from '../analysisDiagnostics.ts';
import {withAuthorizedStage3Run} from '../stage3Runtime.ts';
import {GoogleGenAI as OfflineSDK} from '@google/genai';

const frozen=JSON.parse(fs.readFileSync(new URL('./fixtures/analysis-grounding-evidence-v1.json',import.meta.url),'utf8'));
const now=new Date(frozen.checkedAt);
testClock.timers.enable({apis:['Date'],now});
const protectedFiles=['.rms-stage3/usage.jsonl','.rms-stage3/analysis-recovery.json','.rms-stage3/settings.json',
  ...fs.readdirSync('.rms-stage3/snapshots',{recursive:true,encoding:'utf8'}).filter(n=>fs.statSync('.rms-stage3/snapshots/'+n).isFile()).map(n=>'.rms-stage3/snapshots/'+n)];
const hashes=()=>protectedFiles.map(f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex')).join(':');
const before=hashes(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'rms-grounding-'));
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw Error('No network or paid calls permitted in grounding tests');};
const clone=<T>(v:T):T=>structuredClone(v);
const evidence=structuredClone(frozen.packets['palm-oil']);
const cpo=evidence.facts.find(f=>f.topic==='CPO')!,olein=evidence.facts.find(f=>f.topic==='RBD Olein')!;
function fixture(input:AnalysisEvidence=evidence){
  const a=input.facts.find(f=>f.topic==='CPO')||input.facts[0];
  const b=input.facts.find(f=>f.topic==='RBD Olein')||input.facts[1];
  const isPrice=a.measure?.metric==='price';
  const conditions=[
    `만약 ${a.topic} 후속 공표가격과 실제 공급사 견적이 일치하고 환율 및 운임을 비교할 수 있는 경우, 구매 시점을 조건부로 검토할 수 있습니다.`,
    `만약 ${a.topic} 후속 종가가 하락하는 경우, 동일 벤치마크의 실제 매입 원가 부담이 완화될 가능성이 있습니다.`,
    `만약 ${a.topic} 후속 공표 종가가 상승하는 경우, 해당 원료의 조달 비용이 높아질 가능성이 있습니다.`,
    `만약 ${b.topic} 후속 공표가격이 상승하는 경우, 해당 제품의 공급사 오퍼 비교가 더 중요해질 수 있습니다.`,
    `만약 ${a.topic} 후속 공표 종가가 낮아지는 경우, 해당 계약의 구매 부담이 줄어들 가능성이 있습니다.`,
    `만약 ${b.topic} 후속 공표가격이 낮아지는 경우, 해당 제품의 구매 여건이 개선될 수 있습니다.`,
    `만약 ${a.topic} 다음 공표 종가를 확인할 수 있는 경우, 같은 통화와 단위로 가격 방향을 다시 비교할 수 있습니다.`,
    `만약 ${b.topic} 다음 가격 관측일이 확인되는 경우, 제품별 오퍼 점검 시점을 다시 판단할 수 있습니다.`,
  ];
  if(!isPrice){
    for(let i=0;i<conditions.length;i++){const f=i===3||i===5||i===7?b:a;const metric=f.measure?.metric==='기말재고'?'재고':f.measure?.metric==='생산'?'생산':f.measure?.metric==='수출'?'수출':f.measure?.metric||'생산';conditions[i]=`만약 ${f.topic} ${metric} 전망이 ${i%2?'상향':'하향'} 수정되는 경우, ${['실제 공급사 견적과 환율 및 운임을 비교하여 구매 시점을 검토할 수 있습니다.','산지 공급 여건과 구매 조건을 다시 비교할 필요가 있습니다.','해당 원료 구매 부담이 높아질 가능성이 있습니다.','관련 제품 공급사 오퍼를 비교할 수 있습니다.','해당 계약의 구매 부담이 줄어들 가능성이 있습니다.','해당 제품의 구매 여건이 달라질 수 있습니다.','동일 전망의 다음 발표 내용을 모니터링할 필요가 있습니다.','조달 조건 변경 여부를 점검할 수 있습니다.'][i]}`;}
  }
  const fields=['deskRecommendation','executiveSummary','bullishFactors.0','bullishFactors.1','bearishFactors.0','bearishFactors.1','watchItems.0','watchItems.1'];
  const data:any={confidenceScore:60,bullishFactors:[],bearishFactors:[],watchItems:[],evidenceClaims:[]};
  fields.forEach((field,i)=>{
    const f=i%2?b:a;
    const segments=[{kind:'fact',text:f.text,evidenceIds:[f.id]},
      ...(i===1?[{kind:'fact',text:a.text,evidenceIds:[a.id]}]:[]),
      {kind:'conditional',text:conditions[i],evidenceIds:[i===3||i===5||i===7?b.id:a.id]}];
    const text=segments.map(s=>s.text).join(' ');
    if(field.includes('.')){const [key,n]=field.split('.');data[key][Number(n)]=text;}else data[field]=text;
    data.evidenceClaims.push({field,segments});
  });
  return data;
}
const response=(data:any)=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(data)}]}}]});
const parse=(data:any,ev:AnalysisEvidence|undefined=evidence)=>parseGroundedAnalysis(response(data),'mock-gemini',now,ev);
const rejected=(data:any,pattern:RegExp,ev:AnalysisEvidence|undefined=evidence)=>assert.throws(()=>parse(data,ev),(e:AnalysisValidationError)=>pattern.test(e.message));
try{
  assert.ok(evidence.facts.length>=5);assert.ok(evidence.failures.every(f=>f.startsWith('publisher-receipt-incomplete:')),'incomplete old receipts remain diagnostics, never facts');
  assert.equal(cpo.observedAt,'2026-10-19');assert.match(cpo.text,/4797 MYR\/MT/);
  assert.equal(olein.observedAt,'2026-10-19');assert.match(olein.text,/1167\.5 USD\/MT/);
  const data=fixture(),result=parse(data);
  assert.equal(result.evidenceAudit?.path,'verified-rms-evidence');assert.equal(result.sources.length,2);
  assert.equal(result.executiveSummary,data.executiveSummary,'Gemini prose preserved; no replacement analysis');
  const request=buildRecoveryAnalysisRequest('gemini-3.8-flash','palm-oil',evidence,'2026-10-20');
  assert.deepEqual(request.config.tools,[{googleSearch:{}}]);assert.equal(request.config.responseMimeType,'application/json');
  assert.equal(request.config.thinkingConfig.thinkingLevel,'LOW');assert.ok(request.contents.includes(cpo.text));
  assert.ok(request.config.responseSchema.required.includes('evidenceClaims'));
  assert.throws(()=>buildRecoveryAnalysisRequest('gemini-2.5-flash','palm-oil',evidence,'2026-10-20'),/no paid request made/);
  let serialized:any,transportCalls=0;
  // Explicit isolated transport: SDK serialization is exercised without a socket,
  // real credentials, the paid guard, or a provider request/usage record.
  const offlineSDK=new OfflineSDK({apiKey:'offline-fixture-not-a-key',httpOptions:{baseUrl:'https://offline.invalid',apiVersion:'v1beta',fetch:async(url:any,init:any)=>{
    transportCalls++;assert.match(String(url),/^https:\/\/offline\.invalid\/v1beta\/models\/gemini-3\.8-flash:generateContent/);
    serialized=JSON.parse(init.body);return new Response(JSON.stringify(response(data)),{status:200,headers:{'content-type':'application/json'}});
  }}});
  const sdkResponse=await offlineSDK.models.generateContent(request);
  assert.equal(transportCalls,1);assert.deepEqual(serialized.tools,[{googleSearch:{}}]);
  assert.equal(serialized.generationConfig.responseMimeType,'application/json');
  assert.equal(serialized.generationConfig.thinkingConfig.thinkingLevel,'LOW');
  assert.ok(serialized.generationConfig.responseSchema.required.includes('evidenceClaims'));
  assert.equal(parseGroundedAnalysis(sdkResponse,'mock',now,evidence).evidenceAudit?.path,'verified-rms-evidence');

  const grounded:any=response(data),raw=JSON.stringify(data);
  grounded.candidates[0].content.parts=[{thought:true,text:'internal thought'},{text:raw}];
  grounded.candidates[0].groundingMetadata={webSearchQueries:['offline only'],groundingChunks:[{web:{uri:'https://www.mpob.gov.my/fixture',title:'Offline official example'}}],
    groundingSupports:[{segment:{partIndex:1,startIndex:0,endIndex:Buffer.byteLength(raw,'utf8'),text:raw},groundingChunkIndices:[0]}]};
  assert.equal(parseGroundedAnalysis(grounded,'mock',now).evidenceAudit?.path,'google-search','Korean UTF-8 byte spans and thought part handled');
  const escaped=clone(grounded),escapedText=raw.replace(/[\u0080-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
  escaped.candidates[0].content.parts[1].text=escapedText;
  escaped.candidates[0].groundingMetadata.groundingSupports[0].segment={partIndex:1,startIndex:0,endIndex:Buffer.byteLength(escapedText),text:escapedText};
  assert.equal(parseGroundedAnalysis(escaped,'mock',now).evidenceAudit?.path,'google-search','escaped Korean JSON also supported');
  const invalid=clone(grounded);invalid.candidates[0].groundingMetadata.groundingSupports[0].segment.endIndex=raw.length;
  assert.throws(()=>parseGroundedAnalysis(invalid,'mock',now),/no-sufficient/,'character offsets cannot masquerade as UTF-8 byte spans');
  const linksOnly=clone(grounded);delete linksOnly.candidates[0].groundingMetadata.groundingSupports;
  assert.throws(()=>parseGroundedAnalysis(linksOnly,'mock',now),/no-sufficient/,'URLs alone are insufficient');
  const partial=clone(grounded);partial.candidates[0].groundingMetadata.groundingSupports[0].segment={partIndex:1,startIndex:0,endIndex:20};
  assert.throws(()=>parseGroundedAnalysis(partial,'mock',now),/no-sufficient/,'partial citation coverage rejected');
  const badIndex=clone(grounded);badIndex.candidates[0].groundingMetadata.groundingSupports[0].groundingChunkIndices=[999];
  assert.throws(()=>parseGroundedAnalysis(badIndex,'mock',now),/no-sufficient/);
  assert.equal(parseGroundedAnalysis(linksOnly,'mock',now,evidence).evidenceAudit?.path,'verified-rms-evidence','missing Search spans can use verified RMS facts');
  rejected(data,/no-sufficient/,{commodity:'palm-oil',facts:[],failures:['403']});
  const failed=clone(evidence);failed.facts[0].verification='url-only' as any;rejected(data,/failed-source-verification/,failed);
  const stale=clone(evidence);stale.facts[0].verifiedAt='2025-01-01';rejected(data,/failed-source-verification/,stale);
  const wrongCommodity=clone(evidence);wrongCommodity.facts[0].commodity='soybean';rejected(data,/failed-source-verification/,wrongCommodity);
  for(const mutate of [
    (s:string)=>s.replace('4797','9999'),(s:string)=>s.replace('MYR/MT','USD/MT'),
    (s:string)=>s.replace('2026-10-19','2026-10-20'),(s:string)=>s.replace('CPO','RBD Olein'),
    (s:string)=>s+' 말레이시아 수출이 급증했습니다.',
  ]){
    const bad=clone(data);bad.evidenceClaims[0].segments[0].text=mutate(cpo.text);
    bad.deskRecommendation=bad.evidenceClaims[0].segments.map((s:any)=>s.text).join(' ');
    rejected(bad,/unsupported-factual-claim/);
  }
  const added=clone(data);added.executiveSummary+=' MPOB 재고는 사상 최대입니다.';rejected(added,/unmapped-material-assertion/);
  const fakeId=clone(data);fakeId.evidenceClaims[0].segments[0].evidenceIds=['fake'];rejected(fakeId,/fabricated-citation/);
  const fakeUrl=clone(data);fakeUrl.sources=[{url:'https://fake.example/invented'}];rejected(fakeUrl,/fabricated-or-unverified/);
  const number=clone(data);number.evidenceClaims[0].segments[1].text='만약 CPO 가격이 오르는 경우, 50% 매수할 수 있습니다.';
  number.deskRecommendation=number.evidenceClaims[0].segments.map((s:any)=>s.text).join(' ');rejected(number,/unsupported-or-nonconditional/);
  const generic=clone(data);generic.deskRecommendation='분할 매수 및 단기 관망 병행';generic.evidenceClaims[0].segments=[];rejected(generic,/missing-claim-coverage/);
  const missing=clone(data);delete missing.evidenceClaims;rejected(missing,/missing-evidence-claim-map/);
  const previousFailure=JSON.parse(fs.readFileSync('.rms-stage3/diagnostics/analysis-recovery-palm-828d37113af3-1-palm-oil.json','utf8'));
  rejected(JSON.parse(previousFailure.response.text),/missing-evidence-claim-map/,evidence);
  for(const id of ['soybean','soybean-oil','sugar']){
    const ev=structuredClone(frozen.packets[id]);assert.ok(ev.facts.length>=3);
    assert.equal(parse(fixture(ev),ev).evidenceAudit?.path,'verified-rms-evidence',id+' uses shared validation');
  }

  // Original source verification fails closed; a valid URL/provenance flag is insufficient.
  fs.mkdirSync(path.join(temp,'src/data'),{recursive:true});
  const saved=structuredClone(frozen.psdWorldPalm);
  saved.data.rawRecords[0].commodityCode='4232000';
  fs.writeFileSync(path.join(temp,'src/data/usda_world_last_verified_palm-oil.json'),JSON.stringify(saved));
  const badSource=collectAnalysisEvidence('palm-oil',temp,now);assert.equal(badSource.facts.length,0);assert.ok(badSource.failures.length);
  const noReceipt=path.join(temp,'no-receipt');fs.mkdirSync(path.join(noReceipt,'src/data'),{recursive:true});
  fs.writeFileSync(path.join(noReceipt,'src/data/usda_world_last_verified_palm-oil.json'),JSON.stringify({commodityCode:'4243000',verifiedAt:now.toISOString(),data:{rawRecords:[]}}));
  assert.equal(collectAnalysisEvidence('palm-oil',noReceipt,now).facts.length,0);

  process.env.RMS_ANALYSIS_RECOVERY_ROOT=path.join(temp,'saved');
  persistAnalysisSnapshot(path.join(process.env.RMS_ANALYSIS_RECOVERY_ROOT!,'.rms-stage3'),'palm-oil','OFFLINE-MOCK', {success:true,data:result});
  const persisted=JSON.parse(fs.readFileSync(path.join(process.env.RMS_ANALYSIS_RECOVERY_ROOT,'.rms-stage3/snapshots/analysis-palm-oil.json'),'utf8'));
  assert.equal(persisted.payload.data.evidenceAudit.path,'verified-rms-evidence');
  const ctx={runId:'offline-request',permitted:true,attempts:1,successfulCalls:0,maxCalls:1,estimatedUsd:0,maxEstimatedUsd:0.25};
  withAuthorizedStage3Run(ctx,()=>recordAnalysisDiagnostic('palm-oil','mock',response(data),undefined,{pipelineVersion:3,tools:request.config.tools,evidenceFactCount:evidence.facts.length}));
  const diagnostic=JSON.parse(fs.readFileSync(path.join(process.env.RMS_ANALYSIS_RECOVERY_ROOT,'.rms-stage3/analysis-palm-oil-diagnostic.json'),'utf8'));
  assert.equal(diagnostic.request.evidenceFactCount,evidence.facts.length);
  assert.equal(hashes(),before,'paid usage, run history and every saved snapshot unchanged');
  console.log('PASS: Search byte/part citation coverage; verified RMS evidence; unsupported numbers/units/dates/benchmarks/assertions/citations; failed original sources; mock persistence and diagnostics; zero network/paid calls.');
}finally{testClock.timers.reset();globalThis.fetch=originalFetch;delete process.env.RMS_ANALYSIS_RECOVERY_ROOT;fs.rmSync(temp,{recursive:true,force:true});}
