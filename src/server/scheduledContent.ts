/** Atomic selection of existing-format approved news/analysis snapshots.
 * Readers never collect, generate, or mutate. Original snapshots remain retained. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {writeFreeJson,readFreeJson} from './freeDailyPublication.ts';
import {reviewMarketSummary,hasMarketArticleBody} from './newsEvidenceQuality.ts';
import {assessNewsSummary} from '../utils/newsSummaryQuality.ts';
import {selectProcurementNews} from './newsProcurementSelection.ts';
import {recentMarketArticles} from './newsFreshnessPolicy.ts';
import {newsRetentionDays} from './newsRetentionPolicy.ts';
import {snapshotIssues} from './mvpEvidence.ts';
import {COMMODITY_IDS} from '../services/commodityQuoteSource.ts';
import {analysisReplacementIssues} from './analysisPublicationQuality.ts';
import {recoverVerifiedNewsCoverage} from './newsHistoryCoverage.ts';
import {withScheduledPublicationLock} from './publicationLock.ts';
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
export function readScheduledContent(key:string,root=process.cwd()):any|null{
 if(!validKey(key))return null;
 try{
  const ref=readFreeJson('scheduled-content-current.json',directory(root))?.entries?.[key];
  if(!ref||! /^[a-f0-9]{64}$/.test(ref.sha256))return null;
  const bytes=fs.readFileSync(path.join(directory(root),'snapshots/scheduled-content',ref.sha256+'.json'),'utf8');
  if(hash(bytes)!==ref.sha256)return null;
  const saved=JSON.parse(bytes);if(saved.key!==key)return null;
  if(key.startsWith('analysis-')&&snapshotIssues(key,saved.payload).length)return null;
  if(key.startsWith('news-')){const articles=acceptedScheduledNews(key.slice(5),saved.payload.articles||[]);if(!articles.length)return null;return {...saved,payload:{...saved.payload,articles}};}
  return saved;
 }catch{return null;}
}
/** All publication read/merge/write operations share one cross-process lock. */
export function publishScheduledContent(updates:Record<string,any>,runId:string,root=process.cwd()){
 const dir=directory(root);
 return withScheduledPublicationLock(dir,()=>{
  const prior=readFreeJson('scheduled-content-current.json',dir);
  if(fs.existsSync(path.join(dir,'scheduled-content-current.json'))&&!prior?.entries)throw Error('Existing publication manifest is invalid; refusing overwrite');
  const entries={...prior?.entries},accepted:string[]=[];
  for(const [key,value]of Object.entries(updates)){
   let payload=value;
   if(!validKey(key))throw Error('Unknown scheduled content key');
   if(key.startsWith('analysis-')&&(payload?.data?.status!=='live'||snapshotIssues(key,payload).length))throw Error('Analysis not accepted by existing snapshot checks');
   if(key.startsWith('analysis-')){
    const previous=readScheduledContent(key,root)?.payload||readFreeJson(key+'.json',path.join(dir,'snapshots'))?.payload;
    if(previous&&!snapshotIssues(key,previous).length&&analysisReplacementIssues(payload.data,previous.data).length)continue;
   }
   if(key.startsWith('news-')){
    const commodity=key.slice(5);
    const incoming=acceptedScheduledNews(commodity,recentMarketArticles(payload.articles||[],newsRetentionDays(commodity)));
    const saved=readScheduledContent(key,root);
    const current=saved?.payload?.articles||[];
    // A valid immutable prior publication must not disappear simply because a
    // newer refresh saw only the reduced manifest. Reuse the same bounded,
    // evidence-checked recovery policy already used by the read-only news route.
    const merged=acceptedScheduledNews(commodity,[...incoming,...current]);
    const articles=recoverVerifiedNewsCoverage(commodity,merged,root);
    if(!articles.length){
     if(saved)continue;
     throw Error('No independently verified substantive articles');
    }
    // Avoid a publication write when no verified articles or content changed.
    if(saved&&samePublishedNews(current,articles))continue;
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
 });
}

/** Compare publisher data, not volatile review metadata or ordering. */
function samePublishedNews(previous:any[],next:any[]):boolean{
 if(previous.length!==next.length)return false;
 const fingerprint=(a:any)=>JSON.stringify([a.originalUrl,a.publishedAt,a.sourceHeadline,a.title,a.summary]);
 const before=previous.map(fingerprint).sort(),after=next.map(fingerprint).sort();
 return before.every((value,i)=>value===after[i]);
}
