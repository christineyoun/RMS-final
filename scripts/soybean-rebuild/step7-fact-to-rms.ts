/** STEP 7-2: atomic LOCAL preview update, with explicit review-quality warnings. */
import fs from 'node:fs';import path from 'node:path';
import {commodityFromArgv,resultFolder} from './commodity-config.ts';
import {buildFinalData,auditFinalResult} from './step7-core.ts';
import {adaptStep7ToRms} from './step7-rms-adapter.ts';
import {sha} from './step7-fact-core.ts';
const commodity=commodityFromArgv(),dir=resultFolder(commodity);
const cloudStep7Approved=process.env.CLOUD_RUN_JOB&&process.env.RMS_CLOUD_FREE_JOB==='1'&&process.env.RMS_STEP7_CLOUD_EXECUTION==='YES'&&!process.env.K_SERVICE;
if((process.env.NODE_ENV==='production'||process.env.K_SERVICE||process.env.CLOUD_RUN_JOB)&&!cloudStep7Approved)throw Error('STEP7-2 restricted to explicitly approved private job/local');
const reviews=fs.readdirSync(dir).filter(x=>/^step7-fact-verified-.*\.json$/.test(x)).sort();
const reviewName=reviews.at(-1);if(!reviewName)throw Error('STEP7-1 result not found. Existing local card unchanged.');
const review=JSON.parse(fs.readFileSync(path.join(dir,reviewName),'utf8'));
if(review.stage!=='step7-fact-verification'||!['verified','needs-source-repair'].includes(review.status)||review.commodity!==commodity||
 review.approvalScope!=='local-RMS-preview-only'||review.approvedForCloudPublication!==false||!review.result||
 !/^step7-final-[\w.-]+\.json$/.test(review.sourceFile))throw Error('Invalid review provenance. Existing card retained.');
const originalBytes=fs.readFileSync(path.join(dir,review.sourceFile));
if(sha(originalBytes)!==review.originalSha256)throw Error('Original STEP7 report changed; existing card retained.');
const original=JSON.parse(originalBytes.toString('utf8'));
if(original.commodity!==commodity||original.stage!=='final-market-outlook-and-procurement')throw Error('Wrong original stage/commodity');
const latestFinal=fs.readdirSync(dir).filter(x=>/^step7-final-.*\.json$/.test(x)).sort().at(-1);
if(latestFinal!==review.sourceFile)throw Error('A newer STEP7 exists: do not replace with stale report');
const evidence=buildFinalData(dir);
for(const [k,v] of Object.entries(evidence.files))if(original.inputFiles?.[k]!==v)throw Error('Evidence provenance changed: '+k);
if(evidence.commodity!==commodity||evidence.route!==original.route)throw Error('Evidence mismatch');
const audit=auditFinalResult(review.result,evidence);
const soft=(s:string)=>s.startsWith('numeric-buy-or-hedge-price')||s.startsWith('purchase-percentage-or-percentage-trigger');
const critical=audit.reviewReasons.filter((s:string)=>!soft(s));
if(critical.length){
 // Keep prior good card. This is an upstream data-integrity failure, NOT a reviewer rejecting a phrase.
 console.warn('[STEP 7-2] DATA INTEGRITY WARNING: latest content cannot be safely mapped:',critical.join('; '));
 console.warn('[STEP 7-2] Existing local card retained; no fabricated source IDs or broken JSON published.');
 process.exit(0);
}
const overviewTakeawayReviewed=review.reviewComplete===true&&review.review?.overviewTakeawayStatus==='supported'&&
 JSON.stringify(original.result?.overviewTakeaway)===JSON.stringify(review.result.overviewTakeaway)&&
 ['headline','marketOutlook','bullishFactors','bearishFactors'].every(field=>
   JSON.stringify(original.result?.[field])===JSON.stringify(review.result[field]));
const validated={...original,status:'report-created',result:review.result,audit,recordedAt:original.recordedAt,overviewTakeawayReviewed};
const transformed=adaptStep7ToRms(validated,evidence.sources);
const receipt={stage:'step7-local-ui-preview',approvedForPublication:false,
 sourceResultFile:review.sourceFile,verifiedResultFile:reviewName,originalSha256:review.originalSha256,
 commodity,createdAt:new Date().toISOString(),data:transformed.data,
 warnings:[...transformed.warnings,...(review.editErrors||[]),...audit.reviewReasons.filter(soft)],
 factReviewQuality:review.reviewQuality||'legacy-review',factReviewComplete:review.reviewComplete??true,
 factCorrections:review.appliedFixes?.length??0,
 referencedSourceIds:transformed.references,sourceCounts:evidence.counts};
const output=path.join(dir,`step7-rms-preview-${commodity}.json`);
if(fs.existsSync(output)){
 try{const existing=JSON.parse(fs.readFileSync(output,'utf8'));
   if(existing?.verifiedResultFile===reviewName&&existing?.originalSha256===review.originalSha256){
     console.log('[STEP 7-2] Already applied this report. No changes.');process.exit(0);
   }
 }catch{console.warn('[STEP 7-2] Existing preview malformed; preserving it, no overwrite');process.exit(0);}
}
if(process.argv.includes('--inspect')){
 console.log('[STEP 7-2] READY, local report transform valid. No files changed.');
 console.log('[STEP 7-2] Review quality:',receipt.factReviewQuality,'/ corrections:',receipt.factCorrections,'/ sources:',transformed.data.sources.length);
 process.exit(0);
}
if(!process.argv.includes('--apply-local'))throw Error('Require --inspect or --apply-local. Cloud publication unsupported.');
const temp=output+`.pending-${process.pid}-${Date.now()}`;
fs.writeFileSync(temp,JSON.stringify(receipt,null,2),{flag:'wx',mode:0o600});
try{
 if(fs.existsSync(output)){
   const backup=path.join(dir,`step7-rms-preview-backup-${commodity}-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
   fs.copyFileSync(output,backup,fs.constants.COPYFILE_EXCL);
   console.log('[STEP 7-2] Previous local card backed up:',path.basename(backup));
 }
 fs.renameSync(temp,output);
}catch(e){if(fs.existsSync(temp))fs.unlinkSync(temp);throw e;}
console.log('[STEP 7-2] LOCAL RMS CARD UPDATED:',path.basename(output));
console.log('[STEP 7-2] Review quality:',receipt.factReviewQuality,'/ corrected fragments:',receipt.factCorrections);
console.log('[STEP 7-2] NO Cloud Run, no production publication.');
