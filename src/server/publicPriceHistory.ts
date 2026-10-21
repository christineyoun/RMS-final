/** Same lifecycle as Wheat: import -> validate dated publisher observations ->
 * merge by identity -> atomic persistence -> serve saved history during outages.
 * Native benchmark/unit and publisher date are never inferred from refresh time. */
import fs from 'node:fs';
import path from 'node:path';
import { load } from 'cheerio';
import {createHash} from 'node:crypto';
import {selectPalmObservations,normalizedPalmPoint,refreshPalmDatedFx,type DatedPalmFx} from './palmPricePolicy.ts';
import { observedPriceChanges } from '../utils/observedPriceChanges.ts';

export const PRICE_SOURCES = {
  cpo: 'https://www.investing.com/commodities/crude-palm-oil-historical-data',
  // Published Kuala Lumpur FCPOc1 series, MYR. CME CPOc1 (USD) is a different contract.
  cpoFcpo: 'https://www.investing.com/commodities/palm-oil-historical-data',
  olein: 'https://www.investing.com/commodities/rbd-palm-olein-historical-data',
  tapioca: 'https://www.thaitapiocastarch.org/en/information/statistics/weekly_tapioca_starch_price',
};
export type PublicPricePoint = {
  benchmark:'palm-cpo'|'palm-olein'|'tapioca-fob'; sourceUrl:string; date:string;
  value:number; unit:'MYR/MT'|'USD/MT'; usdPerMT?:number;
  provenance:'manual-import'|'source-verified'; domesticThb?:number;
  publisherQuoteDate?:string;observationKind?:'publisher-close';
  conversion?:{rate:number;checkedAt:string;observationDate?:string;sourceUrl?:string};
};
export type PublicHistory = {version:1;points:PublicPricePoint[];datedFx?:Record<string,DatedPalmFx>;fxError?:string;quarantined?:Array<{point:PublicPricePoint;reason:string;evidenceUrl:string;checkedAt:string}>;revisions?:Array<{before:PublicPricePoint;after:PublicPricePoint;checkedAt:string}>;lastCheckedAt?:string;lastError?:string;sourceChecks?:Record<string,{checkedAt:string;lastSuccessAt?:string;error?:string;lastObservationDate?:string;observationCount?:number}>};
const fileFor=(id:string)=>path.join(process.env.RMS_HISTORY_ROOT||process.cwd(),'.rms-price-history',id+'.json');
export function publisherDate(input:string):string|null {
  const s=String(input||'').replace(/\s+/g,' ').trim();
  let date=s;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const a=/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(20\d{2})$/.exec(s);
    const b=/^(\d{1,2})[\s/-]+([A-Za-z]{3,9})[\s/-]+(20\d{2})$/.exec(s);
    if(!a&&!b)return null;
    const month=months.indexOf((a?a[1]:b![2]).slice(0,3).toLowerCase())+1;
    if(!month)return null;
    date=`${a?a[3]:b![3]}-${String(month).padStart(2,'0')}-${String(a?a[2]:b![1]).padStart(2,'0')}`;
  }
  const ms=Date.parse(date+'T00:00:00Z');
  return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===date?date:null;
}
export function validPublicPoint(p:PublicPricePoint,now=new Date()):boolean {
  const expected=p?.benchmark==='palm-cpo'?PRICE_SOURCES.cpo:p?.benchmark==='palm-olein'?PRICE_SOURCES.olein:p?.benchmark==='tapioca-fob'?PRICE_SOURCES.tapioca:'';
  return !!expected && (p.sourceUrl===expected || p.benchmark==='palm-cpo'&&p.sourceUrl===PRICE_SOURCES.cpoFcpo) && publisherDate(p.date)===p.date && p.date<=now.toISOString().slice(0,10) &&
    p.unit===(p.benchmark==='palm-cpo'?'MYR/MT':'USD/MT') && Number.isFinite(p.value)&&p.value>0 &&
    p.value<(p.benchmark==='palm-cpo'?20000:10000) && (p.usdPerMT===undefined||Number.isFinite(p.usdPerMT)&&p.usdPerMT>0);
}
const identity=(p:PublicPricePoint)=>[p.sourceUrl,p.benchmark,p.unit,p.date].join('|');
export function quarantinePublicObservation(history:PublicHistory,benchmark:PublicPricePoint['benchmark'],date:string,reason:string,evidenceUrl:string):PublicHistory {
  const removed=history.points.filter(p=>p.benchmark===benchmark&&p.date===date);
  return {...history,points:history.points.filter(p=>!removed.includes(p)),quarantined:[...(history.quarantined||[]),...removed.map(point=>({point,reason,evidenceUrl,checkedAt:new Date().toISOString()}))]};
}
export function mergePublicPrices(saved:PublicHistory,incoming:PublicPricePoint[],now=new Date()):{history:PublicHistory;changed:boolean} {
  const map=new Map(saved.points.map(p=>[identity(p),p]));let changed=false;const revisions=[...(saved.revisions||[])];
  for(let p of incoming){
    if(!validPublicPoint(p,now))throw Error('Invalid public price observation: '+p.benchmark+' '+p.date);
    const old=map.get(identity(p));
    if(old?.provenance==='source-verified'&&p.provenance==='manual-import')continue;
    // Repeated checks do not reprice an old CPO observation using today's FX.
    if(old&&old.value===p.value&&old.provenance===p.provenance&&(old.usdPerMT!==undefined||p.usdPerMT===undefined)&&
      (!p.publisherQuoteDate||old.publisherQuoteDate===p.publisherQuoteDate)&&(!p.observationKind||old.observationKind===p.observationKind))continue;
    if(old&&old.value===p.value&&old.usdPerMT!==undefined){p={...p,usdPerMT:old.usdPerMT,conversion:old.conversion};}
    if(!old||JSON.stringify(old)!==JSON.stringify(p)){if(old)revisions.push({before:old,after:p,checkedAt:now.toISOString()});map.set(identity(p),p);changed=true;}
  }
  return {changed,history:{...saved,version:1,revisions,points:[...map.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.benchmark.localeCompare(b.benchmark))}};
}
function seed(id:string):PublicPricePoint[]{
  const file=path.join(process.cwd(),'src/data',id==='palm-oil'?'cache_palmoil.json':'cache_tapioca.json');
  const raw=JSON.parse(fs.readFileSync(file,'utf8'));const out:PublicPricePoint[]=[];
  if(id==='palm-oil')for(const p of raw.historicalSeries||[]){
    const native=Number(p.cpoMyr??p.centsPerBushel),usd=Number(p.cpoUsd??p.cpoUsdPerMt??p.usdPerMT),olein=Number(p.oleinUsd??p.oleinUsdPerMt);
    if(native>0&&usd>0)out.push({benchmark:'palm-cpo',date:p.date,sourceUrl:PRICE_SOURCES.cpo,value:native,unit:'MYR/MT',usdPerMT:usd,provenance:'manual-import'});
    if(olein>0)out.push({benchmark:'palm-olein',date:p.date,sourceUrl:PRICE_SOURCES.olein,value:olein,unit:'USD/MT',usdPerMT:olein,provenance:'manual-import'});
  }else for(const p of raw.weeklyPrices||[])if(!p.isSynthetic)out.push({benchmark:'tapioca-fob',date:p.date,sourceUrl:PRICE_SOURCES.tapioca,value:p.price,unit:'USD/MT',usdPerMT:p.price,domesticThb:p.domesticThb,provenance:'manual-import'});
  return out.filter(p=>validPublicPoint(p));
}
export function loadPublicHistory(id:'palm-oil'|'tapioca-starch'):PublicHistory {
  const file=fileFor(id);
  if(!fs.existsSync(file))return mergePublicPrices({version:1,points:[]},seed(id)).history;
  const raw=JSON.parse(fs.readFileSync(file,'utf8'));
  if(raw.version!==1||!Array.isArray(raw.points)||raw.points.some((p:any)=>!validPublicPoint(p)))throw Error('Unreadable saved public price history: '+id);
  // Import any existing manual rows added outside the ledger without dropping saved observations.
  return mergePublicPrices(raw,seed(id)).history;
}
export function savePublicHistory(id:'palm-oil'|'tapioca-starch',history:PublicHistory):void {
  const file=fileFor(id);fs.mkdirSync(path.dirname(file),{recursive:true});
  const temp=file+'.'+process.pid+'.tmp';fs.writeFileSync(temp,JSON.stringify(history,null,2));fs.renameSync(temp,file);
}

