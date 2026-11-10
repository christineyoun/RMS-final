import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {finishFactReview} from './step7-fact-core.ts';
import {validatedLocalCard} from './step7-local-card-status.mjs';
const sources=[{id:'G001',grade:'A',title:'Producer',url:'https://example.org/report',citationUrl:null,date:'2026-11-01',
 excerpts:[{id:'G001-E1',topic:'crop',text:'Production forecast remains preliminary.'}]}];
function report(){return {
 headline:'팜유 수급 불확실성',marketOutlook:'팜유 가격 변동성은 높습니다. 2026년 생산량 4천만 톤 확정으로 공급 확대를 예상합니다. 수급 상황을 점검해야 합니다.',
 procurementStrategy:'팜유 공급사의 실제 오퍼와 선적 상황을 대조하고 분할 구매합니다.',
 bullishFactors:[{text:'생산 전망 관련 불확실성',sourceIds:['G001']}],
 bearishFactors:[{text:'기존 재고 완충 가능성',sourceIds:['G001']}],
 monitoringFactors:[{text:'팜유 재고 통계 발표',sourceIds:['G001']}],
 sourceIds:['G001'],uncertainties:[],
 claimEvidence:[1,2,3].map(i=>({claim:'작황 관련 근거 '+i,sourceIds:['G001'],excerptIds:['G001-E1'],evidenceType:'direct'}))};}
test('MAX_TOKENS reviewer: only unsafe production finality is conservatively softened',()=>{
 const saved=report();const result=finishFactReview(saved,null,sources,'palm-oil');
 assert.equal(result.reviewComplete,false);assert.equal(result.quality,'review-incomplete');
 assert.equal(result.publishable,true,JSON.stringify(result.critical));
 assert.match(result.result.marketOutlook,/팜유 가격 변동성은 높습니다/);
 assert.match(result.result.marketOutlook,/수급 상황을 점검해야 합니다/);
 assert.doesNotMatch(result.result.marketOutlook,/4천만 톤 확정/);
 assert.deepEqual(result.result.procurementStrategy,saved.procurementStrategy);
 assert(result.fixes.some(x=>x.kind==='cautious-finality-fallback'));
});
test('unknown or excluded source ID remains blocking, despite best-effort',()=>{
 const saved=report();saved.sourceIds=['G999'];
 const result=finishFactReview(saved,null,sources,'palm-oil');
 assert.equal(result.publishable,false);assert(result.critical.some(x=>x.includes('source IDs')));
});
test('clean report with unavailable reviewer is still review-incomplete and acceptable',()=>{
 const saved=report();saved.marketOutlook='팜유 공급 여건이 불확실합니다. 원문 발표를 모니터링합니다.';
 const result=finishFactReview(saved,null,sources,'palm-oil');
 assert.equal(result.publishable,true);assert.equal(result.reviewComplete,false);assert.deepEqual(result.result,saved);
});
test('verified + review-incomplete local preview is usable; mismatched / unsafe are not',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'step7-best-effort-test-'));
 try{
  const originalName='step7-final-2026-11-02T00-00-00Z.json';
  fs.writeFileSync(path.join(dir,originalName),JSON.stringify({commodity:'palm-oil',stage:'final-market-outlook-and-procurement'}));
  const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,originalName))).digest('hex');
  const reviewName='step7-fact-verified-2026-11-02T00-00-01Z.json';
  const review={stage:'step7-fact-verification',sourceFile:originalName,originalSha256:hash,commodity:'palm-oil',
   status:'verified',completionPolicy:'best-effort-v2',reviewQuality:'review-incomplete',reviewComplete:false,
   criticalAuditReasons:[],approvalScope:'local-RMS-preview-only',approvedForCloudPublication:false};
  const preview={commodity:'palm-oil',verifiedResultFile:reviewName,originalSha256:hash,
   factReviewComplete:false,factReviewQuality:'review-incomplete',approvedForPublication:false,
   data:{rmsStep7Preview:true,executiveSummary:'검증 미완료 조건 표시'}};
  fs.writeFileSync(path.join(dir,reviewName),JSON.stringify(review));
  fs.writeFileSync(path.join(dir,'step7-rms-preview-palm-oil.json'),JSON.stringify(preview));
  assert.equal(validatedLocalCard(dir,'palm-oil'),true);
  review.criticalAuditReasons=['unknown or excluded source IDs'];
  fs.writeFileSync(path.join(dir,reviewName),JSON.stringify(review));
  assert.equal(validatedLocalCard(dir,'palm-oil'),false);
  review.criticalAuditReasons=[];fs.writeFileSync(path.join(dir,reviewName),JSON.stringify(review));
  preview.factReviewComplete=true;fs.writeFileSync(path.join(dir,'step7-rms-preview-palm-oil.json'),JSON.stringify(preview));
  assert.equal(validatedLocalCard(dir,'palm-oil'),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
