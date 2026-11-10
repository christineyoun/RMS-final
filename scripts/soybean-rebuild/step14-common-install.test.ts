import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {installStep14} from './step14-common-install.ts';
const here=path.dirname(fileURLToPath(import.meta.url));
const sourceDir=path.join(here,'..','..','step14-common-patch','files');
const patchManifest=JSON.parse(fs.readFileSync(path.join(here,'..','..','step14-common-patch','manifest.json'),'utf8')) as Record<string,{before:string|null;after:string}>;
const oldDir=path.resolve(here,'..','..','step14-common-patch','fixtures');
// Test operates only on synthetic project root and checks actual source snapshots.
function mkProject(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'step14-install-'));
 const target=path.join(root,'scripts','soybean-rebuild');
 fs.mkdirSync(target,{recursive:true});
 fs.mkdirSync(path.join(root,'step14-common-patch','files'),{recursive:true});
 for(const name of Object.keys(patchManifest)){
   fs.copyFileSync(path.join(sourceDir,name),path.join(root,'step14-common-patch','files',name));
   if(patchManifest[name].before){
     const original=path.join(oldDir,name);
     if(!fs.existsSync(original))throw Error('Missing original test fixture: '+original);
     fs.copyFileSync(original,path.join(target,name));
   }
 }
 return root;
}
test('installs original known STEP1-4 modules and makes an unmodified backup',()=>{
 const root=mkProject();
 try{
   const evidenceDir=path.join(root,'.rms-soybean-rebuild');
   fs.mkdirSync(evidenceDir,{recursive:true});
   const evidence=path.join(evidenceDir,'step7-final-paid-original.json');
   fs.writeFileSync(evidence,'{\"protected\":true}',{flag:'wx'});
   const r=installStep14(root,true);assert.equal(r.status,'checked');assert.equal(r.updated,0);
   const done=installStep14(root);assert.equal(done.status,'installed');assert.ok(done.backup);
   const target=path.join(root,'scripts','soybean-rebuild');
   for(const [name,m] of Object.entries(patchManifest)){
     assert.deepEqual(fs.readFileSync(path.join(target,name)),fs.readFileSync(path.join(sourceDir,name)));
     if(m.before)assert.deepEqual(fs.readFileSync(path.join(done.backup!,name)),fs.readFileSync(path.join(oldDir,name)));
   }
   assert.deepEqual(installStep14(root),{status:'already-installed',updated:0,backup:null});
   assert.equal(fs.readFileSync(evidence,'utf8'),'{\"protected\":true}');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('unknown user edits trigger all-or-nothing refusal BEFORE backups or writes',()=>{
 const root=mkProject();
 try{
  const file=path.join(root,'scripts','soybean-rebuild','step2-verify.ts');
  fs.appendFileSync(file,'// custom change');
  const marker=fs.readFileSync(path.join(root,'scripts','soybean-rebuild','step1-google.ts'));
  assert.throws(()=>installStep14(root),/REFUSED/);
  assert.deepEqual(fs.readFileSync(path.join(root,'scripts','soybean-rebuild','step1-google.ts')),marker);
  assert.equal(fs.existsSync(path.join(root,'.rms-soybean-rebuild')),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('tampering with patch payload aborts before modifying the existing code',()=>{
 const root=mkProject();
 try{
  fs.appendFileSync(path.join(root,'step14-common-patch','files','step4-analyze.ts'),'tampered');
  assert.throws(()=>installStep14(root),/checksum/);
  assert.equal(fs.existsSync(path.join(root,'.rms-soybean-rebuild')),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
