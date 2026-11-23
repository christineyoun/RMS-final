import test from 'node:test';
import assert from 'node:assert/strict';
import {newsSummaryRepairFeedback,planNewsSummaryRepair,NEWS_SUMMARY_REPAIR_GUIDANCE} from '../newsSummaryRepair.ts';

const candidate=(id:number)=>({rawId:'source-'+id,originalUrl:`https://publisher${id}.org/news/${id}`,rawTitle:'Source report '+id,rawSnippet:'Original source market development and data '+id});
const inputs=Array.from({length:6},(_,i)=>candidate(i));

test('retries only verified originals omitted from a batch or with invalid evidence binding',()=>{
  const accepted=[{originalUrl:inputs[0].originalUrl}];
  const rejections=[
    {url:inputs[1].originalUrl,reason:'missing-model-output'},
    {url:inputs[2].originalUrl,reason:'missing-or-invalid-korean-summary'},
    {url:inputs[3].originalUrl,reason:'no-specific-market-development'},
    {url:inputs[4].originalUrl,reason:'article-body-unavailable'},
    {url:inputs[5].originalUrl,reason:'unsupported-number:99'}
  ];
  assert.deepEqual(planNewsSummaryRepair(inputs,accepted,rejections),[inputs[1],inputs[2],inputs[5]]);
});

test('does not repair an already accepted complete batch; recovers omissions even with one verified original',()=>{
  const rejected=inputs.map(x=>({url:x.originalUrl,reason:'invalid-or-missing-news-evidence-ids'}));
  assert.deepEqual(planNewsSummaryRepair(inputs,inputs.slice(0,4),rejected),[]);
  assert.deepEqual(planNewsSummaryRepair(inputs.slice(0,3),[{originalUrl:inputs[0].originalUrl}],rejected),inputs.slice(1,3));
  assert.deepEqual(planNewsSummaryRepair(inputs.slice(0,2),[{originalUrl:inputs[0].originalUrl}],rejected),inputs.slice(1,2));
  assert.deepEqual(planNewsSummaryRepair(inputs.slice(0,1),[],rejected),inputs.slice(0,1));
});

test('no permission to fabricate input, retry irrelevant source, or exceed bounded retry count',()=>{
  const rejected=inputs.map(x=>({url:x.originalUrl,reason:'invalid-or-missing-news-evidence-ids'}));
  const corrupted=[{...inputs[0],rawSnippet:''},...inputs.slice(1),{...inputs[1]}];
  assert.deepEqual(planNewsSummaryRepair(corrupted,[],rejected,4,2),inputs.slice(1,3));
  assert.deepEqual(planNewsSummaryRepair(inputs,[],[{url:inputs[0].originalUrl,reason:'off-topic'}]),[]);
});

test('numeric failure removes the invalid draft and reported number from the repair input',()=>{
  const draft={title:'Futures at 420.75',summary:'Unsupported numeric claim',evidenceIds:['old']};
  assert.deepEqual(newsSummaryRepairFeedback('unsupported-number:420.75',draft),{
    failedValidation:'unsupported-number',repairMode:'qualitative-from-original',previousRejectedDraft:null,
  });
  assert.deepEqual(newsSummaryRepairFeedback('invalid-or-missing-news-evidence-ids',draft),{
    failedValidation:'invalid-or-missing-news-evidence-ids',repairMode:'correct-original-binding',previousRejectedDraft:draft,
  });
});

test('newer independently verified rejected original may be repaired when four older valid summaries exist',()=>{
 const clock=new Date('2026-11-23T00:30:00Z');
 const approved=inputs.slice(0,4).map(x=>({originalUrl:x.originalUrl,publishedAt:'2026-11-19'}));
 const source={...inputs[4],publishedAt:'2026-11-22'};
 const older={...inputs[5],publishedAt:'2026-11-17'};
 const rejected=[{url:source.originalUrl,reason:'unsupported-number:269만'},
                 {url:older.originalUrl,reason:'unsupported-number:99'}];
 assert.deepEqual(planNewsSummaryRepair([...inputs.slice(0,4),older,source],approved,rejected,4,6,clock),[source]);
 assert.deepEqual(planNewsSummaryRepair([...inputs.slice(0,4),older],approved,rejected,4,6,clock),[]);
 assert.deepEqual(planNewsSummaryRepair([...inputs.slice(0,4),{...source,publishedAt:'2026-11-10'}],approved,rejected,4,6,clock),[]);
});

test('eligible newer repair takes precedence over old rejected bulletins without overriding evidence checks',()=>{
 const current=new Date('2026-11-23T02:00:00Z');
 const newest={...inputs[5],publishedAt:'2026-11-22'};
 const old={...inputs[4],publishedAt:'2026-10-30'};
 const rejections=[{url:old.originalUrl,reason:'unsupported-number:1'},
                   {url:newest.originalUrl,reason:'unsupported-number:2'}];
 assert.deepEqual(planNewsSummaryRepair([...inputs.slice(0,2),old,newest],
   [{originalUrl:inputs[0].originalUrl}],rejections,4,1,current),[newest]);
});

test('numeric-repair prompt cannot reuse rejected figures or require substitute quantities',()=>{
 const feedback=newsSummaryRepairFeedback('unsupported-number:269만',{title:'invalid',summary:'invalid'});
 assert.equal(feedback.previousRejectedDraft,null);
 assert.equal(feedback.repairMode,'qualitative-from-original');
 assert.match(NEWS_SUMMARY_REPAIR_GUIDANCE,/Do not include digits/);
 assert.match(NEWS_SUMMARY_REPAIR_GUIDANCE,/Do not infer a market direction from a number alone/);
 assert.match(NEWS_SUMMARY_REPAIR_GUIDANCE,/source-supported qualitative development/);
 assert.match(NEWS_SUMMARY_REPAIR_GUIDANCE,/Omit the article/);
});
