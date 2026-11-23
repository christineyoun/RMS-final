import test from 'node:test';
import assert from 'node:assert/strict';
import {auditNewsEditorialHandoff} from '../newsEditorialHandoffAudit.ts';
const ids=['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'];
const original=(n:number,day:string)=>({originalUrl:`https://publisher${n}.example.org/article/${n}`,publishedAt:day,sourceName:`Publisher ${n}`});
for(const id of ids){
 test(`${id}: separately diagnoses verified originals, editorial rejection and the handoff`,()=>{
  const earlier=original(1,'2026-11-19'),recent=original(2,'2026-11-22');
  const result=auditNewsEditorialHandoff([recent,earlier],[recent,earlier],[earlier],[earlier],
    [{url:recent.originalUrl,reason:'unsupported-number:269만'}]);
  assert.equal(result.newestVerifiedSourceDate,'2026-11-22');
  assert.equal(result.newestHandoffDate,'2026-11-19');
  assert.deepEqual(result.newerVerifiedNotInHandoff,[{
    publishedAt:recent.publishedAt,sourceName:recent.sourceName,originalUrl:recent.originalUrl,
    stage:'editorial-validation-failed',reason:'unsupported-number:269만'
  }]);
 });
}
test('a source crowded out before summarization is not falsely called a failed numerical summary',()=>{
 const old=original(0,'2026-11-19'),novel=original(1,'2026-11-22');
 const audit=auditNewsEditorialHandoff([old,novel],[old],[old],[old],[]);
 assert.equal(audit.newerVerifiedNotInHandoff[0].stage,'verified-but-not-in-editorial-input');
 assert.equal(audit.newerVerifiedNotInHandoff[0].reason,null);
});
test('an approved summary omitted during final selection is distinct from validation failure',()=>{
 const old=original(0,'2026-11-19'),novel=original(1,'2026-11-22');
 const audit=auditNewsEditorialHandoff([old,novel],[old,novel],[old,novel],[old],[]);
 assert.equal(audit.newerVerifiedNotInHandoff[0].stage,'accepted-summary-not-in-handoff');
});
