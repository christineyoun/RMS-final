import {load} from 'cheerio';
/** Read-only Soybean adapters. No refreshes, model calls, snapshot writes or inferred crop damage. */
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {readSoybeanHistory,SOYBEAN_SOURCE_URL} from './soybeanPriceHistoryStore.ts';
import {observedPriceChanges} from '../utils/observedPriceChanges.ts';
import {readVerifiedSoybeanNews,SOYBEAN_NEWS_CARDS} from './soybeanNewsPersistence.ts';
import {isRecentSoybeanWeather,SOYBEAN_HEAT_SCREEN} from './soybeanOriginConditionsService.ts';
import type {AnalysisFact,AnalysisEvidence} from './analysisEvidence.ts';
import {compareAnalysisObservations,validAnalysisFact} from './analysisEvidence.ts';
const sha=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function collectSoybeanPriceWeatherEvidence(root:string,now:Date):AnalysisEvidence {
 const result:AnalysisEvidence={commodity:'soybean',facts:[],failures:[]};
 const add=(f:AnalysisFact)=>{if(validAnalysisFact(f,'soybean',now))result.facts.push(f);else result.failures.push('invalid-soybean-evidence:'+f.id);};
 try{
  const history=readSoybeanHistory(path.join(root,'.rms-price-history/soybean.json')),snapshot=history.snapshot;
  if(!snapshot||snapshot.stale||!history.lastSuccessAt||now.getTime()-Date.parse(history.lastSuccessAt)>=3*86400000)throw Error('No recently successful saved Yahoo history');
  const latest=snapshot.data.at(-1)!;
  if(now.getTime()-Date.parse(latest.date)>=8*86400000)throw Error('Latest observation is stale');
  const moves=observedPriceChanges(snapshot.data);
  const dates=new Set([latest.date,...snapshot.data.slice(-5).map(p=>p.date),moves.wow.referenceDate,moves.mom.referenceDate].filter(Boolean));
  const facts=snapshot.data.filter(p=>dates.has(p.date)).map((p:any):AnalysisFact=>({
   id:'soybean-zs-'+p.date,commodity:'soybean',topic:'대두',
   text:`${p.date} CBOT ZS=F 대두 Yahoo 일봉 ${p.centsPerBushel} US¢/bu, ${p.usdPerMT} USD/MT (36.7437 bu/MT로 환산). ${p.isProvisional?'잠정 일봉':'Yahoo 일봉'}이며 공식 CBOT 정산 확인 안 됨. 일반 선물 연결 심볼로 롤오버 미검증, 현물·한국 도착 원가 아님.`,
   sourceUrl:SOYBEAN_SOURCE_URL,sourceTitle:'Yahoo Finance · CBOT ZS=F daily bars',observedAt:p.date,verifiedAt:p.lastRetrievedAt||snapshot.fetchedAt,verification:'original-record',recordSha256:sha(p),
   measure:{metric:'price',scope:'Yahoo-generic-futures-daily-bar-not-verified-settlement',benchmark:'CBOT:ZS=F',unit:'USD/MT',value:p.usdPerMT,valueKind:'actual'}}));
  for(const f of facts)add(f);
  for(const [name,move] of [['WoW',moves.wow],['MoM',moves.mom]] as const){
   const before=facts.find(f=>f.observedAt===move.referenceDate),current=facts.find(f=>f.observedAt===latest.date);if(!before||!current)continue;
   const comparison=compareAnalysisObservations([before,current]);if(!comparison)continue;
   comparison.id='soybean-zs-'+name.toLowerCase()+'-'+before.observedAt+'--'+current.observedAt;
   comparison.text+=` ${name} 실제 관측일 비교이며 중간 경로의 지속 추세·확정 정산·현물 도입 비용 변화는 입증하지 않습니다.`;
   comparison.interpretations=[`해당 두 관측일 사이 대두 선물 일봉의 순변화이며 지속 추세나 현물 원가 변화가 아닙니다.`];
   add(comparison);
  }
 }catch(e){result.failures.push('Soybean-price:'+String((e as Error).message));}
 try{
  const cache=JSON.parse(fs.readFileSync(path.join(root,'.rms-origin-verified/soybean-nasa-power-v2.json'),'utf8'));
  if(cache.version!==2||!Array.isArray(cache.points))throw Error('Missing lossless NASA daily cache');
  const countries:Record<string,string>={usa:'미국',brazil:'브라질',argentina:'아르헨티나',paraguay:'파라과이'};
  for(const p of cache.points){
   if(!isRecentSoybeanWeather(p,now.getTime())||p.retrievalFailed||p.rainfallDays!==7||p.temperatureDays!==7){result.failures.push('Soybean-weather-insufficient:'+p.location);continue;}
   add({id:'soybean-weather-'+p.key+'-'+sha(p.location).slice(0,8)+'-'+p.lastDay,commodity:'soybean',topic:'대두',
    text:`NASA POWER ${p.daily[0].date}~${p.lastDay} LST ${countries[p.key]} ${p.location} 대표 격자 기상: 7일 강수 ${p.precip7mm} mm, 일최고기온 ${SOYBEAN_HEAT_SCREEN.temperatureC}°C 이상 ${p.hotDays}일. ${p.hotDays>=SOYBEAN_HEAT_SCREEN.minObservedDays?'반복 고온 선별 신호':'반복 고온 선별 임계 신호 없음'}이며 지역 전체 작황·토양수분·가뭄·침수·피해 판정 아님.`,
    sourceUrl:p.sourceUrl,sourceTitle:'NASA POWER · '+countries[p.key]+' '+p.location,observedAt:p.lastDay,verifiedAt:p.checkedAt,verification:'original-record',recordSha256:sha(p),
    measure:{metric:'weather-screen',scope:p.key+':'+p.location+':grid:LST',benchmark:'NASA POWER:T2M_MAX,PRECTOTCORR',unit:'observed days Tmax>=35°C',value:p.hotDays,valueKind:'actual'}});
  }
 }catch(e){result.failures.push('Soybean-weather:'+String((e as Error).message));}
 return result;
}
export function collectSoybeanArticleEvidence(root:string,now:Date):AnalysisEvidence {
 const result:AnalysisEvidence={commodity:'soybean',facts:[],failures:[]};const cards=readVerifiedSoybeanNews(root,now);
 const push=(a:any,suffix:string,text:string,metric:string,value:number,unit:string,scope:string,kind:'actual'|'forecast',observedAt=a.publishedAt)=>{
  const fact:AnalysisFact={id:'article-soybean-'+sha(a.originalUrl).slice(0,12)+'-'+suffix,commodity:'soybean',topic:'대두',text,
   sourceUrl:a.originalUrl,sourceTitle:a.sourceHeadline,observedAt,verifiedAt:a.verifiedAt,verification:'original-record',recordSha256:a.receiptSha256,
   measure:{metric,value,unit,scope,benchmark:'publisher-attributed:'+a.sourceName,valueKind:kind}};
  if(validAnalysisFact(fact,'soybean',now))result.facts.push(fact);else result.failures.push('Soybean-article-stale:'+fact.id);
 };
 for(const a of cards){
  const i=SOYBEAN_NEWS_CARDS.findIndex(c=>c.originalUrl===a.originalUrl);
  // Reuse the already verified receipt, without changing it or refetching.
  let quote:string|undefined;
  if(i===0||i===1)try{
   const receipt=JSON.parse(fs.readFileSync(path.join(root,'.rms-stage3/evidence/articles/article-'+a.receiptSha256+'.json'),'utf8'));
   if(receipt.sourceUrl===a.originalUrl&&typeof receipt.html==='string'&&createHash('sha256').update(receipt.html).digest('hex')===a.receiptSha256){
    const $=load(receipt.html);quote=$('p').toArray().map(p=>$(p).text().replace(/\s+/g,' ').trim()).find(p=>i===0?/November shipment.*505\.23.*New Orleans.*517\.38.*Santos/i.test(p):/Mato Grosso.*52%.*five[‐‑-]year average.*43%/i.test(p));
   }
  }catch{/* Missing original quotation grants no qualifier/geographic permission. */}
  const first=result.facts.length;
  if(i===0)push(a,'export-offer',`Commodity Board ${a.publishedAt} 보도: 2026-10-15 기준 11월 선적 미국 뉴올리언스 FOB 대두 오퍼 505.23 USD/MT, 브라질 산투스 517.38 USD/MT. 보도된 참고 오퍼이며 한국 도착 원가·현재 확정 공급사 견적 아님.`,'price',505.23,'USD/MT','reported-Nov2026-US-NewOrleans-FOB-offer','actual','2026-10-15');
  if(i===1)push(a,'brazil-planting',`Commodity Board ${a.publishedAt} 보도: 브라질 마토그로소 2026/27년 대두 파종률 약 52%, 5년 평균 약 43%. 일부 북부 지역 건조 우려를 함께 전한 보도이며 미국 파종률·공식 crop-loss 통계 아님.`,'planting-progress',52,'%','Brazil:Mato Grosso:2026/27:reported-planting','actual');
  if(i===2)push(a,'september-us-production',`World Grain ${a.publishedAt} 보도: USDA의 2026년 9월 2026/27년 미국 대두 생산 전망 4.535 billion bushels. 보도된 이전 월 전망이며 10월 ERS 전망·세계 생산량과 구분합니다.`,'생산',4.535,'billion bushels','US:2026/27:September2026-forecast-reported','forecast','2026-09');
  if((i===0||i===1)&&quote)for(const fact of result.facts.slice(first))fact.referenceContext={receiptSha256:a.receiptSha256,quote};
  if(i===3){
   push(a,'us-production',`USDA ERS ${a.publishedAt} 업데이트: 2026/27년 미국 대두 생산 전망 4.56 billion bushels, 전월 전망 대비 27 million bushels 상향. 단수 전망 상향에 따른 조정이며 확정 수확량 아님.`,'생산',4.56,'billion bushels','US:2026/27:October2026-forecast','forecast');
   push(a,'us-exports',`USDA ERS ${a.publishedAt} 업데이트: 2026/27년 미국 대두 수출 전망 약 1.7 billion bushels, 전월 전망 대비 10 million bushels 상향. 실제 선적 실적·지속 수요 증가 추세 아님.`,'수출',1.7,'billion bushels','US:2026/27:October2026-forecast','forecast');
   push(a,'us-stocks',`USDA ERS ${a.publishedAt} 업데이트: 2026/27년 미국 대두 기말재고 전망 315 million bushels. 절대 전망 수치이며 재고 부족·충분 판정 또는 월간 실제 재고 변화 아님.`,'기말재고',315,'million bushels','US:2026/27:October2026-forecast','forecast');
  }
 }
 for(const c of SOYBEAN_NEWS_CARDS)if(!cards.some(a=>a.originalUrl===c.originalUrl))result.failures.push('Soybean-article-not-verified:'+c.originalUrl);
 return result;
}
