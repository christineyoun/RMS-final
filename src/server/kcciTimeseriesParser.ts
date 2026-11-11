/**
 * KOBC's first-party KCCI weekly time-series table.
 * Pure HTML-to-observations parser: no guessed dates, no substituted index.
 * Exported separately for testing without network or filesystem access.
 */
export const KOBC_KCCI_URL='https://kobc.or.kr/ebz/shippinginfo/timeseries/gridList.do?mId=0304000000';
export type KcciObservation = {observationDate:string;kcciPoints:number};
const officialIndex = /(?:\bKCCI\b|KOBC\s+Container\s+Composite\s+Index)/i;
function text(html:string):string {
 return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'')
  .replace(/<!--[^]*?-->/g,'')
  .replace(/<[^>]+>/g,' ')
  .replace(/&(?:nbsp|#160);/gi,' ')
  .replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
  .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
  .replace(/\s+/g,' ').trim();
}
function exactDate(value:string,now:Date):boolean {
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T00:00:00.000Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value&&date.getTime()<=now.getTime();
}
function points(value:string):number {
 if(!/^[1-9]\d{0,2}(?:,\d{3})*(?:\.\d+)?$|^[1-9]\d*(?:\.\d+)?$/.test(value))return NaN;
 const n=Number(value.replaceAll(',',''));
 return Number.isFinite(n)&&n>0&&n<1_000_000?n:NaN;
}
export function parseKcciTimeseries(html:string,now=new Date()) {
 if(!officialIndex.test(text(html))||!/(?:컨테이너선운임지수|Timeseries\s*(?:&|&amp;)\s*Graphs|KCCI)/i.test(text(html)))throw Error('KOBC KCCI page identity not present');
 const tables=html.match(/<table\b[^>]*>[\s\S]*?<\/table\s*>/gi)||[];
 const records=new Map<string,number>();
 let foundHeader=false;
 for(const table of tables){
  const rows=table.match(/<tr\b[^>]*>[\s\S]*?<\/tr\s*>/gi)||[];
  const rowCells=rows.map(row=>[...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]\s*>/gi)].map(m=>text(m[1])));
  const header=rowCells.slice(0,5).flat();
  if(!header.some(v=>/^Date$/i.test(v))||!header.some(v=>/^KCCI$/i.test(v)))continue;
  foundHeader=true;
  for(const cells of rowCells){
   if(!cells.length||!/^20\d{2}-\d{2}-\d{2}$/.test(cells[0]))continue;
   const date=cells[0],value=points(cells[1]||'');
   if(!exactDate(date,now)||!Number.isFinite(value))throw Error('Invalid or future KOBC KCCI observation');
   const existing=records.get(date);
   if(existing!==undefined&&existing!==value)throw Error('Conflicting KCCI values for one publication date');
   records.set(date,value);
  }
 }
 if(!foundHeader)throw Error('Date/KCCI official timeseries table not found');
 const history=[...records].map(([observationDate,kcciPoints])=>({observationDate,kcciPoints})).sort((a,b)=>a.observationDate.localeCompare(b.observationDate));
 if(history.length<2)throw Error('At least two real dated KCCI rows required for weekly comparison');
 const latest=history[history.length-1],previous=history[history.length-2];
 if(previous.observationDate>=latest.observationDate)throw Error('Invalid KCCI publication order');
 return {indexIdentity:'KOBC KCCI Composite Index' as const,source:'Korea Ocean Business Corporation (KOBC)' as const,history,
  kcciPoints:latest.kcciPoints,observationDate:latest.observationDate,
  previousPoints:previous.kcciPoints,previousObservationDate:previous.observationDate,
  changePct:(latest.kcciPoints/previous.kcciPoints-1)*100};
}
