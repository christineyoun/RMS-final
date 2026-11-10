/**
 * RMS research pipeline runner — conservative, add-only orchestration.
 * Never edits the STEP1-7 source code, never writes publication/RMS state.
 * Default action: read-only preview. Paid calls require two explicit flags.
 * Built using Node.js built-ins, without an additional dependency.
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const COMMODITIES = Object.freeze([
  'wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'
]);
export const STAGES = Object.freeze([
  {key:'step1',file:/^step1-google-.*\.json$/,script:'step1-google.ts',paid:true},
  {key:'step2',file:/^step2-graded-.*\.json$/,script:'step2-verify.ts',paid:false,network:true},
  {key:'step3',file:/^step3-evidence-.*\.json$/,script:'step3-extract.ts',paid:false},
  {key:'step4',file:/^step4-analysis-.*\.json$/,script:'step4-analyze.ts',paid:true},
  {key:'step5search',file:/^step5-round1-search-.*\.json$/,script:'step5-search.ts',paid:true},
  {key:'step5graded',file:/^step5-round1-graded-.*\.json$/,script:'step5-verify.ts',paid:false,network:true},
  {key:'step5decision',file:/^step5-round1-decision-.*\.json$/,script:'step5-decision-run.ts',paid:true},
  {key:'step6search',file:/^step6-round2-search-.*\.json$/,script:'step6-search.ts',paid:true},
  {key:'step6graded',file:/^step6-round2-graded-.*\.json$/,script:'step6-verify.ts',paid:false,network:true},
  {key:'step7',file:/^step7-final-.*\.json$/,script:'step7-run.ts',paid:true},
]);
const byKey = Object.fromEntries(STAGES.map(s=>[s.key,s]));
const stopped = (reason,extra={})=>({action:'stop',reason,...extra});
const done = (message,extra={})=>({action:'done',message,...extra});
const need = (stage,reason,extra={})=>({action:'execute',stage,reason,paid:byKey[stage].paid,...extra});
const safeFilename=/^[a-z0-9][a-z0-9-]*\.json$/i;

/** For scheduled refresh only, isolate each day from old (already complete)
 * research and from the paid-attempt lock files of earlier dates. Unset means
 * unchanged manual/local research paths, including legacy soybean snapshots. */
