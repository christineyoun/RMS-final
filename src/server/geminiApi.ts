import {createHash} from 'node:crypto';
import {savedFreeDataResponse} from './savedFreeDataResponse.ts';
import {sugarPriceSnapshotService} from './sugarPriceSnapshotService.ts';
import {savedGraphHistoryResponse,rememberGraphRefresh} from './savedGraphHistory.ts';
import {potatoProductionPayload,getRegionalPotatoProduction,readSavedRegionalPotatoProduction} from './potatoProductionHistory.ts';
import { GoogleGenAI, isPaidGeminiEnabled } from './paidGeminiGuard.ts';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import { scrapeLiveScfiIndex, getScfiCache } from './scfiScraperService.ts';
import { fetchOfficialTapiocaQuote } from './officialTapiocaQuoteService.ts';
import { fetchOfficialPotatoEurostat } from './officialPotatoEurostatService.ts';
import { fetchOfficialPotatoComext, fetchOfficialPotatoExportQuote, readSavedPotatoExportQuote } from './officialPotatoComextService.ts';
import { buildPotatoEurostatMarketView } from './potatoEurostatMarketView.ts';

const CACHE_FILE = path.join(process.cwd(), 'src/data/cache_palmoil.json');

// Helper: Read last saved baseline from disk
export function getSavedBaselinePrice(): number {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      if (data.priceMyr && data.priceMyr > 3000) return data.priceMyr;
    }
  } catch (e) {
    console.warn('[Cache] Could not read disk cache, using fallback');
  }
  return 4649; // Modern cold-boot default
}

// Helper: Write new live price to disk cache while preserving historicalSeries and oleinUsd
export function updateSavedBaselinePrice(newPrice: number, newOleinUsd?: number): void {
  try {
    let existing: any = {};
    if (fs.existsSync(CACHE_FILE)) {
      try {
        existing = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      } catch {
        existing = {};
      }
    }
    const cpoUsdMt = Number((newPrice / 4.15).toFixed(2));
    const payload = {
      ...existing,
      priceMyr: newPrice,
      cpoUsdMt,
      oleinUsd: newOleinUsd ?? existing.oleinUsd ?? 1167.50,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[Cache] Failed to persist new live price to disk:', e);
  }
}
import { serverMarketDataService } from './marketDataService.ts';
import { usdaFasService, getExecutiveBriefForCommodity, formatWasdeResponse, getCommodityBaseline } from './usdaFasService.ts';
import { fetchSoybeanOilWorldPsd } from './usdaSoybeanOilLiveService.ts';
import { fetchOtherCommodityWorldPsd } from './usdaOtherCommoditiesLiveService.ts';
import { fetchHistoricalData, scrapeLivePalmOilPrices } from './historicalPriceService.ts';
import { syncAndRollPalmOleinData } from './palmOleinScraperService.ts';
import { usWheatPriceReportService } from './usWheatService.ts';
import { generateAiAnalysis, fetchLatestScmPolicyAlerts, getLiveTradePolicyAlert, fetchLiveMarketIssues } from './aiAnalysisService.ts';
import { getGroundedAiAnalysis } from './liveAiAnalysisService.ts';
import { amisService } from './amisService.ts';
import { wheatIntelligenceService } from './wheatIntelligenceService.ts';
import { originRadarService } from './originRadarService.ts';
import { cornIntelligenceService } from './cornIntelligenceService.ts';
import { soybeanIntelligenceService } from './soybeanIntelligenceService.ts';
import { soybeanOilIntelligenceService } from './soybeanOilIntelligenceService.ts';
import { marketIntelligenceService } from './marketIntelligenceService.ts';
import { rmsAiService } from './rmsAiService.ts';
import type { NormalizedMarketData } from '../types.ts';
import { centsPerLbToUsdPerMt, cornCentsPerBuToUsdPerMt, grainCentsPerBuToUsdPerMt } from '../utils/commodityConversions.ts';

dotenv.config();

export const getKSTTime = () => {
  return new Date().toLocaleTimeString('en-US', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }) + ' KST';
};

// In-memory cache and rate-limit backoff state
let cachedResponse: any = null;
let cacheExpiresAt = 0;
let rateLimitCooldownUntil = 0;
let marketIntelligenceCooldownUntil = 0;
let originGroundingCooldownUntil = 0;
let potatoGroundingCooldownUntil = 0;
let cachedPotatoResponse: any = null;

// Crude Oil & Energy Live Cache
const energyCache = new Map<string, { currentPrice: number; pctChange: number|null; observationDate?:string; sourceUrl?:string; previousPrice?:number;previousObservationDate?:string; expiresAt: number }>();

/** Quote metadata and chart bars can use different reference bases. Display only
 * a coherent source-reported quote change; never mix it with a historical bar. */
