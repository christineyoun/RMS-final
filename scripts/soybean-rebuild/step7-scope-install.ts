/** Safe installer: updates only STEP7 core and adds procurement-scope guard + tests. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const digest=(p:string)=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
// SHA-256 of the STEP7 QUALITY PATCH version already installed by the user.
const expectedPriorCore='514fcdbba1248b3d731abfdfa7acf4a20ddea53b0dff8f3d59d05c020a24f584';

export function installStep7Scope(root=process.cwd()){
  const base=path.join(root,'scripts','soybean-rebuild');
  const patch=path.join(root,'step7-scope-patch','files');
  const names=['step7-core.ts','step7-scope.ts','step7-scope.test.ts','step7-scope-review.ts'];
  const changes=names.map(name=>({name,src:path.join(patch,name),dst:path.join(base,name)}));
  for(const c of changes)if(!fs.existsSync(c.src))throw Error('Patch file missing: '+c.src);
  if(!fs.existsSync(changes[0].dst))throw Error('Existing STEP7 core missing; patch not applied.');
  const corePrior=digest(changes[0].dst),coreNew=digest(changes[0].src);
  if(corePrior!==expectedPriorCore && corePrior!==coreNew)
    throw Error('Unexpected local edits or different STEP7 version in step7-core.ts. NO files changed.');
  for(const c of changes.slice(1)){
    if(fs.existsSync(c.dst)&&digest(c.dst)!==digest(c.src))
      throw Error('Unexpected existing '+c.name+'. NO files changed.');
  }
  if(changes.every(c=>fs.existsSync(c.dst)&&digest(c.dst)===digest(c.src))){
    console.log('[STEP7 SCOPE INSTALL] Already applied. No changes.');return;
  }
  const backupRoot=path.join(root,'.rms-soybean-rebuild','backup');
  fs.mkdirSync(backupRoot,{recursive:true});
  const backup=fs.mkdtempSync(path.join(backupRoot,'step7-scope-'));
  const copiedOriginals=changes.filter(c=>fs.existsSync(c.dst));
  for(const c of copiedOriginals)fs.copyFileSync(c.dst,path.join(backup,c.name));
  const applied:typeof changes=[];
  const staging:string[]=[];
  try{
    // Stage all updates before writing the targets.
    for(const c of changes.filter(c=>!fs.existsSync(c.dst)||digest(c.dst)!==digest(c.src))){
      const tmp=c.dst+'.scope-patch-temp';
      if(fs.existsSync(tmp))throw Error('Unexpected temporary file: '+tmp);
      fs.copyFileSync(c.src,tmp);staging.push(tmp);
    }
    for(const tmp of staging){
      const dest=tmp.slice(0,-'.scope-patch-temp'.length);
      const c=changes.find(x=>x.dst===dest)!;
      fs.renameSync(tmp,dest);applied.push(c);
    }
  }catch(e){
    for(const c of applied){
      if(copiedOriginals.some(x=>x.name===c.name))fs.copyFileSync(path.join(backup,c.name),c.dst);
      else fs.rmSync(c.dst,{force:true});
    }
    for(const tmp of staging)fs.rmSync(tmp,{force:true});
    throw e;
  }
  console.log('[STEP7 SCOPE INSTALL] Updated:',applied.map(x=>x.name).join(', '));
  console.log('[STEP7 SCOPE INSTALL] Backup:',backup);
  console.log('[STEP7 SCOPE INSTALL] STEP1-6, saved research data, RMS UI, Cloud Run unchanged.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))installStep7Scope();
