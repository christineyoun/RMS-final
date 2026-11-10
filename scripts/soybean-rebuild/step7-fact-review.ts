import {fileURLToPath} from 'node:url';
/** STEP 7-1: evidence-focused best-effort review. Never aborts an existing valid report for a bad AI edit. */
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {commodityFromArgv,resultFolder} from './commodity-config.ts';
import {buildFinalData,auditFinalResult} from './step7-core.ts';
import {sha,finishFactReview,factReviewPrompt,parseReview} from './step7-fact-core.ts';
const commodity=commodityFromArgv(),dir=resultFolder(commodity),args=process.argv.slice(2);
const inspect=args.includes('--inspect'),verify=args.includes('--verify-paid'),resume=args.includes('--resume');
const retryIncomplete=args.includes('--retry-incomplete-paid');
// STEP71-FIELD-INDEX-FIX-V1
const reapplySaved=args.includes('--reapply-saved');
if(reapplySaved&&!resume)throw Error('--reapply-saved requires --resume');
if(retryIncomplete&&(!verify||!args.includes('--approve-review-paid')))throw Error('--retry-incomplete-paid requires --verify-paid --approve-review-paid');
if([inspect,verify,resume].filter(Boolean).length!==1)throw Error('Choose exactly one: --inspect | --verify-paid | --resume');
if(verify&&!args.includes('--approve-review-paid'))throw Error('--verify-paid requires --approve-review-paid');
const cloudStep7Approved=process.env.CLOUD_RUN_JOB&&process.env.RMS_CLOUD_FREE_JOB==='1'&&process.env.RMS_STEP7_CLOUD_EXECUTION==='YES'&&!process.env.K_SERVICE;
if((process.env.NODE_ENV==='production'||process.env.K_SERVICE||process.env.CLOUD_RUN_JOB)&&!cloudStep7Approved)throw Error('Fact review: private Cloud Run Job only');
const originals=fs.readdirSync(dir).filter(x=>/^step7-final-.*\.json$/.test(x)).sort();const name=originals.at(-1);
if(!name)throw Error('No STEP 7 generated report exists');
const originalBytes=fs.readFileSync(path.join(dir,name)),original=JSON.parse(originalBytes.toString('utf8'));
if(original.commodity!==commodity||original.stage!=='final-market-outlook-and-procurement'||
 !['report-created','report-review-needed'].includes(original.status)||!original.result)
 throw Error('No usable STEP7 report; previous RMS card remains unchanged');
const evidence=buildFinalData(dir);
for(const [k,v] of Object.entries(evidence.files))if(original.inputFiles?.[k]!==v)throw Error('Source provenance mismatch: '+k);
if(evidence.commodity!==commodity||evidence.route!==original.route)throw Error('STEP7 source commodity/route mismatch');
const digest=sha(originalBytes),receipts=fs.readdirSync(dir).filter(x=>/^step7-fact-verified-.*\.json$/.test(x)).sort().reverse();
const latest=receipts.map(n=>{try{return{name:n,record:JSON.parse(fs.readFileSync(path.join(dir,n),'utf8'))};}catch{return null;}})
 .find(x=>x?.record?.sourceFile===name&&x.record.originalSha256===digest);
