import {policyRecordPresentation} from '../utils/overviewMacroPresentation.ts';
import {readFreePublication,freeRefreshStatus} from './freeDailyPublication.ts';
import {assessProcurementRisk} from '../utils/procurementRisk.ts';
import {collectAnalysisEvidence} from './analysisEvidence.ts';
import {selectProcurementNews} from './newsProcurementSelection.ts';
import {readVerifiedWheatNews} from './wheatSavedVerifiedNews.ts';
import {readVerifiedCornNews} from './cornSavedVerifiedNews.ts';
import {readVerifiedTapiocaNews} from './tapiocaVerifiedNews.ts';
import {readVerifiedPotatoNews} from './potatoVerifiedNews.ts';
import {readVerifiedSugarNews} from './sugarVerifiedNews.ts';
import {rmsAiEditorial} from '../utils/rmsAiEditorial.ts';
import {readVerifiedSoybeanOilNews} from './soybeanOilVerifiedNews.ts';
import {standalonePreflight,standaloneContext,runStandaloneAnalysis,standaloneStatus} from './standaloneAnalysis.ts';
import {promoteRetainedSoybeanResponse} from './retainedSoybeanPromotion.ts';
/** Owner-gated standalone RMS AI execution and read-only saved snapshots.
 * Historical paid ledgers remain readable. Free-source scheduling is separate. */
import fs from 'node:fs';
import {readVerifiedSoybeanNews} from './soybeanNewsPersistence.ts';
import {readVerifiedPalmNews} from './palmVerifiedNews.ts';
import {freeRefreshSettings} from './freeSourceRefresh.ts';
import { remainingIds, snapshotIssues } from './mvpEvidence.ts';
import {recoveryStatus} from './analysisRecovery.ts';
import path from 'node:path';
import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { withAuthorizedStage3Run, type Stage3RunContext } from './stage3Runtime.ts';
import {hasOutstandingPaidRequest} from './paidJobLease.ts';
import { sanitizeSavedWheatNews } from './wheatArticleVerification.ts';
import { assessNewsSummary } from '../utils/newsSummaryQuality.ts';

const root = path.join(process.cwd(), '.rms-stage3');
const settingsFile = path.join(root, 'settings.json');
const ledgerFile = path.join(root, 'ledger.json');
const tokenFile = path.join(root, 'admin-token');
const snapshotDir = path.join(root, 'snapshots');
const remainingMvpFile = path.join(root,'all8-remaining-mvp.json');
// Manual, owner-only Wheat QA window. No automatic paid requests.
// The original Oct 16 run ledger remains counted toward the TWO total allowed runs.
const wheatNewsTestStartDay = '2026-10-19';
const wheatNewsTestEndDay = '2026-10-26';
const legacyWheatNewsTestFile = path.join(root, 'wheat-news-test-2026-10-16.json');
const wheatNewsTestFile = path.join(root, 'wheat-news-test-2026-10-19-to-26.json');
const wheatNewsTestMaxRuns = 2;
const wheatNewsTestEstimatedCapUsd = 0.25;
// Separately authorized Corn-only QA. Never counts as or triggers a full refresh.
const cornNewsTestStartDay = '2026-10-19';
const cornNewsTestEndDay = '2026-10-26';
const cornNewsTestFile = path.join(root, 'corn-news-test-2026-10-19-to-26.json');
const cornNewsTestMaxRuns = 2;
const cornNewsTestEstimatedCapUsd = 0.20;
// One isolated Corn RMS AI test, separately metered from Corn news.
const cornAiTestStartDay = '2026-10-19';
const cornAiTestEndDay = '2026-10-26';
const cornAiTestFile = path.join(root,'corn-ai-test-2026-10-19-to-26.json');
const cornAiTestMaxRuns = 2;
function cornAiRuns():any[] {
  const runs=readJson(cornAiTestFile)?.runs;
  return Array.isArray(runs)?runs:[];
}

function cornQaRuns(): any[] {
  const runs=readJson(cornNewsTestFile)?.runs;
  return Array.isArray(runs) ? runs : [];
}
function cornQaDayAllowed(day:string):boolean {
  return day >= cornNewsTestStartDay && day <= cornNewsTestEndDay;
}

