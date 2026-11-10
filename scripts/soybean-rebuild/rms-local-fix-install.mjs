/** Apply minimal local-only RMS UI + research robustness patch; no network/API. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=process.cwd();
const payload=path.join(root,'rms-local-fix');
const manifest=JSON.parse(fs.readFileSync(path.join(payload,'manifest.json'),'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const checkOnly=process.argv.includes('--check-only');
if(process.argv.some(x=>x.startsWith('--')&&x!=='--check-only'))throw Error('Unknown flag. Use --check-only or no flags.');
// Previous STEP7 gateway patch is already in the user's RMS. The Stage3
// middleware is the first response handler. Verify its local-only hook exists,
// but NEVER replace this large shared server module with an older snapshot.
const gateway=path.join(root,'src','server','stage3DailyUpdates.ts');
const gatewayText=fs.existsSync(gateway)?fs.readFileSync(gateway,'utf8'):'';
if(!gatewayText.includes('STEP7 LOCAL PREVIEW BEFORE SAVED STAGE3 SNAPSHOT ROUTING')||
   !gatewayText.includes('readStep7LocalPreview(commodity,req.socket.remoteAddress)'))
 throw Error('Missing previous STEP7_GATEWAY_FIX. Install and test that local-only patch before this update; no changes made.');
const work=[];
for(const [rel,entry] of Object.entries(manifest)){
  if(!/^(?:scripts\/soybean-rebuild|src\/server)\/[\w-]+\.(?:ts|mjs)$/.test(rel))throw Error('Unsafe path '+rel);
  const source=path.join(payload,'files',rel),dest=path.join(root,rel);
  const data=fs.readFileSync(source);if(sha(data)!==entry.newSha256)throw Error('Tampered patch payload: '+rel);
  const actual=fs.existsSync(dest)?sha(fs.readFileSync(dest)):null;
  if(entry.mode==='optional-api-hook'){
    if(actual===entry.newSha256){console.log('[LOCAL PATCH] RMS endpoint preview hook already active');continue;}
    if(actual!==entry.oldSha256)throw Error('RMS endpoint changed from known version; refuse editing '+rel);
  }else if(entry.mode==='replace'){
    if(actual===entry.newSha256)continue;
    if(actual!==entry.oldSha256)throw Error('Unknown file version; no changes made: '+rel);
  }else if(entry.mode==='require-exact-or-create'){
    if(actual===entry.newSha256)continue;
    if(actual!==null)throw Error('Existing adapter differs: '+rel);
  }else throw Error('Unknown patch mode '+entry.mode);
  work.push({rel,dest,data,original:actual===null?null:fs.readFileSync(dest)});
}
console.log('[LOCAL PATCH] Compatible; files to apply:',work.length);
console.log('[LOCAL PATCH] Cloud Run and RMS scheduled publication are NEVER accessed.');
if(checkOnly){console.log('[LOCAL PATCH] CHECK ONLY: no files written, no Gemini calls.');process.exit(0);}
if(!work.length){console.log('[LOCAL PATCH] Already installed; no changes.');process.exit(0);}
const backup=path.join(root,'.rms-research-patches','backup','local-card-'+new Date().toISOString().replace(/[:.]/g,'-'));
const applied=[];
try{
  for(const item of work){
    if(item.original){const b=path.join(backup,item.rel);fs.mkdirSync(path.dirname(b),{recursive:true});fs.writeFileSync(b,item.original,{flag:'wx'});}
  }
  // Backups safely on disk before first write; never edit the research JSON or publication files.
  for(const item of work){
    fs.mkdirSync(path.dirname(item.dest),{recursive:true});const temp=item.dest+'.rms-local-temp';
    if(fs.existsSync(temp))throw Error('Stale temporary file requires manual inspection '+temp);
    fs.writeFileSync(temp,item.data,{flag:'wx'});
    try{fs.renameSync(temp,item.dest);}catch(e){try{fs.rmSync(temp,{force:true});}catch{}throw e;}
    applied.push(item);
  }
}catch(e){
  for(const item of applied.reverse()){
    if(item.original)fs.writeFileSync(item.dest,item.original);
    else fs.rmSync(item.dest,{force:true});
  }
  throw e;
}
console.log('[LOCAL PATCH] Installed:',work.map(x=>x.rel).join(', '));
console.log('[LOCAL PATCH] Backup:',backup);
console.log('[LOCAL PATCH] NO saved STEP1-7 JSON/MD, production RMS or Cloud Run touched.');