const audit=auditFinalResult(original.result,evidence);
console.log('[STEP 7-1] Commodity:',commodity,'/ original:',name,'/ original status:',original.status);
console.log('[STEP 7-1] Offline reasons:',JSON.stringify(audit.reviewReasons));
console.log('[STEP 7-1] Existing review:',latest?.name||'none');
if(inspect){console.log('[STEP 7-1] INSPECT ONLY: no API, no writes.');process.exit(0);}
if(reapplySaved&&!latest)throw Error('--reapply-saved needs an existing saved AI review; no paid call made');
if(reapplySaved&&(!latest?.record?.review||!Array.isArray(latest.record.review.issues)))throw Error('--reapply-saved needs a complete stored JSON review, not truncated rawText');
if(!reapplySaved && latest?.record?.status==='verified' && latest.record?.completionPolicy==='best-effort-v2' && latest.record?.reviewComplete===true){
 console.log('[STEP 7-1] Verified completion already saved, no repeat paid call.');
 if(args.includes('--apply-local'))postLocal();
 process.exit(0);
}
if(verify&&latest&&!retryIncomplete){
 console.log('[STEP 7-1] Prior review exists; using stored review at zero API cost.');
}
if(retryIncomplete&&(!latest||latest.record?.reviewComplete===true))throw Error('Explicit retry requires a saved incomplete review');
let review:any=null,rawText='',usageMetadata:any=null,reviewModel='saved',recoveredFrom:string|null=null;
let reviewDiagnostics:any=null;
if(latest&&!retryIncomplete){
 rawText=latest.record.rawText||'';review=latest.record.review||parseReview(rawText);
 recoveredFrom=latest.name;reviewModel=latest.record.reviewModel||'saved';usageMetadata=latest.record.usageMetadata||null;
 reviewDiagnostics=latest.record.reviewDiagnostics||null;
}else if(resume){
 console.warn('[STEP 7-1] No saved AI review. Marking reviewer incomplete and continuing with original report at zero API cost.');
}else {
 reviewModel=process.env.RMS_SOYBEAN_ANALYSIS_MODEL?.trim()||process.env.RMS_SOYBEAN_SEARCH_MODEL?.trim()||'gemini-3.8-flash';
 try {
   if(!process.env.GEMINI_API_KEY){const dotenv=await import('dotenv');dotenv.default.config();}
   const key=process.env.GEMINI_API_KEY?.trim();if(!key)throw Error('GEMINI_API_KEY missing');
   const prompt=factReviewPrompt(commodity,original.result,evidence.sources);
   if(prompt.length>185000)throw Error('Evidence prompt too long; no Gemini call made');
   const marker=path.join(dir,`step7-fact-attempt-${digest.slice(0,20)}${retryIncomplete?'-retry-v1':''}.json`);
   // Create only once: a prior failed request is NEVER silently billed again.
   fs.writeFileSync(marker,JSON.stringify({commodity,sourceFile:name,sha256:digest,time:new Date().toISOString(),status:'reserved-before-paid-call'},null,2),{flag:'wx',mode:0o600});
   const {GoogleGenAI}=await import('@google/genai');
   console.log('[STEP 7-1] One Gemini source review, NO Google Search. Model:',reviewModel);
   const response=await new GoogleGenAI({apiKey:key}).models.generateContent({model:reviewModel,contents:prompt,config:{responseMimeType:'application/json',maxOutputTokens:16000,temperature:0.1}});
   rawText=typeof response.text==='string'?response.text:'';
   review=parseReview(rawText);usageMetadata=response.usageMetadata||null;
   reviewDiagnostics={finishReason:response.candidates?.[0]?.finishReason||null,
     rawTextLength:rawText.length,parseStatus:review?'checked':'invalid-or-incomplete-json'};
   if(!review)console.warn('[STEP 7-1] Gemini response not parseable:',JSON.stringify(reviewDiagnostics));
 }catch(err){
   const safeError=String(err).replace(/AIza[0-9A-Za-z_-]{20,}/g,'[REDACTED_API_KEY]').slice(0,500);
   reviewDiagnostics={parseStatus:'request-or-runtime-error',error:safeError};
   console.warn('[STEP 7-1] Reviewer unavailable; original report labeled review-incomplete:',safeError);
 }

}
// Normalize model field notation before applying saved or fresh edits.
if(review?.issues && Array.isArray(review.issues)){
 const corrected=review.issues.map((edit:any)=>{
   if(typeof edit?.field!=='string')return edit;
   const m=/^(bullishFactors|bearishFactors|monitoringFactors)\[(\d+)\]$/.exec(edit.field);
   if(!m)return edit;
   const idx=Number(m[2]);
   if(!Number.isSafeInteger(idx)||idx<0)return edit;
   if(edit.index!==undefined && edit.index!==idx)return edit;
   return {...edit,field:m[1],index:idx};
 });
 const count=corrected.filter((item:any,i:number)=>item!==review.issues[i]).length;
 if(count)console.log('[STEP 7-1] Normalized indexed review fields:',count);
 review={...review,issues:corrected};
}
const finished=finishFactReview(original.result,review,evidence.sources,commodity);
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const receipt={stage:'step7-fact-verification',sourceFile:name,originalSha256:digest,commodity,
 createdAt:new Date().toISOString(),status:finished.publishable?'verified':'needs-source-repair',
 completionPolicy:'best-effort-v2',reviewQuality:finished.quality,reviewComplete:finished.reviewComplete,
 originalStatus:original.status,reviewModel,review,rawText,usageMetadata,reviewDiagnostics,
 recoveredFrom,appliedFixes:finished.fixes,editErrors:finished.warnings,criticalAuditReasons:finished.critical,
 result:finished.result,audit:finished.audit,
 approvalScope:'local-RMS-preview-only',approvedForCloudPublication:false};
const file=`step7-fact-verified-${stamp}.json`;
fs.writeFileSync(path.join(dir,file),JSON.stringify(receipt,null,2),{flag:'wx',mode:0o600});
console.log('[STEP 7-1] Completed / report status:',receipt.status,'/ corrected fragments:',finished.fixes.length,'/ file:',file);
if(finished.warnings.length)console.log('[STEP 7-1] Warnings:',finished.warnings.join('; '));
if(finished.critical.length)console.warn('[STEP 7-1] Unsafe source/format audit:',finished.critical.join('; '));
// No review-needed exit code for a rejected edit. Runner may continue to Step7-2.
if(args.includes('--apply-local'))postLocal();
function postLocal(){
 const codeRoot=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
 const tsxCli=path.join(codeRoot,'node_modules','tsx','dist','cli.mjs');
 if(!fs.existsSync(tsxCli))throw Error('tsx CLI is unavailable');
 const p=spawnSync(process.execPath,[tsxCli,path.join(codeRoot,'scripts','soybean-rebuild','step7-fact-to-rms.ts'),'--commodity',commodity,'--apply-local'],
 {cwd:process.cwd(),stdio:'inherit',env:process.env,shell:false});
 if(p.error)throw p.error;
 if(p.status!==0)process.exitCode=p.status||1;
}
