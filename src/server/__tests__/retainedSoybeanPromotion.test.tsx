/** OFFLINE ONLY. All approvals, operations and snapshots live in temporary roots. */
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {reviewRetainedSoybeanPromotion,approveRetainedSoybeanPromotion,promoteRetainedSoybeanResponse,retainedPromotionPreflight,RETAINED_SOYBEAN_RUN,RETAINED_PROMOTION_APPROVAL,RETAINED_REVIEW_SHA256} from '../retainedSoybeanPromotion.ts';
import {acquirePaidLease} from '../paidJobLease.ts';import {GoogleGenAI} from '../paidGeminiGuard.ts';
import {withAuthorizedStage3Run} from '../stage3Runtime.ts';import AiRecommendation from '../../components/AiRecommendation.tsx';
import {RMS_PROCUREMENT_CONDITION} from '../../utils/rmsProcurementCondition.ts';

const production=process.cwd(),native=globalThis.fetch,temp=fs.mkdtempSync(path.join(os.tmpdir(),'rms-retained-promotion-OFFLINE-')),productionSoybeanExists=fs.existsSync('.rms-stage3/snapshots/analysis-soybean.json');
const protectedFiles=['standalone-analysis.json','usage.jsonl','paid-requests.jsonl','settings.json',...fs.readdirSync('.rms-stage3/diagnostics').map(n=>'diagnostics/'+n),...fs.readdirSync('.rms-stage3/snapshots').map(n=>'snapshots/'+n)].filter(p=>fs.statSync('.rms-stage3/'+p).isFile());
const hash=(p:string)=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');const productionHashes=protectedFiles.map(p=>hash('.rms-stage3/'+p));
let serial=0,network=0;globalThis.fetch=async()=>{network++;throw Error('NO NETWORK OR GEMINI ALLOWED');};
function setup(){
 const root=path.join(temp,String(++serial)),r=path.join(root,'.rms-stage3');fs.mkdirSync(r,{recursive:true});
 for(const file of ['standalone-analysis.json','paid-requests.jsonl','usage.jsonl','settings.json'])fs.copyFileSync(path.join(production,'.rms-stage3',file),path.join(r,file));
 fs.cpSync(path.join(production,'.rms-stage3/retained-response-review'),path.join(r,'retained-response-review'),{recursive:true});
 fs.mkdirSync(path.join(r,'diagnostics'));fs.copyFileSync(path.join(production,'.rms-stage3/diagnostics',RETAINED_SOYBEAN_RUN+'-1-soybean.json'),path.join(r,'diagnostics',RETAINED_SOYBEAN_RUN+'-1-soybean.json'));
 process.env.RMS_ANALYSIS_RECOVERY_ROOT=root;process.env.RMS_STAGE3_RUNTIME_ROOT=root;return {root,r,auth:'OFFLINE-retained-authorization-'+serial};
}
function approve(auth:string){const p=reviewRetainedSoybeanPromotion();return approveRetainedSoybeanPromotion(RETAINED_PROMOTION_APPROVAL,auth,RETAINED_REVIEW_SHA256,p.review.qualificationsSha256,'Explicit OFFLINE temporary promotion review acknowledgement. No production approval.');}
try{
 {const {root,r,auth}=setup();const review=reviewRetainedSoybeanPromotion();assert.equal(review.report.generatedAt,'2026-10-21T06:04:07.823Z');
  assert.throws(()=>promoteRetainedSoybeanResponse(RETAINED_PROMOTION_APPROVAL,auth),/ENOENT/);
  assert.throws(()=>approveRetainedSoybeanPromotion('soybean-publisher-search-v1',auth,RETAINED_REVIEW_SHA256,review.review.qualificationsSha256,'OFFLINE authorization'),/authorization/);
  assert.throws(()=>approveRetainedSoybeanPromotion(RETAINED_PROMOTION_APPROVAL,auth,RETAINED_REVIEW_SHA256,'wrong','OFFLINE explicit review acknowledgement'),/acknowledge/);
  const old=protectedFiles.slice(0,4).map(p=>hash(path.join(r,p)));approve(auth);
  assert.throws(()=>approve(auth),/EEXIST/);
  const release=acquirePaidLease('analysis-job','OFFLINE-concurrent');assert.throws(()=>promoteRetainedSoybeanResponse(RETAINED_PROMOTION_APPROVAL,auth),/Another paid/);release();
  const request=acquirePaidLease('request','OFFLINE-outstanding');assert.throws(()=>promoteRetainedSoybeanResponse(RETAINED_PROMOTION_APPROVAL,auth),/Outstanding/);request();
  const result=promoteRetainedSoybeanResponse(RETAINED_PROMOTION_APPROVAL,auth);assert.equal(result.geminiHttpAttempts,0);
  const saved=JSON.parse(fs.readFileSync(path.join(r,'snapshots/analysis-soybean.json'),'utf8'));
  assert.equal(saved.runId,RETAINED_SOYBEAN_RUN);assert.equal(saved.sourceStatus,'requires-human-review');
  assert.equal(saved.payload.data.generatedAt,review.review.originalGeneratedAt);assert.equal(saved.promotionAudit.originalGeneratedAt,review.review.originalGeneratedAt);
  assert(Date.parse(saved.promotionAudit.promotedAt)>Date.parse(saved.payload.data.generatedAt));
  assert.deepEqual(saved.promotionAudit.qualifications,review.review.qualifications);
  assert.equal(saved.promotionAudit.responseSha256,review.review.responseSha256);
  assert.equal(saved.promotionAudit.groundingSha256,review.review.groundingSha256);
  assert.equal(saved.promotionAudit.sourceReceipts.length,6);
  assert.equal(hash(path.join(r,'snapshots/analysis-soybean.json')),result.saved.sha256);
  assert.deepEqual(protectedFiles.slice(0,4).map(p=>hash(path.join(r,p))),old,'Paid history/settings must be byte-identical');
  const d=JSON.parse(fs.readFileSync(path.join(r,'diagnostics',RETAINED_SOYBEAN_RUN+'-1-soybean.json'),'utf8')),original=JSON.parse(d.response.text);
  for(const k of Object.keys(original))assert.deepEqual(saved.payload.data[k],original[k]);
  const html=renderToStaticMarkup(<AiRecommendation commodityId="soybean" researchStatus="cached" recommendedCoverage={saved.payload.data.deskRecommendation} executiveSummary={saved.payload.data.executiveSummary} bullishFactors={saved.payload.data.bullishFactors} bearishFactors={saved.payload.data.bearishFactors} watchItems={saved.payload.data.watchItems} researchSources={saved.payload.data.sources}/>);
  assert(!html.includes(RMS_PROCUREMENT_CONDITION));assert(!html.includes('RMS 구매 조건:'));for(const s of saved.payload.data.sources)assert(html.includes(s.url));
  const snapshotHash=hash(path.join(r,'snapshots/analysis-soybean.json'));
  assert.throws(()=>promoteRetainedSoybeanResponse(RETAINED_PROMOTION_APPROVAL,auth),/snapshot|attempted/);
  assert.throws(()=>approve('OFFLINE-different-new-authorization'),/snapshot|attempted/);
  assert.equal(hash(path.join(r,'snapshots/analysis-soybean.json')),snapshotHash);
  // A promotion context has no paid capability and does not fabricate usage.
  withAuthorizedStage3Run({runId:'OFFLINE-no-paid-capability',permitted:false,attempts:0,successfulCalls:0,maxCalls:0,estimatedUsd:0,maxEstimatedUsd:0},()=>assert.throws(()=>new GoogleGenAI({apiKey:'OFFLINE'}),/blocked outside/));
  fs.writeFileSync(root+'/render.html',html);
 }
 for(const kind of ['diagnostic','receipt','manifest','run','events']){
  const {r,auth}=setup();approve(auth);
  const file=kind==='diagnostic'?path.join(r,'diagnostics',RETAINED_SOYBEAN_RUN+'-1-soybean.json'):kind==='receipt'?path.join(r,'retained-response-review/soybean-eighth/source-0.html'):kind==='manifest'?path.join(r,'retained-response-review/soybean-eighth/manifest.json'):kind==='run'?path.join(r,'standalone-analysis.json'):path.join(r,'paid-requests.jsonl');
  fs.appendFileSync(file,kind==='receipt'?'CORRUPTED':' ');
  // Whitespace is enough for byte-pinned diagnostic/manifest; run/event records
  // use semantic hashes, so alter their retained meaning instead.
  if(kind==='run'){const v=JSON.parse(fs.readFileSync(file,'utf8'));v.runs.find((r:any)=>r.runId===RETAINED_SOYBEAN_RUN).status='completed';fs.writeFileSync(file,JSON.stringify(v));}
  if(kind==='events'){const rows=fs.readFileSync(file,'utf8').trim().split('\n').map(s=>JSON.parse(s));rows.find((r:any)=>r.runId===RETAINED_SOYBEAN_RUN&&r.phase==='completed').httpAttempts=2;fs.writeFileSync(file,rows.map(v=>JSON.stringify(v)).join('\n'));}
  assert.throws(()=>promoteRetainedSoybeanResponse(RETAINED_PROMOTION_APPROVAL,auth),/integrity|provenance/);assert(!fs.existsSync(path.join(r,'snapshots/analysis-soybean.json')));
 }
 for(const kind of ['expired','wrong-purpose']){const {r,auth}=setup();approve(auth);const p=path.join(r,'retained-promotion-approvals',auth+'.json'),g=JSON.parse(fs.readFileSync(p,'utf8'));if(kind==='expired')g.expiresAt='2026-01-01T00:00:00Z';else g.purpose='paid-generation';fs.writeFileSync(p,JSON.stringify(g));assert.throws(()=>retainedPromotionPreflight(RETAINED_PROMOTION_APPROVAL,auth),/Invalid/);}
 {const {r,auth}=setup();approve(auth);fs.writeFileSync(path.join(r,'snapshots'),'OFFLINE directory obstruction');assert.throws(()=>promoteRetainedSoybeanResponse(RETAINED_PROMOTION_APPROVAL,auth));assert(fs.existsSync(path.join(r,'retained-promotions',RETAINED_SOYBEAN_RUN+'.json.result.json')));assert.throws(()=>promoteRetainedSoybeanResponse(RETAINED_PROMOTION_APPROVAL,auth),/already attempted/);}
 // Actual owner HTTP gate, entirely in process. No listening server or network.
 {const {root,r,auth}=setup();process.chdir(root);try{
  const {createStage3Gateway}=await import('../stage3DailyUpdates.ts');const gateway=createStage3Gateway();
  const call=(method:string,headers:any={},remote='127.0.0.1',url='/api/rms/control/promote-retained-soybean')=>{let body:any;const res:any={statusCode:0,setHeader(){},end(s:string){body=JSON.parse(s);}};gateway({url,method,headers,socket:{remoteAddress:remote}} as any,res,()=>{throw Error('Unexpected route');});return {code:res.statusCode,body};};
  assert.equal(call('POST').code,403);const admin=fs.readFileSync(path.join(r,'admin-token'),'utf8').trim();const headers={'x-rms-stage3-admin':admin,'x-rms-promotion-approval':RETAINED_PROMOTION_APPROVAL,'x-rms-authorization-id':auth};
  assert.equal(call('GET',headers).code,403);assert.equal(call('POST',headers,'192.0.2.1').code,403);assert.equal(call('POST',headers).code,409);
  assert.equal(call('POST',headers,'127.0.0.1','/api/rms/control/promote-retained-soybean?commodity=corn').code,409);
  approve(auth);assert.equal(call('POST',headers).code,200);assert.equal(call('POST',headers).code,409);
 }finally{process.chdir(production);}}
 assert.equal(network,0);assert.deepEqual(protectedFiles.map(p=>hash(path.join(production,'.rms-stage3',p))),productionHashes);
 assert.equal(fs.existsSync(path.join(production,'.rms-stage3/snapshots/analysis-soybean.json')),productionSoybeanExists);
 fs.writeFileSync(temp+'/results.json',JSON.stringify({paidCalls:0,network:0,productionApprovals:0,productionSnapshot:false,authorization:true,provenance:true,duplicateRejection:true,readback:true,rendering:true,gateway:true},null,2));
 console.log('PASS retained Soybean promotion: pinned evidence, separate approval/consumption, original timestamp/run, no Gemini, global locks, exclusive persistence/readback, negatives and rendering. '+temp);
}finally{process.chdir(production);globalThis.fetch=native;delete process.env.RMS_ANALYSIS_RECOVERY_ROOT;delete process.env.RMS_STAGE3_RUNTIME_ROOT;}
