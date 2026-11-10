#!/usr/bin/env node
/** Coordinated, sequential Market Intelligence refresh using the existing paid, verified, local-only runner.
 * No article facts, source URLs, summaries, prices, or vendor-specific market rules are supplied here.
 * Run is fully opt-in, with bounded budget and per-commodity paid journals preserved by the existing runner.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {COMMODITIES,kstDay,inspectJournal,makePlan,classifyRefreshOutcome} from './refresh-all-core.mjs';
const args=process.argv.slice(2);
const modes=['preview','run-paid','report'].filter(x=>args.includes(x));
const val=name=>args.find(x=>x.startsWith(name+'='))?.slice(name.length+1);
const root=process.cwd();
const isRealProject=path.basename(root)==='RMS_final_main' &&
  fs.existsSync(path.join(root,'src/server/marketIntelligenceService.ts')) &&
  fs.existsSync(path.join(root,'scripts/mi/local-news-refresh.mjs'));
if(modes.length!==1 || !isRealProject){
 console.error('Usage: from ~/Downloads/RMS_final_main: node scripts/mi/refresh-all.mjs preview | run-paid --approve-paid=YES --max-total-usd=10.50 --max-per-commodity-usd=1.50 | report');
 process.exit(2);
}
const mode=modes[0];const day=kstDay();
const plan=makePlan(root,day);
const summary=()=>{
 console.log('\nRMS MI COORDINATED EIGHT-COMMODITY CHECK — '+day);
 console.log('Mode:',mode,' | local only | no Cloud deployment');
 for (const p of plan){
  const q=p.publication;
  console.log(`${p.commodity.padEnd(15)} ${p.decision.padEnd(24)} ${q.count}/4`+
    ` latest=${q.latest||'none'} lengths=[${q.summaryLengths.join(',')}] integrity=${q.integrity}`+
    (q.reasons.length?' reasons='+q.reasons.join(','):'')+
    (p.journal.exists?' journal='+p.journal.status:''));
 }
};
summary();
if(mode==='preview'){
 console.log('\nPREVIEW ONLY: No Gemini, network, publication, or file changes.');
 console.log('Every proposed run uses the EXISTING verified local MI runner with at most 2 paid model calls.');
 console.log('A successful refresh is not guaranteed to produce four articles; original evidence remains mandatory.');
 process.exit(plan.some(p=>p.decision==='BLOCK-INTEGRITY')?1:0);
}
if(mode==='report'){
 const current=makePlan(root,day);
 console.log('\nCurrent statuses:');
 for(const p of current)console.log(p.commodity,p.publication.count,'articles |',p.journal.status||'not-run-today','|',p.publication.reasons.join(',')||'no basic coverage/length issues');
 console.log('REPORT ONLY: No Gemini or file changes.');
 process.exit(0);
}
const total=Number(val('--max-total-usd'));
const per=Number(val('--max-per-commodity-usd'));
if(val('--approve-paid')!=='YES'||!Number.isFinite(total)||total<0.35||total>12||!Number.isFinite(per)||per<0.35||per>1.50){
 console.error('NO PAID CALLS. Run requires explicit --approve-paid=YES and finite caps --max-total-usd=0.35..12.00 --max-per-commodity-usd=0.35..1.50');
 process.exit(2);
}
if(plan.some(p=>p.decision==='BLOCK-INTEGRITY')){
 console.error('NO PAID CALLS: Unreadable/invalid publication integrity. Resolve before spending money.');
 process.exit(2);
}
const unresolved=plan.filter(p=>p.journal.exists && !['published','retained-previous'].includes(p.journal.status));
if(unresolved.length){
 console.error('NO PAID CALLS: unresolved paid journals:',unresolved.map(p=>p.commodity+':'+p.journal.status).join(', '));
 process.exit(2);
}
const need=plan.filter(p=>p.decision==='RUN');
if(need.length===0){console.log('Nothing eligible to refresh today. No paid calls.');process.exit(0);}
// Reserve the FULL per-commodity cap before starting each run, so a later run cannot exceed the aggregate cap.
const execCommand=(args)=>new Promise(resolve=>{
 const child=spawn(process.execPath,args,{cwd:root,stdio:'inherit',env:process.env});
 child.once('error',e=>resolve({code:1,error:String(e)}));
 child.once('exit',(code,signal)=>resolve({code:code??1,signal}));
});
const previouslySpent=Number(plan.reduce((sum,p)=>sum+(p.journal.exists?(p.journal.estimatedUsd||0):0),0).toFixed(3));
if(previouslySpent>total){console.error('NO PAID CALLS: existing estimated spend today exceeds requested total cap.');process.exit(2);}
let reserved=previouslySpent,used=previouslySpent,fatal=false; const results=[];
console.log('\nAUTHORIZED: At most',need.length,'commodity refreshes, total estimated USD cap',total,'and per-commodity USD cap',per);
console.log('Sequential execution. Already attempted or recent healthy publications are skipped. No Cloud calls.');
console.log('Estimated spending already recorded today:',previouslySpent);
for(const entry of need){
 const commodity=entry.commodity;
 // Recheck ALL conditions just before the call; respects changes from other sessions.
 const fresh=makePlan(root,kstDay()).find(p=>p.commodity===commodity);
 if(fresh.decision!=='RUN'){
   console.log('SKIP changed since preview:',commodity,fresh.decision);
   results.push({commodity,status:'skipped-late',why:fresh.decision});continue;
 }
 const remaining=Number((total-reserved).toFixed(3));
 const allocation=Number(Math.min(per,remaining).toFixed(2));
 if(allocation<0.35){console.log('BUDGET LIMIT: stopping before',commodity);break;}
 reserved+=allocation;
 console.log(`\n=== ${commodity} | reserved estimated USD ${allocation} / total reserved ${reserved.toFixed(2)} ===`);
 const child=await execCommand(['--import','tsx','scripts/mi/local-news-refresh.mjs',`--commodity=${commodity}`,
   '--run-paid','--approve-paid=YES',`--max-estimated-usd=${allocation.toFixed(2)}`]);
 const journal=inspectJournal(root,commodity,kstDay());
 const after=makePlan(root,kstDay()).find(p=>p.commodity===commodity).publication;
 const row={commodity,exitCode:child.code,journal:journal.status||'missing',cost:journal.estimatedUsd,
   publishedCount:after.count,remainingIssues:after.reasons};results.push(row);
 used+=Number(journal.estimatedUsd)||0;
 console.log('RESULT:',JSON.stringify(row));
 const outcome=classifyRefreshOutcome(child.code,journal);
 if(outcome==='CONTINUE-RETAINED'){
  console.log('CONTINUE: no new independently verified content qualified; previous publication preserved.');
 }else if(outcome==='STOP'){
  console.error('STOP: failed, inconsistent or uncertain provider/publication result. Preserve paid journal; do not retry automatically.');
  fatal=true;break;
 }
}
console.log('\n=== BATCH RESULT ===');
console.log(JSON.stringify({kstDay:day,completed:results.length,planned:need.length,totalEstimatedUsdFromJournals:Number(used.toFixed(3)),
   previouslySpentEstimatedUsd:previouslySpent,totalAuthorizedAllocation:Number(reserved.toFixed(2)),results},null,2));
console.log('Use: node scripts/mi/refresh-all.mjs report');
console.log('No full-project or Cloud publication performed. Review Korean summary quality and links in the browser.');
if(fatal)process.exitCode=1;
