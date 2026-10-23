import {useEffect,useState} from 'react';
import {getDatedDisplayFx,subscribeFxRates} from '../services/currencyService';
import type {DatedDisplayFx} from '../utils/soybeanPriceSnapshot';
import type {PotatoExportQuoteResponse} from '../server/officialPotatoComextService';

/** This quote is local to the SCM benchmark card: shares its verified response with the change card, never procurement advice. */
export default function PotatoBenchmarkValue({isSyncing=false,onQuote}:{isSyncing?:boolean;onQuote?:(quote:PotatoExportQuoteResponse)=>void}) {
  const [fx,setFx]=useState(getDatedDisplayFx);
  useEffect(()=>subscribeFxRates(()=>setFx(getDatedDisplayFx())),[]);
  const [quote,setQuote]=useState<PotatoExportQuoteResponse|null>(null);
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    let active=true;
    const controller=new AbortController();
    const load=async()=>{
      try {
        const res=await fetch('/api/starch/potato-export-quote',{cache:'no-store',signal:controller.signal});
        const body:PotatoExportQuoteResponse=await res.json();
        if(!active)return;
        if(body.success&&body.data&&body.data.partner==='KR'&&body.data.reporter==='EU27_2020'&&
           body.data.productCode==='11081300'&&body.data.flow==='2'&&Number.isFinite(body.data.eurPerMT)&&body.data.eurPerMT>0){
          setQuote(body);setFailed(body.refreshFailed);onQuote?.(body);
        }else setFailed(true);
      }catch{if(active)setFailed(true);}
    };
    void load();const timer=setInterval(()=>void load(),30*60*1000);
    return ()=>{active=false;controller.abort();clearInterval(timer);};
  },[isSyncing,onQuote]);
  return <PotatoBenchmarkDisplay quote={quote} failed={failed} fx={fx}/>;
}
/** Use only the same dated official FX packet already validated by currencyService. */
export function potatoEurKrwRate(fx:DatedDisplayFx|null|undefined):number|null {
  if(!fx||!/^20\d{2}-\d{2}-\d{2}$/.test(fx.observationDate)||!Number.isFinite(Date.parse(fx.observationDate))||fx.observationDate>fx.retrievedAt.slice(0,10)||!fx.sourceUrl.startsWith('https://api.frankfurter.dev/'))return null;
  if(!Number.isFinite(fx.USD_KRW)||fx.USD_KRW<=0||!Number.isFinite(fx.EUR_USD)||fx.EUR_USD<=0)return null;
  const rate=fx.USD_KRW*fx.EUR_USD;return Number.isFinite(rate)&&rate>0?rate:null;
}
export function PotatoBenchmarkDisplay({quote,failed=false,fx}:{quote:PotatoExportQuoteResponse|null;failed?:boolean;fx?:DatedDisplayFx|null}) {
  const data=quote?.data,rate=potatoEurKrwRate(fx);
  return <>
    <div className="flex items-baseline gap-1 min-w-0 flex-wrap sm:flex-nowrap">
      <span className="text-lg sm:text-xl font-bold font-mono text-slate-900 whitespace-nowrap">
        {data?(rate?Math.round(data.eurPerMT*rate).toLocaleString('en-US'):data.eurPerMT.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})):'데이터 미확보'}
      </span>
      {data&&<span className="text-[10px] font-normal text-slate-500 font-mono whitespace-nowrap">{rate?'KRW/MT':'EUR/MT'}</span>}
    </div>
    {data&&rate&&fx&&<div data-potato-fx className="text-[11px] text-slate-500 mt-1 leading-tight">
      <span className="font-mono">{data.eurPerMT.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} EUR/MT</span><br/>
      적용 환율: 1 EUR = {rate.toLocaleString('en-US',{maximumFractionDigits:2})} KRW · <a className="hover:underline" href={fx.sourceUrl} target="_blank" rel="noopener noreferrer">{fx.observationDate} (ECB/Frankfurter)</a><br/>
      MoM/YoY: EUR 기준 · 환율 변동 제외
    </div>}
    <p className="text-[11px] text-slate-500 mt-1 leading-tight whitespace-normal break-words">
      평균 수출단가 · 실제 계약가격 아님<br/>
      통계 기준월: {data?.period||'—'}{data?.provisional?' · 잠정치':''}<br/>
      출처: <a className="hover:underline" href="https://ec.europa.eu/eurostat/databrowser/view/DS-045409/default/table?lang=en" target="_blank" rel="noopener noreferrer">Eurostat Comext ↗</a> · EU27 → 한국 · CN 11081300
      {data&&failed&&<span className="block text-slate-500">갱신 실패 · 마지막 검증값 (검증일 {quote?.verifiedAt?.slice(0,10)})</span>}
    </p>
  </>;
}