/** Only table rows carrying their own publication date and close/price column. */
export function parsePalmHistory(html:string,benchmark:'palm-cpo'|'palm-olein',now=new Date(),requireHistoricalTable=false):PublicPricePoint[]{
  const $=load(html);const points:PublicPricePoint[]=[];
  const quoteStamp=$('time[data-test="trading-time-label"]').attr('datetime');
  const quoteTime=quoteStamp?Date.parse(quoteStamp):NaN;
  const publisherQuoteDate=Number.isFinite(quoteTime)?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(quoteTime)):null;
  const tables=$('table').filter((_,t)=>{
    const header=$(t).find('thead').text().replace(/\s+/g,' ');
    return /Date/i.test(header)&&/Price/i.test(header)&&/Open/i.test(header)&&/High/i.test(header)&&/Low/i.test(header);
  });
  if(requireHistoricalTable&&!tables.length)throw Error('Dated historical price table not identified');
  (requireHistoricalTable?tables.find('tbody tr'):$('tr')).each((_,row)=>{
    const cells=$(row).find('td').toArray();if(cells.length<2)return;
    const date=publisherDate($(cells[0]).text());const value=Number($(cells[1]).text().replace(/,/g,'').trim());
    if(!date)return;
    const p:PublicPricePoint={benchmark,date,value,unit:benchmark==='palm-cpo'?'MYR/MT':'USD/MT',sourceUrl:benchmark==='palm-cpo'?PRICE_SOURCES.cpo:PRICE_SOURCES.olein,provenance:'source-verified',observationKind:'publisher-close',...(publisherQuoteDate?{publisherQuoteDate}:{}),...(benchmark==='palm-olein'?{usdPerMT:value}:{})};
    if(validPublicPoint(p,now))points.push(p);
  });
  // Ambiguous duplicate prices are not silently selected by HTML order.
  const map=new Map<string,PublicPricePoint>();for(const p of points){const old=map.get(p.date);if(old&&old.value!==p.value)throw Error('Conflicting publisher rows: '+p.date);map.set(p.date,p);}
  return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
