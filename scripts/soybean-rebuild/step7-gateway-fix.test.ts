import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {patchStage3Gateway,installGatewayFix} from './step7-fix-preview-gateway.ts';

const src=fs.readFileSync(path.join(process.cwd(),'src','server','stage3DailyUpdates.ts'),'utf8');

test('Targets the gateway that intercepts analysis snapshots',()=>{
  assert.match(src,/keyFromRequest\(req\.url\|\|\x27\/\x27,req\.method\|\|\x27GET\x27\)/);
  assert.match(fs.readFileSync(path.join(process.cwd(),'server.ts'),'utf8'),/app\.use\(savedGateway\)/);
});

test('Inserts dev preview before keyFromRequest and saved-snapshot processing',()=>{
  const patched=patchStage3Gateway(src);
  assert.ok(patched.indexOf('readStep7LocalPreview(commodity,req.socket.remoteAddress)') < patched.indexOf("const key=keyFromRequest(req.url||'/',req.method||'GET');"));
  assert.match(patched,/X-RMS-Data-Status','step7-local-preview'/);
  assert.match(patched,/!u\.searchParams\.has\('force'\)/);
  assert.match(patched,/req\.headers\.host/);
});

test('Is idempotent and rejects mismatched gateway versions',()=>{
  const once=patchStage3Gateway(src);
  assert.equal(patchStage3Gateway(once),once);
  assert.throws(()=>patchStage3Gateway(src.replace("import {rmsAiEditorial} from '../utils/rmsAiEditorial.ts';",'')),/anchor/);
});

test('Local preview is protected by existing dev-only, loopback, public-viewer checks',()=>{
  const helper=fs.readFileSync(path.join(process.cwd(),'src','server','step7LocalPreview.ts'),'utf8');
  assert.match(helper,/RMS_STEP7_LOCAL_PREVIEW/);
  assert.match(helper,/NODE_ENV==='production'/);
  assert.match(helper,/RMS_PUBLIC_READONLY==='1'/);
  assert.match(helper,/localRemote\(remoteAddress\)/);
});

test('Installer backs up existing stage3 source and does not edit any other code',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'step7-gateway-test-'));
  try {
    fs.mkdirSync(path.join(root,'src','server'),{recursive:true});
    fs.writeFileSync(path.join(root,'src','server','stage3DailyUpdates.ts'),src);
    fs.copyFileSync(path.join(process.cwd(),'src','server','step7LocalPreview.ts'),path.join(root,'src','server','step7LocalPreview.ts'));
    installGatewayFix(root);
    assert.equal(fs.readFileSync(path.join(root,'.rms-soybean-rebuild','backup','stage3DailyUpdates.ts.before-step7-local-preview.bak'),'utf8'),src);
    assert.equal(fs.readFileSync(path.join(root,'src','server','stage3DailyUpdates.ts'),'utf8'),patchStage3Gateway(src));
    installGatewayFix(root);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
