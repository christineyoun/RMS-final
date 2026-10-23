import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createStage3Gateway} from '../stage3DailyUpdates.ts';
import {assessProcurementRisk} from '../../utils/procurementRisk.ts';
import {readVerifiedTapiocaNews} from '../tapiocaVerifiedNews.ts';

const ids=['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'];
const native=fetch;globalThis.fetch=async()=>{throw Error('Risk evaluation must never fetch external sources');};
const now=new Date('2026-10-23T00:00:00Z');
const files=ids.map(id=>`.rms-stage3/snapshots/analysis-${id}.json`).concat('src/data/rmsAiEditorialOverlays.json','.rms-stage3/settings.json','.rms-stage3/paid-requests.jsonl');
const hashes=()=>files.map(f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex'));
const before=hashes();
const article=(summary:string)=>({summary,title:'OFFLINE TEST FIXTURE',originalUrl:'https://example.org/fixture',linkStatus:'verified',publishedAt:'2026-10-22',retrievedAt:'2026-10-22T10:00:00Z',sourceName:'OFFLINE FIXTURE'});
try{
 const gateway=createStage3Gateway();let total=0;const actual:any={};
 for(const id of ids){let data:any;gateway({method:'GET',url:'/api/market-intelligence?commodity='+id,headers:{},socket:{}} as any,{setHeader(){},end(s:string){data=JSON.parse(s);}} as any,()=>assert.fail('Saved gateway must own the response'));
  actual[id]=data;total+=data.articles.length;assert.equal(data.procurementRisk.commodityId,id);assert(['안정','주의','경계'].includes(data.procurementRisk.level),id+' real evidence must be assessed');assert(data.procurementRisk.evidence.length>0);
  for(const e of data.procurementRisk.evidence){assert(data.articles.some((a:any)=>a.originalUrl===e.url));assert(!Number.isNaN(Date.parse(e.date)));}
  assert(!data.procurementRisk.summarySentenceKo.includes('자료 부족'));
 }
 assert.equal(total,31);assert(actual.corn.procurementRisk.summarySentenceKo.includes('EU')&&actual.corn.procurementRisk.summarySentenceKo.includes('182억'));
 for(const id of ids){let alias:any;gateway({method:'GET',url:'/api/market-intelligence?commodity='+id.replace(/-/g,'_'),headers:{},socket:{}} as any,{setHeader(){},end(s:string){alias=JSON.parse(s);}} as any,()=>assert.fail('Alias mapping failed'));assert.equal(alias.procurementRisk.commodityId,id);assert.deepEqual(alias.articles,actual[id].articles);}
 let invalid:any,invalidStatus=0;gateway({method:'GET',url:'/api/market-intelligence?commodity=unmapped-crop',headers:{},socket:{}} as any,{setHeader(){},set statusCode(v){invalidStatus=v;},end(s:string){invalid=JSON.parse(s);}} as any,()=>assert.fail('Unknown ID must not fall through'));assert.equal(invalidStatus,400);assert.equal(invalid.success,false);assert(!invalid.procurementRisk);
 assert.throws(()=>assessProcurementRisk('unmapped-crop',[],[],now),/Unknown procurement-risk commodity/);
 assert(actual['palm-oil'].procurementRisk.summarySentenceKo.includes('351만'));
 assert(actual['soybean-oil'].procurementRisk.summarySentenceKo.includes('12.3%'));
 assert(actual['tapioca-starch'].procurementRisk.summarySentenceKo.includes('50% 미만'));
 assert(actual['potato-starch'].procurementRisk.summarySentenceKo.includes('완제품 공급 부족 확정과 구분'));
 for(const id of ids){assert.equal(assessProcurementRisk(id,[],[],now).level,'판정 보류');assert.equal(assessProcurementRisk(id,[{...article('수출 중단 조치가 시행됐습니다.'),linkStatus:'unverified'}],[],now).level,'판정 보류');}
 assert.equal(assessProcurementRisk('corn',[article('미국 옥수수 생산 전망 상향으로 공급 완충이 확대됐습니다.')],[],now).level,'안정');
 assert.equal(assessProcurementRisk('corn',[article('EU 옥수수 생산 전망이 상향됐습니다. 미국 생산 전망도 상향됐습니다.')],[],now).level,'안정','EU reference alone is not a warning');
 assert.notEqual(assessProcurementRisk('soybean',[article('북부 지역의 건조 우려가 해소됐습니다.')],[],now).level,'주의','Resolved regional warning cannot be frozen');
 assert.equal(assessProcurementRisk('corn',[article('선물 주간 가격이 8% 급등했습니다.')],[],now).level,'판정 보류','Futures alone cannot color supply risk');
 assert.equal(assessProcurementRisk('corn',[article('옥수수 수출 중단 조치가 시행됐습니다.')],[],now).level,'경계');
 for(const summary of ['옥수수 수출 중단 가능성을 검토할 예정입니다.','옥수수 수출 중단 조치가 해제됐습니다.'])assert.notEqual(assessProcurementRisk('corn',[article(summary)],[],now).level,'경계');
 assert.equal(assessProcurementRisk('tapioca-starch',[article('TTSA 기준가격은 낮아졌습니다.')],[],now).level,'판정 보류','Falling finished-product benchmark alone does not prove normal supply');
 assert.equal(assessProcurementRisk('potato-starch',[article('감자 단수 전망이 하향됐습니다.')],[],now).level,'주의','Upstream warning is not finished-product disruption');
 assert.equal(assessProcurementRisk('corn',[{...article('옥수수 수출 중단 조치가 시행됐습니다.'),publishedAt:'2026-10-24'}],[],now).level,'판정 보류');
 assert.equal(assessProcurementRisk('corn',[{...article('옥수수 수출 중단 조치가 시행됐습니다.'),retrievedAt:'2025-01-01T00:00:00Z'}],[],now).level,'판정 보류');
 // Physical saved-file replay in an isolated root, reusing original receipts.
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rms-risk-saved-')),collection=JSON.parse(fs.readFileSync('src/data/tapioca_news_verified.json','utf8'));
 fs.mkdirSync(path.join(root,'src/data'),{recursive:true});for(const a of collection.articles){const file=path.join(root,a.receipt);fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync(a.receipt,file);}
 const save=()=>fs.writeFileSync(path.join(root,'src/data/tapioca_news_verified.json'),JSON.stringify(collection));save();
 assert.equal(assessProcurementRisk('tapioca-starch',readVerifiedTapiocaNews(root),[],now).level,'주의');
 collection.articles=collection.articles.filter((a:any)=>a.sourceName==='TTSA');save();
 assert.equal(assessProcurementRisk('tapioca-starch',readVerifiedTapiocaNews(root),[],now).level,'판정 보류','Withdrawal of processing evidence changes risk immediately');
 assert.deepEqual(hashes(),before);
 console.log('PASS eight actual saved gateways, 31 unchanged articles, source reasons, no future/stale/unverified color, independent stance, price-only neutrality, bounded crop proxy, real interruption, physical saved reread, zero network/provider calls and unchanged AI/settings/paid ledgers.');
}finally{globalThis.fetch=native;}
