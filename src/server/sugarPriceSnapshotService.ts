/** Task 1: shared in-memory snapshot only. No persistent ingestion or scheduler. */
import {fetchHistoricalData} from './historicalPriceService.ts';
import {centsPerLbToUsdPerMt} from '../utils/commodityConversions.ts';
import {observedPriceChanges} from '../utils/observedPriceChanges.ts';
import type {SugarPriceSnapshot} from '../utils/sugarPriceSnapshot.ts';
type History=Awaited<ReturnType<typeof fetchHistoricalData>>;
export function validateSugarHistory(h:History){
 if(!h.success||h.commodity!=='sugar'||!/^SB=F(?:\s|$)/.test(h.symbol)||h.quoteUnit!=='US¢/lb'||h.priceUnit!=='USD/MT'||!h.fetchedAt||!Number.isFinite(Date.parse(h.fetchedAt))||Date.parse(h.fetchedAt)>Date.now()||!h.data?.length)throw Error('Invalid ICE SB sugar identity, units or retrieval date');
 for(const [i,p]of h.data.entries())if(!/^20\d{2}-\d{2}-\d{2}$/.test(p.date)||!Number.isFinite(Date.parse(p.date))||new Date(p.date).toISOString().slice(0,10)!==p.date||Date.parse(p.date)>Date.now()||(i>0&&p.date<=h.data[i-1].date)||(p as any).isSynthetic||typeof p.quoteValue!=='number'||!Number.isFinite(p.quoteValue)||p.quoteValue<=0||!Number.isFinite(p.usdPerMT)||Math.abs(centsPerLbToUsdPerMt(p.quoteValue)-p.usdPerMT)>.02)throw Error('Invalid, duplicate or mismatched dated SB observation');
 return h;
}
export class SugarPriceSnapshotService{
 private saved:SugarPriceSnapshot|null=null;private pending:Promise<SugarPriceSnapshot>|null=null;private checkedAt=0;
 constructor(private history:typeof fetchHistoricalData=fetchHistoricalData){}
 async getSnapshot(force=false):Promise<SugarPriceSnapshot>{
  if(this.pending)return this.pending;
  if(!force&&this.saved&&Date.now()-this.checkedAt<(this.saved.stale?60000:900000))return structuredClone(this.saved);
  this.pending=(async()=>{try{const h=validateSugarHistory(await this.history('sugar','5Y',force));const p=h.data.at(-1)!;this.saved={...h,quoteUnit:h.quoteUnit!,priceUnit:h.priceUnit!,fetchedAt:h.fetchedAt!,priceInputs:{benchmark:'ICE:SB=F',observationDate:p.date,rawPrice:p.quoteValue!,rawUnit:'US¢/lb',usdPerMT:p.usdPerMT,comparisons:observedPriceChanges(h.data)}};this.checkedAt=Date.now();return structuredClone(this.saved);}catch(e){this.checkedAt=Date.now();if(!this.saved)throw e;this.saved={...this.saved,stale:true,lastError:(e as Error).message};return structuredClone(this.saved);}})();
  try{return await this.pending;}finally{this.pending=null;}
 }
}
export const sugarPriceSnapshotService=new SugarPriceSnapshotService();
