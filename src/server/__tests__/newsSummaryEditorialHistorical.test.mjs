import test from 'node:test';
import assert from 'node:assert/strict';
import {planEvidenceBoundEditorialRevision,improvedEditorialRevision} from '../newsSummaryEditorialRevision.ts';
const source=(url)=>({rawId:url,originalUrl:url,rawTitle:'Real source title',rawSnippet:'Publisher excerpt'});
test('length outliers are planned across commodities without content-specific data',()=>{
  const sourceList=[source('https://example.org/one'),source('https://example.org/two'),source('https://example.org/three')];
  const accepted=[{originalUrl:sourceList[0].originalUrl,summary:'가'.repeat(321)},
    {originalUrl:sourceList[1].originalUrl,summary:'나'.repeat(437)},
    {originalUrl:sourceList[2].originalUrl,summary:'다'.repeat(245)}];
  const chosen=planEvidenceBoundEditorialRevision(sourceList,accepted);
  assert.deepEqual(chosen.map(x=>x.source.originalUrl),[sourceList[0].originalUrl,sourceList[1].originalUrl]);
});
test('no source receipt no revision',()=>{
  assert.deepEqual(planEvidenceBoundEditorialRevision([], [{originalUrl:'https://example.org/a',summary:'가'.repeat(500)}]),[]);
});
test('revision must shorten meaningfully without padding',()=>{
  assert.equal(improvedEditorialRevision('가'.repeat(437),'나'.repeat(275)),true);
  assert.equal(improvedEditorialRevision('가'.repeat(321),'나'.repeat(310)),false);
  assert.equal(improvedEditorialRevision('가'.repeat(250),'나'.repeat(200)),false);
  assert.equal(improvedEditorialRevision('가'.repeat(437),'나'.repeat(100)),false);
});
