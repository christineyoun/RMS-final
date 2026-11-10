/** Current Market Intelligence acceptance contract: evidence quality and ≤4 cards,
 * not a fixed list of historically published October headlines. Read-only.
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {selectProcurementNews} from '../newsProcurementSelection.ts';
import {createStage3Gateway} from '../stage3DailyUpdates.ts';
import {assessNewsSummary} from '../../utils/newsSummaryQuality.ts';

const ids=['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'];
const now=Date.parse('2026-10-22T07:00:00Z');
const hash=(p:string)=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const snapshots=ids.map(id=>'.rms-stage3/snapshots/analysis-'+id+'.json');
const before=snapshots.map(hash);
const originalFetch=globalThis.fetch;
let network=0;
globalThis.fetch=async()=>{network++;throw Error('Network prohibited in publication regression');};
const article=(title:string,summary:string,date='2026-10-21')=>({title,summary,publishedAt:date,originalUrl:'https://example.org/'+encodeURIComponent(title),sourceName:'Test only',sourceType:'news'});
try{
  assert.deepEqual(selectProcurementNews('corn',[],now),[]);
  const one=article('옥수수 수출 증가','옥수수 수출량은 전주 대비 증가했으며 미국산 수출 수요 회복과 선적 물량 확대가 수급의 주요 변수입니다.');
  assert.equal(selectProcurementNews('corn',[one],now).length,1);
  assert.equal(selectProcurementNews('corn',[one,one],now).length,1,'duplicate source cannot create filler');
  assert.equal(selectProcurementNews('corn',[{...one,publishedAt:'2026-10-23'}],now).length,0,'future dates excluded');
  const promo=article('감자전분 혁신상 수상','감자전분 신제품이 혁신상을 수상했습니다. 회사는 새로운 제품 출시로 판매를 확대한다고 밝혔습니다.');
  assert.equal(selectProcurementNews('potato-starch',[promo],now).length,0,'product award is not procurement intelligence');
  const long=article('옥수수 수출 증가',one.summary.repeat(20));
  assert.equal(selectProcurementNews('corn',[long],now)[0].summary,long.summary,'no CSS-like factual truncation');
  const older={...one,originalUrl:'https://example.org/older-official',publishedAt:'2026-09-01',sourceType:'official'};
  assert.equal(selectProcurementNews('corn',[one,older],now)[0].publishedAt,one.publishedAt);
  assert.equal(selectProcurementNews('corn',[older],now).length,1,'older relevant background may be retained');

  const results:Record<string,number>={};
  const gateway=createStage3Gateway();
  for(const id of ids){
    let body:any,status=0;
    gateway({method:'GET',url:'/api/market-intelligence?commodity='+id,headers:{},socket:{remoteAddress:'127.0.0.1'}} as any,
      {setHeader(){},set statusCode(v:number){status=v;},end(s:string){body=JSON.parse(s);}} as any,
      ()=>{throw Error('Unexpected route');});
    assert.equal(status,200,id);
    assert(Array.isArray(body?.articles),id+': article list');
    assert(body.articles.length<=4,id+': at most four, not an obligatory quota');
    const seen=new Set<string>();
    for(const a of body.articles){
      assert.equal(typeof a.originalUrl,'string',id+': original publisher link');
      assert(a.originalUrl.startsWith('https://'),id+': HTTPS original source required');
      assert(!seen.has(a.originalUrl),id+': duplicate URL rejected');seen.add(a.originalUrl);
      assert(assessNewsSummary(a.summary,a.title,id).pass,id+': meaningful summary');
      assert(a.procurementReview?.rationale,id+': procurement relevance rationale');
      assert.equal(a.linkStatus,'verified',id+': verified article');
      if(a.verifiedSourceEvidence){
        assert.equal(a.verifiedSourceEvidence.originalUrl,a.originalUrl,id+': bound original evidence URL');
        assert.equal(a.verifiedSourceEvidence.publishedAt,a.publishedAt,id+': bound publication date');
      }
      if('title_kr' in a)assert.equal(a.title_kr,a.title);
      if('summary_kr' in a)assert.equal(a.summary_kr,a.summary);
    }
    results[id]=body.articles.length;
  }
  assert.deepEqual(snapshots.map(hash),before,'all existing RMS snapshot data unchanged');
  assert.equal(network,0,'no network or Gemini calls');
  console.log('PASS all eight read-only MI routes; 0–4 verified relevant cards, no forced historical article count; no writes or network:',JSON.stringify(results));
}finally{
  globalThis.fetch=originalFetch;
}
