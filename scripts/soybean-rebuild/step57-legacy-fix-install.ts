/** Offline, SHA-pinned compatibility patch. No original analysis JSON is ever modified. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

type Entry={before:string|null;after:string};
const sha=(buf:Buffer)=>crypto.createHash('sha256').update(buf).digest('hex');
const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-');
export function installStep57Legacy(root=process.cwd(),checkOnly=false){
 const srcDir=path.join(root,'scripts','soybean-rebuild');
 const packageDir=path.join(root,'step57-legacy-fix');
 const manifest=JSON.parse(fs.readFileSync(path.join(packageDir,'manifest.json'),'utf8')) as Record<string,Entry>;
 const expected=['step5-local.ts','step5-decision-local.ts','step6-core.ts','step4-legacy-compat.ts'];
 if(JSON.stringify(Object.keys(manifest).sort())!==JSON.stringify(expected.sort()))throw Error('REFUSED: unexpected manifest.');
 const sources=new Map<string,Buffer>();
 const previous=new Map<string,Buffer|null>();
 const states:string[]=[];
 for(const name of expected){
  const entry=manifest[name];
  const content=fs.readFileSync(path.join(packageDir,'files',name));
  if(sha(content)!==entry.after)throw Error(`REFUSED: payload mismatch: ${name}`);
  const dest=path.join(srcDir,name);
  const current=fs.existsSync(dest)?fs.readFileSync(dest):null;
  const currentHash=current?sha(current):null;
  const status=currentHash===entry.after?'installed':currentHash===entry.before?'original-known':'unexpected';
  if(status==='unexpected')throw Error(`REFUSED: unknown local modifications in ${name}; ZERO files changed.`);
  sources.set(name,content);previous.set(name,current);states.push(status);
 }
 const stage=states.every(x=>x==='installed')?'already-installed':states.every(x=>x==='original-known')?'original-known':'mixed-refused';
 if(stage==='mixed-refused')throw Error('REFUSED: mixed state. ZERO files changed.');
 console.log('[STEP5-7 LEGACY FIX] Verified target files:',expected.length);
 console.log('[STEP5-7 LEGACY FIX] State:',stage);
 if(checkOnly||stage==='already-installed'){
  console.log('[STEP5-7 LEGACY FIX]',JSON.stringify({status:checkOnly?'checked':stage,updated:0,backup:null}));
  return {status:stage,updated:0,backup:null};
 }
 const backup=path.join(root,'.rms-soybean-rebuild','backup',`step57-legacy-compat-${stamp()}`);
 const written:string[]=[];
 try{
  fs.mkdirSync(backup,{recursive:true});
  for(const name of expected){
   const prior=previous.get(name)!;
   if(prior)fs.writeFileSync(path.join(backup,name),prior,{flag:'wx'});
  }
  for(const name of expected){
   const dest=path.join(srcDir,name);
   const tmp=dest+'.legacy-compat.tmp';
   fs.writeFileSync(tmp,sources.get(name)!,{flag:'wx'});
   try{fs.renameSync(tmp,dest);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
   written.push(name);
  }
 }catch(e){
  for(const name of written.reverse()){
   const dest=path.join(srcDir,name),prior=previous.get(name);
   if(prior)fs.writeFileSync(dest,prior);
   else if(fs.existsSync(dest))fs.unlinkSync(dest);
  }
  throw Error(`Installation rolled back: ${e instanceof Error?e.message:String(e)}`);
 }
 console.log('[STEP5-7 LEGACY FIX]',JSON.stringify({status:'installed',updated:expected.length,backup}));
 console.log('[STEP5-7 LEGACY FIX] No Gemini calls, no JSON/MD evidence modified, no Cloud Run/RMS changes.');
 return {status:'installed',updated:expected.length,backup};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{installStep57Legacy(process.cwd(),process.argv.includes('--check-only'));}
 catch(e){console.error('[STEP5-7 LEGACY FIX]',e instanceof Error?e.message:String(e));process.exitCode=2;}
}
