import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {planEvidenceBoundEditorialRevision,improvedEditorialRevision} from '../newsSummaryEditorialRevision.ts';

const ids=['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'];
const source=(n:number)=>({rawId:'news-'+n,originalUrl:'publisher-'+n,rawTitle:'Verified original '+n,rawSnippet:'Publisher evidence '+n});
const article=(n:number,count:number)=>({originalUrl:'publisher-'+n,summary:'가'.repeat(count)});
for(const commodity of ids){
  test(commodity+': only independently verified accepted long summaries are eligible',()=>{
    const pool=[source(1),source(2),source(3),source(4)];
    const accepted=[article(1,225),article(2,290),article(3,665),article(4,250)];
    const planned=planEvidenceBoundEditorialRevision(pool,accepted);
    assert.deepEqual(planned.map(x=>x.source.rawId),['news-3']);
  });
}
test('never use a missing/orphaned source or editorial-length-only padding',()=>{
  assert.equal(planEvidenceBoundEditorialRevision([source(1)],[article(9,610)]).length,0);
  assert.equal(planEvidenceBoundEditorialRevision([source(1)],[article(1,215)]).length,0);
  assert.equal(improvedEditorialRevision('가'.repeat(600),'가'.repeat(80)),false);
  assert.equal(improvedEditorialRevision('가'.repeat(600),'가'.repeat(290)),true);
  assert.equal(improvedEditorialRevision('가'.repeat(600),'가'.repeat(510)),false);
});
test('bounded batch and invalid bounds are handled without editing data',()=>{
  const inputs=Array.from({length:4},(_,i)=>source(i));
  const accepted=Array.from({length:4},(_,i)=>article(i,580));
  assert.equal(planEvidenceBoundEditorialRevision(inputs,accepted).length,2);
  assert.equal(planEvidenceBoundEditorialRevision(inputs,accepted,99).length,0);
  assert.equal(accepted[0].summary.length,580);
});
test('the live revision is verified through existing source-binding and paid transport',()=>{
  const txt=fs.readFileSync(path.join(process.cwd(),'src/server/marketIntelligenceService.ts'),'utf8');
  assert.match(txt,/planEvidenceBoundEditorialRevision\(\s*\[\.\.\.verifiedLocked,\.\.\.previousEditorial\.map\(x=>x\.source\)\],\s*\[\.\.\.groundedArticles,\.\.\.previousEditorial\.map\(x=>x\.article\)\]/);
  assert.match(txt,/evaluateSavedNewsSummaries\(key,revisionSources,/);
  assert.match(txt,/requireEvidenceIds:true/);
  assert.match(txt,/getStage3RunContext\(\)/);
  assert.match(txt,/paidContext\.attempts<paidContext\.maxCalls|editorialContext\.attempts<editorialContext\.maxCalls/);
  assert.match(txt,/recordNewsSummary\(key,revisionSources,/);
  assert.match(txt,/improvedEditorialRevision\(original\.summary,revision\.summary\)/);
});
