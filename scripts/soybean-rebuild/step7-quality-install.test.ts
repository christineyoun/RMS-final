import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {installStep7Quality} from './step7-quality-install.ts';
const sourceDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'step7-quality-install-'));
 const current=path.join(root,'scripts','soybean-rebuild');fs.mkdirSync(current,{recursive:true});
 const payload=path.join(root,'step7-quality-patch','files');fs.mkdirSync(payload,{recursive:true});
 for(const file of ['step7-core.ts','step7-run.ts']){
  fs.copyFileSync(path.join(sourceDir,'step7-quality-patch','files',file),path.join(payload,file));
  fs.copyFileSync(path.join(payload,file),path.join(current,file));
 }
 return {root,current,payload};
}
test('idempotent install leaves matching versions and evidence untouched',()=>{
 const f=fixture();try{const p=path.join(f.root,'.rms-soybean-rebuild');fs.mkdirSync(p);fs.writeFileSync(path.join(p,'sample.json'),'{}');
 installStep7Quality(f.root);
 assert.equal(fs.readdirSync(p).length,1);
 assert.equal(fs.readFileSync(path.join(p,'sample.json'),'utf8'),'{}');
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('refuses unknown user-modified original without changing either file',()=>{
 const f=fixture();try{
 const target=path.join(f.current,'step7-core.ts'),run=path.join(f.current,'step7-run.ts');
 fs.appendFileSync(target,'\n// user custom change');const runBefore=fs.readFileSync(run,'utf8');
 assert.throws(()=>installStep7Quality(f.root),/Unexpected local edits/);
 assert.match(fs.readFileSync(target,'utf8'),/user custom change/);
 assert.equal(fs.readFileSync(run,'utf8'),runBefore);
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