function scheduledResearchDay(){
  const day=process.env.RMS_RESEARCH_RUN_DAY;
  if(day===undefined)return null;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)
    throw Error('Invalid RMS_RESEARCH_RUN_DAY; refusing reuse/mutation of research checkpoints');
  return day;
}
export function researchDir(root,commodity){
  if(!COMMODITIES.includes(commodity))throw Error(`Unknown commodity: ${commodity}`);
  const base=path.join(root,commodity==='soybean'?'.rms-soybean-rebuild':path.join('.rms-research',commodity));
  const day=scheduledResearchDay();
  return day?path.join(base,'daily',day):base;
}
export function runnerDir(root,commodity){
  if(!COMMODITIES.includes(commodity))throw Error('Invalid commodity');
  const base=path.join(root,'.rms-research-runner',commodity);
  const day=scheduledResearchDay();
  return day?path.join(base,'daily',day):base;
}
export function readLatest(dir,pattern){
  if(!fs.existsSync(dir))return null;
  const names=fs.readdirSync(dir).filter(n=>pattern.test(n)).sort();
  const name=names.at(-1);
  if(!name)return null;
  if(!safeFilename.test(name))throw Error(`Unsafe input filename: ${name}`);
  const full=path.join(dir,name);
  if(!fs.statSync(full).isFile())throw Error(`Not a file: ${name}`);
  if(fs.statSync(full).size>40*1024*1024)throw Error(`Unexpectedly large stage JSON: ${name}`);
  let data;
  try{data=JSON.parse(fs.readFileSync(full,'utf8'));}catch(e){throw Error(`Invalid saved JSON ${name}: ${e.message}`);}
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error(`Bad JSON object: ${name}`);
  return {name,data};
}
function checkCommodity(s,commodity,step){
  if(s.data.commodity===commodity)return;
  // Proven legacy exception: ONLY original recovered soybean STEP4, never other files.
  if(step==='step4'&&commodity==='soybean'&&s.name.startsWith('step4-recovered-')
      &&s.data.commodity===undefined && Array.isArray(s.data.analysis?.originalInventory)
      && Array.isArray(s.data.analysis?.findings)
      && Array.isArray(s.data.analysis?.candidateAssessments)
      && Array.isArray(s.data.analysis?.researchGaps))return;
  throw Error(`${step}: wrong commodity (expected ${commodity}, got ${String(s.data.commodity)})`);
}
function assertInput(actual,expected,step,field){
  if(actual!==expected)throw Error(`${step}: ${field} references ${String(actual)}, expected ${expected}. Refusing cross-run data.`);
}
function requireStatus(s,status,step){
  if(s.data.status!==status)throw Error(`${step}: status ${String(s.data.status)}; expected ${status}`);
}
function load(dir,key){return readLatest(dir,byKey[key].file);}
function loadStep4(dir){
  // Prefer recovered (legacy soybean). A new unfinished STEP4 must never be ignored.
  const a=load(dir,'step4');
  const r=readLatest(dir,/^step4-recovered-.*\.json$/);
  // Compare timestamps, not the alphabetic 'analysis' vs 'recovered' prefixes.
  const stamp=(item)=>item?.name.match(/^step4-(?:analysis|recovered)-(.*)\.json$/)?.[1]||'';
  // Existing STEP5 loader prefers recovered snapshots whenever one exists.
  // Do not silently choose a newer analysis and then have STEP5 read old recovery.
  if(a&&r){
    if(stamp(a)>stamp(r))throw Error('Newer STEP4 analysis exists beside older recovered data; STEP5 would prefer old recovery. Manual reconciliation required.');
    return r;
  }
  return a||r;
}
function checkStep4(s,commodity,step3){
  checkCommodity(s,commodity,'step4');
  if(s.name.startsWith('step4-analysis-')){
    requireStatus(s,'review-generated','step4');
    assertInput(s.data.step3File,step3.name,'step4','step3File');
  }else{
    if(!Array.isArray(s.data.analysis?.originalInventory)||!Array.isArray(s.data.analysis?.findings))
      throw Error('step4 recovered file has no usable analysis');
    // Legacy recovered data may not carry an original STEP3 path.
    if(s.data.sourceFile && !/^step4-analysis-.*\.json$/.test(s.data.sourceFile))
      throw Error('step4 recovered sourceFile is not an analysis snapshot');
  }
}

