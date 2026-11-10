/** Stage 2 ONLY: resolve provider-cited Google URLs, retrieve original, grade A/B.
 * Does NOT call Gemini, publish to RMS, or update step 1 files.
 */
import fs from 'node:fs';
import path from 'node:path';
import {lookup} from 'node:dns/promises';
import {load} from 'cheerio';
import {PDFParse} from 'pdf-parse';
import {type SourceCandidate,type GradeRecord,chooseGrade,isGoogleRedirect,safeExternalUrl,isPublicIp,MAX_DOCUMENT_BYTES,TIMEOUT_MS,simpleDate} from './source-grade.ts';
import {commodityFromArgv,resultFolder,assertSnapshotCommodity,type Commodity} from './commodity-config.ts';
import {classifyCommodityText} from './commodity-aliases.ts';

const commodity=commodityFromArgv();
function sourceFolder(){return resultFolder(commodity);}
function latestStep1():string {
  const folder=sourceFolder();
  const f=fs.readdirSync(folder).filter(n=>/^step1-google-.*\.json$/.test(n)).sort().at(-1);
  if(!f)throw Error('STEP 1 Google JSON not found in .rms-soybean-rebuild');
  return path.join(folder,f);
}
async function approvedHost(host:string):Promise<boolean>{
  try{const addresses=await lookup(host,{all:true,verbatim:true});return addresses.length>0&&addresses.every(a=>isPublicIp(a.address));}
  catch{return false;}
}
async function boundedBody(response:Response):Promise<Buffer>{
  const declared=Number(response.headers.get('content-length')||0);
  if(declared>MAX_DOCUMENT_BYTES)throw Error('publisher-body-too-large');
  if(!response.body)return Buffer.alloc(0);
  const chunks:Buffer[]=[];let total=0;
  const reader=response.body.getReader();
  try {
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      const chunk=Buffer.from(value);total+=chunk.length;
      if(total>MAX_DOCUMENT_BYTES){
        await reader.cancel().catch(()=>{});
        throw Error('publisher-body-too-large');
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
function metaDate($:ReturnType<typeof load>):string|null{
  const s=$('meta[property="article:published_time"]').attr('content')||$('meta[name="date"]').attr('content')||$('meta[itemprop="datePublished"]').attr('content')||$('time[datetime]').first().attr('datetime');
  return simpleDate(s);
}
async function htmlDocument(buf:Buffer):Promise<{text:string;title:string;publishedAt:string|null}>{
  const $=load(buf.toString('utf8'));
  const publishedAt=metaDate($);
  const title=($('meta[property="og:title"]').attr('content')||$('h1').first().text()||$('title').first().text()||'').replace(/\s+/g,' ').trim().slice(0,300);
  $('script,style,noscript,nav,footer,aside,form').remove();
  const main=$('article').first().text()||$('main').first().text()||$('body').text();
  return {text:main.replace(/\s+/g,' ').trim().slice(0,130_000),title,publishedAt};
}
async function pdfDocument(buf:Buffer):Promise<{text:string;title:string;publishedAt:string|null}>{
  const p=new PDFParse({data:new Uint8Array(buf)});
  try{const result=await p.getText();const text=(result.text||'').replace(/\s+/g,' ').trim().slice(0,130_000);return {text,title:'PDF original',publishedAt:null};}
  finally{await p.destroy();}
}
/** Does not trust model-authored URLs: input candidate MUST originate from Step 1 Google grounding metadata. */
export async function gradeGroundedSource(candidate:SourceCandidate,fetcher:typeof fetch=fetch,hostCheck:(host:string)=>Promise<boolean>=approvedHost,selectedCommodity:Commodity='soybean'):Promise<GradeRecord>{
  const googleCitation={index:candidate.index,title:candidate.title,uri:candidate.uri};
  let publisherUrl:string|null=null;let status:number|null=null;let docType:'html'|'pdf'|null=null;
  let title:string|null=null;let publishedAt:string|null=null;
  let text='';let error:Parameters<typeof chooseGrade>[0]['error']=null;
  const original=safeExternalUrl(candidate.uri);
  if(!original){error='unsafe-google-citation';}
  else {
    let target=original;const visited=new Set<string>();
    try{
      for(let hop=0;hop<6;hop++){
        if(visited.has(target.href)){error='publisher-redirect-limit';break;}
        visited.add(target.href);
        if(!await hostCheck(target.hostname)){error='publisher-redirect-unsafe';break;}
        const response=await fetcher(target.href,{redirect:'manual',signal:AbortSignal.timeout(TIMEOUT_MS),headers:{'User-Agent':'Mozilla/5.0 (compatible; RMS-Soybean-Source-Check/1.0)','Accept':'text/html,application/pdf;q=0.9,*/*;q=0.5'}});
        status=response.status;
        if(response.status>=300&&response.status<400){
          const location=response.headers.get('location');
          if(!location){error='publisher-redirect-unresolved';break;}
          const next=safeExternalUrl(new URL(location,target.href).href);
          if(!next){error='publisher-redirect-unsafe';break;}
          target=next;continue;
        }
        if(isGoogleRedirect(target)){error='publisher-redirect-unresolved';break;}
        publisherUrl=target.href;
        if(!response.ok){error='publisher-http-error';break;}
        const type=(response.headers.get('content-type')||'').toLowerCase();
        if(type.includes('image/')||type.includes('octet-stream')&&!target.pathname.toLowerCase().endsWith('.pdf')){error='unsupported-content-type';break;}
        const data=await boundedBody(response);
        if(!data.length){error='publisher-body-empty';break;}
        try{
          if(type.includes('pdf')||data.subarray(0,5).toString()==='%PDF-'){
            docType='pdf';const out=await pdfDocument(data);text=out.text;title=out.title;publishedAt=out.publishedAt;
          }else if(type.includes('html')||type.includes('text/plain')||data.subarray(0,100).toString().toLowerCase().includes('<!doctype')){
            docType='html';const out=await htmlDocument(data);text=out.text;title=out.title;publishedAt=out.publishedAt;
          }else error='unsupported-content-type';
        }catch{error='publisher-content-unreadable';}
        break;
      }
      if(!publisherUrl&&!error)error='publisher-redirect-limit';
    }catch(e:any){
      error=String(e?.message||'').includes('publisher-body-too-large')?'publisher-body-too-large':'publisher-unreachable';
    }
  }
  const result=chooseGrade({citation:!!original,publisherUrl,status,type:docType,text,error},selectedCommodity);
  const publisherHost=publisherUrl?new URL(publisherUrl).hostname:null;
  return {grade:result.grade,reason:result.reason,googleCitation,publisherUrl,publisherHost,httpStatus:status,
    documentType:docType,title,publishedAt,relevance:text?classifyCommodityText(text,selectedCommodity):'none',
    extractedText:result.grade==='A'?text:null,extractedCharacters:text.length,
    notes:result.grade==='A'?`Publisher original could be read; article/PDF text verified relevant to ${selectedCommodity}.`:
      result.grade==='B'?'Google citation retained, but source contents are NOT independently verified. Do not cite specific figures as verified.':'Excluded from primary evidence, retained in diagnostic log.'};
}

const inputFile=latestStep1();const data=JSON.parse(fs.readFileSync(inputFile,'utf8'));
assertSnapshotCommodity(data,commodity,'1');
if(data.status!=='google-citations-found'||!Array.isArray(data.grounding?.sources))throw Error('Invalid STEP1 input: expected independently grounded citations');
const input:SourceCandidate[]=data.grounding.sources.map((x:any)=>({index:x.index,title:String(x.title||''),uri:String(x.uri||'')}));
console.log(`[STEP 2] Verify ${input.length} Google-cited URLs (no Gemini API calls).`);
console.log('[STEP 2] STEP 1 file:',inputFile);
const records:GradeRecord[]=[];
// Serial by design: easy diagnostics; avoid hammering publisher sites.
for(let i=0;i<input.length;i++){
  const source=input[i];const r=await gradeGroundedSource(source,fetch,approvedHost,commodity);
  records.push(r);
  console.log(`[${i+1}/${input.length}] ${r.grade} — ${r.reason} — ${r.relevance||'none'} — ${r.publisherHost||source.title} ${r.httpStatus||''}`);
}
const summary={A:records.filter(x=>x.grade==='A').length,B:records.filter(x=>x.grade==='B').length,EXCLUDED:records.filter(x=>x.grade==='EXCLUDED').length};
const output={recordedAt:new Date().toISOString(),commodity,stage:'source-resolution-and-grading',inputFile:path.basename(inputFile),groundedSources:input.length,
  summary,records,definitions:{A:'Google citation plus directly readable relevant publisher content',B:'Actual Google citation retained; publisher content not independently verified',EXCLUDED:'Not suitable primary evidence or unsafe URL'},
  note:'No extra Google/Gemini API calls. Excerpts are available for Step 3, but no market forecast is generated.'};
const outPath=path.join(sourceFolder(),`step2-graded-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
fs.writeFileSync(outPath,JSON.stringify(output,null,2),{mode:0o600});
console.log('[STEP 2] A/B/EXCLUDED:',JSON.stringify(summary));
console.log('[STEP 2] Saved:',outPath);
