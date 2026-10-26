import {POTATO_RESEARCH_URL,POTATO_KMC_URL} from './potatoAnalysisEvidence.ts';
import {collectSugarPriceEvidence,SUGAR_PRICE_URL,SUGAR_RESEARCH_URL} from './sugarAnalysisEvidence.ts';
import {collectSoybeanOilEvidence} from './soybeanOilAnalysisEvidence.ts';
import {SOYBEAN_OIL_NEWS_CARDS} from './soybeanOilVerifiedNews.ts';
import {OIL_ORIGIN_POINTS,oilWeatherSourceUrl,legacyOilWeatherUrl} from './soybeanOilOriginService.ts';
/** Read-only evidence adapter. Model output and AI news summaries are never evidence. */
import fs from 'node:fs';
import {collectSoybeanPriceWeatherEvidence} from './soybeanAnalysisEvidence.ts';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parsePsdWorldRows, getWorldDomesticUseKMT, USDA_WORLD_COMMODITIES} from '../lib/verifiedWorldWasde.ts';
import {parsePalmHistory, validatePalmPublisher, PRICE_SOURCES} from './publicPriceHistory.ts';

export type AnalysisFact={id:string;commodity:string;topic:string;text:string;sourceUrl:string;sourceTitle:string;
  observedAt:string;verifiedAt:string;verification:'original-record';recordSha256:string;
  measure?:{metric:string;scope:string;benchmark:string;unit:string;value:number;valueKind:'actual'|'forecast'|'proxy'};
  comparison?:{metric:string;baselineId:string;currentId:string;direction:'increase'|'decrease'|'unchanged';pct:number;observationCount:number;monotonic:boolean};
  interpretations?:string[];referenceContext?:{receiptSha256:string;quote:string}};
