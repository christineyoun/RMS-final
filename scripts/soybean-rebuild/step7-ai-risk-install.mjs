/** Fail-closed SHA-256 installer. Only six source files, no saved RMS data or Cloud Run. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const directory=path.dirname(fileURLToPath(import.meta.url));
const project=path.resolve(directory,'..','..');
const packageRoot=path.resolve(project,'rms-step7-ai-risk');
const manifest=JSON.parse(fs.readFileSync(path.join(packageRoot,'manifest.json'),'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const checkOnly=process.argv.includes('--check-only');
if(process.argv.some(x=>x!=='--check-only'&&x!=='--install'&&x!==process.argv[0]&&x!==process.argv[1]))throw Error('Unknown option');
const possibilities=[];
for(const [variant,entries] of Object.entries(manifest)){
 let originals=true,done=true;
 for(const [rel,entry] of Object.entries(entries)){
  const file=path.join(project,rel);
  if(!file.startsWith(project+path.sep)||!entry.newSha256)throw Error('Unsafe manifest entry');
  const current=fs.existsSync(file)?sha(fs.readFileSync(file)):null;
  if(current!==entry.oldSha256)originals=false;
  if(current!==entry.newSha256)done=false;
 }
 if(originals||done)possibilities.push({variant,state:done?'installed':'original-known',entries});
}
if(!possibilities.length)throw Error('[STEP7 AI RISK] REFUSED: Unknown/mixed file versions. No changes. Avoid overwriting manual edits.');
// Multiple variants can match only if identical overall manifest states; prefer exact match.
const chosen=possibilities.find(p=>p.state==='installed')||possibilities[0];
console.log('[STEP7 AI RISK] Compatible:',chosen.variant,'state:',chosen.state,'files:',Object.keys(chosen.entries).length);
console.log('[STEP7 AI RISK] No Gemini, no saved STEP1-7 reports, no RMS publication or Cloud Run changes.');
if(checkOnly){console.log('[STEP7 AI RISK] CHECK ONLY: 0 writes.');process.exit(0);}
if(chosen.state==='installed'){console.log('[STEP7 AI RISK] Already installed: nothing to change.');process.exit(0);}
const files=Object.entries(chosen.entries).map(([rel,entry])=>{
 const dest=path.join(project,rel);
 const payload=path.join(packageRoot,'payload',chosen.variant,rel);
 if(!fs.existsSync(payload))throw Error('Missing payload: '+rel);
 const bytes=fs.readFileSync(payload);
 if(sha(bytes)!==entry.newSha256)throw Error('Payload checksum mismatch: '+rel);
 return {rel,dest,entry,bytes};
});
// All preflight checks pass before any write.
const backup=path.join(project,'.rms-research-patches','backup',`step7-ai-risk-${new Date().toISOString().replace(/[:.]/g,'-')}`);
fs.mkdirSync(backup,{recursive:true});
const written=[];
try {
 for(const f of files){
  if(fs.existsSync(f.dest)){
   const out=path.join(backup,f.rel);fs.mkdirSync(path.dirname(out),{recursive:true});fs.copyFileSync(f.dest,out);
  }
 }
 for(const f of files){
  fs.mkdirSync(path.dirname(f.dest),{recursive:true});
  const tmp=f.dest+'.ai-risk-stage-'+process.pid;
  fs.writeFileSync(tmp,f.bytes,{flag:'wx'});
  fs.renameSync(tmp,f.dest);
  written.push(f);
 }
 console.log('[STEP7 AI RISK] Installed:',files.map(f=>f.rel).join(', '));
 console.log('[STEP7 AI RISK] Backup:',backup);
 console.log('[STEP7 AI RISK] Legacy reports unchanged; only newly generated STEP7 reports can contain Gemini procurementRisk.');
}catch(e){
 for(const f of [...written].reverse()){
  const saved=path.join(backup,f.rel);
  if(fs.existsSync(saved))fs.copyFileSync(saved,f.dest);else fs.rmSync(f.dest,{force:true});
 }
 throw e;
}
