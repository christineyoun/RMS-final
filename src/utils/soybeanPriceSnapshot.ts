import type { Currency, SoybeanProcurementAnalysisData } from '../types';
export interface DatedDisplayFx {
  sourceUrl: string;
  observationDate: string;
  retrievedAt: string;
  USD_KRW: number;
  EUR_USD: number;
  USD_MYR?: number;
  stale?: boolean;
}
export interface SoybeanPriceSnapshot {
  success: boolean;
  commodity: string;
  symbol: string;
  source: string;
  fetchedAt: string;
  quoteUnit: string;
  priceUnit: string;
  data: Array<{date:string;usdPerMT:number;centsPerBushel:number;quoteValue?:number;isProvisional?:boolean;isSynthetic?:boolean}>;
  latestMarketQuote?: {asOf:string|null;tradingDate:string|null;usdPerMT:number;type:string}|null;
  procurementAnalysis: SoybeanProcurementAnalysisData;
  stale?: boolean;
  lastError?: string;
  refreshMetadata?: {lastAttempt?: {id:string;trigger:string;startedAt:string;finishedAt?:string;status:string;observationDate?:string;receivedLatestDate?:string;receivedCount?:number;storedCount?:number;added?:number;revised?:number;error?:string};lastSuccessAt?:string;lastObservationUpdateAt?:string};
}
/** Current display FX rebases every historical USD observation; it is not historical FX. */
export function soybeanDisplayFactor(currency:Currency, fx?:DatedDisplayFx|null):number {
  if(currency==='USD')return 1;
  if(!fx||!/^20\d{2}-\d{2}-\d{2}$/.test(fx.observationDate))return NaN;
  const factor=currency==='KRW'?fx.USD_KRW:1/fx.EUR_USD;
  return Number.isFinite(factor)&&factor>0?factor:NaN;
}
export function parseDatedDisplayFx(body:any, retrievedAt=new Date().toISOString()):DatedDisplayFx|null {
  if(typeof retrievedAt!=='string'||!Number.isFinite(Date.parse(retrievedAt))||body?.base!=='USD'||!/^20\d{2}-\d{2}-\d{2}$/.test(body.date)||!Number.isFinite(Date.parse(body.date))||new Date(body.date).toISOString().slice(0,10)!==body.date||body.date>retrievedAt.slice(0,10)||
    !Number.isFinite(body.rates?.KRW)||body.rates.KRW<=0||!Number.isFinite(body.rates?.EUR)||body.rates.EUR<=0)return null;
  return {sourceUrl:'https://api.frankfurter.dev/v1/latest?base=USD&symbols=KRW,EUR,MYR',observationDate:body.date,retrievedAt,USD_KRW:body.rates.KRW,EUR_USD:1/body.rates.EUR,...(Number.isFinite(body.rates.MYR)&&body.rates.MYR>0?{USD_MYR:body.rates.MYR}:{})};
}

/** Display only: never replaces a stored observation's historical/native FX basis. */
export function displayCurrencyFactor(fromCurrency:string,toCurrency:string,fx:DatedDisplayFx|null|undefined):number {
 if(fromCurrency===toCurrency)return 1;
 const factor=(code:string)=>code==='USD'?1:code==='MYR'?(fx?.USD_MYR??NaN):code==='EUR'||code==='KRW'?soybeanDisplayFactor(code,fx):NaN;
 const from=factor(fromCurrency),to=factor(toCurrency);
 if(!Number.isFinite(from)||from<=0||!Number.isFinite(to)||to<=0)return NaN;
 // EUR-native observations use the same packet's direct EUR/USD cross-rate.
 return fromCurrency==='EUR'&&fx?fx.EUR_USD*to:to/from;
}
export function convertDisplayCurrency(value:number,fromCurrency:string,toCurrency:string,fx:DatedDisplayFx|null):number {
 return Number.isFinite(value)?value*displayCurrencyFactor(fromCurrency,toCurrency,fx):NaN;
}
