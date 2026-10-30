/** No provider call: request contracts and dashboard controls only. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildRecoveryAnalysisRequest} from '../liveAiAnalysisService.ts';
import {scheduledPhasePlan} from '../scheduledAi.ts';
const archive=JSON.parse(fs.readFileSync(new URL('./fixtures/oct27PaidValidation.json',import.meta.url),'utf8'));
const originals=JSON.parse(fs.readFileSync(new URL('./fixtures/livePublisherPassagesOct29.json',import.meta.url),'utf8'));
const ids=['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'];
const app=fs.readFileSync(new URL('../../App.tsx',import.meta.url),'utf8');
for(const removed of ['data-evidence-first-panel','data-evidence-first-refresh','품목별 분석 갱신 상태','공개 자료와 검증된 근거만 사용','evidenceRefreshing','refreshEvidence','/api/rms/evidence-first/'])assert(!app.includes(removed),removed);
assert(app.includes('<Header'));assert(app.includes('<Sidebar'));assert(app.includes('<CommodityDetail'));assert(app.includes('<OverviewTerminal'));
const native=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Paid/network request forbidden');};
try{
 const plan=scheduledPhasePlan('2026-10-30');assert.equal(plan.length,16);
 for(const id of ids){assert.equal(plan.filter(p=>p.id===id&&p.kind==='analysis').length,1);assert.equal(plan.filter(p=>p.id===id&&p.kind==='news').length,1);
  const evidence=structuredClone(archive.analysis.find((r:any)=>r.id===id).evidence);evidence.facts.push(...originals.facts.filter((f:any)=>f.commodity===id));
  const request=buildRecoveryAnalysisRequest('gemini-3.8-flash',id,evidence,'2026-10-30','verified-only');
  assert.equal(request.model,'gemini-3.8-flash');assert.equal(request.config.maxOutputTokens,8192);assert(!request.config.tools?.length);
  const schema:any=request.config.responseSchema;for(const section of ['marketAnalysis','priceOutlook','procurementStrategy','bullishFactors','bearishFactors','monitoringItems','reportStyle'])assert(schema.required.includes(section),id+': '+section);
  assert.deepEqual(schema.properties.reportStyle.enum,['procurement-brief-v1']);assert(request.contents.includes('No live Search or external tools'));
 }
 console.log('PASS removed panel/polling/handler; legitimate navigation/header preserved; all eight including Tapioca share verified-only six-section Korean brief request and scheduled phase scope. No paid/network calls.');
}finally{globalThis.fetch=native;}
