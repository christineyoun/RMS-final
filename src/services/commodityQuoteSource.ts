import {formatPercentChange} from '../utils/commodityPriceMetrics';
import type {Commodity,Currency,UsWheatPriceHistoryResponse,CommodityHistorySnapshot} from '../types';
import type {DatedDisplayFx} from '../utils/soybeanPriceSnapshot';
import {soybeanDisplayFactor} from '../utils/soybeanPriceSnapshot';
import {potatoDisplayConversion} from './currencyService';
import {prefixCurrency,priceUnit,formatCurrencyAmount} from '../utils/currencyFormatting';
import type {PotatoExportQuoteResponse} from '../server/officialPotatoComextService';
import type {SugarPriceSnapshot} from '../utils/sugarPriceSnapshot';
import type {SoybeanOilPriceSnapshot} from '../utils/soybeanOilPriceSnapshot';
import type { SoybeanPriceSnapshot } from '../utils/soybeanPriceSnapshot';
/** Shared market snapshot consumed by all commodity cards and detail KPI summaries.
 * Only the commodity's existing source endpoint may define its price history.
 * No Gemini values, hardcoded card prices, or invented trend paths enter here.
 */
import { observedPriceChanges } from '../utils/observedPriceChanges';

export const COMMODITY_IDS = ['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'] as const;
export type CommodityId = typeof COMMODITY_IDS[number];
export type CommodityQuote = {
  priceUsdMt: number;
  sourceStale?: boolean;
  wheatSnapshot?: UsWheatPriceHistoryResponse;
  historySnapshot?: CommodityHistorySnapshot;
  potatoSnapshot?: PotatoExportQuoteResponse;
  changeWoW: number | null;
  changeMoM: number | null;
  changeYoY?: number | null;
  changeYoYUsdMt?: number | null;
  yoyReferenceDate?: string | null;
  // Actual historical dollar changes, never latestPrice * rounded percentage.
  changeWoWUsdMt: number | null;
  changeMoMUsdMt: number | null;
  sparkline: number[];
  asOf: string;
  source: string;
  sugarSnapshot?: SugarPriceSnapshot;
  soybeanOilSnapshot?: SoybeanOilPriceSnapshot;
  soybeanSnapshot?: SoybeanPriceSnapshot;
};
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const pointValue = (p: any, id?: CommodityId): number | null => {
  const v = id==='palm-oil' ? p?.cpoUsd ?? p?.usdPerMT ?? p?.price : p?.usdPerMT ?? p?.price;
  return finite(v) ? v : null;
};

