import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PRICE_SOURCES,loadPublicHistory,palmHistoryPayload,validPublicPoint,validatePalmPublisher,parsePalmHistory} from '../publicPriceHistory.ts';

assert.equal(PRICE_SOURCES.cpo, PRICE_SOURCES.cpoFcpo, 'canonical CPO link must be FCPOc1');
assert.notEqual(PRICE_SOURCES.cpoLegacyImport, PRICE_SOURCES.cpo, 'legacy MCX link must not masquerade as FCPO');
const html=`<h1>Palm Oil (FCPOc1)</h1>Currency in MYR<table><thead><tr><th>Date</th><th>Price</th><th>Open</th><th>High</th><th>Low</th></tr></thead><tbody><tr><td>Nov 03, 2026</td><td>4,500</td></tr></tbody></table>`;
validatePalmPublisher(html,'palm-cpo',PRICE_SOURCES.cpo);
assert.throws(()=>validatePalmPublisher(html,'palm-cpo',PRICE_SOURCES.cpoLegacyImport), /Benchmark mismatch/, 'legacy source cannot be accepted as a new verified FCPO page');
assert.equal(parsePalmHistory(html,'palm-cpo')[0]?.sourceUrl,PRICE_SOURCES.cpo);
const previousRoot=process.env.RMS_HISTORY_ROOT;
const isolatedRoot=fs.mkdtempSync(path.join(os.tmpdir(),'rms-fcpo-source-test-'));
process.env.RMS_HISTORY_ROOT=isolatedRoot;
const h=loadPublicHistory('palm-oil');
const manual=h.points.filter(p=>p.benchmark==='palm-cpo'&&p.provenance==='manual-import');
assert.ok(manual.length>0, 'existing manual CPO prices remain loaded');
assert.ok(manual.every(p=>p.sourceUrl===PRICE_SOURCES.cpoLegacyImport),'manual import identities must stay unchanged');
assert.ok(manual.every(p=>validPublicPoint(p)));
const payload=palmHistoryPayload(h);
assert.equal(payload.cpoSourceUrl,PRICE_SOURCES.cpo,'current CPO chart publisher link is FCPO');
for(const row of payload.historicalSeries){
  if(h.points.some(p=>p.benchmark==='palm-cpo'&&p.date===row.date&&p.provenance==='manual-import') &&
      !h.points.some(p=>p.benchmark==='palm-cpo'&&p.date===row.date&&p.provenance==='source-verified')){
    assert.equal(row.cpoSourceUrl,null,'manual prices must not inherit a fake verified-source hyperlink');
  }
}
console.log('PASS: FCPOc1 and Olein remain on Investing.com; misleading MCX is retained only as legacy import metadata; manual prices unchanged.');

fs.rmSync(isolatedRoot,{recursive:true,force:true});
if(previousRoot===undefined)delete process.env.RMS_HISTORY_ROOT;else process.env.RMS_HISTORY_ROOT=previousRoot;
