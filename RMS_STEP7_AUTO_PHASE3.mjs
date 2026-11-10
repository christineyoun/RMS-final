import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=process.cwd(),source=import.meta.dirname;
const manifest=JSON.parse(fs.readFileSync(path.join(source,'phase3-manifest.json'),'utf8'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if(!fs.existsSync(path.join(root,'package.json')))throw Error('Run from current RMS project root');
const patches={
 'scripts/cloud/scheduledStep7.ts':'scheduledStep7.ts',
 'scripts/soybean-rebuild/research-pipeline-runner.mjs':'research-pipeline-runner.mjs',
 'scripts/soybean-rebuild/commodity-config.ts':'commodity-config.ts',
};
const current={};const targets=[];let needed=0;
for(const [name,filename]of Object.entries(patches)){
 const target=path.join(root,name),payload=path.join(source,filename);
 if(!fs.existsSync(target))throw Error('Missing expected file: '+name);
 const live=hash(target),replacement=hash(payload);
 if(live!==replacement&&live!==manifest.inputs[name])throw Error('Unexpected modification in '+name+'; no changes made');
 current[name]=live;targets.push({name,target,payload});if(live!==replacement)needed++;
}
for(const [name,expected]of Object.entries(manifest.protected)){
 if(hash(path.join(root,name))!==expected)throw Error('Protected baseline differs: '+name+'; no changes made');
}
const pub=fs.readFileSync(path.join(root,'scripts/cloud/publication.ts'),'utf8');
const anchors=['run=await runner.check()','aiResult=await runAi','step7Result=await step7','await(options.publishOverview'];
if(anchors.some(x=>!pub.includes(x))||anchors.some((x,i)=>i&&pub.indexOf(x)<=pub.indexOf(anchors[i-1])))
 throw Error('Free/news/STEP7/overview order changed: no changes made');
console.log('[STEP7 PHASE3] Protected price/weather/supply/MI sources unchanged; 3 candidate files validated.');
console.log('[STEP7 PHASE3] Files to update:',needed,'/3; no cloud publication or Gemini.');
if(process.argv.includes('--check-only')){console.log('[STEP7 PHASE3] CHECK ONLY');process.exit(0);}
if(!needed){console.log('[STEP7 PHASE3] Already applied.');process.exit(0);}
const bdir=path.join(root,'.rms-research-patches','backup','auto-phase3-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(bdir,{recursive:true});
const changed=[];
try{
 for(const t of targets){
  if(hash(t.target)===hash(t.payload))continue;
  const bfile=path.join(bdir,path.basename(t.target));
  fs.copyFileSync(t.target,bfile,fs.constants.COPYFILE_EXCL);
  // Copy atomically, retaining exact original backup for rollback.
  const tmp=t.target+'.phase3-'+process.pid+'.tmp';
  try{fs.copyFileSync(t.payload,tmp,fs.constants.COPYFILE_EXCL);fs.renameSync(tmp,t.target);}finally{if(fs.existsSync(tmp))fs.rmSync(tmp);}
  changed.push({target:t.target,bfile});
 }
}catch(e){for(const t of changed.reverse())fs.copyFileSync(t.bfile,t.target);throw e;}
console.log('[STEP7 PHASE3] Date-scoped fresh research paths enabled for scheduled worker only.');
console.log('[STEP7 PHASE3] Existing manual previews/checkpoints unchanged. NO Gemini calls.');
console.log('[STEP7 PHASE3] Backup:',bdir);
