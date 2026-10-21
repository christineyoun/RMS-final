/** Source-verifiable Soybean procurement screening. No hardcoded prices, stocks or risk statuses. */
import type { SoybeanProcurementAnalysisData } from '../types.ts';
import { fetchHistoricalData } from './historicalPriceService.ts';
import { fetchOtherCommodityWorldPsd } from './usdaOtherCommoditiesLiveService.ts';
import { observedPriceChanges } from '../utils/observedPriceChanges.ts';

import {SOYBEAN_HISTORY_FILE,emptySoybeanHistory,readSoybeanHistory,writeSoybeanHistory,recordSoybeanAttempt,mergeSoybeanHistory,acquireSoybeanHistoryLock} from './soybeanPriceHistoryStore.ts';
import type {SoybeanHistoryState,SoybeanRefreshTrigger,SoybeanRefreshAttempt} from './soybeanPriceHistoryStore.ts';
import {randomUUID} from 'node:crypto';
import type { SoybeanPriceSnapshot } from '../utils/soybeanPriceSnapshot.ts';
export function buildSoybeanProcurementAnalysis(history:Pick<SoybeanPriceSnapshot,'success'|'data'>,world:Awaited<ReturnType<typeof fetchOtherCommodityWorldPsd>>,now=Date.now()):SoybeanProcurementAnalysisData {
      const dated = (history.data || []).filter((p: any) =>
        !p.isSynthetic && /^20\d{2}-\d{2}-\d{2}$/.test(p.date || '') &&
        Number.isFinite(p.usdPerMT) && p.usdPerMT > 0 && Number.isFinite(p.centsPerBushel) && p.centsPerBushel > 0
      ).sort((a,b)=>a.date.localeCompare(b.date));
      if (!history.success || !dated.length) throw new Error('No verified dated CBOT soybean observation');
      const latest = dated.at(-1)!;
      const moves = observedPriceChanges(dated.map(p => ({date:p.date,usdPerMT:p.usdPerMT})));
      const wow = moves.wow;
      const previousPrice = wow.amountUsdMt === null ? null : Number((latest.usdPerMT - wow.amountUsdMt).toFixed(2));
      const ageDays = (now-Date.parse(latest.date+'T00:00:00Z'))/86400000;
      const freshPrice = ageDays>=-1 && ageDays<=8;

      // A separate authenticated/last-verified world snapshot. The legacy generic
      // USDA FAS service may silently substitute sample data, so never use it here.
      const official = world.success && (world.status==='live-verified'||world.status==='last-verified') ? world.data : undefined;
      const stocks = official && official.domesticConsumption1000MT>0 && official.endingStocks1000MT>=0
        ? 100*official.endingStocks1000MT/official.domesticConsumption1000MT : null;
      const stockRatio = stocks===null ? null : Number(stocks.toFixed(1));
      const stockEvidence = world.status === 'live-verified' ? 'USDA FAS PSD (live-verified)' : 'USDA FAS PSD (last-verified)';
      const sufficient = freshPrice && wow.pct!==null && stockRatio!==null;
      const priceTrend = wow.pct===null ? '전주 비교 자료 없음' : `주간 ${wow.pct>0?'+':''}${wow.pct.toFixed(2)}%`;
      let level: SoybeanProcurementAnalysisData['procurementRisk']['level'] = '자료 부족';
      if (sufficient) level = (stockRatio!<22 || wow.pct!>4) ? '경계' : (stockRatio!<25 || wow.pct!>2) ? '주의' : '안정';
      const summarySentenceKo = !sufficient
        ? `검증 가능한 최신 시세·전주 변화율·USDA 수급 자료 중 일부가 부족합니다 (${priceTrend}). 현물 오퍼 확인 전 위험 수준을 확정하지 않습니다.`
        : `USDA 글로벌 대두 재고율 ${stockRatio!.toFixed(1)}% · CBOT ${priceTrend}. 원산지별 작황과 FOB 오퍼, 운임, 환율을 별도 확인해야 합니다.`;
      const recommendation = !sufficient
        ? '검증 자료 부족 · 승인 공급사 오퍼·운임·환율 확인 전 매입 결정 보류'
        : wow.pct!<=-2
        ? '선물 시세 하락 확인 · 실제 FOB 오퍼·운임·환율 비교 후 분할 매수 검토'
        : wow.pct!>=3
        ? '선물 가격 급등 확인 · 현물 오퍼와 공급 위험 확인 후 매입 규모 결정'
        : '현물 오퍼·운임·환율 및 재고 커버리지 비교 후 분할 구매 검토';
      const result:SoybeanProcurementAnalysisData = {
        benchmarkPrice: {rawPrice:latest.centsPerBushel,rawUnit:'cents/bushel',usdPerMT:latest.usdPerMT,
          observationDate:latest.date,source:'CBOT (ZS=F)'},
        weeklyChange: {wowPct:wow.pct,absoluteChangeUsdMt:wow.amountUsdMt,
          direction:wow.amountUsdMt===null?'unavailable':wow.amountUsdMt>0?'up':wow.amountUsdMt<0?'down':'unchanged',
          previousPriceUsdMt:previousPrice,calculationBasis:wow.referenceDate
            ? `CBOT ZS=F actual observations (${wow.referenceDate} → ${latest.date})` : 'No verified weekly comparison'},
        deskRecommendation: {recommendation,dataInputsUsed: [
          `CBOT ZS=F ${latest.date} USD/MT`,priceTrend,
          stockRatio===null?'USDA world PSD: unavailable':`${stockEvidence} (S/U ${stockRatio.toFixed(1)}%)`]},
        procurementRisk: {level,summarySentenceKo,sourcesUsed: ['CBOT (ZS=F)',stockRatio===null?'USDA world PSD unavailable':stockEvidence]}
      };
      return result;
}