export function inspect(root,commodity){
  const dir=researchDir(root,commodity);
  const progress=[];
  const get=(key)=>load(dir,key);
  const examined=(key,s)=>{progress.push(`${key}: ${s.name}`);return s;};
  try {
    const s1=get('step1');
    if(!s1)return {dir,progress,...need('step1','No initial Google search output')};
    examined('step1',s1);checkCommodity(s1,commodity,'step1');requireStatus(s1,'google-citations-found','step1');
    if(!Array.isArray(s1.data.grounding?.sources)||!s1.data.grounding.sources.length)throw Error('step1 lacks Google provider citations');

    const s2=get('step2');
    if(!s2)return {dir,progress,...need('step2','Resolve STEP1 publisher originals')};
    examined('step2',s2);checkCommodity(s2,commodity,'step2');
    if(s2.data.stage!=='source-resolution-and-grading'||!Array.isArray(s2.data.records))throw Error('step2 invalid source inventory');
    assertInput(s2.data.inputFile,s1.name,'step2','inputFile');

    const s3=get('step3');
    if(!s3)return {dir,progress,...need('step3','Extract STEP2 original-text evidence')};
    examined('step3',s3);checkCommodity(s3,commodity,'step3');
    if(s3.data.stage!=='source-text-evidence-review-only'||!Array.isArray(s3.data.items))throw Error('step3 invalid evidence inventory');
    assertInput(s3.data.step2File,s2.name,'step3','step2File');
    const excerpts=s3.data.totals?.AExcerptCandidates ?? s3.data.items.reduce((n,x)=>n+(x.evidence?.length||0),0);
    if(!excerpts)return {dir,progress,...stopped('STEP3 has no readable evidence candidates; manual review required')};

    const s4=loadStep4(dir);
    if(!s4)return {dir,progress,...need('step4','One Gemini source review after STEP3')};
    examined('step4',s4);
    if(s4.name.startsWith('step4-analysis-')&&s4.data.status!=='review-generated')
      return {dir,progress,...stopped(`STEP4 returned ${s4.data.status}; run offline step4-diagnose.ts, inspect recovery before continuing. No paid retry.`)};
    checkStep4(s4,commodity,s3);

    const s5=get('step5search');
    if(!s5)return {dir,progress,...need('step5search','AI-chosen first follow-up Google search')};
    examined('step5search',s5);checkCommodity(s5,commodity,'step5search');
    requireStatus(s5,'google-citations-found','step5search');
    assertInput(s5.data.step4InputFile,s4.name,'step5search','step4InputFile');
    if(!Array.isArray(s5.data.grounding?.sources)||!s5.data.grounding.sources.length)throw Error('step5 search has no grounded sources');

    const s5g=get('step5graded');
    if(!s5g)return {dir,progress,...need('step5graded','Verify first follow-up publisher originals')};
    examined('step5graded',s5g);checkCommodity(s5g,commodity,'step5graded');
    if(s5g.data.stage!=='additional-google-original-verification-round1'||s5g.data.round!==1||!Array.isArray(s5g.data.review))throw Error('step5 graded inventory invalid');
    assertInput(s5g.data.inputSearchFile,s5.name,'step5graded','inputSearchFile');

    const dec=get('step5decision');
    if(!dec)return {dir,progress,...need('step5decision','Gemini decides whether second search is necessary')};
    examined('step5decision',dec);checkCommodity(dec,commodity,'step5decision');
    if(dec.data.stage!=='round1-evidence-sufficiency-decision'||dec.data.status!=='decision-recorded')
      return {dir,progress,...stopped('STEP5 decision incomplete or invalid; review saved decision, no paid re-run')};
    assertInput(dec.data.inputFiles?.step4,s4.name,'step5decision','inputFiles.step4');
    assertInput(dec.data.inputFiles?.step5Graded,s5g.name,'step5decision','inputFiles.step5Graded');
    const decision=dec.data.decision?.decision;
    if(decision==='uncertain')return {dir,progress,...stopped('Gemini decision UNCERTAIN; manual review required')};
    if(decision!=='stop'&&decision!=='search')throw Error('STEP5 decision not recognized');

    if(decision==='search'){
      if(!dec.data.decision?.remainingGaps?.some(g=>typeof g.searchQuestion==='string'&&g.searchQuestion.trim()))
        return {dir,progress,...stopped('STEP5 requested SEARCH without an actual research question; manual review required')};
      const s6=get('step6search');
      if(!s6)return {dir,progress,...need('step6search','STEP6 second and final Google search')};
      examined('step6search',s6);checkCommodity(s6,commodity,'step6search');
      requireStatus(s6,'google-citations-found','step6search');
      assertInput(s6.data.decisionFile,dec.name,'step6search','decisionFile');
      const s6g=get('step6graded');
      if(!s6g)return {dir,progress,...need('step6graded','Verify STEP6 source originals')};
      examined('step6graded',s6g);checkCommodity(s6g,commodity,'step6graded');
      if(s6g.data.stage!=='additional-google-original-verification-round2'||s6g.data.round!==2||!Array.isArray(s6g.data.review))throw Error('step6 graded inventory invalid');
      assertInput(s6g.data.sourceFile,s6.name,'step6graded','sourceFile');
      assertInput(s6g.data.decisionFile,dec.name,'step6graded','decisionFile');
    }

    const s7=get('step7');
    if(!s7)return {dir,progress,...need('step7',decision==='stop'?'STEP5 STOP → skip STEP6 → final Gemini synthesis':'STEP6 verified → final Gemini synthesis',{route:decision})};
    examined('step7',s7);checkCommodity(s7,commodity,'step7');
    if(s7.data.stage!=='final-market-outlook-and-procurement')throw Error('step7 stage invalid');
    assertInput(s7.data.inputFiles?.step4,s4.name,'step7','inputFiles.step4');
    assertInput(s7.data.inputFiles?.step5Graded,s5g.name,'step7','inputFiles.step5Graded');
    assertInput(s7.data.inputFiles?.step5Decision,dec.name,'step7','inputFiles.step5Decision');
    if(decision==='stop' && s7.data.inputFiles?.step6Graded)throw Error('STOP route unexpectedly used STEP6 sources');
    if(decision==='search')assertInput(s7.data.inputFiles?.step6Graded,get('step6graded')?.name,'step7','inputFiles.step6Graded');
    if(s7.data.status==='report-created')return {dir,progress,...done('STEP7 report created; human review and RMS mapping still separate',{route:decision})};
    if(s7.data.status==='report-review-needed')return {dir,progress,...stopped('STEP7 needs quality review; report preserved, not published',{route:decision})};
    return {dir,progress,...stopped(`STEP7 status ${String(s7.data.status)}; no paid retry`,{route:decision})};
  }catch(e){return {dir,progress,...stopped('Safety check: '+e.message)};}
}

