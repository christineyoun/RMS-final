/** Apply-only local paid STEP pipeline scheduler support. No API call. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=process.cwd(),src=import.meta.dirname;
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const expected={
 'scripts/cloud/scheduledStep7.ts':'04770eb8ce61731227d4a7aed2f7deab92d5fbc70821c0b686b2d4a1078df5e2',
};
const protectedFiles={
 'src/server/freeSourceRefresh.ts':'4e56b153846563ba3c3d1beb16f30e77f902626ce94d00401e6eb1f7f4f4db09',
 'src/server/marketIntelligenceService.ts':'11e3bb9087c61dccda468f1cffcf28cb52432669f1a8056ceb3c990b619d6f29',
 'src/server/scheduledAi.ts':'826536746072411b25ce6e2892313b66ac34dfa5e557b6070279710bf43c22f5',
 'src/server/freeDailyJobs.ts':'11b3be43ff624109d02d5eba22308684233a714eb4eed1770ba69337929d5c3f',
};
if(!fs.existsSync(path.join(root,'package.json')))throw Error('Run in RMS project root containing package.json');
for(const [name,h]of Object.entries(protectedFiles)){
 const p=path.join(root,name);if(!fs.existsSync(p)||hash(p)!==h)throw Error('Protected original source differs (no edit): '+name);
}
const pub=fs.readFileSync(path.join(root,'scripts/cloud/publication.ts'),'utf8');
const anchors=['run=await runner.check()','aiResult=await runAi','step7Result=await step7','await(options.publishOverview'];
if(anchors.some(a=>!pub.includes(a))||anchors.some((a,i)=>i&&pub.indexOf(a)<=pub.indexOf(anchors[i-1])))throw Error('Existing free/news/STEP7/publication order differs. Refusing edit.');
const files=[
 {target:'scripts/cloud/scheduledStep7.ts',file:'scheduledStep7.ts'},
 {target:'scripts/cloud/step7PaidLocalWorker.mjs',file:'step7PaidLocalWorker.mjs'},
 {target:'scripts/cloud/step7PaidLocalProbe.mjs',file:'step7PaidLocalProbe.mjs'},
];
let needed=0;
for(const {target,file}of files){
 const dst=path.join(root,target),source=path.join(src,file);if(!fs.existsSync(source))throw Error('Patch payload missing: '+file);
 if(fs.existsSync(dst)){
  if(hash(dst)!==hash(source)&&hash(dst)!==expected[target])throw Error('Unexpected existing file; refusing overwrite: '+target);
  if(hash(dst)!==hash(source))needed++;
 }else{if(target==='scripts/cloud/scheduledStep7.ts')throw Error('Phase 3 not installed');needed++;}
}
console.log('[STEP7 PHASE4] Original price/supply/weather/Market Intelligence unchanged');
console.log('[STEP7 PHASE4] Existing free/news/STEP7/overview call order unchanged');
console.log('[STEP7 PHASE4] Only scheduledStep7.ts + new local-paid worker/probe; files to write:',needed);
if(process.argv.includes('--check-only')){console.log('[STEP7 PHASE4] CHECK ONLY: nothing changed; no API calls');process.exit(0);}
if(needed===0){console.log('[STEP7 PHASE4] Already installed');process.exit(0);}
const backup=path.join(root,'.rms-research-patches','backup','auto-phase4-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
const changed=[];
try{
 for(const {target,file}of files){
  const dst=path.join(root,target),source=path.join(src,file);
  if(fs.existsSync(dst)&&hash(dst)===hash(source))continue;
  const existed=fs.existsSync(dst);
  if(existed)fs.copyFileSync(dst,path.join(backup,file),fs.constants.COPYFILE_EXCL);
  const temp=dst+'.phase4-'+process.pid+'.tmp';
  fs.copyFileSync(source,temp,fs.constants.COPYFILE_EXCL);
  try{fs.renameSync(temp,dst);}finally{if(fs.existsSync(temp))fs.rmSync(temp);}
  changed.push({dst,existed,file});
 }
}catch(e){for(const x of changed.reverse()){
 if(x.existed)fs.copyFileSync(path.join(backup,x.file),x.dst);else fs.rmSync(x.dst,{force:true});
 }throw e;}
console.log('[STEP7 PHASE4] Local paid STEP1-7/7-1/7-2 worker linked (default mode OFF).');
console.log('[STEP7 PHASE4] Cloud Run still blocked; no API calls, no production publication. Backup:',backup);
