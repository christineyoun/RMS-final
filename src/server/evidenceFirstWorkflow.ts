/** Operational non-paid composition. The existing scheduler/storage/readers stay
 * authoritative. No provider, paid context, approval or model invocation. */
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {COMMODITY_IDS} from '../services/commodityQuoteSource.ts';
import {collectEvidenceFirstPublishers} from './evidenceFirstPublishers.ts';
import {withFreeNetwork} from './freeRefreshNetwork.ts';
import {scheduledAnalysisEvidence} from './scheduledEvidence.ts';
import {composeEvidenceFirstReport,publishEvidenceFirstReport} from './evidenceFirstReport.ts';
import {renderedEvidenceReport} from './evidenceReportRendering.tsx';
import {readScheduledContent} from './scheduledContent.ts';
import {snapshotIssues} from './mvpEvidence.ts';
const file=(root:string)=>path.join(root,'.rms-stage3/evidence-first-refresh.json');
function prior(id:string,root:string){
 const saved=readScheduledContent('analysis-'+id,root);if(saved)return saved.payload.data;
 try{const p=JSON.parse(fs.readFileSync(path.join(root,'.rms-stage3/snapshots/analysis-'+id+'.json'),'utf8')).payload;return snapshotIssues('analysis-'+id,p).length?null:p.data;}catch{return null;}
}
export function evidenceFirstStatus(root=process.cwd()){
 let saved:any={};try{saved=JSON.parse(fs.readFileSync(file(root),'utf8'));}catch{}
 return {kind:'non-paid-evidence-first',paidCalls:0,running:active.has(path.resolve(root)),results:COMMODITY_IDS.map(id=>{
  const selected=prior(id,root),last=saved.results?.find((r:any)=>r.commodity===id);
  return {commodity:id,status:last?.status||(selected?'retained':'unavailable'),issues:last?.issues||[],generatedAt:selected?.generatedAt||null,model:selected?.model||null,evidenceDates:[...new Set((selected?.evidenceAudit?.facts||[]).map((f:any)=>f.observedAt))]};
 })};
}
async function collect(id:string){
 const {dailyFreeSourceJobs}=await import('./freeDailyJobs.ts');
 const keys=new Set([id+'-history',id+'-world',id+'-news',...(id==='potato-starch'?['potato-production-history','potato-production-regions','potato-export-quote']:[])]);
 const jobs=dailyFreeSourceJobs().filter(j=>keys.has(j.key));const results=[];
 for(const job of jobs)try{const value=await job.run();results.push({key:job.key,status:value.lastError?'partial':'completed'});}catch{results.push({key:job.key,status:'failed'});}
 if(id==='potato-starch'){const {collectPotatoCompositionEvidence}=await import('./potatoCompositionEvidence.ts');const official=await collectPotatoCompositionEvidence();results.push({key:'potato-official-composition',status:official.evidence.facts.length===2?'completed':'partial'});}
 if(id!=='soybean'){const sources=await collectEvidenceFirstPublishers(id);results.push({key:id+'-analysis-originals',status:sources.some(r=>r.status==='verified')?'completed':'failed'});}
 return results;
}
/** Immutable HTML receipts keep their original verification date. A current
 * successful collector check may reverify the exact same content hash. Retained
 * or failed checks never authorize freshness. */
