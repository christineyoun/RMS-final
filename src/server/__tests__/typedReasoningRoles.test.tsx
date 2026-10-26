/** Exact fifth response replay; no model calls, mutable source reads or production saves. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {mock as clock} from 'node:test';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import AiRecommendation from '../../components/AiRecommendation.tsx';import {validateConditionalReasoning} from '../analysisReasoning.ts';import {parseGroundedAnalysis} from '../groundedAnalysisResponse.ts';import {materializeClaimText} from '../analysisClaimText.ts';import {persistAnalysisSnapshot} from '../analysisSnapshotPersistence.ts';
const file='.rms-stage3/diagnostics/standalone-soybean-2f9140023f10-1-soybean.json',d=JSON.parse(fs.readFileSync(file,'utf8')),original=JSON.parse(d.response.text),packet=d.request.evidence,now=new Date(d.recordedAt),out=fs.mkdtempSync(path.join(os.tmpdir(),'rms-typed-reasoning-OFFLINE-MOCK-'));
const protectedFiles=[...fs.readdirSync('.rms-stage3/diagnostics').map(n=>'.rms-stage3/diagnostics/'+n).filter(p=>fs.statSync(p).isFile()),...fs.readdirSync('.rms-stage3/snapshots',{recursive:true,encoding:'utf8'}).filter(n=>fs.statSync('.rms-stage3/snapshots/'+n).isFile()).map(n=>'.rms-stage3/snapshots/'+n),'.rms-stage3/standalone-analysis.json','.rms-stage3/usage.jsonl','.rms-stage3/paid-requests.jsonl','.rms-stage3/settings.json'];const hashes=()=>protectedFiles.map(p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'));const soybeanExisted=fs.existsSync('.rms-stage3/snapshots/analysis-soybean.json');const before=hashes(),native=fetch;clock.timers.enable({apis:['Date'],now});globalThis.fetch=async()=>{throw Error('Offline only: no paid or source network');};
const raw=(b:any)=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(b)}]}}]});const parse=(b:any)=>parseGroundedAnalysis(raw(b),'OFFLINE-MOCK-NOT-GEMINI',now,packet,{requiredContractVersion:4});const segment=(b:any,field:string)=>b.evidenceClaims.find((c:any)=>c.field===field).segments.find((s:any)=>['recommendation','conditional'].includes(s.kind));const fact=(id:string)=>packet.facts.find((f:any)=>f.id===id);const verdict=(s:any)=>validateConditionalReasoning(s.text,s.evidenceIds.map(fact),{kind:s.kind,support:s.support});const claim=(text:string,id:string,aspect:string,kind='recommendation')=>({text,kind,evidenceIds:[id],support:[{evidenceId:id,aspect}]});const issueList=(b:any)=>{try{parse(b);return [];}catch(e:any){assert.ok(Array.isArray(e.issues));return e.issues;}};
try{
 const production=segment(original,'bearishFactors.0'),monitor=segment(original,'watchItems.1'),offer=segment(original,'watchItems.0');
 assert.deepEqual(verdict(production).issues,[]);assert.deepEqual(verdict(monitor).issues,[]);
 const positive=[
  ...['世界 기말재고 전망 수정 여부를 검토 바랍니다.','세계 기말재고 전망을 지속적으로 확인하는 조치가 필요합니다.','세계 기말재고 전망 수정 여부를 대조해 보십시오.','세계 기말재고 전망이 하락하는지 점검하십시오.','2026/27년 세계 기말재고 전망 수정 방향을 살펴볼 것을 제안합니다.','2026/2027년 세계 기말재고 전망을 대조하십시오.'].map(t=>claim(t.replace('世界','세계'),'psd-176','inventory-level')),
  ...['확인하는 조치가 필요합니다.','비교해 보십시오.','모니터링을 권고드립니다.','추적 바랍니다.'].map(end=>({...offer,text:'미국과 브라질 11월 선적 FOB 오퍼와 실제 공급사 견적을 '+end})),
  ...['미국 대두 생산 전망 상향을 바탕으로 향후 선물 가격에 하방 압력이 생길 가능성이 있습니다.','미국 대두 생산 전망이 상향됨에 따라 선물 가격 하락 압력으로 작용할 여지가 있습니다.','미국 대두 생산 전망이 증가한다면 선물 가격 상승 압력이 제한될 수 있습니다.'].map(t=>({...production,text:t})),
 ];for(const c of positive)assert.deepEqual(verdict(c).issues,[],c.text);
 const negative=[
  {...production,text:'세계 대두 생산 전망이 증가함에 따라 선물 가격에 하방 압력이 작용할 수 있습니다.'},
  claim('세계 대두 생산 전망이 증가함에 따라 선물 가격에 하방 압력이 작용할 수 있습니다.','psd-28','production','conditional'),
  {...production,text:'미국 대두 생산 전망이 상향됨에 따라 선물 가격 상승 압력으로 작용할 수 있습니다.'},
  {...production,text:'미국 대두 생산 전망이 상향됨에 따라 브라질 선물 가격에 하방 압력이 작용할 수 있습니다.'},
  {...production,text:'미국 대두 생산 전망이 상향됨에 따라 대두유 선물 가격에 하방 압력이 작용할 수 있습니다.'},
  {...production,text:'미국 대두 생산 전망이 감소함에 따라 선물 가격에 하방 압력이 작용할 수 있습니다.'},
  {...production,text:'미국 대두 생산 전망이 증가함에 따라 선물 가격은 반드시 하락합니다.'},
  {...production,text:'미국 대두 생산 전망이 증가함에 따라 물리적 조달 원가 하락이 이어질 수 있습니다.'},
  {...monitor,text:'세계 대두 재고가 부족하므로 공급사 견적을 점검하십시오.'},
  {...monitor,text:'세계 대두 재고가 999 천 MT 감소하므로 가격은 하락할 수 있습니다.'},
  {...monitor,text:'2027/28년 세계 기말재고 전망 수정 방향을 확인하십시오.'},
  {...monitor,text:'세계 기말재고 전망 124278 천 MT를 확인하십시오.'}, // numeric assertions belong in bound fact segments
  {...monitor,text:'브라질 대두 기말재고 전망 수정 방향을 점검 바랍니다.'},
  {...offer,text:'11월 선적 FOB 가격은 하락했으므로 공급사 견적을 비교 바랍니다.'},
  {...offer,text:'12월 선적 FOB 오퍼와 실제 공급사 견적을 비교 바랍니다.'},
  {...offer,text:'현재 실제 조달 원가 하락을 고려할 때 공급사 견적을 점검 바랍니다.'},
  {...offer,text:'FOB 오퍼 비교로 반드시 구매 원가 하락이 보장됩니다.'},
  claim('세계 대두 소비 전망으로 주요 수입국의 착유 수요를 점검 바랍니다.','psd-125','consumption'),
  {...production,support:[{evidenceId:production.evidenceIds[0],aspect:'weather-signal'}]},
  {...monitor,support:[]},
 ];for(const c of negative)assert.ok(verdict(c).issues.length,c.text);
 // Independent failures accumulate even when no role expression is recognized.
 const malformed=claim('세계 기말재고 999 천 MT 감소가 확정되었습니다.','psd-28','inventory-level','conditional');const all=verdict(malformed).issues;for(const issue of ['unqualified-factual-or-predictive-statement','unqualified-consequence','claim-evidence-metric-mismatch:inventory','unsupported-structured-claim-support','unsupported-number-or-allocation'])assert.ok(all.includes(issue),JSON.stringify(all));
 const assembled=materializeClaimText(original,packet,now);let boundFacts=0;for(const c of assembled.evidenceClaims)for(const s of c.segments)if(s.kind==='fact'){assert.equal(s.text,fact(s.evidenceIds[0]).text);boundFacts++;}assert.equal(boundFacts,10);
 const originalIssues=issueList(original);for(const issue of ['unsupported-weather-crop-response:bullishFactors.1','point-weather-regional-generalization:bullishFactors.1','planting-regional-scope-mismatch:bearishFactors.1'])assert.ok(originalIssues.includes(issue));assert(!originalIssues.some((i:string)=>/:(bearishFactors\.0|watchItems\.1)$/.test(i)));
 // A NEW labeled in-memory mock replaces only the two unsupported implications.
 // The original response, facts and all evidence remain immutable.
 const mock=structuredClone(original);Object.assign(segment(mock,'bullishFactors.1'),{kind:'recommendation',text:'브라질 마투그로수 대표 격자의 고온 선별 신호를 확인하고 현지 작황 자료를 추가로 점검하십시오.'});Object.assign(segment(mock,'bearishFactors.1'),{kind:'recommendation',text:'브라질 마토그로소 파종 진척과 5년 평균 비교를 추적하며 실제 공급사 오퍼를 검토하십시오.'});const valid=parse(mock);assert.equal(valid.status,'live');
 for(const mutate of [(b:any)=>{segment(b,'watchItems.1').evidenceIds=['invented'];},(b:any)=>{segment(b,'watchItems.1').support=[];},(b:any)=>{b.evidenceClaims[0].segments[0].text='999 USD/MT';},(b:any)=>{segment(b,'bearishFactors.0').text=production.text.replace('2026/27','2027/28');}]){const bad=structuredClone(mock);mutate(bad);assert.throws(()=>parse(bad));}
 persistAnalysisSnapshot(out,'soybean','OFFLINE-MOCK-typed-reasoning',{success:true,testOnly:true,data:valid});const html=renderToStaticMarkup(<AiRecommendation commodityId="soybean" executiveSummary={valid.executiveSummary} recommendedCoverage={valid.deskRecommendation} bullishFactors={valid.bullishFactors} bearishFactors={valid.bearishFactors} watchItems={valid.watchItems} researchSources={valid.sources} researchStatus="cached" researchModel="OFFLINE-MOCK-NOT-GEMINI"/>);assert.ok(html.includes('USDA'));assert.ok(html.includes('분할'));assert.ok(!html.includes('NaN'));
 const previousReplays=[];for(const id of ['standalone-soybean-0b72187f5350','standalone-soybean-8af7a300f3d8','standalone-soybean-3897915495e6','analysis-recovery-palm-2f654d767230','analysis-recovery-palm-a1128feff43d','analysis-recovery-palm-250269cc4217']){const p='.rms-stage3/diagnostics/'+id+'-1-'+(id.startsWith('analysis')?'palm-oil':'soybean')+'.json',r=JSON.parse(fs.readFileSync(p,'utf8'));let issues:string[]=[];assert.throws(()=>parseGroundedAnalysis(r.response,r.model,new Date(r.recordedAt),r.request.evidence),(e:any)=>{issues=e.issues;return issues.some((i:string)=>/unsupported|unmapped-material/.test(i));});previousReplays.push({id,issues});}
 for(const id of ['wheat','corn','tapioca-starch']){const saved=JSON.parse(fs.readFileSync('.rms-stage3/snapshots/analysis-'+id+'.json','utf8'));assert.ok(saved.payload.data.executiveSummary);}
 assert.deepEqual(hashes(),before);assert.equal(fs.existsSync('.rms-stage3/snapshots/analysis-soybean.json'),soybeanExisted,'existing approved snapshot presence is unchanged');
 fs.writeFileSync(out+'/results.json',JSON.stringify({paidCalls:0,originalRun:d.runId,originalIssues,twoOriginalClaimsPass:true,boundFacts,correctedMockPass:true,isolatedPersistence:true,rendered:true,positiveCases:positive.length,negativeCases:negative.length,independentFailures:all,previousReplays},null,2));fs.writeFileSync('/tmp/rms-typed-reasoning-result',out);console.log('PASS: typed roles, qualified forecast causal interpretation, monitoring/comparison without prescribed endings; all independent diagnostics; fifth original rejected for point-weather/crop-response and South America scope; corrected mock validates, persists and renders ONLY offline. '+out);
}finally{clock.timers.reset();globalThis.fetch=native;}
