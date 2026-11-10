#!/usr/bin/env node
/** Explicit, one-commodity Market Intelligence NEWS-only local test.
 * No Cloud/Git/RMS AI/price updates. A failed candidate never replaces approved news.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';

const arg = (name) => process.argv.slice(2).find(x => x.startsWith(name + '='))?.slice(name.length + 1);
const flag = (name) => process.argv.slice(2).includes(name);
const commodity = arg('--commodity');
const allowed = new Set(['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch']);
const preview = flag('--preview');
const discover = flag('--discover-free');
const paid = flag('--run-paid');
const approval = arg('--approve-paid');
const maxBudgetUsd = Number(arg('--max-estimated-usd') ?? '1.50');
const root = process.cwd();

if (!allowed.has(commodity) || Number(preview)+Number(paid)+Number(discover)!==1 || path.basename(root) !== 'RMS_final_main' ||
    !fs.existsSync(path.join(root,'src/server/marketIntelligenceService.ts'))) {
  console.error('Usage (from RMS_final_main): node mi-local-news-refresh.mjs --commodity=potato-starch --preview|--discover-free');
  console.error('Paid run requires --run-paid --approve-paid=YES --max-estimated-usd=1.50');
  process.exit(2);
}
const state = path.join(root,'.rms-stage3');
const manifestFile = path.join(state,'scheduled-content-current.json');
const todayKst = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const primaryJournalFile = path.join(state,'manual-news-paid',todayKst,commodity+'.json');
const retryCompleted = flag('--retry-completed');
const retryOrdinalRaw = arg('--retry-ordinal');
const retryOrdinal = retryOrdinalRaw === undefined ? 1 : Number(retryOrdinalRaw);
if (!Number.isInteger(retryOrdinal) || retryOrdinal < 1 || retryOrdinal > 4 || (!retryCompleted && retryOrdinalRaw !== undefined)) {
 console.error('Invalid same-day retry request; no API calls.');
 process.exit(2);
}
const retryJournalFile = path.join(state,'manual-news-paid',todayKst,commodity+'.retry-'+retryOrdinal+'.json');
const previousJournalFile = retryOrdinal===1 ? primaryJournalFile : path.join(state,'manual-news-paid',todayKst,commodity+'.retry-'+(retryOrdinal-1)+'.json');
let journalFile = primaryJournalFile;
const currentArticleSummary = () => {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestFile,'utf8'));
    const sha = manifest.entries?.['news-'+commodity]?.sha256;
    if (!/^[a-f0-9]{64}$/.test(sha||'')) return {manifestEntry:false,articles:[]};
    const doc = JSON.parse(fs.readFileSync(path.join(state,'snapshots/scheduled-content',sha+'.json'),'utf8'));
    return {manifestEntry:true,articles:(doc.payload?.articles||[]).map(x=>({date:x.publishedAt,source:x.sourceName}))};
  } catch { return {manifestEntry:false,articles:[]}; }
};

if (discover) {
  const {discoverAdditionalNews} = await import(pathToFileURL(path.join(root,'src/server/additionalNewsDiscovery.ts')).href);
  const {discoverErsSoybeanOil} = await import(pathToFileURL(path.join(root,'src/server/soybeanOilSitemapDiscovery.ts')).href);
  const {verifyOtherCommodityArticles} = await import(pathToFileURL(path.join(root,'src/server/all8ArticleVerification.ts')).href);
  const {verifyDynamicNewsIntake,compareWithPublishedNews} = await import(pathToFileURL(path.join(root,'src/server/newsVerifiedSourceIntake.ts')).href);
  const {acceptedScheduledNews,readScheduledContent} = await import(pathToFileURL(path.join(root,'src/server/scheduledContent.ts')).href);
  const discovered = await discoverAdditionalNews(commodity);
  const supplemental = commodity==='soybean-oil'
    ? await discoverErsSoybeanOil()
    : {candidates:[],errors:[]};
  // Match the full MI runner's saved free-source intake (if collected today).
  let saved=[];
  try {
    const source=JSON.parse(fs.readFileSync(path.join(state,'free-news-candidates-'+commodity+'.json'),'utf8'));
    const checkedAt=Date.parse(source.checkedAt);
    if(Number.isFinite(checkedAt)&&checkedAt<=Date.now()&&Date.now()-checkedAt<86400000&&Array.isArray(source.candidates))
      saved=source.candidates.slice(0,12);
  }catch{}
  const result = await verifyDynamicNewsIntake(commodity,{
    saved,discovered:discovered.candidates,supplemental:supplemental.candidates,
    warnings:[...discovered.errors,...supplemental.errors]
  },verifyOtherCommodityArticles);
  const prior=acceptedScheduledNews(commodity,readScheduledContent('news-'+commodity)?.payload?.articles||[]);
  const coverage=compareWithPublishedNews(result.verified,prior);
  console.log(JSON.stringify({
    mode:'full-free-original-page-check',commodity,
    candidateCount:result.candidates.length,verifiedCount:result.verified.length,
    newVerifiedCount:coverage.newVerified.length,
    alreadyPublishedCount:coverage.alreadyPublished.length,
    savedApprovedCount:prior.length,
    findings:result.verified.map(a=>({date:a.publishedAt,publisher:a.sourceName,title:a.rawTitle,url:a.originalUrl,
      status:coverage.newVerified.includes(a)?'verified-not-yet-published':'already-approved'})),
    rejections:result.rejected,warnings:result.warnings,
    note:'Shared free intake with the paid MI pipeline. Original-page verification alone is not Korean-summary approval.',
    geminiCalls:0,publicationWrites:0
  },null,2));
  process.exit(0);
}

if (preview) {
  console.log(JSON.stringify({mode:'preview',commodity,currentPublication:currentArticleSummary(),
    alreadyAttemptedToday:fs.existsSync(journalFile),
    authorization:'NOT requested',geminiCalls:0,filesChanged:0},null,2));
  process.exit(0);
}

if (approval !== 'YES' || !Number.isFinite(maxBudgetUsd) || maxBudgetUsd < 0.35 || maxBudgetUsd > 1.50) {
  console.error('No calls made. Explicit --approve-paid=YES and estimated USD limit 0.35–1.50 required.');
  process.exit(2);
}
if (retryCompleted) {
  if (arg('--approve-repeat-paid') !== 'YES') {
    console.error('NO PAID CALLS: explicit retry authorization missing.');
    process.exit(2);
  }
  let prior;
  try {
    prior = JSON.parse(fs.readFileSync(previousJournalFile,'utf8'));
  } catch {
    console.error('NO PAID CALLS: prior journal unreadable.');
    process.exit(2);
  }
  if (prior.commodity !== commodity || prior.day !== todayKst ||
      !['published','retained-previous'].includes(prior.status) ||
      !prior.finishedAt) {
    console.error('NO PAID CALLS: prior attempt not confirmed complete.');
    process.exit(2);
  }
  if (fs.existsSync(retryJournalFile)) {
    console.error('NO PAID CALLS: same-day repeat already recorded.');
    process.exit(2);
  }
  journalFile = retryJournalFile;
} else if (fs.existsSync(journalFile)) {
  console.error('A paid attempt is already recorded today for this commodity. No retry performed.');
  process.exit(2);
}
if (process.env.CLOUD_RUN_JOB || process.env.K_SERVICE) {
  console.error('Local-only runner cannot run inside Cloud Run.');
  process.exit(2);
}
if (!fs.existsSync(path.join(root,'src/server/otherCommodityNewsPool.ts'))) {
  console.error('Required MI patch not installed. No calls made.');
  process.exit(2);
}
// Resolve project dependencies from RMS_final_main, not from Downloads.
const requireFromProject = createRequire(pathToFileURL(path.join(root,'package.json')));
const {config} = requireFromProject('dotenv');
config({path:path.join(root,'.env'),quiet:true});
if (!process.env.GEMINI_API_KEY || ['DEMO_KEY','MY_GEMINI_API_KEY'].includes(process.env.GEMINI_API_KEY)) {
  console.error('No usable GEMINI_API_KEY found in local environment/.env. No calls made.');
  process.exit(2);
}
const {withAuthorizedStage3Run} = await import(pathToFileURL(path.join(root,'src/server/stage3Runtime.ts')).href);
const {acquirePaidLease,hasOutstandingPaidRequest} = await import(pathToFileURL(path.join(root,'src/server/paidJobLease.ts')).href);
const {marketIntelligenceService} = await import(pathToFileURL(path.join(root,'src/server/marketIntelligenceService.ts')).href);
const {acceptedScheduledNews,publishScheduledContent,readScheduledContent} = await import(pathToFileURL(path.join(root,'src/server/scheduledContent.ts')).href);
const {recentMarketArticles} = await import(pathToFileURL(path.join(root,'src/server/newsFreshnessPolicy.ts')).href);
const {newsRetentionDays} = await import(pathToFileURL(path.join(root,'src/server/newsRetentionPolicy.ts')).href);
const {compareNewsContent} = await import(pathToFileURL(path.join(root,'src/server/newsContentChanges.ts')).href);
if (hasOutstandingPaidRequest()) {
  console.error('Unresolved paid request lock. No call made; manual review required.');
  process.exit(2);
}
const runId = `manual-mi-${todayKst}-${commodity}-${randomUUID().slice(0,8)}`;
const controller = new AbortController();
const record = {version:1,runId,commodity,day:todayKst,repeatOf:retryCompleted?path.basename(previousJournalFile):null,status:'authorized',
  permittedCalls:2,estimatedUsdLimit:maxBudgetUsd,startedAt:new Date().toISOString(),reservations:[],usage:[]};
const persist = () => {
  const temp=journalFile+'.tmp-'+process.pid;
  fs.writeFileSync(temp,JSON.stringify(record,null,2),{mode:0o600});
  fs.renameSync(temp,journalFile);
};
const ctx = {runId,permitted:true,analysisCommodity:commodity,analysisModel:'gemini-3.8-flash',
  scheduledPolicyHash:'manual-news-only-local-v1',attempts:0,successfulCalls:0,maxCalls:2,
  estimatedUsd:0,maxEstimatedUsd:maxBudgetUsd,requestDeadlineMs:60000,
  deadlineAt:Date.now()+4*60000,abortController:controller,evidenceMode:'search',
  onReserve:async entry=>{record.reservations.push(entry);persist();},
  onUsage:async entry=>{record.usage.push(entry);persist();}};
let release;
try {
  release = acquirePaidLease('analysis-job',runId);
  fs.mkdirSync(path.dirname(journalFile),{recursive:true});
  fs.writeFileSync(journalFile,JSON.stringify(record,null,2),{mode:0o600,flag:'wx'});
  record.status='running';persist();
  const result = await withAuthorizedStage3Run(ctx,()=>marketIntelligenceService.getCommodityIntelligence(commodity,true));
  if (ctx.successfulCalls===0) throw Error('no-successful-provider-call');
  const selected = acceptedScheduledNews(commodity,recentMarketArticles(result,newsRetentionDays(commodity)));
  const prior = readScheduledContent('news-'+commodity)?.payload?.articles||[];
  // Only source-verified accepted content (above) can reach this comparison.
  // Do not publish a different selection order or retrieval timestamp as news.
  const changes=compareNewsContent(prior,selected);
  if (!selected.length || !changes.hasNewContent) {
    record.status='retained-previous';record.reason='no-new-or-updated-verified-content';
  } else {
    // Immutable previous publication remains in content-addressed storage.
    // Only the accepted Market Intelligence news key can be written here.
    const backupDir=path.join(os.homedir(),'Desktop','RMS_MI_backups','manual-news-'+runId);
    fs.mkdirSync(backupDir,{recursive:true});
    if(fs.existsSync(manifestFile))fs.copyFileSync(manifestFile,path.join(backupDir,'scheduled-content-current.before.json'));
    const pub=publishScheduledContent({['news-'+commodity]:{success:true,articles:selected}},runId);
    if(!pub.accepted.includes('news-'+commodity))throw Error('publication-not-accepted');
    record.status='published';record.publishedArticles=selected.map(x=>({date:x.publishedAt,source:x.sourceName}));
    record.newlyAcceptedArticles=changes.added.length;
    record.updatedArticles=changes.updated.length;
    record.manifestBackup=backupDir;
  }
} catch (error) {
  // Do not disguise a verification, provider or publication error as ordinary
  // no-new-content. Never include potentially sensitive exception text.
  record.status='failed';record.reason='generation-verification-or-publication-failed';
  console.error('MI refresh failed; previous publication preserved. Inspect the local diagnostics before retrying.');
} finally {
  ctx.cancelled=true;controller.abort();
  try{release?.();}catch{}
  record.apiCallAttempts=ctx.attempts;
  record.successfulApiCalls=ctx.successfulCalls;
  record.estimatedUsd=Number(ctx.estimatedUsd.toFixed(3));
  // Report the actual readable, source-validated merged publication, not just
  // the size of the new batch (which previously looked like a 1-card result).
  record.totalVerifiedPublished=readScheduledContent('news-'+commodity)?.payload?.articles?.length??0;
  if(record.status!=='published'){
    try{
      const diagnostic=JSON.parse(fs.readFileSync(path.join(state,'news-'+commodity+'-diagnostic.json'),'utf8'));
      const timestamp=Date.parse(diagnostic.recordedAt||'');
      if(Number.isFinite(timestamp)&&timestamp>=Date.parse(record.startedAt))
        record.lastEditorialStage=typeof diagnostic.stage==='string'?diagnostic.stage:null;
    }catch{}
  }
  record.finishedAt=new Date().toISOString();
  if (fs.existsSync(journalFile)) persist();
}
console.log(JSON.stringify({commodity,runId,status:record.status,
  reason:record.reason??null,apiCalls:record.apiCallAttempts,
  estimatedUsd:record.estimatedUsd,acceptedArticles:record.publishedArticles?.length??0,
  newlyAcceptedArticles:record.newlyAcceptedArticles??0,
  updatedArticles:record.updatedArticles??0,
  totalVerifiedPublished:record.totalVerifiedPublished??0,
  lastEditorialStage:record.lastEditorialStage??null,
  backup:record.manifestBackup??null,priorPublicationPreserved:true},null,2));
if(record.status!=='published')process.exitCode=1;
