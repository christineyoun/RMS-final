import legacy from '../data/potato_jrc_monthly_verified.json';

export const POTATO_JRC_REGIONS=['EU','DE','FR','NL','DK','PL'] as const;
export const POTATO_JRC_NAMES={EU:'유럽연합',DE:'독일',FR:'프랑스',NL:'네덜란드',DK:'덴마크',PL:'폴란드'} as const;
export type PotatoJrcRegion=typeof POTATO_JRC_REGIONS[number];
export type PotatoJrcYieldRow={code:PotatoJrcRegion;previousYear:number;forecast:number};
export type PotatoJrcIssue={publishedAt:string;forecastYear:number;sourceUrl:string;pdfSha256:string;rows:PotatoJrcYieldRow[]};
export type PotatoJrcPublication={current:PotatoJrcIssue;previous?:PotatoJrcIssue};
const trustedPdf=(v:unknown)=>typeof v==='string'&&/^https:\/\/publications\.jrc\.ec\.europa\.eu\/repository\/bitstream\/JRC\d+\/[\w.-]+\.pdf$/.test(v);
export function validPotatoJrcIssue(value:unknown,now=new Date()):value is PotatoJrcIssue {
 const d=value as PotatoJrcIssue|undefined;
 return !!d&&trustedPdf(d.sourceUrl)&&/^[a-f0-9]{64}$/.test(d.pdfSha256)&&
  /^20\d{2}-\d{2}-\d{2}$/.test(d.publishedAt)&&Number.isFinite(Date.parse(d.publishedAt))&&Date.parse(d.publishedAt)<=+now&&
  Number.isInteger(d.forecastYear)&&d.forecastYear>=Number(d.publishedAt.slice(0,4))-1&&d.forecastYear<=Number(d.publishedAt.slice(0,4))&&
  Array.isArray(d.rows)&&d.rows.length===POTATO_JRC_REGIONS.length&&POTATO_JRC_REGIONS.every(code=>
   d.rows.filter(r=>r?.code===code&&[r.previousYear,r.forecast].every(v=>Number.isFinite(v)&&v>=5&&v<=100)).length===1);
}
export function readPotatoJrcPublication(value:unknown,now=new Date()):PotatoJrcPublication|undefined{
 const d=value as PotatoJrcPublication|undefined;
 if(!d||!validPotatoJrcIssue(d.current,now))return;
 return {current:d.current,...(validPotatoJrcIssue(d.previous,now)&&d.previous.forecastYear===d.current.forecastYear&&
  d.previous.publishedAt<d.current.publishedAt?{previous:d.previous}:{})};
}
/** Only the original verified saved reports seed the first comparison. */
export function retainedPotatoJrcPublication(now=new Date()):PotatoJrcPublication|undefined{
 const issue=(date:string,comparison:boolean)=>{
  const src=legacy.sources.find(s=>s.publishedAt===date);
  return {publishedAt:date,forecastYear:legacy.forecastYear,sourceUrl:src?.url,pdfSha256:src?.sha256,
   rows:legacy.rows.map(r=>({code:r.code,previousYear:r.previousYear,forecast:comparison?r.previousForecast:r.forecast}))};
 };
 return readPotatoJrcPublication({current:issue(legacy.publishedAt,false),previous:issue(legacy.previousPublication,true)},now);
}
export function mergePotatoJrcPublication(saved:unknown,incoming:unknown,now=new Date()){
 const old=readPotatoJrcPublication(saved,now)||retainedPotatoJrcPublication(now);
 if(!validPotatoJrcIssue(incoming,now)||old&&incoming.publishedAt<=old.current.publishedAt)return old;
 return {current:incoming,...(old?.current.forecastYear===incoming.forecastYear?{previous:old.current}:{})};
}
