/**
 * RMS LOCAL full refresh harness (development computer only).
 * Invokes the real existing free refresh runner, scheduled Market Intelligence
 * news runner and STEP7 paid-local runner through runRefreshWorkflow.
 * No Cloud Run environment or GCS publication calls are enabled here.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const args=process.argv.slice(2);
const check=args.length===1&&args[0]==='--check-only';
const run=args.length===2&&args[0]==='--run'&&args[1]==='palm-oil';
if(!check&&!run){console.error('Usage: node --import tsx RMS_LOCAL_FULL_REFRESH.mjs --check-only | --run palm-oil');process.exit(2);}
if(process.cwd()!==root){console.error('Run from the RMS project root containing package.json.');process.exit(2);}
if(process.env.CLOUD_RUN_JOB||process.env.K_SERVICE||process.env.NODE_ENV==='production'){
 console.error('Only ordinary local development mode is allowed.');process.exit(2);
}
for(const file of ['package.json','scripts/cloud/publication.ts','scripts/cloud/scheduledStep7.ts','scripts/cloud/weekday-ai-policy.approved.json','src/server/freeSourceRefresh.ts','src/server/scheduledAi.ts']){
 if(!fs.existsSync(path.join(root,file))){console.error('Missing compatible RMS source: '+file);process.exit(2);}
}
const policy=JSON.parse(fs.readFileSync(path.join(root,'scripts/cloud/weekday-ai-policy.approved.json'),'utf8'));
if(policy.enabled!==true||policy.version!=='weekday-ai-prepaid-v3'){
 console.error('Existing approved MI policy is missing or disabled.');process.exit(2);
}
const now=new Date();
const kst=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23',weekday:'short'}).formatToParts(now).map(x=>[x.type,x.value]));
const day=`${kst.year}-${kst.month}-${kst.day}`;
const allowDay=!['Sat','Sun'].includes(kst.weekday)&&+kst.hour>=9;
const keyFile=path.join(root,'.env');
if(fs.existsSync(keyFile))try{(await import('dotenv')).config({path:keyFile,override:false,quiet:true});}catch{}
const hasKey=Boolean(process.env.GEMINI_API_KEY?.trim());
console.log('RMS LOCAL FULL REFRESH PRECHECK');
console.log('  day (KST):',day,'hour:',kst.hour,'weekday:',kst.weekday);
console.log('  free refresh: original RMS jobs (all commodities)');
console.log('  Market Intelligence: original scheduled NEWS (all eight commodities)');
console.log('  STEP1~7-2: paid-local, palm-oil only');
console.log('  Gemini key present:',hasKey?'YES (value hidden)':'NO');
console.log('  Cloud Run/Cloud Storage publication: DISABLED');
console.log('  Monthly budget settings: original policy (not overridden)');
console.log('  Live provider calls will occur ONLY with --run palm-oil');
if(check){console.log('CHECK ONLY: no data modified, no Gemini or source API calls.');process.exit(0);}
if(!allowDay)throw Error('Actual workflow requires weekdays from 09:00 KST; no date faking.');
if(!hasKey)throw Error('Missing GEMINI_API_KEY in local environment/.env; nothing changed.');
const stage=path.join(root,'.rms-stage3');
if(!fs.existsSync(stage))throw Error('Missing local .rms-stage3 state; nothing changed.');
for(const lock of ['paid-analysis-job.lock','paid-request.lock','free-source-refresh.lock']){
 if(fs.existsSync(path.join(stage,lock)))throw Error('Unresolved lock '+lock+'; do not delete it to force a retry.');
}
const backup=path.join(root,'.rms-research-patches','backup',`local-full-refresh-${day}-${Date.now()}`);
fs.mkdirSync(backup,{recursive:true});
for(const dir of ['.rms-stage3','.rms-price-history','.rms-origin-verified']){
 const src=path.join(root,dir);if(fs.existsSync(src))fs.cpSync(src,path.join(backup,dir),{recursive:true});
}
console.log('Backup created (local data only):',backup);
let savedSettings=null;
const settingsFile=path.join(stage,'settings.json');
if(fs.existsSync(settingsFile))savedSettings=fs.readFileSync(settingsFile);
const settings=savedSettings?JSON.parse(savedSettings.toString()):{};
fs.writeFileSync(settingsFile,JSON.stringify({...settings,autoEnabled:false,freeAutoEnabled:true},null,2));
const oldEnv={
 RMS_STEP7_SCHEDULE_MODE:process.env.RMS_STEP7_SCHEDULE_MODE,
 RMS_STEP7_PAID_COMMODITIES:process.env.RMS_STEP7_PAID_COMMODITIES,
 RMS_STEP7_PAID_APPROVED:process.env.RMS_STEP7_PAID_APPROVED,
 RMS_STAGE3_RUNTIME_ROOT:process.env.RMS_STAGE3_RUNTIME_ROOT,
 RMS_DISABLE_SCHEDULERS:process.env.RMS_DISABLE_SCHEDULERS,
};
process.env.RMS_STEP7_SCHEDULE_MODE='paid-local';
process.env.RMS_STEP7_PAID_COMMODITIES='palm-oil';
process.env.RMS_STEP7_PAID_APPROVED='YES';
process.env.RMS_STAGE3_RUNTIME_ROOT=root;
process.env.RMS_DISABLE_SCHEDULERS='1';
try{
 const [{runRefreshWorkflow},{createFreeSourceRunner,freeRefreshDay},{runScheduledAi,validateScheduledPolicy},{readScheduledContent},{runScheduledStep7}]=await Promise.all([
  import('./scripts/cloud/publication.ts'),import('./src/server/freeSourceRefresh.ts'),import('./src/server/scheduledAi.ts'),
  import('./src/server/scheduledContent.ts'),import('./scripts/cloud/scheduledStep7.ts'),
 ]);
 validateScheduledPolicy(policy);
 const t=freeRefreshDay(now);
 if(t.day!==day||!t.weekday||t.hour<9)throw Error('KST execution window mismatch.');
 const free=createFreeSourceRunner({now:()=>new Date()});
 const journalFile=path.join(stage,`local-full-refresh-paid-journal-${day}.json`);
 const store={
  async read(){return fs.existsSync(journalFile)?JSON.parse(fs.readFileSync(journalFile,'utf8')):null;},
  async save(value){const tmp=journalFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value));fs.renameSync(tmp,journalFile);},
 };
 const ids=['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'];
 const priorNews=Object.fromEntries(ids.map(id=>{
  const prior=readScheduledContent('news-'+id);return [id,Array.isArray(prior?.payload?.articles)?prior.payload.articles:[]];
 }));
 console.log('RUNNING real RMS refresh: free sources -> MI news -> STEP palm-oil -> overview ...');
 const result=await runRefreshWorkflow(policy,store,{
  now:()=>new Date(),priorNews,
  runner:{check:()=>free.refresh('manual'),retryFailed:()=>free.retryFailed()},
  runAi:(p,s,o)=>runScheduledAi(p,s,{...o,now:()=>new Date()}),
  runStep7:({day:d})=>runScheduledStep7({day:d}),
 });
 if(!result)throw Error('Workflow skipped before executing.');
 const journal=await store.read();
 const summary={
  day,backup,sourceStatus:result.sourceRun?.status,
  sourceJobs:result.sourceRun?.jobs?.map(x=>({key:x.key,status:x.status,error:x.error||null}))||[],
  sourceError:result.sourceError,
  marketIntelligence:{attempts:result.aiResult?.attempts??journal?.requests?.length??0,accepted:result.aiResult?.accepted||[],error:result.aiError,phases:journal?.phases||{}},
  step7:result.step7Result,
  localPublication:fs.existsSync(path.join(stage,'free-daily-publication.json')),
  cloudPublication:false,
 };
 const report=path.join(backup,'result-summary.json');fs.writeFileSync(report,JSON.stringify(summary,null,2));
 console.log('RMS_LOCAL_FULL_REFRESH_RESULT='+JSON.stringify({
  day,sourceStatus:summary.sourceStatus,newsAccepted:summary.marketIntelligence.accepted,
  miAttempts:summary.marketIntelligence.attempts,step7:summary.step7,
  localPublication:summary.localPublication,report,
 }));
 if(result.step7Result?.results?.some(r=>r.commodity==='palm-oil'&&r.action==='done')){
  const {validatedLocalCard}=await import('./scripts/soybean-rebuild/step7-local-card-status.mjs');
  const dir=path.join(root,'.rms-research','palm-oil','daily',day);
  if(validatedLocalCard(dir,'palm-oil')){
   const src=path.join(dir,'step7-rms-preview-palm-oil.json');const dst=path.join(root,'.rms-research','palm-oil','step7-rms-preview-palm-oil.json');
   fs.mkdirSync(path.dirname(dst),{recursive:true});
   if(fs.existsSync(dst))fs.copyFileSync(dst,path.join(backup,'prior-palm-oil-step7-rms-preview.json'));
   fs.copyFileSync(src,dst);
   console.log('PASS: approved palm-oil STEP7-2 card copied to local Viewer preview only.');
  }
 }
 console.log('Full local flow finished. Check summary statuses for retained/failed data; this does not prove cloud publication.');
}finally{
 if(savedSettings)fs.writeFileSync(settingsFile,savedSettings);else fs.rmSync(settingsFile,{force:true});
 for(const [k,v] of Object.entries(oldEnv)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
}
