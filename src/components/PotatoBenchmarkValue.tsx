import {mapCommodityForDisplay,commodityBenchmarkDisplay} from '../services/commodityQuoteSource';
import type {Commodity} from '../types';
import type {Currency} from '../types';
import type {DatedDisplayFx} from '../utils/soybeanPriceSnapshot';
import type {PotatoExportQuoteResponse} from '../server/officialPotatoComextService';

export {potatoEurKrwRate,potatoDisplayConversion} from '../services/currencyService';

/** Display the same parent-owned saved publication as the Overview card. */
export default function PotatoBenchmarkValue({quote,currency='KRW',fx}:{quote:PotatoExportQuoteResponse|null;currency?:Currency;fx?:DatedDisplayFx|null}) {
 return <PotatoBenchmarkDisplay quote={quote} currency={currency} fx={fx}/>;
}
export function PotatoBenchmarkDisplay({quote,failed=false,fx,currency='KRW'}:{currency?:Currency;quote:PotatoExportQuoteResponse|null;failed?:boolean;fx?:DatedDisplayFx|null}) {
  const data=quote?.data;
  const display=commodityBenchmarkDisplay(mapCommodityForDisplay({id:'potato-starch',price:0,_potatoExportQuote:quote||undefined} as Commodity,currency,fx||null),currency);
  return <div className="flex items-baseline gap-1 min-w-0 flex-wrap sm:flex-nowrap">
    <span className="text-lg sm:text-xl font-bold font-mono text-slate-900 whitespace-nowrap">
      {display.value}
    </span>
    {data&&<span className="text-[10px] font-normal text-slate-500 font-mono whitespace-nowrap">{display.unit}</span>}
  </div>;
}
