import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=process.cwd(),sourceDir=import.meta.dirname;
const phase1=path.join(root,'scripts/cloud/scheduledStep7.ts');
const cloud=path.join(root,'scripts/cloud/publication.ts');
const originalHash='99531facece9f2d6b8d49d05731dd226599d23032015c40170a4d6985c4ce3fd';
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
if(!fs.existsSync(path.join(root,'package.json'))||!fs.existsSync(phase1)||!fs.existsSync(cloud))throw Error('Run in the integrated RMS project root (package.json directory)');
const old=fs.readFileSync(phase1,'utf8');
const newBody=fs.readFileSync(path.join(sourceDir,'scheduledStep7.ts'),'utf8');
const already=old===newBody;
if(!already&&hash(phase1)!==originalHash)throw Error('scheduledStep7.ts differs from the verified PHASE1 hook. Refusing overwrite.');
const pub=fs.readFileSync(cloud,'utf8');
const anchors=['run=await runner.check()','aiResult=await runAi','step7Result=await step7','await(options.publishOverview'];
if(anchors.some(a=>!pub.includes(a))||anchors.some((a,i)=>i>0&&pub.indexOf(a)<=pub.indexOf(anchors[i-1])))throw Error('Phase1 free/news/STEP7/overview order unrecognized. Refusing changes.');
const protectedNames=['src/server/freeSourceRefresh.ts','src/server/marketIntelligenceService.ts','src/server/scheduledAi.ts','src/server/freeDailyJobs.ts'];
const baseline=JSON.parse(fs.readFileSync(path.join(sourceDir,'baseline-checks.json'),'utf8'));
for(const name of protectedNames)if(hash(path.join(root,name))!==baseline.checks[name])throw Error('A protected existing source has changed: '+name+' (no edits made)');
const targets=['step7ScheduledWorker.mjs','step7ScheduledProbe.mjs'].map(n=>path.join(root,'scripts/cloud',n));
for(let j=0;j<targets.length;j++)if(fs.existsSync(targets[j])&&fs.readFileSync(targets[j],'utf8')!==fs.readFileSync(path.join(sourceDir,path.basename(targets[j])),'utf8'))throw Error('Existing file conflict: '+targets[j]);
console.log('[STEP7 PHASE2] Existing price, weather, supply, MI and AI legacy code hashes unchanged.');
console.log('[STEP7 PHASE2] Free -> news -> STEP7 -> overview hook order confirmed.');
if(process.argv.includes('--check-only')){console.log('[STEP7 PHASE2] CHECK ONLY; no file changes.');process.exit(0);}
if(already){console.log('[STEP7 PHASE2] Already installed.');process.exit(0);}
const backupDir=path.join(root,'.rms-research-patches','backup','auto-phase2-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backupDir,{recursive:true});
fs.copyFileSync(phase1,path.join(backupDir,'scheduledStep7.ts'));
const newlyWritten=[];
try{
  for(let j=0;j<targets.length;j++){
    if(!fs.existsSync(targets[j])){fs.copyFileSync(path.join(sourceDir,path.basename(targets[j])),targets[j],fs.constants.COPYFILE_EXCL);newlyWritten.push(targets[j]);}
  }
  const tmp=phase1+'.phase2-'+process.pid+'.tmp';
  fs.writeFileSync(tmp,newBody,{flag:'wx'});try{fs.renameSync(tmp,phase1);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
}catch(e){for(const p of newlyWritten)fs.rmSync(p,{force:true});fs.copyFileSync(path.join(backupDir,'scheduledStep7.ts'),phase1);throw e;}
console.log('[STEP7 PHASE2] Hook now calls REAL per-commodity research runner (inspect/free only).');
console.log('[STEP7 PHASE2] Only scheduledStep7.ts replaced; two new support scripts added. No Gemini calls.');
console.log('[STEP7 PHASE2] Cloud Run & paid calls remain DISABLED. Backup:',backupDir);
