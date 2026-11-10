/** Safe installer: never overwrite unexpected local edits or earlier evidence. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const hash=(p:string)=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const allowed:Record<string,string[]>={
  'step7-core.ts':[
    '8180b044af651d7c81d5de21d8fb453888b1bb5c3eb7e67fe1bb0827f9870ef8', // initial STEP6/STEP7
    'd787d01a3b62d10ecbd70d4154e17af23bb0b554aa5c4e11a2304fc0796aa3e7', // RMS card patch
  ],
  'step7-run.ts':[
    '36be01f686d71038af085620fc6d6aa3c020946e59c7deaf16813931d89898a9', // initial STEP6/STEP7
    'ab3f2bfb695ad7cbdcecf47cb192c3ee8e03f47763e451f6355c425e2240e7ec', // output safety patch
  ],
};
export function installStep7Quality(root=process.cwd(),patchRoot=path.join(root,'step7-quality-patch')){
  const candidates=Object.keys(allowed).map(name=>({name,
    dst:path.join(root,'scripts','soybean-rebuild',name),
    src:path.join(patchRoot,'files',name)}));
  for(const c of candidates){
    if(!fs.existsSync(c.dst)||!fs.existsSync(c.src))throw Error('Missing expected STEP7 file: '+c.name);
  }
  const changes=candidates.map(c=>({...c,oldHash:hash(c.dst),newHash:hash(c.src)}));
  // Reject *any* unknown file before touching anything.
  for(const c of changes){
    if(c.oldHash!==c.newHash&&!allowed[c.name].includes(c.oldHash))
      throw Error(`Unexpected local edits in ${c.name}: patch cancelled WITHOUT changes. Back up and review manually.`);
  }
  if(changes.every(c=>c.oldHash===c.newHash)){
    console.log('[STEP7 QUALITY INSTALL] Already installed. No changes.');return;
  }
  const backupRoot=path.join(root,'.rms-soybean-rebuild','backup');
  fs.mkdirSync(backupRoot,{recursive:true});
  const backup=fs.mkdtempSync(path.join(backupRoot,'step7-quality-'));
  for(const c of changes)fs.copyFileSync(c.dst,path.join(backup,c.name));
  const updated:typeof changes=[];
  const staged:string[]=[];
  try{
    for(const c of changes.filter(c=>c.oldHash!==c.newHash)){
      const temp=c.dst+'.quality-patch-tmp';
      if(fs.existsSync(temp))throw Error('Unexpected temporary file: '+temp);
      fs.copyFileSync(c.src,temp);staged.push(temp);
      fs.renameSync(temp,c.dst);updated.push(c);
    }
  }catch(err){
    for(const c of updated)fs.copyFileSync(path.join(backup,c.name),c.dst);
    for(const name of staged)try{fs.rmSync(name,{force:true});}catch{}
    throw err;
  }
  console.log('[STEP7 QUALITY INSTALL] Updated:',updated.map(c=>c.name).join(', '));
  console.log('[STEP7 QUALITY INSTALL] Backup:',backup);
  console.log('[STEP7 QUALITY INSTALL] STEP 1-6, saved results, RMS/Cloud Run untouched.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))installStep7Quality();