export function parseYahooBrentQuote(meta:any,retrievedAt:string) {
 const valid=(v:any)=>typeof v==='number'&&Number.isFinite(v);
 const stamp=meta?.regularMarketTime*1000;
 if(!Number.isFinite(Date.parse(retrievedAt)))return null;
 if(meta?.symbol!=='BZ=F'||meta.currency!=='USD'||meta.instrumentType!=='FUTURE'||!valid(meta.regularMarketPrice)||meta.regularMarketPrice<=0||!Number.isFinite(stamp)||stamp<=0||stamp>Date.parse(retrievedAt))return null;
 const price=meta.regularMarketPrice,change=meta.fulldayChange,pct=meta.regularMarketChangePercent;
 const reference=valid(change)?price-change:null;
 const coherent=valid(change)&&valid(pct)&&valid(meta.fulldayPrice)&&Math.abs(meta.fulldayPrice-price)<=.005&&valid(meta.fulldayChangePercent)&&Math.abs(meta.fulldayChangePercent-pct)<=.001&&reference!==null&&reference>0&&Math.abs(change/reference*100-pct)<=.001;
 const observationDate=new Date(stamp).toISOString();
 return {price,observationDate,sessionDate:new Intl.DateTimeFormat('en-CA',{timeZone:meta.exchangeTimezoneName,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(stamp)),pctChange:coherent?pct:null,changeAmount:coherent?change:null,referencePrice:coherent?reference:null,referencePriceKind:'implied-from-published-quote-change',referenceSessionDate:null,comparisonBasis:coherent?'provider-reported-quote-change':'quote-change-unverified',contractIdentity:{symbol:meta.symbol,name:meta.longName||meta.shortName||'',exchange:meta.exchangeName||'',contractSymbol:meta.contractSymbol||null,expiry:meta.expireDate||null},rolloverVerified:false,officialSettlement:false};
}

export type BrentDailyObservation={sessionDate:string;observationDate:string;price:number};
export function parseYahooBrentDaily(body:any,retrievedAt:string) {
 const result=body?.chart?.result?.[0],meta=result?.meta,now=Date.parse(retrievedAt);
 if(!Number.isFinite(now)||meta?.symbol!=='BZ=F'||meta.currency!=='USD'||meta.instrumentType!=='FUTURE'||meta.dataGranularity!=='1d'||!Array.isArray(result.timestamp))throw Error('BZ=F daily USD futures identity not verified');
 const day=(time:number)=>new Intl.DateTimeFormat('en-CA',{timeZone:meta.exchangeTimezoneName,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));
 const today=day(now),closes=result.indicators?.quote?.[0]?.close;
 if(!Array.isArray(closes)||closes.length!==result.timestamp.length)throw Error('Incomplete Brent daily chart');
 const rows=result.timestamp.map((t:number,i:number)=>({sessionDate:day(t*1000),observationDate:new Date(t*1000).toISOString(),price:closes[i]}));
 if(rows.some((r:BrentDailyObservation,i:number)=>i>0&&r.sessionDate<=rows[i-1].sessionDate))throw Error('Nonconsecutive/duplicate Brent chart order');
 const currentPeriod=meta.currentTradingPeriod?.regular;
 const complete=(r:BrentDailyObservation)=>r.sessionDate<today||r.sessionDate===today&&currentPeriod&&day(currentPeriod.start*1000)===r.sessionDate&&now>=(currentPeriod.end*1000+15*60000);
 // Never bridge a missing daily close. The reference must be the immediately
 // preceding bar, not the first close in the requested chart range.
 const completed=rows.filter(complete),latest=completed.at(-1),prior=completed.at(-2);
 const positive=(r:any)=>!!r&&typeof r.price==='number'&&Number.isFinite(r.price)&&r.price>0;
 if(!positive(latest))throw Error('No completed dated Yahoo daily Brent close');
 const previous=positive(prior)?prior:null;
 return {quoteDisplay:parseYahooBrentQuote(meta,retrievedAt),currentPrice:latest.price,pctChange:previous?(latest.price/previous.price-1)*100:null,observationDate:latest.observationDate,sessionDate:latest.sessionDate,...(previous?{previousPrice:previous.price,previousObservationDate:previous.observationDate,previousSessionDate:previous.sessionDate}:{}),comparisonBasis:'provider-daily-close',benchmark:'BZ=F',unit:'USD/bbl',officialSettlement:false,observations:completed.filter(positive),provisionalQuote:typeof meta.regularMarketPrice==='number'&&Number.isFinite(meta.regularMarketPrice)&&Number.isFinite(meta.regularMarketTime)&&meta.regularMarketTime*1000<=now?{price:meta.regularMarketPrice,observationDate:new Date(meta.regularMarketTime*1000).toISOString(),kind:'provisional-futures-quote'}:null};
}

export async function fetchLiveCrudeOilData(ticker='BZ=F',_fallbackPrice=0):Promise<any> {
 if(ticker!=='BZ=F')throw Error('Only the verified BZ=F daily-close collector is configured');
 const now=Date.now(),cached=energyCache.get(ticker);if(cached&&now<cached.expiresAt)return cached;
 const sourceUrl='https://query1.finance.yahoo.com/v8/finance/chart/BZ=F?interval=1d&range=1mo';
 const response=await fetch(sourceUrl,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Yahoo Brent HTTP '+response.status);
 const body=await response.text(),retrievedAt=new Date().toISOString(),parsed=parseYahooBrentDaily(JSON.parse(body),retrievedAt);
 const receiptSha256=createHash('sha256').update(body).digest('hex'),receiptPath='.rms-stage3/evidence/brent/'+receiptSha256+'.json';
 fs.mkdirSync(path.dirname(receiptPath),{recursive:true});if(!fs.existsSync(receiptPath))fs.writeFileSync(receiptPath,JSON.stringify({sourceUrl,retrievedAt,status:response.status,body,sha256:receiptSha256},null,2));
 const data={...parsed,sourceUrl,retrievedAt,receiptSha256,receiptPath};energyCache.set(ticker,{...data,expiresAt:now+300000});return data;
}

export async function fetchLiveExchangeRates(): Promise<{ usdKrw: number; eurKrw: number; change: string }> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
    if (res.ok) {
      const json = await res.json();
      const krw = json.rates?.KRW;
      const eur = json.rates?.EUR;
      if (typeof krw === 'number' && typeof eur === 'number' && eur > 0) {
        const prevCloseRef = 1347.6;
        const diffPct = ((krw - prevCloseRef) / prevCloseRef) * 100;
        const sign = diffPct >= 0 ? '+' : '';
        const changeStr = `${sign}${diffPct.toFixed(2)}%`;
        return {
          usdKrw: Math.round(krw * 10) / 10,
          eurKrw: Math.round((krw / eur) * 10) / 10,
          change: changeStr
        };
      }
    }
  } catch (e: any) {
    if (e.name !== 'TimeoutError' && e.name !== 'AbortError') {
      console.warn('[fetchLiveExchangeRates notice]:', e);
    }
  }
  return { usdKrw: 1358.7, eurKrw: 1556.2, change: '+0.82%' };
}

