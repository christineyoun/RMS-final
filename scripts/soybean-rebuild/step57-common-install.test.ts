import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {installStep57} from './step57-common-install.ts';
const ref=path.join(process.cwd(),'step57-common-patch');
const manifest=JSON.parse(fs.readFileSync(path.join(ref,'manifest.json'),'utf8')) as Record<string,{before:string|null;after:string}>;
const sources:Record<string,{zip:string;entry:string}>={
 'step5-local.ts':{zip:'RMS_SOYBEAN_REBUILD_STEP5_AUTO.zip',entry:'scripts/soybean-rebuild/step5-local.ts'},
};
const oldFolder=path.join(process.cwd(),'step57-common-patch','test-fixtures');
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-install-'));
 const dir=path.join(root,'scripts/soybean-rebuild');fs.mkdirSync(dir,{recursive:true});
 fs.cpSync(ref,path.join(root,'step57-common-patch'),{recursive:true});
 for(const [name,entry] of Object.entries(manifest))if(entry.before){
  const original=path.join(oldFolder,name);
  fs.writeFileSync(path.join(dir,name),fs.readFileSync(original));
 }
 return {root,dir};
}
test('safe install checks, backs up, installs, and is idempotent',()=>{
 const x=fixture();try{
  assert.equal(installStep57(x.root,true).status,'original-known');
  assert.equal(installStep57(x.root,false).status,'installed');
  assert.equal(installStep57(x.root,false).status,'already-installed');
  assert.ok(fs.existsSync(path.join(x.dir,'step57-common.test.ts')));
 }finally{fs.rmSync(x.root,{recursive:true,force:true});}
});
test('unexpected local customization prevents every write',()=>{
 const x=fixture();try{
  fs.appendFileSync(path.join(x.dir,'step6-core.ts'),'\n// personal edit\n');
  const original=fs.readFileSync(path.join(x.dir,'step5-local.ts'));
  assert.throws(()=>installStep57(x.root,false),/REFUSED/);
  assert.deepEqual(fs.readFileSync(path.join(x.dir,'step5-local.ts')),original);
 }finally{fs.rmSync(x.root,{recursive:true,force:true});}
});
