import type {PotatoExportChange,PotatoExportQuoteResponse} from '../server/officialPotatoComextService';
/** Calendar-month trade unit values in EUR/MT. Never changes risk/advice inputs. */
export function PotatoPriceChanges({quote}:{quote:PotatoExportQuoteResponse|null}) {
  const render=(label:string,c:PotatoExportChange|undefined,first=false)=>{
    const available=c?.pct!=null&&Number.isFinite(c.pct)&&c.amountEurPerMT!=null&&Number.isFinite(c.amountEurPerMT);
    return <div className={first?'border-r border-slate-200/80 pr-2':'pl-1'}>
      <span className="text-[10px] font-medium text-slate-400 block font-sans">{label}</span>
      {available?<>
        <div className={`flex items-center gap-0.5 font-mono text-xs sm:text-sm font-bold mt-0.5 ${c.pct! === 0?'text-slate-500':c.pct!>0?'text-[#059669]':'text-[#DF0029]'}`}>
          <span className="material-symbols-outlined text-[14px]">{c.pct! === 0?'remove':c.pct!>0?'arrow_upward':'arrow_downward'}</span>
          <span>{c.pct!>=0?'+':''}{c.pct!.toFixed(2)}%</span>
        </div>
        <span className="text-[10px] font-mono text-slate-400 block mt-0.5">{c.amountEurPerMT!>=0?'+':'−'}{Math.abs(c.amountEurPerMT!).toFixed(2)} EUR/MT</span>
      </>:<div className="font-mono text-xs sm:text-sm font-bold text-slate-400 mt-0.5" title="해당 월의 수출금액·순중량 자료 미확보">확인 불가</div>}
      <span className="text-[10px] font-mono text-slate-400 block mt-0.5" title="비교월 → 최신 통계월">{c?.referencePeriod||'—'} → {c?.currentPeriod||quote?.data?.period||'—'}</span>
      {available&&c.provisional&&<span className="text-[10px] text-slate-400">잠정치 포함</span>}
    </div>;
  };
  return <>
    <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400 block mb-1">시세 변동률 (YoY / MoM)</span>
    <div className="grid grid-cols-2 gap-2 items-center pt-0.5">
      {render('전년 동월 (YoY)',quote?.changes?.yoy,true)}
      {render('전월 (MoM)',quote?.changes?.mom)}
    </div>
    {quote?.refreshFailed&&<span className="text-[10px] text-slate-500 mt-1">갱신 실패 · 마지막 검증값</span>}
  </>;
}