export function parseOptions(argv){
  let commodity=null,mode='preview',maxPaid=1,approve=false;
  for(let i=0;i<argv.length;i++){
    const a=argv[i];
    if(a==='--commodity')commodity=argv[++i];
    else if(a==='--preview')mode='preview';
    else if(a==='--run-free')mode='free';
    else if(a==='--run-paid')mode='paid';
    else if(a==='--approve-paid')approve=true;
    else if(a==='--max-paid')maxPaid=Number(argv[++i]);
    else if(a==='--help')return {help:true};
    else throw Error('Unrecognized argument: '+a);
  }
  if(!COMMODITIES.includes(commodity))throw Error('Specify --commodity one of: '+COMMODITIES.join(', '));
  if(!Number.isInteger(maxPaid)||maxPaid<1||maxPaid>6)throw Error('--max-paid must be an integer 1–6');
  if(mode==='paid'&&!approve)throw Error('--run-paid requires --approve-paid; preview is safe');
  if(mode!=='paid'&&approve)throw Error('--approve-paid is valid only with --run-paid');
  return {commodity,mode,maxPaid,approve};
}

function runScript(root,stage,commodity){
  const sub=byKey[stage];
  const codeRoot=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
  const script=path.join(codeRoot,'scripts','soybean-rebuild',sub.script);
  if(!fs.existsSync(script))throw Error(`Required existing STEP1-7 script missing: ${sub.script}`);
  console.log(`[RUNNER] RUN ${stage}: ${sub.script} ${commodity}; ${sub.paid?'GEMINI API (potential charge)':sub.network?'publisher HTTP access':'offline'}`);
  // Execute the installed tsx CLI via Node directly: no Windows shell interpolation,
  // and no DEP0190 warning. Do not fall back to shell:true for untrusted args.
  const tsxCli=path.join(codeRoot,'node_modules','tsx','dist','cli.mjs');
  if(!fs.existsSync(tsxCli))throw Error('Missing local tsx CLI. Run npm install in this project before executing.');
  const result=spawnSync(process.execPath,[tsxCli,script,'--commodity',commodity],
    {cwd:root,stdio:'inherit',shell:false,env:process.env});
  if(result.error)throw result.error;
  return result.status===null?1:result.status;
}
function paidAttemptPath(root,commodity,stage){return path.join(runnerDir(root,commodity),`paid-${stage}.json`);}
function paidAttempt(root,commodity,stage){
  const dir=runnerDir(root,commodity);fs.mkdirSync(dir,{recursive:true});
  const dest=paidAttemptPath(root,commodity,stage);
  fs.writeFileSync(dest,JSON.stringify({stage,commodity,createdAt:new Date().toISOString(),
    purpose:'paid-call-deduplication',status:'reserved-before-call',note:'Check saved outputs before any manual retry.'},null,2),{flag:'wx',mode:0o600});
  return dest;
}

