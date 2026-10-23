/** Chart-only contract: all potatoes including seed, never starch output or price. */
export const POTATO_CHART_REGIONS=['NL','DK','DE','EU27_2020'] as const;
export type PotatoChartRegion=typeof POTATO_CHART_REGIONS[number];
export type PotatoObservationStatus='Actual'|'Provisional'|'Official Estimate'|'Derived Estimate';
export type PotatoChartPoint={region:PotatoChartRegion;year:number;productionMMT:number;status:PotatoObservationStatus;sourceUrl:string;publishedAt:string;publicationDateKind:'dataset-update'|'report-publication';verifiedAt:string;crop:'R1000';unit:'MMT';flags:string;area1000HA?:number;yieldMTHA?:number;areaSourceUrl?:string;areaPublishedAt?:string;formula?:string};
export type PotatoArea={region:PotatoChartRegion;year:number;area1000HA:number;sourceUrl:string;publishedAt:string;verifiedAt:string;crop:'R1000';flags:string};
export type PotatoYieldForecast={region:PotatoChartRegion;year:number;yieldMTHA:number;crop:'R1000';sourceUrl:string;publishedAt:string;verifiedAt:string;definitionEvidence:string};
export type PotatoOriginalPoint=Omit<PotatoChartPoint,'region'>&{region:'ORIGINS4';coverage:['DE','FR','NL','DK']};
export type PotatoChartSnapshot={version:2;points:PotatoChartPoint[];originalSeries?:PotatoOriginalPoint[];areas:PotatoArea[];lastCheckedAt?:string;lastSuccessfulFetchAt?:string;lastError?:string;jrc?:{latestReportDate:string;latestReportUrl:string;checkedAt:string;message:string;documents?:{sourceUrl:string;sha256:string;text:string}[]};};
export type PotatoChartPeriod=3|5|10|'all';
export const REGION_LABELS:Record<PotatoChartRegion,string>={NL:'네덜란드',DK:'덴마크',DE:'독일',EU27_2020:'EU27'};
export function potatoChartYears(points:{year:number}[],period:PotatoChartPeriod):number[]{
 if(!points.length)return [];const latest=Math.max(...points.map(p=>p.year)),first=period==='all'?Math.min(...points.map(p=>p.year)):latest-period+1;
 return Array.from({length:latest-first+1},(_,i)=>first+i);
}
export function potatoPointYoY(point:PotatoChartPoint,points:PotatoChartPoint[]):number|null{
 const previous=points.find(p=>p.region===point.region&&p.year===point.year-1);return previous&&previous.productionMMT>0?(point.productionMMT/previous.productionMMT-1)*100:null;
}
export type PotatoChartMode='absolute'|'indexed';
/** Index only observed official values; forecasts never provide an index baseline or point. */
export function potatoChartDisplay(points:PotatoChartPoint[],period:PotatoChartPeriod,mode:PotatoChartMode){
 const regions:PotatoChartRegion[]=['DE','NL','DK'];
 const eligible=points.filter(p=>regions.includes(p.region)&&(mode==='absolute'||p.status==='Actual'||p.status==='Provisional'));
 const years=potatoChartYears(eligible,period),window=eligible.filter(p=>years.includes(p.year));
 const bases=new Map(regions.map(region=>[region,window.filter(p=>p.region===region).sort((a,b)=>a.year-b.year)[0]]));
 const rows=window.map(p=>({...p,displayValue:mode==='absolute'?p.productionMMT:p.productionMMT/bases.get(p.region)!.productionMMT*100}));
 const values=rows.map(p=>p.displayValue);let low=0,high=1;
 if(values.length){const min=Math.min(...values,...(mode==='indexed'?[100]:[])),max=Math.max(...values,...(mode==='indexed'?[100]:[]));const span=Math.max(max-min,mode==='indexed'?40:max*.6,1),mid=(min+max)/2,pad=span*.12;low=Math.max(0,mid-span/2-pad);high=mid+span/2+pad;
 const raw=(high-low)/4,power=10**Math.floor(Math.log10(raw)),step=[1,2,2.5,5,10].map(n=>n*power).find(n=>n>=raw)!;low=Math.floor(low/step)*step;high=Math.ceil(high/step)*step;}
 const step=(high-low)/4,ticks=Array.from({length:5},(_,i)=>low+step*i);
 return {regions,years,rows,bases,low,high,ticks};
}
