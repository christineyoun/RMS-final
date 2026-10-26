/** Legacy API compatibility over authenticated USDA records. No sample baselines. */
import fs from 'node:fs';import path from 'node:path';
import type {NormalizedMarketData} from '../types.ts';
import {getKSTFormattedTime} from './marketDataService.ts';
import {USDA_WORLD_COMMODITIES,parsePsdWorldRows} from '../lib/verifiedWorldWasde.ts';
import {fetchOtherCommodityWorldPsd} from './usdaOtherCommoditiesLiveService.ts';
import {fetchSoybeanOilWorldPsd} from './usdaSoybeanOilLiveService.ts';
export interface UsdaPsdRawRecord {
  commodityCode: string;
  countryCode: string;
  marketYear: string;
  calendarYear: string;
  month: string;
  attributeId: number;
  unitId: number;
  value: number;
}

export interface UsdaWheatWorldSummary {
  commodityCode: string;
  marketYear: string;
  releaseMonth: string;
  source: string;
  production1000MT: number;
  productionMMT: number;
  domesticConsumption1000MT: number;
  domesticConsumptionMMT: number;
  endingStocks1000MT: number;
  endingStocksMMT: number;
  beginningStocks1000MT: number;
  beginningStocksMMT: number;
  imports1000MT: number;
  exports1000MT: number;
  exportsMMT: number;
  totalSupply1000MT: number;
  stocksToUseRatio: number;
  stocksToUseRatioPct: number;
  areaHarvested1000HA?: number;
  yieldMTHA?: number;
  rawRecordsCount: number;
  rawRecords: UsdaPsdRawRecord[];
  executiveBrief?: string;
}

export interface UsdaPsdFetchResult {
  success: boolean;
  statusCode?: number;
  commodityCode: string;
  marketYear: string;
  endpoint: string;
  usedApiKeySource: 'USDA_FAS_API_KEY' | 'USDA_API_KEY' | 'DEMO_KEY';
  data?: UsdaWheatWorldSummary;
  normalizedData?: NormalizedMarketData[];
  errorMessage?: string;
  timestamp: string;
  isCached?: boolean;
}


const COMMODITY_CODE_MAP: Record<string, string> = {
  wheat: '0410000',
  corn: '0440000',
  soybean: '2222000',
  soybeans: '2222000',
  '0812000': '2222000',
  '2222000': '2222000',
  'soybean-oil': '4232000',
  'soybeanoil': '4232000',
  '4232000': '4232000',
  '0814200': '4232000',
  'palm-oil': '4221000',
  'palmoil': '4221000',
  '0814310': '4221000',
  '4221000': '4221000',
  sugar: '0612000',
  '0612000': '0612000',
  'potato-starch': 'potato-starch',
  'tapioca-starch': 'tapioca-starch'
};

export function resolveCommodityCode(input: string): string {
  if (!input) return '0410000';
  const clean = input.trim().toLowerCase();
  return COMMODITY_CODE_MAP[clean] || clean;
}


export function getCommodityBaseline(code:string):UsdaWheatWorldSummary {
 const resolved=resolveCommodityCode(code),id=Object.keys(USDA_WORLD_COMMODITIES).find(id=>USDA_WORLD_COMMODITIES[id].code===resolved);
 if(!id)throw Error('Verified USDA commodity unavailable');
 const saved=JSON.parse(fs.readFileSync(path.join(process.cwd(),'src/data/usda_world_last_verified_'+id+'.json'),'utf8'));
 if(!Number.isFinite(Date.parse(saved.verifiedAt))||!parsePsdWorldRows(saved.data?.rawRecords,id,Number(saved.data?.marketYear)))throw Error('Verified USDA observation unavailable');
 return saved.data;
}
export function getExecutiveBriefForCommodity(_commodity:string,summary:UsdaWheatWorldSummary):string {
 return summary.executiveBrief||'검증된 USDA 발표 수치를 확인하십시오. 자료 기준월: '+summary.marketYear+'-'+summary.releaseMonth;
}
export interface FormattedWasdeResponse {
  commodity: string;
  marketYear: string;
  productionMMT: number;
  productionKMT: number;
  consumptionMMT: number;
  consumptionKMT: number;
  endingStocksMMT: number;
  stocksToUseRatio: number;
  exportsMMT: number;
  exportsKMT: number;
  areaHarvestedMHA: number;
  areaHarvestedKHA: number;
  yieldMTHA: number;
  yieldKGHA: number;
  lastUpdated: string;
  source?: string;
  executiveBrief?: string;
  success?: boolean;
  data?: any;
}

