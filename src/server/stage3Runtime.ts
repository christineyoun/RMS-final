/** Stage 3: strict per-job authorization and approximate cost telemetry. */
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import {boundedPaidRequest,assertPaidRunActive,recordPaidRequestEvent} from './paidRequestTransport.ts';
import {paidRuntimeRoot} from './paidJobLease.ts';

export type Stage3RunContext = {
  runId: string;
  permitted: boolean;
  attempts: number;
  successfulCalls: number;
  maxCalls: number;
  estimatedUsd: number;
  maxEstimatedUsd: number;
  deadlineAt?:number;
  requestDeadlineMs?:number;
  abortController?:AbortController;
  cancelled?:boolean;
  evidenceMode?:'verified-only'|'search';
  analysisCommodity?:string;
  analysisModel?:string;
  scheduledEvidence?:import('./analysisEvidence.ts').AnalysisEvidence;
  scheduledPolicyHash?:string;
  onReserve?:(entry:{attempt:number;model:string;reservedUsd:number})=>Promise<void>;
  onUsage?:(entry:{attempt:number;estimatedUsd:number;reservedUsd:number})=>Promise<void>;
};
const context = new AsyncLocalStorage<Stage3RunContext>();
export const getStage3RunContext = () => context.getStore();
export const inAuthorizedStage3Run = () => context.getStore()?.permitted === true;
export function withAuthorizedStage3Run<T>(value: Stage3RunContext, task: () => T): T {
  return context.run(value, task);
}
function writeRecord(record: Record<string, unknown>) {
  fs.mkdirSync(paidRuntimeRoot(), { recursive: true });
  fs.appendFileSync(path.join(paidRuntimeRoot(),'usage.jsonl'), JSON.stringify({ recordedAt: new Date().toISOString(), ...record }) + '\n',{mode:0o600});
}
function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
/** Estimates only. Not Google invoice pricing; grounding charges and discounts vary. */
export async function trackedGeminiGenerate<T>(params: any, doGenerate: (prepared:any) => Promise<T>): Promise<T> {
  const ctx = context.getStore();
  if (!ctx?.permitted) throw new Error('[RMS STAGE 3] On-demand Gemini calls are blocked.');
  assertPaidRunActive(ctx);
  // Reserve more for expensive models/grounding before contacting the API.
  // This is a conservative estimated-cost guard, not a guaranteed external billing cap.
  const plannedModel=String(params?.model??'unknown');
  const plannedGrounding=Array.isArray(params?.config?.tools)&&
    params.config.tools.some((x:any)=>x?.googleSearch);
  let reserve=plannedModel==='gemini-3.1-flash-lite'
    ? (plannedGrounding?0.065:0.05)
    : (plannedGrounding?0.15:0.12);
  if(ctx.scheduledPolicyHash){
    // Bound scheduled output and reserve from the actual prompt size with a
    // conservative byte/token upper estimate, grounding allowance and 25% buffer.
    const maxOutputTokens=Math.min(8192,Math.max(1,Number(params.config?.maxOutputTokens)||8192));
    params={...params,config:{...params.config,maxOutputTokens}};
    const promptBytes=Buffer.byteLength(JSON.stringify(params.contents||''),'utf8');
    reserve=Math.ceil(Math.max(reserve,((promptBytes*2+maxOutputTokens*12)/1000000+(plannedGrounding?0.15:0))*1.25)*100)/100;
  }
  if (ctx.attempts >= ctx.maxCalls || ctx.estimatedUsd + reserve > ctx.maxEstimatedUsd) {
    throw new Error('[RMS STAGE 3] Daily API call / estimated budget limit reached.');
  }
  ctx.attempts += 1;
  ctx.estimatedUsd += reserve; // Reserve synchronously before yielding to another call.
  const attempt = ctx.attempts;
  // Scheduled cloud runs persist reservation before any provider transport.
  // Manual contexts retain their existing local tracking behavior.
  await ctx.onReserve?.({attempt,model:plannedModel,reservedUsd:reserve});
  const model = String(params?.model ?? 'unknown');
  const groundingRequested = Array.isArray(params?.config?.tools) &&
    params.config.tools.some((x: any) => x?.googleSearch);
  try {
    const response = await boundedPaidRequest(params,doGenerate,ctx,reserve);
    const usage = (response as any)?.usageMetadata ?? {};
    const input = numberOrZero(usage.promptTokenCount);
    const output = numberOrZero(usage.candidatesTokenCount) + numberOrZero(usage.thoughtsTokenCount);
    // Deliberately conservative, configurable in future after real billing SKU data is available.
    const tokenEstimate = (input * 2 + output * 12) / 1_000_000;
    const rate = model === 'gemini-3.1-flash-lite' ? [0.25, 1.50] : model === 'gemini-3.8-flash' ? [0.75, 3.75] : null;
    const usageAvailable=!!(input||output);
    const publishedTokenEstimateUsd = rate&&usageAvailable ? (input*rate[0]+output*rate[1])/1_000_000 : null;
    const estimate = usageAvailable?Math.max(0.01, tokenEstimate) + (groundingRequested ? 0.03 : 0):reserve;
    ctx.estimatedUsd += estimate-reserve;
    ctx.successfulCalls += 1;
    await ctx.onUsage?.({attempt,estimatedUsd:estimate,reservedUsd:reserve});
    writeRecord({runId:ctx.runId, attempt, model, inputTokens:input, outputAndThinkingTokens:output,
      usageAvailable, groundingRequested, publishedTokenEstimateUsd,reservedEstimatedUsd:reserve,
      costMethod:'conservative-run-budget;publishedTokenEstimateUsd-excludes-grounding',estimatedUsd:usageAvailable?estimate:null, outcome:'ok'});
    recordPaidRequestEvent({runId:ctx.runId,attempt,model,phase:'usage',inputTokens:input,outputAndThinkingTokens:output,
      usageAvailable,estimatedCostUsd:usageAvailable?estimate:null,reservedEstimatedUsd:reserve,publishedTokenEstimateUsd});
    return response;
  } catch (error: any) {
    // A failed API request may still have incurred costs. Preserve the attempt and a reserve.
    writeRecord({runId:ctx.runId, attempt, model, groundingRequested,
      estimatedUsd:null,reservedEstimatedUsd:reserve,usageAvailable:false, outcome:'error',
      reason:typeof error?.code==='string'?error.code:'request-failed',responseStatus:typeof error?.status==='number'?error.status:null});
    throw error;
  }
}