export type AnalysisEvidence={commodity:string;facts:AnalysisFact[];failures:string[]};
const sha=(x:string)=>createHash('sha256').update(x).digest('hex');
const read=(file:string)=>JSON.parse(fs.readFileSync(file,'utf8'));
const dateOK=(value:string,now:Date)=>typeof value==='string'&&/^\d{4}-\d{2}(?:-\d{2})?(?:T.*)?$/.test(value)&&Number.isFinite(Date.parse(value))&&Date.parse(value)<=now.getTime()+60000;
export function validAnalysisFact(f:AnalysisFact,id:string,now=new Date()):boolean {
  return !!f&&f.commodity===id&&f.verification==='original-record'&&/^[a-f0-9]{64}$/.test(f.recordSha256)&&
    typeof f.id==='string'&&!!f.id&&typeof f.text==='string'&&f.text.length>20&&!!f.topic&&
    dateOK(f.observedAt,now)&&dateOK(f.verifiedAt,now)&&now.getTime()-Date.parse(f.verifiedAt)<45*86400000&&
    trustedAnalysisUrl(f.sourceUrl);
}
export function trustedAnalysisUrl(value:string):boolean {
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&
    ((u.hostname==='uswheat.org'&&/^\/wp-content\/uploads\/20\d{2}\/\d{2}\/PR-\d{6}\.pdf$/.test(u.pathname)||u.href==='https://www.igc.int/en/gmr_summary.aspx'||u.hostname==='grains.org'&&/^\/market_perspectives\/[a-z0-9-]+\/$/.test(u.pathname)||u.hostname==='www.chinimandi.com'&&/^\/[a-z0-9-]{20,}\/$/.test(u.pathname)||u.href==='https://www.thaitapiocastarch.org/en/information/statistics/weekly_tapioca_starch_price'||u.href===POTATO_RESEARCH_URL||u.href===POTATO_KMC_URL||u.href===SUGAR_PRICE_URL||u.href===SUGAR_RESEARCH_URL||SOYBEAN_OIL_NEWS_CARDS.some(c=>c.originalUrl===u.href))||OIL_ORIGIN_POINTS.some(p=>(oilWeatherSourceUrl(p)===u.href||legacyOilWeatherUrl(p)===u.href))||
     u.hostname==='query1.finance.yahoo.com'&&['/v8/finance/chart/ZS%3DF','/v8/finance/chart/ZL%3DF','/v8/finance/chart/ZC%3DF'].includes(u.pathname)&&u.searchParams.get('range')==='5y'&&u.searchParams.get('interval')==='1d'||
     u.hostname==='power.larc.nasa.gov'&&u.pathname==='/api/temporal/daily/point'||
     u.hostname==='commodity-board.com'&&/^\/[a-z0-9-]{20,}\/?$/.test(u.pathname)||
    /(^|\.)(api\.fas\.usda\.gov|investing\.com|ec\.europa\.eu|usda\.gov|conab\.gov\.br|mpob\.gov\.my|bernama\.com|briefs\.co|theedgemalaysia\.com|sunsirs\.com|reuters\.com|ukragroconsult\.com|world-grain\.com|ahdb\.org\.uk|agriculture\.com|eia\.gov|potatopro\.com|fao\.org)$/.test(u.hostname));}catch{return false;}
}
/** Same metric/benchmark/unit/scope and value kind only; no CPO/Olein mixing. */
export function compareAnalysisObservations(points:AnalysisFact[]):AnalysisFact|null {
  const sorted=[...points].sort((a,b)=>a.observedAt.localeCompare(b.observedAt)),a=sorted[0],b=sorted.at(-1);
  if(!a||!b||a.id===b.id||a.observedAt>=b.observedAt||!a.measure||a.measure.value<=0||sorted.some(f=>!f.measure||
    ['metric','scope','benchmark','unit','valueKind'].some(k=>f.measure![k]!==a.measure![k])||f.commodity!==a.commodity||f.sourceUrl!==a.sourceUrl||!Number.isFinite(f.measure.value)))return null;
  const delta=b.measure!.value-a.measure.value,pct=Number((delta/a.measure.value*100).toFixed(2));
  const direction=delta>0?'increase':delta<0?'decrease':'unchanged';
  const verb=delta>0?'상승':delta<0?'하락':'동일';
  const monotonic=sorted.every((f,i)=>!i||(direction==='increase'?f.measure!.value>sorted[i-1].measure!.value:direction==='decrease'?f.measure!.value<sorted[i-1].measure!.value:f.measure!.value===sorted[i-1].measure!.value));
  return {...b,id:`comparison-${a.id}--${b.id}`,recordSha256:sha(JSON.stringify(sorted)),
    text:`${a.observedAt} 대비 ${b.observedAt} ${b.topic} ${a.measure.metric} 관측값: ${a.measure.value} → ${b.measure!.value} ${a.measure.unit}, 변화 ${pct}%.`,
    comparison:{metric:a.measure.metric,baselineId:a.id,currentId:b.id,direction,pct,observationCount:sorted.length,monotonic},
    interpretations:[`해당 두 관측일 사이 ${b.topic} ${a.measure.metric} 관측값은 ${verb==='동일'?'동일합니다':verb+'했습니다'}.`]};
}

