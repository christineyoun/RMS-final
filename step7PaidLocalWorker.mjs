/** Local-only scheduled paid STEP1-7 -> 7-1 -> 7-2 adapter.
 * Reuses the original research-verified-runner and its max 6 paid STEP calls,
 * plus at most one evidence review. No cloud capability, no publication.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {COMMODITIES,researchDir,inspect} from '../soybean-rebuild/research-pipeline-runner.mjs';

const args=process.argv.slice(2),idx=args.indexOf('--commodity');
const commodity=idx===0?args[1]:undefined;
if(args.length!==3||args[2]!=='--paid-local'||!COMMODITIES.includes(commodity))throw Error('Only --commodity <known> --paid-local accepted');
if(process.env.NODE_ENV==='production'||process.env.CLOUD_RUN_JOB||process.env.K_SERVICE)throw Error('Cloud Run is deliberately blocked');
if(process.env.RMS_STEP7_SCHEDULE_MODE!=='paid-local'||process.env.RMS_STEP7_PAID_APPROVED!=='YES')throw Error('Explicit local paid authorization required');
const day=process.env.RMS_RESEARCH_RUN_DAY;
if(!/^\d{4}-\d{2}-\d{2}$/.test(day||'')||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)throw Error('Valid daily execution date is required');
const root=process.cwd(),dir=researchDir(root,commodity);
const runner=fileURLToPath(new URL('../soybean-rebuild/research-verified-runner.mjs',import.meta.url));
const before=inspect(root,commodity);
// A missing API key must NOT reserve a paid-attempt marker and block retries.
if(!process.env.GEMINI_API_KEY){
  try{const dotenv=await import('dotenv');dotenv.config({path:path.join(root,'.env')});}catch{}
}
if(!process.env.GEMINI_API_KEY?.trim())throw Error('GEMINI_API_KEY missing (no paid attempt made)');
const paidAttemptCount=()=>fs.existsSync(path.join(root,'.rms-research-runner',commodity,'daily',day))?
  fs.readdirSync(path.join(root,'.rms-research-runner',commodity,'daily',day)).filter(n=>/^paid-(?:step1|step4|step5search|step5decision|step6search|step7)\.json$/.test(n)).length:0;
const reviewAttempts=()=>fs.existsSync(dir)?fs.readdirSync(dir).filter(n=>/^step7-fact-attempt-[a-f0-9]{20}(?:-retry-v1)?\.json$/.test(n)).length:0;
const attempts=()=>paidAttemptCount()+reviewAttempts();
const report=(action,stage)=>{
 const summary={commodity,action,stage:stage||undefined,paidCalls:attempts()};
 console.log('RMS_SCHEDULED_STEP7_JSON='+JSON.stringify(summary));
};
// Avoid repeated billable calls when a same-day result has already passed 7-1.
function validatedLocalCard(){
 try{
  const names=fs.readdirSync(dir),final=names.filter(n=>/^step7-final-.*\.json$/.test(n)).sort().at(-1);
  const reviews=names.filter(n=>/^step7-fact-verified-.*\.json$/.test(n)).sort().reverse();
  if(!final)return false;
  const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,final))).digest('hex');
  const review=reviews.map(n=>{try{return{name:n,record:JSON.parse(fs.readFileSync(path.join(dir,n),'utf8'))};}catch{return null;}})
    .find(x=>x?.record.sourceFile===final&&x.record.originalSha256===hash&&x.record.commodity===commodity);
  if(!review||review.record.status!=='verified'||review.record.reviewComplete!==true)return false;
  const preview=JSON.parse(fs.readFileSync(path.join(dir,`step7-rms-preview-${commodity}.json`),'utf8'));
  return preview.commodity===commodity&&preview.verifiedResultFile===review.name&&
    preview.originalSha256===hash&&preview.factReviewComplete===true&&!!preview.data?.executiveSummary&&
    preview.approvedForPublication===false;
 }catch{return false;}
}
if(before.action==='done'&&validatedLocalCard()){
 report('done','already-verified-local-card');process.exit(0);
}
// Original per-stage token caps, paid-attempt markers and no-auto-retry logic apply.
const child=spawn(process.execPath,[runner,'--commodity',commodity,'--run-paid','--approve-paid','--max-paid','6','--allow-review-paid'],
 {cwd:root,env:process.env,stdio:['ignore','pipe','pipe'],shell:false,windowsHide:true});

child.stdout.on('data',chunk=>{
  // Deliberately don't echo model output or credentials into public logs.
  // Summarize validated files after the process finishes instead.
});
child.stderr.on('data',()=>{});
const code=await new Promise(resolve=>{child.on('error',()=>resolve(1));child.on('close',n=>resolve(n??1));});
if(validatedLocalCard()){
 report('done','local-reviewed-card');process.exit(0);
}
let stage='unverified-or-incomplete';
try{const current=inspect(root,commodity);stage=current.stage||current.action;}catch{}
report('stop',stage);
// A nonzero result means no verified card; this is not a retry authorization.
if(code!==0)console.log('[STEP7 PAID LOCAL] Underlying runner stopped; last accepted preview is retained.');
