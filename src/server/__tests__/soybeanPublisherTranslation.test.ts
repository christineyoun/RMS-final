import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {livePublisherPropositions} from '../livePublisherPropositions.ts';
import {sourcePropositionSupport} from '../analysisSourcePropositions.ts';
const originals=JSON.parse(fs.readFileSync(new URL('./fixtures/soybeanPublisherPassagesOct29.json',import.meta.url),'utf8'));
let offers=0,planting=0;
for(const row of originals){
 const sha=createHash('sha256').update(row.quote).digest('hex');
 const f:any={id:'live-article-soybean-test',commodity:'soybean',sourceUrl:row.url,observedAt:row.date,verifiedAt:'2026-10-29T09:00:00Z',verification:'original-record',recordSha256:sha,referenceContext:{receiptSha256:sha,quote:row.quote}};
 const propositions=livePublisherPropositions(f);for(const p of propositions){assert(sourcePropositionSupport(p.text,[f]));assert.equal(sourcePropositionSupport(p.text+' 따라서 가격 상승이 확실합니다.',[f]),null);}
 if(propositions.some(p=>p.text.includes('505.23'))){offers++;const p=propositions.find(p=>p.text.includes('505.23'))!;for(const text of [p.text.replace('505.23','505.24'),p.text.replace('달러','유로'),p.text.replace('11월','12월')])assert.equal(sourcePropositionSupport(text,[f]),null);const wrong={...f,referenceContext:{...f.referenceContext,quote:row.quote.replace(/US[-‐‑–—]dollars/g,'euros')}};assert(!livePublisherPropositions(wrong).some(p=>p.text.includes('505.23')));}
 if(propositions.some(p=>p.text.includes('52%'))){planting++;assert(propositions.some(p=>p.text.includes('북부 일부')));const missing={...f,referenceContext:{...f.referenceContext,quote:row.quote.replace('though some northern areas complain about dryness','with no verified local weather statement')}};assert(!livePublisherPropositions(missing).some(p=>p.text.includes('52%')||p.text.includes('건조')));}
 assert.equal(livePublisherPropositions({...f,sourceUrl:'https://example.com/unrelated'}).length,0);
 assert.equal(livePublisherPropositions({...f,referenceContext:{...f.referenceContext,receiptSha256:'wrong'}}).length,0);
}
assert(offers>0&&planting>0,'both authentic passages must be exercised');
console.log('PASS authentic Soybean offer/planting translations; incorrect values, currencies, dates, invented consequences, unrelated sources and missing weather clause rejected');
