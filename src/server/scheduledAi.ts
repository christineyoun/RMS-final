/** Explicit weekday paid authorization; never imported by the public viewer.
 * Existing research/verification/transport are reused. No legacy control toggles. */
import {compareNewsContent} from './newsContentChanges.ts';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {COMMODITY_IDS} from '../services/commodityQuoteSource.ts';
import {freeRefreshDay} from './freeSourceRefresh.ts';
import {withAuthorizedStage3Run,type Stage3RunContext} from './stage3Runtime.ts';
import {acquirePaidLease,hasOutstandingPaidRequest} from './paidJobLease.ts';
import {snapshotIssues} from './mvpEvidence.ts';
import {selectProcurementNews} from './newsProcurementSelection.ts';
import {acceptedScheduledNews,publishScheduledContent,readScheduledContent} from './scheduledContent.ts';
import {analysisReplacementIssues} from './analysisPublicationQuality.ts';
import {gcsRead,gcsWrite} from './cloudPublication.ts';
import {scheduledAnalysisEvidence} from './scheduledEvidence.ts';
import {assertPaidRunActive,recordPaidRequestEvent,PaidRequestError} from './paidRequestTransport.ts';
import {savedGeminiBudget,type KrwBudgetPolicy} from './geminiKrwBudget.ts';

export type ScheduledAiPolicy=KrwBudgetPolicy&{version:'weekday-ai-prepaid-v3';enabled:boolean;approvalId:string;analysisModel:string;newsModel:string;monthlyOperatingBudgetKrw:number;funding:'manual-prepaid';automaticTopUp:false;automaticPayment:false};
export const policyHash=(p:ScheduledAiPolicy)=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
export function validateScheduledPolicy(p:ScheduledAiPolicy,_now=new Date()){
 if(p?.version!=='weekday-ai-prepaid-v3'||p.enabled!==true||! /^[a-zA-Z0-9_-]{12,100}$/.test(p.approvalId)||/^(PENDING|REPLACE)/i.test(p.approvalId)||
  p.funding!=='manual-prepaid'||p.automaticTopUp!==false||p.automaticPayment!==false||!Number.isFinite(p.monthlyOperatingBudgetKrw)||p.monthlyOperatingBudgetKrw<=0||
  !Number.isFinite(p.fxFloorKrwPerUsd)||p.fxFloorKrwPerUsd<1500||!Number.isFinite(p.fxSafetyMarginPct)||p.fxSafetyMarginPct<20||
  ! /^[a-zA-Z0-9._-]+$/.test(p.analysisModel)||! /^[a-zA-Z0-9._-]+$/.test(p.newsModel))throw Error('Scheduled AI policy missing, disabled or invalid');
 return p;
}
export function configuredScheduledPolicy(){
 const file=process.env.RMS_SCHEDULED_AI_POLICY_FILE;if(!file)return null;
 const p=validateScheduledPolicy(JSON.parse(fs.readFileSync(file,'utf8')));
 if(!process.env.CLOUD_RUN_JOB||process.env.RMS_CLOUD_FREE_JOB!=='1'||process.env.RMS_SCHEDULED_AI_APPROVAL!==policyHash(p))throw Error('Private scheduled AI policy requires explicit matching policy approval');
 // Runtime volume read lets free collection start even when the secret is inaccessible.
 if(!process.env.GEMINI_API_KEY&&process.env.RMS_GEMINI_API_KEY_FILE)process.env.GEMINI_API_KEY=fs.readFileSync(process.env.RMS_GEMINI_API_KEY_FILE,'utf8').trim();
 if(!process.env.GEMINI_API_KEY)throw Error('Approved scheduled policy requires its private Gemini secret');
 return p;
}
export type DailyAiJournal={version:2;day:string;policyHash:string;budget:ReturnType<typeof savedGeminiBudget>;phases:Record<string,{status:string;error?:string;reason?:string}>;accepted?:Record<string,any>;requests:Array<{runId?:string;phase:string;attempt:number;model:string;reservedUsd:number;reservedKrw?:number|null;estimatedUsd?:number;estimatedKrw?:number|null}>};
export interface ScheduledJournalStore{read:()=>Promise<DailyAiJournal|null>;save:(j:DailyAiJournal)=>Promise<void>}
/** Under the existing workflow lease. Independent of publication promotion so a
 * crash/failed upload cannot erase paid reservations and silently spend again. */
