import test from 'node:test';
import assert from 'node:assert/strict';
import {planNewsSummaryRepair} from '../newsSummaryRepair.ts';

const candidate=(id:number)=>({rawId:'source-'+id,originalUrl:`https://publisher${id}.org/news/${id}`,rawTitle:'Source report '+id,rawSnippet:'Original source market development and data '+id});
const inputs=Array.from({length:6},(_,i)=>candidate(i));

test('retries only verified originals omitted from a batch or with invalid evidence binding',()=>{
  const accepted=[{originalUrl:inputs[0].originalUrl}];
  const rejections=[
    {url:inputs[1].originalUrl,reason:'invalid-or-missing-news-evidence-ids'},
    {url:inputs[2].originalUrl,reason:'missing-or-invalid-korean-summary'},
    {url:inputs[3].originalUrl,reason:'no-specific-market-development'},
    {url:inputs[4].originalUrl,reason:'article-body-unavailable'},
    {url:inputs[5].originalUrl,reason:'unsupported-number:99'}
  ];
  assert.deepEqual(planNewsSummaryRepair(inputs,accepted,rejections),[inputs[1],inputs[2],inputs[5]]);
});

test('never repairs a complete batch; recovers a model omission from a sparse verified pool',()=>{
  const rejected=inputs.map(x=>({url:x.originalUrl,reason:'invalid-or-missing-news-evidence-ids'}));
  assert.deepEqual(planNewsSummaryRepair(inputs,inputs.slice(0,4),rejected),[]);
  assert.deepEqual(planNewsSummaryRepair(inputs.slice(0,3),[{originalUrl:inputs[0].originalUrl}],rejected),inputs.slice(1,3));
  assert.deepEqual(planNewsSummaryRepair(inputs.slice(0,2),[{originalUrl:inputs[0].originalUrl}],rejected),inputs.slice(1,2));
  assert.deepEqual(planNewsSummaryRepair(inputs.slice(0,1),[],rejected),[]);
});

test('no permission to fabricate input, retry irrelevant source, or exceed bounded retry count',()=>{
  const rejected=inputs.map(x=>({url:x.originalUrl,reason:'invalid-or-missing-news-evidence-ids'}));
  const corrupted=[{...inputs[0],rawSnippet:''},...inputs.slice(1),{...inputs[1]}];
  assert.deepEqual(planNewsSummaryRepair(corrupted,[],rejected,4,2),inputs.slice(1,3));
  assert.deepEqual(planNewsSummaryRepair(inputs,[],[{url:inputs[0].originalUrl,reason:'off-topic'}]),[]);
});
