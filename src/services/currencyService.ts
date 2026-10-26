import type {Currency} from '../types';
import {displayCurrencyFactor,parseDatedDisplayFx,type DatedDisplayFx} from '../utils/soybeanPriceSnapshot';
let datedDisplayFx:DatedDisplayFx|null=null;
export const getDatedDisplayFx=()=>datedDisplayFx;
export interface FXRates {
  USD_KRW: number;
  EUR_USD: number;
  USD_MYR: number;
  EUR_KRW?: number;
  [key: string]: number | undefined;
}

type FXListener = (rates: FXRates) => void;

let cacheFxRates: FXRates = Object.freeze({
  USD_KRW: 0,
  EUR_USD: 0,
  USD_MYR: 0,
});

const listeners: Set<FXListener> = new Set();

export function subscribeFxRates(listener: FXListener): () => void {
  listeners.add(listener);
  listener(cacheFxRates); // Emit current cached rates immediately
  return () => {
    listeners.delete(listener);
  };
}

function publishDatedFx(fx:DatedDisplayFx):void {
 datedDisplayFx=Object.freeze(fx);
 cacheFxRates=Object.freeze({USD_KRW:fx.USD_KRW,EUR_USD:fx.EUR_USD,USD_MYR:fx.USD_MYR??0});
 listeners.forEach(listener=>listener(cacheFxRates));
}

export function getAllFxRates(): FXRates {
  return cacheFxRates;
}

export function getLiveExchangeRate(pair: string = 'USD_MYR'): number {
  if (pair === 'USD_MYR' || pair === 'MYR') {
    return cacheFxRates.USD_MYR || 0;
  }
  if (pair === 'USD_KRW' || pair === 'KRW') {
    return cacheFxRates.USD_KRW || 0;
  }
  if (pair === 'EUR_USD' || pair === 'EUR') {
    return cacheFxRates.EUR_USD || 0;
  }
  return cacheFxRates[pair] || 0;
}

/**
 * Dynamically fetches live FX rates from the pipeline telemetry endpoint or Frankfurter API.
 */
let lastAttemptAt = 0;
let pendingFx: Promise<FXRates> | null = null;
export function fetchLiveFxRates(force = false): Promise<FXRates> {
  if (pendingFx) return pendingFx;
  if (!force && Date.now() - lastAttemptAt < 15 * 60_000) return Promise.resolve(cacheFxRates);
  lastAttemptAt = Date.now();
  pendingFx = fetchFxNow().finally(() => { pendingFx = null; });
  return pendingFx;
}
async function fetchFxNow():Promise<FXRates>{
 try{
  const r=await fetch('/api/rms/free-fx',{cache:'no-store'});
  if(!r.ok)throw Error('Saved FX unavailable');
  const saved=await r.json(),fx=parseDatedDisplayFx(saved.raw,saved.verifiedAt);
  if(!fx)throw Error('Saved FX invalid');
  publishDatedFx(fx);
 }catch{
  // Preserve original dates and numeric rates, explicitly identify retained FX.
  if(datedDisplayFx)publishDatedFx({...datedDisplayFx,stale:true});
 }
 return cacheFxRates;
}

/** Use only the same dated official FX packet already validated by currencyService. */
export function potatoEurKrwRate(fx:DatedDisplayFx|null|undefined):number|null {
  if(!fx||!/^20\d{2}-\d{2}-\d{2}$/.test(fx.observationDate)||!Number.isFinite(Date.parse(fx.observationDate))||fx.observationDate>fx.retrievedAt.slice(0,10)||!fx.sourceUrl.startsWith('https://api.frankfurter.dev/'))return null;
  if(!Number.isFinite(fx.USD_KRW)||fx.USD_KRW<=0||!Number.isFinite(fx.EUR_USD)||fx.EUR_USD<=0)return null;
  const rate=displayCurrencyFactor('EUR','KRW',fx);return Number.isFinite(rate)&&rate>0?rate:null;
}
export function potatoDisplayConversion(currency:Currency,fx:DatedDisplayFx|null|undefined) {
  const validFx=potatoEurKrwRate(fx)!==null;
  const displayCurrency:Currency=currency==='EUR'||validFx?currency:'EUR';
  const factor=displayCurrencyFactor('EUR',displayCurrency,fx);
  const symbol=displayCurrency==='KRW'?'₩':displayCurrency==='USD'?'$':'€';
  return {displayCurrency,factor,symbol};
}
