/** OFFLINE ONLY: isolated receipt stores, actual retained publisher HTML, and mocked transport. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {SOYBEAN_NEWS_CARDS,verifySoybeanNewsHtml,retainSoybeanBrowserRecord,refreshSoybeanNews,readVerifiedSoybeanNews} from '../soybeanNewsPersistence.ts';
import {createFreeSourceRunner,soybeanNewsRefreshJob} from '../freeSourceRefresh.ts';
import {marketIntelligenceSourceLabel} from '../../components/CommodityNews.tsx';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-soybean-news-test-')),native=globalThis.fetch;
globalThis.fetch=async()=>{throw Error('Offline: no publisher or paid requests');};
const snapshots=fs.readdirSync('.rms-stage3/snapshots').map(n=>'.rms-stage3/snapshots/'+n),protectedFiles=[...snapshots,'.rms-stage3/usage.jsonl','.rms-stage3/paid-requests.jsonl','.rms-price-history/soybean.json'];
const hashes=()=>protectedFiles.map(f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex')),before=hashes();
const receipts=fs.readdirSync('.rms-stage3/evidence/articles').map(n=>{try{return JSON.parse(fs.readFileSync('.rms-stage3/evidence/articles/'+n,'utf8'));}catch{return null;}}).filter(Boolean);
const html=new Map<string,string>(SOYBEAN_NEWS_CARDS.filter(c=>c.sourceName!=='World Grain').map(c=>[c.originalUrl,receipts.find(r=>r.sourceUrl===c.originalUrl&&r.html&&verifySoybeanNewsHtml(r.html,c))?.html]));
const browser=receipts.find(r=>r.kind==='publisher-browser-record'&&r.sourceUrl===SOYBEAN_NEWS_CARDS[2].originalUrl);assert.ok(browser,'run source preparation before the retained-evidence tests');const {sha256,...worldRecord}=browser;
let calls=0;const mock:typeof fetch=async(input:any)=>{calls++;await new Promise(r=>setTimeout(r,15));const body=html.get(String(input));return body?new Response(body,{headers:{'Content-Type':'text/html'}}):new Response('',{status:403});};
const noDiscovery=async()=>({candidates:[],diagnostics:{sourcesTried:0,sourcesRead:0,discovered:0,sourceResults:[],candidatesByPublisher:{},errors:[]}});
try{
 for(const c of SOYBEAN_NEWS_CARDS.filter(c=>c.sourceName!=='World Grain'))assert.ok(verifySoybeanNewsHtml(html.get(c.originalUrl)!,c));
 const cb=SOYBEAN_NEWS_CARDS[1],body=html.get(cb.originalUrl)!;
 assert.equal(verifySoybeanNewsHtml(body.replaceAll('Mato Grosso','United States'),cb),null,'52% requires the correct Brazil region');
 assert.equal(verifySoybeanNewsHtml(body.replaceAll('52%','62%'),cb),null,'wrong percentage rejected');
 assert.equal(verifySoybeanNewsHtml(body.replaceAll('43%','33%'),cb),null,'comparison baseline verified');
 assert.equal(verifySoybeanNewsHtml(body.replaceAll('Soybeans Steady as Futures Firm but Physical Differentials Diverge','Unrelated soybean article'),cb),null,'exact article identity');
 const ers=SOYBEAN_NEWS_CARDS[3],ersBody=html.get(ers.originalUrl)!;assert.equal(verifySoybeanNewsHtml(ersBody,ers)?.publishedAt,'2026-10-15');
 for(const [a,b] of [['4.56','4.99'],['315 million','515 million'],['10/15/2026','10/14/2026'],['2026/27','2025/26']])assert.equal(verifySoybeanNewsHtml(ersBody.replaceAll(a,b),ers),null,'incorrect official metric/date/year');
 assert.throws(()=>retainSoybeanBrowserRecord(root,{...worldRecord,claims:{...worldRecord.claims,production:{...worldRecord.claims.production,billionBushels:4.99}}}),/Unsupported/);
 retainSoybeanBrowserRecord(root,worldRecord);
 const [a,b]=await Promise.all([refreshSoybeanNews(root,mock,{discover:noDiscovery}),refreshSoybeanNews(root,mock,{discover:noDiscovery})]);assert.equal(a,b);assert.equal(calls,4,'concurrent jobs share one four-source check');assert.equal(a.articles.length,4);assert.equal(a.results[2].status,'retained');
 assert.deepEqual(a.articles.map(x=>x.publishedAt),['2026-10-19','2026-10-19','2026-10-15','2026-10-15']);assert.equal(new Set(a.articles.map(x=>x.originalUrl)).size,4);
 assert.notEqual(a.articles[0].sourceHeadline,a.articles[1].sourceHeadline);assert.notEqual(a.articles[0].summary,a.articles[1].summary);
 for(const article of a.articles){assert.equal(marketIntelligenceSourceLabel(article.sourceName,article.originalUrl),article.sourceName);assert.ok(!/google|\/search\b/.test(article.originalUrl));}
 assert.equal(readVerifiedSoybeanNews(root).length,4,'ordinary reads perform no network calls');assert.equal(calls,4);
 const beforeOutage=readVerifiedSoybeanNews(root),oldDate=beforeOutage.map(a=>a.verifiedAt);
 const outage=await refreshSoybeanNews(root,async()=>new Response('',{status:503}),{discover:noDiscovery});assert.equal(outage.articles.length,4);assert.deepEqual(readVerifiedSoybeanNews(root),beforeOutage);assert.deepEqual(outage.articles.map(a=>a.verifiedAt),oldDate,'outage does not relabel verification or publication dates');
 const redirected=await refreshSoybeanNews(root,async()=>new Response('',{status:302,headers:{Location:'https://example.com/'}}),{discover:noDiscovery});assert.equal(redirected.articles.length,4);assert.ok(redirected.results.every(r=>r.status==='retained'),'no publisher-control bypass');
 const manifestFile=path.join(root,'.rms-stage3/soybean-news-verified.json'),state=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
 fs.writeFileSync(manifestFile,JSON.stringify({...state,articles:[...state.articles,state.articles[0]]}));assert.equal(readVerifiedSoybeanNews(root).length,4,'URL deduplication');
 fs.writeFileSync(manifestFile,JSON.stringify({...state,articles:state.articles.map((a:any,i:number)=>i? a:{...a,summarySha256:'wrong'})}));assert.equal(readVerifiedSoybeanNews(root).length,3,'unsupported display-summary revision cannot pass');fs.writeFileSync(manifestFile,JSON.stringify(state));
 const receiptFile=path.join(root,'.rms-stage3/evidence/articles','article-'+state.articles[0].receiptSha256+'.json'),saved=fs.readFileSync(receiptFile);const receipt=JSON.parse(String(saved));fs.writeFileSync(receiptFile,JSON.stringify({...receipt,html:receipt.html+'tampered'}));assert.equal(readVerifiedSoybeanNews(root).length,3,'receipt checksum integrity');fs.writeFileSync(receiptFile,saved);
 assert.equal(readVerifiedSoybeanNews(root,new Date('2026-12-01T00:00:00Z')).length,0,'stale stories are archived, not silently dated forward');
 const empty=fs.mkdtempSync(path.join(os.tmpdir(),'rms-soybean-news-empty-'));assert.equal((await refreshSoybeanNews(empty,async()=>new Response('',{status:403}),{discover:noDiscovery})).articles.length,0,'saved URL alone is not evidence');
 const scheduled=path.join(root,'schedule');fs.mkdirSync(scheduled);fs.writeFileSync(path.join(scheduled,'settings.json'),JSON.stringify({freeAutoEnabled:true,scheduleHourKST:9,autoEnabled:false}));
 const runner=createFreeSourceRunner({directory:scheduled,now:()=>new Date('2026-10-20T00:00:00Z'),jobs:()=>[{key:soybeanNewsRefreshJob.key,run:()=>refreshSoybeanNews(root,mock,{discover:noDiscovery})}]});const run=await runner.check();assert.equal(run.jobs[0].key,'soybean-news');assert.equal(run.jobs[0].status,'cached','403 with retained evidence remains visible in scheduler diagnostics');assert.equal(await runner.check(),null);
 assert.deepEqual(hashes(),before,'saved Gemini/news snapshots, paid logs and price history unchanged');
 console.log('PASS: four original source identities/dates/claims; Brazil 52% context; official forecasts; World Grain browser receipt/403 retention; persistent reads, single-flight, outage/redirect/corruption/expiry/dedup; real scheduler runner; zero paid calls. Isolated artifacts: '+root);
}finally{globalThis.fetch=native;}
