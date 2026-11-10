/**
 * One-commodity LIVE local trial, no Cloud Run or Cloud Storage.
 * Preserves actual price/weather/supply/MI providers and STEP pipeline.
 * Free-source runner is injected with soybean-oil jobs only.
 * A transient copy of scheduledAi.ts limits its original NEWS phase plan to
 * soybean-oil, without modifying the production scheduledAi.ts.
 * No API calls in --check-only. --run makes live provider/paid Gemini calls.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const root=path.dirname(fileURLToPath(import.meta.url));
const argv=process.argv.slice(2);
const check=argv.length===1&&argv[0]==='--check-only';
const run=argv.length===1&&argv[0]==='--run';
const target='soybean-oil';
const freeJobKeys=[`${target}-history`,`${target}-world`,`origin-${target}`,`${target}-news`];
const sourceFile=path.join(root,'src/server/scheduledAi.ts');
const temporaryAiFile=path.join(root,'src/server',`.rms-local-${target}-${process.pid}.ts`);
const sha=x=>createHash('sha256').update(x).digest('hex');
const fail=x=>{throw Error(x);};
if(!check&&!run){console.error('Usage: node RMS_LOCAL_SOYBEAN_OIL_ONLY.mjs --check-only | node --import tsx RMS_LOCAL_SOYBEAN_OIL_ONLY.mjs --run');process.exit(2);}
if(path.resolve(process.cwd())!==path.resolve(root))fail('Execute from RMS root (the folder containing package.json).');
if(process.env.CLOUD_RUN_JOB||process.env.K_SERVICE||process.env.NODE_ENV==='production')fail('Local development use only; refusing cloud/production execution.');
const required=['package.json','scripts/cloud/publication.ts','scripts/cloud/scheduledStep7.ts','src/server/freeSourceRefresh.ts','src/server/freeDailyJobs.ts','src/server/scheduledAi.ts','scripts/cloud/weekday-ai-policy.approved.json'];
for(const r of required)if(!fs.existsSync(path.join(root,r)))fail('Missing required source: '+r);
const originalAiSource=fs.readFileSync(sourceFile,'utf8'),originalAiHash=sha(originalAiSource);
const planLine='const plan=scheduledPhasePlan(t.day);';
if(originalAiSource.split(planLine).length!==2)fail('Scheduled NEWS plan differs from tested code; leave existing MI unchanged and recheck.');
if(!/return ids\.map\(id=>\(\{id,kind:'news' as const\}\)\)/.test(originalAiSource))fail('Legacy AI phase is not disabled as expected; refuse to run.');
const localAiSource=originalAiSource.replace(planLine,`const plan=scheduledPhasePlan(t.day).filter(phase=>phase.id==='${target}');`);
if(localAiSource===originalAiSource||!localAiSource.includes(`.filter(phase=>phase.id==='${target}')`))fail('Cannot reliably limit MI to one commodity.');
const policy=JSON.parse(fs.readFileSync(path.join(root,'scripts/cloud/weekday-ai-policy.approved.json'),'utf8'));
if(policy.enabled!==true||policy.version!=='weekday-ai-prepaid-v3')fail('Original MI paid policy is not enabled/compatible.');
const now=new Date();
const kst=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23',weekday:'short'}).formatToParts(now).map(x=>[x.type,x.value]));
const day=`${kst.year}-${kst.month}-${kst.day}`;
const permitted=!['Sat','Sun'].includes(kst.weekday)&&Number(kst.hour)>=9;
if(fs.existsSync(path.join(root,'.env'))){try{(await import('dotenv')).config({path:path.join(root,'.env'),override:false,quiet:true});}catch{}}
const hasKey=Boolean(process.env.GEMINI_API_KEY?.trim());
console.log('SOYBEAN-OIL ONLY LOCAL INTEGRATED REFRESH');
console.log('  KST:',day,kst.weekday,kst.hour+':00');
console.log('  original free-source jobs:',freeJobKeys.join(', '));
console.log('  original Market Intelligence NEWS: soybean-oil ONLY (scoped temporary module)');
console.log('  STEP1~7-2: soybean-oil ONLY, original token/paid call limits');
console.log('  shared overview FX/energy/freight jobs: SKIPPED for single-commodity test');
console.log('  production MI/price/weather/STEP files: UNCHANGED');
console.log('  Cloud Storage and Cloud Run: NOT USED');
console.log('  Gemini key:',hasKey?'YES (value hidden)':'NO');
if(check){console.log('CHECK ONLY: selected commodity soybean-oil; NO API calls or file writes.');process.exit(0);}
if(!permitted)fail('Live test is allowed only on weekdays after 09:00 KST.');
if(!hasKey)fail('GEMINI_API_KEY not found; no live test run.');
const stage=path.join(root,'.rms-stage3');
if(!fs.existsSync(stage))fail('Local .rms-stage3 state directory missing.');
for(const l of ['free-source-refresh.lock','paid-analysis-job.lock','paid-request.lock'])if(fs.existsSync(path.join(stage,l)))fail('Active/pending lock: '+l+'; do not delete to force retry.');
if(fs.existsSync(temporaryAiFile))fail('Temporary MI file already exists; refusing overwrite: '+temporaryAiFile);

const backup=path.join(root,'.rms-research-patches','backup',`local-soybean-oil-${day}-${Date.now()}`);
fs.mkdirSync(backup,{recursive:true});
for(const dir of ['.rms-stage3','.rms-price-history','.rms-origin-verified']){
 const from=path.join(root,dir);if(fs.existsSync(from))fs.cpSync(from,path.join(backup,dir),{recursive:true});
}
console.log('BACKUP:',backup);
const settingsFile=path.join(stage,'settings.json');
const savedSettings=fs.existsSync(settingsFile)?fs.readFileSync(settingsFile):null;
const savedSettingsJson=savedSettings?JSON.parse(savedSettings.toString()):{};
const envKeys=['RMS_STEP7_SCHEDULE_MODE','RMS_STEP7_PAID_COMMODITIES','RMS_STEP7_PAID_APPROVED','RMS_STAGE3_RUNTIME_ROOT','RMS_DISABLE_SCHEDULERS'];
const oldEnv=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
try{
 fs.writeFileSync(settingsFile,JSON.stringify({...savedSettingsJson,autoEnabled:false,freeAutoEnabled:true},null,2));
 process.env.RMS_STEP7_SCHEDULE_MODE='paid-local';
 process.env.RMS_STEP7_PAID_COMMODITIES=target;
 process.env.RMS_STEP7_PAID_APPROVED='YES';
 process.env.RMS_STAGE3_RUNTIME_ROOT=root;
 process.env.RMS_DISABLE_SCHEDULERS='1';
 // Create temporary copy alongside original, so relative imports resolve exactly
 // as in the unchanged MI implementation. Delete this file in finally below.
 fs.writeFileSync(temporaryAiFile,localAiSource,{flag:'wx'});
 const [{runRefreshWorkflow},{createFreeSourceRunner,freeRefreshDay},{dailyFreeSourceJobs},{runScheduledAi,validateScheduledPolicy},{readScheduledContent},{runScheduledStep7}]=await Promise.all([
  import('./scripts/cloud/publication.ts'),import('./src/server/freeSourceRefresh.ts'),import('./src/server/freeDailyJobs.ts'),
  import(pathToFileURL(temporaryAiFile).href),import('./src/server/scheduledContent.ts'),import('./scripts/cloud/scheduledStep7.ts'),
 ]);
 validateScheduledPolicy(policy);
 const t=freeRefreshDay();if(t.day!==day||!t.weekday||t.hour<9)fail('Unexpected KST execution window.');
 const jobs=dailyFreeSourceJobs().filter(j=>freeJobKeys.includes(j.key));
 if(jobs.length!==freeJobKeys.length||new Set(jobs.map(j=>j.key)).size!==freeJobKeys.length)fail('Selected free job list is incomplete or ambiguous; no calls.');
 if(jobs.some(j=>j.commodity!==target))fail('Free source selection contains another commodity.');
 console.log('SELECTED FREE SOURCE JOBS:',jobs.map(j=>j.key).join(', '));
 const runner=createFreeSourceRunner({now:()=>new Date(),jobs:()=>jobs,publish:async()=>null});
 const journalFile=path.join(stage,`local-${target}-MI-journal-${day}.json`);
 const store={
  async read(){return fs.existsSync(journalFile)?JSON.parse(fs.readFileSync(journalFile,'utf8')):null;},
  async save(value){const tmp=journalFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value));fs.renameSync(tmp,journalFile);},
 };
 const prior=readScheduledContent('news-'+target);
 const priorNews={[target]:Array.isArray(prior?.payload?.articles)?prior.payload.articles:[]};
 console.log('RUN: soybean-oil FREE SOURCES -> soybean-oil MI -> soybean-oil STEP -> local result (NO CLOUD)');
 const result=await runRefreshWorkflow(policy,store,{
  now:()=>new Date(),priorNews,
  runner:{check:()=>runner.refresh('manual'),retryFailed:async()=>null},
  runAi:(p,s,o)=>runScheduledAi(p,s,{...o,now:()=>new Date()}),
  runStep7:({day:d})=>runScheduledStep7({day:d}),
  publishOverview:async()=>{}, // no all-commodity aggregation/publication in this local trial
 });
 if(!result)fail('Workflow ended before execution; check window and settings.');
 const journal=await store.read();
 const otherPhases=Object.keys(journal?.phases||{}).filter(k=>k!==`news-${target}`);
 if(otherPhases.length)fail('SCOPE VIOLATION: other MI commodities were scheduled: '+otherPhases.join(', '));
 const otherSourceJobs=(result.sourceRun?.jobs||[]).filter(j=>!freeJobKeys.includes(j.key));
 if(otherSourceJobs.length)fail('SCOPE VIOLATION: other free source jobs were scheduled.');
 const stepRows=result.step7Result?.results||[];
 if(stepRows.some(r=>r.commodity!==target))fail('SCOPE VIOLATION: other STEP commodities were scheduled.');
 let cardUpdated=false;
 if(stepRows.some(r=>r.commodity===target&&r.action==='done')){
  const {validatedLocalCard}=await import('./scripts/soybean-rebuild/step7-local-card-status.mjs');
  const dir=path.join(root,'.rms-research',target,'daily',day);
  if(validatedLocalCard(dir,target)){
   const src=path.join(dir,`step7-rms-preview-${target}.json`);
   const dst=path.join(root,'.rms-research',target,`step7-rms-preview-${target}.json`);
   fs.mkdirSync(path.dirname(dst),{recursive:true});
   if(fs.existsSync(dst))fs.copyFileSync(dst,path.join(backup,'previous-step7-rms-preview-soybean-oil.json'));
   fs.copyFileSync(src,dst);cardUpdated=true;
  }
 }
 const summary={day,selectedCommodity:target,sourceStatus:result.sourceRun?.status||null,
  sourceJobs:(result.sourceRun?.jobs||[]).map(j=>({key:j.key,status:j.status,error:j.error||null})),
  marketIntelligence:{attempts:result.aiResult?.attempts??journal?.requests?.length??0,accepted:result.aiResult?.accepted||[],phases:journal?.phases||{},error:result.aiError||false},
  step7:result.step7Result||null,cardUpdated,cloudPublication:false,backup};
 const report=path.join(backup,'soybean-oil-single-result.json');
 fs.writeFileSync(report,JSON.stringify(summary,null,2));
 console.log('RMS_SOYBEAN_OIL_ONLY_RESULT='+JSON.stringify({day,sourceStatus:summary.sourceStatus,
  sourceJobs:summary.sourceJobs,miAttempts:summary.marketIntelligence.attempts,
  miAccepted:summary.marketIntelligence.accepted,miPhase:summary.marketIntelligence.phases[`news-${target}`],
  step7:summary.step7,cardUpdated,report,cloudPublication:false}));
}finally{
 if(savedSettings)fs.writeFileSync(settingsFile,savedSettings);else fs.rmSync(settingsFile,{force:true});
 for(const [k,v] of Object.entries(oldEnv)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
 fs.rmSync(temporaryAiFile,{force:true});
 if(sha(fs.readFileSync(sourceFile))!==originalAiHash)console.error('CRITICAL: Original MI source hash changed unexpectedly! Investigate before another run.');
}
