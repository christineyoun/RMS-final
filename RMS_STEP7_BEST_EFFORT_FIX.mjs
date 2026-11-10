/** User-invoked local-only patch installer. No API calls or Cloud Run publication. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=process.cwd(),pack=path.dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(fs.readFileSync(path.join(pack,'RMS_STEP7_BEST_EFFORT_PAYLOAD','manifest.json'),'utf8'));
const checkOnly=process.argv.includes('--check-only');
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const changed=Object.keys(manifest.expected),all=Object.keys(manifest.payload),pending=[];
if(!fs.existsSync(path.join(root,'package.json')))throw Error('Run this in the RMS root (package.json required)');
for(const rel of all){
 const target=path.join(root,rel),payload=path.join(pack,'RMS_STEP7_BEST_EFFORT_PAYLOAD',rel);
 if(!fs.existsSync(payload)||hash(fs.readFileSync(payload))!==manifest.payload[rel])throw Error('Patch payload invalid: '+rel);
 if(fs.existsSync(target)){
  const currentHash=hash(fs.readFileSync(target));
  if(currentHash===manifest.payload[rel])continue;
  if(!manifest.expected[rel]||currentHash!==manifest.expected[rel])throw Error('Unrecognized local changes; no files updated: '+rel);
 }else if(manifest.expected[rel])throw Error('Missing existing source; no files updated: '+rel);
 pending.push(rel);
}
console.log('[STEP7 BEST EFFORT] Existing price/supply/weather/MI and viewer source: NOT IN PATCH');
console.log('[STEP7 BEST EFFORT] Files to apply:',pending.length,'/',all.length);
if(checkOnly){console.log('[STEP7 BEST EFFORT] CHECK ONLY; no changes, no API calls');process.exit(0);}
if(!pending.length){console.log('[STEP7 BEST EFFORT] Already applied; no changes');process.exit(0);}
const backup=path.join(root,'.rms-research-patches','backup','step7-best-effort-'+new Date().toISOString().replace(/[:.]/g,'-'));
const applied=[];
try{
 // Back up *all* existing files before modifying anything.
 for(const rel of pending)if(fs.existsSync(path.join(root,rel))){
  const saved=path.join(backup,rel);fs.mkdirSync(path.dirname(saved),{recursive:true});fs.copyFileSync(path.join(root,rel),saved);
 }
 for(const rel of pending){
  const dest=path.join(root,rel),src=path.join(pack,'RMS_STEP7_BEST_EFFORT_PAYLOAD',rel);
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  const tmp=dest+'.step7-pending-'+process.pid;
  fs.copyFileSync(src,tmp);fs.renameSync(tmp,dest);applied.push(rel);
 }
 console.log('[STEP7 BEST EFFORT] Applied:',applied.join(', '));
 console.log('[STEP7 BEST EFFORT] Backup:',backup);
 console.log('[STEP7 BEST EFFORT] No Gemini calls. No Cloud Run publication.');
}catch(error){
 for(const rel of applied.reverse()){
  const saved=path.join(backup,rel),dest=path.join(root,rel);
  if(fs.existsSync(saved))fs.copyFileSync(saved,dest);else if(fs.existsSync(dest))fs.unlinkSync(dest);
 }
 throw error;
}
