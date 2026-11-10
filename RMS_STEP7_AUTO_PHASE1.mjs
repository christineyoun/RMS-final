import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const target = path.join(root,'scripts/cloud/publication.ts');
const sourceFile = path.join(root,'scripts/cloud/scheduledStep7.ts');
const checkOnly=process.argv.includes('--check-only');
if(!fs.existsSync(target))throw Error('Run in the integrated RMS project root (package.json directory).');
const original=fs.readFileSync(target,'utf8');
const optNeed="publishOverview?:typeof import('../../src/server/freeDailyJobs.ts').publishDailyOverview;";
const optNew=optNeed+"\n  runStep7?:(arg:{day:string})=>Promise<{status:string;day:string;reason?:string}>;";
const anchor=" // Always attempt the shared saved-input aggregator. It can publish new free";
const insert=` // STEP 7 scheduled phase is invoked after unchanged free-source and Market Intelligence routines.
 // Independent failure MUST NOT suppress their publication. The default
 // adapter remains no-charge until production paid controls are approved.
 let step7Result:{status:string;day:string;reason?:string}|undefined;
 try{
  const step7=options.runStep7||(await import('./scheduledStep7.ts')).runScheduledStep7;
  step7Result=await step7({day:t.day});
 }catch{
  step7Result={status:'retained-previous',day:t.day,reason:'step7-scheduled-stage-failed'};
  recordEvent({phase:'step7-scheduled-retained',day:t.day,reason:'step7-scheduled-stage-failed'});
 }
 console.log('Scheduled STEP7 stage:',step7Result.status);
`;
const already=original.includes('step7-scheduled-stage-failed');
if(!already){
 if(original.split(optNeed).length!==2||original.split(anchor).length!==2)throw Error('Not compatible with this RMS publication workflow; no changes');
}
const preserved=['src/server/freeSourceRefresh.ts','src/server/marketIntelligenceService.ts','src/server/scheduledAi.ts','src/server/freeDailyJobs.ts'];
const {checks}=JSON.parse(fs.readFileSync(path.join(import.meta.dirname,'auto-step7-manifest.json'),'utf8'));
for(const name of preserved){
 const bytes=fs.readFileSync(path.join(root,name));
 const got=crypto.createHash('sha256').update(bytes).digest('hex');
 if(got!==checks[name])throw Error('Unrecognized existing source file: '+name+'. No changes made.');
}
console.log('[STEP7 AUTO PHASE1] Existing market, weather, news + scheduled AI sources verified unchanged');
console.log('[STEP7 AUTO PHASE1] Publish workflow compatible:',already?'already patched':'yes');
if(checkOnly){console.log('[STEP7 AUTO PHASE1] CHECK ONLY: no changes');process.exit(0);}
if(already){console.log('[STEP7 AUTO PHASE1] Already applied');process.exit(0);}
if(fs.existsSync(sourceFile))throw Error('Step7 scheduled hook already exists, manual review required');
const dest=path.join(root,'.rms-research-patches','backup','auto-phase1-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(dest,{recursive:true});fs.copyFileSync(target,path.join(dest,'publication.ts'));
const modified=original.replace(optNeed,optNew).replace(anchor,insert+anchor);
fs.writeFileSync(target,modified);
const payload=fs.readFileSync(path.join(import.meta.dirname,'scheduledStep7.ts'));
fs.writeFileSync(sourceFile,payload,{flag:'wx'});
console.log('[STEP7 AUTO PHASE1] Added scheduled hook after existing free/NEWS, before overview; no Gemini calls');
console.log('[STEP7 AUTO PHASE1] Changed only scripts/cloud/publication.ts + added scripts/cloud/scheduledStep7.ts');
console.log('[STEP7 AUTO PHASE1] Cloud Run paid execution still DISABLED. Backup:',dest);
