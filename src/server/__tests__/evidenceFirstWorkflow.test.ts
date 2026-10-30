/** Offline operational integration; source facts are unchanged archived records.
 * No authored generated body, paid transport or live collector is used here. */
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {refreshEvidenceFirst,currentDriverVerification,evidenceFirstStatus} from '../evidenceFirstWorkflow.ts';
import {createFreeSourceRunner} from '../freeSourceRefresh.ts';
import {readScheduledContent} from '../scheduledContent.ts';
const archive=JSON.parse(fs.readFileSync(new URL('./fixtures/oct27PaidValidation.json',import.meta.url),'utf8'));
const evidence=archive.analysis.find((r:any)=>r.id==='soybean').evidence;
const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-operational-OFFLINE-')),now=new Date('2026-10-29T01:00:00Z'),native=globalThis.fetch;
globalThis.fetch=async()=>{throw Error('No network allowed');};
const collect=async()=>[];
const load=async(id:string)=>id==='soybean'?evidence:{...evidence,commodity:id,facts:[]};
try{
 const dir=path.join(root,'.rms-stage3');fs.mkdirSync(dir);
 const file=path.join(dir,'soybean-news-verified.json');
 const manifest={checkedAt:now.toISOString(),results:evidence.facts.map((f:any)=>({url:f.sourceUrl,status:'verified'})),articles:evidence.facts.map((f:any)=>({originalUrl:f.sourceUrl,receiptSha256:f.recordSha256}))};
 fs.writeFileSync(file,JSON.stringify(manifest));
 const f=evidence.facts.find((f:any)=>f.id.includes('us-production'));
 assert(f);assert(currentDriverVerification(f,'soybean',root,now.toISOString()));
 const bad=structuredClone(manifest);bad.results.forEach((r:any)=>r.status='retained');fs.writeFileSync(file,JSON.stringify(bad));assert(!currentDriverVerification(f,'soybean',root,now.toISOString()));
 fs.writeFileSync(file,JSON.stringify({...manifest,articles:[]}));assert(!currentDriverVerification(f,'soybean',root,now.toISOString()));
 fs.writeFileSync(file,JSON.stringify(manifest));
 const options={root,collect,evidence:load as any,now:()=>now};
 const first=await refreshEvidenceFirst(['soybean'],options);assert.equal(first.results.find((r:any)=>r.commodity==='soybean').status,'updated');
 const saved=readScheduledContent('analysis-soybean',root);assert(saved);assert.equal(saved.payload.data.model,'rms-evidence-composer-v1');const stamp=saved.payload.data.generatedAt;
 const second=await refreshEvidenceFirst(['soybean'],options);assert.equal(second.results.find((r:any)=>r.commodity==='soybean').status,'unchanged');assert.equal(readScheduledContent('analysis-soybean',root)?.payload.data.generatedAt,stamp);
 const renewed=structuredClone(evidence);renewed.facts.forEach((f:any)=>{f.verifiedAt=now.toISOString();if(f.referenceContext)f.referenceContext={...f.referenceContext,quote:f.referenceContext.quote+' '};});
 const renewedResult=await refreshEvidenceFirst(['soybean'],{...options,evidence:async()=>renewed});assert.equal(renewedResult.results.find((r:any)=>r.commodity==='soybean').status,'unchanged');assert.equal(readScheduledContent('analysis-soybean',root)?.payload.data.generatedAt,stamp);
 const failed=await refreshEvidenceFirst(['soybean','corn'],{...options,collect:async id=>{if(id==='soybean')throw Error('Private source request failed');return [];}});
 assert.equal(failed.results.find((r:any)=>r.commodity==='soybean').status,'retained');assert.equal(failed.results.find((r:any)=>r.commodity==='corn').status,'unavailable');assert.equal(readScheduledContent('analysis-soybean',root)?.payload.data.generatedAt,stamp);
 fs.writeFileSync(file,JSON.stringify(bad));const stale=await refreshEvidenceFirst(['soybean'],options);assert.deepEqual(stale.results.find((r:any)=>r.commodity==='soybean').issues,['current-original-driver-verification-required']);
 fs.writeFileSync(path.join(dir,'evidence-first-refresh.lock'),'existing-lock');assert.throws(()=>refreshEvidenceFirst(['soybean'],options));assert.equal(fs.readFileSync(path.join(dir,'evidence-first-refresh.lock'),'utf8'),'existing-lock');
 // A stopped isolated process must not disable non-paid composition forever.
 fs.writeFileSync(file,JSON.stringify(manifest));
 fs.writeFileSync(path.join(dir,'evidence-first-refresh.lock'),JSON.stringify({pid:2147483647,token:'dead-owner'}));
 const resumed=await refreshEvidenceFirst(['soybean'],options);assert.equal(resumed.results.find((r:any)=>r.commodity==='soybean').status,'unchanged');assert(!fs.existsSync(path.join(dir,'evidence-first-refresh.lock')));
 assert.throws(()=>refreshEvidenceFirst(['not-a-commodity'],options));
 assert.equal(evidenceFirstStatus(root).paidCalls,0);assert(!fs.readdirSync(dir,{recursive:true}).some(p=>/paid-request|approval|journal/.test(String(p))));
 const order:string[]=[];
 const runner=createFreeSourceRunner({directory:path.join(root,'scheduler'),jobs:()=>[{key:'offline-source',run:async()=>{order.push('source');return {publication:{value:1}};}}],compose:async()=>{order.push('compose');throw Error('isolated composition outage');},publish:async run=>{order.push('overview');assert.equal(run.evidenceFirst.error,'non-paid-composition-failed');return {saved:true};}});
 assert((await runner.refresh()).publication.saved);assert.deepEqual(order,['source','compose','overview']);
 console.log('PASS operational collection → exact receipt verification → composition → real component validation → publication/read-back; unchanged date, independent fallback, missing evidence and locks');
}finally{globalThis.fetch=native;fs.rmSync(root,{recursive:true,force:true});}
