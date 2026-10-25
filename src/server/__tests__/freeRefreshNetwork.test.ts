import assert from 'node:assert/strict';
let actual=0,active=0,max=0;
globalThis.fetch=async(input:any)=>{actual++;active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));active--;return new Response(String(input).includes('empty')?null:'fixture source body',{status:String(input).includes('empty')?204:200});};
const {withFreeNetwork,withSavedDataRead}=await import('../freeRefreshNetwork.ts');
const result=await withFreeNetwork(async()=>{
 const a=await fetch('https://example.com/weather');await a.body!.cancel();
 const b=await fetch('https://example.com/weather');assert.equal(await b.text(),'fixture source body');assert.equal(actual,1,'cancelled consumer does not hang or repeat request');
 await Promise.all(Array.from({length:12},(_,i)=>fetch('https://example.com/'+i)));assert(max<=4);
 const empty=await fetch('https://example.com/empty');assert.equal(empty.status,204);
 await assert.rejects(fetch('https://generativelanguage.googleapis.com/v1beta/models'),/blocked/);
});assert.equal(result.requests.length,14);
await assert.rejects(withSavedDataRead(()=>fetch('https://example.com/never')),/disabled/);
console.log('PASS independent buffered source consumers/cancellation, URL deduplication, maximum four transports, 204 source result, paid transport and page-view blocks');