/** Annual TTSA comparison from the same saved graph history, nearest weekly publication to the anniversary. */
export function tapiocaAnnualChange(points:any[]){
 const empty={changeYoY:null,changeYoYUsdMt:null,yoyReferenceDate:null};
 const latest=points.at(-1);if(!latest)return empty;
 // Import method is retained as provenance, not a second eligibility rule for graph observations.
 const official=(p:any)=>p.sourceUrl==='https://www.thaitapiocastarch.org/en/information/statistics/weekly_tapioca_starch_price'&&!p.isSynthetic&&finite(p.usdPerMT);
 if(!official(latest))return empty;
 const [year,month,day]=latest.date.split('-').map(Number);
 const anniversary=Date.UTC(year-1,month-1,Math.min(day,new Date(Date.UTC(year-1,month,0)).getUTCDate()));
 const references=points.slice(0,-1).filter(p=>official(p)&&Math.abs(Date.parse(p.date)-anniversary)<=7*86400000)
  .sort((a,b)=>Math.abs(Date.parse(a.date)-anniversary)-Math.abs(Date.parse(b.date)-anniversary)||a.date.localeCompare(b.date));
 const reference=references[0];if(!reference)return empty;
 return {changeYoY:Number(((latest.usdPerMT/reference.usdPerMT-1)*100).toFixed(2)),changeYoYUsdMt:Number((latest.usdPerMT-reference.usdPerMT).toFixed(2)),yoyReferenceDate:reference.date};
}
/** Never invent a point when the source is missing or a record is synthetic. */
export function quoteFromResponse(id: CommodityId, response: any): CommodityQuote | null {
  if(!response||response.success===false)return null;
  if(id==='potato-starch'){
    const d=response.data,fx=response.fx;
    if(d?.reporter!=='EU27_2020'||d?.partner!=='KR'||d?.productCode!=='11081300'||d?.flow!=='2'||!finite(d.eurPerMT))return null;
    const mom=response.changes?.mom;
    const available=Number.isFinite(mom?.pct)&&Number.isFinite(mom?.amountEurPerMT);
    return {priceUsdMt:finite(fx?.EUR_USD)?d.eurPerMT*fx.EUR_USD:0,potatoSnapshot:response,changeWoW:null,changeWoWUsdMt:null,changeMoM:available?mom.pct:null,changeMoMUsdMt:available&&finite(fx?.EUR_USD)?mom.amountEurPerMT*fx.EUR_USD:null,sparkline:[],asOf:d.period,source:response.sourceUrl};
  }
  if(id==='sugar'&&(response.commodity!=='sugar'||!/^SB=F(?:\s|$)/.test(String(response.symbol))||response.quoteUnit!=='US¢/lb'||response.priceUnit!=='USD/MT'))return null;
  if(id==='soybean-oil'&&(response.commodity!=='soybean-oil'||!String(response.symbol).startsWith('ZL=F')||response.quoteUnit!=='US¢/lb'||response.priceUnit!=='USD/MT'))return null;
  if (id === 'wheat') {
    if(response.latestSourceType==='imported-baseline'||response.sourceStatus==='baseline')return null;
    const metric = response.metrics?.srw;
    const points = Array.isArray(response.data) ? response.data : [];
    if (!finite(metric?.latestPriceMt) || !points.length) return null;
    const verified = points.filter((p: any) => finite(p?.srwMt) && /^\d{4}-\d{2}-\d{2}$/.test(p?.date || ''));
    if (!verified.length) return null;
    verified.sort((a: any,b: any) => a.date.localeCompare(b.date));
    const tail = verified.slice(-24);
    if(Math.abs(metric.latestPriceMt-tail[tail.length-1].srwMt)>1e-6)return null; // Never publish contradictory current observations.
    return {
      priceUsdMt: metric.latestPriceMt,
      wheatSnapshot: response,
      changeWoW: metric.wowAvailable === false ? null : (Number.isFinite(metric.wowChangePct) ? metric.wowChangePct : null),
      changeMoM: metric.momAvailable === false ? null : (Number.isFinite(metric.momChangePct) ? metric.momChangePct : null),
      changeWoWUsdMt: metric.wowAvailable === false || !Number.isFinite(metric.wowChangeMt) ? null : metric.wowChangeMt,
      changeMoMUsdMt: metric.momAvailable === false || !Number.isFinite(metric.momChangeMt) ? null : metric.momChangeMt,
      sparkline: tail.map((x:any)=>x.srwMt),
      asOf: verified[verified.length-1].date,
      source: response.sourceUrl || response.source || 'U.S. Wheat Associates'
    };
  }
  const raw = Array.isArray(response.data) ? response.data : [];
  const points = raw.filter((p:any) => !p?.isSynthetic && Date.parse(p?.date) <= Date.now() && finite(pointValue(p,id)) && /^\d{4}-\d{2}-\d{2}$/.test(p?.date || ''))
    .sort((a:any,b:any)=>a.date.localeCompare(b.date));
  if (!points.length) return null;
  const latest = points[points.length-1];
  const price = pointValue(latest,id)!;
  const stats = observedPriceChanges(points.map(p => ({ date: p.date, usdPerMT: pointValue(p,id)! })));
  return {
    priceUsdMt: price,
    ...(id==='tapioca-starch'?tapiocaAnnualChange(points):{}),
    changeWoW: stats.wow.pct,
    changeMoM: stats.mom.pct,
    changeWoWUsdMt: stats?.wow.amountUsdMt ?? null,
    changeMoMUsdMt: stats?.mom.amountUsdMt ?? null,
    sparkline: points.slice(-24).map((p:any)=>pointValue(p,id)!),
    asOf: latest.date,
    source: response.source || 'Commodity history API',
    ...(id==='soybean'?{soybeanSnapshot:response as SoybeanPriceSnapshot}:id==='soybean-oil'?{soybeanOilSnapshot:response as SoybeanOilPriceSnapshot}:id==='sugar'?{sugarSnapshot:response as SugarPriceSnapshot}:{})
  };
}

