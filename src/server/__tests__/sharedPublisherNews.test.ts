import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {refreshSharedPublisherNews,readSharedPublisherNews} from '../sharedPublisherNews.ts';
import {collectEvidenceFirstPublishers} from '../evidenceFirstPublishers.ts';
import {aggregateOverview} from '../../utils/overviewIntelligence.ts';
const receipt=JSON.parse(fs.readFileSync(new URL('./fixtures/sharedPublisherCornOriginal.json',import.meta.url),'utf8'));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-news-store-test-')),now=new Date('2026-10-29T09:00:00Z');
const collect=(id:string,r:string,n:Date)=>collectEvidenceFirstPublishers(id,r,n,{candidates:[{originalUrl:receipt.sourceUrl,publishedAt:'2026-10-28'}],fetcher:async()=>new Response(receipt.html,{headers:{'content-type':'text/html'}})});
try{
 const duplicate=await collectEvidenceFirstPublishers('corn',root,now,{candidates:[{originalUrl:receipt.sourceUrl,publishedAt:'2026-10-28'},{originalUrl:receipt.sourceUrl,publishedAt:'2026-10-15'}],fetcher:async()=>new Response(receipt.html,{headers:{'content-type':'text/html'}})});
 assert.equal(duplicate.length,1);assert.equal(duplicate[0].status,'verified');assert.equal(duplicate[0].publishedAt,'2026-10-28','legacy duplicate cannot overwrite discovered article date');
 const a=await refreshSharedPublisherNews('corn',root,now,{collect});assert.equal(a.articles.length,1);assert.equal(a.changes.added.length,1);assert.equal(readSharedPublisherNews('corn',root,now).length,1);
 const b=await refreshSharedPublisherNews('corn',root,new Date(+now+1000),{collect});assert.equal(b.changes.unchanged.length,1);assert.equal(b.publishedAt,a.publishedAt);
 const denied=(id:string,r:string,n:Date)=>collectEvidenceFirstPublishers(id,r,n,{candidates:[{originalUrl:receipt.sourceUrl,publishedAt:'2026-10-28'}],fetcher:async()=>new Response('denied',{status:403})});
 const c=await refreshSharedPublisherNews('corn',root,new Date(+now+2000),{collect:denied});assert.equal(c.articles.length,1);assert(c.diagnostics.some(d=>d.reason==='publisher-http-403'));assert.equal(c.publishedAt,a.publishedAt);
 const target=path.join(root,'.rms-stage3/shared-publisher-news/corn.json'),original=fs.readFileSync(target);let altered=JSON.parse(original.toString());altered.articles[0].summary+=' 가격은 999달러입니다.';fs.writeFileSync(target,JSON.stringify(altered));assert.equal(readSharedPublisherNews('corn',root,now).length,0);fs.writeFileSync(target,original);
 const file=path.join(root,'.rms-stage3/evidence/articles/article-'+a.articles[0].receiptSha256+'.json'),bytes=fs.readFileSync(file);fs.writeFileSync(file,'{}');assert.equal(readSharedPublisherNews('corn',root,now).length,0);fs.writeFileSync(file,bytes);
 assert.equal(readSharedPublisherNews('corn',root,new Date('2026-11-13T00:00:00Z')).length,0,'14-day boundary');
 // Selection-only synthetic cards, never persisted as verified originals.
 const cards=Array.from({length:6},(_,i)=>({...a.articles[0],originalUrl:'https://example.com/selection-only-'+i,title:'검증 후 선택 테스트 '+i}));
 const overview=aggregateOverview([{id:'corn',articles:[...cards,cards[0]],analysis:null}] as any,+now);assert.equal(overview.issues.length,5);assert.equal(new Set(overview.issues.map(x=>x.url)).size,5);
 console.log('PASS genuine archived HTML → verified immutable receipt → bound Korean news → persistence/read-back; 403 retention, unchanged publication date, tamper/missing/expired rejection; five distinct Overview issues');
}finally{fs.rmSync(root,{recursive:true,force:true});}
