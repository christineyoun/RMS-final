/** Shared risk-only recovery helpers. No live data, historical articles, or commodity-specific risk rules. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {buildFinalData,auditFinalResult} from '../soybean-rebuild/step7-core.ts';
import {adaptStep7ToRms} from '../soybean-rebuild/step7-rms-adapter.ts';
import {assessStep7AiRisk} from '../soybean-rebuild/step7-ai-risk.ts';
import {COMMODITIES} from '../soybean-rebuild/commodity-config.ts';
import {readStep7LocalPreview} from '../../src/server/step7LocalPreview.ts';
import {hasAcceptedStep7ProcurementRisk} from '../../src/server/step7CloudCard.ts';

export const hash = b=>crypto.createHash('sha256').update(b).digest('hex');
export function baseDir(root,id){return id==='soybean'?path.join(root,'.rms-soybean-rebuild'):path.join(root,'.rms-research',id);}
const safeName=n=>typeof n==='string'&&/^[a-zA-Z0-9_.-]+\.json$/.test(n)&&!n.includes('..');
const readJson=f=>JSON.parse(fs.readFileSync(f,'utf8'));
export const substantive = d=>({deskRecommendation:d.deskRecommendation,executiveSummary:d.executiveSummary,
  purchaseActions:d.purchaseActions,bullishFactors:d.bullishFactors,bearishFactors:d.bearishFactors,
  watchItems:d.watchItems,sources:d.sources,generatedAt:d.generatedAt,model:d.model,status:d.status,rmsStep7Preview:d.rmsStep7Preview});
function availableDirectories(root,id){
 const base=baseDir(root,id),dirs=[base],daily=path.join(base,'daily');
 try{for(const ent of fs.readdirSync(daily,{withFileTypes:true}).filter(e=>e.isDirectory()&&/^20\d\d-\d\d-\d\d$/.test(e.name)).sort((a,b)=>b.name.localeCompare(a.name)))dirs.push(path.join(daily,ent.name));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(id==='soybean'){
   const other=path.join(root,'.rms-research',id,'daily');
   try{for(const ent of fs.readdirSync(other,{withFileTypes:true}).filter(e=>e.isDirectory()&&/^20\d\d-\d\d-\d\d$/.test(e.name)).sort((a,b)=>b.name.localeCompare(a.name)))dirs.push(path.join(other,ent.name));}catch(e){if(e.code!=='ENOENT')throw e;}
 }
 return dirs;
}
function parseCandidate(dir,id,expected){
 const previewName=`step7-rms-preview-${id}.json`,previewPath=path.join(dir,previewName);
 if(!fs.existsSync(previewPath))return null;
 const previewBytes=fs.readFileSync(previewPath),receipt=JSON.parse(previewBytes.toString('utf8'));
 if(!isDeepStrictEqual(receipt.data,expected))return null;
 if(receipt.commodity!==id||receipt.stage!=='step7-local-ui-preview'||receipt.approvedForPublication!==false)throw Error('Mismatched local STEP7 preview receipt');
 const {sourceResultFile,verifiedResultFile,originalSha256}=receipt;
 if(!safeName(sourceResultFile)||!/^step7-final-.*\.json$/.test(sourceResultFile)||
    !safeName(verifiedResultFile)||!/^step7-fact-verified-.*\.json$/.test(verifiedResultFile)||
    !/^[a-f0-9]{64}$/.test(originalSha256||''))throw Error('Missing original STEP7 and reviewer provenance');
 const originalPath=path.join(dir,sourceResultFile),reviewPath=path.join(dir,verifiedResultFile);
 const originalBytes=fs.readFileSync(originalPath),reviewBytes=fs.readFileSync(reviewPath);
 if(hash(originalBytes)!==originalSha256)throw Error('Original report checksum mismatch');
 const original=JSON.parse(originalBytes.toString('utf8')),review=JSON.parse(reviewBytes.toString('utf8'));
 if(original.stage!=='final-market-outlook-and-procurement'||original.commodity!==id||
    !['report-created','report-review-needed'].includes(original.status)||!original.result||
    review.stage!=='step7-fact-verification'||review.status!=='verified'||review.commodity!==id||
    review.sourceFile!==sourceResultFile||review.originalSha256!==originalSha256||
    review.completionPolicy!=='best-effort-v2'||review.approvalScope!=='local-RMS-preview-only'||
    review.approvedForCloudPublication!==false||!Array.isArray(review.criticalAuditReasons)||
    review.criticalAuditReasons.length||!review.result||
    (review.reviewComplete!==true&&!(review.reviewComplete===false&&review.reviewQuality==='review-incomplete'))||
    receipt.factReviewComplete!==review.reviewComplete||receipt.factReviewQuality!==review.reviewQuality)
    throw Error('Original STEP7 fact review is not accepted for local repair');
 const filenames=fs.readdirSync(dir).filter(n=>/^step7-final-.*\.json$/.test(n)).sort();
 if(filenames.at(-1)!==sourceResultFile)throw Error('Preview is not tied to latest report in its original directory');
 // This resolves the original report's saved STEP4/5/6 publisher evidence. Never touch today's different search.
 const evidence=buildFinalData(dir);
 if(evidence.commodity!==id||evidence.route!==original.route||
   Object.entries(evidence.files).some(([key,value])=>original.inputFiles?.[key]!==value))
   throw Error('Original STEP7 evidence inventory no longer matches this exact report');
 const audit=auditFinalResult(review.result,evidence);
 const soft=s=>s.startsWith('purchase-percentage-or-percentage-trigger')||s.startsWith('numeric-buy-or-hedge-price');
 if(audit.reviewReasons.some(s=>!soft(s)))throw Error('Reviewed report fails current source/claim audit');
 const baseline=adaptStep7ToRms({...original,status:'report-created',result:review.result},evidence.sources).data;
 if(!isDeepStrictEqual(substantive(receipt.data),substantive(baseline)))
   throw Error('Displayed RMS AI market outlook/strategy does not match this reviewed STEP7 source; refusing to splice risk');
 if(hasAcceptedStep7ProcurementRisk(receipt.data,id))throw Error('Risk already present; refusing paid repair');
 return {id,dir,previewPath,previewBytes,receipt,original,originalBytes,review,reviewBytes,evidence,
   originalSha256,sourceResultFile,verifiedResultFile,evidenceSha256:hash(JSON.stringify(evidence.sources))};
}
export function inspectRiskOnly(root,id){
 if(!COMMODITIES.includes(id))throw Error('Unknown RMS commodity');
 if(process.env.NODE_ENV==='production'||process.env.CLOUD_RUN_JOB||process.env.K_SERVICE||process.env.RMS_PUBLIC_READONLY==='1')throw Error('Risk-only recovery is local-owner-only');
 const was=process.env.RMS_STEP7_LOCAL_PREVIEW;
 process.env.RMS_STEP7_LOCAL_PREVIEW='1';
 let expected;
 try{expected=readStep7LocalPreview(id,'127.0.0.1',root);}finally{
   if(was===undefined)delete process.env.RMS_STEP7_LOCAL_PREVIEW;else process.env.RMS_STEP7_LOCAL_PREVIEW=was;
 }
 if(!expected)return {id,status:'NO_SAVED_REPORT',reason:'No accepted local STEP7 preview'};
 if(hasAcceptedStep7ProcurementRisk(expected,id))return {id,status:'ALREADY_ACCEPTED',reason:'Existing saved report has a verified SCM risk'};
 const problems=[];
 for(const dir of availableDirectories(root,id)){
   try{const matched=parseCandidate(dir,id,expected);if(matched)return {id,status:'READY',candidate:matched};}
   catch(err){problems.push(`${path.relative(root,dir)}: ${String(err.message).slice(0,220)}`);}
 }
 return {id,status:'BLOCKED',reason:problems.at(0)||'No matching original STEP7 + source verification receipt found; no new research authorized'};
}
export function evaluateRisk(risk,id,sources){
 if(!risk||!['안정','주의','경계','판정 보류'].includes(risk.level)||typeof risk.summary!=='string'||
    risk.summary.trim().length<15||[...risk.summary.trim()].length>120||
    !Array.isArray(risk.sourceIds)||!risk.sourceIds.length||risk.sourceIds.length>5||
    risk.sourceIds.some(s=>typeof s!=='string'))throw Error('Risk field rejected: invalid schema, empty citation or unsupported length');
 const ids=[...new Set(risk.sourceIds)],used=sources.filter(s=>ids.includes(s.id));
 if(used.length!==ids.length||used.some(s=>s.grade!=='A'||!s.url||!Array.isArray(s.excerpts)||!s.excerpts.some(e=>e.text?.trim())))
   throw Error('Risk references must all resolve to readable A-grade original publisher excerpts');
 const facts=used.flatMap(s=>s.excerpts.map(e=>e.text||'').concat(s.date||''));
 // Reject numerical claims which are not present in the selected A-grade original excerpts.
 const numeric=s=>[...String(s).matchAll(/\d[\d,.]*/g)].map(m=>m[0].replace(/,/g,'').replace(/^0+(?=\d)/,''));
 const supportedNumbers=new Set(facts.flatMap(numeric));
 if(numeric(risk.summary).some(n=>!supportedNumbers.has(n)))
   throw Error('Risk summary contains a number not present in its cited A-grade publisher evidence');
 const result=assessStep7AiRisk(id,{...risk,sourceIds:ids},sources);
 if(!result.risk||result.warning||!result.risk.evidence.length)throw Error('Existing STEP7 AI risk evidence validator rejected the result');
 // Numeric statements in the new risk must appear in A-grade original excerpts or the reviewed market report.
 return {level:risk.level,summary:risk.summary.trim(),sourceIds:ids};
}
export function assertSameOutlook(before,after){
 for(const k of ['deskRecommendation','executiveSummary','purchaseActions','bullishFactors','bearishFactors','watchItems','generatedAt'])
   if(!isDeepStrictEqual(before[k],after[k]))throw Error('Risk-only update attempted to change existing market outlook or buying strategy: '+k);
 if(!Array.isArray(after.sources)||!before.sources.every(s=>after.sources.some(a=>isDeepStrictEqual(a,s))))
   throw Error('Risk-only update removed original citation links');
}
