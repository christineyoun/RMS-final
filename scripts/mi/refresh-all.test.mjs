import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {COMMODITIES,businessDaysElapsed,inspectNews,readPublication,makePlan,classifyRefreshOutcome} from './refresh-all-core.mjs';
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'rms-mi-batch-'));
const a=(date,summary='정확하게 확인된 공개 문헌을 바탕으로 수급 변화와 공급 리스크를 설명합니다. '.repeat(4),url='https://publisher.example/source')=>({publishedAt:date,summary,originalUrl:url,sourceName:'Original publisher'});
const write=(root,id,articles)=>{
 const state=path.join(root,'.rms-stage3');fs.mkdirSync(path.join(state,'snapshots','scheduled-content'),{recursive:true});
 const raw=Buffer.from(JSON.stringify({payload:{articles}}));const sha=createHash('sha256').update(raw).digest('hex');
 fs.writeFileSync(path.join(state,'snapshots','scheduled-content',sha+'.json'),raw);
 const manifest=path.join(state,'scheduled-content-current.json');
 const obj=fs.existsSync(manifest)?JSON.parse(fs.readFileSync(manifest,'utf8')):{entries:{}};
 obj.entries['news-'+id]={sha256:sha};fs.writeFileSync(manifest,JSON.stringify(obj));
};
test('all eight commodities are covered without content-specific rules',()=>assert.equal(COMMODITIES.length,8));
test('Friday-to-Monday is one business day; older articles need refresh',()=>{
 assert.equal(businessDaysElapsed('2026-11-06','2026-11-09'),1);
 assert.equal(businessDaysElapsed('2026-11-05','2026-11-09'),2);
 assert.equal(businessDaysElapsed('invalid','2026-11-09'),Infinity);
});
test('complete fresh and editorially balanced set is left untouched; sparse and excessive summaries planned',()=>{
 const good=Array.from({length:4},(_,i)=>a('2026-11-06','공급 수급과 재고 가격 변화를 입증한 기사입니다. '.repeat(9),`https://publisher.example/${i}`));
 assert.equal(inspectNews(good,'2026-11-09').needsRefresh,false);
 assert(inspectNews(good.slice(0,3),'2026-11-09').reasons.includes('fewer-than-four-approved'));
 assert(inspectNews([...good.slice(0,3),a('2026-11-06','시장 자료가 매우 상세합니다. '.repeat(33),'https://publisher.example/4')],'2026-11-09').reasons.includes('summary-overlong'));
});
test('content-addressed publication is checked and never modified by planning',()=>{
 const root=tmp();try{
  write(root,'wheat',[a('2026-11-05')]);const file=path.join(root,'.rms-stage3','scheduled-content-current.json');
  const before=fs.readFileSync(file);
  const p=readPublication(root,'wheat','2026-11-09');
  assert.equal(p.count,1);assert.equal(p.integrity,'ok');assert.equal(p.needsRefresh,true);
  assert.deepEqual(fs.readFileSync(file),before);
  const planned=makePlan(root,'2026-11-09');assert.equal(planned.length,8);
  assert.equal(planned.find(x=>x.commodity==='wheat').decision,'RUN');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('paid-attempt journal makes a commodity ineligible for another paid call today',()=>{
 const root=tmp();try{
  write(root,'soybean',[a('2026-11-05')]);
  const dir=path.join(root,'.rms-stage3','manual-news-paid','2026-11-09');fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'soybean.json'),JSON.stringify({status:'retained-previous',estimatedUsd:0.1}));
  const plan=makePlan(root,'2026-11-09');assert.equal(plan.find(p=>p.commodity==='soybean').decision,'SKIP-ALREADY-ATTEMPTED');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('corrupt existing snapshot fails closed before paid approval',()=>{
 const root=tmp();try{
  write(root,'palm-oil',[a('2026-11-05')]);
  const state=path.join(root,'.rms-stage3');const manifest=JSON.parse(fs.readFileSync(path.join(state,'scheduled-content-current.json')));
  fs.writeFileSync(path.join(state,'snapshots','scheduled-content',manifest.entries['news-palm-oil'].sha256+'.json'),'{"tampered":true}');
  assert.equal(makePlan(root,'2026-11-09').find(p=>p.commodity==='palm-oil').decision,'BLOCK-INTEGRITY');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('normal no-new-content retention continues rather than stopping later commodities',()=>{
 assert.equal(classifyRefreshOutcome(1,{exists:true,status:'retained-previous',reason:'no-new-or-updated-verified-content'}),'CONTINUE-RETAINED');
});
test('errors, inconsistent exits and missing journals always stop',()=>{
 for(const j of [
  {exists:true,status:'retained-previous',reason:'generation-verification-or-publication-failed'},
  {exists:true,status:'failed',reason:'generation-verification-or-publication-failed'},
  {exists:true,status:'unreadable'},
  {exists:false}
 ])assert.equal(classifyRefreshOutcome(1,j),'STOP');
 assert.equal(classifyRefreshOutcome(0,{exists:true,status:'retained-previous',reason:'no-new-or-updated-verified-content'}),'STOP');
 assert.equal(classifyRefreshOutcome(1,{exists:true,status:'published'}),'STOP');
 assert.equal(classifyRefreshOutcome(0,{exists:true,status:'published'}),'CONTINUE');
});
