/** Offline, hash-pinned STEP5-7 installer. Never runs Gemini, downloads, or RMS publication. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

type H={before:string|null;after:string};
const sha=(b:Buffer)=>crypto.createHash('sha256').update(b).digest('hex');
const timeStamp=()=>new Date().toISOString().replace(/[:.]/g,'-');
export function installStep57(root=process.cwd(),checkOnly=false){
 const directory=path.join(root,'scripts','soybean-rebuild');
 const patchRoot=path.join(root,'step57-common-patch');
 const manifest=JSON.parse(fs.readFileSync(path.join(patchRoot,'manifest.json'),'utf8')) as Record<string,H>;
 const names=Object.keys(manifest);
 if(names.length!==11||names.some(n=>!/^step[\w.-]+\.ts$/.test(n)||n.includes('..')))throw Error('Invalid installer manifest. REFUSED.');
 const states:string[]=[];
 const payloads=new Map<string,Buffer>();
 for(const name of names){
  const dest=path.join(directory,name),source=path.join(patchRoot,'files',name),hash=manifest[name];
  const payload=fs.readFileSync(source);
  if(sha(payload)!==hash.after)throw Error(`REFUSED: patch checksum mismatch: ${name}`);
  const old=fs.existsSync(dest)?sha(fs.readFileSync(dest)):null;
  const status=old===hash.after?'installed':old===hash.before?'original-known':'unexpected-version';
  states.push(status);payloads.set(name,payload);
  if(status==='unexpected-version')throw Error(`REFUSED: unknown user modifications in ${name}; no files changed.`);
 }
 const status=states.every(x=>x==='installed')?'already-installed':states.every(x=>x==='original-known')?'original-known':'mixed-refused';
 if(status==='mixed-refused')throw Error('REFUSED: mixed installed/original state; manual reconciliation required. No files changed.');
 console.log(`[STEP5-7 INSTALL] Compatible target files verified: ${names.length}`);
 console.log('[STEP5-7 INSTALL] Current state:',status);
 if(checkOnly||status==='already-installed'){
  console.log('[STEP5-7 INSTALL]',JSON.stringify({status:checkOnly?'checked':status,updated:0,backup:null}));
  console.log('[STEP5-7 INSTALL] STEP1-7 saved JSON/MD, RMS UI and Cloud Run unchanged.');
  return {status,updated:0,backup:null};
 }
 const backup=path.join(root,'.rms-soybean-rebuild','backup',`step57-common-${timeStamp()}`);
 const prior=new Map<string,Buffer|null>();
 let changed:string[]=[];
 try{
  fs.mkdirSync(backup,{recursive:true});
  for(const name of names){
   const dest=path.join(directory,name),old=fs.existsSync(dest)?fs.readFileSync(dest):null;
   prior.set(name,old);
   if(old!==null)fs.writeFileSync(path.join(backup,name),old,{flag:'wx'});
  }
  for(const name of names){
   const dest=path.join(directory,name),tmp=dest+'.step57-install-tmp';
   fs.writeFileSync(tmp,payloads.get(name)!,{flag:'wx'});
   try{fs.renameSync(tmp,dest);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
   changed.push(name);
  }
 }catch(err){
  for(const name of changed.reverse()){
   const dest=path.join(directory,name),old=prior.get(name);
   if(old===null){if(fs.existsSync(dest))fs.unlinkSync(dest);}
   else if(old)fs.writeFileSync(dest,old);
  }
  throw Error(`Installation rolled back: ${err instanceof Error?err.message:String(err)}`);
 }
 console.log('[STEP5-7 INSTALL]',JSON.stringify({status:'installed',updated:names.length,backup}));
 console.log('[STEP5-7 INSTALL] No Gemini API calls, no STEP1-7 saved evidence or RMS publication touched.');
 return {status:'installed',updated:names.length,backup};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{installStep57(process.cwd(),process.argv.includes('--check-only'));}
 catch(e){console.error('[STEP5-7 INSTALL]',e instanceof Error?e.message:e);process.exitCode=2;}
}