let pendingSavedQuotes:Promise<Partial<Record<CommodityId,CommodityQuote>>>|null=null;
export function fetchCommodityQuotes(force=false):Promise<Partial<Record<CommodityId,CommodityQuote>>>{
 if(force)return readCommodityQuotes(true);
 if(!pendingSavedQuotes)pendingSavedQuotes=readCommodityQuotes(false).finally(()=>{pendingSavedQuotes=null;});
 return pendingSavedQuotes;
}
async function readCommodityQuotes(force = false): Promise<Partial<Record<CommodityId, CommodityQuote>>> {
  // Read the detail pages' saved-only endpoints; never prefer a separately cached Overview bundle.
  const responses = await Promise.all(COMMODITY_IDS.map(async id => {
    const endpoint = id === 'potato-starch' ? '/api/starch/potato-export-quote' : id === 'wheat' ? '/api/uswheat/price-history' : id === 'soybean' ? '/api/soybean/price-snapshot' : id === 'soybean-oil' ? '/api/soybean-oil/price-snapshot' : id === 'sugar' ? '/api/sugar/price-snapshot' : `/api/history?commodity=${id}&timeframe=5Y`;
    const url = endpoint + (force ? (endpoint.includes('?') ? '&' : '?')+'force=true' : '');
    try {
      const res = await fetch(url, { cache:'no-store' });
      return res.ok ? await res.json() : null;
    } catch { return null; }
  }));
  const quotes: Partial<Record<CommodityId,CommodityQuote>> = {};
  COMMODITY_IDS.forEach((id,index) => {
    const quote = quoteFromResponse(id,responses[index]);
    if (quote) quotes[id] = {...quote,sourceStale:!!(responses[index]?.sourceError||responses[index]?.lastError||responses[index]?.stale),...(['corn','palm-oil','tapioca-starch'].includes(id)?{historySnapshot:responses[index]}:{})};
  });
  return quotes;
}

/** One display selector for both Overview and detail KPI cards. Original observations stay intact. */
export function mapCommodityForDisplay(c:Commodity,currency:Currency,fx:DatedDisplayFx|null):Commodity {
  const original=finite(c.price)?c.price:0;
  const potato=c.id==='potato-starch'&&c._potatoExportQuote?.data?c._potatoExportQuote:null;
  const conversion=potatoDisplayConversion(currency,fx);
  const displayCurrency=potato?conversion.displayCurrency:currency;
  const factor=soybeanDisplayFactor(currency,fx);
  const price=potato?potato.data!.eurPerMT*conversion.factor:original&&Number.isFinite(factor)?original*factor:0;
  const symbol=displayCurrency==='KRW'?'₩':displayCurrency==='EUR'?'€':'$';
  return {...c,price,unit:priceUnit(displayCurrency,symbol),_canonicalDisplayCurrency:displayCurrency,_canonicalDisplayFx:fx,
    ...(['soybean','soybean-oil','sugar'].includes(c.id)?{_soybeanDisplayFx:fx}:{}),
    _originalPrice:potato&&fx?potato.data!.eurPerMT*fx.EUR_USD:original,_originalUnit:'USD / MT'};
}
export function commodityBenchmarkDisplay(c:Commodity,currency:Currency){
 const selected=c._canonicalDisplayCurrency||currency,symbol=selected==='KRW'?'₩':selected==='EUR'?'€':'$';
 const available=finite(c.price);
 const value=available?prefixCurrency(formatCurrencyAmount(c.price,selected),symbol):c.id==='potato-starch'?'데이터 미확보':'--';
 return {value,unit:priceUnit(selected,symbol),currency:selected};
}

export function commodityComparisonValue(c:Commodity,period:'wow'|'mom'|'yoy'):number|null {
 if(c.id==='potato-starch'&&period!=='wow'){
  const change=c._potatoExportQuote?.changes?.[period];
  return change?.pct!=null&&Number.isFinite(change.pct)&&change.amountEurPerMT!=null&&Number.isFinite(change.amountEurPerMT)?change.pct:null;
 }
 return period==='yoy'?c.changeYoY??null:period==='wow'?c.changeWoW??null:c.changeMoM??null;
}
export function commodityComparisonDisplay(c:Commodity,period:'wow'|'mom'|'yoy',suffix=''):string {
 const value=commodityComparisonValue(c,period);
 return formatPercentChange(value,suffix,c.id==='potato-starch'&&period!=='wow'?'확인 불가':c.id==='tapioca-starch'&&period==='yoy'&&suffix?'--% '+suffix:'--%');
}
