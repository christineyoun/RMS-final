export type PalmObservation={date:string;cpoUsd?:number;usdPerMT?:number;oleinUsd?:number;oleinUsdPerMt?:number;isSynthetic?:boolean};
export const palmUsd=(p:PalmObservation,benchmark:'cpo'|'olein'):number=>
  benchmark==='cpo'?(p.cpoUsd??p.usdPerMT??NaN):(p.oleinUsd??p.oleinUsdPerMt??NaN);
export function latestCommonPalmSpread(rows:PalmObservation[]){
  return [...rows].filter(p=>!p.isSynthetic&&Date.parse(p.date)<=Date.now()&&Number.isFinite(palmUsd(p,'cpo'))&&Number.isFinite(palmUsd(p,'olein')))
    .sort((a,b)=>a.date.localeCompare(b.date)).map(p=>({date:p.date,usdPerMT:Number((palmUsd(p,'olein')-palmUsd(p,'cpo')).toFixed(2))})).at(-1)??null;
}
/** Position in the saved daily closing-price range, not a statistical percentile
 * or the publisher's intraday high/low range. No invented range bounds. */
export function palmClosingRange(rows:PalmObservation[],benchmark:'cpo'|'olein',now=Date.now()){
  const points=rows.filter(p=>!p.isSynthetic&&/^\d{4}-\d{2}-\d{2}$/.test(p.date)&&Date.parse(p.date)<=now&&Date.parse(p.date)>=now-365*86400000&&palmUsd(p,benchmark)>0&&Number.isFinite(palmUsd(p,benchmark)))
    .sort((a,b)=>a.date.localeCompare(b.date));
  if(!points.length)return null;
  const prices=points.map(p=>palmUsd(p,benchmark));const low=Math.min(...prices),high=Math.max(...prices),current=prices.at(-1)!;
  return {low,high,current,asOf:points.at(-1)!.date,observations:points.length,pct:high===low?50:Math.max(0,Math.min(100,Math.round((current-low)/(high-low)*100)))};
}
