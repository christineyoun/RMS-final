/** OFFLINE-MOCK ONLY. All network disabled; persistence uses an isolated temporary root. */
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {mock as clock} from 'node:test';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import AiRecommendation from '../../components/AiRecommendation.tsx';
import {prepareAnalysisEvidence} from '../analysisArticleEvidence.ts';
import {collectAnalysisEvidence,trustedAnalysisUrl,type AnalysisFact} from '../analysisEvidence.ts';
import {factClaimContext} from '../analysisClaimSupport.ts';
import {parseGroundedAnalysis} from '../groundedAnalysisResponse.ts';
import {buildRecoveryAnalysisRequest} from '../liveAiAnalysisService.ts';
import {persistAnalysisSnapshot} from '../analysisSnapshotPersistence.ts';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/soybean-evidence-source-v1.json',import.meta.url),'utf8'));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-soybean-source-OFFLINE-MOCK-'));for(const [f,text]of Object.entries(fixture.files)){fs.mkdirSync(path.dirname(path.join(root,f)),{recursive:true});fs.writeFileSync(path.join(root,f),text as string);}
clock.timers.enable({apis:['Date'],now:new Date(fixture.checkedAt)});
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rms-soybean-ai-OFFLINE-MOCK-')),native=globalThis.fetch;
globalThis.fetch=async()=>{throw Error('OFFLINE-MOCK: all network including paid APIs disabled');};
const files=['.rms-stage3/usage.jsonl','.rms-stage3/paid-requests.jsonl','.rms-stage3/settings.json','.rms-stage3/analysis-recovery.json',...fs.readdirSync('.rms-stage3/snapshots').map(n=>'.rms-stage3/snapshots/'+n),...fs.readdirSync('.rms-price-history').filter(n=>n.endsWith('.json')).map(n=>'.rms-price-history/'+n),'.rms-stage3/soybean-news-verified.json','.rms-origin-verified/soybean-nasa-power-v2.json'];
const hashes=()=>files.map(f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex')),before=hashes(),now=new Date();
const set=(mock:any,field:string,facts:AnalysisFact[],text:string,refs:AnalysisFact[],aspects:string[],kind='conditional')=>{
 const segments=[...facts.map(f=>({kind:'fact',text:f.text,evidenceIds:[f.id],support:[]})),{kind,text,evidenceIds:refs.map(f=>f.id),support:refs.map((f,i)=>({evidenceId:f.id,aspect:aspects[i]}))}];
 const [key,index]=field.split('.');if(index===undefined)mock[key]=segments.map(s=>s.text).join(' ');else mock[key][+index]=segments.map(s=>s.text).join(' ');mock.evidenceClaims.push({field,segments});
};
const raw=(body:any)=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(body)}]}}]});
try{
 const evidence=await prepareAnalysisEvidence('soybean',root,now,{fetchSources:false});assert.equal(evidence.failures.length,0,JSON.stringify(evidence.failures));assert.equal(evidence.facts.length,29);assert.equal(new Set(evidence.facts.map(f=>f.id)).size,29);
 const get=(id:string)=>evidence.facts.find(f=>f.id===id)!;
 const by=(suffix:string)=>evidence.facts.find(f=>f.id.endsWith(suffix)&&(suffix!=='us-production'||f.sourceUrl.includes('ers.usda.gov')))!;
 const wow=evidence.facts.find(f=>f.id.startsWith('soybean-zs-wow'))!,mom=evidence.facts.find(f=>f.id.startsWith('soybean-zs-mom'))!;
 assert.equal(wow.comparison?.observationCount,2);assert.ok(!factClaimContext(wow).aspects.includes('sustained-price-trend'));
 const current=evidence.facts.filter(f=>f.id.startsWith('soybean-zs-')&&!f.comparison).at(-1)!;assert.ok(current.text.includes('잠정 일봉')&&current.text.includes('공식 CBOT 정산 확인 안 됨'));
 assert.equal(current.measure?.unit,'USD/MT');assert.ok(current.text.includes('US¢/bu'));assert.equal(get('psd-28').measure?.benchmark,'2222000');assert.ok(get('psd-28').text.includes('2026/27'));
 const planting=by('brazil-planting'),offer=by('export-offer'),world=by('september-us-production'),production=by('us-production'),exports=by('us-exports'),stocks=by('us-stocks');
 assert.ok(planting.text.includes('브라질 마토그로소')&&planting.text.includes('52%'));assert.equal(planting.measure?.scope,'Brazil:Mato Grosso:2026/27:reported-planting');
 assert.equal(world.observedAt,'2026-09');assert.equal(production.observedAt,'2026-10-15');assert.ok(world.text.includes('2026-10-15 보도'));
 assert.equal(new Set(evidence.facts.filter(f=>f.id.startsWith('article-')).map(f=>f.sourceUrl)).size,4);
 assert.ok(trustedAnalysisUrl(planting.sourceUrl));assert.ok(trustedAnalysisUrl(current.sourceUrl));assert.ok(!trustedAnalysisUrl(current.sourceUrl.replace('ZS%3DF','ZC%3DF')));assert.ok(!trustedAnalysisUrl('https://commodity-board.com/'));assert.ok(!trustedAnalysisUrl('https://power.larc.nasa.gov/unknown'));
 const heat=evidence.facts.find(f=>f.id.startsWith('soybean-weather-brazil')&&f.measure?.value===4)!;assert.ok(heat.text.includes('2026-10-11~2026-10-17'));assert.ok(factClaimContext(heat).aspects.includes('weather-signal'));
 const mock:any={testOnly:'OFFLINE-MOCK-NOT-A-GEMINI-ANALYSIS',evidenceContractVersion:4,confidenceScore:65,bullishFactors:[],bearishFactors:[],watchItems:[],evidenceClaims:[]};
 set(mock,'deskRecommendation',[wow],'확인된 대두 가격 하락을 고려해 단기 구매는 분할 검토하되, 실제 공급사 견적·FOB 오퍼·베이시스·운임·환율을 비교한 후 매입 조건을 확정하는 것이 적절합니다.',[wow],['interval-change'],'recommendation');
 set(mock,'executiveSummary',[get('psd-28'),get('psd-125'),world,production],'만약 대두 생산 및 소비 전망이 변경된다면 세계 수급과 실제 공급사 오퍼를 함께 비교해 구매 시점을 검토할 필요가 있습니다.',[get('psd-28'),get('psd-125')],['production','consumption']);
 set(mock,'bullishFactors.0',[heat],'만약 브라질 대두 고온이 이어질 경우 작황 확인 자료와 실제 공급사 오퍼를 추가로 비교할 필요가 있습니다.',[heat],['weather-signal']);
 set(mock,'bullishFactors.1',[offer],'만약 대두 FOB 오퍼가 상승한다면 산지별 실제 공급사 견적을 비교해 구매 조건을 재검토할 필요가 있습니다.',[offer],['price-level']);
 set(mock,'bearishFactors.0',[planting],'만약 브라질 대두 파종 진척이 추가로 개선된다면 현물 오퍼와 운임을 확인한 후 분할 구매 시점을 검토할 필요가 있습니다.',[planting],['planting-progress']);
 set(mock,'bearishFactors.1',[stocks],'만약 미국 대두 기말재고 전망이 상향 수정된다면 실제 공급사 오퍼를 비교하며 매입 시점을 검토할 필요가 있습니다.',[stocks],['inventory-level']);
 set(mock,'watchItems.0',[exports],'만약 미국 대두 수출 전망이 바뀐다면 선적 실적 확인과 함께 공급사 오퍼를 비교해 구매 조건을 재점검할 필요가 있습니다.',[exports],['exports']);
 set(mock,'watchItems.1',[mom],'만약 향후 대두 가격이 추가로 변동한다면 환율·운임·실제 공급사 견적을 비교한 후 발주 시점을 재검토할 필요가 있습니다.',[mom],['interval-change']);
 const parsed=parseGroundedAnalysis(raw(mock),'OFFLINE-MOCK-NOT-GEMINI',now,evidence,{requiredContractVersion:4});assert.equal(parsed.evidenceAudit.contractVersion,4);assert.equal(parsed.deskRecommendation,mock.deskRecommendation);assert.equal(parsed.sources.length,7);
 const request=buildRecoveryAnalysisRequest('gemini-3.8-flash','soybean',evidence,now.toISOString().slice(0,10),'verified-only');assert.deepEqual(request.config.tools,[]);assert.equal(request.config.maxOutputTokens,8192);assert.ok(request.contents.includes('Mato Grosso planting belongs to BRAZIL'));assert.ok(request.contents.includes('weather-signal'));assert.ok(request.contents.includes('planting-progress'));
 const rejectFact=(field:string,mutate:(s:string)=>string)=>{const bad=structuredClone(mock),claim=bad.evidenceClaims.find((c:any)=>c.field===field);claim.segments[0].text=mutate(claim.segments[0].text);const [key,index]=field.split('.');if(index===undefined)bad[key]=claim.segments.map((s:any)=>s.text).join(' ');else bad[key][+index]=claim.segments.map((s:any)=>s.text).join(' ');assert.throws(()=>parseGroundedAnalysis(raw(bad),'OFFLINE-MOCK',now,evidence),/unsupported-factual/);};
 rejectFact('bearishFactors.0',s=>s.replace('브라질 마토그로소','미국'));rejectFact('bearishFactors.0',s=>s.replace('52%','62%'));rejectFact('bullishFactors.0',s=>s+' 브라질 대두 작황 피해가 확정됐습니다.');rejectFact('watchItems.1',s=>s+' 공식 CBOT 정산가격이 확정됐습니다.');
 const rejectReason=(text:string,refs:AnalysisFact[],aspects:string[])=>{const bad=structuredClone(mock);bad.evidenceClaims=bad.evidenceClaims.filter((c:any)=>c.field!=='deskRecommendation');set(bad,'deskRecommendation',[wow],text,refs,aspects,'recommendation');assert.throws(()=>parseGroundedAnalysis(raw(bad),'OFFLINE-MOCK',now,evidence));};
 rejectReason('만약 대두 가격의 약세 흐름이 유지된다면 공급사 견적을 비교해 분할 매입을 검토할 필요가 있습니다.',[wow],['interval-change']);
 rejectReason('현재 타이트한 대두 재고가 유지된다면 공급사 오퍼를 확인한 후 구매할 필요가 있습니다.',[stocks],['inventory-level']);
 rejectReason('만약 브라질 대두 파종 진척이 바뀐다면 공급사 오퍼를 비교해 매입을 검토할 필요가 있습니다.',[get('psd-28')],['production']);
 rejectReason('만약 대두 선물 가격이 변동한다면 공급사 견적을 확인하고 반드시 도입 가격 하락이 보장됩니다.',[wow],['interval-change']);
 const failed=structuredClone(evidence);failed.facts[0].verification='url-only' as any;assert.throws(()=>parseGroundedAnalysis(raw(mock),'OFFLINE-MOCK',now,failed),/failed-source-verification/);
 const fake=structuredClone(mock);fake.sources=[{url:'https://fake.example/invented'}];assert.throws(()=>parseGroundedAnalysis(raw(fake),'OFFLINE-MOCK',now,evidence),/fabricated-or-unverified/);
 // Same exclusive persistence path, isolated MOCK root; no other commodity prerequisite.
 process.env.RMS_ANALYSIS_RECOVERY_ROOT=temp;
 persistAnalysisSnapshot(path.join(temp,'.rms-stage3'),'soybean','OFFLINE-MOCK-SOYBEAN',{success:true,testOnly:true,data:parsed});
 assert.ok(!fs.existsSync(path.join(temp,'.rms-stage3/snapshots/analysis-palm-oil.json')));
 const savedFile=path.join(temp,'.rms-stage3/snapshots/analysis-soybean.json'),saved=JSON.parse(fs.readFileSync(savedFile,'utf8'));assert.equal(saved.payload.testOnly,true);assert.equal(saved.payload.data.model,'OFFLINE-MOCK-NOT-GEMINI');assert.deepEqual(saved.payload.data,parsed);
 const html=renderToStaticMarkup(<AiRecommendation commodityId="soybean" executiveSummary={parsed.executiveSummary} recommendedCoverage={parsed.deskRecommendation} bullishFactors={parsed.bullishFactors} bearishFactors={parsed.bearishFactors} watchItems={parsed.watchItems} researchSources={parsed.sources} researchStatus="cached" researchModel="OFFLINE-MOCK-NOT-GEMINI"/>);
 assert.ok(html.includes('52%'));assert.ok(html.includes('분할'));assert.ok(!html.includes('저장된 AI 분석이 없습니다.'));assert.ok(!html.includes('NaN'));assert.ok(!html.includes('Infinity'));
 // Source failures are tested in cloned inputs, never production data.
 const cloneRoot=path.join(temp,'invalid-sources');for(const f of ['.rms-price-history/soybean.json','.rms-origin-verified/soybean-nasa-power-v2.json','src/data/usda_world_last_verified_soybean.json']){fs.mkdirSync(path.dirname(path.join(cloneRoot,f)),{recursive:true});fs.copyFileSync(path.join(root,f),path.join(cloneRoot,f));}
 const priceFile=path.join(cloneRoot,'.rms-price-history/soybean.json'),price=JSON.parse(fs.readFileSync(priceFile,'utf8'));price.snapshot.data.at(-1).usdPerMT+=20;fs.writeFileSync(priceFile,JSON.stringify(price));const invalid=collectAnalysisEvidence('soybean',cloneRoot,now);assert.ok(!invalid.facts.some(f=>f.id.startsWith('soybean-zs-')));assert.ok(invalid.failures.some(f=>f.startsWith('Soybean-price:')));
 const weatherFile=path.join(cloneRoot,'.rms-origin-verified/soybean-nasa-power-v2.json'),weather=JSON.parse(fs.readFileSync(weatherFile,'utf8'));weather.points.forEach((p:any)=>p.checkedAt='2020-01-01T00:00:00Z');fs.writeFileSync(weatherFile,JSON.stringify(weather));assert.ok(!collectAnalysisEvidence('soybean',cloneRoot,now).facts.some(f=>f.id.startsWith('soybean-weather-')));
 assert.deepEqual(hashes(),before,'all existing snapshots/data/schedules/paid logs unchanged');
 fs.writeFileSync(path.join(temp,'OFFLINE-MOCK-report.json'),JSON.stringify({testOnly:true,evidence,request:{model:request.model,search:false,outputTokens:request.config.maxOutputTokens},mock,savedSnapshot:savedFile,fullValidationPassed:true,uiCompatibilityPassed:true,negativeCasesRejected:true},null,2),{mode:0o600});fs.writeFileSync('/tmp/rms-soybean-task5-out',temp);
 console.log('PASS: 29 verified records; four article URLs and seven cited sources; full typed mock validation, isolated persistence and UI; geography/numbers/settlement/trend/tightness/crop damage/fabricated source failures; no network or production writes. Artifacts: '+temp);
}finally{globalThis.fetch=native;clock.timers.reset();delete process.env.RMS_ANALYSIS_RECOVERY_ROOT;}