export class SoybeanIntelligenceService {
  private static instance: SoybeanIntelligenceService;
  private state:SoybeanHistoryState=emptySoybeanHistory();
  private pending:Promise<SoybeanPriceSnapshot>|null=null;
  private readonly file:string|null;
  private readonly sources:{history:typeof fetchHistoricalData;world:typeof fetchOtherCommodityWorldPsd};
  constructor(sources?:{history:typeof fetchHistoricalData;world:typeof fetchOtherCommodityWorldPsd},options:{file?:string|null}={}) {
    this.sources=sources||{history:fetchHistoricalData,world:fetchOtherCommodityWorldPsd};
    // Injected offline adapters are memory-only unless an isolated test store is supplied.
    this.file=options.file===undefined?(sources?null:SOYBEAN_HISTORY_FILE()):options.file;
  }
  public static getInstance():SoybeanIntelligenceService {return this.instance??(this.instance=new SoybeanIntelligenceService());}
  private view():SoybeanPriceSnapshot {
    if(!this.state.snapshot)throw Error(this.state.lastAttempt?.error||'No saved Soybean price observations');
    const {lastAttempt,lastSuccessAt,lastObservationUpdateAt}=this.state;
    const old=this.state.snapshot;
    const procurementAnalysis=this.state.world?buildSoybeanProcurementAnalysis(old,this.state.world):old.procurementAnalysis;
    return {...old,procurementAnalysis:old.stale?{...procurementAnalysis,procurementRisk:{...procurementAnalysis.procurementRisk,
      level:'자료 부족',summarySentenceKo:'최신 자료 갱신 실패 · 직전 조달 분석은 참고용입니다. 실매입 판단 전 재확인이 필요합니다.'}}:procurementAnalysis,
      refreshMetadata:{lastAttempt,lastSuccessAt,lastObservationUpdateAt},lastError:lastAttempt?.error};
  }
  private fresh(){
    const attempt=this.state.lastAttempt;
    if(attempt?.status==='running')return false;
    const checked=Date.parse(attempt?.finishedAt||'');
    return Boolean((this.state.snapshot||attempt?.status==='failed')&&Number.isFinite(checked)&&Date.now()-checked>=0&&Date.now()-checked<(attempt?.status==='failed'||attempt?.status==='partial'?60_000:15*60_000));
  }
  public async getSoybeanPriceSnapshot(force=false,trigger:SoybeanRefreshTrigger=force?'manual':'read'):Promise<SoybeanPriceSnapshot> {
    if(this.pending)return this.pending;
    this.pending=(async()=>{
      if(this.file)this.state=readSoybeanHistory(this.file);
      if(!force&&this.fresh())return this.view();
      const lock=this.file?await acquireSoybeanHistoryLock(this.file):null;
      try {
        if(this.file)this.state=readSoybeanHistory(this.file);
        if((!force&&this.fresh())||(lock?.waited&&this.state.lastAttempt?.status!=='running'))return this.view();
        const attempt:SoybeanRefreshAttempt={id:randomUUID(),trigger,startedAt:new Date().toISOString(),status:'running'};
        this.state.lastAttempt=attempt;
        if(this.file){writeSoybeanHistory(this.file,this.state);recordSoybeanAttempt(this.file,attempt);}
        try {
          const incoming=await this.sources.history('soybean','5Y',force);
          const merged=mergeSoybeanHistory(this.state.snapshot,incoming);
          let world=this.state.world;let worldError:string|undefined;
          try{world=await this.sources.world('soybean',false);}catch(e){worldError='USDA supply verification failed: '+(e as Error).message;}
          world=world||{success:false,status:'unavailable',checkedAt:new Date().toISOString()};
          const procurementAnalysis=buildSoybeanProcurementAnalysis(merged.history,world);
          const finishedAt=new Date().toISOString();
          const error=merged.partial?'Yahoo response ends before the saved latest observation; longer history retained':worldError;
          Object.assign(attempt,{finishedAt,status:error?'partial':merged.added||merged.revised?'updated':'unchanged',
            receivedLatestDate:merged.receivedLatestDate,observationDate:merged.history.data.at(-1)!.date,
            receivedCount:incoming.data.length,storedCount:merged.history.data.length,added:merged.added,revised:merged.revised,error});
          if(!error)delete attempt.error;
          this.state={...this.state,snapshot:{...merged.history,procurementAnalysis,stale:Boolean(error)},world,lastAttempt:attempt,
            lastSuccessAt:finishedAt,lastObservationUpdateAt:merged.added||merged.revised?finishedAt:this.state.lastObservationUpdateAt};
          if(this.file){
            // Record exact before/after corrections without discarding any source-backed history.
            for(const revision of merged.revisions)recordSoybeanAttempt(this.file,{...attempt,...{revision}} as SoybeanRefreshAttempt);
            writeSoybeanHistory(this.file,this.state);recordSoybeanAttempt(this.file,attempt);
          }
        }catch(e){
          Object.assign(attempt,{finishedAt:new Date().toISOString(),status:'failed',error:(e as Error).message,
            observationDate:this.state.snapshot?.data.at(-1)?.date,storedCount:this.state.snapshot?.data.length||0});
          this.state.lastAttempt=attempt;
          if(this.state.snapshot)this.state.snapshot={...this.state.snapshot,stale:true};
          if(this.file){writeSoybeanHistory(this.file,this.state);recordSoybeanAttempt(this.file,attempt);}
          if(!this.state.snapshot)throw e;
        }
        return this.view();
      }finally{lock?.release();}
    })();
    try{return await this.pending;}finally{this.pending=null;}
  }
  public async getSoybeanProcurementAnalysis(force=false):Promise<SoybeanProcurementAnalysisData> {
    return (await this.getSoybeanPriceSnapshot(force)).procurementAnalysis;
  }
}
export const soybeanIntelligenceService=SoybeanIntelligenceService.getInstance();
