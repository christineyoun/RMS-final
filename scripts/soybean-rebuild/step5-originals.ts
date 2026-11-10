/** Read Google-cited publisher documents for STEP5 independently of old STEP2 runner.
 * Keeps A originals, B citation-only sources, excluded metadata. Never calls Gemini.
 * Uses STEP2 safety/grading policies, but does not import its executable script.
 */
import {lookup} from 'node:dns/promises';
import {load} from 'cheerio';
import {PDFParse} from 'pdf-parse';
import {chooseGrade,isGoogleRedirect,safeExternalUrl,isPublicIp,MAX_DOCUMENT_BYTES,TIMEOUT_MS,simpleDate} from './source-grade.ts';
import type {SourceCandidate,GradeRecord,Reason} from './source-grade.ts';
import type {Commodity} from './commodity-config.ts';

async function publicHost(host:string):Promise<boolean>{
  try{const ips=await lookup(host,{all:true,verbatim:true});return ips.length>0&&ips.every(x=>isPublicIp(x.address));}
  catch{return false;}
}
async function readBounded(res:Response):Promise<Buffer>{
  const size=Number(res.headers.get('content-length')||0);
  if(size>MAX_DOCUMENT_BYTES)throw Error('publisher-body-too-large');
  if(!res.body)return Buffer.alloc(0);
  const chunks:Buffer[]=[];let total=0;
  const reader=res.body.getReader();
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
async function parseOriginal(bytes:Buffer,contentType:string):Promise<{kind:'html'|'pdf'|null;text:string;title:string|null;date:string|null}>{
  if(contentType.includes('pdf')||bytes.subarray(0,5).toString()==='%PDF-'){
    const parser=new PDFParse({data:new Uint8Array(bytes)});
    try{const doc=await parser.getText();return {kind:'pdf',text:String(doc.text||'').replace(/\s+/g,' ').trim().slice(0,130_000),title:'PDF original',date:null};}
    finally{await parser.destroy();}
  }
  if(contentType.includes('html')||contentType.includes('text/plain')||bytes.subarray(0,150).toString().toLowerCase().includes('<!doctype')){
    const $=load(bytes.toString('utf8'));
    const date=simpleDate($('meta[property="article:published_time"]').attr('content')||$('meta[name="date"]').attr('content')||$('meta[itemprop="datePublished"]').attr('content')||$('time[datetime]').first().attr('datetime'));
    const title=($('meta[property="og:title"]').attr('content')||$('h1').first().text()||$('title').first().text()||'').replace(/\s+/g,' ').trim().slice(0,250);
    $('script,style,noscript,nav,footer,aside,form').remove();
    const text=($('article').first().text()||$('main').first().text()||$('body').text()).replace(/\s+/g,' ').trim().slice(0,130_000);
    return {kind:'html',text,title,date};
  }
  return {kind:null,text:'',title:null,date:null};
}
export async function readNewSource(candidate:SourceCandidate,
  fetcher:typeof fetch=fetch,hostCheck:(host:string)=>Promise<boolean>=publicHost,commodity:Commodity='soybean'):Promise<GradeRecord>{
  let publisherUrl:string|null=null,status:number|null=null,title:string|null=null,publishedAt:string|null=null;
  let kind:'html'|'pdf'|null=null,text='',error:Reason|null=null;
  const citation=safeExternalUrl(candidate.uri);
  if(!citation)error='unsafe-google-citation';
  else{
    let url=citation;
    const visited=new Set<string>();
    try{
      for(let hop=0;hop<6;hop++){
        if(visited.has(url.href)){error='publisher-redirect-limit';break;}
        visited.add(url.href);
        if(!await hostCheck(url.hostname)){error='publisher-redirect-unsafe';break;}
        const res=await fetcher(url.href,{redirect:'manual',signal:AbortSignal.timeout(TIMEOUT_MS),
          headers:{'User-Agent':'Mozilla/5.0 (compatible; RMS-Soybean-Source-Check/1.1)',
            Accept:'text/html,application/pdf;q=0.9,*/*;q=0.5'}});
        status=res.status;
        if(status>=300&&status<400){
          const location=res.headers.get('location');if(!location){error='publisher-redirect-unresolved';break;}
          const next=safeExternalUrl(new URL(location,url.href).href);
          if(!next){error='publisher-redirect-unsafe';break;}
          url=next;continue;
        }
        if(isGoogleRedirect(url)){error='publisher-redirect-unresolved';break;}
        publisherUrl=url.href;
        if(!res.ok){error='publisher-http-error';break;}
        const type=(res.headers.get('content-type')||'').toLowerCase();
        if(type.includes('image/')||(type.includes('octet-stream')&&!url.pathname.toLowerCase().endsWith('.pdf'))){error='unsupported-content-type';break;}
        const bytes=await readBounded(res);
        if(!bytes.length){error='publisher-body-empty';break;}
        try{
          const original=await parseOriginal(bytes,type);
          kind=original.kind;text=original.text;title=original.title;publishedAt=original.date;
          if(!kind)error='unsupported-content-type';
        }catch{error='publisher-content-unreadable';}
        break;
      }
      if(!publisherUrl&&!error)error='publisher-redirect-limit';
    }catch(e){error=String(e).includes('publisher-body-too-large')?'publisher-body-too-large':'publisher-unreachable';}
  }
  const grade=chooseGrade({citation:!!citation,publisherUrl,status,type:kind,text,error},commodity);
  return {grade:grade.grade,reason:grade.reason,
    googleCitation:{index:candidate.index,title:candidate.title,uri:candidate.uri},
    publisherUrl,publisherHost:publisherUrl?new URL(publisherUrl).hostname:null,httpStatus:status,
    documentType:kind,title,publishedAt,extractedText:grade.grade==='A'?text:null,
    extractedCharacters:text.length,notes:grade.grade==='A'?'Publisher original readable and related to selected commodity; numerical facts not independently cross-checked.':
      grade.grade==='B'?'Google citation preserved; publisher figures/content not verified.':'Excluded from market evidence but tracked.'};
}