export function formatWasdeResponse(
  commodity: string,
  summary: UsdaWheatWorldSummary,
  timestamp?: string
): FormattedWasdeResponse {
  const cleanId = (commodity || 'wheat').toLowerCase().trim();
  const timeStr = timestamp || getKSTFormattedTime();
  const prodMMT = summary.productionMMT ?? Number(((summary.production1000MT || 0) / 1000).toFixed(1));
  const prodKMT = summary.production1000MT || Math.round(prodMMT * 1000);
  const consMMT = summary.domesticConsumptionMMT ?? Number(((summary.domesticConsumption1000MT || 0) / 1000).toFixed(1));
  const consKMT = summary.domesticConsumption1000MT || Math.round(consMMT * 1000);
  const endStocksMMT = summary.endingStocksMMT ?? Number(((summary.endingStocks1000MT || 0) / 1000).toFixed(1));
  const stuRatio = summary.stocksToUseRatio ?? summary.stocksToUseRatioPct ?? 0;
  const expMMT = summary.exportsMMT ?? Number(((summary.exports1000MT || 0) / 1000).toFixed(1));
  const expKMT = summary.exports1000MT || Math.round(expMMT * 1000);
  const areaMHA = summary.areaHarvested1000HA ? Number((summary.areaHarvested1000HA / 1000).toFixed(1)) : 0;
  const areaKHA = summary.areaHarvested1000HA || 0;
  const yieldMT = summary.yieldMTHA ? Number(summary.yieldMTHA.toFixed(2)) : 0;
  const yieldKG = summary.yieldMTHA ? Math.round(summary.yieldMTHA * 1000) : 0;
  const brief = summary.executiveBrief || getExecutiveBriefForCommodity(cleanId, summary);

  return {
    commodity: cleanId,
    marketYear: summary.marketYear || '2026',
    productionMMT: prodMMT,
    productionKMT: prodKMT,
    consumptionMMT: consMMT,
    consumptionKMT: consKMT,
    endingStocksMMT: endStocksMMT,
    stocksToUseRatio: stuRatio,
    exportsMMT: expMMT,
    exportsKMT: expKMT,
    areaHarvestedMHA: areaMHA,
    areaHarvestedKHA: areaKHA,
    yieldMTHA: yieldMT,
    yieldKGHA: yieldKG,
    lastUpdated: timeStr,
    source: summary.source || 'USDA FAS PSD',
    executiveBrief: brief,
    success: true,
    data: {
      ...summary,
      commodity: cleanId,
      productionMMT: prodMMT,
      productionKMT: prodKMT,
      consumptionMMT: consMMT,
      consumptionKMT: consKMT,
      endingStocksMMT: endStocksMMT,
      stocksToUseRatio: stuRatio,
      exportsMMT: expMMT,
      exportsKMT: expKMT,
      areaHarvestedMHA: areaMHA,
      areaHarvestedKHA: areaKHA,
      yieldMTHA: yieldMT,
      yieldKGHA: yieldKG,
      lastUpdated: timeStr,
      executiveBrief: brief
    }
  };
}


