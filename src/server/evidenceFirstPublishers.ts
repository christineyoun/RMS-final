/** Reuse existing discovery, then independently verify original HTML. No AI
 * summary becomes evidence. Immutable receipts and original publication dates
 * survive; a failed current check never becomes a successful current record. */
import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';import {load} from 'cheerio';
import {originalArticleFact} from './analysisArticleEvidence.ts';
import {trustedAnalysisUrl,validAnalysisFact,type AnalysisFact} from './analysisEvidence.ts';
const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
const target=(root:string,id:string)=>path.join(root,'.rms-stage3/evidence-first-publishers',id+'.json');
function verified(html:string,url:string,date:string,id:string,checkedAt:string){
 const fact=originalArticleFact(html,url,date,id,checkedAt);if(!fact)return null;
 const metadata=load(html),canonical=metadata('link[rel="canonical"]').attr('href')||metadata('meta[property="og:url"]').attr('content');
 const identity=(s:string)=>{const u=new URL(s);return u.hostname.replace(/^www\./,'')+u.pathname.replace(/\/$/,'');};
 if(canonical&&identity(new URL(canonical,url).href)!==identity(url))return null;
 const $=load(html);$('script,style,noscript,nav,footer,header,aside').remove();const main=$('article,main,[itemprop="articleBody"],.article-content,.news-content,.sp-body').first();
 const quote=(main.length?main:$('body')).text().replace(/\s+/g,' ').trim().slice(0,12000);
 return {...fact,id:'live-'+fact.id,referenceContext:{receiptSha256:fact.recordSha256,quote}};
}
export async function collectEvidenceFirstPublishers(id:string,root=process.cwd(),now=new Date(),options:{candidates?:any[];fetcher?:typeof fetch}={}){
 let inputs=options.candidates;
 if(!inputs){
  let discovered:any[]=[];try{discovered=JSON.parse(fs.readFileSync(path.join(root,'.rms-stage3/free-news-candidates-'+id+'.json'),'utf8')).candidates||[];}catch{}
  // Explicit-root saved publications provide URL candidates only. Never call
  // the HTTP gateway here (it captures cwd and creates an administration token).
  let prior:any[]=[];try{prior=JSON.parse(fs.readFileSync(path.join(root,'.rms-stage3/free-daily-publication.json'),'utf8')).data?.inputs?.find((i:any)=>i.id===id)?.articles||[];}catch{}
  try{prior.push(...(JSON.parse(fs.readFileSync(path.join(root,'.rms-stage3/snapshots/news-'+id+'.json'),'utf8')).payload?.articles||[]));}catch{}
  let fixed:any[]=[];try{fixed=JSON.parse(fs.readFileSync(path.join(root,'.rms-stage3',id+'-news-verified.json'),'utf8')).articles||[];}catch{}
  let editorial:any[]=[];try{editorial=JSON.parse(fs.readFileSync(path.join(root,'src/data',(id==='potato-starch'?'potato':id==='tapioca-starch'?'tapioca':id.replaceAll('-','_'))+'_news_verified.json'),'utf8')).articles||[];}catch{}
  inputs=[...discovered.sort((a,b)=>String(b.publishedAt).localeCompare(String(a.publishedAt))),...fixed,...prior,...editorial];
 }
 const seen=new Set<string>();
 // Discovery precedes legacy editorial candidates. Keep the first identity so
 // an older saved date cannot silently replace the newly discovered date.
 const candidates=inputs.filter(a=>a.originalUrl&&trustedAnalysisUrl(a.originalUrl)&&Number.isFinite(Date.parse(a.publishedAt))&&+now-Date.parse(a.publishedAt)<=31*86400000&&Date.parse(a.publishedAt)<=+now).filter(a=>{if(seen.has(a.originalUrl))return false;seen.add(a.originalUrl);return true;}).slice(0,8);
 const rows=[];
 for(const a of candidates){
  try{
   const r=await(options.fetcher||fetch)(a.originalUrl,{redirect:'manual',signal:AbortSignal.timeout(10000),headers:{Accept:'text/html'}});
   if(!r.ok)throw Error('publisher-http-'+r.status);if(!r.headers.get('content-type')?.includes('html'))throw Error('publisher-not-html');
   const reader=r.body?.getReader();if(!reader)throw Error('publisher-empty-body');const chunks:Uint8Array[]=[];let size=0;
   try{while(true){const c=await reader.read();if(c.done)break;size+=c.value.length;if(size>2_000_000){await reader.cancel();throw Error('publisher-body-limit');}chunks.push(c.value);}}finally{reader.releaseLock();}
   const html=Buffer.concat(chunks).toString('utf8'),fact=verified(html,a.originalUrl,a.publishedAt,id,now.toISOString());if(!fact)throw Error('original-date-topic-or-passage-not-verified');
   const receipt=path.join(root,'.rms-stage3/evidence/articles/article-'+fact.recordSha256+'.json');fs.mkdirSync(path.dirname(receipt),{recursive:true});
   if(!fs.existsSync(receipt))fs.writeFileSync(receipt,JSON.stringify({sourceUrl:a.originalUrl,verifiedAt:now.toISOString(),sha256:fact.recordSha256,html}),{flag:'wx',mode:0o600});
   rows.push({url:a.originalUrl,publishedAt:fact.observedAt,sha256:fact.recordSha256,status:'verified'});
  }catch(e){rows.push({url:a.originalUrl,publishedAt:a.publishedAt,status:'failed',reason:/^(publisher-|original-)/.test((e as Error).message)?(e as Error).message:'publisher-request-failed'});}
 }
 const file=target(root,id);fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';fs.writeFileSync(tmp,JSON.stringify({commodity:id,checkedAt:now.toISOString(),results:rows},null,2),{mode:0o600});fs.renameSync(tmp,file);return rows;
}
export function collectedPublisherEvidence(id:string,root:string,now=new Date()):AnalysisFact[]{
 try{
  const packet=JSON.parse(fs.readFileSync(target(root,id),'utf8'));if(packet.commodity!==id||!Number.isFinite(Date.parse(packet.checkedAt))||Date.parse(packet.checkedAt)>+now||+now-Date.parse(packet.checkedAt)>7*86400000)return [];
  return packet.results.flatMap((r:any)=>{if(r.status!=='verified'||! /^[a-f0-9]{64}$/.test(r.sha256))return [];try{
   const receipt=JSON.parse(fs.readFileSync(path.join(root,'.rms-stage3/evidence/articles/article-'+r.sha256+'.json'),'utf8'));if(receipt.sourceUrl!==r.url||typeof receipt.html!=='string'||sha(receipt.html)!==r.sha256)return [];
   const fact=verified(receipt.html,r.url,r.publishedAt,id,packet.checkedAt);return fact&&validAnalysisFact(fact,id,now)?[fact]:[];
  }catch{return [];}});
 }catch{return [];}
}

/** Read an immutable original receipt independently of the latest fetch status.
 * A failed new fetch cannot invalidate an intact prior publication's receipt. */
export function readPublisherReceipt(id:string,root:string,row:{url:string;sha256:string;publishedAt:string},verifiedAt:string,now=new Date()):AnalysisFact|null{
 try{
  if(!/^[a-f0-9]{64}$/.test(row.sha256)||!Number.isFinite(Date.parse(verifiedAt))||Date.parse(verifiedAt)>+now)return null;
  const receipt=JSON.parse(fs.readFileSync(path.join(root,'.rms-stage3/evidence/articles/article-'+row.sha256+'.json'),'utf8'));
  if(receipt.sourceUrl!==row.url||typeof receipt.html!=='string'||sha(receipt.html)!==row.sha256)return null;
  const fact=verified(receipt.html,row.url,row.publishedAt,id,verifiedAt);
  return fact&&validAnalysisFact(fact,id,now)?fact:null;
 }catch{return null;}
}