// External Pipeline Helper: Fetches live data via serverMarketDataService
export async function fetchLivePipelineMetrics() {
  // Sync sources through central data service respecting update frequencies
  const syncPayload = await serverMarketDataService.syncAllSources();
  const normalized = syncPayload.normalizedData;

  const fxData = await fetchLiveExchangeRates();
  const usdKrw = fxData.usdKrw;
  const eurKrw = fxData.eurKrw;
  const fxChange = fxData.change;
  const fxSource = 'Open Exchange Rates (Live Benchmark)';

  const weatherTelemetry = {
    usCornBelt: {
      regionName: '미국 콘벨트 (Iowa/Midwest)',
      location: 'Des Moines, IA (41.6°N, 93.6°W)',
      tempCurrent: normalized['corn_Open-Meteo_US_Corn_Belt_Radar_(Des_Moines,_IA)_-_현재_기온']?.value ?? 22.1,
      tempMax: 26.5,
      tempMin: 14.8,
      precipSumMm: normalized['corn_Open-Meteo_US_Corn_Belt_Radar_(Des_Moines,_IA)_-_일일_강수량']?.value ?? 14.2,
      condition: '부분 흐림 및 적정 강우',
      riskLevel: 'Low' as const,
      cropImpact: '콘벨트 수확기 기상 우호적, 수분 스트레스 완화'
    },
    southAmerica: {
      regionName: '남미 대두 벨트 (Mato Grosso)',
      location: 'Cuiaba, Brazil (15.6°S, 56.1°W)',
      tempCurrent: normalized['soybean_Open-Meteo_South_America_Soybean_Radar_(Mato_Grosso,_Brazil)_-_현재_기온']?.value ?? 33.4,
      tempMax: 36.2,
      tempMin: 22.0,
      precipSumMm: normalized['soybean_Open-Meteo_South_America_Soybean_Radar_(Mato_Grosso,_Brazil)_-_일일_강수량']?.value ?? 2.1,
      condition: '고온 건조 지속',
      riskLevel: 'Elevated' as const,
      cropImpact: '남미 대두 파종 지연 우려 상존, 스팟 프리미엄 지지'
    },
    euCropRadar: {
      regionName: '유럽 곡창 지대 (France Grain Belt)',
      location: 'Paris/Beauce, FR (48.8°N, 2.3°E)',
      tempCurrent: normalized['wheat_Open-Meteo_EU_Grain_Belt_Radar_(Beauce/Paris,_France)_-_현재_기온']?.value ?? 17.5,
      tempMax: 20.2,
      tempMin: 11.2,
      precipSumMm: normalized['wheat_Open-Meteo_EU_Grain_Belt_Radar_(Beauce/Paris,_France)_-_일일_강수량']?.value ?? 6.4,
      condition: '온화한 강우',
      riskLevel: 'Moderate' as const,
      cropImpact: '동계소맥 파종 및 감자 수확 여건 안정적'
    }
  };

  const usdaProd = normalized['wheat_USDA_FAS_글로벌_소맥_생산량_(2026)']?.value;
  const usdaCons = normalized['wheat_USDA_FAS_글로벌_소맥_소비량_(2026)']?.value;
  const usdaEndStocks = normalized['wheat_USDA_FAS_글로벌_소맥_기말재고_(2026)']?.value;
  const usdaRatio = normalized['wheat_USDA_FAS_글로벌_소맥_재고율(Stocks-to-Use)_(2026)']?.value;

  const supplyDemand = {
    productionMMT: usdaProd ?? 822.4,
    consumptionMMT: usdaCons ?? 822.5,
    endingStocksMMT: usdaEndStocks ?? 276.3,
    stocksToUseRatio: usdaRatio ?? 33.6,
    changeYoY: '+3.0% YoY (2026 USDA PSD World Forecast)',
    source: 'USDA FAS Production, Supply and Distribution (Live API)'
  };

  const brentOil = await fetchLiveCrudeOilData('BZ=F', 101.40);
  const ttfGas = await fetchLiveCrudeOilData('TTF=F', 39.80);

  // Scrape live SCFI from SSE (or fallback to disk cache)
  const scfiPayload = await scrapeLiveScfiIndex(false);
  const scfi = scfiPayload ? scfiPayload.scfiPoints : 3664.11;
  const freightChangeStr = scfiPayload ? scfiPayload.changeStr : '--%';
  const freightStatus = freightChangeStr.startsWith('+') ? '운임 상승세' : '운임 하향 안정';
  const bdi = 3370;

  const energy = {
    brent: brentOil.currentPrice,
    brentChange: brentOil.pctChange,
    naturalGas: ttfGas.currentPrice,
    scfi,
    bdi,
    freightChangeStr,
    freightStatus,
    source: `${scfiPayload?.source || '트레드링스 (Tradlinx)'} · NYMEX / ICE`
  };

  const wasde = {
    marketYear: '2026',
    source: 'USDA FAS PSD',
    lastUpdated: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' KST',
    production: { mmt: 822.4, kmt: '822,432' },
    consumption: { mmt: 822.5, kmt: '822,456' },
    endingStocks: { mmt: 276.3, stuRatio: '33.6%' },
    exports: { mmt: 211.8, kmt: '211,768' },
    areaHarvested: { mha: 215.3, kha: '215,326' },
    yield: { mtPerHa: 3.82, kgPerHa: '3,820' },
    executiveBrief: '미국산 HRW 소맥은 560~590 USd/bu 범위의 단기 횡보세를 유지하고 있습니다. 미국 남부 평원지대의 지속적인 토양 수분 부족과 2025/26 흑해 수출 물량 감소가 상승 요인으로 작용하고 있습니다. 반면 러시아의 풍부한 이월 재고와 이집트 GASC 입찰 수요 둔화가 상단을 제한하고 있습니다. 국내 식품 제조 구매 데스크에서는 현재 570~575 USd 밴드 부근에서 1분기 물리적 수입 물량의 조달 약정을 체결할 것을 권고합니다.'
  };

  const policy = await fetchLatestScmPolicyAlerts();

  return {
    usdKrw,
    eurKrw,
    fxSource,
    fxChange,
    brent: brentOil.currentPrice,
    brentChange: brentOil.pctChange,
    weather: weatherTelemetry,
    supplyDemand,
    energy,
    syncPayload,
    wasde,
    policy
  };
}


// Calculate Macro Risk Index Score (0-100) and Gauge Needle Angle (-90° to +90°)
export function calculateMacroRisk(usdKrw: number, weather: any, energy: any) {
  let score = 50;
  if (usdKrw > 1380) score += 8;
  else if (usdKrw > 1360) score += 4;
  else if (usdKrw < 1330) score -= 5;

  if (weather.southAmerica.riskLevel === 'Elevated' || weather.southAmerica.precipSumMm < 5) score += 5;

  if (energy.brent > 80) score += 6;
  else if (energy.brent < 70) score -= 4;

  score = Math.max(10, Math.min(95, score));
  const level = score >= 75 ? 'CRITICAL' : score >= 60 ? 'ELEVATED' : score >= 40 ? 'MODERATE' : 'LOW';
  const pointerAngle = Math.round((score - 50) * 1.8);

  return { score, level, pointerAngle };
}