export class UsdaFasService {
 private static instance:UsdaFasService;
 private countries=new Map<string,UsdaWheatWorldSummary>();
 public static getInstance(){return this.instance||(this.instance=new UsdaFasService());}
 public getApiKeyInfo():{key:string;source:'USDA_FAS_API_KEY'|'USDA_API_KEY'|'DEMO_KEY'}{
  if(process.env.USDA_FAS_API_KEY?.trim())return {key:process.env.USDA_FAS_API_KEY.trim(),source:'USDA_FAS_API_KEY'};
  if(process.env.USDA_API_KEY?.trim())return {key:process.env.USDA_API_KEY.trim(),source:'USDA_API_KEY'};
  return {key:'',source:'DEMO_KEY'};
 }
 public async fetchWorldPsd(rawCommodityCode='0410000',marketYear=String(new Date().getUTCFullYear())):Promise<UsdaPsdFetchResult>{
  const commodityCode=resolveCommodityCode(rawCommodityCode),id=Object.keys(USDA_WORLD_COMMODITIES).find(id=>USDA_WORLD_COMMODITIES[id].code===commodityCode),timestamp=new Date().toISOString(),usedApiKeySource=this.getApiKeyInfo().source;
  if(!id&&commodityCode!=='4232000')return {success:false,commodityCode,marketYear,timestamp,endpoint:'https://api.fas.usda.gov/api/psd',usedApiKeySource,errorMessage:'Verified source unavailable'};
  const result=commodityCode==='4232000'?await fetchSoybeanOilWorldPsd(false):await fetchOtherCommodityWorldPsd(id??'',false);
  return {success:result.success,endpoint:'https://api.fas.usda.gov/api/psd',commodityCode,marketYear:result.data?.marketYear||marketYear,timestamp:result.verifiedAt||timestamp,usedApiKeySource,data:result.data,isCached:result.status!=='live-verified',errorMessage:result.message};
 }
 public async fetchCountryPsd(rawCommodityCode='0440000',countryCode='US',marketYear=String(new Date().getUTCFullYear())):Promise<UsdaPsdFetchResult>{
  const commodityCode=resolveCommodityCode(rawCommodityCode),country=countryCode.toUpperCase(),key=commodityCode+'_'+country+'_'+marketYear,auth=this.getApiKeyInfo(),timestamp=new Date().toISOString();
  const endpoint='https://api.fas.usda.gov/api/psd/commodity/'+commodityCode+'/country/'+country+'/year/'+marketYear;
  try{
   if(!auth.key)throw Error('USDA API key unavailable');
   const response=await fetch(endpoint,{headers:{Accept:'application/json',API_KEY:auth.key,'x-api-key':auth.key},signal:AbortSignal.timeout(8000)});
   if(!response.ok)throw Error('USDA HTTP '+response.status);
   const body=await response.json(),rows:UsdaPsdRawRecord[]=Array.isArray(body)?body:body.data;
   if(!Array.isArray(rows)||!rows.length||rows.some(r=>r.commodityCode!==commodityCode||r.countryCode!==country||String(r.marketYear)!==marketYear||!Number.isFinite(r.value)||r.value<0))throw Error('USDA country identity/values invalid');
   const attrs=new Map(rows.map(r=>[r.attributeId,r.value]));
   if(![28,125,176,20,57,88].every(id=>attrs.has(id))||!(attrs.get(125)!>0)||new Set(rows.map(r=>r.calendarYear+'-'+r.month)).size!==1)throw Error('USDA country records incomplete');
   const n=(id:number)=>attrs.get(id)!;
   const data:UsdaWheatWorldSummary={commodityCode,marketYear,releaseMonth:String(rows[0].month),source:'USDA FAS PSD Online',production1000MT:n(28),productionMMT:n(28)/1000,domesticConsumption1000MT:n(125),domesticConsumptionMMT:n(125)/1000,endingStocks1000MT:n(176),endingStocksMMT:n(176)/1000,beginningStocks1000MT:n(20),beginningStocksMMT:n(20)/1000,imports1000MT:n(57),exports1000MT:n(88),exportsMMT:n(88)/1000,totalSupply1000MT:n(28)+n(20)+n(57),stocksToUseRatio:100*n(176)/n(125),stocksToUseRatioPct:100*n(176)/n(125),areaHarvested1000HA:attrs.get(4),yieldMTHA:attrs.get(184),rawRecordsCount:rows.length,rawRecords:rows};
   this.countries.set(key,data);return {success:true,statusCode:200,commodityCode,marketYear,endpoint,usedApiKeySource:auth.source,data,timestamp,isCached:false};
  }catch(error){const data=this.countries.get(key);return {success:!!data,statusCode:data?200:503,commodityCode,marketYear,endpoint,usedApiKeySource:auth.source,data,timestamp,isCached:true,errorMessage:error instanceof Error?error.message:'USDA unavailable'};}
 }
}
export const usdaFasService=UsdaFasService.getInstance();
