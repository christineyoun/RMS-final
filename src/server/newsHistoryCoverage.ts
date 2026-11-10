/** Read-only recovery of previously published, independently verified Market Intelligence.
 * Uses only immutable hash-checked local scheduled-content snapshots. This module never
 * discovers or invents news, contacts a provider, or writes into an RMS runtime directory.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {acceptedScheduledNews} from './scheduledContent.ts';
import {selectProcurementNews} from './newsProcurementSelection.ts';
import {recentMarketArticles} from './newsFreshnessPolicy.ts';
import {newsRetentionDays} from './newsRetentionPolicy.ts';

type News = {originalUrl:string;publishedAt:string;title:string;summary:string;[key:string]:any};
const sha256=(value:Buffer)=>createHash('sha256').update(value).digest('hex');
const SHA_FILE=/^[a-f0-9]{64}\.json$/;
const MAX_HISTORY_FILES=128;
const MAX_SNAPSHOT_BYTES=2_000_000;

/** An explicit, bounded history scan. Invalid snapshots fail closed individually. */
export function readVerifiedNewsHistory(commodity:string,root=process.cwd(),now=new Date()):News[]{
  if(!/^[a-z]+(?:-[a-z]+)*$/.test(commodity)||!Number.isFinite(now.getTime()))return [];
  const directory=path.join(root,'.rms-stage3','snapshots','scheduled-content');
  let files:string[];
  try{files=fs.readdirSync(directory).filter(name=>SHA_FILE.test(name));}
  catch{return [];}
  const ordered=files.flatMap(name=>{
    try{
      const s=fs.lstatSync(path.join(directory,name));
      return s.isFile()&&s.size<=MAX_SNAPSHOT_BYTES?[{name,modified:s.mtimeMs}]:[];
    }catch{return [];}
  }).sort((a,b)=>b.modified-a.modified).slice(0,MAX_HISTORY_FILES);
  const recovered:News[]=[];
  for(const file of ordered){
    try{
      const filename=path.join(directory,file.name);
      const bytes=fs.readFileSync(filename);
      if(bytes.length>MAX_SNAPSHOT_BYTES||sha256(bytes)!==file.name.slice(0,64))continue;
      const snapshot=JSON.parse(bytes.toString('utf8'));
      if(snapshot?.key!==`news-${commodity}`||!Array.isArray(snapshot?.payload?.articles))continue;
      const candidates=recentMarketArticles(snapshot.payload.articles,newsRetentionDays(commodity),now);
      // A historical file is not publisher verification. Require a publisher URL,
      // then re-apply the current evidence receipt, article body and editorial gates.
      const eligible=candidates.filter((article:any)=>{
        try{
          const url=new URL(String(article?.originalUrl||''));
          return (url.protocol==='https:'||url.protocol==='http:')&&
            !/^(?:news\.google\.com|vertexaisearch\.cloud\.google\.com)$/i.test(url.hostname);
        }catch{return false;}
      });
      recovered.push(...acceptedScheduledNews(commodity,eligible));
    }catch{/* Corrupt historical records cannot become publishable news. */}
  }
  return recovered;
}

/** Preserve current approved news in place; add only extra, valid, independent events. */
export function recoverVerifiedNewsCoverage<T extends News>(commodity:string,current:readonly T[],root=process.cwd(),now=new Date()):T[]{
  const timestamp=now.getTime();
  const selected=selectProcurementNews(commodity,[...current],timestamp);
  if(selected.length>=4)return selected;
  const historical=readVerifiedNewsHistory(commodity,root,now) as T[];
  const ranked=selectProcurementNews(commodity,[...selected,...historical],timestamp);
  let output=[...selected];
  const urls=()=>new Set(output.map(article=>article.originalUrl));
  // The ranked four may collide with pinned current news. Continue through
  // other strictly verified historical candidates instead of stopping early.
  const candidates=[...ranked,...historical.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt))];
  for(const next of candidates){
    if(output.length>=4)break;
    if(urls().has(next.originalUrl))continue;
    const trial=selectProcurementNews(commodity,[...output,next],timestamp);
    const currentUrls=urls();
    // Never trade an already displayed, approved current article for older backfill.
    if(trial.length!==output.length+1||!([...currentUrls].every(url=>trial.some(a=>a.originalUrl===url))))continue;
    output=trial;
  }
  return output;
}