/** Check the instrument heading, not unrelated commodity links in the page footer. */
export function validatePalmPublisher(html:string,benchmark:'palm-cpo'|'palm-olein',sourceUrl:string):void {
  const $=load(html);const heading=$('h1').text().replace(/\s+/g,' ').trim();
  const text=$('body').text().replace(/\s+/g,' ');
  if(benchmark==='palm-cpo') {
    if(sourceUrl===PRICE_SOURCES.cpoFcpo) {
      if(!/Palm Oil\s*\(FCPOc1\)/i.test(heading)||!/Currency in\s*MYR/i.test(text))throw Error('Benchmark mismatch: expected Kuala Lumpur FCPOc1 in MYR');
    }else if(!/crude palm oil/i.test(heading)||!/Currency in\s*MYR/i.test(text))throw Error('Benchmark mismatch: expected CPO futures in MYR');
  }else if(!/RBD Palm Olein\s*\(FPOLc1\)/i.test(heading)||!/Currency in\s*USD/i.test(text))throw Error('Benchmark mismatch: expected Bursa FPOLc1 RBD Palm Olein in USD');
}
export function appendMatchingPalmRows(history:PublicHistory,incoming:PublicPricePoint[],sourceUrl:string):PublicHistory {
  // Append new dates; accept documented publisher corrections without deleting original imports.
  const latest=history.points.filter(p=>p.benchmark==='palm-cpo').map(p=>p.date).sort().at(-1)||'';
  const rows=incoming.map(p=>({...p,sourceUrl})).filter(p=>sourceUrl!==PRICE_SOURCES.cpoFcpo||p.date>latest||
    history.points.some(old=>old.benchmark==='palm-cpo'&&old.date===p.date&&old.value!==p.value)||
    p.usdPerMT!==undefined&&history.points.some(old=>identity(old)===identity(p)&&old.value===p.value&&old.usdPerMT===undefined));
  return mergePublicPrices(history,rows).history;
}
async function datedCpoConversion(history:PublicHistory,rows:PublicPricePoint[],sourceUrl:string,checkedAt:string):Promise<PublicPricePoint[]> {
  const latest=history.points.filter(p=>p.benchmark==='palm-cpo').map(p=>p.date).sort().at(-1)||'';
  const needs=rows.filter(p=>p.benchmark==='palm-cpo' &&
    (sourceUrl!==PRICE_SOURCES.cpoFcpo||p.date>latest||history.points.some(old=>old.benchmark==='palm-cpo'&&old.date===p.date&&old.value!==p.value)||history.points.some(old=>old.sourceUrl===sourceUrl&&old.date===p.date&&old.usdPerMT===undefined)) &&
    !history.points.some(old=>old.sourceUrl===sourceUrl&&old.date===p.date&&old.value===p.value&&old.usdPerMT!==undefined));
  if(!needs.length)return rows;
  const dates=needs.map(p=>p.date).sort();
  const url=`https://api.frankfurter.dev/v1/${dates[0]}..${dates.at(-1)}?base=USD&symbols=MYR`;
  const r=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Dated MYR FX HTTP '+r.status);
  const fx=await r.json();if(fx.base!=='USD')throw Error('Dated FX base mismatch');
  return rows.map(p=>{
    if(!needs.includes(p))return p;
    const rate=fx.rates?.[p.date]?.MYR;
    if(typeof rate!=='number'||!Number.isFinite(rate)||rate<=0)throw Error('No dated MYR FX for '+p.date);
    return {...p,usdPerMT:Number((p.value/rate).toFixed(2)),conversion:{rate,checkedAt,observationDate:p.date,sourceUrl:url}};
  });
}
export function parseTtsaHistory(html:string,now=new Date()):PublicPricePoint[]{
  const $=load(html);const out:PublicPricePoint[]=[];
  $('tr').each((_,row)=>{
    const cells=$(row).find('td').toArray();if(cells.length<3)return;
    const date=publisherDate($(cells[0]).text());const value=Number($(cells[2]).text().replace(/,/g,'').trim());
    const domestic=Number($(cells[1]).text().trim());if(!date)return;
    const p:PublicPricePoint={date,value,sourceUrl:PRICE_SOURCES.tapioca,benchmark:'tapioca-fob',unit:'USD/MT',usdPerMT:value,provenance:'source-verified',...(domestic>0&&domestic<200?{domesticThb:domestic}:{})};
    if(validPublicPoint(p,now))out.push(p);
  });
  const map=new Map<string,PublicPricePoint>();for(const p of out){const old=map.get(p.date);if(old&&old.value!==p.value)throw Error('Conflicting TTSA rows: '+p.date);map.set(p.date,p);}return [...map.values()];
}
const inFlight=new Map<string,Promise<PublicHistory>>();
export async function refreshPublicHistory(id:'palm-oil'|'tapioca-starch',usdMyr?:number):Promise<PublicHistory>{
  const pending=inFlight.get(id);if(pending)return pending;
  const job=(async()=>{
    let history=loadPublicHistory(id);const issues:string[]=[];const checkedAt=new Date().toISOString();
    const sources=id==='palm-oil'?[PRICE_SOURCES.cpoFcpo,PRICE_SOURCES.olein]:[PRICE_SOURCES.tapioca];
    const year=new Date().getUTCFullYear();
    const targets=sources.flatMap(sourceUrl=>sourceUrl===PRICE_SOURCES.tapioca?(new Date().getUTCMonth()===0?[year-1,year]:[year]).map(y=>({sourceUrl,url:sourceUrl+'/'+y})):[{sourceUrl,url:sourceUrl}]);
    for(const {sourceUrl,url} of targets){
      try{
        const r=await fetch(url,{headers:{Accept:'text/html','User-Agent':'RMS-Procurement/1.0'},signal:AbortSignal.timeout(10000)});
        if(!r.ok)throw Error('HTTP '+r.status); // Never circumvent a blocked source.
        const html=await r.text();
        if(sourceUrl!==PRICE_SOURCES.tapioca)validatePalmPublisher(html,sourceUrl===PRICE_SOURCES.olein?'palm-olein':'palm-cpo',sourceUrl);
        let incoming=sourceUrl===PRICE_SOURCES.tapioca?parseTtsaHistory(html):parsePalmHistory(html,sourceUrl===PRICE_SOURCES.olein?'palm-olein':'palm-cpo',new Date(),true);
        if(!incoming.length)throw Error('No dated price rows in accessible source');
        if(id==='palm-oil'){
          const digest=createHash('sha256').update(html).digest('hex');
          const dir=path.join(path.dirname(fileFor(id)),'source-evidence');fs.mkdirSync(dir,{recursive:true});
          const receipt=path.join(dir,'publisher-'+digest+'.json');
          const originalHtml=path.join(dir,'publisher-'+digest+'.html');if(!fs.existsSync(originalHtml))fs.writeFileSync(originalHtml,html,{flag:'wx',mode:0o600});
          const page=load(html);
          const tableHtml=page('table').filter((_,t)=>/Date/.test(page(t).find('thead').text())&&/Price/.test(page(t).find('thead').text())).first().toString();
          if(!fs.existsSync(receipt))fs.writeFileSync(receipt,JSON.stringify({sourceUrl,checkedAt,htmlSha256:digest,heading:page('h1').text(),historicalTableHtml:tableHtml,observations:incoming},null,2),{flag:'wx'});
        }
        if(incoming[0]?.benchmark==='palm-cpo') {
          try{incoming=await datedCpoConversion(history,incoming,sourceUrl,checkedAt);}
          catch(error){issues.push(sourceUrl+': '+String((error as Error).message));} // Native observations still persist; never use today's FX for older prices.
        }
        history=sourceUrl===PRICE_SOURCES.tapioca?mergePublicPrices(history,incoming).history:appendMatchingPalmRows(history,incoming,sourceUrl);
        history.sourceChecks={...history.sourceChecks,[sourceUrl]:{checkedAt,lastSuccessAt:checkedAt,lastObservationDate:incoming.map(p=>p.date).sort().at(-1),observationCount:incoming.length}};
        // Persist each successful benchmark independently of later publisher failures.
        savePublicHistory(id,history);
      }catch(e){const error=String((e as Error).message);issues.push(sourceUrl+': '+error);history.sourceChecks={...history.sourceChecks,[sourceUrl]:{...history.sourceChecks?.[sourceUrl],checkedAt,error}};}
    }
    if(id==='palm-oil')history=await refreshPalmDatedFx(history);
    history.lastCheckedAt=checkedAt;history.lastError=issues.join('; ')||undefined;savePublicHistory(id,history);return history;
  })();inFlight.set(id,job);try{return await job;}finally{inFlight.delete(id);}
}
export function publicBenchmarkMetrics(history:PublicHistory,benchmark:PublicPricePoint['benchmark']){
  const points=selectPalmObservations(history,benchmark).map(p=>normalizedPalmPoint(p,history));const latest=points.at(-1);
  return {latest,moves:observedPriceChanges(points.map(p=>({date:p.date,usdPerMT:p.usdPerMT??(p.unit==='USD/MT'?p.value:NaN)})))};
}
export function palmHistoryPayload(history=loadPublicHistory('palm-oil')):any {
  const rows=new Map<string,any>();
  for(const p of ['palm-cpo','palm-olein'].flatMap(b=>selectPalmObservations(history,b as any)).map(p=>normalizedPalmPoint(p,history))){const row=rows.get(p.date)||{date:p.date};
    if(p.benchmark==='palm-cpo'){row.cpoMyr=p.value;row.centsPerBushel=p.value;if(p.usdPerMT){row.cpoUsd=p.usdPerMT;row.usdPerMT=p.usdPerMT;}row.cpoSourceUrl=p.sourceUrl;row.cpoFxStatus=p.fxStatus;row.cpoFxRateDate='fxRateDate' in p?p.fxRateDate:undefined;}
    if(p.benchmark==='palm-olein'){row.oleinUsd=p.value;row.oleinUsdPerMt=p.value;row.oleinSourceUrl=p.sourceUrl;row.oleinPublisherQuoteDate=p.publisherQuoteDate;}
    rows.set(p.date,row);
  }
  const cpo=publicBenchmarkMetrics(history,'palm-cpo'),olein=publicBenchmarkMetrics(history,'palm-olein');
  return {priceMyr:cpo.latest?.value??null,cpoUsdMt:cpo.latest?.usdPerMT??null,oleinUsd:olein.latest?.value??null,
    cpoObservationDate:cpo.latest?.date,oleinObservationDate:olein.latest?.date,updatedAt:history.lastCheckedAt||'',source:'CPO · RBD Palm Olein',
    cpoSourceUrl:cpo.latest?.sourceUrl||PRICE_SOURCES.cpo,oleinSourceUrl:PRICE_SOURCES.olein,historicalSeries:[...rows.values()].sort((a,b)=>a.date.localeCompare(b.date)),
    fxPolicy:'CPO: observation-date USD/MYR or preceding published business day (maximum 7 days); original imports preserved. Display currencies share current USD FX.',
    diagnostics:{lastError:history.lastError,sourceChecks:history.sourceChecks,fxError:history.fxError,estimatedFxObservations:selectPalmObservations(history,'palm-cpo').map(p=>normalizedPalmPoint(p,history)).filter(p=>p.fxStatus==='legacy-fixed-estimate').length}};
}
