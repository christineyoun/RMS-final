/** Parse the public MPOC CPO Bursa-settlement table. No prices or dates are seeded.
 * Fail closed on missing contract identity, page/table headings, conflicting rows.
 * This does not claim exchange-settlement prices are identical to FCPOc1 closes. */
export const MPOC_CPO_URL = 'https://www.mpoc.org.my/market-insight/daily-palm-oil-prices/';
const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const decode = s => String(s).replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)));
const plain = s => decode(String(s).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
function isoDate(raw){
 const s=String(raw).replace(/\s+/g,' ').trim();
 if(/^20\d{2}-\d{2}-\d{2}$/.test(s))return new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s?s:null;
 const m=/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(20\d{2}|\d{2})$/.exec(s);
 if(!m)return null;
 const mo=months.indexOf(m[2].slice(0,3).toLowerCase())+1;
 if(!mo)return null;
 const y=m[3].length===2?2000+Number(m[3]):Number(m[3]);
 const date=`${y}-${String(mo).padStart(2,'0')}-${m[1].padStart(2,'0')}`;
 return new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date?date:null;
}
/** @param {string} html @param {Date} [now]
 * @returns {{contractMonth:string, rows:Array<{date:string,value:number}>, tableHtml:string}} */
export function parseMpocCpoTable(html,now=new Date()){
 if(typeof html!=='string'||html.length<100||html.length>6_000_000)throw Error('MPOC page empty or too large');
 const text=plain(html);
 if(!/\bCPO Prices\b/i.test(text)||!/\bBursa Malaysia\b/i.test(text))throw Error('MPOC CPO/Bursa page identity missing');
 const labels=[...text.matchAll(/\(\s*([A-Za-z]{3,9})\s*,?\s*(\d{2,4})\s+Contract\s*\)/gi)].map(m=>{
   const month=months.indexOf(m[1].slice(0,3).toLowerCase())+1;
   const year=m[2].length===2?2000+Number(m[2]):Number(m[2]);
   return month&&year>=2020&&year<=2100?`${year}-${String(month).padStart(2,'0')}`:null;
 });
 const unique=[...new Set(labels)];
 if(unique.length!==1||!unique[0])throw Error('MPOC contract month not unambiguously identified');
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).filter(p=>p.type==='year'||p.type==='month'||p.type==='day').map(p=>[p.type,p.value]));
 const malaysiaToday=`${parts.year}-${parts.month}-${parts.day}`;
 const matches=[...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)];
 const candidates=[];
 for(const match of matches){
   const rows=[...match[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>[...m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c=>plain(c[1])));
   const header=rows.findIndex(r=>r.length>=2&&/^Pricing\s*Date$/i.test(r[0])&&/^Settlement\s*Price\s*RM\s*(?:\/?\s*MT)?$/i.test(r[1]));
   if(header<0)continue;
   const seen=new Map();
   for(const row of rows.slice(header+1)){
     if(row.length<2)continue;
     const date=isoDate(row[0]);
     const raw=row[1].replace(/,/g,'').replace(/^RM\s*/i,'').trim();
     const value=Number(raw);
     if(!date||!/^\d+(?:\.\d+)?$/.test(raw)||!Number.isFinite(value)||value<100||value>20000)throw Error('Invalid MPOC settlement row: '+row.slice(0,2).join(' / '));
     if(date>malaysiaToday)throw Error('Future MPOC settlement date');
     const previous=seen.get(date);if(previous!==undefined&&previous!==value)throw Error('Conflicting MPOC prices for '+date);
     seen.set(date,value);
   }
   if(seen.size>=1&&seen.size<=25)candidates.push({rows:[...seen].map(([date,value])=>({date,value})).sort((a,b)=>a.date.localeCompare(b.date)),tableHtml:match[0]});
 }
 if(candidates.length!==1)throw Error('Expected exactly one dated MPOC CPO settlement table; got '+candidates.length);
 return {contractMonth:unique[0],...candidates[0]};
}
