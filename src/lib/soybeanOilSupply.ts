/** Oil-specific PSD world records; no baselines, network, prices or crop-stat substitutions. */
import type {UsdaWheatWorldSummary,UsdaPsdRawRecord} from '../server/usdaFasService';
export type SoybeanOilSupplyResult={success:boolean;status:'live-verified'|'last-verified'|'unavailable';data?:UsdaWheatWorldSummary;verifiedAt?:string;checkedAt:string;marketYear?:string;message?:string;refreshFailed?:boolean};
export const soybeanOilMarketingYear=(now=new Date())=>now.getUTCMonth()>=9?now.getUTCFullYear():now.getUTCFullYear()-1;
export function parseSoybeanOilSupply(input:unknown,year=soybeanOilMarketingYear(),now=new Date(),historical=false):UsdaWheatWorldSummary|null {
 const rows=(Array.isArray(input)?input:(input as any)?.data) as UsdaPsdRawRecord[];if(!Array.isArray(rows)||!rows.length||(historical?year<2010||year>=soybeanOilMarketingYear(now):year!==soybeanOilMarketingYear(now)))return null;
 const attrs=new Map<number,number>(),periods=new Set<string>();
 for(const r of rows){if(!r||r.commodityCode!=='4232000'||r.countryCode!=='00'||Number(r.marketYear)!==year||!/^20\d{2}$/.test(String(r.calendarYear))||!Number.isInteger(Number(r.month))||Number(r.month)<1||Number(r.month)>12||typeof r.value!=='number'||!Number.isFinite(r.value)||r.value<0)return null;
  const period=String(r.calendarYear)+'-'+String(r.month).padStart(2,'0');periods.add(period);
  if([7,20,28,57,86,88,125,176,178].includes(r.attributeId)){if(r.unitId!==8||attrs.has(r.attributeId)&&attrs.get(r.attributeId)!==r.value)return null;attrs.set(r.attributeId,r.value);}
 }
 if(periods.size!==1)return null;const period=[...periods][0];if(period>now.toISOString().slice(0,7))return null;
 if([28,125,88,176,20,57,86,178].some(a=>!attrs.has(a)))return null;
 const get=(a:number)=>attrs.get(a)!,production=get(28),consumption=get(125),stocks=get(176),exports=get(88),beginning=get(20),imports=get(57),supply=get(86);
 if(!production||!consumption||Math.abs(supply-get(178))>2||Math.abs(supply-(beginning+production+imports))>2||Math.abs(get(178)-(consumption+exports+stocks))>2)return null;
 return {commodityCode:'4232000',marketYear:String(year),releaseMonth:period.slice(-2),source:'USDA FAS PSD Online',production1000MT:production,productionMMT:production/1000,domesticConsumption1000MT:consumption,domesticConsumptionMMT:consumption/1000,endingStocks1000MT:stocks,endingStocksMMT:stocks/1000,beginningStocks1000MT:beginning,beginningStocksMMT:beginning/1000,imports1000MT:imports,exports1000MT:exports,exportsMMT:exports/1000,totalSupply1000MT:supply,stocksToUseRatio:Math.round(stocks/consumption*1000)/10,stocksToUseRatioPct:Math.round(stocks/consumption*1000)/10,rawRecordsCount:rows.length,rawRecords:rows.map(r=>({...r})),executiveBrief:`USDA PSD ${year}/${String(year+1).slice(-2)} · ${period} 세계 대두유 연간 전망. 기말재고 전망은 실제 월간 재고 변동이나 재고 적정성을 뜻하지 않습니다.`};
}
export function verifiedSoybeanOilSupply(result:SoybeanOilSupplyResult|undefined,now=new Date()):UsdaWheatWorldSummary|null {
 if(!result?.success||!['live-verified','last-verified'].includes(result.status)||!result.verifiedAt)return null;const age=now.getTime()-Date.parse(result.verifiedAt);if(!Number.isFinite(age)||age<0||age>45*86400000)return null;
 const data=parseSoybeanOilSupply(result.data?.rawRecords,soybeanOilMarketingYear(now),now);if(!data||result.data?.commodityCode!=='4232000'||Number(result.data.marketYear)!==soybeanOilMarketingYear(now))return null;
 const report=String(data.rawRecords[0].calendarYear)+'-'+String(data.releaseMonth).padStart(2,'0');if(now.getTime()-Date.parse(report+'-01')>62*86400000)return null;
 return data;
}
export function soybeanOilCrushIndicators(data:UsdaWheatWorldSummary){const crush=data.rawRecords.find(r=>r.attributeId===7&&r.unitId===8)?.value;return {crush1000MT:crush&&crush>0?crush:undefined,oilCrushRatioPct:crush&&crush>0?data.production1000MT/crush*100:undefined};}
