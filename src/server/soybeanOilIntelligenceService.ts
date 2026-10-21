/** One durable dated ZL snapshot for page/manual/scheduled price consumers. */
import type {SoybeanOilProcurementAnalysisData} from '../types.ts';
import type {SoybeanOilPriceSnapshot} from '../utils/soybeanOilPriceSnapshot.ts';
import {fetchHistoricalData} from './historicalPriceService.ts';
import {fetchSoybeanOilWorldPsd} from './usdaSoybeanOilLiveService.ts';
import {verifiedSoybeanOilSupply,type SoybeanOilSupplyResult} from '../lib/soybeanOilSupply.ts';
import {observedPriceChanges} from '../utils/observedPriceChanges.ts';
import {centsPerLbToUsdPerMt} from '../utils/commodityConversions.ts';
type History=Awaited<ReturnType<typeof fetchHistoricalData>>;
export function validateSoybeanOilHistory(history:History):History & {fetchedAt:string;quoteUnit:string;priceUnit:string} {
 if(!history.fetchedAt||!Number.isFinite(Date.parse(history.fetchedAt))||!history.success||history.commodity!=='soybean-oil'||!history.symbol.startsWith('ZL=F')||history.quoteUnit!=='US¢/lb'||history.priceUnit!=='USD/MT'||!history.data?.length)throw Error('Invalid CBOT ZL price identity or units');
 const seen=new Set<string>();
 for(const p of history.data){const raw=p.quoteValue;
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(p.date)||!Number.isFinite(Date.parse(p.date))||Date.parse(p.date)>Date.now()||seen.has(p.date)||(p as any).isSynthetic||typeof raw!=='number'||!Number.isFinite(raw)||raw<=0||!Number.isFinite(p.usdPerMT)||p.usdPerMT<=0||Math.abs(centsPerLbToUsdPerMt(raw)-p.usdPerMT)>.02)throw Error('Invalid, duplicate or mismatched dated ZL observation');
  seen.add(p.date);
 }
 if(history.data.some((p,i)=>i>0&&p.date<=history.data[i-1].date))throw Error('Unsorted ZL history');
 return history as History & {fetchedAt:string;quoteUnit:string;priceUnit:string};
}
export function buildSoybeanOilProcurementAnalysis(history:Pick<SoybeanOilPriceSnapshot,'data'|'fetchedAt'|'stale'>,world:SoybeanOilSupplyResult,now=new Date()):SoybeanOilProcurementAnalysisData {
 const latest=history.data.at(-1)!,moves=observedPriceChanges(history.data),wow=moves.wow,usd=latest.usdPerMT;
 const supply=verifiedSoybeanOilSupply(world,now),age=now.getTime()-Date.parse(latest.date),checkedAge=now.getTime()-Date.parse(world.verifiedAt||'');
 const sufficient=!!supply&&!world.refreshFailed&&checkedAge>=0&&checkedAge<=7*86400000&&!(history as any).stale&&age>=0&&age<=5*86400000&&now.getTime()-Date.parse(history.fetchedAt)<=3*86400000&&wow.pct!==null;
 // RMS price-pressure screening, not crop health, inventory adequacy or verified physical cost.
 const level=!sufficient?'자료 부족':wow.pct!>=4?'경계':wow.pct!>=2?'주의':'제한 평가';
 const price=wow.pct===null?'CBOT 주간 비교 미확인':'CBOT 주간 '+(wow.pct>0?'+':'')+wow.pct.toFixed(2)+'%';
 const period=supply?String(supply.rawRecords[0].calendarYear)+'-'+supply.releaseMonth.padStart(2,'0'):undefined;
 const summary=price+' · '+(supply?'USDA 세계 S/U '+supply.stocksToUseRatioPct.toFixed(1)+'% (연간 전망)':'USDA 검증 자료 부족')+(!sufficient?' · 최신 근거 미확인':'');
 const recommendation=!sufficient?'검증 자료 재확인 후 구매 판단':wow.pct!>=4?'견적 확인 후 필수 물량 분할 확보 검토':wow.pct!>=2?'견적 확인 후 분할 구매 검토':wow.pct!<=-2?'견적 재확인 후 분할 매수 검토':'견적·필요 물량 비교 후 분할 구매 검토';
 return {benchmarkPrice:{rawPrice:latest.quoteValue??latest.centsPerBushel,rawUnit:'USc/lb',usdPerMT:usd,observationDate:latest.date,source:'CBOT (ZL=F)'},weeklyChange:{wowPct:wow.pct,absoluteChangeUsdMt:wow.amountUsdMt,direction:wow.amountUsdMt===null?'unavailable':wow.amountUsdMt>0?'up':wow.amountUsdMt<0?'down':'unchanged',previousPriceUsdMt:wow.amountUsdMt===null?null:Number((usd-wow.amountUsdMt).toFixed(2)),calculationBasis:'CBOT ZL=F actual observations ('+(wow.referenceDate||'unavailable')+' → '+latest.date+')'},deskRecommendation:{recommendation,dataInputsUsed:[price,supply?'USDA PSD '+supply.marketYear+'/'+String(+supply.marketYear+1).slice(-2)+' · '+period:'USDA unavailable']},procurementRisk:{level,summarySentenceKo:summary,sourcesUsed:['Yahoo Finance · CBOT ZL=F',...(supply?['USDA FAS PSD']:[])],criteria:'CBOT 주간 상승률 2% 이상 주의 · 4% 이상 경계. 그 외 제한 평가. S/U는 연간 전망 참고값이며 부족·적정 판단 기준이 아닙니다.'},supplyReference:supply?{commodityCode:'4232000',marketYear:supply.marketYear,reportPeriod:period!,verifiedAt:world.verifiedAt!,production1000MT:supply.production1000MT,consumption1000MT:supply.domesticConsumption1000MT,exports1000MT:supply.exports1000MT,endingStocks1000MT:supply.endingStocks1000MT}:undefined};
}
import {randomUUID} from 'node:crypto';
import {SOYBEAN_OIL_HISTORY_FILE,emptySoybeanOilHistory,readSoybeanOilHistory,writeSoybeanOilHistory,mergeSoybeanOilHistory,recordSoybeanOilAttempt,acquireSoybeanOilHistoryLock} from './soybeanOilPriceHistoryStore.ts';
import type {SoybeanOilHistoryState,SoybeanOilRefreshAttempt,SoybeanOilRefreshTrigger} from './soybeanOilPriceHistoryStore.ts';
type OilSources={history:typeof fetchHistoricalData;world:()=>Promise<SoybeanOilSupplyResult>};
export class SoybeanOilIntelligenceService {
 private state:SoybeanOilHistoryState=emptySoybeanOilHistory();
 private pending:Promise<SoybeanOilPriceSnapshot>|null=null;
 private readonly file:string|null;
 private readonly sources:OilSources;
 constructor(sources?:OilSources,options:{file?:string|null}={}){
  this.sources=sources||{history:fetchHistoricalData,world:()=>fetchSoybeanOilWorldPsd(false)};
  this.file=options.file===undefined?(sources?null:SOYBEAN_OIL_HISTORY_FILE()):options.file;
 }
 private async view():Promise<SoybeanOilPriceSnapshot> {
  const snapshot=this.state.snapshot;if(!snapshot)throw Error(this.state.lastAttempt?.error||'No saved Soybean Oil price observations');
  let world:SoybeanOilSupplyResult;try{world=await this.sources.world();}catch(e){world={success:false,status:'unavailable',checkedAt:new Date().toISOString(),refreshFailed:true,message:(e as Error).message};}
  return {...snapshot,procurementAnalysis:buildSoybeanOilProcurementAnalysis(snapshot,world),supplyEvidence:world,refreshMetadata:{lastAttempt:this.state.lastAttempt,lastSuccessAt:this.state.lastSuccessAt,lastObservationUpdateAt:this.state.lastObservationUpdateAt},lastError:this.state.lastAttempt?.error};
 }
 private fresh(){const a=this.state.lastAttempt;if(a?.status==='running')return false;const at=Date.parse(a?.finishedAt||'');return Boolean((this.state.snapshot||a?.status==='failed')&&Number.isFinite(at)&&Date.now()-at>=0&&Date.now()-at<(a?.status==='failed'||a?.status==='partial'?60000:15*60000));}
 async getSoybeanOilPriceSnapshot(force=false,trigger:SoybeanOilRefreshTrigger=force?'manual':'read'):Promise<SoybeanOilPriceSnapshot>{
  if(this.pending)return this.pending;
  this.pending=(async()=>{
   if(this.file)this.state=readSoybeanOilHistory(this.file);
   if(!force&&this.fresh())return this.view();
   const lock=this.file?await acquireSoybeanOilHistoryLock(this.file):null;
   try{
    if(this.file)this.state=readSoybeanOilHistory(this.file);
    if((!force&&this.fresh())||(lock?.waited&&this.state.lastAttempt?.status!=='running'))return this.view();
    const attempt:SoybeanOilRefreshAttempt={id:randomUUID(),trigger,startedAt:new Date().toISOString(),status:'running'};
    this.state.lastAttempt=attempt;
    if(this.file){writeSoybeanOilHistory(this.file,this.state);recordSoybeanOilAttempt(this.file,attempt);}
    try{
     const incoming=await this.sources.history('soybean-oil','5Y',force);
     const merged=mergeSoybeanOilHistory(this.state.snapshot,incoming);
     let error:string|undefined;
     let world:SoybeanOilSupplyResult;try{world=await this.sources.world();}catch(e){world={success:false,status:'unavailable',checkedAt:new Date().toISOString(),refreshFailed:true,message:(e as Error).message};}
     const procurementAnalysis=buildSoybeanOilProcurementAnalysis(merged.history,world);
     if(merged.partial)error='Yahoo response ends before the saved latest observation; longer history retained';
     const finishedAt=new Date().toISOString();Object.assign(attempt,{finishedAt,status:error?'partial':merged.added||merged.revised?'updated':'unchanged',receivedLatestDate:merged.receivedLatestDate,observationDate:merged.history.data.at(-1)!.date,receivedCount:incoming.data.length,storedCount:merged.history.data.length,added:merged.added,revised:merged.revised,error});if(!error)delete attempt.error;
     this.state={...this.state,snapshot:{...merged.history,procurementAnalysis,stale:Boolean(error)},lastAttempt:attempt,lastSuccessAt:finishedAt,lastObservationUpdateAt:merged.added||merged.revised?finishedAt:this.state.lastObservationUpdateAt};
     if(this.file){for(const revision of merged.revisions)recordSoybeanOilAttempt(this.file,{...attempt,revision} as SoybeanOilRefreshAttempt);writeSoybeanOilHistory(this.file,this.state);recordSoybeanOilAttempt(this.file,attempt);}
    }catch(e){Object.assign(attempt,{finishedAt:new Date().toISOString(),status:'failed',error:(e as Error).message,observationDate:this.state.snapshot?.data.at(-1)?.date,storedCount:this.state.snapshot?.data.length||0});this.state.lastAttempt=attempt;if(this.state.snapshot)this.state.snapshot={...this.state.snapshot,stale:true};if(this.file){writeSoybeanOilHistory(this.file,this.state);recordSoybeanOilAttempt(this.file,attempt);}if(!this.state.snapshot)throw e;}
    return this.view();
   }finally{lock?.release();}
  })();try{return await this.pending;}finally{this.pending=null;}
 }
 async getSoybeanOilProcurementAnalysis(force=false){return (await this.getSoybeanOilPriceSnapshot(force)).procurementAnalysis;}
}
export const soybeanOilIntelligenceService=new SoybeanOilIntelligenceService();
