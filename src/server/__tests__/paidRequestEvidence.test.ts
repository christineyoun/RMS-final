/** Offline source-boundary regressions; never repair or read production receipts. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {mock as testClock} from 'node:test';
import {collectAnalysisEvidence,validAnalysisFact,type AnalysisEvidence} from '../analysisEvidence.ts';
import {buildRecoveryAnalysisRequest} from '../liveAiAnalysisService.ts';

const frozen=JSON.parse(fs.readFileSync(new URL('./fixtures/analysis-grounding-evidence-v1.json',import.meta.url),'utf8'));
const now=new Date(frozen.checkedAt);
const evidence:AnalysisEvidence=structuredClone(frozen.packets['palm-oil']);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rms-paid-evidence-OFFLINE-'));
const nativeFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw Error('Real network prohibited');};
testClock.timers.enable({apis:['Date'],now});
const request=(input:AnalysisEvidence)=>buildRecoveryAnalysisRequest('gemini-3.8-flash','palm-oil',input,frozen.checkedAt.slice(0,10),'verified-only');
const rejected=(input:AnalysisEvidence)=>assert.throws(()=>request(input),/Insufficient verified original evidence.*no paid request made/);
try{
  assert.ok(evidence.facts.every(f=>validAnalysisFact(f,'palm-oil',now)));
  assert.deepEqual(request(evidence).config.tools,[]);
  // Each original evidence category is mandatory; URLs or remaining facts alone
  // cannot substitute for the missing CPO, Olein or official world records.
  for(const keep of [
    (f:AnalysisEvidence['facts'][number])=>f.topic!=='CPO',
    (f:AnalysisEvidence['facts'][number])=>f.topic!=='RBD Olein',
    (f:AnalysisEvidence['facts'][number])=>!f.id.startsWith('psd-'),
  ])rejected({...evidence,facts:evidence.facts.filter(keep)});
  for(const change of [
    {commodity:'soybean'}, {verifiedAt:'2020-01-01T00:00:00Z'},
    {verifiedAt:'2026-10-22T00:00:00Z'}, {recordSha256:'missing'},
    {sourceUrl:'https://unverified.invalid/not-a-source'},
  ]){
    const bad=structuredClone(evidence);Object.assign(bad.facts[0],change);rejected(bad);
  }

  // Reproduce the archived missing-HTML reference with metadata only. No invented
  // HTML or ledger assertion is supplied as successful original evidence.
  const hash='f243018d6f1600b11f7dceeacb26f6d68af1b9da6e5829ebf5023c65353d2697';
  const dir=path.join(temp,'.rms-price-history/source-evidence');
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(temp,'.rms-price-history/palm-oil.json'),JSON.stringify({version:1,points:[]}));
  const receipt=`publisher-${hash}.json`,html=path.join(dir,`publisher-${hash}.html`);
  fs.writeFileSync(path.join(dir,receipt),JSON.stringify({
    sourceUrl:'https://www.investing.com/commodities/rbd-palm-olein-historical-data',
    checkedAt:'2026-10-20T06:57:38.945Z',htmlSha256:hash,
  }));
  const missing=collectAnalysisEvidence('palm-oil',temp,now);
  assert.deepEqual(missing.facts,[]);
  assert.ok(missing.failures.includes('publisher-receipt-incomplete:'+receipt));
  rejected(missing);
  fs.writeFileSync(html,'OFFLINE CORRUPTED CONTENT: not an original publisher document');
  const corrupt=collectAnalysisEvidence('palm-oil',temp,now);
  assert.deepEqual(corrupt.facts,[]);
  assert.ok(corrupt.failures.includes(receipt+':publisher-content-hash-mismatch'));
  rejected(corrupt);

  // Exercise real raw-record validation separately from request-control fixtures.
  const officialRoot=path.join(temp,'official'),officialFile=path.join(officialRoot,'src/data/usda_world_last_verified_palm-oil.json');
  fs.mkdirSync(path.dirname(officialFile),{recursive:true});
  const official=structuredClone(frozen.psdWorldPalm);
  fs.writeFileSync(officialFile,JSON.stringify(official));
  const verified=collectAnalysisEvidence('palm-oil',officialRoot,now);
  const expected=evidence.facts.filter(f=>f.id.startsWith('psd-'));
  assert.ok(expected.length>=3);
  assert.deepEqual(verified.facts,expected,'original raw records reproduce archived official facts');
  rejected(verified); // Official records alone still cannot supply price evidence.
  official.data.rawRecords[0].commodityCode='4232000';
  fs.writeFileSync(officialFile,JSON.stringify(official));
  const wrongOriginal=collectAnalysisEvidence('palm-oil',officialRoot,now);
  assert.deepEqual(wrongOriginal.facts,[]);
  assert.ok(wrongOriginal.failures.some(f=>f.startsWith('USDA:')));
  rejected(wrongOriginal);
  console.log('PASS: archived offline request evidence and original official records; missing categories, stale/future/foreign/untrusted facts, missing HTML and hash mismatch fail closed; zero provider calls.');
}finally{
  testClock.timers.reset();globalThis.fetch=nativeFetch;
  fs.rmSync(temp,{recursive:true,force:true});
}
