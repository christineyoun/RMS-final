/** Explicit weekday paid authorization; never imported by the public viewer.
 * Existing research/verification/transport are reused. No legacy control toggles. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {COMMODITY_IDS} from '../services/commodityQuoteSource.ts';
import {freeRefreshDay} from './freeSourceRefresh.ts';
import {withAuthorizedStage3Run,type Stage3RunContext} from './stage3Runtime.ts';
import {acquirePaidLease,hasOutstandingPaidRequest} from './paidJobLease.ts';
import {snapshotIssues} from './mvpEvidence.ts';
import {acceptedScheduledNews,publishScheduledContent} from './scheduledContent.ts';
import {gcsRead,gcsWrite} from './cloudPublication.ts';
import {scheduledAnalysisEvidence} from './scheduledEvidence.ts';
import {assertPaidRunActive} from './paidRequestTransport.ts';
import {savedGeminiBudget,type KrwBudgetPolicy} from './geminiKrwBudget.ts';

export type ScheduledAiPolicy=KrwBudgetPolicy&{version:'weekday-ai-krw-v2';enabled:boolean;approvalId:string;validFrom:string;validThrough:string;analysisModel:string;newsModel:string;maxDailyCalls:number};
export const policyHash=(p:ScheduledAiPolicy)=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
export function validateScheduledPolicy(p:ScheduledAiPolicy,now=new Date()){
 const day=freeRefreshDay(now).day;
 const civil=(s:string)=>/^20\d{2}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 if(p?.version!=='weekday-ai-krw-v2'||p.enabled!==true||! /^[a-zA-Z0-9_-]{12,100}$/.test(p.approvalId)||/^(PENDING|REPLACE)/i.test(p.approvalId)||
  !civil(p.validFrom)||!civil(p.validThrough)||day<p.validFrom||day>p.validThrough||
  !Number.isInteger(p.maxDailyCalls)||p.maxDailyCalls<1||p.maxDailyCalls>24||!Number.isFinite(p.maxDailyEstimatedKrw)||p.maxDailyEstimatedKrw<=0||p.maxDailyEstimatedKrw>5000||p.fxFloorKrwPerUsd<1500||!Number.isFinite(p.fxFloorKrwPerUsd)||p.fxSafetyMarginPct<20||!Number.isFinite(p.fxSafetyMarginPct)||
  ! /^[a-zA-Z0-9._-]+$/.test(p.analysisModel)||! /^[a-zA-Z0-9._-]+$/.test(p.newsModel))throw Error('Scheduled AI policy missing, disabled, expired or invalid');
 return p;
}
export function configuredScheduledPolicy(){
 const file=process.env.RMS_SCHEDULED_AI_POLICY_FILE;if(!file)return null;
 const p=validateScheduledPolicy(JSON.parse(fs.readFileSync(file,'utf8')));
 if(!process.env.CLOUD_RUN_JOB||process.env.RMS_CLOUD_FREE_JOB!=='1'||process.env.RMS_SCHEDULED_AI_APPROVAL!==policyHash(p))throw Error('Private scheduled AI policy requires explicit matching budget approval');
 if(!process.env.GEMINI_API_KEY)throw Error('Approved scheduled policy requires its private Gemini secret');
 return p;
}
export type DailyAiJournal={version:2;day:string;policyHash:string;budget:ReturnType<typeof savedGeminiBudget>;phases:Record<string,{status:string;error?:string}>;accepted?:Record<string,any>;requests:Array<{runId?:string;phase:string;attempt:number;model:string;reservedUsd:number;reservedKrw?:number;estimatedUsd?:number;estimatedKrw?:number}>};
export interface ScheduledJournalStore{read:()=>Promise<DailyAiJournal|null>;save:(j:DailyAiJournal)=>Promise<void>}
/** Under the existing workflow lease. Independent of publication promotion so a
 * crash/failed upload cannot erase paid reservations and silently spend again. */
