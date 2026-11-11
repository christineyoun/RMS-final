/** Read-only parser for the government NLIC table of SCFI composite indices.
 * No connection, cache or write is performed by this module. Never infer a date.
 */
function assert(value, message) { if (!value) throw new Error(message); }
function validDate(value, now = new Date()) {
 if (!/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
 const date = new Date(value + 'T00:00:00Z');
 return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===value && date.getTime()<=now.getTime();
}
function number(value) {
 if (!/^(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d+)?$/.test(value)) return NaN;
 return Number(value.replaceAll(',',''));
}
function visibleText(html) {
 return html.replace(/<!--[^]*?-->/g,' ')
  .replace(/<(script|style|noscript|svg)\b[^>]*>[^]*?<\/\1>/gi,' ')
  .replace(/<\/(?:tr|td|th|li|ul|div|p|table|section|h[1-6])\s*>/gi,' ')
  .replace(/<[^>]*>/g,' ')
  .replace(/&(?:nbsp|ensp|emsp);|&#160;/gi,' ').replace(/&amp;/gi,'&')
  .replace(/\s+/g,' ').trim();
}
export function parseNlicScfiTable(html, now=new Date()) {
 assert(typeof html==='string' && html.length>100, 'NLIC HTML missing');
 const txt=visibleText(html);
 const matches=[...txt.matchAll(/기준일\s+SCFI\s+CCFI/gi)];
 assert(matches.length===1,'NLIC uniquely identified SCFI+CCFI table header absent');
 let section=txt.slice(matches[0].index+matches[0][0].length);
 const end=section.search(/국외\s*해상운임\s*지수\s*[（(]?\s*기준년월|해당\s*통계자료는|자료설명/);
 assert(end>=0,'NLIC expected end-of-table boundary absent');
 section=section.slice(0,end);
 const tokens=[...section.matchAll(/(?:20\d{2}-\d{2}-\d{2})|(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g)].map(m=>m[0]);
 assert(tokens.length>=6,'NLIC SCFI contains fewer than two observations');
 let rows=[];
 // Support both row-major and column-major server-rendered HTML layouts.
 if(tokens.length%3===0 && tokens.every((token,i)=>i%3!==0||/^20\d{2}-\d{2}-\d{2}$/.test(token))) {
  for(let i=0;i<tokens.length;i+=3) rows.push({date:tokens[i],scfi:number(tokens[i+1])});
 }else {
  const i=tokens.findIndex(token=>!/^20\d{2}-\d{2}-\d{2}$/.test(token));
  assert(i>=2,'NLIC has fewer than two dated rows');
  const dates=tokens.slice(0,i),values=tokens.slice(i);
  assert(dates.every(token=>/^20\d{2}-\d{2}-\d{2}$/.test(token)),'NLIC dates and values are mixed');
  assert(values.length===dates.length*2,'NLIC SCFI and CCFI column lengths conflict');
  rows=dates.map((date,index)=>({date,scfi:number(values[index])}));
 }
 assert(rows.length>=2,'NLIC SCFI requires two actual releases');
 const unique=new Map();
 for(const row of rows){
  assert(validDate(row.date,now),'Invalid NLIC publisher date: '+row.date);
  assert(Number.isFinite(row.scfi)&&row.scfi>0&&row.scfi<100000,'Invalid NLIC SCFI composite: '+row.scfi);
  if(unique.has(row.date))assert(unique.get(row.date)===row.scfi,'NLIC conflicting same-date SCFI values');
  unique.set(row.date,row.scfi);
 }
 const sorted=[...unique].map(([date,scfi])=>({date,scfi})).sort((a,b)=>b.date.localeCompare(a.date));
 assert(sorted.length>=2 && sorted.every((r,i)=>!i||r.date<sorted[i-1].date),'NLIC chronology invalid');
 return sorted;
}
