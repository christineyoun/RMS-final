import type {SugarPriceSnapshot} from '../utils/sugarPriceSnapshot';
import type {SoybeanOilPriceSnapshot} from '../utils/soybeanOilPriceSnapshot';
import type { SoybeanPriceSnapshot } from '../utils/soybeanPriceSnapshot';
/** Shared market snapshot consumed by all commodity cards and detail KPI summaries.
 * Only the commodity's existing source endpoint may define its price history.
 * No Gemini values, hardcoded card prices, or invented trend paths enter here.
 */
import { calculateDynamicMetrics } from '../utils/commodityPriceMetrics';
import { observedPriceChanges } from '../utils/observedPriceChanges';

export const COMMODITY_IDS = ['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'] as const;
export type CommodityId = typeof COMMODITY_IDS[number];
export type CommodityQuote = {
  priceUsdMt: number;
  changeWoW: number | null;
  changeMoM: number | null;
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
const pointValue = (p: any): number | null => {
  const v = p?.usdPerMT ?? p?.cpoUsd ?? p?.price;
  return finite(v) ? v : null;
};

/** Never invent a point when the source is missing or a record is synthetic. */
export function quoteFromResponse(id: CommodityId, response: any): CommodityQuote | null {
  if (id === 'potato-starch' || !response || response.success === false) return null;
  if(id==='sugar'&&(response.commodity!=='sugar'||!/^SB=F(?:\s|$)/.test(String(response.symbol))||response.quoteUnit!=='US¢/lb'||response.priceUnit!=='USD/MT'))return null;
  if(id==='soybean-oil'&&(response.commodity!=='soybean-oil'||!String(response.symbol).startsWith('ZL=F')||response.quoteUnit!=='US¢/lb'||response.priceUnit!=='USD/MT'))return null;
  if (id === 'wheat') {
    const metric = response.metrics?.srw;
    const points = Array.isArray(response.data) ? response.data : [];
    if (!finite(metric?.latestPriceMt) || !points.length) return null;
    const verified = points.filter((p: any) => finite(p?.srwMt) && /^\d{4}-\d{2}-\d{2}$/.test(p?.date || ''));
    if (!verified.length) return null;
    verified.sort((a: any,b: any) => a.date.localeCompare(b.date));
    const tail = verified.slice(-24);
    return {
      priceUsdMt: metric.latestPriceMt,
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
  const points = raw.filter((p:any) => !p?.isSynthetic && Date.parse(p?.date) <= Date.now() && finite(pointValue(p)) && /^\d{4}-\d{2}-\d{2}$/.test(p?.date || ''))
    .sort((a:any,b:any)=>a.date.localeCompare(b.date));
  if (!points.length) return null;
  const latest = points[points.length-1];
  const price = pointValue(latest)!;
  const stats = observedPriceChanges(points.map(p => ({ date: p.date, usdPerMT: pointValue(p)! })));
  const legacy = stats ? null : calculateDynamicMetrics(id, price, points);
  return {
    priceUsdMt: price,
    changeWoW: stats ? stats.wow.pct : legacy!.wowPct,
    changeMoM: stats ? stats.mom.pct : legacy!.momPct,
    changeWoWUsdMt: stats?.wow.amountUsdMt ?? null,
    changeMoMUsdMt: stats?.mom.amountUsdMt ?? null,
    sparkline: points.slice(-24).map((p:any)=>pointValue(p)!),
    asOf: latest.date,
    source: response.source || 'Commodity history API',
    ...(id==='soybean'?{soybeanSnapshot:response as SoybeanPriceSnapshot}:id==='soybean-oil'?{soybeanOilSnapshot:response as SoybeanOilPriceSnapshot}:id==='sugar'?{sugarSnapshot:response as SugarPriceSnapshot}:{})
  };
}

export async function fetchCommodityQuotes(force = false): Promise<Partial<Record<CommodityId, CommodityQuote>>> {
  const responses = await Promise.all(COMMODITY_IDS.map(async id => {
    const endpoint = id === 'wheat' ? '/api/uswheat/price-history' : id === 'soybean' ? '/api/soybean/price-snapshot' : id === 'soybean-oil' ? '/api/soybean-oil/price-snapshot' : id === 'sugar' ? '/api/sugar/price-snapshot' : `/api/history?commodity=${id}&timeframe=5Y`;
    const url = endpoint + (force ? (endpoint.includes('?') ? '&' : '?')+'force=true' : '');
    try {
      const res = await fetch(url, { cache:'no-store' });
      return res.ok ? await res.json() : null;
    } catch { return null; }
  }));
  const quotes: Partial<Record<CommodityId,CommodityQuote>> = {};
  COMMODITY_IDS.forEach((id,index) => {
    const quote = quoteFromResponse(id,responses[index]);
    if (quote) quotes[id] = quote;
  });
  return quotes;
}