export function currentDriverVerification(fact:{sourceUrl:string;recordSha256?:string;verifiedAt:string},id:string,root:string,after:string){
 const cutoff=Date.parse(after)-1000;
 if(Date.parse(fact.verifiedAt)>=cutoff)return true;
 try{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'.rms-stage3',id+'-news-verified.json'),'utf8'));
  return Date.parse(manifest.checkedAt)>=cutoff&&manifest.results?.some((r:any)=>r.url===fact.sourceUrl&&r.status==='verified')&&manifest.articles?.some((a:any)=>a.originalUrl===fact.sourceUrl&&a.receiptSha256===fact.recordSha256);
 }catch{return false;}
}
const active=new Map<string,Promise<any>>();
export function refreshEvidenceFirst(ids:readonly string[],options:{root?:string;collect?:typeof collect;now?:()=>Date;reuseCollected?:boolean;verifiedAfter?:string;evidence?:typeof scheduledAnalysisEvidence}={}){
 const root=options.root||process.cwd(),scope=path.resolve(root);
 if(!ids.length||ids.some(id=>!COMMODITY_IDS.includes(id as any))||new Set(ids).size!==ids.length)throw Error('Invalid evidence-first commodity selection');
 if(active.has(scope))return active.get(scope)!;
 // Real collectors resolve their stores from process.cwd(); never mix roots.
 if(!options.collect&&path.resolve(root)!==process.cwd())throw Error('Collector runtime root mismatch');
 const lock=path.join(root,'.rms-stage3/evidence-first-refresh.lock'),token=randomUUID();fs.mkdirSync(path.dirname(lock),{recursive:true});
 const claim=()=>fs.writeFileSync(lock,JSON.stringify({pid:process.pid,token}),{flag:'wx',mode:0o600});
 try{claim();}catch(error){
  // Only a demonstrably dead owner may be recovered. Corrupt leases and
  // permission errors fail closed; never discard a live process's work.
  const recovery=lock+'.recovery';let ownRecovery=false;
  try{
   fs.writeFileSync(recovery,JSON.stringify({pid:process.pid,token}),{flag:'wx',mode:0o600});ownRecovery=true;
   const previous=JSON.parse(fs.readFileSync(lock,'utf8'));
   if(!Number.isInteger(previous.pid)||previous.pid<=0||typeof previous.token!=='string')throw error;
   let dead=false;try{process.kill(previous.pid,0);}catch(e){dead=(e as NodeJS.ErrnoException).code==='ESRCH';}
   if(!dead||JSON.parse(fs.readFileSync(lock,'utf8')).token!==previous.token)throw error;
   fs.renameSync(lock,lock+'.abandoned-'+token);claim();
  }finally{if(ownRecovery&&JSON.parse(fs.readFileSync(recovery,'utf8')).token===token)fs.unlinkSync(recovery);}
 }
 const run=withFreeNetwork(async()=>{
  const startedAt=(options.now?.()||new Date()).toISOString(),verifiedAfter=options.verifiedAfter||startedAt,results:any[]=[];
  for(const id of ids){
   let sourceResults:any[]=[];
   try{
    if(!options.reuseCollected)sourceResults=await(options.collect||collect)(id);
    else if(!options.collect){if(id==='potato-starch'){const {collectPotatoCompositionEvidence}=await import('./potatoCompositionEvidence.ts');await collectPotatoCompositionEvidence(root);}if(id!=='soybean')await collectEvidenceFirstPublishers(id,root);}
    const now=options.now?.()||new Date(),evidence=await(options.evidence||scheduledAnalysisEvidence)(id,undefined,root,now);
    const candidate=composeEvidenceFirstReport(evidence,now);
    if(candidate.status!=='composed'){results.push({commodity:id,status:prior(id,root)?'retained':'unavailable',issues:candidate.issues,sourceResults});continue;}
    // Old archived packets alone must never become a newly refreshed report.
    const drivers=candidate.trace.filter(t=>t.role==='bullish'||t.role==='bearish');
    const fresh=drivers.every(t=>t.evidenceIds.every(eid=>evidence.facts.some(f=>f.id===eid&&currentDriverVerification(f,id,root,verifiedAfter))));
    if(!fresh){results.push({commodity:id,status:prior(id,root)?'retained':'unavailable',issues:['current-original-driver-verification-required'],sourceResults});continue;}
    const published=publishEvidenceFirstReport(evidence,now,root,'nonpaid-'+randomUUID(),renderedEvidenceReport);
    const visible=(r:any)=>JSON.stringify([r?.deskRecommendation,r?.executiveSummary,r?.bullishFactors,r?.bearishFactors,r?.watchItems]);
    const protectedPrior=published.status==='composed'&&!published.published&&visible(published.report)!==visible(published.selected?.payload.data);
    results.push({commodity:id,status:published.status==='composed'?(published.published?'updated':protectedPrior?'retained':'unchanged'):(prior(id,root)?'retained':'unavailable'),issues:published.status==='composed'?(protectedPrior?['last-good-quality-protection']:[]):published.issues,sourceResults});
   }catch{results.push({commodity:id,status:prior(id,root)?'retained':'unavailable',issues:['source-composition-or-publication-failed'],sourceResults});}
  }
  const previous=evidenceFirstStatus(root).results;
  const merged=[...previous.filter((r:any)=>!ids.includes(r.commodity)),...results];
  const target=file(root);fs.mkdirSync(path.dirname(target),{recursive:true});const tmp=target+'.'+randomUUID()+'.tmp';fs.writeFileSync(tmp,JSON.stringify({startedAt,finishedAt:(options.now?.()||new Date()).toISOString(),results:merged},null,2),{mode:0o600});fs.renameSync(tmp,target);
  return evidenceFirstStatus(root);
 }).then(({value})=>({...value,running:false})).finally(()=>{active.delete(scope);try{if(JSON.parse(fs.readFileSync(lock,'utf8')).token===token)fs.unlinkSync(lock);}catch{}});active.set(scope,run);return run;
}
