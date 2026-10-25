import {useEffect,useState} from 'react';
import type {Currency} from '../types';
import type {DatedDisplayFx} from '../utils/soybeanPriceSnapshot';
import {getDatedDisplayFx,subscribeFxRates} from '../services/currencyService';
import {potatoDisplayConversion} from '../services/currencyService';
import {prefixCurrency} from '../utils/currencyFormatting';
import type {PotatoExportChange,PotatoExportQuoteResponse} from '../server/officialPotatoComextService';
/** Calendar-month trade unit values in EUR/MT. Never changes risk/advice inputs. */
export function PotatoPriceChanges({quote,currency='KRW'}:{quote:PotatoExportQuoteResponse|null;currency?:Currency}) {
  const [fx,setFx]=useState(getDatedDisplayFx);
  useEffect(()=>subscribeFxRates(()=>setFx(getDatedDisplayFx())),[]);
  return <PotatoPriceChangesDisplay quote={quote} currency={currency} fx={fx}/>;
}
export function PotatoPriceChangesDisplay({quote,currency='KRW',fx}:{quote:PotatoExportQuoteResponse|null;currency?:Currency;fx?:DatedDisplayFx|null}) {
  const {displayCurrency,factor,symbol}=potatoDisplayConversion(currency,fx);
  const render=(label:string,c:PotatoExportChange|undefined,first=false)=>{
    const available=c?.pct!=null&&Number.isFinite(c.pct)&&c.amountEurPerMT!=null&&Number.isFinite(c.amountEurPerMT);
    return <div className={first?'border-r border-slate-200/80 pr-2':'pl-1'}>
      <span className="text-[10px] font-medium text-slate-400 block font-sans">{label}</span>
      {available?<>
        <div className={`flex items-center gap-0.5 font-mono text-xs sm:text-sm font-bold mt-0.5 ${c.pct! === 0?'text-slate-500':c.pct!>0?'text-[#059669]':'text-[#DF0029]'}`}>
          <span className="material-symbols-outlined text-[14px]">{c.pct! === 0?'remove':c.pct!>0?'arrow_upward':'arrow_downward'}</span>
          <span>{c.pct!>=0?'+':''}{c.pct!.toFixed(2)}%</span>
        </div>
        <span className="text-[10px] font-mono text-slate-400 block mt-0.5 whitespace-nowrap">
          {c.amountEurPerMT!>=0?'+':'−'}{prefixCurrency(displayCurrency==='KRW'?Math.round(Math.abs(c.amountEurPerMT!*factor)).toLocaleString('en-US'):Math.abs(c.amountEurPerMT!*factor).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}),symbol)}
        </span>
      </>:<div className="font-mono text-xs sm:text-sm font-bold text-slate-400 mt-0.5" aria-description="해당 월의 수출금액·순중량 자료 미확보">확인 불가</div>}
    </div>;
  };
  return <>
    <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400 block mb-1">시세 변동률 (MoM / YoY)</span>
    <div className="grid grid-cols-2 gap-2 items-center pt-0.5">
      {render('전월 (MoM)',quote?.changes?.mom,true)}
      {render('전년 동월 (YoY)',quote?.changes?.yoy)}
    </div>
  </>;
}
