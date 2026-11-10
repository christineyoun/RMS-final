/** Read-only owner-side end-to-end readiness inventory for STEP 7 across eight commodities.
 * No Gemini, Google search, Cloud, file writes, or scheduling changes.
 * This does NOT authorize paid refresh or represent successful publication. */
import fs from 'node:fs';
import path from 'node:path';
import {inspect} from '../soybean-rebuild/research-pipeline-runner.mjs';
import {readStep7LocalPreview} from '../../src/server/step7LocalPreview.ts';
import {hasAcceptedStep7ProcurementRisk} from '../../src/server/step7CloudCard.ts';
const ids=['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'];
if(process.env.CLOUD_RUN_JOB||process.env.K_SERVICE||process.env.NODE_ENV==='production')throw Error('Local-owner-only inspection');
const root=process.cwd();
if(!fs.existsSync(path.join(root,'scripts/soybean-rebuild/research-pipeline-runner.mjs')))throw Error('Run from RMS project root');
const envBefore=process.env.RMS_STEP7_LOCAL_PREVIEW;
const readonlyBefore=process.env.RMS_PUBLIC_READONLY;
process.env.RMS_STEP7_LOCAL_PREVIEW='1';
delete process.env.RMS_PUBLIC_READONLY;
const results=[];
try{
 for(const commodity of ids){
  let analysis='missing',risk='missing',stage='unknown';
  try{
   const record=readStep7LocalPreview(commodity,'127.0.0.1',root);
   if(record){analysis='saved-reviewed-local-preview';risk=hasAcceptedStep7ProcurementRisk(record,commodity)?'accepted-evidence-bound':'missing-or-rejected';}
  }catch{analysis='invalid-preview';risk='missing-or-rejected';}
  try{const i=inspect(root,commodity);stage=i.stage||i.action;}catch{stage='inspection-failed';}
  const entry={commodity,analysis,risk,currentDayResearchStage:stage};
  results.push(entry);
  console.log(`${commodity.padEnd(17)} STEP7=${analysis.padEnd(28)} SCM=${risk.padEnd(24)} NEXT=${stage}`);
 }
}finally{
 if(envBefore===undefined)delete process.env.RMS_STEP7_LOCAL_PREVIEW;else process.env.RMS_STEP7_LOCAL_PREVIEW=envBefore;
 if(readonlyBefore===undefined)delete process.env.RMS_PUBLIC_READONLY;else process.env.RMS_PUBLIC_READONLY=readonlyBefore;
}
const accepted=results.filter(r=>r.risk==='accepted-evidence-bound').length;
const summary={mode:'read-only',paidCalls:0,cloudChanges:false,commodities:results.length,acceptedScmRisks:accepted,
  awaitingEvidenceBoundScmRisk:results.filter(r=>r.risk!=='accepted-evidence-bound').map(r=>r.commodity),results};
console.log('RMS_STEP7_READINESS='+JSON.stringify(summary));
console.log(accepted===ids.length?'STEP7 READY FOR LIVE PAID TEST VALIDATION':'STEP7 NOT FULLY ACCEPTED — do not claim a completed eight-commodity refresh');
if(process.argv.includes('--strict')&&accepted!==ids.length)process.exitCode=2;
