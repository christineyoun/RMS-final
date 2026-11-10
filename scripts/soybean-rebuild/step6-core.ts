/** Shared STEP 6 routing + second-round prompt. No provider calls or disk writes. */
import fs from 'node:fs';
import path from 'node:path';
import {commodityFromArgv,resultFolder,assertSnapshotCommodity,type Commodity} from './commodity-config.ts';
import {assertStep4SnapshotCommodity} from './step4-legacy-compat.ts';

export type DecisionValue='search'|'stop'|'uncertain';
export type DecisionFile={
  stage?:string;status?:string;commodity?:string;
  decision?:{decision:DecisionValue;reason:string;
    covered?:Array<{topic:string;assessment:string;sourceIds?:string[]}>;
    remainingGaps?:Array<{topic:string;whyImportant:string;searchQuestion:string}>;
    cautions?:string[]};
  inputFiles?:{step4?:string;step5Graded?:string};
};
export const kstDate=(date:Date)=>new Intl.DateTimeFormat('en-CA',{
  timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',
}).format(date);
export const filesAt=(dir:string,regex:RegExp)=>fs.readdirSync(dir).filter(x=>regex.test(x)).sort();
export function selectDecision(dir:string){
  const file=filesAt(dir,/^step5-round1-decision-.*\.json$/).at(-1);
  if(!file)throw Error('STEP 5 decision JSON is missing; do not guess whether round 2 is needed.');
  const data=JSON.parse(fs.readFileSync(path.join(dir,file),'utf8')) as DecisionFile;
  if(data.stage!=='round1-evidence-sufficiency-decision'||data.status!=='decision-recorded'||!data.decision
    ||!['stop','search','uncertain'].includes(data.decision.decision))
    throw Error('STEP 5 decision is not validated. No STEP 6 or STEP 7 action.');
  return {file,data};
}
export function nextStage(d:DecisionFile):'step6-search'|'step7-final'|'manual-review'{
  if(d.status!=='decision-recorded'||!d.decision)return 'manual-review';
  if(d.decision.decision==='stop')return 'step7-final';
  if(d.decision.decision==='search')return d.decision.remainingGaps?.some(x=>x.searchQuestion?.trim())?'step6-search':'manual-review';
  return 'manual-review';
}
export function buildRound2Prompt(data:{commodity:string;date:string;decision:NonNullable<DecisionFile['decision']>;
  previousFindings:Array<{statement:string;status?:string;sourceIds?:string[]}>;
  knownSources:Array<{id:string;title:string;url:string|null;grade:string}>}){
  const gaps=(data.decision.remainingGaps||[]).filter(x=>x.searchQuestion?.trim());
  if(!gaps.length)throw Error('No AI-generated outstanding questions in SEARCH decision.');
  const covered=(data.decision.covered||[]).slice(0,5);
  return `Date: ${data.date} (KST)\nCommodity: ${data.commodity}\n\nUse GOOGLE SEARCH for the SECOND AND FINAL follow-up research round. Investigate the most consequential unresolved questions identified by the previous analysis. Independently prioritize them and choose focused search queries; do not use a fixed commodity-specific checklist.\n\nFind fresh, credible information that materially changes or clarifies the market assessment. Prefer original official and professional sources. Avoid repeating facts already established unless resolving a conflict. Keep older authoritative evidence and all A/B-grade records. Uncertain facts remain labeled; do not discard them.\n\nReturn a short Korean summary with actual Google Search citations and source dates where verified. Explain what was clarified and what remains uncertain. Do not invent figures, URLs, or citations. Do not write the final forecast or procurement strategy. Do not request further search rounds.\n\nUNRESOLVED QUESTIONS FROM THE PRIOR AI DECISION (leads, not mandatory topics):\n${gaps.map((g,i)=>`${i+1}. ${g.topic}: ${g.searchQuestion} | importance: ${g.whyImportant}`).join('\n')}\n\nALREADY COVERED (avoid redundant searches):\n${covered.map(x=>`- ${x.topic}: ${x.assessment}`).join('\n')||'- No coverage summary.'}\n\nPREVIOUS FACTS (preliminary; not independently validated):\n${data.previousFindings.slice(0,12).map(x=>`- [${x.status||'preliminary'}] ${x.statement}`).join('\n')||'- No prior findings.'}\n\nEXISTING DOCUMENTS (same page need not be rediscovered):\n${data.knownSources.slice(0,45).map(x=>`- ${x.id} [${x.grade}]: ${x.title} / ${x.url||'original unavailable'}`).join('\n')}`;
}
export function loadStep6Context(cwd=process.cwd(),date=kstDate(new Date()),requestedCommodity:Commodity=commodityFromArgv()){
  const dir=resultFolder(requestedCommodity,cwd);
  if(!fs.existsSync(dir))throw Error('Missing .rms-soybean-rebuild directory.');
  const {file:decisionFile,data:decision}=selectDecision(dir);
  assertSnapshotCommodity(decision,requestedCommodity,'5-decision');
  const route=nextStage(decision);
  if(route!=='step6-search')return {dir,decisionFile,decision,route,prompt:null,context:null};
  const step4Name=decision.inputFiles?.step4,gradedName=decision.inputFiles?.step5Graded;
  if(!step4Name||!gradedName)throw Error('STEP 5 decision does not identify input snapshots.');
  // Exact file names from the decision: never silently mix unrelated research runs.
  for(const n of [step4Name,gradedName])if(n.includes('/')||n.includes('\\')||!fs.existsSync(path.join(dir,n)))throw Error(`Required snapshot missing: ${n}`);
  const old=JSON.parse(fs.readFileSync(path.join(dir,step4Name),'utf8'));
  const first=JSON.parse(fs.readFileSync(path.join(dir,gradedName),'utf8'));
  assertStep4SnapshotCommodity(old,requestedCommodity,step4Name,dir);
  assertSnapshotCommodity(first,requestedCommodity,'5-graded');
  if(first.stage!=='additional-google-original-verification-round1'||first.round!==1||!Array.isArray(first.review)||
     !Array.isArray(old.analysis?.originalInventory))throw Error('Invalid prior inventory.');
  const commodity=decision.commodity||old.commodity||first.commodity;
  if(!commodity||[old.commodity,first.commodity].some(x=>x&&x!==commodity))throw Error('Commodity mismatch.');
  const priorInventory=[...old.analysis.originalInventory,...first.review];
  const indices=priorInventory.map(x=>x.id);
  if(new Set(indices).size!==indices.length)throw Error('Duplicate prior source IDs.');
  const context={commodity,previousFindings:(old.analysis.findings||[]).map((f:any)=>({
    statement:String(f.statement||'').slice(0,270),status:f.status,sourceIds:f.sourceIds||[]})),
    knownSources:priorInventory.map((x:any)=>({id:x.id,title:String(x.googleTitle||x.title||'').slice(0,110),
      url:x.publisherUrl||null,grade:x.grade})),date,decision:decision.decision!};
  return {dir,decisionFile,decision,route,context,prompt:buildRound2Prompt(context),
    inputFiles:{step4:step4Name,step5Graded:gradedName},priorInventory};
}
