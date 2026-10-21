/** Derived normalization only. Native/imported observations are never rewritten. */
import type {PublicHistory,PublicPricePoint} from './publicPriceHistory.ts';
export type DatedPalmFx={rate:number;rateDate:string;sourceUrl:string;checkedAt:string};
export function selectPalmObservations(history:PublicHistory,benchmark:PublicPricePoint['benchmark']){
  const selected=new Map<string,PublicPricePoint>();
  const rank=(p:PublicPricePoint)=>(p.provenance==='source-verified'?10:0)+(p.sourceUrl==='https://www.investing.com/commodities/palm-oil-historical-data'?2:0);
  for(const point of history.points.filter(p=>p.benchmark===benchmark)){
    const old=selected.get(point.date);if(!old||rank(point)>rank(old))selected.set(point.date,point);
  }
  return [...selected.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
export function normalizedPalmPoint(point:PublicPricePoint,history:PublicHistory){
  if(point.benchmark!=='palm-cpo')return {...point,fxStatus:'native-usd' as const};
  const fx=history.datedFx?.[point.date];
  if(fx)return {...point,usdPerMT:Number((point.value/fx.rate).toFixed(2)),fxStatus:'dated' as const,fxRateDate:fx.rateDate};
  if(point.conversion?.sourceUrl&&point.conversion.observationDate===point.date)
    return {...point,fxStatus:'dated' as const,fxRateDate:point.date};
  return {...point,fxStatus:'legacy-fixed-estimate' as const};
}
export async function refreshPalmDatedFx(history:PublicHistory,fetcher:typeof fetch=fetch):Promise<PublicHistory>{
  const missing=selectPalmObservations(history,'palm-cpo').filter(p=>!history.datedFx?.[p.date]);if(!missing.length)return history;
  const first=new Date(missing[0].date);first.setUTCDate(first.getUTCDate()-7);
  const url=`https://api.frankfurter.dev/v1/${first.toISOString().slice(0,10)}..${missing.at(-1)!.date}?base=USD&symbols=MYR`;
  try{
    const r=await fetcher(url,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('HTTP '+r.status);
    const data=await r.json();if(data.base!=='USD'||!data.rates||typeof data.rates!=='object')throw Error('Invalid USD/MYR history');
    const dates=Object.keys(data.rates).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(data.rates[d]?.MYR)&&data.rates[d].MYR>0).sort();
    const datedFx={...history.datedFx};const checkedAt=new Date().toISOString();
    for(const p of missing){const date=dates.filter(d=>d<=p.date&&Date.parse(p.date)-Date.parse(d)<=7*86400000).at(-1);
      if(date)datedFx[p.date]={rate:data.rates[date].MYR,rateDate:date,sourceUrl:url,checkedAt};}
    return {...history,datedFx,fxError:missing.some(p=>!datedFx[p.date])?'Some observation dates have no verified FX within seven days':undefined};
  }catch(e){return {...history,fxError:'Dated USD/MYR unavailable: '+String((e as Error).message)};}
}
