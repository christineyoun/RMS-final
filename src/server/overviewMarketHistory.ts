/** Local retained publication history. GETs never write; source-publication
 * notifications are debounced and content-addressed. No scheduler or network. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {OVERVIEW_COMMODITIES} from '../utils/overviewIntelligence.ts';
import {rmsAiEditorial}from'../utils/rmsAiEditorial.ts';
const digest=(v:any)=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const seoulDay=(date:Date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export type MarketRecord={version:1;day:string;recordedAt:string;fingerprint:string;analyses:any[];articles:any[]};
const stance=(s:string)=>/우선 확보|먼저 확보|선확보|확보 확대/.test(s)?'cover':/관망|유보|대기/.test(s)?'wait':'conditional';
// Only numbers with an explicit measurement unit are comparable. Context,
// geography, period, contract and forecast/actual qualifiers must match exactly.
export function indicators(a:any){return ['bullishFactors','bearishFactors'].flatMap(field=>(a?.[field]||[]).flatMap((text:string)=>{
 const values=[...text.matchAll(/([+-]?\d[\d,.]*)\s*(%|억\s*부셸|만\s*부셸|센트\/부셸|bu\/acre|US¢\/lb|USD\/MT|t\/ha|million MT|billion pounds|백만\s*톤|만\s*톤)/g)];
 if(!values.length)return[];return[{key:field+':'+text.replace(/([+-]?\d[\d,.]*)\s*(%|억\s*부셸|만\s*부셸|센트\/부셸|bu\/acre|US¢\/lb|USD\/MT|t\/ha|million MT|billion pounds|백만\s*톤|만\s*톤)/g,'#$2').replace(/\s+/g,' '),values:values.map(v=>Number(v[1].replaceAll(',',''))),text}];}));}
export function publicationRecord(inputs:any[],now=new Date()):MarketRecord{
 const analyses=inputs.flatMap(({id,analysis,original})=>{
  if(!analysis?.generatedAt||!analysis.executiveSummary||!analysis.deskRecommendation||seoulDay(new Date(analysis.generatedAt))>seoulDay(now))return[];
  const p=rmsAiEditorial(id,analysis.generatedAt,analysis.sources||[],analysis);
  const raw=original||analysis;
  return[{id,generatedAt:analysis.generatedAt,effective:{...p.fields},sources:p.sources,
   original:{deskRecommendation:raw.deskRecommendation,bullishFactors:raw.bullishFactors||[],bearishFactors:raw.bearishFactors||[]}}];
 });
 const seen=new Set<string>();const articles=inputs.flatMap(i=>(i.articles||[]).filter((a:any)=>a.linkStatus==='verified'&&a.originalUrl&&a.publishedAt<=seoulDay(now)).map((a:any)=>({...a,commodity:i.id}))).filter(a=>{if(seen.has(a.originalUrl))return false;seen.add(a.originalUrl);return true;});
 const fingerprint=digest({analyses:analyses.map(a=>({id:a.id,original:a.original,effective:a.effective,sources:a.sources})),articles:articles.map(a=>({commodity:a.commodity,url:a.originalUrl,date:a.publishedAt,receipt:a.receiptSha256,summary:a.summary}))});
 return{version:1,day:seoulDay(now),recordedAt:now.toISOString(),fingerprint,analyses,articles};
}
export function comparePublications(current:MarketRecord,prior?:MarketRecord){
 if(!prior||prior.day>=current.day)return{message:'전일 비교 데이터 없음',baselineDate:null,changes:[]};
 const yesterday=seoulDay(new Date(Date.parse(current.day+'T00:00:00+09:00')-86400000));
 const changes:any[]=[];
 const comparable=current.analyses.filter(a=>a.sources.length&&prior.analyses.some(b=>b.id===a.id&&b.sources.length));
 if(!comparable.length)return{message:'전일 비교 데이터 없음',baselineDate:prior.day,changes:[]};
 for(const a of current.analyses){const old=prior.analyses.find(b=>b.id===a.id);if(!old||!a.sources.length||Date.parse(a.generatedAt)<=Date.parse(old.generatedAt)||seoulDay(new Date(a.generatedAt))!==current.day)continue;
  const name=OVERVIEW_COMMODITIES.find(c=>c[0]===a.id)?.[1]||a.id;
  for(const v of indicators(a.original)){const prev=indicators(old.original).find(p=>p.key===v.key);if(prev&&prev.values.length===v.values.length&&prev.values.some((x,i)=>x!==v.values[i]))changes.push({commodity:a.id,kind:'numerical-revision',text:`${name}: ${prev.text} → ${v.text}. 구매 판단: ${a.effective.deskRecommendation}`,before:prev,after:v,sources:a.sources});}
  if(stance(a.original.deskRecommendation)!==stance(old.original.deskRecommendation))changes.push({commodity:a.id,kind:'purchasing-stance',text:`${name}: 기존 ${old.effective.deskRecommendation} → ${a.effective.deskRecommendation}`,sources:a.sources});
 }
 // A new citation or reworded summary alone cannot prove a new market event.
 // Explicit event identity is reused only if an existing reviewed publication
 // supplies it; older backfilled reports cannot become today's developments.
 for(const a of current.articles){const review=a.procurementReview;
  if(!review?.eventId||!review?.marketChange||!review?.purchasingImplication||a.publishedAt!==current.day||prior.articles.some(b=>b.procurementReview?.eventId===review.eventId))continue;
  changes.push({commodity:a.commodity,kind:'documented-development',text:`${a.title}: ${review.marketChange}. ${review.purchasingImplication}`,sources:[{url:a.originalUrl}]});
 }
 const selected=changes.slice(0,3),prefix=prior.day===yesterday?'':`${prior.day} 대비 · `;
 const incomplete=current.analyses.length<8||comparable.length<8;
 return{message:prefix+(selected.length?selected.map(c=>c.text).join('\n'):prior.day===yesterday?'전일 대비 주요 시장 변화 없음':'주요 시장 변화 없음')+(incomplete?' · 비교 가능한 공개 품목 기준':''),baselineDate:prior.day,changes:selected};
}
export function historyDirectory(root=process.cwd()){return path.join(root,'.rms-stage3','snapshots','overview-market-history');}
export function readHistory(root=process.cwd()):MarketRecord[]{try{return fs.readdirSync(historyDirectory(root)).filter(f=>f.endsWith('.json')).flatMap(f=>{try{const r=JSON.parse(fs.readFileSync(path.join(historyDirectory(root),f),'utf8'));return r.version===1&&r.fingerprint===digest({analyses:r.analyses.map((a:any)=>({id:a.id,original:a.original,effective:a.effective,sources:a.sources})),articles:r.articles.map((a:any)=>({commodity:a.commodity,url:a.originalUrl,date:a.publishedAt,receipt:a.receiptSha256,summary:a.summary}))})?[r]:[];}catch{return[];}}).sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt));}catch{return[];}}
export function retainPublication(record:MarketRecord,root=process.cwd()){
 if(record.analyses.length!==OVERVIEW_COMMODITIES.length)return false;const history=readHistory(root);
 if(history.at(-1)?.fingerprint===record.fingerprint)return false;
 fs.mkdirSync(historyDirectory(root),{recursive:true});const f=path.join(historyDirectory(root),record.day+'-'+record.recordedAt.replaceAll(':','-')+'-'+record.fingerprint.slice(0,12)+'.json');
 fs.writeFileSync(f,JSON.stringify(record,null,2),{flag:'wx',mode:0o600});return true;
}
export function comparisonFor(record:MarketRecord,root=process.cwd()){
 const prior=readHistory(root).filter(r=>r.day<record.day).at(-1);return comparePublications(record,prior);
}
export function startPublicationHistory(capture:()=>MarketRecord,root=process.cwd()){
 // Explicit startup seed is dated now; never backfill past daily baselines.
 retainPublication(capture(),root);let timer:ReturnType<typeof setTimeout>|undefined;
 const notify=()=>{clearTimeout(timer);timer=setTimeout(()=>{try{retainPublication(capture(),root);}catch(e){console.error('Overview publication history:',e);}},500);};
 const watchers=[['.rms-stage3'],['.rms-stage3','snapshots'],['src','data'],['.rms-stage3','evidence','articles']].flatMap(parts=>{const dir=path.join(root,...parts);return fs.existsSync(dir)?[fs.watch(dir,(_event,file)=>{if(!file||/^(analysis-|news-|.*news-verified\.json|.*news_verified\.json|rmsAiEditorialOverlays\.json|news_procurement_reviews\.json)/.test(String(file)))notify();})]:[];});
 watchers.forEach(w=>w.on('error',e=>console.error('Overview publication notifications unavailable; saved history retained:',e.message)));
 return()=>{clearTimeout(timer);watchers.forEach(w=>w.close());};
}
