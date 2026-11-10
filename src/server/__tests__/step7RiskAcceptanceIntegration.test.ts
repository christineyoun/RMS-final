import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readStep7LocalPreview} from '../step7LocalPreview.ts';
import {hasAcceptedStep7ProcurementRisk} from '../step7CloudCard.ts';
import {validatedLocalCard,validatedLocalRiskCard} from '../../../scripts/soybean-rebuild/step7-local-card-status.mjs';
const ids=['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'];
const publisher='https://www.publisher.org/reports/verified';
function data(commodity:string,withRisk:boolean){
  return {rmsStep7Preview:true,status:'cached',deskRecommendation:'Source-grounded recommendation',executiveSummary:'Evidence-grounded market analysis',
  generatedAt:'2026-11-06T01:00:00.000Z',purchaseActions:['Review genuine offers'],bullishFactors:[],bearishFactors:[],watchItems:[],
  sources:[{title:'Publisher',url:publisher}],
  ...(withRisk?{procurementRiskPreview:{commodityId:commodity,level:'주의',summarySentenceKo:'Source-backed physical supply assessment',
    evidence:[{text:'Verified original excerpt',date:'2026-11-05',url:publisher,source:'Publisher'}]}}:{})};
}
function localReceipt(id:string,withRisk:boolean){return {stage:'step7-local-ui-preview',approvedForPublication:false,commodity:id,data:data(id,withRisk)};}
function put(file:string,obj:any){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(obj));}
function fixture(dir:string,id:string,withRisk:boolean){
 const originalFile='step7-final-fixture.json',bytes=Buffer.from(JSON.stringify({stage:'final-market-outlook-and-procurement',commodity:id}));
 const hash=createHash('sha256').update(bytes).digest('hex'),reviewFile='step7-fact-verified-fixture.json';
 fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,originalFile),bytes);
 put(path.join(dir,reviewFile),{stage:'step7-fact-verification',status:'verified',completionPolicy:'best-effort-v2',approvalScope:'local-RMS-preview-only',
  approvedForCloudPublication:false,criticalAuditReasons:[],reviewQuality:'complete',reviewComplete:true,
  sourceFile:originalFile,originalSha256:hash,commodity:id});
 put(path.join(dir,`step7-rms-preview-${id}.json`),{
  ...localReceipt(id,withRisk),verifiedResultFile:reviewFile,originalSha256:hash,factReviewQuality:'complete',factReviewComplete:true});
}

test('all 8 require a model-authored and publisher-backed SCM risk for full-system completion',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-risk-gate-'));
 try{
  for(const id of ids){
   const dir=path.join(root,'.rms-research',id,'daily','2026-11-06');fixture(dir,id,false);
   assert.equal(validatedLocalCard(dir,id),true);
   assert.equal(await validatedLocalRiskCard(dir,id),false);
   assert.equal(hasAcceptedStep7ProcurementRisk(data(id,false),id),false);
   fixture(dir,id,true);
   assert.equal(await validatedLocalRiskCard(dir,id),true);
   assert.equal(hasAcceptedStep7ProcurementRisk(data(id,true),id),true);
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('local viewer retains an earlier whole reviewed analysis with risk instead of a newer riskless preview',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-risk-display-'));
 const old={local:process.env.RMS_STEP7_LOCAL_PREVIEW,node:process.env.NODE_ENV,readonly:process.env.RMS_PUBLIC_READONLY};
 try{
  process.env.RMS_STEP7_LOCAL_PREVIEW='1';process.env.NODE_ENV='test';delete process.env.RMS_PUBLIC_READONLY;
  for(const id of ids){
   const base=id==='soybean'?'.rms-soybean-rebuild':`.rms-research/${id}`;
   put(path.join(root,base,`step7-rms-preview-${id}.json`),localReceipt(id,false));
   put(path.join(root,base,'daily','2026-11-05',`step7-rms-preview-${id}.json`),localReceipt(id,true));
   assert.equal(readStep7LocalPreview(id,'127.0.0.1',root)?.procurementRiskPreview?.commodityId,id);
   assert.equal(readStep7LocalPreview(id,'10.0.0.1',root),null);
  }
 }finally{
  fs.rmSync(root,{recursive:true,force:true});
  for(const [k,v] of Object.entries({RMS_STEP7_LOCAL_PREVIEW:old.local,NODE_ENV:old.node,RMS_PUBLIC_READONLY:old.readonly})){
   if(v===undefined)delete process.env[k];else process.env[k]=v;
  }
 }
});

test('paid STEP7 worker does not bill or falsely declare done for already reviewed riskless preview',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-risk-worker-'));const id='potato-starch',day='2026-11-06';
 try{
  const dir=path.join(root,'.rms-research',id,'daily',day);fixture(dir,id,false);
  const script=new URL('../../../scripts/cloud/step7PaidLocalWorker.mjs',import.meta.url).pathname;
  // Resolve the ESM loader from this installed RMS project, not from the temporary fixture cwd.
  // A bare `--import tsx` would be resolved relative to cwd=root and fail before the worker executes.
  const tsLoader=process.execArgv.includes('--experimental-strip-types')
    ? ['--experimental-strip-types']
    : ['--import',import.meta.resolve('tsx')];
  const env={...process.env,RMS_RESEARCH_RUN_DAY:day,RMS_STEP7_SCHEDULE_MODE:'paid-local',RMS_STEP7_PAID_APPROVED:'YES',
   NODE_ENV:'test',GEMINI_API_KEY:'',GOOGLE_API_KEY:'',RMS_GEMINI_API_KEY:''};
  const result=spawnSync(process.execPath,[...tsLoader,script,'--commodity',id,'--paid-local'],{cwd:root,env,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const line=result.stdout.split('\n').find(s=>s.startsWith('RMS_SCHEDULED_STEP7_JSON='));
  assert.ok(line,result.stdout);
  const summary=JSON.parse(line.slice('RMS_SCHEDULED_STEP7_JSON='.length));
  assert.equal(summary.action,'stop');assert.equal(summary.failureCode,'risk-field-missing');assert.equal(summary.paidCalls,0);
  fixture(dir,id,true);
  const succeeded=spawnSync(process.execPath,[...tsLoader,script,'--commodity',id,'--paid-local'],{cwd:root,env,encoding:'utf8'});
  assert.equal(succeeded.status,0,succeeded.stderr);
  const l=succeeded.stdout.split('\n').find(s=>s.startsWith('RMS_SCHEDULED_STEP7_JSON='));
  assert.equal(JSON.parse(l!.slice('RMS_SCHEDULED_STEP7_JSON='.length)).action,'done');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
