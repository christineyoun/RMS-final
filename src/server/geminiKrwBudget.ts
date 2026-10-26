/** Budget policy conversion, not a market FX quote or dashboard calculation. */
import fs from 'node:fs';import path from 'node:path';
import {parseDatedDisplayFx} from '../utils/soybeanPriceSnapshot.ts';
export const MAX_GEMINI_DAILY_KRW=5000;
export type KrwBudgetPolicy={maxDailyEstimatedKrw:number;fxFloorKrwPerUsd:number;fxSafetyMarginPct:number};
export function savedGeminiBudget(policy:KrwBudgetPolicy,root=process.cwd(),now=new Date()){
 if(!Number.isFinite(policy.maxDailyEstimatedKrw)||policy.maxDailyEstimatedKrw<=0||policy.maxDailyEstimatedKrw>MAX_GEMINI_DAILY_KRW||!Number.isFinite(policy.fxFloorKrwPerUsd)||policy.fxFloorKrwPerUsd<1500||!Number.isFinite(policy.fxSafetyMarginPct)||policy.fxSafetyMarginPct<20)throw Error('Gemini KRW budget or safety margin invalid');
 const saved=JSON.parse(fs.readFileSync(path.join(root,'.rms-stage3/free-fx.json'),'utf8')),fx=parseDatedDisplayFx(saved.raw,saved.verifiedAt);
 if(!fx||Date.parse(fx.observationDate)>+now||+now-Date.parse(fx.observationDate)>7*86400000||Date.parse(fx.retrievedAt)>+now)throw Error('Verified dated budget FX unavailable/stale; paid calls disabled');
 const safetyKrwPerUsd=Math.ceil(Math.max(policy.fxFloorKrwPerUsd,fx.USD_KRW)*(1+policy.fxSafetyMarginPct/100)*100)/100;
 const maxEstimatedUsd=Math.floor(policy.maxDailyEstimatedKrw/safetyKrwPerUsd*100)/100;
 return {maxDailyEstimatedKrw:policy.maxDailyEstimatedKrw,fxDate:fx.observationDate,verifiedUsdKrw:fx.USD_KRW,fxFloorKrwPerUsd:policy.fxFloorKrwPerUsd,fxSafetyMarginPct:policy.fxSafetyMarginPct,safetyKrwPerUsd,maxEstimatedUsd};
}
