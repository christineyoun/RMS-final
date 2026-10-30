/** Original archival records only. No Korean model summary becomes evidence. */
import {createHash} from 'node:crypto';
import {verifiedScheduledArticleFact} from '../scheduledEvidence.ts';
import type {AnalysisEvidence} from '../analysisEvidence.ts';
export function completeBriefTestEvidence(row:any,archive:any,now:Date):AnalysisEvidence{
 const evidence:AnalysisEvidence=structuredClone(row.evidence);
 if(row.id==='tapioca-starch'){
  const original=archive.news.find((n:any)=>n.id===row.id).inputs.find((i:any)=>i.rawId==='procurement-tapioca');
  const e={originalUrl:original.originalUrl,publishedAt:original.publishedAt,sourceHeadline:original.rawTitle,excerpt:original.rawSnippet,verifiedAt:original.retrievedAt};
  const fact=verifiedScheduledArticleFact(row.id,{originalUrl:e.originalUrl,publishedAt:e.publishedAt,sourceHeadline:e.sourceHeadline,linkStatus:'verified',verifiedSourceEvidence:e},now);
  if(!fact)throw Error('Original archived verified publisher input unavailable or invalid');
  if(fact.recordSha256!==createHash('sha256').update(JSON.stringify(e)).digest('hex'))throw Error('Archived source binding mismatch');
  evidence.facts.push(fact);
 }
 return evidence;
}