export function cloudScheduledJournal(day:string):ScheduledJournalStore{
 let generation='0';const bucket=process.env.RMS_STATE_BUCKET!,key='control/paid-daily/'+day+'.json';
 return {async read(){try{const r=await gcsRead(bucket,key);generation=r.generation!;return JSON.parse(Buffer.from(r.bytes).toString());}catch(e){if(/HTTP 404$/.test((e as Error).message))return null;throw e;}},async save(j){const r=await gcsWrite(bucket,key,Buffer.from(JSON.stringify(j)),generation);generation=String(r.generation);}};
}
const charged=(j:DailyAiJournal)=>j.requests.reduce((n,r)=>n+Math.max(r.reservedUsd,r.estimatedUsd||0),0);
const chargedKrw=(j:DailyAiJournal,rate:number|null)=>rate===null?null:j.requests.reduce((n,r)=>n+Math.ceil(Math.max(r.reservedUsd,r.estimatedUsd||0)*rate),0);
/** All commodities are considered for news before any analysis; rotate daily order. */
export function scheduledPhasePlan(day:string){
 const offset=Math.floor(Date.parse(day+'T00:00:00Z')/86400000)%COMMODITY_IDS.length;
 const ids=[...COMMODITY_IDS.slice(offset),...COMMODITY_IDS.slice(0,offset)];
 return (['news','analysis'] as const).flatMap(kind=>ids.map(id=>({id,kind})));
}
export async function runScheduledAi(policy:ScheduledAiPolicy,store:ScheduledJournalStore,options:{now?:()=>Date;root?:string;news?:(id:string)=>Promise<any[]>;analysis?:(id:string)=>Promise<any>;commit?:(updates:Record<string,any>,runId:string)=>void;priorNews?:Record<string,any[]>;afterCommodity?:()=>Promise<void>}={}){
 const now=options.now||(()=>new Date()),root=options.root||process.cwd(),t=freeRefreshDay(now());validateScheduledPolicy(policy,now());
 if(!t.weekday||t.hour<9)throw Error('Scheduled AI requires weekday 09:00 KST or later');
 if(hasOutstandingPaidRequest())throw Error('Unresolved paid transport requires operator review');
 const release=acquirePaidLease('analysis-job','weekday-'+t.day);
 try{
  let journal=await store.read();const hash=policyHash(policy),budget=savedGeminiBudget(policy,root,now());
  if(journal&&(journal.version!==2||journal.day!==t.day||journal.policyHash!==hash||!Array.isArray(journal.requests)||!journal.phases||journal.requests.some(r=>!Number.isInteger(r.attempt)||r.attempt<1||!Number.isFinite(r.reservedUsd)||r.reservedUsd<=0||r.estimatedUsd!==undefined&&(!Number.isFinite(r.estimatedUsd)||r.estimatedUsd<0))))throw Error('Daily paid journal policy/identity mismatch; no requests allowed; never clear spending to reauthorize');
  if(journal)journal.budget=budget; // FX telemetry never gates execution.
  journal=journal||{version:2,day:t.day,policyHash:hash,budget,phases:{},requests:[]};await store.save(journal);
  const updates:Record<string,any>={...journal.accepted},runId='weekday-ai-'+t.day+'-'+hash.slice(0,12);
  const news=options.news|| (async id=>(await import('./marketIntelligenceService.ts')).marketIntelligenceService.getCommodityIntelligence(id,true));
  const analysis=options.analysis|| (async id=>({success:true,data:await(await import('./liveAiAnalysisService.ts')).getGroundedAiAnalysis(id,true)}));
  const plan=scheduledPhasePlan(t.day);
  for(const {id,kind} of plan){
    const phase=kind+'-'+id;if(journal.phases[phase])continue; // attempted = consumed, including unknown outcome after a crash
    journal.phases[phase]={status:'started'};await store.save(journal);
    const ctx:Stage3RunContext={runId:runId+'-'+phase,scheduledPolicyHash:hash,analysisCommodity:id,analysisModel:kind==='news'?policy.newsModel:policy.analysisModel,permitted:true,attempts:0,successfulCalls:0,maxCalls:kind==='news'?2:1,estimatedUsd:0,maxEstimatedUsd:Number.POSITIVE_INFINITY,requestDeadlineMs:60000,deadlineAt:+now()+180000,abortController:new AbortController(),evidenceMode:'search',
     onReserve:async r=>{
      journal!.requests.push({runId:ctx.runId,phase,attempt:r.attempt,model:r.model,reservedUsd:r.reservedUsd,reservedKrw:budget.safetyKrwPerUsd===null?null:Math.ceil(r.reservedUsd*budget.safetyKrwPerUsd)});await store.save(journal!);
     },onUsage:async r=>{const request=journal!.requests.find(x=>x.phase===phase&&x.attempt===r.attempt)!;request.estimatedUsd=r.estimatedUsd;request.estimatedKrw=budget.safetyKrwPerUsd===null?null:Math.ceil(r.estimatedUsd*budget.safetyKrwPerUsd);await store.save(journal!);}};
    try{
     if(kind==='analysis'){ctx.evidenceMode='verified-only';ctx.scheduledEvidence=await scheduledAnalysisEvidence(id,updates['news-'+id]?.articles,root,now());}
     const payload=await withAuthorizedStage3Run(ctx,async()=>kind==='news'?{success:true,articles:await news(id)}:await analysis(id));
     assertPaidRunActive(ctx);
     if(!ctx.successfulCalls)throw Error('No successful metered generation');
     if(kind==='news'){
      const accepted=acceptedScheduledNews(id,payload.articles||[]);if(!accepted.length)throw Error('No accepted, independently verified substantive news');const prior=options.priorNews?.[id]||[];
      const ranked=selectProcurementNews(id,[...accepted,...prior]);
      const selected=acceptedScheduledNews(id,ranked);
      if(!compareNewsContent(prior,selected).hasNewContent)throw new PaidRequestError('no-new-or-updated-news-content');
      payload.articles=selected;
     }else if(snapshotIssues(phase,payload).length||payload.data?.status!=='live')throw Error('Existing analysis acceptance failed');
     if(kind==='analysis'){
      let previous=readScheduledContent(phase,root)?.payload;
      if(!previous)try{previous=JSON.parse(fs.readFileSync(path.join(root,'.rms-stage3/snapshots',phase+'.json'),'utf8')).payload;}catch{}
      if(previous&&!snapshotIssues(phase,previous).length&&analysisReplacementIssues(payload.data,previous.data).length)throw Error('Analysis section coverage regression; retain previous');
     }
     updates[phase]=payload;journal.accepted={...updates};journal.phases[phase]={status:'accepted'};
     // News has its own accepted checkpoint; a later rejected AI response cannot suppress it.
     recordPaidRequestEvent({runId:ctx.runId,phase:'content-accepted',kind,commodity:id,...(kind==='analysis'?{lastSuccessfulAnalysisAt:now().toISOString()}:{} )});
     if(kind==='news')(options.commit||((u,r)=>publishScheduledContent(u,r,root)))(updates,runId);
    }catch(error){
     // Never persist arbitrary provider messages or response content.
     const reason=error instanceof PaidRequestError?error.code:'generation-or-evidence-validation';
     journal.phases[phase]={status:'retained-previous',reason,error:reason};
     recordPaidRequestEvent({runId:ctx.runId,phase:'content-retained',commodity:id,kind,reason,responseStatus:error instanceof PaidRequestError?error.status??null:null});
    }
    finally{ctx.cancelled=true;ctx.abortController!.abort();await store.save(journal);}
    if(hasOutstandingPaidRequest())throw Error('Outstanding provider operation; no additional paid phases allowed');
  }
  // Final atomic checkpoint includes earlier news checkpoints. Failed items keep
  // their prior manifest entry or original approved snapshot.
  (options.commit||((u,r)=>publishScheduledContent(u,r,root)))(updates,runId);
  return {day:t.day,budget,phases:journal.phases,attempts:journal.requests.length,estimatedUsd:charged(journal),estimatedKrw:chargedKrw(journal,budget.safetyKrwPerUsd),accepted:Object.keys(updates)};
 }finally{release();}
}
