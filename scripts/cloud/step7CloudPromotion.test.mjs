/** Offline integration guard for the real cloud card promotion code. No GCS / Gemini. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {promoteStep7CloudCard} from './step7CloudPromotion.ts';
import {readCloudStep7Card} from '../../src/server/step7CloudCard.ts';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-step7-cloud-guard-'));
try{
 const id='palm-oil',day='2026-11-02',dir=path.join(root,'.rms-research',id,'daily',day);
 fs.mkdirSync(dir,{recursive:true});
 const originalFile='step7-final-2026-11-02T00-00-00-000Z.json';
 const original=Buffer.from(JSON.stringify({stage:'final-market-outlook-and-procurement',commodity:id}));
 fs.writeFileSync(path.join(dir,originalFile),original);
 const digest=crypto.createHash('sha256').update(original).digest('hex');
 const reviewFile='step7-fact-verified-2026-11-02T00-01-00-000Z.json';
 const review={stage:'step7-fact-verification',sourceFile:originalFile,originalSha256:digest,commodity:id,
  status:'verified',completionPolicy:'best-effort-v2',approvalScope:'local-RMS-preview-only',
  approvedForCloudPublication:false,criticalAuditReasons:[],reviewQuality:'review-incomplete',reviewComplete:false};
 fs.writeFileSync(path.join(dir,reviewFile),JSON.stringify(review));
 const data={rmsStep7Preview:true,status:'cached',deskRecommendation:'검토',executiveSummary:'팜유 시장 전망',
  generatedAt:'2026-11-02T00:00:00.000Z',purchaseActions:['오퍼 비교'],bullishFactors:[],bearishFactors:[],watchItems:[],
  sources:[{title:'USDA',url:'https://www.usda.gov/report'}],
  procurementRiskPreview:{commodityId:id,level:'주의',summarySentenceKo:'검증된 공급 차질 가능성을 주의합니다.',
    evidence:[{source:'USDA',url:'https://www.usda.gov/report',text:'공급 자료',date:'2026-11-02'}]}};
 const preview={stage:'step7-local-ui-preview',approvedForPublication:false,commodity:id,verifiedResultFile:reviewFile,
  originalSha256:digest,factReviewQuality:'review-incomplete',factReviewComplete:false,data};
 const previewFile=path.join(dir,`step7-rms-preview-${id}.json`);fs.writeFileSync(previewFile,JSON.stringify(preview));
 const ok=await promoteStep7CloudCard(id,day,root);
 assert.equal(ok.action,'published');assert.equal(readCloudStep7Card(id,root).executiveSummary,'팜유 시장 전망');
 assert.equal(readCloudStep7Card(id,root).factReviewComplete,false);
 const originalRisk=preview.data.procurementRiskPreview;
 delete preview.data.procurementRiskPreview;
 fs.writeFileSync(previewFile,JSON.stringify(preview));
 assert.equal((await promoteStep7CloudCard(id,day,root)).action,'retained-previous');
 assert.deepEqual(readCloudStep7Card(id,root).procurementRiskPreview,originalRisk);
 preview.data.procurementRiskPreview=originalRisk;

 preview.data.sources[0].url='http://127.0.0.1/not-allowed';fs.writeFileSync(previewFile,JSON.stringify(preview));
 assert.equal((await promoteStep7CloudCard(id,day,root)).action,'retained-previous');
 assert.equal(readCloudStep7Card(id,root).executiveSummary,'팜유 시장 전망');
 console.log('PASS: reviewed/incomplete card promoted; unsafe source blocked; last approved card retained. No API calls.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
