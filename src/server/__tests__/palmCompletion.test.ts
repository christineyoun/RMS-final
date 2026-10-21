import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {palmHistoryPayload,type PublicHistory} from '../publicPriceHistory.ts';
import {selectPalmObservations,normalizedPalmPoint,refreshPalmDatedFx} from '../palmPricePolicy.ts';
import {readVerifiedPalmNews,refreshPalmNews,PALM_NEWS_CANDIDATES,verifyPalmArticle} from '../palmVerifiedNews.ts';
import {prepareAnalysisEvidence} from '../analysisArticleEvidence.ts';
import {parseMeteoWeather} from '../all8OriginRadarService.ts';
const nativeFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Network/paid calls prohibited');};
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rms-palm-completion-test-'));
const files=['.rms-stage3/usage.jsonl','.rms-stage3/paid-requests.jsonl','.rms-stage3/analysis-recovery.json',...fs.readdirSync('.rms-stage3/snapshots').map(n=>'.rms-stage3/snapshots/'+n)];
const digest=()=>files.map(f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex')).join(':');const before=digest();
try{
 const h:PublicHistory=JSON.parse(fs.readFileSync('.rms-price-history/palm-oil.json','utf8'));const raw=JSON.stringify(h.points);
 const selected=selectPalmObservations(h,'palm-cpo');assert.equal(selected.length,200);assert.equal(selected.find(p=>p.date==='2026-10-07')?.value,4661);assert.equal(selected.find(p=>p.date==='2026-10-08')?.value,4592);
 assert.ok(h.points.some(p=>p.date==='2026-10-07'&&p.value===4553),'old raw record preserved');
 assert.ok(selected.every(p=>normalizedPalmPoint(p,h).fxStatus==='dated'),'all selected CPO dates have verified FX');
 for(const p of selected){const fx=h.datedFx![p.date];assert.ok(fx.rateDate<=p.date);assert.ok(Date.parse(p.date)-Date.parse(fx.rateDate)<=7*86400000);assert.match(fx.sourceUrl,/^https:\/\/api.frankfurter.dev\/v1\//);}
 const payload=palmHistoryPayload(h);assert.equal(payload.cpoObservationDate,'2026-10-19');assert.equal(payload.oleinObservationDate,'2026-10-19');assert.equal(payload.historicalSeries.find(p=>p.date==='2026-10-19').oleinPublisherQuoteDate,'2026-10-19');assert.ok(payload.historicalSeries.some(p=>p.date==='2026-10-15'));assert.equal(payload.diagnostics.estimatedFxObservations,0);assert.equal(JSON.stringify(h.points),raw);
 const point=selected[0];const noFx={version:1 as const,points:[{...point,provenance:'manual-import' as const,conversion:undefined}]};
 assert.equal(normalizedPalmPoint(noFx.points[0],noFx).fxStatus,'legacy-fixed-estimate');
 const dated=await refreshPalmDatedFx(noFx,async()=>Response.json({base:'USD',rates:{[point.date]:{MYR:4.2}}}));assert.equal(normalizedPalmPoint(point,dated).usdPerMT,Number((point.value/4.2).toFixed(2)));assert.deepEqual(dated.points,noFx.points);
 const failed=await refreshPalmDatedFx(noFx,async()=>new Response('',{status:503}));assert.deepEqual(failed.points,noFx.points);assert.ok(failed.fxError);
 const articles=readVerifiedPalmNews();assert.equal(articles.length,4);assert.equal(new Set(articles.map(a=>a.originalUrl)).size,4);assert.ok(articles.some(a=>a.affectedRegion==='Indonesia'));
 for(const article of articles){const candidate=PALM_NEWS_CANDIDATES.find(a=>a.originalUrl===article.originalUrl)!;const receipt=JSON.parse(fs.readFileSync('.rms-stage3/evidence/articles/article-'+article.receiptSha256+'.json','utf8'));assert.ok(verifyPalmArticle(receipt.html,candidate));assert.equal(verifyPalmArticle('<html>access denied</html>',candidate),null);const wrong={...candidate,anchors:['unsupported made-up figure 9999999']};assert.equal(verifyPalmArticle(receipt.html,wrong),null);assert.equal(verifyPalmArticle(receipt.html,{...candidate,publishedAt:'2026-10-18'}),null);}
 fs.mkdirSync(path.join(temp,'.rms-stage3/evidence/articles'),{recursive:true});fs.copyFileSync('.rms-stage3/palm-news-verified.json',path.join(temp,'.rms-stage3/palm-news-verified.json'));
 for(const a of articles){const name='article-'+a.receiptSha256+'.json';fs.copyFileSync('.rms-stage3/evidence/articles/'+name,path.join(temp,'.rms-stage3/evidence/articles/'+name));}
 const outage=await refreshPalmNews(temp,async()=>new Response('',{status:403}));assert.equal(outage.articles.length,4,'verified originals survive outages');assert.equal(outage.failures.length,4);
 const evidence=await prepareAnalysisEvidence('palm-oil',process.cwd(),new Date(),{fetchSources:false});assert.ok(evidence.facts.some(f=>f.id==='palm-olein-2026-10-19'));assert.equal(evidence.facts.filter(f=>f.id.startsWith('article-')).length,4,'news and AI reuse the same retained original bodies');
 const today=new Date();const dates=Array.from({length:28},(_,i)=>new Date(today.getTime()-(28-i)*86400000).toISOString().slice(0,10));
 const weather=(rain:number[])=>parseMeteoWeather({daily:{time:dates,precipitation_sum:rain}});
 const wet=weather([...Array(21).fill(10),...Array(7).fill(30)])!;assert.equal(wet.baselineMm,70);assert.equal(wet.mm,210);assert.ok(wet.complete);
 const dry=weather([...Array(21).fill(10),...Array(7).fill(1)])!;assert.ok(dry.mm<=dry.baselineMm!*.25);
 const nulls=weather(Array(28).fill(null) as any);assert.equal(nulls,null,'missing precipitation is never zero rain');
 assert.equal(digest(),before,'all saved news/AI snapshots and paid history byte-identical');
 console.log('PASS: raw import preservation; verified precedence; 200 dated FX values; outage/estimate handling; Oct15+Oct19 preservation; four verified news originals and numerical/date rejection; cached outage retention; shared AI receipts; no invented rainfall; zero paid calls.');
}finally{globalThis.fetch=nativeFetch;fs.rmSync(temp,{recursive:true,force:true});}
