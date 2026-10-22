import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import overlays from '../../data/rmsAiEditorialOverlays.json';import {rmsAiEditorial} from '../../utils/rmsAiEditorial.ts';
import AiRecommendation from '../../components/AiRecommendation.tsx';
for(const entry of overlays.entries){
 const raw=fs.readFileSync(entry.snapshot.path),s=JSON.parse(raw.toString('utf8')),d=s.payload.data;
 assert.equal(createHash('sha256').update(raw).digest('hex'),entry.snapshot.sha256);
 assert.equal(s.runId,entry.snapshot.runId);
 for(const [key,value] of Object.entries(entry.original))assert.deepEqual(d[key],value);
 const result=rmsAiEditorial(entry.commodity,d.generatedAt,d.sources,d);
 assert(result.editorial);assert.deepEqual(result.fields,entry.revised);
 assert(/(?:습니다|합니다)\.$/.test(entry.revised.executiveSummary));
 for(const list of [entry.revised.bullishFactors,entry.revised.bearishFactors])for(const line of list)assert(!/(?:습니다|합니다|됩니다|입니다)|[.!?]$/.test(line),line);
 for(const item of entry.revised.watchItems)assert(!/[.!?]$/.test(item));
 assert(!/Wait-and-See|확인 조건부|확인 후 결정/.test(entry.revised.deskRecommendation));
 // Every numerical/date token is preserved within its original field.
 for(const k of ['executiveSummary','bullishFactors','bearishFactors','watchItems'] as const){
  const nums=(v:unknown)=>JSON.stringify(v).match(/\d+(?:[.,/~:-]\d+)*/g)||[];
  assert.deepEqual(nums(entry.revised[k]),nums(entry.original[k]),k);
 }
 const html=renderToStaticMarkup(<AiRecommendation commodityId={entry.commodity} researchGeneratedAt={d.generatedAt} researchSources={d.sources} researchStatus="cached" recommendedCoverage={d.deskRecommendation} executiveSummary={d.executiveSummary} bullishFactors={d.bullishFactors} bearishFactors={d.bearishFactors} watchItems={d.watchItems}/>);
 for(const text of [entry.revised.deskRecommendation,entry.revised.executiveSummary,...entry.revised.bullishFactors,...entry.revised.bearishFactors,...entry.revised.watchItems])assert(html.includes(text));
 assert(!html.includes('RMS 문체 편집'));assert(html.includes('data-rms-editorial="'+entry.review.version+'"'));for(const source of d.sources)assert(html.includes(source.url));
 assert.equal(rmsAiEditorial(entry.commodity,'future-generation',d.sources,d).editorial,null);
 assert.equal(rmsAiEditorial(entry.commodity,d.generatedAt,[...d.sources].reverse(),d).editorial,null);
 assert.equal(rmsAiEditorial(entry.commodity,d.generatedAt,d.sources,{...d,executiveSummary:d.executiveSummary+' 추가'}).editorial,null);
 assert.equal(rmsAiEditorial('soybean-oil',d.generatedAt,d.sources,d).editorial,null);
 assert.equal(createHash('sha256').update(fs.readFileSync(entry.snapshot.path)).digest('hex'),entry.snapshot.sha256);
}
console.log('PASS: three actual saved reports, immutable snapshot hashes, exact identity guards, concise noun-phrase factors, noun-phrase watch items, short recommendations, preserved figures/dates/sources and internal editorial audit.');