function wheatQaRuns(): any[] {
  const legacy = readJson(legacyWheatNewsTestFile)?.runs;
  const current = readJson(wheatNewsTestFile)?.runs;
  return [...(Array.isArray(legacy) ? legacy : []), ...(Array.isArray(current) ? current : [])];
}
function wheatQaDayAllowed(day: string): boolean {
  return day >= wheatNewsTestStartDay && day <= wheatNewsTestEndDay;
}

const commodities = ['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'] as const;
const commoditySet = new Set<string>(commodities);
const ensureDir = () => fs.mkdirSync(root, { recursive: true, mode: 0o700 });
function readJson(file: string): any { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
function atomicWrite(file: string, body: unknown) {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(body,null,2), {mode:0o600});
  fs.renameSync(temp,file);
}
function settings() { return {...{autoEnabled:false, mode:'pilot', scheduleHourKST:9}, ...(readJson(settingsFile) || {})}; }
function secureToken() {
  ensureDir();
  if (!fs.existsSync(tokenFile)) fs.writeFileSync(tokenFile,crypto.randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});
  return fs.readFileSync(tokenFile,'utf8').trim();
}
function kst() {
  const parts = new Intl.DateTimeFormat('en-US',{
    timeZone:'Asia/Seoul', year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23',weekday:'short'
  }).formatToParts(new Date());
  const m: Record<string,string>={}; for(const p of parts) m[p.type]=p.value;
  return {day:`${m.year}-${m.month}-${m.day}`, weekday:m.weekday, hour:Number(m.hour)};
}
function keyFromRequest(url: string, method: string): string | null {
  let u: URL; try { u=new URL(url,'http://localhost'); } catch { return null; }
  const p=u.pathname;
  const valid = (value:string) => {const id=value.trim().toLowerCase().replace(/_/g,'-');return commoditySet.has(id)?id:null;};
  if (method==='GET' && p.startsWith('/api/ai-analysis/')) {
    const id=valid(decodeURIComponent(p.slice('/api/ai-analysis/'.length)));
    return id ? `analysis-${id}` : null;
  }
  if (method==='GET' && p==='/api/market-intelligence') {
    const id=valid(u.searchParams.get('commodity') || 'wheat');
    return id ? `news-${id}` : null;
  }
  if (method==='GET' && p==='/api/wheat/ai-recommendation') return 'wheat-recommendation';
  if (method==='GET' && p==='/api/scm/live-policy') return 'trade-policy';
  if (method==='GET' && p==='/api/scm/live-market-issues') return 'market-issues';
  if (method==='POST' && p==='/api/gemini/live-market-data') return 'macro-overview';
  if (method==='GET' && p==='/api/origins/live') {
    const id=valid(u.searchParams.get('commodity') || 'wheat');
    return id ? `origin-${id}` : null;
  }
  return null;
}
function validEvidenceUrl(v:unknown): boolean {
  if (typeof v!=='string') return false;
  try { const u=new URL(v); return ['https:','http:'].includes(u.protocol) &&
    !/google\.(com|co\.kr)\/search|news\.google\.com\/search/i.test(v); } catch { return false; }
}
function validateSnapshot(key:string, value:any):boolean {
  if (!value || typeof value!=='object' || value.error || value.success===false) return false;
  if(key.startsWith('news-')) {
    const recent=(d:unknown) => {
      if(typeof d!=='string') return false;
      const ms=Date.parse(d);
      return Number.isFinite(ms) && ms>=Date.now()-30*86400000 && ms<=Date.now()+86400000;
    };
    const articles=value.articles;
    const valid=(a:any)=>validEvidenceUrl(a?.originalUrl) && recent(a?.publishedAt) &&
      a.linkStatus==='verified' &&
      !!(a?.sourceName || a?.source) && a?.unavailable!==true;
    if(key==='news-wheat'||key==='news-corn'||key==='news-soybean') {
      const informative = (a:any) => assessNewsSummary(a?.summary || a?.summary_kr,
        a?.title || a?.title_kr, key.slice('news-'.length)).pass;
      // A substantive verified subset is valid; four is a maximum, never a quota.
      return value.success===true && Array.isArray(articles) && articles.length>=1 && articles.length<=4 &&
        articles.every((a:any)=>valid(a) && informative(a)) &&
        new Set(articles.map((a:any)=>String(a.originalUrl).toLowerCase().replace(/\/+$/,''))).size===articles.length;
    }
    return value.success===true && Array.isArray(articles) &&
      articles.some((a:any)=>valid(a) && assessNewsSummary(a?.summary||a?.summary_kr,
        a?.title||a?.title_kr,key.slice('news-'.length)).pass);
  }
  if(key==='wheat-recommendation') return value.success===true &&
    typeof value.recommendation?.summaryParagraph==='string' &&
    Array.isArray(value.evidenceRegistry) && value.evidenceRegistry.some((e:any)=>validEvidenceUrl(e?.sourceUrl));
  if(key==='trade-policy') return validEvidenceUrl(value.sourceUrl) && typeof value.title==='string';
  if(key==='market-issues') return Array.isArray(value) && value.some((a:any)=>validEvidenceUrl(a?.sourceUrl));
  if(key==='macro-overview') return !!value && !value.error && !value.isQuotaExhausted;
  return false;
}
function snapshotPath(key:string) {return path.join(snapshotDir, `${key}.json`);}
function readSnapshot(key:string) {return readJson(snapshotPath(key));}
function listSnapshots() {
  if(!fs.existsSync(snapshotDir)) return [];
  return fs.readdirSync(snapshotDir).filter(f=>f.endsWith('.json')).map(f=>{
    const v=readJson(path.join(snapshotDir,f));
    return {key:f.slice(0,-5), updatedAt:v?.updatedAt || null};
  });
}
const state:{running:boolean,context:Stage3RunContext|null,runId:string|null}={running:false,context:null,runId:null};
let internalSecret='';
function status() {
  const s=settings(); const t=kst(); const ledger=readJson(ledgerFile);
  return {
    stage:'weekday-snapshots', paidGeminiCalls:'BLOCKED_ON_PAGE_VIEW',
    freeSources:{...freeRefreshSettings(),...freeRefreshStatus()},
    autoEnabled:false, mode:s.mode, scheduleHourKST:s.scheduleHourKST,
    timezone:'Asia/Seoul', todayKST:t.day, weekday:!['Sat','Sun'].includes(t.weekday),
    lastAttempt:ledger ?? null, running:state.running,
    paidTransport:{outstandingRequest:hasOutstandingPaidRequest(),sdkHttpAttemptsLimit:1,requestDeadlineMs:60000},
    wheatNewsTest:{windowStart:wheatNewsTestStartDay,windowEnd:wheatNewsTestEndDay,
      maxRuns:wheatNewsTestMaxRuns,usedRuns:wheatQaRuns().length,runs:wheatQaRuns()},
    cornNewsTest:{windowStart:cornNewsTestStartDay,windowEnd:cornNewsTestEndDay,
      maxRuns:cornNewsTestMaxRuns,usedRuns:cornQaRuns().length,runs:cornQaRuns()},
    cornAiTest:{retired:true,windowStart:cornAiTestStartDay,windowEnd:cornAiTestEndDay,
      maxRuns:cornAiTestMaxRuns,usedRuns:cornAiRuns().length,runs:cornAiRuns()},
    soybeanMvp:{retired:true,maxRuns:2,usedRuns:soybeanMvpRuns().length,runs:soybeanMvpRuns()},
    remainingMvp:{retired:true,runs:readJson(remainingMvpFile)?.runs||[],maxEstimatedUsdPerRun:1.5},
    analysisRecovery:recoveryStatus(),
    standaloneAnalysis:standaloneStatus(),
    runCallAttempts:state.context?.attempts ?? 0,
    runEstimatedUsd:state.context ? Number(state.context.estimatedUsd.toFixed(4)) : 0,
    snapshots:listSnapshots(),
    caveat:'Requires the RMS server to remain running. Token costs are estimates, not a billing cap.'
  };
}
function savedNewsResponse(id:string, verified:any[]) {
  const articles=selectProcurementNews(id,verified);
  return {success:true,articles,sourceStatus:'verified-retained-originals',
    procurementRisk:assessProcurementRisk(id,articles,collectAnalysisEvidence(id).facts)};
}
function respond(res:ServerResponse, code:number, body:unknown) {
  res.statusCode=code;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.end(JSON.stringify(body));
}
function isLoopback(req:IncomingMessage) {
  const v=req.socket.remoteAddress || '';
  return v==='127.0.0.1'||v==='::1'||v==='::ffff:127.0.0.1';
}
/** One-day, owner-approved, strictly news-only QA. No modification of ordinary Stage 3 ledger. */
async function executeWheatNewsTest():Promise<void> {
  const t=kst();
  if(!wheatQaDayAllowed(t.day) || state.running) return;
  const previous=readJson(wheatNewsTestFile);
  const runs:any[]=Array.isArray(previous?.runs)?previous.runs:[];
  if(wheatQaRuns().length>=wheatNewsTestMaxRuns) return;
  state.running=true;
  const runId=`wheat-news-qa-${t.day}-${crypto.randomBytes(4).toString('hex')}`;
  const run:any={runId,startedAt:new Date().toISOString(),status:'running',
    completed:[],failed:[],estimatedUsd:0,apiCallAttempts:0};
  runs.push(run);
  atomicWrite(wheatNewsTestFile,{windowStart:wheatNewsTestStartDay,windowEnd:wheatNewsTestEndDay,maxRuns:wheatNewsTestMaxRuns,runs});
  const ctx:Stage3RunContext={runId,permitted:true,attempts:0,successfulCalls:0,
    maxCalls:2,estimatedUsd:0,maxEstimatedUsd:wheatNewsTestEstimatedCapUsd};
  state.context=ctx;state.runId=runId;
  console.log(`[RMS QA] Authorized, capped Wheat news-only run: ${runId}`);
  try {
    const response=await fetch('http://127.0.0.1:3000/api/market-intelligence?commodity=wheat&force=true',{
      method:'GET',headers:{'x-rms-stage3-job':internalSecret},
      signal:AbortSignal.timeout(180_000)
    });
    const payload=await response.json();
    const good=response.ok && ctx.successfulCalls>0 && validateSnapshot('news-wheat',payload);
    const diag=readJson(path.join(root,'news-wheat-diagnostic.json'));
    run.diagnostic=diag?{stage:diag.stage,
      jsonCandidates:diag.retrievedJsonCandidates??null,
      groundedCandidates:diag.groundingCandidates??null,
      verified:diag.verification?.accepted??null,
      summarized:diag.goodKoreanSummaries??null,
      rejected:diag.verification?.reasons??null}:null;
    if(good) {
      atomicWrite(snapshotPath('news-wheat'),{updatedAt:new Date().toISOString(),runId,
        sourceStatus:'requires-human-review',payload});
      run.completed.push('news-wheat');run.status='completed';
      console.log('[RMS QA] 4 Wheat articles passed; news snapshot updated.');
    } else {
      run.status='incomplete';
      run.failed.push({key:'news-wheat',reason:`HTTP ${response.status}; ${diag?.stage || 'insufficient verified articles'}`});
      console.log('[RMS QA] Incomplete evidence; existing news snapshot preserved.');
    }
  } catch(e:any) {
    run.status='failed';
    run.failed.push({key:'news-wheat',reason:String(e?.message??e).slice(0,250)});
    console.warn('[RMS QA] Wheat news-only run failed; existing snapshot preserved.');
  } finally {
    run.finishedAt=new Date().toISOString();run.apiCallAttempts=ctx.attempts;
    run.estimatedUsd=Number(ctx.estimatedUsd.toFixed(4));
    atomicWrite(wheatNewsTestFile,{windowStart:wheatNewsTestStartDay,windowEnd:wheatNewsTestEndDay,maxRuns:wheatNewsTestMaxRuns,runs});
    state.context=null;state.running=false;state.runId=null;
    console.log(`[RMS QA] ${run.status}; attempts=${ctx.attempts}; estimatedUSD=${run.estimatedUsd}`);
  }
}