export function cloudScheduledJournal(day:string):ScheduledJournalStore{
 let generation='0';const bucket=process.env.RMS_STATE_BUCKET!,key='control/paid-daily/'+day+'.json';
 return {async read(){try{const r=await gcsRead(bucket,key);generation=r.generation!;return JSON.parse(Buffer.from(r.bytes).toString());}catch(e){if(/HTTP 404$/.test((e as Error).message))return null;throw e;}},async save(j){const r=await gcsWrite(bucket,key,Buffer.from(JSON.stringify(j)),generation);generation=String(r.generation);}};
}
const charged=(j:DailyAiJournal)=>j.requests.reduce((n,r)=>n+Math.max(r.reservedUsd,r.estimatedUsd||0),0);
const chargedKrw=(j:DailyAiJournal,rate:number)=>j.requests.reduce((n,r)=>n+Math.ceil(Math.max(r.reservedUsd,r.estimatedUsd||0)*rate),0);
export async function runScheduledAi(policy:ScheduledAiPolicy,store:ScheduledJournalStore,options:{now?:()=>Date;root?:string;news?:(id:string)=>Promise<any[]>;analysis?:(id:string)=>Promise<any>;commit?:(updates:Record<string,any>,runId:string)=>void;afterCommodity?:()=>Promise<void>}={}){
 const now=options.now||(()=>new Date()),root=options.root||process.cwd(),t=freeRefreshDay(now());validateScheduledPolicy(policy,now());
 if(!t.weekday||t.hour<9)throw Error('Scheduled AI requires weekday 09:00 KST or later');
 if(hasOutstandingPaidRequest())throw Error('Unresolved paid transport requires operator review');
 const release=acquirePaidLease('analysis-job','weekday-'+t.day);
 try{
  let journal=await store.read();const hash=policyHash(policy),budget=savedGeminiBudget(policy,root,now());
  if(journal&&(journal.version!==2||journal.day!==t.day||journal.policyHash!==hash||!journal.budget||!Number.isFinite(journal.budget.safetyKrwPerUsd)||journal.budget.safetyKrwPerUsd<1800||!Number.isFinite(journal.budget.maxEstimatedUsd)||journal.budget.maxEstimatedUsd<=0||!Array.isArray(journal.requests)||!journal.phases||journal.requests.some(r=>!Number.isInteger(r.attempt)||r.attempt<1||!Number.isFinite(r.reservedUsd)||r.reservedUsd<=0||r.estimatedUsd!==undefined&&(!Number.isFinite(r.estimatedUsd)||r.estimatedUsd<0))))throw Error('Daily paid journal policy/identity mismatch; no requests allowed; never clear spending to reauthorize');
  // Never loosen the day's exchange-rate safety threshold after reservations.
  if(journal){budget.safetyKrwPerUsd=Math.max(budget.safetyKrwPerUsd,journal.budget.safetyKrwPerUsd);budget.maxEstimatedUsd=Math.min(budget.maxEstimatedUsd,journal.budget.maxEstimatedUsd);journal.budget=budget;}
  journal=journal||{version:2,day:t.day,policyHash:hash,budget,phases:{},requests:[]};await store.save(journal);
  const updates:Record<string,any>={...journal.accepted},runId='weekday-ai-'+t.day+'-'+hash.slice(0,12);
  const news=options.news|| (async id=>(await import('./marketIntelligenceService.ts')).marketIntelligenceService.getCommodityIntelligence(id,true));
  const analysis=options.analysis|| (async id=>({success:true,data:await(await import('./liveAiAnalysisService.ts')).getGroundedAiAnalysis(id,true)}));
  for(const id of COMMODITY_IDS){
   for(const kind of ['news','analysis'] as const){
    const phase=kind+'-'+id;if(journal.phases[phase])continue; // attempted = consumed, including unknown outcome after a crash
    if(journal.requests.length>=policy.maxDailyCalls||charged(journal)>=budget.maxEstimatedUsd||chargedKrw(journal,budget.safetyKrwPerUsd)>=policy.maxDailyEstimatedKrw)break;
    journal.phases[phase]={status:'started'};await store.save(journal);
    const ctx:Stage3RunContext={runId:runId+'-'+phase,scheduledPolicyHash:hash,analysisCommodity:id,analysisModel:kind==='news'?policy.newsModel:policy.analysisModel,permitted:true,attempts:0,successfulCalls:0,maxCalls:kind==='news'?2:1,estimatedUsd:0,maxEstimatedUsd:budget.maxEstimatedUsd-charged(journal),requestDeadlineMs:60000,deadlineAt:+now()+180000,abortController:new AbortController(),evidenceMode:'search',
     onReserve:async r=>{
      if(journal!.requests.length>=policy.maxDailyCalls||charged(journal!)+r.reservedUsd>budget.maxEstimatedUsd||chargedKrw(journal!,budget.safetyKrwPerUsd)+Math.ceil(r.reservedUsd*budget.safetyKrwPerUsd)>policy.maxDailyEstimatedKrw)throw Error('Combined daily KRW Gemini budget exhausted; previous content retained');
      journal!.requests.push({runId:ctx.runId,phase,attempt:r.attempt,model:r.model,reservedUsd:r.reservedUsd,reservedKrw:Math.ceil(r.reservedUsd*budget.safetyKrwPerUsd)});await store.save(journal!);
     },onUsage:async r=>{const request=journal!.requests.find(x=>x.phase===phase&&x.attempt===r.attempt)!;request.estimatedUsd=r.estimatedUsd;request.estimatedKrw=Math.ceil(r.estimatedUsd*budget.safetyKrwPerUsd);await store.save(journal!);}};
    try{
     if(kind==='analysis'){ctx.evidenceMode='verified-only';ctx.scheduledEvidence=scheduledAnalysisEvidence(id,updates['news-'+id]?.articles,root,now());}
     const payload=await withAuthorizedStage3Run(ctx,async()=>kind==='news'?{success:true,articles:await news(id)}:await analysis(id));
     assertPaidRunActive(ctx);
     if(!ctx.successfulCalls||ctx.estimatedUsd>ctx.maxEstimatedUsd)throw Error('No successful metered generation within estimated budget');
     if(kind==='news'){
      const accepted=acceptedScheduledNews(id,payload.articles||[]);if(!accepted.length)throw Error('No accepted, independently verified substantive news');payload.articles=accepted;
     }else if(snapshotIssues(phase,payload).length||payload.data?.status!=='live')throw Error('Existing analysis acceptance failed');
     updates[phase]=payload;journal.accepted={...updates};journal.phases[phase]={status:'accepted'};
    }catch(error){journal.phases[phase]={status:'retained-previous',error:error instanceof Error?error.name:'generation-failed'};}
    finally{ctx.cancelled=true;ctx.abortController!.abort();await store.save(journal);}
    if(hasOutstandingPaidRequest())throw Error('Outstanding provider operation; no additional paid phases allowed');
   }
  }
  // All accepted content is promoted with one manifest write. Failed items keep
  // their prior manifest entry or original approved snapshot.
  (options.commit||((u,r)=>publishScheduledContent(u,r,root)))(updates,runId);
  return {day:t.day,budget,phases:journal.phases,attempts:journal.requests.length,estimatedUsd:charged(journal),estimatedKrw:chargedKrw(journal,budget.safetyKrwPerUsd),accepted:Object.keys(updates)};
 }finally{release();}
}
