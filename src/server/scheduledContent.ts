/** Atomic selection of existing-format approved news/analysis snapshots.
 * Readers never collect, generate, or mutate. Original snapshots remain retained. */
import {compareNewsContent} from './newsContentChanges.ts';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {writeFreeJson,readFreeJson} from './freeDailyPublication.ts';
import {reviewMarketSummary,hasMarketArticleBody} from './newsEvidenceQuality.ts';
import {assessNewsSummary} from '../utils/newsSummaryQuality.ts';
import {selectProcurementNews} from './newsProcurementSelection.ts';
import {snapshotIssues} from './mvpEvidence.ts';
import {COMMODITY_IDS} from '../services/commodityQuoteSource.ts';
import {analysisReplacementIssues,analysisContentUnchanged} from './analysisPublicationQuality.ts';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const directory=(root:string)=>path.join(root,'.rms-stage3');
const validKey=(key:string)=>['analysis-','news-'].some(p=>key.startsWith(p)&&COMMODITY_IDS.includes(key.slice(p.length) as any));
export function acceptedScheduledNews(id:string,articles:any[]){
 return selectProcurementNews(id,articles.filter(a=>{
  const e=a.verifiedSourceEvidence;
  return a.linkStatus==='verified'&&!a.unavailable&&e?.originalUrl===a.originalUrl&&e.publishedAt===a.publishedAt&&
   e.sourceHeadline===a.sourceHeadline&&typeof e.excerpt==='string'&&hasMarketArticleBody(e.excerpt,e.sourceHeadline)&&
   Number.isFinite(Date.parse(e.verifiedAt))&&Date.parse(a.publishedAt)<=Date.now()&&
   assessNewsSummary(a.summary,a.title,id).pass&&!reviewMarketSummary(a.title,a.summary,e.excerpt,id);
 }));
}
/** A bad active AI pointer must not erase a previously accepted immutable report.
 * Recovery is read-only: verify each content hash and the original acceptance
 * contract; do not rewrite the manifest, its generation date, or provider data.
 * News intentionally has no such fallback: an invalid/withdrawn article cannot
 * be resurrected by scanning historical publications. */
function verifiedImmutable(key:string,sha256:string,root:string):any|null{
 if(!/^[a-f0-9]{64}$/.test(sha256))return null;
 try{
  const bytes=fs.readFileSync(path.join(directory(root),'snapshots/scheduled-content',sha256+'.json'),'utf8');
  if(hash(bytes)!==sha256)return null;
  const saved=JSON.parse(bytes);
  if(saved.key!==key)return null;
  if(key.startsWith('analysis-')&&(!['live','cached'].includes(saved.payload?.data?.status)||snapshotIssues(key,saved.payload).length))return null;
  return saved;
 }catch{return null;}
}
function lastAcceptedImmutableAnalysis(key:string,root:string):any|null{
 const folder=path.join(directory(root),'snapshots/scheduled-content');
 let names:string[];
 try{names=fs.readdirSync(folder).filter(n=>/^[a-f0-9]{64}\.json$/.test(n));}catch{return null;}
 let selected:any=null;
 for(const name of names){
  const saved=verifiedImmutable(key,name.slice(0,-5),root);
  if(!saved)continue;
  const date=Date.parse(saved.payload.data.generatedAt);
  const old=selected?Date.parse(selected.payload.data.generatedAt):-Infinity;
  if(date>old||(date===old&&String(saved.updatedAt||'')>String(selected?.updatedAt||'')))selected=saved;
 }
 return selected;
}
export function readScheduledContent(key:string,root=process.cwd()):any|null{
 if(!validKey(key))return null;
 const analysis=key.startsWith('analysis-');
 try{
  const ref=readFreeJson('scheduled-content-current.json',directory(root))?.entries?.[key];
  const saved=typeof ref?.sha256==='string'?verifiedImmutable(key,ref.sha256,root):null;
  if(saved){
   if(analysis)return saved;
   const articles=acceptedScheduledNews(key.slice(5),saved.payload.articles||[]);
   return articles.length?{...saved,payload:{...saved.payload,articles}}:null;
  }
 }catch{/* Attempt read-only recovery for previously accepted analysis only. */}
 return analysis?lastAcceptedImmutableAnalysis(key,root):null;
}
export function publishScheduledContent(updates:Record<string,any>,runId:string,root=process.cwd()){
 const dir=directory(root),prior=readFreeJson('scheduled-content-current.json',dir),entries={...prior?.entries},accepted:string[]=[];
 for(const [key,value]of Object.entries(updates)){
  let payload=value;
  if(!validKey(key))throw Error('Unknown scheduled content key');
  if(key.startsWith('analysis-')&&(payload?.data?.status!=='live'||snapshotIssues(key,payload).length))throw Error('Analysis not accepted by existing snapshot checks');
  if(key.startsWith('analysis-')){
   const previous=readScheduledContent(key,root)?.payload||readFreeJson(key+'.json',path.join(dir,'snapshots'))?.payload;
   if(analysisContentUnchanged(payload.data,previous?.data))continue;
   if(previous&&!snapshotIssues(key,previous).length&&analysisReplacementIssues(payload.data,previous.data).length)continue;
  }
  if(key.startsWith('news-')){
   const incoming=acceptedScheduledNews(key.slice(5),payload.articles||[]),saved=readScheduledContent(key,root);
   if(!incoming.length&&saved)continue;
   const articles=acceptedScheduledNews(key.slice(5),[...incoming,...(saved?.payload?.articles||[])]);
   if(!articles.length)throw Error('No independently verified substantive articles');
   if(saved&&!compareNewsContent(saved.payload.articles||[],articles).hasNewContent)continue;
   payload={...payload,success:true,articles};
  }
  const saved={key,payload,runId,updatedAt:new Date().toISOString(),sourceStatus:'scheduled-verified'},body=JSON.stringify(saved),sha256=hash(body);
  const target=path.join(dir,'snapshots/scheduled-content',sha256+'.json');fs.mkdirSync(path.dirname(target),{recursive:true});
  if(!fs.existsSync(target))fs.writeFileSync(target,body,{flag:'wx',mode:0o600});
  entries[key]={sha256};
  accepted.push(key);
 }
 if(accepted.length)writeFreeJson('scheduled-content-current.json',{version:1,runId,entries},dir);
 return {accepted};
}
