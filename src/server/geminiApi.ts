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
  return NaN; // No valid dated observation.
}

// Helper: Write new live price to disk cache while preserving historicalSeries and oleinUsd
export function updateSavedBaselinePrice(newPrice: number, newOleinUsd?: number): void {
throw Error('Undated price mutation is prohibited; use the dated publisher observation store');
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
const {readFreeJson}=await import('./freeDailyPublication.ts');const {parseDatedDisplayFx}=await import('../utils/soybeanPriceSnapshot.ts');const saved=readFreeJson('free-fx.json'),fx=parseDatedDisplayFx(saved?.raw,saved?.verifiedAt);if(!fx)throw Error('Verified dated FX unavailable');return {usdKrw:fx.USD_KRW,eurKrw:fx.USD_KRW*fx.EUR_USD,change:''};
}

// External Pipeline Helper: Fetches live data via serverMarketDataService
export async function fetchLivePipelineMetrics() {
throw Error('Legacy mixed telemetry is unavailable; use the saved free-daily publication');
}


// Calculate Macro Risk Index Score (0-100) and Gauge Needle Angle (-90° to +90°)
export function calculateMacroRisk(usdKrw: number, weather: any, energy: any) {
throw Error('Legacy macro financial assumptions are not configured; use saved evidence-based procurement risk');
}

// Full Gemini live market data generator
export async function getLiveMarketData(forceRefresh: boolean = false) {
throw Error('Legacy model-based market prices are retired; use timestamped saved price sources');
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
        const {COMMODITY_IDS,quoteFromResponse}=await import('../services/commodityQuoteSource.ts');
        if(!COMMODITY_IDS.some(id=>id===commodityId))throw Error('Unknown commodity');
        const route=commodityId==='wheat'?'/api/uswheat/price-history':'/api/history?commodity='+commodityId+'&timeframe=5Y';
        const snapshot=await savedGraphHistoryResponse(route),quote=quoteFromResponse(commodityId as typeof COMMODITY_IDS[number],snapshot?.payload);
        if(!quote||quote.priceUsdMt<=0)throw Error('Verified price/history unavailable');
        const history=(snapshot?.payload?.data||[]).filter((p:any)=>!p.isSynthetic).map((p:any)=>commodityId==='wheat'?p.srwMt:p.cpoUsd??p.usdPerMT).filter((n:any)=>Number.isFinite(n)&&n>0);
        const evaluation = await rmsAiService.evaluateStrategy(commodityId,commodityName,quote.priceUsdMt,history,'USD/MT');
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