export function collectAnalysisEvidence(id:string,root=process.cwd(),now=new Date()):AnalysisEvidence {
  const evidence:AnalysisEvidence={commodity:id,facts:[],failures:[]};
  const add=(fact:AnalysisFact)=>{if(validAnalysisFact(fact,id,now))evidence.facts.push(fact);else evidence.failures.push('invalid-or-stale-record:'+fact.id);};
  const spec=USDA_WORLD_COMMODITIES[id]||(id==='soybean-oil'?{code:'4232000',ko:'대두유'}:null);
  if(id==='soybean-oil'){const oil=collectSoybeanOilEvidence(root,now);oil.facts.forEach(add);evidence.failures.push(...oil.failures);}
  if(spec&&id!=='soybean-oil')try {
    const file=path.join(root,'src/data',id==='soybean-oil'?'usda_soybean_oil_last_verified.json':`usda_world_last_verified_${id}.json`);
    const saved=read(file),data=saved.data,year=Number(data?.marketYear);
    if(id==='soybean'&&year!==(now.getUTCMonth()>=8?now.getUTCFullYear():now.getUTCFullYear()-1))throw Error('wrong-current-soybean-marketing-year');
    const raw=data?.rawRecords;
    if(saved.commodityCode!==spec.code||data.commodityCode!==spec.code||!Array.isArray(raw)||!raw.length)throw Error('identity-or-records');
    const rows=id==='soybean-oil'?raw:parsePsdWorldRows(raw,id,year);
    if(!rows||rows.some((r:any)=>r.commodityCode!==spec.code||r.countryCode!=='00'||Number(r.marketYear)!==year||
      !Number.isFinite(r.value)||r.value<0||!/^20\d{2}$/.test(String(r.calendarYear))||Number(r.month)<1||Number(r.month)>12))throw Error('invalid-world-records');
    const periods=new Set(rows.map((r:any)=>`${r.calendarYear}-${String(r.month).padStart(2,'0')}`));
    if(periods.size!==1)throw Error('mixed-release-periods');
    const observedAt=[...periods][0] as string;
    const sourceFacts:AnalysisFact[]=[];
    for(const [attribute,label] of [[28,'생산'],[176,'기말재고'],[88,'수출'],[20,'기초재고'],[125,'소비']] as const){
      const matches=rows.filter((r:any)=>r.attributeId===attribute);
      if(!matches.length&&(attribute===20||attribute===125))continue;
      if(!matches.length||matches.some((r:any)=>r.unitId!==8||r.value!==matches[0].value))throw Error('invalid-attribute:'+attribute);
      const row=matches[0];
      const topic=id==='sugar'?'설탕(원심분리당)':spec.ko;
      sourceFacts.push({id:`psd-${attribute}`,commodity:id,topic,text:`USDA PSD ${observedAt} 보고: ${year}/${String(year+1).slice(-2)} 세계 ${topic} ${label} 전망 ${row.value} 천 MT.`,
        sourceUrl:`https://api.fas.usda.gov/api/psd/commodity/${spec.code}/world/year/${year}`,sourceTitle:'USDA FAS PSD',observedAt,verifiedAt:saved.verifiedAt,
        verification:'original-record',recordSha256:sha(JSON.stringify(row)),
        measure:{metric:label,scope:`world:${year}/${year+1}`,benchmark:spec.code,unit:'천 MT',value:row.value,valueKind:'forecast'}});
    }
    if(id==='sugar'){const value=getWorldDomesticUseKMT(rows,id);sourceFacts.push({id:'psd-sugar-domestic-use',commodity:id,topic:'설탕(원심분리당)',text:`USDA PSD ${observedAt} 세계 설탕 ${year}/${String(year+1).slice(-2)} 연간 국내사용 전망 ${value} 천 MT = 총분배(178) - 수출(88) - 기말재고(176). 기존 공식 수급표의 합계 항등식으로 계산한 전망이며 10월 월간 실적이 아닙니다.`,sourceUrl:`https://api.fas.usda.gov/api/psd/commodity/0612000/world/year/${year}`,sourceTitle:'USDA FAS PSD',observedAt,verifiedAt:saved.verifiedAt,verification:'original-record',recordSha256:sha(JSON.stringify(rows)),measure:{metric:'소비',scope:`world:${year}/${year+1}`,benchmark:'0612000',unit:'천 MT',value,valueKind:'forecast'}});}
    const begin=sourceFacts.find(f=>f.id==='psd-20'),end=sourceFacts.find(f=>f.id==='psd-176');
    if(begin&&end&&begin.measure!.value>0){
      const pct=Number(((end.measure!.value/begin.measure!.value-1)*100).toFixed(2));
      sourceFacts.push({...end,id:'psd-forecast-stock-balance',text:`USDA PSD ${observedAt}: ${year}/${String(year+1).slice(-2)} 세계 ${end.topic} 기초재고 ${begin.measure!.value} 천 MT 대비 기말재고 전망 ${end.measure!.value} 천 MT, 차이 ${pct}%. 연간 전망 수지이며 실제 월간 재고 변화나 재고 부족 판정이 아닙니다.`,
        recordSha256:sha(JSON.stringify([begin,end])),comparison:{metric:'annual-stock-forecast-balance',baselineId:begin.id,currentId:end.id,direction:pct>0?'increase':pct<0?'decrease':'unchanged',pct,observationCount:2,monotonic:false},
        interpretations:['기초재고와 기말재고 전망의 차이는 연간 전망 수지이며 실제 월간 재고 감소를 입증하지 않습니다.']});
    }
    for(const fact of sourceFacts)add(fact);
  }catch(error){evidence.failures.push('USDA:'+String((error as Error).message));}
  if(id==='soybean'){const saved=collectSoybeanPriceWeatherEvidence(root,now);for(const f of saved.facts)add(f);evidence.failures.push(...saved.failures);}
  if(id==='sugar'){const prices=collectSugarPriceEvidence(root,now);prices.facts.forEach(add);evidence.failures.push(...prices.failures);}
  if(id==='palm-oil'){
    const dir=path.join(root,'.rms-price-history/source-evidence');
    try {
      const ledger=read(path.join(root,'.rms-price-history/palm-oil.json'));
      const verified=new Map<string,AnalysisFact>();
      for(const name of fs.readdirSync(dir).filter(n=>/^publisher-[a-f0-9]{64}\.json$/.test(n)))try {
        const receipt=read(path.join(dir,name));
        const benchmark=receipt.sourceUrl===PRICE_SOURCES.olein?'palm-olein':receipt.sourceUrl===PRICE_SOURCES.cpoFcpo?'palm-cpo':null;
        if(!benchmark)continue;
        const htmlFile=path.join(dir,`publisher-${receipt.htmlSha256}.html`);
        if(!fs.existsSync(htmlFile)){evidence.failures.push('publisher-receipt-incomplete:'+name);continue;}
        const html=fs.readFileSync(htmlFile,'utf8');
        if(sha(html)!==receipt.htmlSha256||name!==`publisher-${sha(html)}.json`)throw Error('publisher-content-hash-mismatch');
        validatePalmPublisher(html,benchmark,receipt.sourceUrl);
        const rows=parsePalmHistory(html,benchmark,now,true);
        for(const row of rows){
          const saved=ledger.points?.find((p:any)=>p.benchmark===benchmark&&p.sourceUrl===receipt.sourceUrl&&p.date===row.date&&p.value===row.value&&p.unit===row.unit);
          if(!saved)continue;
          // A table/header disagreement is not resolved by silently advancing the quote date.
          if(row.publisherQuoteDate&&row.date>row.publisherQuoteDate)continue;
          const topic=benchmark==='palm-cpo'?'CPO':'RBD Olein';
          const fact:AnalysisFact={id:benchmark+'-'+row.date,commodity:id,topic,
            text:`${row.date} ${benchmark==='palm-cpo'?'Kuala Lumpur FCPOc1 CPO':'Bursa Malaysia FPOLc1 RBD Olein'} 공표 종가 ${row.value} ${row.unit}.`,
            sourceUrl:receipt.sourceUrl,sourceTitle:'Investing.com · '+topic,observedAt:row.date,verifiedAt:receipt.checkedAt,verification:'original-record',recordSha256:receipt.htmlSha256,
            measure:{metric:'price',scope:'publisher-futures-close',benchmark,unit:row.unit,value:row.value,valueKind:'actual'}};
          verified.set(fact.id,fact);
        }
      }catch(error){evidence.failures.push(name+':'+String((error as Error).message));}
      // Retained, independently transcribed original publisher table; not a model assertion.
      const cpoFile=path.join(dir,'palm-fcpo-2026-10-20.json');
      if(fs.existsSync(cpoFile)){
        const receipt=read(cpoFile);
        if(receipt.sourceUrl!==PRICE_SOURCES.cpoFcpo||receipt.unit!=='MYR/MT'||receipt.title!=='Palm Oil (FCPOc1)'||receipt.exchange!=='Kuala Lumpur')throw Error('CPO-receipt-identity');
        for(const row of receipt.observations||[]){
          if(!ledger.points?.some((p:any)=>p.benchmark==='palm-cpo'&&p.sourceUrl===receipt.sourceUrl&&p.date===row.date&&p.value===row.value&&p.unit==='MYR/MT')||!Number.isFinite(row.value)||row.value<=0)continue;
          const fact:AnalysisFact={id:'palm-cpo-'+row.date,commodity:id,topic:'CPO',text:`${row.date} Kuala Lumpur FCPOc1 CPO 공표 종가 ${row.value} MYR/MT.`,sourceUrl:receipt.sourceUrl,sourceTitle:'Investing.com · CPO',observedAt:row.date,verifiedAt:receipt.retrievedAt,verification:'original-record',recordSha256:sha(JSON.stringify(receipt)),
            measure:{metric:'price',scope:'publisher-futures-close',benchmark:'palm-cpo',unit:'MYR/MT',value:row.value,valueKind:'actual'}};
          verified.set(fact.id,fact);
        }
      }
      for(const benchmark of ['palm-cpo','palm-olein']){
        const all=[...verified.values()].filter(f=>f.measure?.benchmark===benchmark).sort((a,b)=>a.observedAt.localeCompare(b.observedAt));
        // Bound prompt size while retaining the baseline and recent real dates.
        const selected=[...new Map([all[0],...all.slice(-5)].filter(Boolean).map(f=>[f.id,f])).values()];
        for(const fact of [...selected].reverse())add(fact);
        for(const window of [all,all.slice(-3)]){const comparison=compareAnalysisObservations(window);if(comparison&&!evidence.facts.some(f=>f.id===comparison.id))add(comparison);}
      }
    }catch(error){evidence.failures.push('publisher:'+String((error as Error).message));}
  }
  if(id==='potato-starch')try{
    const saved=read(path.join(root,'.rms-price-history/potato-production.json'));
    if(saved.lastError||!saved.lastCheckedAt)throw Error('No successful official-history verification timestamp');
    const facts:AnalysisFact[]=saved.years.filter((p:any)=>p.provenance==='source-verified'&&p.status==='Actual'&&p.unit==='MMT'&&p.coverage?.join(',')==='DE,FR,NL,DK'&&/^20\d{2}$/.test(p.year)&&Number(p.year)<now.getUTCFullYear()&&Number.isFinite(p.productionMMT)&&p.productionMMT>0).slice(-3).map((p:any)=>({
      id:'potato-production-'+p.year,commodity:id,topic:'원료감자',text:`Eurostat ${p.year}년 독일·프랑스·네덜란드·덴마크 원료감자 생산량 ${p.productionMMT} MMT. 전분 가격이나 전분 생산량이 아닌 공급 대리지표입니다.`,
      sourceUrl:p.sourceUrl,sourceTitle:'Eurostat · raw potato production',observedAt:p.year+'-12-31',verifiedAt:saved.lastCheckedAt,verification:'original-record',recordSha256:sha(JSON.stringify(p)),
      measure:{metric:'raw-potato-production',scope:'DE,FR,NL,DK',benchmark:'Eurostat:R1000',unit:'MMT',value:p.productionMMT,valueKind:'proxy'}}));
    for(const f of facts)add(f);const comparison=compareAnalysisObservations(facts.slice(-2));if(comparison)add(comparison);
  }catch(error){evidence.failures.push('Eurostat:'+String((error as Error).message));}
  return evidence;
}
