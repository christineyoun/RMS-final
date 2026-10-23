import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createStage3Gateway} from '../stage3DailyUpdates.ts';
import {collectAnalysisEvidence} from '../analysisEvidence.ts';
import {assessProcurementRisk} from '../../utils/procurementRisk.ts';
import {procurementRiskDisplayText} from '../../utils/procurementRiskPresentation.ts';

const ids=['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'];
const native=fetch;globalThis.fetch=async()=>{throw Error('No provider requests');};
const now=new Date('2026-10-23T00:00:00Z');
const files=ids.map(id=>`.rms-stage3/snapshots/analysis-${id}.json`).concat('src/data/rmsAiEditorialOverlays.json','.rms-stage3/settings.json','.rms-stage3/paid-requests.jsonl');
const hash=()=>files.map(p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'));const before=hash();
try{
 const gateway=createStage3Gateway(),responses:any={};
 for(const id of ids){gateway({method:'GET',url:'/api/market-intelligence?commodity='+id,headers:{},socket:{}} as any,{setHeader(){},end(s:string){responses[id]=JSON.parse(s);}} as any,()=>assert.fail('Saved source route'));
  const risk=responses[id].procurementRisk,raw=JSON.stringify(risk),text=procurementRiskDisplayText(risk);
  assert(!/\(\d{4}-\d{2}-\d{2}\)/.test(text));assert.equal(JSON.stringify(risk),raw,'Formatting cannot mutate evidence or status');
  assert(text.split(/(?<=[.!?])\s+/u).length<=2,id+' concise full sentences');assert(risk.evidence.every((e:any)=>e.date));
 }
 const actual=responses.soybean,news=actual.articles,facts=collectAnalysisEvidence('soybean').facts;
 assert.equal(actual.procurementRisk.level,'안정','Actual supply, normal planting and FOB evidence buffer localized dryness');
 const worse=news.map((a:any)=>({...a,summary:a.summary.replace('일부 북부 지역의 건조 우려는 남아 있지만 전체 파종은 대체로 일정대로 진행되고 있다는 평가입니다.','실제 작황 피해와 현물 공급 제약이 확인됐습니다.')}));
 assert.equal(assessProcurementRisk('soybean',worse,facts,now).level,'주의','Confirmed physical constraint outweighs the buffer');
 const deficit=facts.map(f=>f.measure?.metric==='생산'?{...f,text:f.text.replace(String(f.measure.value),"1"),measure:{...f.measure,value:1}}:f);
 const deficitRisk=assessProcurementRisk('soybean',news,deficit,now);assert.equal(deficitRisk.level,'주의','Changed official balance invalidates the localized-watch override');assert(deficitRisk.evidence.some(e=>e.text.includes('세계 대두 생산')),'Visible reason follows the changed balance');
 const rebound=facts.map(f=>f.id.includes('wow')&&f.comparison?{...f,text:"OFFLINE FIXTURE: 대두 price 관측값: 100 → 105 USD/MT, 변화 5%.",comparison:{...f.comparison,pct:5}}:f);
 const priceRisk=assessProcurementRisk('soybean',news,rebound,now);assert.equal(priceRisk.level,'주의','Existing price-pressure convention remains relevant alongside supply');assert(priceRisk.evidence.some(e=>e.text.includes('price 관측값')),'Visible reason follows the price input');
 const formatter=procurementRiskDisplayText(actual.procurementRisk);assert(formatter.includes('2026/27'));assert(!formatter.includes('10월 15일'));assert(formatter.includes('건조 우려'));
 const changed=structuredClone(actual.procurementRisk);changed.evidence[0].text=changed.evidence[0].text.replace('45억6,000만','46억');assert(procurementRiskDisplayText(changed).includes('46억'),'New evidence figures update wording without a maintained summary');
 assert(procurementRiskDisplayText(responses['soybean-oil'].procurementRisk).includes('9월'));
 assert(procurementRiskDisplayText(responses['soybean-oil'].procurementRisk).includes('12.3%'));
 const gap=assessProcurementRisk('tapioca-starch',[],[],now);assert.equal(gap.level,'판정 보류');assert(procurementRiskDisplayText(gap).includes('미확인:'));
 const interruption={...actual.articles[0],summary:'대두 수출 중단 조치가 시행됐습니다.'};const high=assessProcurementRisk('soybean',[interruption],facts,now);assert.equal(high.level,'경계');assert(procurementRiskDisplayText(high).includes('수출 중단'));
 assert.deepEqual(hash(),before);
 console.log('PASS eight real saved gateways; concise date-free display; preserved forecast/monthly scope and metadata; buffered soybean versus real damage/deficit/price changes; refreshed wording; truthful gaps; severe-event wording; no provider calls or protected writes.');
}finally{globalThis.fetch=native;}
