/** Install only known STEP1-4 versions. Refuse unknown edits and preserve all paid snapshots.
 * No network, Gemini, Google Search, RMS state, or publication calls.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
type Fingerprint={before:string|null;after:string};
const FINGERPRINTS:Record<string,Fingerprint>={
  "step1-google.ts": {
    "before": "ea7c4b65d7a09e9d4ab4269bee3ff32a957d7f2c0eb9ac5dc64fe5b0d1e41320",
    "after": "37e0476a7ac32ff292372f43491a7b0ea4611518723933bd9549c5cea28a389d"
  },
  "source-grade.ts": {
    "before": "dfac2b3ed32be4985bcf80d10e1e9cdfd7c1bc7f55e06ceca18710ced36eb855",
    "after": "2bc222dd224a5f8381875c76fb14fe86ad2ae10b97e933079f1a21e3f4afe914"
  },
  "step2-verify.ts": {
    "before": "9c00ccf038c7f33cbbac74eb286bbc8c381988f5922a95e9c04b4eae0ed223f3",
    "after": "e3904b3f2573727c24474255e11335d2d4a9135a9c88b49e42ef290581caee02"
  },
  "step3-evidence.ts": {
    "before": "bdaa4ec4bf444178f5d27d0ff9c565e34ad48e044ef2eec748d53a2813e719e8",
    "after": "d3a5adf22131df0942222e379ae53e6be65744ea9117df0876d037d55db1dbd5"
  },
  "step3-extract.ts": {
    "before": "57fc33c1abd8163925b13769c2ce5d81a9b9f371922536ca2e29d319ae8fb5b7",
    "after": "ae164b751ee22b12fab663ba6b724d297f4ce61e63aa981dd4f5e156b4c87d45"
  },
  "step4-pipeline.ts": {
    "before": "4d0b8b79bedc9d103d34402cc68e745272fc58b6d4f620b87dfe3334464b0985",
    "after": "4ea446b7d28ce8d8193710d1e330e80dce9389bf0cfb6d9c77a48cae7d4aab55"
  },
  "step4-analyze.ts": {
    "before": "8566bf75588e1c52b908a1890c3da46c24b03431e2074bad862ad588047031e0",
    "after": "56e2050a9000a787aa8ddc31db17e57876abb1af751a15f55e9d595a9d099089"
  },
  "step4-diagnose.ts": {
    "before": "fc78c595727f5eed42677d40bc4290df9a445a8ecbacfef38de5053144ae72e8",
    "after": "3428981f7e8f0eb5449bbf0171c484177ed7473ad474edcad73d9ea444320943"
  },
  "commodity-config.ts": {
    "before": null,
    "after": "7254afed30688c0d3ec8da087055c940eb4e829936b2545abfeaf49bbeb8cbc8"
  },
  "commodity-aliases.ts": {
    "before": null,
    "after": "1078536467b6accf8dda13068fb3fc4d5b8582f1c3f452adcccf3acc2d17ae2d"
  },
  "step14-common.test.ts": {
    "before": null,
    "after": "578a2c03bc616c55d33b2d45ca1f6fb1e8a3464c4d75aeae0789c88bc827d94c"
  },
  "step14-common-preview.ts": {
    "before": null,
    "after": "6e4390b7bcc8d420411f61ec5faec819a9683e4094c120ebeb385ac3d229cc91"
  }
};
const changed=Object.keys(FINGERPRINTS).filter(x=>FINGERPRINTS[x].before!==null);
const added=Object.keys(FINGERPRINTS).filter(x=>FINGERPRINTS[x].before===null);
const digest=(buf:Buffer)=>crypto.createHash('sha256').update(buf).digest('hex');
export function installStep14(projectRoot:string=process.cwd(),checkOnly=false):{status:'checked'|'installed'|'already-installed';updated:number;backup:string|null}{
  const targetDir=path.join(projectRoot,'scripts','soybean-rebuild');
  const patchDir=path.join(projectRoot,'step14-common-patch','files');
  const staged=new Map<string,Buffer>();
  for(const [name,hash] of Object.entries(FINGERPRINTS)){
    const source=path.join(patchDir,name);
    if(!fs.existsSync(source))throw Error(`Patch payload missing: ${source}`);
    const content=fs.readFileSync(source);
    if(digest(content)!==hash.after)throw Error(`Patch payload checksum mismatch: ${name}`);
    staged.set(name,content);
  }
  // Validate EVERY target first. No writes of any kind until all hashes match.
  const before=new Map<string,Buffer|null>();
  const states=new Map<string,'before'|'after'>();
  for(const [name,hash] of Object.entries(FINGERPRINTS)){
    const target=path.join(targetDir,name);
    const exists=fs.existsSync(target);
    if(exists && !fs.statSync(target).isFile())throw Error(`Not a regular file: ${target}`);
    const content=exists?fs.readFileSync(target):null;
    before.set(name,content);
    const current=content?digest(content):null;
    if(current===hash.after)states.set(name,'after');
    else if(current===hash.before)states.set(name,'before');
    else throw Error(`REFUSED: ${name} has unexpected local changes or is missing. No files changed. Contact us to adapt the patch safely.`);
  }
  const countBefore=[...states.values()].filter(x=>x==='before').length;
  const countAfter=[...states.values()].filter(x=>x==='after').length;
  if(countBefore&&countAfter)throw Error('REFUSED: mixed old/new STEP1-4 installation; no files changed.');
  if(checkOnly){
    console.log('[STEP1-4 INSTALL] CHECK ONLY. Compatible target files verified:',Object.keys(FINGERPRINTS).length);
    console.log('[STEP1-4 INSTALL] Current state:',countAfter?'already-installed':'original-known');
    return {status:'checked',updated:0,backup:null};
  }
  if(!countBefore)return {status:'already-installed',updated:0,backup:null};
  // Copy before replacing. Originals and outputs are never deleted or overwritten.
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const backup=path.join(projectRoot,'.rms-soybean-rebuild','backup',`step14-common-${stamp}`);
  fs.mkdirSync(backup,{recursive:true});
  for(const name of changed){
    const contents=before.get(name);
    if(!contents)throw Error('Original file unexpectedly unavailable: '+name);
    fs.writeFileSync(path.join(backup,name),contents,{flag:'wx'});
  }
  fs.writeFileSync(path.join(backup,'manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),hashes:FINGERPRINTS,changed},null,2),{flag:'wx'});
  const applied:string[]=[];
  try{
    for(const [name,content] of staged){
      const target=path.join(targetDir,name);
      const temporary=path.join(targetDir,`.${name}.step14-install-${process.pid}.tmp`);
      try{fs.writeFileSync(temporary,content,{flag:'wx'});fs.renameSync(temporary,target);}
      finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
      applied.push(name);
    }
  }catch(err){
    for(const name of applied.reverse()){
      const original=before.get(name);
      const target=path.join(targetDir,name);
      if(original)fs.writeFileSync(target,original);
      else if(fs.existsSync(target))fs.unlinkSync(target);
    }
    throw err;
  }
  return {status:'installed',updated:applied.length,backup};
}
const invoked=process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  const result=installStep14(process.cwd(),process.argv.includes('--check-only'));
  console.log('[STEP1-4 INSTALL]',JSON.stringify(result));
  console.log('[STEP1-4 INSTALL] No STEP1-7 evidence, Cloud Run or published RMS data touched.');
}