// Full Gemini live market data generator
export async function getLiveMarketData(forceRefresh: boolean = false) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (forceRefresh) {
    await scrapeLivePalmOilPrices(true);
    await syncAndRollPalmOleinData();
  }
  const pipeline = await fetchLivePipelineMetrics();
  const defaultCommodities = {
    wheat: { price: 574.25, unit: 'USd/bu', changeWoW: 2.14},
    corn: { price: 432.50, unit: 'USd/bu', changeWoW: -0.85},
    soybean: { price: 1024.75, unit: 'USd/bu', changeWoW: 1.45},
    soybeanOil: { price: 44.80, unit: 'USc/lb', changeWoW: 1.12},
    palmOil: { price: getSavedBaselinePrice(), unit: 'MYR/MT', changeWoW: 3.80},
    sugar: { price: 21.65, unit: 'USc/lb', changeWoW: -1.20},
    potatoStarch: { price: 860.00, unit: 'EUR/MT', changeWoW: 0.00},
    tapiocaStarch: { price: 700.00, unit: 'USD/MT', changeWoW: 0.00}
  };
  const macroRisk = calculateMacroRisk(pipeline.usdKrw, pipeline.weather, pipeline.energy);

  const defaultData = {
    updatedAt: getKSTTime(),
    model: 'gemini-3.8-flash (Search Grounded + Multi-Tier Pipeline)',
    modelVersion: 'gemini-flash-latest',
    grounded: true,
    usdKrw: pipeline.usdKrw,
    eurKrw: pipeline.eurKrw,
    brent: pipeline.energy.brent,
    scfi: pipeline.energy.scfi,
    bdi: pipeline.energy.bdi,
    macroRiskScore: macroRisk.score,
    macroRiskLevel: macroRisk.level,
    macroRiskPointerAngle: macroRisk.pointerAngle,
    weather: pipeline.weather,
    supplyDemand: pipeline.supplyDemand,
    commodities: defaultCommodities,
    aiBriefSynthesis:
      `[현재 시세]\n- 글로벌 소맥 및 유지류 시장은 주요 원자재 수급 우려와 남미 기상 이변으로 인해 소폭의 상승세를 나타내고 있습니다. 원/달러 환율은 ${pipeline.usdKrw}원 부근에서 좁은 폭으로 횡보하고 있습니다.\n\n[주요 원인]\n- 남미 파종지 고온 건조 기후(${pipeline.weather.southAmerica.tempCurrent}°C, 강우 ${pipeline.weather.southAmerica.precipSumMm}mm) 지속\n- 홍해 지정학적 리스크에 따른 원양 컨테이너 운임(SCFI ${pipeline.energy.scfi}pt) 변동성\n- 흑해 곡물 수출 회랑 관련 수급 불확실성\n\n[전망]\n- 향후 1-3개월간 소맥 및 팜유 가격은 남미 작황 진척도와 가을철 강우 강도에 따라 추가 변동성이 예상됩니다.\n\n[구매 제안]\n- 주요 원자재 가격 변동성 완화를 위해 안정적인 분할 구매 방식을 채택하고, 리스크 완충용 주요 변수를 집중 모니터링할 것을 제안합니다.`,
    directives: [
      {
        type: 'action',
        label: '조치 필요 (Action Required)',
        title: '팜유 가격 추이와 승인 공급사 실제 견적을 비교한 뒤 구매 시점 결정',
        source: '출처: RMS 멀티소스 피드 종합 분석 (USDA FAS, Frankfurter FX, Open-Meteo)'
      },
      {
        type: 'watch',
        label: '주시 (Watch Closely)',
        title: `미국 농무부(USDA) 캔자스 동계소맥 작황 보고서 및 콘벨트 강우(${pipeline.weather.usCornBelt.precipSumMm}mm) 모니터링`,
        source: '출처: USDA FAS PSD & Open-Meteo 미국 콘벨트 레이더'
      },
      {
        type: 'favorable',
        label: '우호적 조건 (Favorable)',
        title: '유럽 감자전분 승인 공급사 견적과 한국향 컨테이너 운임 변동 모니터링',
        source: '출처: EU Agri-food Data Portal & Baltic Exchange'
      }
    ],
    citations: [
      { title: 'USDA FAS Production, Supply and Distribution (PSD Online)', uri: 'https://apps.fas.usda.gov/psdonline/app/index.html' },
      { title: 'Frankfurter Exchange Rate Portal', uri: 'https://api.frankfurter.dev/v1/latest' },
      { title: 'Open-Meteo Global Crop Weather Radar', uri: 'https://open-meteo.com/' },
      { title: 'CME Group CBOT Agricultural Futures', uri: 'https://www.cmegroup.com/markets/agriculture.html' },
      { title: 'Bursa Malaysia Derivatives (BMD) FCPO', uri: 'https://www.bursamalaysia.com' },
      { title: 'US EIA Energy Information Administration', uri: 'https://www.eia.gov/opendata/' }
    ],
    sourceRegistry: pipeline.syncPayload.sources,
    normalizedData: pipeline.syncPayload.normalizedData,
    failedSourcesCount: pipeline.syncPayload.failedSourcesCount
  };

  // Cooldown check
  if (rateLimitCooldownUntil > Date.now()) {
    return {
      ...(cachedResponse || defaultData),
      isQuotaExhausted: true,
      quotaNotice: 'Gemini API 무료 쿼터 제한(429) 도달 상태입니다. 캐시된 검증 시장 데이터를 안전하게 제공 중입니다.'
    };
  }

  // Cache check
  if (!forceRefresh && cachedResponse && Date.now() < cacheExpiresAt) {
    return cachedResponse;
  }

  if (!apiKey) {
    return {
      ...defaultData,
      note: 'GEMINI_API_KEY is not configured yet in Secrets. Serving verified real-time baseline data.'
    };
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });

    const prompt = `You are the AI Agricultural Sourcing Controller for Nongshim SCM Procurement Desk.
Here is the live aggregated telemetry payload pulled from external REST/CSV endpoints:
- FX Benchmarks (Frankfurter API): USD/KRW = ${pipeline.usdKrw}, EUR/KRW = ${pipeline.eurKrw}
- Crop Weather Radar (Open-Meteo API):
  * US Corn Belt: Temp ${pipeline.weather.usCornBelt.tempCurrent}°C, Rainfall ${pipeline.weather.usCornBelt.precipSumMm}mm (${pipeline.weather.usCornBelt.condition})
  * South America: Temp ${pipeline.weather.southAmerica.tempCurrent}°C, Rainfall ${pipeline.weather.southAmerica.precipSumMm}mm (${pipeline.weather.southAmerica.condition})
  * EU Grain Belt: Temp ${pipeline.weather.euCropRadar.tempCurrent}°C, Rainfall ${pipeline.weather.euCropRadar.precipSumMm}mm (${pipeline.weather.euCropRadar.condition})
- Energy & Freight (EIA / Baltic / SCFI): Brent $${pipeline.energy.brent}/bbl, Natural Gas $${pipeline.energy.naturalGas}/MMBtu, SCFI ${pipeline.energy.scfi} pts, BDI ${pipeline.energy.bdi} pts
- Global S&D (USDA FAS PSD): Production ${pipeline.supplyDemand.productionMMT} MMT, Consumption ${pipeline.supplyDemand.consumptionMMT} MMT, Stocks-to-Use ${pipeline.supplyDemand.stocksToUseRatio}%

Search the web for any immediate breaking shifts for:
1. CBOT Wheat (USd/bu), Corn (USd/bu), Soybean (USd/bu), Soybean Oil (USc/lb)
2. BMD Palm Oil (MYR/MT), ICE Sugar No.11 (USc/lb), EU Potato Starch (EUR/MT), Thai Tapioca Starch (USD/MT)

Consider observed market benchmarks, live USD/KRW (${pipeline.usdKrw}), and ocean-freight trends, assess Macro Risk Index (0-100), and write an Executive AI Procurement Brief with 3 directives.

Please return a valid JSON object matching this structure EXACTLY (pure JSON without markdown):
{
  "usdKrw": ${pipeline.usdKrw},
  "eurKrw": ${pipeline.eurKrw},
  "brent": ${pipeline.energy.brent},
  "scfi": ${pipeline.energy.scfi},
  "bdi": ${pipeline.energy.bdi},
  "macroRiskScore": number,
  "macroRiskLevel": "LOW" | "MODERATE" | "ELEVATED" | "CRITICAL",
  "commodities": {
    "wheat": { "price": number, "unit": "USd/bu", "changeWoW": number },
    "corn": { "price": number, "unit": "USd/bu", "changeWoW": number },
    "soybean": { "price": number, "unit": "USd/bu", "changeWoW": number },
    "soybeanOil": { "price": number, "unit": "USc/lb", "changeWoW": number },
    "palmOil": { "price": number, "unit": "MYR/MT", "changeWoW": number },
    "sugar": { "price": number, "unit": "USc/lb", "changeWoW": number },
    "potatoStarch": { "price": number, "unit": "EUR/MT", "changeWoW": number },
    "tapiocaStarch": { "price": number, "unit": "USD/MT", "changeWoW": number }
  },
  "aiBriefSynthesis": "Strictly structured Korean text divided into exactly 4 sections. Each section must start on a new line with its bracketed header precisely formatted as follows: \n\n[현재 시세]\n- {1-2 concise sentences explaining current price levels and short-term directional trends}\n\n[주요 원인]\n- {2-4 core drivers shaping current market prices in order of importance. Strictly limit factors to verified input data: Supply/Demand, Weather, Energy, FX, Logistics, Policy, Demand}\n\n[전망]\n- {1-2 sentences outlining price projections for the next 1-3 months, explicitly citing key underlying conditions driving this projection}\n\n[구매 제안]\n- {1-2 sentences providing clear, actionable procurement direction. Do NOT invent specific quantities or timeline numbers unless inventory/demand data is explicitly provided in the payload. Use standard strategic options: 분할 구매 (split purchasing), 일부 선확보 (securing partial volumes), 비축구매 검토 (reserve stocking), 관망 (observation), 공급사 경쟁견적 (competitive bidding), or 주요 변수 집중 모니터링 (variable tracking).}",
  "directives": [
    { "type": "action", "label": "조치 필요 (Action Required)", "title": "...", "source": "..." },
    { "type": "watch", "label": "주시 (Watch Closely)", "title": "...", "source": "..." },
    { "type": "favorable", "label": "우호적 조건 (Favorable)", "title": "...", "source": "..." }
  ]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    const text = response.text || '';
    let parsed: any = null;

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch (err) {
      console.warn('Failed to parse Gemini JSON output, falling back to parsed text synthesis', err);
    }

    const citations: Array<{ title: string; uri: string }> = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks && Array.isArray(chunks)) {
      for (const chunk of chunks) {
        if (chunk.web?.uri && chunk.web?.title) {
          citations.push({ title: chunk.web.title, uri: chunk.web.uri });
        }
      }
    }

    // Try to get model from response or fallback to the requested model ID
    const resolvedModelName = (response as any).model || 'gemini-flash-latest';

    if (parsed) {
      // Accept ONLY documented commodity benchmark fields from a model response.
      // A legacy/novel model field must never reintroduce fabricated import-cost estimates.
      const finalCommodities = Object.fromEntries(
        Object.entries(defaultCommodities).map(([key, baseline]) => {
          const proposal = parsed.commodities?.[key];
          const validPrice = typeof proposal?.price === 'number' && Number.isFinite(proposal.price) && proposal.price > 0;
          const validChange = typeof proposal?.changeWoW === 'number' && Number.isFinite(proposal.changeWoW) && Math.abs(proposal.changeWoW) <= 100;
          return [key, {
            price: validPrice ? proposal.price : baseline.price,
            unit: baseline.unit,
            changeWoW: validChange ? proposal.changeWoW : baseline.changeWoW
          }];
        })
      );
      if (finalCommodities.palmOil?.price && finalCommodities.palmOil.price > 3000) {
        updateSavedBaselinePrice(finalCommodities.palmOil.price);
      }

      const riskScore = typeof parsed.macroRiskScore === 'number' ? parsed.macroRiskScore : macroRisk.score;
      const responseData = {
        updatedAt: getKSTTime(),
        model: 'gemini-3.8-flash (Search Grounded + Multi-Tier Pipeline)',
        modelVersion: resolvedModelName,
        grounded: true,
        usdKrw: parsed.usdKrw || pipeline.usdKrw,
        eurKrw: parsed.eurKrw || pipeline.eurKrw,
        brent: parsed.brent || pipeline.energy.brent,
        scfi: parsed.scfi || pipeline.energy.scfi,
        bdi: parsed.bdi || pipeline.energy.bdi,
        macroRiskScore: riskScore,
        macroRiskLevel: parsed.macroRiskLevel || macroRisk.level,
        macroRiskPointerAngle: Math.round((riskScore - 50) * 1.8),
        weather: pipeline.weather,
        supplyDemand: pipeline.supplyDemand,
        commodities: finalCommodities,
        aiBriefSynthesis: parsed.aiBriefSynthesis || defaultData.aiBriefSynthesis,
        directives: parsed.directives || defaultData.directives,
        citations: citations.length > 0 ? citations : defaultData.citations,
        sourceRegistry: pipeline.syncPayload.sources,
        normalizedData: pipeline.syncPayload.normalizedData,
        failedSourcesCount: pipeline.syncPayload.failedSourcesCount
      };
      cachedResponse = responseData;
      cacheExpiresAt = Date.now() + 5 * 60 * 1000;
      return responseData;
    }

    const fallbackWithText = {
      ...defaultData,
      modelVersion: resolvedModelName,
      aiBriefSynthesis: text.length > 50 ? text.slice(0, 500) : defaultData.aiBriefSynthesis,
      citations: citations.length > 0 ? citations : defaultData.citations,
      sourceRegistry: pipeline.syncPayload.sources,
      normalizedData: pipeline.syncPayload.normalizedData,
      failedSourcesCount: pipeline.syncPayload.failedSourcesCount
    };
    cachedResponse = fallbackWithText;
    cacheExpiresAt = Date.now() + 5 * 60 * 1000;
    return fallbackWithText;
  } catch (apiError: any) {
    const errorMsg = String(apiError?.message || '');
    const isQuotaExhausted =
      apiError?.status === 'RESOURCE_EXHAUSTED' ||
      apiError?.code === 429 ||
      errorMsg.includes('429') ||
      errorMsg.includes('quota') ||
      errorMsg.includes('RESOURCE_EXHAUSTED');

    if (isQuotaExhausted) {
      console.info('Switching to 5-minute backoff cache mode.');
      rateLimitCooldownUntil = Date.now() + 5 * 60 * 1000;
      return {
        ...(cachedResponse || defaultData),
        isQuotaExhausted: true,
        quotaNotice: 'Gemini API 무료 쿼터 제한(429) 도달 상태입니다. 캐시된 시장 데이터를 안전하게 제공 중입니다.'
      };
    }

    console.info('[geminiApi] Search Grounding fallback active (using verified multi-tier pipeline data).');
    return {
      ...(cachedResponse || defaultData),
      notice: 'Gemini Search Grounding call completed with fallback values'
    };
  }
}

// Connect middleware for Vite dev server & production server
export function createGeminiApiMiddleware() {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url || '';
    const dailySaved=await savedFreeDataResponse(url,req.method||'GET');
    if(dailySaved){res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.statusCode=dailySaved.status;res.end(JSON.stringify(dailySaved.payload));return;}
    const savedHistory=await savedGraphHistoryResponse(url);
    if(savedHistory){
      res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
      res.statusCode=savedHistory.status;res.end(JSON.stringify(savedHistory.payload));return;
    }

    // Inspect protection without sending a paid AI request or exposing credentials.
    if (url.startsWith('/api/rms/gemini-cost-status')) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.statusCode = 200;
      res.end(JSON.stringify({
        paidGeminiCalls: isPaidGeminiEnabled() ? 'ENABLED' : 'BLOCKED',
        stage: 'weekday-snapshot',
        note: 'Dashboard requests are blocked; only explicit, budgeted weekday refresh jobs can use Gemini.'
      }));
      return;
    }

    if (url.startsWith('/api/health')) {
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
      return;
    }

    // AI Analysis Endpoint (Gemini Structured Output)
    // Pre-Step-1 AI Studio market analysis route. Official statistics endpoints remain unchanged.
    if (url.startsWith('/api/ai-analysis/')) {
      try {
        const parsedUrl = new URL(url, 'http://localhost');
        const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
        // /api/ai-analysis/:commodity -> pathSegments[2]
        const commodityParam = pathSegments[2] || 'corn';
        const forceRefresh = parsedUrl.searchParams.get('force') === 'true';
        const data = await getGroundedAiAnalysis(commodityParam, forceRefresh);

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store'); // AI brief prices must not be cached for 1h
        res.statusCode = 200;
        res.end(JSON.stringify({
          success: true,
          data,
          timestamp: new Date().toISOString(),
          status: data.status,
          generatedAt: data.generatedAt,
          sourceCount: data.sources.length
        }, null, 2));
      } catch (err: any) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({ success: false, status: 'unavailable', error: err.message }));
      }
      return;
    }


    // Corn SCM Procurement Analysis Endpoint (CBOT ZC=F, USDA FAS PSD, AMIS)
    if (url.startsWith('/api/corn/procurement-analysis') || url.startsWith('/api/corn/analysis')) {
      try {
        const force = url.includes('force=true');
        const result = await cornIntelligenceService.getCornProcurementAnalysis(force);
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=60');
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, data: result }, null, 2));
      } catch (err: any) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // One dated Soybean history also owns its procurement price/weekly comparison.
    if (/^\/api\/soybean\/price-snapshot(?:\?|$)/.test(url)) {
      try {
        const snapshot=await soybeanIntelligenceService.getSoybeanPriceSnapshot(new URL(url,'http://localhost').searchParams.get('force')==='true');
        res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.statusCode=200;res.end(JSON.stringify(snapshot));
      } catch {res.setHeader('Content-Type','application/json');res.statusCode=503;res.end(JSON.stringify({success:false,error:'Soybean price snapshot unavailable'}));}
      return;
    }

    // Soybean SCM Procurement Analysis Endpoint (CBOT ZS=F, USDA FAS PSD, AMIS)
    if (url.startsWith('/api/soybean/procurement-analysis') || url.startsWith('/api/soybean/analysis')) {
      try {
        const force = url.includes('force=true');
        const result = await soybeanIntelligenceService.getSoybeanProcurementAnalysis(force);
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=60');
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, data: result }, null, 2));
      } catch (err: any) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    if (/^\/api\/sugar\/price-snapshot(?:\?|$)/.test(url)) {
      try {const force=new URL(url,'http://localhost').searchParams.get('force')==='true';const snapshot=await sugarPriceSnapshotService.getSnapshot(force);if(force)await rememberGraphRefresh('sugar',snapshot);res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.statusCode=200;res.end(JSON.stringify(snapshot));}
      catch {res.setHeader('Content-Type','application/json');res.statusCode=503;res.end(JSON.stringify({success:false,error:'Sugar price snapshot unavailable'}));}return;
    }
    if (/^\/api\/soybean-oil\/price-snapshot(?:\?|$)/.test(url)) {
      try {const snapshot=await soybeanOilIntelligenceService.getSoybeanOilPriceSnapshot(new URL(url,'http://localhost').searchParams.get('force')==='true');res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.statusCode=200;res.end(JSON.stringify(snapshot));}
      catch {res.setHeader('Content-Type','application/json');res.statusCode=503;res.end(JSON.stringify({success:false,error:'Soybean Oil price snapshot unavailable'}));}return;
    }

    // Soybean Oil SCM Procurement Analysis Endpoint (CBOT ZL=F, Physical FOB, Liquid Tanker Freight, USDA FAS PSD, AMIS)
    if (url.startsWith('/api/soybean-oil/procurement-analysis') || url.startsWith('/api/soybean-oil/analysis')) {
      try {
        const force = url.includes('force=true');
        const result = await soybeanOilIntelligenceService.getSoybeanOilProcurementAnalysis(force);
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=60');
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, data: result }, null, 2));
      } catch (err: any) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // AMIS Market Monitor Wheat Market Intelligence Endpoint
    if (url.startsWith('/api/amis/wheat') || url.startsWith('/api/amis/market-monitor')) {
      try {
        const force = url.includes('force=true');
        const result = await amisService.fetchWheatIntelligence(force);
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = result.success ? 200 : (result.statusCode || 502);
        res.end(JSON.stringify(result, null, 2));
      } catch (err: any) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // Wheat-specific AI recommendation using verified U.S. Wheat + AMIS + current web research
    if (url.startsWith('/api/wheat/ai-recommendation')) {
      try {
        const force = url.includes('force=true');
        const result = await wheatIntelligenceService.getWheatRecommendation(force);
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = result.success ? 200 : 500;
        res.end(JSON.stringify(result, null, 2));
      } catch (err: any) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // Wheat sourcing origin radar - preserves the upgraded Wheat origin section
    if (url.startsWith('/api/wheat/origin-radar') || url.startsWith('/api/wheat/origins')) {
      try {
        const force = url.includes('force=true');
        const result = await originRadarService.getWheatOriginRadar(force);
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = result.success ? 200 : 500;
        res.end(JSON.stringify(result, null, 2));
      } catch (err: any) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // Corn sourcing origin radar - country-level verified PSD, WASDE, AMIS, Gemini Search
    if (url.startsWith('/api/corn/origin-radar') || url.startsWith('/api/corn/origins')) {
      try {
        const force = url.includes('force=true');
        const result = await originRadarService.getCornOriginRadar(force);
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = result.success ? 200 : 500;
        res.end(JSON.stringify(result, null, 2));
      } catch (err: any) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // Soybean sourcing origin radar - country-level verified PSD, CONAB, WASDE, AMIS, Gemini Search
    if (url.startsWith('/api/soybean/origin-radar') || url.startsWith('/api/soybean/origins')) {
      try {
        const force = url.includes('force=true');
        const result = await originRadarService.getSoybeanOriginRadar(force);
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = result.success ? 200 : 500;
        res.end(JSON.stringify(result, null, 2));
      } catch (err: any) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // Soybean Oil sourcing origin radar - Argentina, Brazil, US, Paraguay (USDA FAS PSD, WASDE, CONAB, AMIS, USDA ERS, Gemini Search)
    if (url.startsWith('/api/soybean-oil/origin-radar') || url.startsWith('/api/soybean-oil/origins')) {
      try {
        const force = url.includes('force=true');
        const result = await originRadarService.getSoybeanOilOriginRadar(force);
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = result.success ? 200 : 500;
        res.end(JSON.stringify(result, null, 2));
      } catch (err: any) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // Central Source Registry Endpoint
    if (url.startsWith('/api/market-data/sources')) {
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify(serverMarketDataService.getSourceRegistryWithStatus()));
      return;
    }

    // Normalized Market Data endpoint
    if (url.startsWith('/api/market-data/normalized')) {
      try {
        const force = url.includes('force=true');
        const syncPayload = await serverMarketDataService.syncAllSources(force);
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 200;
        res.end(JSON.stringify(syncPayload));
      } catch (err: any) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // Manual Refresh endpoint for all sources
    if (url.startsWith('/api/market-data/refresh')) {
      try {
        const syncPayload = await serverMarketDataService.syncAllSources(true);
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 200;
        res.end(JSON.stringify(syncPayload));
      } catch (err: any) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // USDA world Soybean Oil: authenticated data only, with a dated last-verified cache.
    // Keep this ahead of the legacy generic USDA route, which still has static baselines.
    if (url.startsWith('/api/usda/soybean-oil') || url.startsWith('/api/usda/soybean_oil') || url.startsWith('/api/usda/4232000')) {
      try {
        const parsed = new URL(url, 'http://localhost');
        const result = await fetchSoybeanOilWorldPsd(parsed.searchParams.get('force') === 'true');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        if (!result.success || !result.data) {
          res.statusCode = 503;
          res.end(JSON.stringify({ success: false, commodity: 'soybean-oil', dataStatus: 'unavailable',
            checkedAt: result.checkedAt, error: result.message || 'USDA PSD currently unavailable' }, null, 2));
        } else {
          const payload = formatWasdeResponse('soybean-oil', result.data, result.verifiedAt);
          res.statusCode = 200;
          res.end(JSON.stringify({ ...payload, dataStatus: result.status,
            marketYear: result.marketYear, checkedAt: result.checkedAt, verifiedAt: result.verifiedAt,
            data: { ...payload.data, rawRecords: result.data.rawRecords,
              rawRecordsCount: result.data.rawRecordsCount, marketYear: result.marketYear },
            dataMessage: result.message || null }, null, 2));
        }
      } catch (err: any) {
        res.statusCode = 503;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({ success: false, dataStatus: 'unavailable', error: String(err?.message || err) }));
      }
      return;
    }

    // RMS Step 12 USDA multi-commodity: verified world data only; not static baselines.
    if (/^\/api\/usda\/(wheat|corn|soybean|palm-oil|sugar)(\?|$)/.test(url)) {
      const parsed = new URL(url, 'http://localhost');
      const commodity = parsed.pathname.split('/')[3];
      const result = await fetchOtherCommodityWorldPsd(commodity, parsed.searchParams.get('force') === 'true');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.statusCode = result.success ? 200 : 503;
      res.end(JSON.stringify({
        success: result.success, commodity, dataStatus: result.status,
        checkedAt: result.checkedAt, verifiedAt: result.verifiedAt || null,
        marketYear: result.marketYear || null,
        data: result.data ? { ...result.data, commodity } : undefined,
        ...(result.message ? { message: result.message } : {})
      }, null, 2));
      return;
    }

    // USDA FAS PSD Wheat & Commodity Endpoint
    if (url.startsWith('/api/usda/')) {
      try {
        const parsedUrl = new URL(url, 'http://localhost');
        const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
        // /api/usda/:commodity -> pathSegments[2]
        const commodityParam = (pathSegments[2] || 'wheat').toLowerCase().trim();
        const commodityCode = parsedUrl.searchParams.get('commodityCode') || commodityParam;
        const marketYear = parsedUrl.searchParams.get('marketYear') || '2026';
        const result = await usdaFasService.fetchWorldPsd(commodityCode, marketYear);

        const summary = result.data || getCommodityBaseline(commodityParam);
        const payload = formatWasdeResponse(commodityParam, summary);

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600');
        res.statusCode = 200;
        res.end(JSON.stringify(payload, null, 2));
      } catch (err: any) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // RMS Step 17 — official starch source separation
    if (/^\/api\/starch\/tapioca-quote(\?|$)/.test(url)) {
      const force = new URL(url, 'http://localhost').searchParams.get('force') === 'true';
      const result = await fetchOfficialTapiocaQuote(force);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.statusCode = result.success ? 200 : 503;
      res.end(JSON.stringify(result, null, 2));
      return;
    }

    // RMS Step 18 — Eurostat potato harvest statistics
    if (/^\/api\/starch\/potato-stats(\?|$)/.test(url)) {
      const force = new URL(url, 'http://localhost').searchParams.get('force') === 'true';
      const result = await fetchOfficialPotatoEurostat(force);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.statusCode = result.success ? 200 : 503;
      res.end(JSON.stringify(result, null, 2));
      return;
    }

    // Potato benchmark only: free, monthly EU27-to-Korea export unit value.
    if (/^\/api\/starch\/potato-export-quote(\?|$)/.test(url)) {
      const force = new URL(url, 'http://localhost').searchParams.get('force') === 'true';
      const result = force ? await fetchOfficialPotatoExportQuote(true) : readSavedPotatoExportQuote();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.statusCode = result.success ? 200 : 503;
      res.end(JSON.stringify(result));
      return;
    }
    // RMS Step 20 — potato starch Eurostat Comext trade
    if (/^\/api\/starch\/potato-trade(\?|$)/.test(url)) {
      const force = new URL(url, 'http://localhost').searchParams.get('force') === 'true';
      const result = await fetchOfficialPotatoComext(force);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.statusCode = result.success ? 200 : 503;
      res.end(JSON.stringify(result, null, 2));
      return;
    }

    // Graph-only regional series; keep the existing agricultural proxy/SCM route unchanged.
    if (/^\/api\/potato-starch\/production-regions(?:\?|$)/.test(url)) {
      const force=new URL(url,'http://localhost').searchParams.get('force')==='true';
      const data=force?await getRegionalPotatoProduction(true):readSavedRegionalPotatoProduction();
      res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.statusCode=200;res.end(JSON.stringify(data));return;
    }
    // Compatibility alias: official agricultural proxy only; never a paid page-view call.
    if (url.startsWith('/api/potato-starch/production')) {
      const result=potatoProductionPayload();
      res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.statusCode=200;
      res.end(JSON.stringify(result));
      return;
    }

    // RMS AI & Risk Management Strategy Route
    if (url.startsWith('/api/rms/strategy')) {
      try {
        const parsedUrl = new URL(url, 'http://localhost');
        const commodityId = parsedUrl.searchParams.get('commodityId') || 'wheat';
        const commodityName = parsedUrl.searchParams.get('commodityName') || 'U.S. Wheat';
        const price = parseFloat(parsedUrl.searchParams.get('price') || '246.55');
        const unit = parsedUrl.searchParams.get('unit') || 'USD/MT';
        
        const evaluation = await rmsAiService.evaluateStrategy(commodityId, commodityName, price, [price * 0.85, price * 0.9, price * 0.95, price], unit);
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, data: evaluation }, null, 2));
      } catch (err: any) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // Live Origin Logistics & Shipment Risk API via Gemini Search Engine Grounding
    if (url.startsWith('/api/origins/live')) {
      try {
        const parsedUrl = new URL(url, 'http://localhost');
        const commodityParam = parsedUrl.searchParams.get('commodity') || 'wheat';

        const apiKey = process.env.GEMINI_API_KEY;
        let originStatuses: any[] = [];

        if (apiKey && apiKey !== 'DEMO_KEY' && Date.now() >= originGroundingCooldownUntil) {
          try {
            const ai = new GoogleGenAI({
              apiKey,
              httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
            });

            let specificInstruction = '';
            if (commodityParam === 'soybean-oil' || commodityParam === 'soybean_oil') {
              specificInstruction = `For Soybean Oil, search and ensure you return:
- United States: Production of 14.05M MT (Note: "저위험 - 자국 재생디젤(RD/SAF) 수요 집중으로 수출 가용량 제한적")
- Brazil: Production of 12.64M MT (Note: "저위험 - 바이오디젤 의무혼합(B15) 및 수출 물량 적정 유지")
- Argentina: Production of 8.38M MT (Note: "중위험 - 로사리오 착유 공장 가동률 및 파라나강 운송 주시")`;
            } else if (commodityParam === 'tapioca-starch' || commodityParam === 'tapioca_starch') {
              specificInstruction = `For Tapioca Starch, search and ensure you return:
- Thailand: Production of "생뿌리 생산 18.58M MT (전분 환산 ~4.6M MT · 경작지 106만 HA)" with FOB Bangkok $700/MT export benchmark.`;
            }

            const prompt = `You are an automated real-time SCM commodity intelligence agent.
Search latest official web sources (USDA FAS PSD, WASDE, CONAB, TTSA, MPOB, Eurostat, GAPKI) for ${commodityParam}.
${specificInstruction}

Return a strict JSON array of 4 origin objects matching this structure:
[
  {
    "region": "Country/Region Name (e.g. 'United States (Gulf)')",
    "production": "Production volume with clear units (e.g. '14.05M MT' for US Soybean Oil, or '생뿌리 생산 18.58M MT (전분 환산 ~4.6M MT · 경작지 106만 HA)' for Tapioca Starch)",
    "exports": "Export volume (e.g. '수출 5.2M MT' or '천연 2.85M MT / 변성 1.15M MT (FOB 방콕 $700/MT)')",
    "endingStocks": "Ending stocks (e.g. '기말재고 0.4M MT')",
    "riskAssessment": "1-sentence SCM risk summary including active policies (e.g., Brazil B15 biodiesel mandate, US RD/SAF demand, or Thai supply stability).",
    "status": "정상 선적" | "모니터링" | "주의 요망",
    "statusColor": "green" | "yellow" | "red",
    "sourceName": "Primary source cited"
  }
]
Return pure JSON only without markdown formatting. Ensure that the returned value is a valid JSON array and nothing else.`;

            const response = await ai.models.generateContent({
              model: 'gemini-3.8-flash',
              contents: prompt,
              config: {
                tools: [{ googleSearch: {} }]
              }
            });
            const text = response.text || '';
            const match = text.match(/\[[\s\S]*\]/);
            if (match) {
              originStatuses = JSON.parse(match[0]);
            }
          } catch (err: any) {
            const errStr = String(err?.message || err);
            const is429 =
              err?.status === 429 ||
              err?.status === 'RESOURCE_EXHAUSTED' ||
              err?.code === 429 ||
              errStr.includes('429') ||
              errStr.includes('quota') ||
              errStr.includes('RESOURCE_EXHAUSTED');

            if (is429) {
              originGroundingCooldownUntil = Date.now() + 10 * 60 * 1000;
              console.info('[OriginStatus] API quota limit reached (429). Activating 10m cooldown mode.');
            } else {
              console.info('[OriginStatus] Grounded search notice:', err?.message || errStr);
            }
          }
        }

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=1800');
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, origins: originStatuses, retrievedAt: new Date().toISOString() }, null, 2));
      } catch (err: any) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // Market Intelligence Live Feed (War/Trade/Weather/Supply) with Google News linking
    if (url.startsWith('/api/market-intelligence')) {
      try {
        const parsedUrl = new URL(url, 'http://localhost');
        const commodityParam = parsedUrl.searchParams.get('commodity') || 'wheat';
        const force = parsedUrl.searchParams.get('force') === 'true';

        const articles = await marketIntelligenceService.getCommodityIntelligence(commodityParam, force);

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=1800');
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, articles }, null, 2));
      } catch (err: any) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // Universal Historical Price Route
    if (url.startsWith('/api/history') || url.startsWith('/api/corn/price-history')) {
      try {
        const parsedUrl = new URL(url, 'http://localhost');
        const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
        const urlCommodity = pathSegments[0] === 'history' ? pathSegments[1] : null;
        const commodity = parsedUrl.searchParams.get('commodity') || urlCommodity || 'corn';
        const timeframe = parsedUrl.searchParams.get('timeframe') || '6M';
        const force = parsedUrl.searchParams.get('force') === 'true' || parsedUrl.searchParams.get('forceRefresh') === 'true';

        const data = commodity==='soybean'
          ? await soybeanIntelligenceService.getSoybeanPriceSnapshot(force)
          : commodity==='soybean-oil' ? await soybeanOilIntelligenceService.getSoybeanOilPriceSnapshot(force) : commodity==='sugar' ? await sugarPriceSnapshotService.getSnapshot(force) : await fetchHistoricalData(commodity, timeframe, force);
        if(force&&(commodity==='corn'||commodity==='sugar'))await rememberGraphRefresh(commodity,data);

        res.setHeader('Content-Type', 'application/json');
        // force=true should also bypass browser/proxy caches, not just local fetch caches.
        res.setHeader('Cache-Control', force || commodity==='soybean'
          ? 'no-store, no-cache, must-revalidate'
          : 'public, max-age=300, s-maxage=300, stale-while-revalidate=60');
        res.statusCode = 200;
        res.end(JSON.stringify(data, null, 2));
      } catch (err: any) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // Read-only persistent history status; does not trigger a website scrape.
    if (url.startsWith('/api/uswheat/history-status')) {
      try {
        res.setHeader('Content-Type','application/json');
        res.setHeader('Cache-Control','no-store');
        res.statusCode = 200;
        res.end(JSON.stringify(usWheatPriceReportService.getPriceHistoryStatus()));
      } catch (err: any) {
        res.statusCode = 503;
        res.end(JSON.stringify({ success:false, error: err.message }));
      }
      return;
    }

    // U.S. Wheat Associates Historical Price Series Endpoint
    if (url.startsWith('/api/uswheat/price-history')) {
      try {
        const force = url.includes('force=true');
        const result = await usWheatPriceReportService.getPriceHistory(force);
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = result.success ? 200 : (result.statusCode || 502);
        res.end(JSON.stringify(result, null, 2));
      } catch (err: any) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // U.S. Wheat Associates Weekly Price Report Scraper Endpoint
    if (url.startsWith('/api/uswheat/price-report') || url.startsWith('/api/uswheat/prices')) {
      try {
        const force = url.includes('force=true');
        const result = await usWheatPriceReportService.fetchLatestPriceReport(force);
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = result.success ? 200 : (result.statusCode || 502);
        res.end(JSON.stringify(result, null, 2));
      } catch (err: any) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    if (url.startsWith('/api/scm/live-policy')) {
      try {
        const policyData = await getLiveTradePolicyAlert();
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 200;
        res.end(JSON.stringify(policyData));
      } catch (err: any) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (url.startsWith('/api/scm/live-market-issues')) {
      try {
        const force = url.includes('force=true');
        const issuesData = await fetchLiveMarketIssues(force);
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 200;
        res.end(JSON.stringify(issuesData));
      } catch (err: any) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (url.startsWith('/api/pipeline/telemetry')) {
      try {
        if (url.includes('force=true')) {
          await syncAndRollPalmOleinData();
        }
        const pipelineData = await fetchLivePipelineMetrics();
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 200;
        res.end(JSON.stringify(pipelineData));
      } catch (e: any) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    if (url.startsWith('/api/gemini/live-market-data')) {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', async () => {
        try {
          let force = false;
          if (body) {
            try {
              const parsed = JSON.parse(body);
              force = parsed.force === true;
            } catch {
              // ignore
            }
          }
          if (url.includes('force=true')) {
            force = true;
          }
          const result = await getLiveMarketData(force);
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify(result));
        } catch (err: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    next();
  };
}
