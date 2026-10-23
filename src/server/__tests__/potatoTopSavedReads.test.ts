import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createPotatoExportQuoteService} from '../officialPotatoComextService.ts';
import {createRegionalPotatoHistory} from '../potatoProductionHistory.ts';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rms-potato-saved-'));
let calls=0;
const fetcher=(async()=>{calls++;throw Error('Saved views must not collect');}) as typeof fetch;
try {
 const quote=createPotatoExportQuoteService({fetcher});
 assert.equal(quote.saved().dataStatus,'unavailable');
 const graph=createRegionalPotatoHistory({file:path.join(dir,'absent.json'),fetcher});
 assert.deepEqual(graph.saved().points,[]);
 assert.equal(fs.existsSync(path.join(dir,'absent.json')),false);
 assert.equal(calls,0,'missing saved data cannot trigger collection');
 const original=globalThis.fetch;
 globalThis.fetch=fetcher;
 try {
  const {createGeminiApiMiddleware}=await import('../geminiApi.ts');
  const middleware=createGeminiApiMiddleware();
  for(const url of ['/api/starch/potato-export-quote','/api/potato-starch/production-regions']){
   let result:any;
   const res:any={setHeader(){},end(body:string){result=JSON.parse(body);}};
   await middleware({url,method:'GET'} as any,res,()=>{throw Error('New route fell through');});
   assert(result);
  }
  assert.equal(calls,0,'actual normal API routes must not call external fetch');
 }finally{globalThis.fetch=original;}
 console.log('PASS: missing-data saved reads and actual Potato API routes make zero external requests');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
