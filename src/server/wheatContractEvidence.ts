import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseWheatContractTable,wheatContractCode,type WheatContractTable,type WheatCell} from './wheatContractTable.ts';
import {usWheatPdfCandidates} from './wheatReportFuturesPdf.ts';
import {validWheatComparison,type WheatStoredPoint,type WheatContractComparison,type WheatHistoryStore} from './wheatPriceHistoryStore.ts';
const validPublisher=(url:string)=>/^https:\/\/(?:www\.)?uswheat\.org\//i.test(url);
export function wheatPdfReceipt(bytes:Uint8Array,sourceUrl:string,status:number){
 if(!validPublisher(sourceUrl)||status!==200||bytes.length<2000||bytes.length>5_000_000||Buffer.from(bytes.subarray(0,4)).toString()!=='%PDF')throw Error('Invalid Wheat publisher PDF evidence');
 const sha256=createHash('sha256').update(bytes).digest('hex');
 const receiptPath='.rms-price-history/source-evidence/wheat/'+sha256+'.json';
 const receipt={sourceUrl,retrievedAt:new Date().toISOString(),status,sha256,pdfBase64:Buffer.from(bytes).toString('base64')};
 return {receipt,receiptPath,receiptSha256:sha256};
}
export function persistWheatPdfReceipt(e:ReturnType<typeof wheatPdfReceipt>){
 fs.mkdirSync(path.dirname(e.receiptPath),{recursive:true});
 const validate=()=>{const saved=JSON.parse(fs.readFileSync(e.receiptPath,'utf8'));if(saved.sha256!==e.receiptSha256||saved.sourceUrl!==e.receipt.sourceUrl||createHash('sha256').update(Buffer.from(saved.pdfBase64,'base64')).digest('hex')!==e.receiptSha256)throw Error('Wheat PDF receipt integrity failed');};
 if(!fs.existsSync(e.receiptPath)){
  const tmp=e.receiptPath+'.'+process.pid+'.'+Math.random().toString(16).slice(2)+'.tmp';
  try{fs.writeFileSync(tmp,JSON.stringify(e.receipt),{flag:'wx',mode:0o600});try{fs.linkSync(tmp,e.receiptPath);}catch(err){if((err as NodeJS.ErrnoException).code!=='EEXIST')throw err;}}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
 }
 validate();return {receiptPath:e.receiptPath,receiptSha256:e.receiptSha256};
}
/** Use the existing locked pdf-parse dependency's PDF.js library. Copy input: the worker can transfer its buffer. */
export async function extractWheatContractTable(bytes:Uint8Array,date:string):Promise<WheatContractTable|null>{
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const task=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:true});
 try{
  const doc=await task.promise;const found:WheatContractTable[]=[];
  for(let i=1;i<=Math.min(doc.numPages,5);i++){
   const page=await doc.getPage(i),content=await page.getTextContent();
   const cells:WheatCell[]=content.items.flatMap(item=>{
    if(!('str' in item)||!item.str.trim()||Math.abs(item.transform[1])>.01||Math.abs(item.transform[2])>.01)return [];
    return [{text:item.str,x:item.transform[4],y:-item.transform[5],width:item.width,height:Math.abs(item.height)}];
   });
   const table=parseWheatContractTable(cells,date);if(table)found.push(table);
  }
  return found.length===1?found[0]:null;
 }finally{await task.destroy();}
}
export function verifiedComparison(table:WheatContractTable,p:WheatStoredPoint,latest:WheatStoredPoint):WheatContractQuoteWithDate|null {
 const frontCode=wheatContractCode(p.date,p.contractMonth),targetCode=wheatContractCode(latest.date,latest.contractMonth);
 if(!frontCode||!targetCode||table.reportDate!==p.date||table.front.code!==frontCode||p.provenance!=='source-verified'||(['srwMt','hrwMt','hrsMt'] as const).some(k=>Math.abs(table.front[k]-p[k])>.015))return null;
 const quote=table.contracts.find(c=>c.code===targetCode);return quote?{...quote,date:p.date,contractMonth:latest.contractMonth}:null;
}
type WheatContractQuoteWithDate={code:string;date:string;contractMonth:string;srwBu:number;hrwBu:number;hrsBu:number};
/** Choose existing dated front-month reports, at most two report lookups per scheduled refresh. */
export async function fillWheatComparisons(history:WheatHistoryStore,archiveUrls:string[]):Promise<WheatHistoryStore>{
 const latest=history.points.at(-1);if(!latest||latest.provenance!=='source-verified')return history;
 const code=wheatContractCode(latest.date,latest.contractMonth);if(!code)return history;
 const day=86400000,offset=(date:string)=>(Date.parse(latest.date+'T00:00:00Z')-Date.parse(date+'T00:00:00Z'))/day;
 const existing=(history.contractComparisons||[]).filter(c=>validWheatComparison(c,history.points));const attempted=new Set<string>();
 for(const [target,tolerance] of [[7,5],[30,10]]){
  const candidates=history.points.filter(p=>p.provenance==='source-verified'&&p.date<latest.date&&Math.abs(offset(p.date)-target)<=tolerance).sort((a,b)=>Math.abs(offset(a.date)-target)-Math.abs(offset(b.date)-target)||b.date.localeCompare(a.date));
  const p=candidates[0];if(!p||wheatContractCode(p.date,p.contractMonth)===code||existing.some(c=>c.date===p.date&&c.code===code)||attempted.has(p.date))continue;
  attempted.add(p.date);
  for(const url of usWheatPdfCandidates(p.date,'',[...(p.sourceUrl?[p.sourceUrl]:[]),...archiveUrls])){
   try{
    const res=await fetch(url,{headers:{Accept:'application/pdf'},signal:AbortSignal.timeout(12000)});
    if(!res.ok||!validPublisher(res.url)||Number(res.headers.get('content-length')||0)>5_000_000)continue;
    const bytes=new Uint8Array(await res.arrayBuffer());const evidence=wheatPdfReceipt(bytes,res.url,res.status);
    const table=await extractWheatContractTable(bytes,p.date);const quote=table&&verifiedComparison(table,p,latest);if(!quote)continue;
    const saved=persistWheatPdfReceipt(evidence);
    const c:WheatContractComparison={...quote,frontCode:table!.front.code,frontMt:[p.srwMt,p.hrwMt,p.hrsMt],sourceUrl:res.url,...saved};existing.push(c);break;
   }catch(e){console.warn('[WheatComparison] Verified contract not available:',p.date,e instanceof Error?e.message:String(e));}
  }
 }
 return {...history,contractComparisons:existing.filter(c=>history.points.some(p=>p.date===c.date))};
}
