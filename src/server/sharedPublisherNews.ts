/** Non-paid news publication from immutable, independently verified originals.
 * AI evidence is reused as provenance, not as automatic article eligibility. */
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {collectEvidenceFirstPublishers,collectedPublisherEvidence,readPublisherReceipt} from './evidenceFirstPublishers.ts';
import {sourcePropositions} from './analysisSourcePropositions.ts';
import {assessNewsSummary} from '../utils/newsSummaryQuality.ts';
import {eligibleMarketIssue} from '../utils/marketIssueEligibility.ts';
import {selectProcurementNews} from './newsProcurementSelection.ts';
import {readFreeJson,writeFreeJson} from './freeDailyPublication.ts';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const dir=(root:string)=>path.join(root,'.rms-stage3/shared-publisher-news');
const canonical=(s:string)=>{const u=new URL(s);u.hash='';return u.href.replace(/\/$/,'');};
function article(f:any){
 const facts=sourcePropositions(f).filter(p=>p.role==='fact');
 const summary=[...new Set(facts.map(p=>p.text))].slice(0,3).join(' ');
 return {id:'source-'+hash(f.sourceUrl).slice(0,16),title:f.sourceTitle,summary,originalUrl:f.sourceUrl,publishedAt:f.observedAt,sourceName:new URL(f.sourceUrl).hostname.replace(/^www\./,''),sourceType:'publisher',linkStatus:'verified',receiptSha256:f.recordSha256,sourceHeadline:f.sourceTitle,sourceBinding:'original-propositions-v1',verifiedAt:f.verifiedAt};
}
function checked(a:any,id:string,root:string,now:Date){
 if(!eligibleMarketIssue(a,+now))return {issue:'old-or-invalid-article-date'};
 // Rebuild from the selected immutable receipt, never trust a stored summary.
 const fact=readPublisherReceipt(id,root,{url:a.originalUrl,sha256:a.receiptSha256,publishedAt:a.publishedAt},a.verifiedAt,now);
 if(!fact)return {issue:'receipt-integrity-or-original-verification-failed'};
 const rebuilt=article(fact);
 if(rebuilt.summary!==a.summary||rebuilt.publishedAt!==a.publishedAt||rebuilt.title!==a.title)return {issue:'stored-article-binding-mismatch'};
 const quality=assessNewsSummary(a.summary,a.title,id);return quality.pass?{article:rebuilt}:{issue:quality.reason};
}
export function readSharedPublisherNews(id:string,root=process.cwd(),now=new Date()):any[]{
 const state=readFreeJson(id+'.json',dir(root));
 return (state?.articles||[]).flatMap((a:any)=>{const r=checked(a,id,root,now);return r.article?[r.article]:[];});
}
export async function refreshSharedPublisherNews(id:string,root=process.cwd(),now=new Date(),options:{collect?:typeof collectEvidenceFirstPublishers}={}){
 const previous=readSharedPublisherNews(id,root,now),diagnostics:any[]=[];
 const verification=await(options.collect||collectEvidenceFirstPublishers)(id,root,now);
 const facts=collectedPublisherEvidence(id,root,now),accepted:any[]=[],seen=new Set<string>();
 if(!verification.length)diagnostics.push({reason:'no-eligible-original-candidates'});
 for(const row of verification)if(row.status!=='verified')diagnostics.push({url:row.url,reason:row.reason});
 for(const f of facts){const a=article(f),key=canonical(a.originalUrl);
  if(!eligibleMarketIssue(a,+now)){diagnostics.push({url:a.originalUrl,reason:'old-article'});continue;}
  if(seen.has(key)){diagnostics.push({url:a.originalUrl,reason:'duplicate'});continue;}seen.add(key);
  const quality=assessNewsSummary(a.summary,a.title,id);if(!quality.pass){diagnostics.push({url:a.originalUrl,reason:quality.reason==='missing-korean-summary'?'no-supported-korean-source-propositions':quality.reason});continue;}
  accepted.push(a);
 }
 // Preserve last accepted rows, but revalidate receipt identity on every read.
 const merged=[...accepted,...previous.filter(a=>!accepted.some(b=>canonical(b.originalUrl)===canonical(a.originalUrl)))];
 const selected=selectProcurementNews(id,merged,+now);
 const signature=(a:any)=>JSON.stringify([canonical(a.originalUrl),a.publishedAt,a.title,a.summary]);
 const old=new Map(previous.map(a=>[canonical(a.originalUrl),signature(a)]));
 const changes={added:selected.filter(a=>!old.has(canonical(a.originalUrl))).map(a=>a.originalUrl),updated:selected.filter(a=>old.has(canonical(a.originalUrl))&&old.get(canonical(a.originalUrl))!==signature(a)).map(a=>a.originalUrl),unchanged:selected.filter(a=>old.get(canonical(a.originalUrl))===signature(a)).map(a=>a.originalUrl),removed:previous.filter(a=>!selected.some(b=>canonical(b.originalUrl)===canonical(a.originalUrl))).map(a=>a.originalUrl)};
 const prior=readFreeJson(id+'.json',dir(root)),changed=changes.added.length+changes.updated.length+changes.removed.length>0;
 const state={version:1,commodity:id,checkedAt:now.toISOString(),publishedAt:changed?now.toISOString():prior?.publishedAt||null,articles:selected,verification,diagnostics,changes};
 writeFreeJson(id+'.json',state,dir(root));return state;
}
