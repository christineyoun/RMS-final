/** Isolated KCCI persistence tests. No user RMS paths are written. */
import {strict as assert} from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {refreshVerifiedKcci,readVerifiedKcci} from '../kcciScraperService.ts';

async function main():Promise<void> {
const originalCwd=process.cwd();
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'rms-kcci-isolated-'));
const originalFetch=globalThis.fetch;
const makeHtml=(latest='4,668',prior='4,667')=>`<html><title>KOBC Container Composite Index</title><body><h1>KCCI 컨테이너선운임지수</h1><table><thead><tr><th>Date</th><th>KCCI</th><th>KUWI</th></tr></thead><tbody><tr><td>2026-11-09</td><td>${latest}</td><td>8,267</td></tr><tr><td>2026-11-02</td><td>${prior}</td><td>8,247</td></tr></tbody></table>${' '.repeat(1200)}</body></html>`;
let body=makeHtml();
try{
 process.chdir(scratch);
 globalThis.fetch=async()=>new Response(body,{status:200,headers:{'content-type':'text/html;charset=UTF-8'}});
 const first=await refreshVerifiedKcci(true);
 assert.equal(first.kcciPoints,4668);
 assert.equal(first.previousPoints,4667);
 assert.equal(first.history.length,2);
 assert.ok(fs.existsSync(path.join(scratch,first.receiptPath)));
 const receipt=fs.readFileSync(path.join(scratch,'.rms-stage3/free-kcci.json'),'utf8');
 const same=await refreshVerifiedKcci(true);
 assert.equal(same.observationDate,first.observationDate);
 assert.equal(fs.readFileSync(path.join(scratch,'.rms-stage3/free-kcci.json'),'utf8'),receipt,'No rewrite on identical observations');
 body=makeHtml('4,670','4,667');
 const conflict=await refreshVerifiedKcci(true);
 assert.match(conflict.lastError||'',/revised previously verified/);
 assert.equal(readVerifiedKcci()?.kcciPoints,4668);
 assert.equal(fs.readFileSync(path.join(scratch,'.rms-stage3/free-kcci.json'),'utf8'),receipt,'Do not overwrite on conflicting price');
 body='<html>blocked</html>';
 const missing=await refreshVerifiedKcci(true);
 assert.equal(missing.kcciPoints,4668);
 assert.ok(missing.lastError);
 assert.equal(fs.readFileSync(path.join(scratch,'.rms-stage3/free-kcci.json'),'utf8'),receipt,'Do not overwrite on blocked request');
 console.log('PASS: official KCCI receipt, first-week ingest, same-data retention, conflicting revision protection, failed-source fallback; original RMS data untouched.');
}finally{
 globalThis.fetch=originalFetch;
 process.chdir(originalCwd);
 fs.rmSync(scratch,{recursive:true,force:true});
}

}
void main().catch(error=>{
 console.error('KCCI PERSISTENCE TEST FAILED:',error instanceof Error?error.stack:String(error));
 process.exitCode=1;
});