export function run(root,opts,execute=runScript){
  let calls=0,iterations=0;
  while(iterations++<12){
    const state=inspect(root,opts.commodity);
    console.log(`[RUNNER] ${state.action.toUpperCase()}: ${state.reason||state.message}`);
    if(state.action!=='execute')return {...state,paidCalls:calls};
    if(state.paid){
      if(opts.mode!=='paid'){console.log('[RUNNER] PAUSED: A paid Gemini step requires explicit approval.');return {...state,paidCalls:calls};}
      if(calls>=opts.maxPaid){console.log(`[RUNNER] PAUSED: paid call budget reached (${calls}/${opts.maxPaid}).`);return {...state,paidCalls:calls};}
      const mark=paidAttemptPath(root,opts.commodity,state.stage);
      if(fs.existsSync(mark))return {action:'stop',reason:`Previous paid attempt recorded for ${state.stage}; inspect ${mark} before retry.`,paidCalls:calls};
      paidAttempt(root,opts.commodity,state.stage);
      calls++;
    }
    const result=execute(root,state.stage,opts.commodity);
    if(result!==0){
      // A failed paid response can still save a reviewable JSON. Display checkpoints
      // from disk rather than wrongly reporting none and alarming the operator.
      let progress=state.progress;
      try {progress=inspect(root,opts.commodity).progress||progress;}catch{}
      return {action:'stop',reason:`${state.stage} exited ${result}; prior results preserved. Inspect logs; no automatic paid retries.`,paidCalls:calls,progress};
    }
    const after=inspect(root,opts.commodity);
    if(after.action==='execute'&&after.stage===state.stage)return {action:'stop',reason:`${state.stage} exited 0 but did not create a usable expected snapshot; stop and inspect.`,paidCalls:calls};
    if(after.action==='stop')return {...after,paidCalls:calls};
  }
  return {action:'stop',reason:'Safety bound: too many stage transitions',paidCalls:calls};
}

const runAsMain=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(runAsMain){
  try{
    const opts=parseOptions(process.argv.slice(2));
    if(opts.help){
      console.log('Usage: node scripts/soybean-rebuild/research-pipeline-runner.mjs --commodity <id> [--preview | --run-free | --run-paid --approve-paid --max-paid 1]');
      process.exit(0);
    }
    const root=process.cwd();
    if(!fs.existsSync(path.join(root,'scripts','soybean-rebuild','commodity-config.ts')))
      throw Error('Run from RMS_V7_5_COMPLETE project root after common patches.');
    console.log(`[RUNNER] Commodity=${opts.commodity}; mode=${opts.mode}; paid cap=${opts.mode==='paid'?opts.maxPaid:0}`);
    console.log('[RUNNER] No STEP1–7 source edits, no publication, no Cloud Run changes, no --force-new.');
    const state=opts.mode==='preview'?inspect(root,opts.commodity):run(root,opts);
    console.log('[RUNNER] CURRENT CHECKPOINTS:',state.progress?.length?state.progress.join(' | '):'none');
    if(opts.mode==='preview'&&state.action==='execute')console.log(`[RUNNER] NEXT: ${state.stage} (${state.paid?'PAID GEMINI':'FREE'}${byKey[state.stage].network?', publisher HTTP':''})`);
    else if(state.action==='done')console.log('[RUNNER] DONE: independent research report available; still requires review & explicit RMS mapping.');
    else if(state.action==='stop'){console.error('[RUNNER] STOP:',state.reason);process.exitCode=2;}
  }catch(e){console.error('[RUNNER] REFUSED:',e.message);process.exitCode=2;}
}
