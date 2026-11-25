/** Spatial extraction of the USW Futures Exchange Settlements table, never FOB or basis columns. */
export type WheatCell = { text: string; x: number; y: number; width: number; height: number };
export type WheatContractQuote = { code: string; srwBu:number; hrwBu:number; hrsBu:number };
export type WheatContractTable = { reportDate:string; front: WheatContractQuote & {srwMt:number;hrwMt:number;hrsMt:number}; contracts:WheatContractQuote[] };
const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
const codes=['F','G','H','J','K','M','N','Q','U','V','X','Z'];
export function wheatContractCode(date:string,month:string):string|null {
 const d=new Date(date+'T00:00:00Z'), m=months.indexOf(month);
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==date||m<0)return null;
 const year=d.getUTCFullYear()+(m<d.getUTCMonth()?1:0);
 return codes[m]+String(year).slice(-2);
}
const center=(c:WheatCell)=>c.x+c.width/2;
const norm=(s:string)=>s.replace(/\s+/g,' ').trim();
function mergeCells(cells:WheatCell[]):WheatCell[]{
 const out:WheatCell[]=[];
 for(const c of [...cells].sort((a,b)=>a.x-b.x)){
  const prev=out.at(-1);
  if(prev&&c.x-(prev.x+prev.width)<=Math.max(1.2,Math.min(prev.height,c.height)*.46)&&c.x>=prev.x){
   const gap=c.x-(prev.x+prev.width);
   prev.text=norm(prev.text+(gap>.4?' ':'')+c.text);prev.width=Math.max(prev.width,c.x+c.width-prev.x);
  }else out.push({...c});
 }
 return out;
}
function lines(cells:WheatCell[]){
 const result:{y:number;cells:WheatCell[]}[]=[];
 for(const c of [...cells].sort((a,b)=>a.y-b.y)){
  const prev=result.at(-1);
  if(prev&&Math.abs(c.y-prev.y)<=Math.max(1,Math.min(c.height,prev.cells[0].height)*.30))prev.cells.push(c);
  else result.push({y:c.y,cells:[c]});
 }
 return result.map(r=>({...r,cells:mergeCells(r.cells)}));
}
const lineText=(r:{cells:WheatCell[]})=>norm(r.cells.map(c=>c.text).join(' '));
export function parseWheatContractTable(raw:WheatCell[],date:string):WheatContractTable|null {
 const d=new Date(date+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==date)return null;
 const cells=raw.filter(c=>norm(c.text)&&[c.x,c.y,c.width,c.height].every(Number.isFinite)&&c.width>0&&c.height>0).map(c=>({...c,text:norm(c.text)}));
 const rows=lines(cells);
 const dateRx=new RegExp(`Weekly Price Report ${months[d.getUTCMonth()]} 0?${d.getUTCDate()},? ${d.getUTCFullYear()}\\b`,'i');
 if(!rows.some(r=>dateRx.test(lineText(r))))return null;
 const title=rows.filter(r=>/Futures Exchange Settlements/i.test(lineText(r)));
 if(title.length!==1)return null;
 const legend=rows.find(r=>r.y>title[0].y&&/^Legend\s*:/i.test(lineText(r)));
 const table=rows.filter(r=>r.y>title[0].y&&(!legend||r.y<legend.y));
 const unitRows=table.filter(r=>r.cells.some(c=>/^\$\/MT$/i.test(c.text))&&r.cells.filter(c=>/^\$\/bu$/i.test(c.text)).length>=4);
 if(unitRows.length!==1)return null;
 const units=unitRows[0].cells.filter(c=>/^\$\/(MT|bu)$/i.test(c.text));
 if(!/^\$\/MT$/i.test(units[0].text)||units.slice(1).some(c=>!/^\$\/bu$/i.test(c.text))||(units.length-1)%2!==0)return null;
 const n=(units.length-1)/2;
 const headerRx=/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s*\(([FGHJKMNQUVXZ])(\d{2})\)$/i;
 const headerRows=table.filter(r=>r.y<unitRows[0].y&&r.cells.filter(c=>headerRx.test(c.text)).length===n);
 if(headerRows.length!==1)return null;
 const headers=headerRows[0].cells.filter(c=>headerRx.test(c.text));
 const contracts=headers.map(c=>{const m=headerRx.exec(c.text)!;return months.findIndex(x=>x.slice(0,3).toUpperCase()===m[1].toUpperCase())===codes.indexOf(m[2].toUpperCase())?m[2].toUpperCase()+m[3]:null;});
 if(contracts.some(c=>!c)||new Set(contracts).size!==n)return null;
 const monthOrd=(s:string)=>Number(s.slice(1))*12+codes.indexOf(s[0]);
 if(contracts.some((c,i)=>i>0&&monthOrd(c!)<=monthOrd(contracts[i-1]!)))return null;
 // Close and weekly-change labels MUST agree spatially with each unit pair.
 const beforeUnits=table.filter(r=>r.y>headerRows[0].y&&r.y<unitRows[0].y).flatMap(r=>r.cells);
 const close=beforeUnits.filter(c=>/^close$/i.test(c.text)).sort((a,b)=>a.x-b.x);
 const change=beforeUnits.filter(c=>/^wk\s+chng$/i.test(c.text)).sort((a,b)=>a.x-b.x);
 if(close.length!==n||change.length!==n)return null;
 const centers=units.map(center);
 const spacing=Math.min(...centers.slice(1).map((v,i)=>v-centers[i]));
 if(!Number.isFinite(spacing)||spacing<=0)return null;
 const margin=spacing*.45;
 for(let i=0;i<n;i++){
  const lo=centers[i===0?0:2*i+1],bu=centers[2*i+1],wk=centers[2*i+2];
  if(center(headers[i])<lo-margin||center(headers[i])>wk+margin||center(close[i])<lo-margin||center(close[i])>bu+margin||Math.abs(center(change[i])-wk)>margin)return null;
 }
 const labels=[/^Chicago\s+BOT\s+SRW\b/i,/^Kansas\s+City\s+BOT\s+HRW\b/i,/^Minneapolis\s+(MIAX|MGEX)\s+(NS\/DNS|HRS)\b/i,/^Chicago\s+BOT\s+Corn\b/i];
 const labelRows=labels.map(rx=>table.filter(r=>r.y>unitRows[0].y&&rx.test(norm(r.cells.filter(c=>center(c)<centers[0]-margin).map(c=>c.text).join(' ')))));
 if(labelRows.some(a=>a.length!==1))return null;
 const y=labelRows.map(a=>a[0].y);
 if(y.some((v,i)=>i>0&&v<=y[i-1]))return null;
 // The publisher's $/MT cells can sit above the baseline in tall rows. Use row boundaries, not flattened order.
 const ranges=y.slice(0,3).map((v,i)=>[(v+(i===0?unitRows[0].y:y[i-1]))/2,(v+y[i+1])/2]);
 const read=(row:number,col:number,rx:RegExp)=>{
  const items=cells.filter(c=>c.y>ranges[row][0]&&c.y<ranges[row][1]&&Math.abs(center(c)-centers[col])<margin);
  if(items.length!==1||!rx.test(items[0].text))return null;
  const value=Number(items[0].text);return Number.isFinite(value)?value:null;
 };
 const mt=[0,1,2].map(i=>read(i,0,/^\d{2,4}\.\d{2}$/));
 const quotes:WheatContractQuote[]=[];
 for(let i=0;i<n;i++){
  const vals=[0,1,2].map(r=>read(r,2*i+1,/^\d{1,2}\.\d{4}$/));
  if(vals.some(v=>v===null||v<2||v>25))continue;
  quotes.push({code:contracts[i]!,srwBu:vals[0]!,hrwBu:vals[1]!,hrsBu:vals[2]!});
 }
 const front=quotes.find(q=>q.code===contracts[0]);
 if(!front||mt.some((v,i)=>v===null||Math.abs(v-[front.srwBu,front.hrwBu,front.hrsBu][i]*36.7437)>.15))return null;
 return {reportDate:date,front:{...front,srwMt:mt[0]!,hrwMt:mt[1]!,hrsMt:mt[2]!},contracts:quotes};
}
