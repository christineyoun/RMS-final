import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {installStep7Scope} from './step7-scope-install.ts';

const here=path.dirname(fileURLToPath(import.meta.url));
const patch=path.resolve(here,'..','..','step7-scope-patch','files');
const priorCore=fs.readFileSync(path.resolve(here,'..','..','step7-scope-patch','fixtures','step7-core-before.ts'));
function setup(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-scope-install-'));
 const code=path.join(root,'scripts','soybean-rebuild');
 const src=path.join(root,'step7-scope-patch','files');
 fs.mkdirSync(code,{recursive:true});fs.mkdirSync(src,{recursive:true});
 for(const name of ['step7-core.ts','step7-scope.ts','step7-scope.test.ts','step7-scope-review.ts'])
  fs.copyFileSync(path.join(patch,name),path.join(src,name));
 fs.writeFileSync(path.join(code,'step7-core.ts'),priorCore);
 const data=path.join(root,'.rms-soybean-rebuild');fs.mkdirSync(data);
 fs.writeFileSync(path.join(data,'preserve.json'),'original');
 return {root,code,data};
}
test('installs from previous quality patch, backs up core and preserves evidence',()=>{
 const x=setup();try{
  installStep7Scope(x.root);
  assert.ok(fs.readFileSync(path.join(x.code,'step7-core.ts'),'utf8').includes('checkProcurementScope'));
  assert.ok(fs.existsSync(path.join(x.code,'step7-scope.ts')));
  assert.equal(fs.readFileSync(path.join(x.data,'preserve.json'),'utf8'),'original');
  assert.ok(fs.readdirSync(path.join(x.data,'backup')).length>0);
 }finally{fs.rmSync(x.root,{recursive:true,force:true});}
});
test('installation is idempotent and never overwrites previously generated data',()=>{
 const x=setup();try{
  installStep7Scope(x.root); const after=fs.readdirSync(path.join(x.data,'backup')).length;
  installStep7Scope(x.root);
  assert.equal(fs.readdirSync(path.join(x.data,'backup')).length,after);
  assert.equal(fs.readFileSync(path.join(x.data,'preserve.json'),'utf8'),'original');
 }finally{fs.rmSync(x.root,{recursive:true,force:true});}
});
test('unknown user modifications cause full refusal with zero changes',()=>{
 const x=setup();try{
  const core=path.join(x.code,'step7-core.ts');
  fs.appendFileSync(core,'\n// local custom code');
  const before=fs.readFileSync(core,'utf8');
  assert.throws(()=>installStep7Scope(x.root),/Unexpected local edits/);
  assert.equal(fs.readFileSync(core,'utf8'),before);
  assert.ok(!fs.existsSync(path.join(x.code,'step7-scope.ts')));
 }finally{fs.rmSync(x.root,{recursive:true,force:true});}
});
