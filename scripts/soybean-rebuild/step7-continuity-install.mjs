/** Existing v1 STEP7-1 files -> v2 best-effort continuity. SHA pinned, backups, atomic rollback. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
const root=process.cwd(),base=path.dirname(fileURLToPath(import.meta.url));
const input=path.join(root,'.rms-step71-continuity','files'),manifestFile=path.join(root,'.rms-step71-continuity','manifest.json');
if(!fs.existsSync(manifestFile))throw Error('Patch payload missing. Expand the ZIP at the RMS project root.');
const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const checkOnly=process.argv.includes('--check-only');
const changes=[];
for(const [name,info] of Object.entries(manifest.files)){
 const dest=path.join(root,'scripts','soybean-rebuild',name),src=path.join(input,name);
 if(!fs.existsSync(src)||hash(src)!==info.newHash)throw Error('Patch payload checksum mismatch: '+name);
 const installed=fs.existsSync(dest)?hash(dest):null;
 if(installed===info.newHash)continue;
 if(installed!==info.oldHash)throw Error(`Existing ${name} differs from the known installed version. STOP; no files changed.`);
 changes.push({name,dest,src});
}
for(const [name,info] of Object.entries(manifest.prerequisite)){
 const fn=path.join(root,name);
 if(!fs.existsSync(fn)||!info.includes(hash(fn)))throw Error('Unexpected prerequisite version: '+name+'; no files changed.');
}
console.log('[STEP7 CONTINUITY] Compatible / file updates:',changes.length,'/ previously generated reports unchanged.');
if(checkOnly){console.log('[STEP7 CONTINUITY] CHECK ONLY: no writes.');process.exit(0);}
if(process.env.NODE_ENV==='production'||process.env.K_SERVICE||process.env.CLOUD_RUN_JOB)throw Error('Local-only installer');
if(!changes.length){console.log('[STEP7 CONTINUITY] Already installed.');process.exit(0);}
const backup=path.join(root,'.rms-research-patches','backup','step71-continuity-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
const applied=[];
try{
 for(const f of changes){
  if(fs.existsSync(f.dest))fs.copyFileSync(f.dest,path.join(backup,f.name),fs.constants.COPYFILE_EXCL);
 }
 for(const f of changes){
  const temp=f.dest+`.patching-${process.pid}`;
  fs.copyFileSync(f.src,temp,fs.constants.COPYFILE_EXCL);
  try{fs.renameSync(temp,f.dest);}catch(e){if(fs.existsSync(temp))fs.unlinkSync(temp);throw e;}
  applied.push(f);
 }
}catch(e){
 for(const f of applied.reverse()){
  const old=path.join(backup,f.name);
  if(fs.existsSync(old))fs.copyFileSync(old,f.dest);
  else if(fs.existsSync(f.dest))fs.unlinkSync(f.dest);
 }
 throw e;
}
console.log('[STEP7 CONTINUITY] Updated:',changes.map(f=>f.name).join(', '));
console.log('[STEP7 CONTINUITY] Original scripts backed up at:',path.relative(root,backup));
console.log('[STEP7 CONTINUITY] NO changes to STEP 1-7, any source JSON, preview data, Cloud Run, publication, or env keys.');
