/** Estimated cost conversion only. Never an execution or prepaid-balance gate. */
import fs from 'node:fs';import path from 'node:path';
import {parseDatedDisplayFx} from '../utils/soybeanPriceSnapshot.ts';
export type KrwBudgetPolicy={fxFloorKrwPerUsd:number;fxSafetyMarginPct:number};
export function savedGeminiBudget(policy:KrwBudgetPolicy,root=process.cwd(),now=new Date()){
 let fx:ReturnType<typeof parseDatedDisplayFx>=null;
 try{const saved=JSON.parse(fs.readFileSync(path.join(root,'.rms-stage3/free-fx.json'),'utf8'));fx=parseDatedDisplayFx(saved.raw,saved.verifiedAt);}catch{/* Missing FX affects telemetry only. */}
 if(fx&&(Date.parse(fx.observationDate)>+now||+now-Date.parse(fx.observationDate)>7*86400000||Date.parse(fx.retrievedAt)>+now))fx=null;
 const safetyKrwPerUsd=fx?Math.ceil(Math.max(policy.fxFloorKrwPerUsd,fx.USD_KRW)*(1+policy.fxSafetyMarginPct/100)*100)/100:null;
 return {fxDate:fx?.observationDate??null,verifiedUsdKrw:fx?.USD_KRW??null,fxFloorKrwPerUsd:policy.fxFloorKrwPerUsd,fxSafetyMarginPct:policy.fxSafetyMarginPct,safetyKrwPerUsd};
}
