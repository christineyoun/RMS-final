import {test} from 'node:test';
import assert from 'node:assert/strict';
import {YAHOO_BRENT_URL,planBrentQuoteUpdate,brentOnlyPublication} from './brent15Core.mjs';
const stamp='2026-11-09T09:01:06.000Z';
const quote=(ts=stamp,price=96.74,pct=-1.607)=>({benchmark:'BZ=F',unit:'USD/bbl',sourceUrl:YAHOO_BRENT_URL,currentPrice:98.32,quoteDisplay:{price,observationDate:ts,pctChange:pct,comparisonBasis:'provider-reported-quote-change'}});
const publication={version:1,revision:'old',publishedAt:'2026-11-09T00:02:02Z',status:'partial',data:{energy:quote('2026-11-08T23:50:35.000Z',97.58,-.753),fx:{keep:1},inputs:{keep:2},transportPolicy:{keep:3}}};
const previous=publication.data.energy;
test('verified newer Yahoo quote changes Brent alone',()=>{
 const p=planBrentQuoteUpdate(quote(),previous,publication,new Date('2026-11-09T09:02:00Z'));
 assert.equal(p.shouldWrite,true);
 const next=brentOnlyPublication(publication,quote(),'2026-11-09T09:02:00Z','rev2');
 assert.deepEqual(next.data.fx,publication.data.fx);
 assert.deepEqual(next.data.transportPolicy,publication.data.transportPolicy);
 assert.equal(next.status,'partial');
 assert.equal(next.data.energy.quoteDisplay.price,96.74);
});
test('unchanged quote is a no-op even on frequent rechecks',()=>{
 const saved=quote();const published={...publication,data:{...publication.data,energy:saved}};
 assert.equal(planBrentQuoteUpdate(saved,saved,published,new Date('2026-11-09T10:02:00Z')).shouldWrite,false);
});
test('stale or inconsistent quote is rejected, never downgrades publication',()=>{
 assert.throws(()=>planBrentQuoteUpdate(quote('2026-11-08T22:00:00Z'),previous,publication,new Date('2026-11-09T10:00:00Z')),/older/);
 assert.throws(()=>planBrentQuoteUpdate({...quote(),benchmark:'WTI'},previous,publication,new Date('2026-11-09T10:00:00Z')),/valid/);
 assert.throws(()=>planBrentQuoteUpdate(quote('2026-11-11T12:00:00Z'),previous,publication,new Date('2026-11-09T10:00:00Z')),/valid/);
});
test('same timestamp different price is held for review',()=>{
 const q=quote(),pub={...publication,data:{...publication.data,energy:q}};
 assert.throws(()=>planBrentQuoteUpdate(quote(stamp,96.75,-1.6),q,pub,new Date('2026-11-09T10:00:00Z')),/Same-timestamp/);
});
test('unverified percentage is explicitly nullable, never fabricated',()=>{
 const q=quote('2026-11-09T09:30:00Z',97.01,null);
 q.quoteDisplay.comparisonBasis='quote-change-unverified';
 assert.equal(planBrentQuoteUpdate(q,previous,publication,new Date('2026-11-09T10:00:00Z')).changePercent,null);
});
test('missing publication fails closed',()=>{
 assert.throws(()=>planBrentQuoteUpdate(quote(),previous,null,new Date('2026-11-09T10:00:00Z')),/required/);
});