/** Explicitly approved Corn QA: four free-verified sources, then <=1 summarization call.
 * Does not trigger Wheat, analysis refresh, macro data, or the ordinary daily ledger.
 */
async function executeCornNewsTest():Promise<void> {
  const day=kst().day;
  if(!cornQaDayAllowed(day) || state.running || cornQaRuns().length>=cornNewsTestMaxRuns)return;
  state.running=true;
  const runId=`corn-news-qa-${day}-${crypto.randomBytes(4).toString('hex')}`;
  const ctx:Stage3RunContext={runId,permitted:true,attempts:0,successfulCalls:0,
    maxCalls:1,estimatedUsd:0,maxEstimatedUsd:cornNewsTestEstimatedCapUsd};
  state.context=ctx;state.runId=runId;
  const runs:any[]=cornQaRuns();
  const run:any={runId,startedAt:new Date().toISOString(),status:'running',completed:[],failed:[],apiCallAttempts:0,estimatedUsd:0};
  runs.push(run); // Reserve the allowance BEFORE network calls; cannot race or retry silently.
  atomicWrite(cornNewsTestFile,{windowStart:cornNewsTestStartDay,windowEnd:cornNewsTestEndDay,maxRuns:cornNewsTestMaxRuns,runs});
  console.log(`[RMS Corn QA] Authorized a single capped news-only summarization: ${runId}`);
  try {
    const response=await fetch('http://127.0.0.1:3000/api/market-intelligence?commodity=corn&force=true',{
      method:'GET',headers:{'x-rms-stage3-job':internalSecret},
      signal:AbortSignal.timeout(180_000)
    });
    const payload=await response.json();
    const diag=readJson(path.join(root,'news-corn-diagnostic.json'));
    run.diagnostic=diag ? {stage:diag.stage,freeVerified:diag.freeVerified||null,
      selectedForSummary:diag.selectedForSummary??null,goodKoreanSummaries:diag.goodKoreanSummaries??null,
      selected:diag.selected||null,quality:diag.quality||null}:null;
    if(response.ok && ctx.successfulCalls===1 && validateSnapshot('news-corn',payload)){
      atomicWrite(snapshotPath('news-corn'),{updatedAt:new Date().toISOString(),runId,
        sourceStatus:'requires-human-review',payload});
      run.completed.push('news-corn');run.status='completed';
      console.log('[RMS Corn QA] Four verified Korean Corn cards stored for manual review.');
    }else{
      run.status='incomplete';
      run.failed.push({key:'news-corn',reason:`HTTP ${response.status}; ${diag?.stage||'four-card gate not passed'}`});
      console.log('[RMS Corn QA] Incomplete; existing Corn snapshot preserved.');
    }
  }catch(e:any){
    run.status='failed';run.failed.push({key:'news-corn',reason:String(e?.message||e).slice(0,200)});
    console.warn('[RMS Corn QA] Failed; existing Corn snapshot preserved.');
  }finally{
    run.finishedAt=new Date().toISOString();run.apiCallAttempts=ctx.attempts;
    run.estimatedUsd=Number(ctx.estimatedUsd.toFixed(4));
    atomicWrite(cornNewsTestFile,{windowStart:cornNewsTestStartDay,windowEnd:cornNewsTestEndDay,
      maxRuns:cornNewsTestMaxRuns,runs});
    state.context=null;state.running=false;state.runId=null;
    console.log(`[RMS Corn QA] ${run.status}; Gemini attempts=${ctx.attempts}; estimated USD ${run.estimatedUsd}`);
  }
}

