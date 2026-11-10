/** Safe, SHA-pinned single-file install of STEP7 numeric-buying-price validator fix. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const args=process.argv.slice(2);
if(args.length>1||(args.length===1&&args[0]!=='--check-only')){
  console.error('Usage: node scripts/soybean-rebuild/step7-price-guard-install.mjs [--check-only]');process.exit(2);
}
const checkOnly=args.includes('--check-only');
if(process.env.K_SERVICE||process.env.CLOUD_RUN_JOB||process.env.NODE_ENV==='production')
  throw Error('Local development only. Production and Cloud Run blocked.');
const root=process.cwd();
const patchRoot=path.join(root,'rms-step7-price-guard');
const manifest=JSON.parse(fs.readFileSync(path.join(patchRoot,'manifest.json'),'utf8'));
if(manifest.target!=='scripts/soybean-rebuild/step7-core.ts'||manifest.filesModifiedByInstaller!==1)
  throw Error('Unexpected patch manifest: installation refused.');
const relative=manifest.target;
const target=path.join(root,relative),source=path.join(patchRoot,'payload',relative);
const sha=(buf)=>crypto.createHash('sha256').update(buf).digest('hex');
const replacement=fs.readFileSync(source);
if(sha(replacement)!==manifest.patchedSha256)throw Error('Patch payload hash mismatch. No files touched.');
if(!fs.existsSync(target))throw Error('STEP7 core missing. No files touched.');
const original=fs.readFileSync(target),actual=sha(original);
let state;
if(actual===manifest.expectedSha256)state='original-known';
else if(actual===manifest.patchedSha256)state='already-installed';
else throw Error(`Unexpected STEP7 core version (${actual}). No files touched; do NOT force overwrite.`);
console.log('[STEP7 PRICE GUARD] Compatible:',state,'/ files to change:',state==='original-known'?1:0);
console.log('[STEP7 PRICE GUARD] Scope: ONE existing step7-core.ts function. No STEP7-2/3 installed.');
if(checkOnly){console.log('[STEP7 PRICE GUARD] CHECK ONLY: no writes, no API, no publication.');process.exit(0);}
if(state==='already-installed'){console.log('[STEP7 PRICE GUARD] Already installed: nothing changed.');process.exit(0);}
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const backupDir=path.join(root,'.rms-research-patches','backup',`step7-price-guard-${stamp}`);
const backup=path.join(backupDir,'step7-core.ts');
fs.mkdirSync(backupDir,{recursive:true});
fs.copyFileSync(target,backup,fs.constants.COPYFILE_EXCL);
if(sha(fs.readFileSync(backup))!==manifest.expectedSha256)throw Error('Backup check failed, refusing install.');
// Refuse to overwrite any concurrent/manual edit.
if(sha(fs.readFileSync(target))!==manifest.expectedSha256)throw Error('STEP7 changed during install. Backup exists but no replacement.');
const temp=target+`.price-guard-${process.pid}.tmp`;
try{
  fs.writeFileSync(temp,replacement,{flag:'wx'});
  if(sha(fs.readFileSync(temp))!==manifest.patchedSha256)throw Error('Temporary payload hash mismatch.');
  fs.renameSync(temp,target);
  if(sha(fs.readFileSync(target))!==manifest.patchedSha256)throw Error('Installed hash mismatch. Restore from backup.');
}catch(err){
  try{if(fs.existsSync(temp))fs.unlinkSync(temp);}catch{}
  if(sha(fs.readFileSync(target))!==manifest.expectedSha256)fs.copyFileSync(backup,target);
  throw err;
}
console.log('[STEP7 PRICE GUARD] INSTALLED: one source file updated.');
console.log('[STEP7 PRICE GUARD] Backup:',backup);
console.log('[STEP7 PRICE GUARD] No evidence JSON, market reports, RMS publication, or Cloud Run touched.');