// Legacy run records remain available for diagnostics; no execution functions.
const soybeanMvpFile=path.join(root,'soybean-mvp-run.json');
function soybeanMvpRuns():any[] {const v=readJson(soybeanMvpFile)?.runs;return Array.isArray(v)?v:[];}

export const RETIRED_AI_CONTROLS=Object.freeze([
  '/api/rms/control/analysis-recovery','/api/rms/control/soybean-mvp',
  '/api/rms/control/remaining-mvp','/api/rms/control/corn-ai-test','/api/rms/control/refresh'
]);

export function createStage3Gateway() {
  internalSecret=secureToken();
  return (req:IncomingMessage,res:ServerResponse,next:()=>void) => {
    const u=new URL(req.url||'/', 'http://localhost');
    if(req.method==='GET'&&u.pathname==='/api/market-intelligence'){
      const id=(u.searchParams.get('commodity')||'wheat').trim().toLowerCase().replace(/_/g,'-');
      if(!commoditySet.has(id))return respond(res,400,{success:false,error:`Unknown commodity: ${id}`});
    }
    if(u.pathname==='/api/rms/refresh-status') return respond(res,200,status());
    if(RETIRED_AI_CONTROLS.includes(u.pathname))return respond(res,410,{success:false,error:'Legacy AI execution retired. Use explicit commodity selection and per-run approval through /api/rms/control/standalone-analysis.'});
    if(u.pathname==='/api/rms/control/promote-retained-soybean'||u.pathname==='/api/rms/control/promote-retained-soybean-oil'||u.pathname==='/api/rms/control/promote-retained-palm-oil'||u.pathname==='/api/rms/control/promote-retained-sugar'||u.pathname==='/api/rms/control/promote-retained-potato-starch'){
      if(req.method!=='POST'||!isLoopback(req)||req.headers['x-rms-stage3-admin']!==internalSecret)
        return respond(res,403,{success:false,error:'Local owner authorization required.'});
      if(u.search||state.running)return respond(res,409,{success:false,error:'Fixed retained Soybean operation only; runner must be idle.'});
      try{return respond(res,200,{success:true,...promoteRetainedSoybeanResponse(String(req.headers['x-rms-promotion-approval']||''),String(req.headers['x-rms-authorization-id']||''),u.pathname.endsWith('-potato-starch')?'potato-starch':u.pathname.endsWith('-sugar')?'sugar':u.pathname.endsWith('-palm-oil')?'palm-oil':u.pathname.endsWith('-oil')?'soybean-oil':'soybean')});}
      catch(e){return respond(res,409,{success:false,error:String((e as Error).message)});}
    }
    if(u.pathname==='/api/rms/control/standalone-analysis') {
      if(req.method!=='POST'||!isLoopback(req)||req.headers['x-rms-stage3-admin']!==internalSecret)
        return respond(res,403,{success:false,error:'Local owner authorization required.'});
      if(state.running)return respond(res,409,{success:false,error:'Another paid refresh is running.'});
      const id=u.searchParams.get('commodity')||'',approval=String(req.headers['x-rms-paid-approval']||''),authorizationId=String(req.headers['x-rms-authorization-id']||'');
      try{standalonePreflight(id,approval,authorizationId);}catch(e){return respond(res,409,{success:false,error:String((e as Error).message)});}
      const runId='standalone-'+id+'-'+crypto.randomBytes(6).toString('hex'),ctx=standaloneContext(runId,id);
      state.running=true;state.context=ctx;state.runId=runId;
      void runStandaloneAnalysis(id,approval,authorizationId,ctx,async commodity=>{
        const response=await fetch('http://127.0.0.1:3000/api/ai-analysis/'+commodity+'?force=true',{
          headers:{'x-rms-stage3-job':internalSecret},signal:ctx.abortController!.signal});
        const body=await response.json();
        if(!response.ok)throw Error('HTTP '+response.status+': '+(body.error||'Analysis failed'));
        return body;
      }).catch(e=>console.error('[RMS standalone AI]',String((e as Error).message)))
        .finally(()=>{state.running=false;state.context=null;state.runId=null;});
      return respond(res,202,{success:true,runId,commodity:id,maxCalls:1,maxEstimatedUsd:0.25,requestDeadlineMs:60000,jobDeadlineMs:75000,evidenceMode:ctx.evidenceMode,warning:'Estimated local guard is not a provider billing cap.'});
    }
    if(u.pathname==='/api/rms/control/news-test') {
      if(req.method!=='POST' || !isLoopback(req) || req.headers['x-rms-stage3-admin']!==internalSecret) {
        return respond(res,403,{success:false,error:'Local owner-only command.'});
      }
      const t=kst();
      if(!wheatQaDayAllowed(t.day)) return respond(res,410,{success:false,error:'Manual Wheat news QA window is closed.'});
      const runs=wheatQaRuns();
      if(state.running) return respond(res,409,{success:false,error:'An RMS paid refresh is already running.'});
      if(runs.length>=wheatNewsTestMaxRuns) return respond(res,409,{success:false,error:'Two news QA runs have already been used today.'});
      void executeWheatNewsTest();
      return respond(res,202,{success:true,message:'One capped, Wheat-news-only test requested.',
        remainingAfterThis:wheatNewsTestMaxRuns-runs.length-1,
        maxEstimatedUsd:wheatNewsTestEstimatedCapUsd,
        warning:'Cost is estimated, not a provider billing cap.'});
    }

    if(u.pathname==='/api/rms/control/corn-news-test') {
      if(req.method!=='POST'||!isLoopback(req)||req.headers['x-rms-stage3-admin']!==internalSecret)
        return respond(res,403,{success:false,error:'Local owner-only command.'});
      const day=kst().day;
      if(!cornQaDayAllowed(day))return respond(res,410,{success:false,error:'Manual Corn news QA window is closed.'});
      if(state.running)return respond(res,409,{success:false,error:'Another RMS refresh is already running.'});
      const used=cornQaRuns().length;
      if(used>=cornNewsTestMaxRuns)return respond(res,409,{success:false,error:'Corn QA allowance used.'});
      void executeCornNewsTest();
      return respond(res,202,{success:true,message:'One capped, Corn-news-only test requested.',
        remainingAfterThis:cornNewsTestMaxRuns-used-1,modelCallLimit:1,
        maxEstimatedUsd:cornNewsTestEstimatedCapUsd,
        warning:'Estimated limit is not a Google billing cap.'});
    }

    const key=keyFromRequest(req.url||'/',req.method||'GET');
    if(!key) return next();
    if(req.headers['x-rms-stage3-job']===internalSecret && state.running && state.context && isLoopback(req)) {
      if(key.startsWith('analysis-')&&state.context.analysisCommodity!==key.slice(9)||state.context.analysisCommodity&&key!=='analysis-'+state.context.analysisCommodity)
        return respond(res,403,{success:false,error:'Paid authorization is restricted to the selected analysis commodity.'});
      return withAuthorizedStage3Run(state.context,()=>next());
    }
    if(key==='news-wheat')return respond(res,200,savedNewsResponse('wheat',readVerifiedWheatNews()));
    if(key==='news-soybean-oil')return respond(res,200,savedNewsResponse('soybean-oil',readVerifiedSoybeanOilNews()));
    if(key==='news-soybean')return respond(res,200,savedNewsResponse('soybean',[...readVerifiedSoybeanNews(),...readVerifiedSoybeanOilNews().filter(a=>a.sourceName==='American Soybean Association')]));
    if(key==='news-potato-starch')return respond(res,200,savedNewsResponse('potato-starch',readVerifiedPotatoNews()));
    if(key==='news-corn')return respond(res,200,savedNewsResponse('corn',readVerifiedCornNews()));
    if(key==='news-tapioca-starch')return respond(res,200,savedNewsResponse('tapioca-starch',readVerifiedTapiocaNews()));
    if(key==='news-sugar')return respond(res,200,savedNewsResponse('sugar',readVerifiedSugarNews()));
    if(key==='news-palm-oil')return respond(res,200,savedNewsResponse('palm-oil',[...readVerifiedPalmNews(),...readVerifiedSoybeanOilNews().filter(a=>a.sourceName==='USDA ERS')]));
    if(key==='trade-policy'){
      const p=readFreePublication()?.data?.transportPolicy?.policy;
      if(p?.url&&p?.publishedOn)return respond(res,200,policyRecordPresentation({...p,title:p.title,summary:p.summary||p.title,recordKind:p.recordKind||'announcement',publishedAt:p.publishedOn,sourceUrl:p.url,sourceName:'Federal Register'}));
      // The legacy Indonesia tax snapshot has no original dated receipt. Use the
      // existing verified editorial as a clearly labelled industry outlook only.
      const a=readVerifiedPalmNews().find((a:any)=>a.originalUrl==='https://prestasisawit.mpob.gov.my/ms/palmnews/news/40027');
      return respond(res,200,policyRecordPresentation(a?{title:a.title,displayTitle:'인도네시아 팜유 수출 가용량 감소 전망',summary:'인도네시아 업계는 2027년 생산 감소와 바이오디젤 수요 증가를 전망했습니다.',procurementImplication:'수출 가용량이 줄 수 있어 공급처 오퍼와 선적 조건을 주시할 필요가 있습니다.',procurementStatus:'수출 가용량 주시 (중립)',recordKind:'industry-outlook',statusType:'neutral',publishedAt:a.publishedAt,sourceUrl:a.originalUrl,sourceName:'MPOB · Reuters'}:{title:'통상 정책',summary:'새 공식 발표가 확인되지 않았습니다.',statusType:'neutral',statusTag:'판정 보류'}));
    }
    const cached=readSnapshot(key);
    if(cached?.payload) {
      res.setHeader('X-RMS-Data-Updated-At',cached.updatedAt||'');
      res.setHeader('X-RMS-Data-Status','saved-snapshot-not-live');
      if(key.startsWith('news-')) {
        const commodityId=key.slice('news-'.length);
        // Saved snapshots are filtered without paid work or mutations.
        // Wheat retains its existing free publisher-link sanitizer.
        const sendFiltered=(sourcePayload:any)=>{
          const articles=Array.isArray(sourcePayload?.articles)?sourcePayload.articles:[];
          const accepted=articles.filter((a:any)=>
            a.unavailable!==true && validEvidenceUrl(a.originalUrl) &&
            (!remainingIds.includes(commodityId)||!/(^|\.)zyotwdhon\.com$/i.test(new URL(a.originalUrl).hostname)) &&
            (commodityId!=='corn' && commodityId!=='wheat' || a.linkStatus==='verified') &&
            assessNewsSummary(a.summary||a.summary_kr,a.title||a.title_kr,commodityId).pass
          );
          return respond(res,200,{...cached.payload, articles:selectProcurementNews(commodityId,accepted),
            verifiedLinkCount:accepted.filter((a:any)=>a.linkStatus==='verified').length,
            qualityFilteredCount:articles.length-accepted.length,
            qualityStatus:accepted.length?'verified-selection':'no-suitable-verified-news'});
        };
        if(commodityId==='wheat') {
          void sanitizeSavedWheatNews(cached.payload)
            .then(sendFiltered)
            .catch(()=>sendFiltered({articles:[]}));
          return;
        }
        return sendFiltered(cached.payload);
      }
      if(key.startsWith('analysis-') && remainingIds.includes(key.slice(9))) {
        if(snapshotIssues(key,cached.payload).length) {

          return respond(res,503,{success:false,status:'unavailable',error:'저장된 AI 분석을 확인할 수 없습니다.'});
        }
        // The saved snapshot stays immutable. Serve the exact pinned, owner-reviewed
        // Potato supplement through the same presentation overlay used by the card.
        const data=cached.payload.data;
        const editorial=key==='analysis-potato-starch'?rmsAiEditorial('potato-starch',data.generatedAt,data.sources,data):null;
        return respond(res,200,{...cached.payload,data:{...data,...(editorial?.editorial?{...editorial.fields,sources:editorial.sources,presentationEditorial:{version:editorial.editorial,originalSnapshot:editorial.snapshot}}:{}),status:'cached'}});
      }
      if(key==='macro-overview'){const data=readFreePublication()?.data,raw=data?.fx?.raw;if(raw)return respond(res,200,{...cached.payload,usdKrw:raw.rates.KRW,eurKrw:raw.rates.KRW/raw.rates.EUR,...(data.energy?.observationDate?{brent:data.energy.currentPrice}:{}),...(data.freight?.observationDate?{scfi:data.freight.scfiPoints}:{}),freeDataObservationDate:raw.date});}
      return respond(res,200,cached.payload);
    }
    if(key.startsWith('news-') && remainingIds.includes(key.slice(5)))
      return respond(res,200,{success:true,articles:[],qualityStatus:'unavailable',statusNote:'저장된 기사가 없습니다.'});
    return respond(res,503,{
      success:false,status:'awaiting-first-verified-refresh',
      error:'저장된 AI 분석이 없습니다.',
      snapshotAvailable:false
    });
  };
}
/** Kept as a startup compatibility hook; automatic paid generation is retired.
 * The independent free-source scheduler is unchanged. */
export function startStage3Scheduler(){
  console.log('[RMS AI] Automatic paid refresh OFF. Owner-approved standalone analysis only.');
}
